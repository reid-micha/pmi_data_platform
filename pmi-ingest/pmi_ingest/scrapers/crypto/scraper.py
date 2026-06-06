"""Crypto.com prediction markets scraper using Playwright sync API.

Scraping approach — the "click everything" method:
  1. Navigate to the Events page.  Extract embedded event data from the
     SSR ``__next_f`` scripts.  Click "See More" links until exhausted.
  2. Navigate to the Sports page.  Click each sport-kind category tab,
     then click "See More" links for each stream (futures / schedule).
  3. All data extraction uses the same ``page.evaluate()`` helper that
     parses JSON props from the ``self.__next_f.push([1, "..."])``
     inline scripts.
"""

from __future__ import annotations

import random
import time
from collections.abc import Iterator
from typing import Any

from pmi_ingest.config import ingest_settings as settings
from pmi_ingest.scrapers.crypto.parser import (
    BASE_URL,
    EVENTS_URL,
    SPORTS_URL,
    _slugify,
    build_contract_url,
    contract_probability,
    event_to_parsed,
)
from pmi_ingest.scrapers.crypto.types import RawContract
from pmi_ingest.scrapers.playwright_base import PlaywrightScraper
from pmi_ingest.scrapers.scripts import load_js

# Safety limit for pagination loops.
_MAX_PAGES = 50


