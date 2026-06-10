"""Coinbase scrape job. Mirrors `crypto/job.py` / `robinhood/job.py` shape."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import structlog

from pmi_ingest.config import ingest_settings
from pmi_ingest.scrapers.coinbase.scraper import CoinbaseScraper
from pmi_ingest.scrapers.coinbase.types import RawContract
from pmi_ingest.scrapers.persistence import (
    ScrapedMarket,
    persist_batch,
    record_audit_in_scrape_context,
)

log = structlog.get_logger(__name__)

SOURCE = "coinbase-scrape"


def _to_scraped(raw: RawContract) -> ScrapedMarket | None:
    # The Coinbase scraper only yields contracts that passed the Phase-2
    # volume gate; a row with no probability is noise — skip it.
    if raw.yes_price is None:
        return None
    close_date: datetime | None = None
    if raw.close_date:
        try:
            # Scraper normalizes expiry to "YYYY-MM-DD".
            close_date = datetime.fromisoformat(raw.close_date)
            if close_date.tzinfo is None:
                close_date = close_date.replace(tzinfo=UTC)
        except ValueError:
            close_date = None
    return ScrapedMarket(
        venue="coinbase",
        external_id=raw.slug,
        slug=raw.slug,
        title=raw.title,
        probability=raw.yes_price,
        volume=float(raw.volume) if raw.volume is not None else None,
        close_date=close_date,
        url=raw.url,
        category=raw.category,
        is_closed=False,
    )


class CoinbaseScrapeJob:
    name = SOURCE

    def run_once(self) -> int:
        if not ingest_settings.coinbase_enabled:
            log.info("coinbase.disabled", message="set COINBASE_ENABLED=true to enable")
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
            with CoinbaseScraper() as scraper:
                for raw_batch in scraper.scrape_all():
                    specs = [s for s in (_to_scraped(r) for r in raw_batch) if s is not None]
                    written = persist_batch(specs)
                    total_written += written
                    log.info(
                        "coinbase.batch_persisted",
                        batch_size=len(specs),
                        running_total=total_written,
                    )
        except Exception as exc:
            success = False
            error_message = f"{type(exc).__name__}: {exc}"[:512]
            log.error("coinbase.scrape_failed", error=error_message)
        finally:
            asyncio.run(
                record_audit_in_scrape_context(
                    source=SOURCE,
                    started=started,
                    success=success,
                    records=total_written,
                    error_class=None if success else "CoinbaseScrapeFailure",
                    error_message=error_message,
                )
            )

        log.info(
            "coinbase.scrape_done",
            success=success,
            records=total_written,
            duration_ms=int((datetime.now(UTC) - started).total_seconds() * 1000),
        )
        if not success and error_message:
            raise RuntimeError(error_message)
        return total_written
