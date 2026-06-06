"""Robinhood prediction markets scraper using Playwright sync API.

Three-phase scraping:
  0. **Discovery** — dynamically find all parent categories and their
     subcategories from the nav bar (hover to reveal dropdowns).
  1. **Listing**  — scroll through each discovered category/subcategory page
     to collect event cards.
  2. **Detail**   — visit each event's detail page in parallel using N
     worker threads, click "Show N more", and extract every child outcome
     as its own ``RawContract``.

All page navigations go through ``_goto_with_retry()`` which enforces
pacing delays and handles HTTP 429 / 5xx with exponential back-off.
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any

from pmi_ingest.config import ingest_settings as settings
from pmi_ingest.scrapers.playwright_base import PlaywrightScraper
from pmi_ingest.scrapers.robinhood.parser import (
    BASE_URL,
    CLICK_SHOW_MORE_JS,
    DISCOVER_CATEGORIES_JS,
    DISCOVER_DROPDOWN_JS,
    DISMISS_CONSENT_JS,
    EXTRACT_CHILD_CONTRACTS_JS,
    EXTRACT_EVENTS_JS,
    display_name_to_slug,
    extract_event_slug,
    js_child_results_to_raw_contracts,
    parse_close_date_from_slug,
    parse_default_sub_from_title,
)
from pmi_ingest.scrapers.robinhood.types import RawContract


@dataclass
class _CategoryPath:
    """A discovered category or subcategory URL path to scrape."""

    path: str  # URL path after base_url, e.g. "technology/ai"
    label: str  # human-readable label for logging


@dataclass
class _EventInfo:
    """Intermediate event-level metadata collected from the listing page."""

    slug: str
    href: str
    title: str
    volume: int | None
    close_date: str | None
    category: str


class RobinhoodScraper(PlaywrightScraper):
    """Manages Playwright browser lifecycle and scrapes Robinhood prediction markets.

    Usage as context manager::

        with RobinhoodScraper() as scraper:
            for batch in scraper.scrape_all():
                process(batch)
    """

    # ------------------------------------------------------------------
    # Phase 0 — dynamic category discovery
    # ------------------------------------------------------------------

    @staticmethod
    def _dismiss_consent_overlay(page: Any) -> None:
        """Remove the Usercentrics consent overlay that blocks pointer events."""
        try:
            result: dict[str, object] = page.evaluate(DISMISS_CONSENT_JS)
            if result.get("removed"):
                print("    Discovery: dismissed Usercentrics overlay", flush=True)
                page.wait_for_timeout(500)
        except Exception:
            pass

    def _discover_category_paths(self, page: Any) -> tuple[Any, list[_CategoryPath]]:
        """Discover all category/subcategory paths from the nav bar.

        Returns ``(page, paths)`` — *page* may be replaced after retries.
        """
        # Navigate to a reliable seed page to access the nav bar
        seed_url = f"{settings.robinhood_base_url}politics/"
        page, status = self._goto_with_retry(page, seed_url, label="discovery/seed")
        if status == -1 or status >= 400:
            print("    Discovery: seed page failed, falling back", flush=True)
            return page, [_CategoryPath(path="politics", label="politics")]

        page.wait_for_timeout(int(settings.robinhood_page_load_wait_sec * 1000))

        # Remove consent overlay before any hover interactions
        self._dismiss_consent_overlay(page)

        # Extract all parent category buttons
        try:
            buttons: list[dict[str, object]] = page.evaluate(DISCOVER_CATEGORIES_JS)
        except Exception as exc:
            print(f"    Discovery: JS failed — {exc}", flush=True)
            return page, [_CategoryPath(path="politics", label="politics")]

        if not buttons:
            print("    Discovery: no category buttons found", flush=True)
            return page, [_CategoryPath(path="politics", label="politics")]

        # Skip "Featured" — it's homepage curation, produces duplicates
        skip = {"featured"}

        paths: list[_CategoryPath] = []
        for btn in buttons:
            name = str(btn.get("text", ""))
            has_svg = bool(btn.get("hasSvg", False))
            slug = display_name_to_slug(name)

            if slug in skip or not slug:
                continue

            if not has_svg:
                # No subcategories — scrape this parent directly
                paths.append(_CategoryPath(path=slug, label=slug))
                continue

            # Parent has subcategories — discover them
            page, sub_paths = self._discover_subcategories(page, name, slug)
            paths.extend(sub_paths)

        print(f"    Discovery: {len(paths)} total paths", flush=True)
        return page, paths

    def _discover_subcategories(
        self,
        page: Any,
        parent_name: str,
        parent_slug: str,
    ) -> tuple[Any, list[_CategoryPath]]:
        """Discover all subcategories for a parent that has an SVG chevron.

        1. Navigate to parent page → read title → extract default subcategory.
        2. Hover the parent button → read dropdown → extract other subcategories.
        3. Combine into ``_CategoryPath`` list.
        """
        subcategories: list[str] = []

        # Step 1: navigate to parent page, extract default sub from title
        parent_url = f"{settings.robinhood_base_url}{parent_slug}/"
        page, status = self._goto_with_retry(
            page,
            parent_url,
            label=f"discover/{parent_slug}",
        )
        if status == -1 or status >= 400:
            return page, [_CategoryPath(path=parent_slug, label=parent_slug)]

        page.wait_for_timeout(int(settings.robinhood_page_load_wait_sec * 1000))

        # Dismiss overlay on each new page load (it can reappear)
        self._dismiss_consent_overlay(page)

        default_sub: str | None = None
        try:
            title = page.title()
            default_sub = parse_default_sub_from_title(title, parent_name)
            if default_sub:
                subcategories.append(default_sub)
        except Exception:
            pass

        # Step 2: hover the parent button to reveal dropdown
        try:
            # Find all buttons, locate the one matching parent_name
            all_buttons = page.query_selector_all("button")
            nav_button = None
            for btn in all_buttons:
                text = (btn.inner_text() or "").strip().split("\n")[0].strip()
                if text == parent_name:
                    rect = btn.bounding_box()
                    if rect and 80 < rect["y"] < 250:
                        nav_button = btn
                        break

            if nav_button:
                nav_button.hover()
                page.wait_for_timeout(settings.robinhood_discovery_hover_wait_ms)

                dropdown: list[dict[str, object]] = page.evaluate(
                    DISCOVER_DROPDOWN_JS,
                )
                for item in dropdown:
                    sub_name = str(item.get("text", ""))
                    sub_slug = display_name_to_slug(sub_name)
                    if sub_slug and sub_slug not in subcategories:
                        subcategories.append(sub_slug)

                # Move mouse away to close dropdown
                page.mouse.move(0, 0)
                page.wait_for_timeout(300)
        except Exception as exc:
            print(f"    discover/{parent_slug}: hover failed — {exc}", flush=True)

        # Step 3: build paths
        if not subcategories:
            # Couldn't discover any — scrape bare parent as fallback
            return page, [_CategoryPath(path=parent_slug, label=parent_slug)]

        paths: list[_CategoryPath] = [
            _CategoryPath(
                path=f"{parent_slug}/{sub}",
                label=f"{parent_slug}/{sub}",
            )
            for sub in subcategories
        ]
        return page, paths

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def scrape_all(self) -> Iterator[list[RawContract]]:
        """Scrape child contracts from all dynamically discovered categories.

        Phase 0: discover category/subcategory paths (sequential, single browser).
        Phase 1: scrape listing pages in parallel to collect event metadata.
        Phase 2: visit all event detail pages in parallel to extract contracts.

        Each parallel phase launches N independent browser instances via
        ``ThreadPoolExecutor`` because Playwright's sync API binds to the
        greenlet/thread that created the browser.

        Yields batches of ``RawContract`` grouped by category.
        """
        self._nav_count = 0
        page = self._new_page()

        try:
            # Phase 0 — discovery (sequential)
            page, paths = self._discover_category_paths(page)
        finally:
            try:
                page.context.close()
            except Exception:
                pass

        if not paths:
            return

        # Close the parent browser before launching parallel workers.
        self.close()

        # ------ Phase 1 — parallel category listing ------
        n_workers = min(settings.robinhood_scrape_workers, len(paths))

        print(
            f"\n    === Phase 1: listing {len(paths)} categories ({n_workers} workers) ===\n",
            flush=True,
        )

        chunk_size = (len(paths) + n_workers - 1) // n_workers
        path_chunks: list[list[_CategoryPath]] = []
        for w in range(n_workers):
            start = w * chunk_size
            end = min(start + chunk_size, len(paths))
            path_chunks.append(paths[start:end])

        raw_events: list[_EventInfo] = []

        with ThreadPoolExecutor(max_workers=n_workers) as executor:
            futures = {
                executor.submit(
                    _listing_worker,
                    worker_id=w,
                    categories_chunk=path_chunks[w],
                ): w
                for w in range(n_workers)
            }
            for future in as_completed(futures):
                worker_id = futures[future]
                try:
                    raw_events.extend(future.result())
                except Exception as exc:
                    print(
                        f"    W{worker_id} listing FAILED: {type(exc).__name__}: {exc}",
                        flush=True,
                    )

        # Deduplicate events by slug (workers may find overlapping events)
        seen_slugs: set[str] = set()
        all_events: list[_EventInfo] = []
        for ev in raw_events:
            if ev.slug not in seen_slugs:
                seen_slugs.add(ev.slug)
                all_events.append(ev)

        print(
            f"\n    === Phase 1 complete: {len(all_events)} events "
            f"({len(raw_events) - len(all_events)} duplicates removed) ===\n",
            flush=True,
        )

        if not all_events:
            return

        # ------ Phase 2 — parallel detail page scraping ------
        n_workers = min(settings.robinhood_scrape_workers, len(all_events))
        total = len(all_events)

        print(
            f"    === Phase 2: scraping {total} detail pages ({n_workers} workers) ===\n",
            flush=True,
        )

        chunk_size = (total + n_workers - 1) // n_workers
        event_chunks: list[list[_EventInfo]] = []
        offsets: list[int] = []
        for w in range(n_workers):
            start = w * chunk_size
            end = min(start + chunk_size, total)
            event_chunks.append(all_events[start:end])
            offsets.append(start)

        all_contracts: list[RawContract] = []

        with ThreadPoolExecutor(max_workers=n_workers) as executor:
            detail_futures = {
                executor.submit(
                    _detail_worker,
                    worker_id=w,
                    events_chunk=event_chunks[w],
                    total_events=total,
                    global_offset=offsets[w],
                ): w
                for w in range(n_workers)
            }
            for detail_future in as_completed(detail_futures):
                worker_id = detail_futures[detail_future]
                try:
                    all_contracts.extend(detail_future.result())
                except Exception as exc:
                    print(
                        f"    W{worker_id} detail FAILED: {type(exc).__name__}: {exc}",
                        flush=True,
                    )

        print(
            f"\n    === Phase 2 complete: {len(all_contracts)} contracts from {total} events ===",
            flush=True,
        )

        # Yield contracts grouped by category (maintains page-by-page commit pattern)
        by_category: dict[str | None, list[RawContract]] = {}
        for c in all_contracts:
            by_category.setdefault(c.category or "unknown", []).append(c)

        for category, batch in by_category.items():
            print(
                f"    {category}: {len(batch)} contracts",
                flush=True,
            )
            yield batch

    # ------------------------------------------------------------------
    # Phase 1 — category listing (events only, no detail pages)
    # ------------------------------------------------------------------

    def _scrape_category_listing(
        self,
        page: Any,
        category: str,
        url: str,
        seen_event_slugs: set[str],
    ) -> tuple[Any, list[_EventInfo]]:
        """Scrape event cards from a category listing page.

        Returns ``(page, events)`` — *page* may change after retry.
        Only collects event metadata; detail pages are visited later in Phase 2.
        """
        page, status = self._goto_with_retry(page, url, label=category)
        if status == -1 or status >= 400:
            return page, []

        page.wait_for_timeout(int(settings.robinhood_page_load_wait_sec * 1000))

        title = page.title()
        if "error" in title.lower():
            print(f"    {category}: error page, skipping", flush=True)
            return page, []

        # Discover events via scrolling
        events = self._discover_events(page, category)

        # Deduplicate across categories (by event slug)
        new_events = [ev for ev in events if ev.slug not in seen_event_slugs]
        for ev in new_events:
            seen_event_slugs.add(ev.slug)

        print(
            f"    {category}: {len(new_events)} events",
            flush=True,
        )
        return page, new_events

    def _discover_events(
        self,
        page: Any,
        category: str,
    ) -> list[_EventInfo]:
        """Scroll through listing page and collect event-level metadata."""
        raw = self._extract_listing_js(page)

        # Quick-probe: if the initial page has 0 events, skip scrolling entirely.
        if not raw:
            return []

        prev_count = len(raw)
        no_new_count = 0

        for _ in range(settings.robinhood_max_scroll_attempts):
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(settings.robinhood_scroll_pause_sec)

            raw = self._extract_listing_js(page)
            if len(raw) > prev_count:
                prev_count = len(raw)
                no_new_count = 0
            else:
                no_new_count += 1
                if no_new_count >= settings.robinhood_max_no_new_content_scrolls:
                    break

        # Convert JS results to _EventInfo
        events: list[_EventInfo] = []
        seen: set[str] = set()
        for item in raw:
            href = str(item.get("href", ""))
            slug = extract_event_slug(href)
            if not slug or slug in seen:
                continue
            seen.add(slug)

            title = str(item.get("title", ""))
            vol_raw = item.get("volume")
            volume = int(str(vol_raw)) if vol_raw is not None else None
            close_date = parse_close_date_from_slug(slug)
            event_url = f"{BASE_URL}{href}" if href.startswith("/") else href

            events.append(
                _EventInfo(
                    slug=slug,
                    href=event_url,
                    title=title,
                    volume=volume,
                    close_date=close_date,
                    category=category,
                )
            )

        return events

    def _extract_listing_js(self, page: Any) -> list[dict[str, object]]:
        """Run the listing-page JS extraction."""
        try:
            return page.evaluate(EXTRACT_EVENTS_JS)  # type: ignore[no-any-return]
        except Exception:
            return []

    # ------------------------------------------------------------------
    # Phase 2 — event detail page (single event)
    # ------------------------------------------------------------------

    def _scrape_event_detail(
        self,
        page: Any,
        ev: _EventInfo,
        tag: str = "",
        index: int = 0,
        total: int = 0,
    ) -> tuple[Any, list[RawContract]]:
        """Visit an event detail page and extract all child outcomes.

        Returns ``(page, contracts)`` — *page* may change after retry.
        """
        label = f"{tag} detail[{index}/{total}] {ev.slug[:40]}" if tag else f"detail/{ev.slug[:40]}"

        page, status = self._goto_with_retry(
            page,
            ev.href,
            label=label,
        )
        if status == -1 or status >= 400:
            return page, []

        page.wait_for_timeout(int(settings.robinhood_page_load_wait_sec * 1000))

        # Click "Show N more" button to reveal all outcomes
        try:
            clicked = page.evaluate(CLICK_SHOW_MORE_JS)
            if clicked:
                page.wait_for_timeout(1500)
        except Exception:
            pass

        # Extract child outcomes
        try:
            js_results: list[dict[str, object]] = page.evaluate(
                EXTRACT_CHILD_CONTRACTS_JS,
            )
        except Exception:
            return page, []

        if not js_results:
            return page, []

        contracts = js_child_results_to_raw_contracts(
            js_results,
            event_slug=ev.slug,
            event_title=ev.title,
            event_volume=ev.volume,
            event_close_date=ev.close_date,
            event_url=ev.href,
            category_slug=ev.category,
        )
        return page, contracts


# ------------------------------------------------------------------
# Parallel workers (module-level — each owns its own Playwright/browser)
# ------------------------------------------------------------------


def _listing_worker(
    worker_id: int,
    categories_chunk: list[_CategoryPath],
) -> list[_EventInfo]:
    """Scrape category listing pages for a chunk of categories.

    Each worker launches its own Playwright + Chromium instance.

    Args:
        worker_id: Zero-based worker index (for logging).
        categories_chunk: Subset of category paths this worker handles.
    """
    tag = f"W{worker_id}"
    all_events: list[_EventInfo] = []
    # Each worker tracks its own seen slugs; global dedup happens after merge.
    seen: set[str] = set()

    with RobinhoodScraper() as scraper:
        page = scraper._new_page()
        try:
            for cat_path in categories_chunk:
                url = f"{settings.robinhood_base_url}{cat_path.path}/"
                page, events = scraper._scrape_category_listing(
                    page,
                    f"{tag} {cat_path.label}",
                    url,
                    seen,
                )
                all_events.extend(events)
        finally:
            try:
                page.context.close()
            except Exception:
                pass

    print(
        f"    {tag} listing done: {len(all_events)} events from {len(categories_chunk)} categories",
        flush=True,
    )
    return all_events


# ------------------------------------------------------------------


def _detail_worker(
    worker_id: int,
    events_chunk: list[_EventInfo],
    total_events: int,
    global_offset: int,
) -> list[RawContract]:
    """Scrape detail pages for a chunk of events.

    Each worker launches its own Playwright + Chromium instance because
    Playwright's sync API binds to the greenlet/thread that created the
    browser — calling ``browser.new_context()`` from a different thread
    raises a greenlet error.

    Args:
        worker_id: Zero-based worker index (for logging).
        events_chunk: Subset of events this worker is responsible for.
        total_events: Total number of events across all workers (for logging).
        global_offset: Starting index of this chunk in the full event list.
    """
    tag = f"W{worker_id}"
    all_contracts: list[RawContract] = []

    with RobinhoodScraper() as scraper:
        page = scraper._new_page()
        try:
            for local_i, ev in enumerate(events_chunk):
                i = global_offset + local_i + 1  # 1-based global index
                page, children = scraper._scrape_event_detail(page, ev, tag, i, total_events)
                all_contracts.extend(children)
        finally:
            try:
                page.context.close()
            except Exception:
                pass

    ok_count = len(all_contracts)
    print(
        f"    {tag} done: {ok_count} contracts from {len(events_chunk)} events",
        flush=True,
    )
    return all_contracts
