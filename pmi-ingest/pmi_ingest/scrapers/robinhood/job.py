"""Robinhood scrape job — wraps `RobinhoodScraper` with our persistence + audit.

Run via CLI: `pmi-ingest robinhood-scrape` (one cycle then exit).
Set `ROBINHOOD_ENABLED=true` first.

Output path
-----------
For each scraped `RawContract` we write:
* `core_markets` venue='robinhood', external_id=slug, slug=slug, title, category, closes_at
* `ts_price_snapshots` with last_price = yes_price (0..1)

The scrape uses Playwright (sync), so the persistence wrapper marshals
each batch into the async DB layer via `persist_batch` (see
`pmi_ingest/scrapers/persistence.py`).
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import structlog

from pmi_ingest.config import ingest_settings
from pmi_ingest.scrapers.persistence import (
    ScrapedMarket,
    persist_batch,
    record_audit_in_scrape_context,
)
from pmi_ingest.scrapers.robinhood.scraper import RobinhoodScraper
from pmi_ingest.scrapers.robinhood.types import RawContract

log = structlog.get_logger(__name__)

SOURCE = "robinhood-scrape"


def _to_scraped(raw: RawContract) -> ScrapedMarket | None:
    if raw.yes_price is None:
        return None
    close_date: datetime | None = None
    if raw.close_date:
        try:
            close_date = datetime.fromisoformat(raw.close_date)
            if close_date.tzinfo is None:
                close_date = close_date.replace(tzinfo=UTC)
        except ValueError:
            close_date = None
    return ScrapedMarket(
        venue="robinhood",
        external_id=raw.slug,
        slug=raw.slug,
        title=raw.title,
        probability=raw.yes_price,
        volume=float(raw.volume) if raw.volume is not None else None,
        close_date=close_date,
        url=raw.url,
        category=raw.category,
    )


class RobinhoodScrapeJob:
    """One-shot scrape job. CLI invokes `run_once()` once per cron beat."""

    name = SOURCE

    def run_once(self) -> int:
        if not ingest_settings.robinhood_enabled:
            log.info("robinhood.disabled", message="set ROBINHOOD_ENABLED=true to enable")
            asyncio.run(
                record_audit_in_scrape_context(
                    source=SOURCE,
                    started=datetime.now(UTC),
                    success=True,
                    records=0,
                )
            )
            return 0

        started = datetime.now(UTC)
        total_written = 0
        success = True
        error_message: str | None = None

        try:
            with RobinhoodScraper() as scraper:
                for raw_batch in scraper.scrape_all():
                    specs = [s for s in (_to_scraped(r) for r in raw_batch) if s is not None]
                    written = persist_batch(specs)
                    total_written += written
                    log.info(
                        "robinhood.batch_persisted",
                        batch_size=len(specs),
                        running_total=total_written,
                    )
        except Exception as exc:
            success = False
            error_message = f"{type(exc).__name__}: {exc}"[:512]
            log.error("robinhood.scrape_failed", error=error_message)
        finally:
            asyncio.run(
                record_audit_in_scrape_context(
                    source=SOURCE,
                    started=started,
                    success=success,
                    records=total_written,
                    error_class=None if success else "RobinhoodScrapeFailure",
                    error_message=error_message,
                )
            )

        log.info(
            "robinhood.scrape_done",
            success=success,
            records=total_written,
            duration_ms=int((datetime.now(UTC) - started).total_seconds() * 1000),
        )
        if not success and error_message:
            raise RuntimeError(error_message)
        return total_written