class CryptoScraper(PlaywrightScraper):
    """Manages Playwright browser lifecycle and scrapes Crypto.com prediction markets.

    Usage::

        with CryptoScraper() as scraper:
            for batch in scraper.scrape_all():
                process(batch)
    """

    _EXTRA_LAUNCH_ARGS = [
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--js-flags=--max-old-space-size=512",
    ]
    _BLOCK_RESOURCES = True

    # ------------------------------------------------------------------
    # HTML / JS extraction helpers
    # ------------------------------------------------------------------

    # Extract Events-page props: {initialEventKindGroups, initialEvents}
    # We anchor on "initialEventKindGroups" because it appears first in the
    # props object and avoids hitting a nested substring match.
    _EXTRACT_EVENTS_JS = load_js("crypto/extract_events.js")

    # Extract Sports-page props: {initialEventKinds, initialLeagueEvents, initialMatchEvents, ...}
    _EXTRACT_SPORTS_JS = load_js("crypto/extract_sports.js")

    # Find all "See More" links that carry a cursor= parameter.
    _FIND_SEE_MORE_JS = load_js("crypto/find_see_more.js")

    # Click the "All" tab if one exists and is not already selected.
    # Returns true if an "All" tab was found and clicked.
    _CLICK_ALL_TAB_JS = load_js("crypto/click_all_tab.js")

    # ------------------------------------------------------------------
    # Data conversion
    # ------------------------------------------------------------------

    @staticmethod
    def _events_to_raw_contracts(
        events: list[dict],
        category_map: dict[str, str],
        url_category: str = "events",
    ) -> list[RawContract]:
        """Convert raw event dicts to RawContract objects."""
        raw_contracts: list[RawContract] = []

        for evt_dict in events:
            evt = event_to_parsed(evt_dict)
            event_closed = bool(evt.status) and evt.status != "active"

            category = category_map.get(
                evt.event_kind,
                evt.event_kind_slug or url_category,
            )
            event_url = build_contract_url(evt.slug, url_category)

            for c in evt.contracts:
                contract_closed = bool(c.status) and c.status != "active"
                is_closed = event_closed or contract_closed

                prob = contract_probability(c)
                contract_slug = f"{evt.slug}--{_slugify(c.title)}"

                raw_contracts.append(
                    RawContract(
                        slug=contract_slug,
                        title=f"{evt.title}: {c.title}",
                        event_title=evt.title,
                        probability=prob,
                        close_date=evt.close_date,
                        url=event_url,
                        event_kind=evt.event_kind,
                        category=category,
                        contract_id=c.id,
                        event_id=evt.id,
                        is_closed=is_closed,
                    )
                )

        return raw_contracts

    # ------------------------------------------------------------------
    # Navigation
    # ------------------------------------------------------------------

    def _goto_with_retry(
        self,
        page: Any,
        url: str,
        label: str = "",
    ) -> tuple[Any, int]:
        """Navigate to URL with retry + backoff.  Returns (page, status)."""
        for attempt in range(settings.playwright_retry_max):
            delay = settings.playwright_nav_delay_sec
            if attempt > 0:
                delay = settings.playwright_retry_backoff_sec * (2 ** (attempt - 1))
                delay += random.uniform(0, 2)
            time.sleep(delay)

            try:
                resp = page.goto(url, wait_until="domcontentloaded")
                status = resp.status if resp else -1
                if label:
                    print(f"    [{status}] {label}: {url[:80]}")

                if status == 429:
                    print("    Rate limited (429), waiting 30s...")
                    time.sleep(30)
                    continue
                if status >= 500:
                    print(f"    Server error ({status}), retrying...")
                    continue

                return page, status
            except Exception as exc:
                print(f"    Navigation error: {exc}")
                if attempt == settings.playwright_retry_max - 1:
                    return page, -1

        return page, -1

    def _click_see_more(
        self,
        page: Any,
        filter_key: str | None = None,
    ) -> str | None:
        """Find and return the href of a "See More" cursor link.

        If *filter_key* is given (e.g. ``"event-type=futures"``), only
        return a link whose href contains that substring.
        Returns None if no matching link is found.
        """
        hrefs: list[str] = page.evaluate(self._FIND_SEE_MORE_JS)
        for href in hrefs:
            if filter_key is None or filter_key in href:
                return href
        return None

    def _ensure_all_tab(self, page: Any, label: str) -> None:
        """Click the 'All' tab if it exists and is not already selected."""
        result = page.evaluate(self._CLICK_ALL_TAB_JS)
        if result == "clicked":
            print(f"    Clicked 'All' tab on {label}")
            page.wait_for_timeout(3000)
        elif result == "already":
            print(f"    'All' tab already selected on {label}")
        # "not_found" — no All tab, page shows everything by default

    # ------------------------------------------------------------------
    # Events scraping
    # ------------------------------------------------------------------

    def _scrape_events(self, page: Any) -> Iterator[list[RawContract]]:
        """Scrape the Events section with pagination."""
        category_map: dict[str, str] = {}

        print("  Loading Events page...")
        page, status = self._goto_with_retry(page, EVENTS_URL, label="Events")
        if status < 0:
            print("  Failed to load Events page")
            return
        page.wait_for_timeout(5000)
        self._ensure_all_tab(page, "Events")

        for page_num in range(_MAX_PAGES):
            data = page.evaluate(self._EXTRACT_EVENTS_JS)
            if data is None or "error" in data:
                if data and "error" in data:
                    print(f"    JS parse error: {data['error']}")
                break

            # Build category map from groups (available on first page)
            for g in data.get("initialEventKindGroups", {}).get("data", []):
                cat_slug = g.get("slug", "")
                for ek in g.get("event_kinds", []):
                    category_map[ek] = cat_slug

            events = data.get("initialEvents", {}).get("data", [])
            if not events:
                break

            print(f"    Events page {page_num}: {len(events)} events")
            raw = self._events_to_raw_contracts(events, category_map, "events")
            if raw:
                yield raw

            # Follow "See More" link if it exists on the page
            next_href = self._click_see_more(page)
            if next_href is None:
                break
            next_url = next_href if next_href.startswith("http") else f"{BASE_URL}{next_href}"
            page, status = self._goto_with_retry(page, next_url, label=f"Events p{page_num + 1}")
            if status < 0:
                break
            page.wait_for_timeout(3000)

    # ------------------------------------------------------------------
    # Sports scraping
    # ------------------------------------------------------------------

    def _scrape_sports(self, page: Any) -> Iterator[list[RawContract]]:
        """Scrape the Sports section: all categories, both streams, with pagination."""
        category_map: dict[str, str] = {}

        print("  Loading Sports page...")
        page, status = self._goto_with_retry(page, SPORTS_URL, label="Sports")
        if status < 0:
            print("  Failed to load Sports page")
            return
        page.wait_for_timeout(5000)
        self._ensure_all_tab(page, "Sports")

        # Extract initial Sports data
        data = page.evaluate(self._EXTRACT_SPORTS_JS)
        if data is None or "error" in data:
            if data and "error" in data:
                print(f"    JS parse error: {data['error']}")
            else:
                print("    No Sports data found")
            return

        # Yield initial league + match events
        league_events = data.get("initialLeagueEvents", {}).get("data", [])
        match_events = data.get("initialMatchEvents", {}).get("data", [])

        all_initial = league_events + match_events
        if all_initial:
            print(f"    Sports initial: {len(league_events)} league, {len(match_events)} match events")
            raw = self._events_to_raw_contracts(all_initial, category_map, "sports")
            if raw:
                yield raw

        # Paginate futures stream — keep clicking until "See More" disappears
        if self._click_see_more(page, "event-type=futures"):
            print("    Paginating Sports/futures...")
            yield from self._paginate_sports_stream(page, "event-type=futures")

        # Reload Sports page to paginate schedule stream
        if self._click_see_more(page, "event-type=schedule") is None:
            # Already consumed or need reload
            page, status = self._goto_with_retry(page, SPORTS_URL, label="Sports (reload)")
            if status < 0:
                return
            page.wait_for_timeout(3000)

        if self._click_see_more(page, "event-type=schedule"):
            print("    Paginating Sports/schedule...")
            yield from self._paginate_sports_stream(page, "event-type=schedule")

    def _paginate_sports_stream(
        self,
        page: Any,
        event_type_filter: str,
    ) -> Iterator[list[RawContract]]:
        """Follow "See More" links for a specific Sports stream until gone."""
        category_map: dict[str, str] = {}

        for page_num in range(_MAX_PAGES):
            next_href = self._click_see_more(page, filter_key=event_type_filter)
            if next_href is None:
                break

            next_url = next_href if next_href.startswith("http") else f"{BASE_URL}{next_href}"
            page, status = self._goto_with_retry(
                page,
                next_url,
                label=f"Sports/{event_type_filter} p{page_num + 1}",
            )
            if status < 0:
                break
            page.wait_for_timeout(3000)

            # Extract data — pagination pages still embed the same structure
            data = page.evaluate(self._EXTRACT_SPORTS_JS)
            if data is None:
                break

            events: list[dict] = []
            for key in ("initialLeagueEvents", "initialMatchEvents"):
                stream = data.get(key, {})
                stream_events = stream.get("data", [])
                if stream_events:
                    events.extend(stream_events)

            if not events:
                break

            print(f"      {event_type_filter} page {page_num + 1}: {len(events)} events")
            raw = self._events_to_raw_contracts(events, category_map, "sports")
            if raw:
                yield raw

            # Stop condition: no more "See More" link for this stream
            if self._click_see_more(page, filter_key=event_type_filter) is None:
                break

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def scrape_all(self) -> Iterator[list[RawContract]]:
        """Scrape all Crypto.com prediction market events (Events + Sports).

        Yields batches of RawContract objects.
        """
        page = self._new_page()

        yield from self._scrape_events(page)
        yield from self._scrape_sports(page)

        page.context.close()
