"""Coinbase prediction markets scraper using Playwright sync API.

Ported from `micah/server/app/services/coinbase/scraper.py` (2026-06-09).
Only the imports (retargeted at pmi-ingest) and `_rss_mb` (psutil made
optional) changed; the two-phase scraping logic is unchanged.

Approach:
  1. **Phase 1** — Navigate to the predictions page, discover first-level
     category tabs, click each and infinite-scroll while intercepting the
     GraphQL `…LiveProductStatsEmitterFragmentQuery` requests to capture
     `liveProductIds`. Prefix-matching rules turn product IDs into candidate
     event IDs.
  2. **Phase 2** — Visit each `/predictions/event/{event_id}` page across
     `coinbase_scrape_workers` threads, extract title + per-outcome
     probabilities + event-level volume / expiry from "Key stats".

All page navigations go through the base `_goto_with_retry()` which enforces
pacing delays and handles HTTP 429 / 5xx with exponential back-off.
"""

from __future__ import annotations

import json
import random
import time
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any
from urllib.parse import parse_qs, urlparse

from pmi_ingest.config import ingest_settings as settings
from pmi_ingest.scrapers.coinbase.parser import (
    CHECK_REGIONAL_RESTRICTION_JS,
    CLICK_CATEGORY_TAB_JS,
    CLICK_SEE_MORE_JS,
    DIAGNOSE_EVENT_PAGE_JS,
    DISCOVER_CATEGORIES_JS,
    EXTRACT_EVENT_CONTRACTS_JS,
    EXTRACT_EVENT_TITLE_JS,
    EXTRACT_KEY_STATS_JS,
    EXTRACT_SINGLE_CONTRACT_PROB_JS,
    PREDICTIONS_URL,
    _slugify,
)
from pmi_ingest.scrapers.coinbase.types import (
    EventContract,
    EventPageResult,
    RawContract,
)
from pmi_ingest.scrapers.playwright_base import PlaywrightScraper


def _rss_mb() -> float:
    """Return current process RSS memory in MB (0.0 if psutil unavailable).

    psutil is an optional diagnostic dependency — the scraper runs fine
    without it; we only lose the memory-usage log lines.
    """
    try:
        import psutil  # type: ignore[import-untyped]
    except ImportError:
        return 0.0
    return float(psutil.Process().memory_info().rss / 1024 / 1024)


