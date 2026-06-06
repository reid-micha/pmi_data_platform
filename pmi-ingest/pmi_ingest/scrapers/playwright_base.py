"""Shared Chromium lifecycle + rate-limited navigation for Playwright scrapers.

Ported from `micah/server/app/services/playwright_base.py` (2026-06-01).
Subclasses configure via class attrs (`_EXTRA_LAUNCH_ARGS`,
`_BLOCK_RESOURCES`) and inherit:
* `__enter__` / `__exit__` browser lifecycle
* `_new_page()` with stealth init script + viewport + UA
* `_goto_with_retry()` with exponential back-off on 429 / 5xx
"""

from __future__ import annotations

import random
import time
from typing import Any, TypeVar

from pmi_ingest.config import ingest_settings
from pmi_ingest.scrapers.scripts import load_js

_T = TypeVar("_T", bound="PlaywrightScraper")

_BASE_LAUNCH_ARGS = [
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
]
_RESOURCE_BLOCK_PATTERN = (
    "**/*.{png,jpg,jpeg,gif,svg,webp,ico,woff,woff2,ttf,otf,eot,mp4,webm}"
)
_STEALTH_SCRIPT = load_js("base/stealth.js")


class PlaywrightScraper:
    _EXTRA_LAUNCH_ARGS: list[str] = []
    _BLOCK_RESOURCES: bool = False

    def __init__(self) -> None:
        self._playwright: Any = None
        self._browser: Any = None
        self._nav_count: int = 0

    def _launch_browser(self) -> None:
        from playwright.sync_api import sync_playwright

        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(
            headless=ingest_settings.playwright_headless,
            args=[*_BASE_LAUNCH_ARGS, *self._EXTRA_LAUNCH_ARGS],
        )

    def _new_page(self) -> Any:
        context = self._browser.new_context(
            viewport={
                "width": ingest_settings.playwright_viewport_width,
                "height": ingest_settings.playwright_viewport_height,
            },
            user_agent=ingest_settings.playwright_user_agent,
            locale="en-US",
            timezone_id="America/New_York",
        )
        page = context.new_page()
        if self._BLOCK_RESOURCES:
            page.route(_RESOURCE_BLOCK_PATTERN, lambda route: route.abort())
        page.add_init_script(_STEALTH_SCRIPT)
        page.set_default_navigation_timeout(
            ingest_settings.playwright_navigation_timeout_ms
        )
        return page

    def _recover_page(self, old_page: Any) -> Any:
        try:
            old_page.context.close()
        except Exception:
            pass
        return self._new_page()

    def _goto_with_retry(
        self, page: Any, url: str, *, label: str = ""
    ) -> tuple[Any, int]:
        """Navigate with pacing + retry. Returns `(page, status)`; -1 on failure."""
        for attempt in range(ingest_settings.playwright_retry_max):
            if self._nav_count > 0 or attempt > 0:
                delay = ingest_settings.playwright_nav_delay_sec
                if attempt > 0:
                    delay = ingest_settings.playwright_retry_backoff_sec * (
                        2 ** (attempt - 1)
                    )
                    delay += random.uniform(0, 2.0)
                time.sleep(delay)

            try:
                response = page.goto(url, wait_until="domcontentloaded")
                status = response.status if response else -1
                self._nav_count += 1

                if status == 429:
                    cooldown = ingest_settings.playwright_retry_backoff_sec
                    print(
                        f"    {label}: HTTP 429 — waiting {cooldown:.0f}s "
                        f"(attempt {attempt + 1}/{ingest_settings.playwright_retry_max})",
                        flush=True,
                    )
                    time.sleep(cooldown)
                    page = self._recover_page(page)
                    continue
                if status >= 500:
                    print(
                        f"    {label}: HTTP {status} — retrying "
                        f"(attempt {attempt + 1}/{ingest_settings.playwright_retry_max})",
                        flush=True,
                    )
                    continue
                return page, status
            except Exception as exc:
                print(
                    f"    {label}: navigation error — {exc} "
                    f"(attempt {attempt + 1}/{ingest_settings.playwright_retry_max})",
                    flush=True,
                )
                page = self._recover_page(page)

        print(
            f"    {label}: FAILED after {ingest_settings.playwright_retry_max} attempts",
            flush=True,
        )
        return page, -1

    def close(self) -> None:
        if self._browser:
            self._browser.close()
            self._browser = None
        if self._playwright:
            self._playwright.stop()
            self._playwright = None

    def __enter__(self: _T) -> _T:
        self._launch_browser()
        return self

    def __exit__(self, *args: object) -> None:
        self.close()