class CoinbaseScraper(PlaywrightScraper):
    """Manages Playwright browser lifecycle and scrapes Coinbase prediction markets.

    Usage as context manager::

        with CoinbaseScraper() as scraper:
            for batch in scraper.scrape_all():
                process(batch)
    """

    _EXTRA_LAUNCH_ARGS = [
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--js-flags=--max-old-space-size=256",
    ]
    _BLOCK_RESOURCES = True

    # GraphQL operation name we intercept to capture product IDs
    _GRAPHQL_OP = "PredictionMarketsLiveProductStatsEmitterFragmentQuery"

    def __init__(self) -> None:
        super().__init__()
        # Request interception state
        self._captured_product_ids: list[str] = []
        self._seen_product_ids: set[str] = set()
        self._captured_event_ids: list[str] = []
        self._seen_event_ids: set[str] = set()
        # Category tracking: which category was active when each event ID was captured
        self._current_category: str = ""
        self._event_id_to_category: dict[str, str] = {}

    # ------------------------------------------------------------------
    # Browser lifecycle
    # ------------------------------------------------------------------

    # Recycle page context every N navigations to release accumulated DOM memory
    _PAGE_RECYCLE_INTERVAL = 50

    @staticmethod
    def _parse_expiry_date(raw: str) -> str | None:
        """Parse expiry text like 'Jan 1, 2027' to ISO 'YYYY-MM-DD' format."""
        for fmt in ("%b %d, %Y", "%B %d, %Y", "%b %d %Y", "%B %d %Y"):
            try:
                return datetime.strptime(raw.strip(), fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        return None

    # ------------------------------------------------------------------
    # Cookie consent dismissal
    # ------------------------------------------------------------------

    _DISMISS_COOKIE_JS = """
    () => {
        // OneTrust "Accept" button
        const btn = document.getElementById('onetrust-accept-btn-handler');
        if (btn) { btn.click(); return { dismissed: true, method: 'onetrust-accept' }; }

        // Fallback: "Allow all" button
        const allow = document.getElementById('accept-recommended-btn-handler');
        if (allow) { allow.click(); return { dismissed: true, method: 'allow-all' }; }

        return { dismissed: false, method: null };
    }
    """

    def _dismiss_cookie_consent(self, page: Any) -> None:
        """Dismiss the OneTrust cookie consent banner if present."""
        try:
            result: dict[str, object] = page.evaluate(self._DISMISS_COOKIE_JS)
            if result.get("dismissed"):
                print(
                    f"    Cookie consent dismissed ({result.get('method')})",
                    flush=True,
                )
                page.wait_for_timeout(1000)
        except Exception:
            pass

    # ------------------------------------------------------------------
    # Regional restriction check
    # ------------------------------------------------------------------

    def _check_regional_restriction(self, page: Any) -> bool:
        """Check for data-testid='undefined-content-box' div.

        Returns True if the page shows a regional restriction notice.
        """
        try:
            result: dict[str, object] = page.evaluate(CHECK_REGIONAL_RESTRICTION_JS)
            if result.get("restricted"):
                msg = str(result.get("message", ""))
                print(f"    Regional restriction detected: {msg[:100]}", flush=True)
                return True
        except Exception:
            pass
        return False

    # ------------------------------------------------------------------
    # Request interception for liveProductIds
    # ------------------------------------------------------------------

    def _extract_product_ids(self, request: Any) -> list[str]:
        """Parse ``liveProductIds`` from a GraphQL request.

        Checks the query-string ``variables`` first, then falls back
        to the POST body.  Returns an empty list on failure.
        """
        parsed = urlparse(request.url)
        qs = parse_qs(parsed.query)

        variables_raw = qs.get("variables", [None])[0]
        if not variables_raw:
            post_data = request.post_data
            if not post_data:
                return []
            body = json.loads(post_data)
            variables_raw = json.dumps(body.get("variables", {}))

        variables = json.loads(variables_raw) if isinstance(variables_raw, str) else variables_raw
        result: list[str] = variables.get("liveProductIds", [])
        return result

    def _on_request(self, request: Any) -> None:
        """Intercept outgoing requests and capture liveProductIds.

        Filters for GraphQL requests whose ``operationName`` matches
        ``PredictionMarketsLiveProductStatsEmitterFragmentQuery``.
        The ``variables`` parameter (JSON-encoded in the query string)
        contains the ``liveProductIds`` array.
        """
        if self._GRAPHQL_OP not in request.url:
            return

        try:
            product_ids = self._extract_product_ids(request)
            new_product_count = 0
            new_event_count = 0

            for pid in product_ids:
                pid_str = str(pid)
                if pid_str in self._seen_product_ids:
                    continue

                self._seen_product_ids.add(pid_str)
                self._captured_product_ids.append(pid_str)
                new_product_count += 1

                # Deduplicate at event level (primary = first two segments)
                eid = self._product_id_to_event_id(pid_str)
                if eid in self._seen_event_ids:
                    continue

                self._seen_event_ids.add(eid)
                self._captured_event_ids.append(eid)
                new_event_count += 1
                if self._current_category:
                    self._event_id_to_category[eid] = self._current_category

            if new_product_count > 0:
                print(
                    f"    [intercept] +{new_product_count} product IDs, "
                    f"+{new_event_count} event IDs "
                    f"(totals: {len(self._captured_product_ids)} products, "
                    f"{len(self._captured_event_ids)} events)",
                    flush=True,
                )
        except Exception as exc:
            print(f"    [intercept] parse error: {exc}", flush=True)

    def _attach_request_listener(self, page: Any) -> None:
        """Attach the request interception listener to a page."""
        page.on("request", self._on_request)

    def _reset_captured_ids(self) -> None:
        """Clear all captured product and event IDs."""
        self._captured_product_ids.clear()
        self._seen_product_ids.clear()
        self._captured_event_ids.clear()
        self._seen_event_ids.clear()
        self._current_category = ""
        self._event_id_to_category.clear()

    @staticmethod
    def _product_id_to_event_id(product_id: str) -> str:
        """Return the primary (first) event ID candidate for a product ID."""
        parts = product_id.split("-")
        return "-".join(parts[:2]) if len(parts) >= 2 else product_id

    # ------------------------------------------------------------------
    # Candidate ID generation (Part 1 rules)
    # ------------------------------------------------------------------

    def _generate_candidate_ids(self) -> tuple[list[str], dict[str, str]]:
        """Generate candidate event IDs from captured product IDs.

        Applies prefix-matching rules against the full product ID list:

        For each product_id, split by ``-`` into ``strings``:
          - **Condition A**: ``strings[0]``
          - **Condition B**: ``strings[0]-strings[1]``

        Rules (based on how many product IDs share each prefix):
          1. count(A) == 1  → candidate = ``strings[0]-strings[1]``
          2. count(A) > 1, count(B) == 1  → candidate = ``strings[0]``
          3. both > 1  → candidates = ``strings[0]-strings[1]``
             AND ``strings[:-2]`` joined by ``-``

        Returns:
            ``(candidate_ids, category_map)`` where category_map maps
            each candidate to its source category.
        """
        product_ids = list(self._captured_product_ids)
        candidates: list[str] = []
        seen: set[str] = set()
        cat_map: dict[str, str] = {}

        def _prefix_count(prefix: str) -> int:
            """Count product IDs sharing *prefix* as a segment boundary."""
            return sum(1 for p in product_ids if p == prefix or p.startswith(prefix + "-"))

        for pid in product_ids:
            strings = pid.split("-")
            if len(strings) < 2:
                if pid not in seen:
                    seen.add(pid)
                    candidates.append(pid)
                    eid = self._product_id_to_event_id(pid)
                    cat = self._event_id_to_category.get(eid, "")
                    if cat:
                        cat_map[pid] = cat
                continue

            condition_a = strings[0]
            condition_b = f"{strings[0]}-{strings[1]}"

            count_a = _prefix_count(condition_a)
            count_b = _prefix_count(condition_b)

            generated: list[str] = []

            if count_a == 1:
                # Rule 1: unique first segment → use first two segments
                generated.append(condition_b)
            elif count_b == 1:
                # Rule 2: shared first segment, unique first-two → use first segment only
                generated.append(condition_a)
            else:
                # Rule 3: both shared → try both short and long forms
                generated.append(condition_b)
                if len(strings) > 2:
                    remaining = "-".join(strings[:-2])
                    generated.append(remaining)

            # Map category from original event_id tracking
            eid = self._product_id_to_event_id(pid)
            category = self._event_id_to_category.get(eid, "")

            for cand in generated:
                if cand and cand not in seen:
                    seen.add(cand)
                    candidates.append(cand)
                    if category:
                        cat_map[cand] = category

        return candidates, cat_map

    @property
    def captured_product_ids(self) -> list[str]:
        """Return the deduplicated list of captured product IDs."""
        return list(self._captured_product_ids)

    @property
    def captured_event_ids(self) -> list[str]:
        """Return deduplicated event-level IDs (all segments except the last two)."""
        return list(self._captured_event_ids)

    @property
    def event_id_to_category(self) -> dict[str, str]:
        """Return mapping of event ID → category name."""
        return dict(self._event_id_to_category)

    def first_event_per_category(self) -> dict[str, str]:
        """Return {category: first_event_id} for each category with captured events."""
        result: dict[str, str] = {}
        for eid in self._captured_event_ids:
            cat = self._event_id_to_category.get(eid, "")
            if cat and cat not in result:
                result[cat] = eid
        return result

    # ------------------------------------------------------------------
    # Shared helpers — predictions page setup + category iteration
    # ------------------------------------------------------------------

    def _open_predictions_page(
        self,
        page: Any,
    ) -> tuple[Any, int]:
        """Navigate to predictions page, wait for load, check restrictions.

        Returns ``(page, status)``.  Callers should check ``status >= 400``
        or ``status == -1`` for failure.
        """
        page, status = self._goto_with_retry(
            page,
            PREDICTIONS_URL,
            label="predictions/home",
        )
        if status == -1 or status >= 400:
            print("    Coinbase: failed to load predictions page", flush=True)
            return page, status

        page.wait_for_timeout(int(settings.coinbase_page_load_wait_sec * 1000))

        # Dismiss cookie consent banner (OneTrust) before any interaction
        self._dismiss_cookie_consent(page)

        if not settings.coinbase_skip_region_check and self._check_regional_restriction(page):
            return page, 403  # Treat as forbidden

        return page, status

    def _resolve_categories(
        self,
        page: Any,
        categories: list[str] | None = None,
    ) -> list[str]:
        """Discover categories and apply skip filter.

        Args:
            page: Active Playwright page (already on predictions page).
            categories: Explicit list to use.  If ``None``, discovers from
                the page and applies ``coinbase_skip_categories``.

        Returns:
            Filtered category name list (may be empty).
        """
        if categories is not None:
            return categories

        discovered = self._discover_categories(page)
        if not discovered:
            print("    Coinbase: no categories found", flush=True)
            return []

        skip = set(settings.coinbase_skip_categories)
        active = [c for c in discovered if c not in skip]
        skipped = [c for c in discovered if c in skip]
        if skipped:
            print(f"    Coinbase: skipping categories: {skipped}", flush=True)
        return active

    def _click_and_scroll_category(self, page: Any, cat_name: str) -> bool:
        """Click a category tab and scroll to load all content.

        Returns True if the tab was clicked successfully.
        """
        try:
            clicked: bool = page.evaluate(CLICK_CATEGORY_TAB_JS, cat_name)
            if not clicked:
                print(f"    {cat_name}: tab click failed", flush=True)
                return False
        except Exception as exc:
            print(f"    {cat_name}: tab click error — {exc}", flush=True)
            return False

        page.wait_for_timeout(int(settings.coinbase_tab_switch_wait_sec * 1000))
        self._infinite_scroll(page, cat_name)
        return True

    # ------------------------------------------------------------------
    # Public API — product ID capture
    # ------------------------------------------------------------------

    def scrape_product_ids(
        self,
        categories: list[str] | None = None,
    ) -> list[str]:
        """Scrape categories while intercepting GraphQL requests.

        Returns list of unique product ID strings captured from network traffic.
        """
        self._nav_count = 0
        self._reset_captured_ids()
        page = self._new_page()
        self._attach_request_listener(page)

        try:
            page, status = self._open_predictions_page(page)
            if status == -1 or status >= 400:
                return []

            # Re-attach listener if page was replaced during retry
            self._attach_request_listener(page)

            active_categories = self._resolve_categories(page, categories)
            if not active_categories:
                return []

            print(
                f"\n    === Intercepting product IDs across {len(active_categories)} categories ===",
                flush=True,
            )

            for cat_name in active_categories:
                self._current_category = cat_name
                self._click_and_scroll_category(page, cat_name)

            # Final wait for any in-flight requests
            page.wait_for_timeout(3000)

            print(
                f"\n    === Capture complete: {len(self._captured_product_ids)} "
                f"product IDs → {len(self._captured_event_ids)} unique events "
                f"across {len(active_categories)} categories ===",
                flush=True,
            )
            return self.captured_product_ids

        finally:
            try:
                page.context.close()
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Public API — event page contract scraping
    # ------------------------------------------------------------------

    _EVENT_URL_TEMPLATE = "https://www.coinbase.com/predictions/event/{event_id}"

    def _scrape_event_worker(
        self,
        worker_id: int,
        event_ids_chunk: list[str],
        cat_map: dict[str, str],
        total_events: int,
        global_offset: int,
    ) -> list[EventPageResult]:
        """Scrape a chunk of event pages on a dedicated browser page.

        Each worker runs on its own thread with its own page context.
        Uses a local nav count to avoid contention on ``self._nav_count``.

        Args:
            worker_id: Zero-based worker index (for logging).
            event_ids_chunk: Subset of event IDs this worker is responsible for.
            cat_map: ``{event_id: category}`` mapping.
            total_events: Total number of events across all workers (for logging).
            global_offset: Starting index of this chunk in the full event list.
        """
        delay = settings.coinbase_verify_delay_sec
        batch_size = settings.coinbase_verify_batch_size
        batch_pause = settings.coinbase_verify_batch_pause_sec
        tag = f"W{worker_id}"

        # Each worker uses its own page context — thread-safe since Playwright
        # pages are bound to the thread that created them.
        page = self._new_page()
        results: list[EventPageResult] = []

        try:
            pages_since_recycle = 0
            for local_i, eid in enumerate(event_ids_chunk):
                i = global_offset + local_i + 1  # 1-based global index

                # Recycle page context periodically to release DOM memory
                pages_since_recycle += 1
                if pages_since_recycle > self._PAGE_RECYCLE_INTERVAL:
                    try:
                        page.context.close()
                    except Exception:
                        pass
                    page = self._new_page()
                    pages_since_recycle = 0

                category = cat_map.get(eid, "")
                url = self._EVENT_URL_TEMPLATE.format(event_id=eid)

                page, status = self._goto_with_retry(
                    page,
                    url,
                    label=f"{tag} event[{i}] {eid}",
                )

                # Check for redirect back to /predictions (invalid candidate)
                final_url = page.url
                redirected = status != -1 and "/predictions/event/" not in final_url
                if status == -1 or redirected:
                    results.append(
                        EventPageResult(
                            event_id=eid,
                            category=category,
                            url=url,
                            title="",
                            status=status,
                            redirected=True,
                        )
                    )
                    continue

                # Wait for page content to load
                page.wait_for_timeout(
                    int(settings.coinbase_page_load_wait_sec * 1000),
                )

                # Dismiss cookie consent on first event page per worker
                if local_i == 0:
                    self._dismiss_cookie_consent(page)

                # Diagnostic: dump page structure
                details_found = False
                try:
                    diag: dict[str, object] = page.evaluate(
                        DIAGNOSE_EVENT_PAGE_JS,
                    )
                    details_found = bool(diag.get("detailsFound", False))
                    see_more_present = int(str(diag.get("seeMoreCount", 0))) > 0
                    print(
                        f"    {tag} [{i}] diag: details={diag.get('detailsFound')} "
                        f"seeMore={'YES' if see_more_present else 'NO'}",
                        flush=True,
                    )
                except Exception as exc:
                    print(f"    {tag} [{i}] diag error: {exc}", flush=True)

                # Extract event title
                title_result: dict[str, object] = page.evaluate(
                    EXTRACT_EVENT_TITLE_JS,
                )
                title = str(title_result.get("title", ""))

                # Extract contract details based on page structure
                contracts: list[EventContract] = []

                if details_found:
                    # --- Scenario A: page has a Details section ---
                    try:
                        see_more: dict[str, object] = page.evaluate(
                            CLICK_SEE_MORE_JS,
                        )
                        if int(str(see_more.get("clicked", 0))) > 0:
                            page.wait_for_timeout(2000)
                    except Exception:
                        pass

                    try:
                        raw_contracts: list[dict[str, object]] = page.evaluate(
                            EXTRACT_EVENT_CONTRACTS_JS,
                        )
                        for rc in raw_contracts:
                            name = str(rc.get("name", ""))
                            prob_raw = rc.get("probability")
                            prob = int(str(prob_raw)) / 100.0 if prob_raw is not None else None
                            contracts.append(
                                EventContract(
                                    name=name,
                                    probability=prob,
                                )
                            )
                    except Exception as exc:
                        print(
                            f"    {tag} [{i}] extraction error for {eid}: {exc}",
                            flush=True,
                        )
                else:
                    # --- Scenario B: single contract page (no Details) ---
                    try:
                        prob_result: dict[str, object] = page.evaluate(
                            EXTRACT_SINGLE_CONTRACT_PROB_JS,
                        )
                        prob_raw = prob_result.get("probability")
                        if prob_raw is not None:
                            prob = int(str(prob_raw)) / 100.0
                            contracts.append(
                                EventContract(
                                    name=title,
                                    probability=prob,
                                )
                            )
                    except Exception as exc:
                        print(
                            f"    {tag} [{i}] single contract extraction error for {eid}: {exc}",
                            flush=True,
                        )

                # Extract event-level stats from "Key stats" section
                event_volume: int | None = None
                event_volume_raw: str | None = None
                event_close_date: str | None = None
                try:
                    key_stats: dict[str, object] = page.evaluate(
                        EXTRACT_KEY_STATS_JS,
                    )
                    if key_stats.get("found"):
                        vol = key_stats.get("volume")
                        if vol is not None:
                            event_volume = int(str(vol))
                        vol_raw = key_stats.get("volumeRaw")
                        if vol_raw is not None:
                            event_volume_raw = str(vol_raw)
                        expiry = key_stats.get("expiry")
                        if expiry is not None:
                            event_close_date = self._parse_expiry_date(
                                str(expiry),
                            )
                except Exception as exc:
                    print(
                        f"    {tag} [{i}] key stats extraction error: {exc}",
                        flush=True,
                    )

                # Skip events with no volume data (None or 0)
                if not event_volume:
                    vol_label = event_volume_raw or "no vol"
                    print(
                        f"    {tag} [{i}/{total_events}] {eid}: SKIPPED (vol={vol_label}) | ",
                        flush=True,
                    )
                    continue

                results.append(
                    EventPageResult(
                        event_id=eid,
                        category=category,
                        url=url,
                        title=title,
                        status=status,
                        redirected=False,
                        contracts=contracts,
                        volume=event_volume,
                        volume_raw=event_volume_raw,
                        close_date=event_close_date,
                    )
                )

                print(
                    f"    {tag} [{i}/{total_events}] {eid}: {len(contracts)} contracts | vol={event_volume_raw} | ",
                    flush=True,
                )

                # Rate limiting
                wait = delay + random.uniform(0, 1.5)
                if (local_i + 1) % batch_size == 0:
                    wait += batch_pause
                    print(
                        f"    {tag} --- batch pause ({batch_pause}s) ---",
                        flush=True,
                    )
                time.sleep(wait)

        finally:
            try:
                page.context.close()
            except Exception:
                pass

        ok = sum(1 for r in results if r.contracts)
        print(
            f"    {tag} done: {ok}/{len(results)} with contracts",
            flush=True,
        )
        return results

    def scrape_event_contracts(
        self,
        event_ids: list[str],
        categories: dict[str, str] | None = None,
    ) -> list[EventPageResult]:
        """Navigate to each event page and extract contract details.

        Uses ``coinbase_scrape_workers`` parallel browser pages to speed up
        Phase 2 scraping.  Each worker gets its own page context and processes
        an equal-sized chunk of event IDs concurrently.

        For each event ID:
          1. Navigate to ``/predictions/event/{event_id}``.
          2. Check for redirect back to ``/predictions`` (marks as invalid).
          3. Click any "See ... more" button to expand the Details section.
          4. Extract contract outcome names, probabilities, and volumes.

        Args:
            event_ids: List of event ID strings to scrape.
            categories: Optional ``{event_id: category}`` mapping.  If not
                provided, uses ``self._event_id_to_category``.

        Returns:
            List of ``EventPageResult`` for each event ID.
        """
        cat_map = categories if categories is not None else self._event_id_to_category
        n_workers = min(settings.coinbase_scrape_workers, len(event_ids))
        total = len(event_ids)

        print(
            f"\n    === Scraping contracts from {total} event pages ({n_workers} workers) ===\n",
            flush=True,
        )

        # Split event IDs into contiguous chunks for each worker
        chunk_size = (total + n_workers - 1) // n_workers
        chunks: list[list[str]] = []
        offsets: list[int] = []
        for w in range(n_workers):
            start = w * chunk_size
            end = min(start + chunk_size, total)
            chunks.append(event_ids[start:end])
            offsets.append(start)

        all_results: list[EventPageResult] = []

        with ThreadPoolExecutor(max_workers=n_workers) as executor:
            futures = {
                executor.submit(
                    self._scrape_event_worker,
                    worker_id=w,
                    event_ids_chunk=chunks[w],
                    cat_map=cat_map,
                    total_events=total,
                    global_offset=offsets[w],
                ): w
                for w in range(n_workers)
            }
            for future in as_completed(futures):
                worker_id = futures[future]
                try:
                    worker_results = future.result()
                    all_results.extend(worker_results)
                except Exception as exc:
                    print(
                        f"    W{worker_id} FAILED: {type(exc).__name__}: {exc}",
                        flush=True,
                    )

        ok = sum(1 for r in all_results if r.contracts)
        print(
            f"\n    === Event scraping done: {ok}/{len(all_results)} with contracts | mem: {_rss_mb():.0f} MB ===",
            flush=True,
        )
        return all_results

    # ------------------------------------------------------------------
    # Public API — full scrape
    # ------------------------------------------------------------------

    def scrape_all(self) -> Iterator[list[RawContract]]:
        """Two-phase scrape: discover events via category scrolling, then
        visit each event page for full contract data (volume, close_date).

        **Phase 1** — Scroll each category tab with request interception
        enabled to capture event IDs from GraphQL traffic.

        **Phase 2** — Visit each unique event page to extract:
          - Event title
          - Individual contract outcomes + probabilities
          - Volume from "Key stats" section
          - Expiry / close_date from "Key stats" section

        Yields batches of ``RawContract`` with complete data.
        """
        print(f"    [mem] start: {_rss_mb():.0f} MB", flush=True)

        # ------ Phase 1: Discover event IDs via category scrolling ------
        self._nav_count = 0
        self._reset_captured_ids()
        page = self._new_page()
        self._attach_request_listener(page)

        candidate_ids: list[str] = []
        cat_map: dict[str, str] = {}
        try:
            page, status = self._open_predictions_page(page)
            if status == -1 or status >= 400:
                return

            # Re-attach listener if page was replaced during retry
            self._attach_request_listener(page)

            active_categories = self._resolve_categories(page)
            if not active_categories:
                return

            category_counts: dict[str, int] = {}
            for cat_name in active_categories:
                self._current_category = cat_name
                before = len(self._captured_event_ids)
                self._click_and_scroll_category(page, cat_name)
                # Brief pause to let any in-flight requests settle before
                # attributing the final count to this category.
                page.wait_for_timeout(500)
                after = len(self._captured_event_ids)
                category_counts[cat_name] = after - before

            # Final wait for in-flight requests
            page.wait_for_timeout(3000)

            # Generate candidate event IDs using prefix-matching rules
            candidate_ids, cat_map = self._generate_candidate_ids()

            print(
                f"\n    === Phase 1 complete: "
                f"{len(self._captured_product_ids)} product IDs "
                f"→ {len(candidate_ids)} candidate event IDs "
                f"across {len(active_categories)} categories "
                f"| mem: {_rss_mb():.0f} MB ===",
                flush=True,
            )
            for cat_name in active_categories:
                count = category_counts.get(cat_name, 0)
                print(f"      {cat_name}: {count} events", flush=True)
            print("", flush=True)

        finally:
            try:
                page.context.close()
            except Exception:
                pass

        if not candidate_ids:
            return

        # ------ Phase 2: Visit each event page for full data ------
        results = self.scrape_event_contracts(candidate_ids, cat_map)

        for event in results:
            if not event.contracts or event.redirected:
                continue

            batch: list[RawContract] = []
            for contract in event.contracts:
                slug = f"{event.event_id}-{_slugify(contract.name)}"
                title = f"{event.title}: {contract.name}" if len(event.contracts) > 1 else event.title
                batch.append(
                    RawContract(
                        slug=slug,
                        title=title,
                        yes_price=contract.probability,
                        volume=event.volume,
                        close_date=event.close_date,
                        category=event.category,
                        url=event.url,
                    )
                )

            if batch:
                yield batch

    # ------------------------------------------------------------------
    # Category discovery
    # ------------------------------------------------------------------

    def _discover_categories(self, page: Any) -> list[str]:
        """Discover category names from ``role='tablist'`` elements."""
        try:
            result: dict[str, object] = page.evaluate(DISCOVER_CATEGORIES_JS)
            cats_raw = result.get("categories", [])
            categories: list[str] = []
            if isinstance(cats_raw, list):
                categories = [str(c.get("text", "")) for c in cats_raw if isinstance(c, dict)]
            categories = [c for c in categories if c]

            print(
                f"    Coinbase: found {len(categories)} first-level categories: {categories}",
                flush=True,
            )
            return categories
        except Exception as exc:
            print(f"    Coinbase: category discovery failed — {exc}", flush=True)
            return []

    # ------------------------------------------------------------------
    # Infinite scroll with spinner-based completion detection
    # ------------------------------------------------------------------

    # JS: scroll to the top of the <footer> element, then inspect the
    # InfiniteScroll container for a loading spinner and count grid children.
    _SCROLL_AND_COUNT_JS = """
    () => {
        // Scroll to 250px above the top of the <footer> element
        const footer = document.querySelector('footer');
        if (footer) {
            const footerTop = footer.getBoundingClientRect().top + window.scrollY;
            window.scrollTo({ top: footerTop - 250, behavior: 'instant' });
        } else {
            window.scrollTo(0, document.body.scrollHeight);
        }

        // Find the section whose class starts with "InfiniteScroll__StyledContainer"
        let container = null;
        for (const el of document.querySelectorAll('*')) {
            for (const cls of el.classList) {
                if (cls.startsWith('InfiniteScroll__StyledContainer')
                    && !cls.includes('Spinner')) {
                    container = el;
                    break;
                }
            }
            if (container) break;
        }
        if (!container) return { found: false, childCount: 0, hasSpinner: false };

        // Check for spinner inside the container
        let hasSpinner = false;
        for (const el of container.querySelectorAll('*')) {
            for (const cls of el.classList) {
                if (cls.startsWith('InfiniteScroll__Spinner')
                    || cls.startsWith('InfiniteScroll__StyledContainer__Spinner')) {
                    hasSpinner = true;
                    break;
                }
            }
            if (hasSpinner) break;
        }

        // Find the grid div inside (any class starting with "grid")
        let grid = null;
        for (const el of container.querySelectorAll('*')) {
            for (const cls of el.classList) {
                if (cls.startsWith('grid')) {
                    grid = el;
                    break;
                }
            }
            if (grid) break;
        }
        const childCount = grid ? grid.children.length : 0;

        return { found: true, childCount, hasSpinner };
    }
    """

    # JS: scroll to the top of the InfiniteScroll section element.
    _SCROLL_TO_SECTION_TOP_JS = """
    () => {
        // Find the InfiniteScroll container
        let container = null;
        for (const el of document.querySelectorAll('*')) {
            for (const cls of el.classList) {
                if (cls.startsWith('InfiniteScroll__StyledContainer')
                    && !cls.includes('Spinner')) {
                    container = el;
                    break;
                }
            }
            if (container) break;
        }
        if (!container) {
            window.scrollTo({ top: 0, behavior: 'instant' });
            return { scrolledTo: 0 };
        }
        const sectionTop = container.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: sectionTop, behavior: 'instant' });
        return { scrolledTo: Math.round(sectionTop) };
    }
    """

    # Consecutive scrolls with no new intercepted events before we declare
    # the category fully loaded.  This is the *primary* completion signal —
    # based on actual data arrival (GraphQL intercepts), not DOM state.
    _MAX_NO_NEW_DATA_SCROLLS = 3

    # Safety hard cap to prevent truly infinite loops (e.g. if the
    # intercept handler breaks).  Should never be hit in normal operation.
    _MAX_SCROLL_ATTEMPTS = 50

    def _infinite_scroll(self, page: Any, label: str) -> None:
        """Scroll until no new data arrives from the server.

        The **primary** completion signal is whether the request
        interceptor (``_on_request``) captured new event IDs during
        a scroll cycle.  This is more reliable than DOM signals
        (spinner element, grid child count) because it tracks actual
        data arrival rather than rendering state.

        Completion signals (whichever fires first):
          1. **No new data** — intercepted event count unchanged for
             ``_MAX_NO_NEW_DATA_SCROLLS`` consecutive scrolls.
          2. **Spinner absent** — InfiniteScroll spinner removed from
             DOM (fast path for well-behaved categories).
          3. **Hard cap** — ``_MAX_SCROLL_ATTEMPTS`` reached (safety).
        """
        poll_interval = settings.coinbase_scroll_pause_sec
        scroll_count = 0
        prev_event_count = len(self._captured_event_ids)
        no_new_data_rounds = 0

        while True:
            # Scroll to footer + inspect container state
            metrics: dict[str, object] = page.evaluate(self._SCROLL_AND_COUNT_JS)
            scroll_count += 1

            if not metrics.get("found") and scroll_count == 1:
                print(
                    f"    {label}: InfiniteScroll container not found, using body scroll only",
                    flush=True,
                )

            # Wait for lazy-loaded content and intercepted requests
            try:
                page.wait_for_load_state("networkidle", timeout=5000)
            except Exception:
                pass  # Timeout OK — analytics/websockets keep firing
            time.sleep(poll_interval)

            current_grid = int(str(metrics.get("childCount", 0)))
            has_spinner = bool(metrics.get("hasSpinner", False))
            current_event_count = len(self._captured_event_ids)
            new_events = current_event_count - prev_event_count

            print(
                f"    {label}: scroll #{scroll_count} | "
                f"grid={current_grid} | "
                f"events={current_event_count} (+{new_events}) | "
                f"spinner={'YES' if has_spinner else 'NO'}",
                flush=True,
            )

            # Signal 1: Spinner absent → all data loaded (fast path).
            if not has_spinner:
                # On the first scroll with no new events, the tab may have
                # loaded from cache so the spinner never appeared, but async
                # GraphQL requests could still be in-flight.  Wait one extra
                # poll interval and re-read the count before exiting.
                if scroll_count == 1 and new_events == 0:
                    time.sleep(poll_interval)
                    current_event_count = len(self._captured_event_ids)
                    new_events = current_event_count - prev_event_count
                print(
                    f"    {label}: spinner absent, "
                    f"{current_event_count} events captured "
                    f"(+{new_events} this scroll)"
                    f"— scroll complete ({scroll_count} scrolls)",
                    flush=True,
                )
                break

            # Signal 2: No new intercepted events for N consecutive scrolls.
            if new_events == 0:
                no_new_data_rounds += 1
                if no_new_data_rounds >= self._MAX_NO_NEW_DATA_SCROLLS:
                    print(
                        f"    {label}: no new events for "
                        f"{self._MAX_NO_NEW_DATA_SCROLLS} scrolls, "
                        f"{current_event_count} events captured "
                        f"— treating as complete ({scroll_count} scrolls)",
                        flush=True,
                    )
                    break
            else:
                no_new_data_rounds = 0
            prev_event_count = current_event_count

            # Signal 3: Hard cap (safety net).
            if scroll_count >= self._MAX_SCROLL_ATTEMPTS:
                print(
                    f"    {label}: reached max {self._MAX_SCROLL_ATTEMPTS} scrolls, "
                    f"{current_event_count} events captured "
                    f"— treating as complete",
                    flush=True,
                )
                break

            # Spinner present & new data arriving → scroll recovery to
            # re-trigger the intersection observer.
            page.evaluate(self._SCROLL_TO_SECTION_TOP_JS)
            page.wait_for_timeout(1000)
            page.evaluate(self._SCROLL_AND_COUNT_JS)
            page.wait_for_timeout(1500)
