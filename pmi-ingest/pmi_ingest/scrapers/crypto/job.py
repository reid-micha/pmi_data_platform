"""Crypto.com scrape job. Mirrors `robinhood/job.py` shape — see there for design notes."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import structlog

from pmi_ingest.config import ingest_settings
from pmi_ingest.scrapers.crypto.scraper import CryptoScraper
from pmi_ingest.scrapers.crypto.types import RawContract
from pmi_ingest.scrapers.persistence import (
    ScrapedMarket,
    persist_batch,
    record_audit_in_scrape_context,
)

log = structlog.get_logger(__name__)

SOURCE = "crypto-scrape"


def _to_scraped(raw: RawContract) -> ScrapedMarket | None:
    # Closed-without-probability rows still useful: surface the closed state
    # to core_markets so the aggregator can filter them out. Live rows
    # without probability are noise — skip.
    if raw.probability is None and not raw.is_closed:
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
        venue="crypto",
        external_id=raw.slug,
        slug=raw.slug,
        title=raw.title,
        probability=raw.probability,
        # Crypto.com does not expose volume in scraped output (legacy code
        # explicitly stamped volume=None) — leave NULL.
        volume=None,
        close_date=close_date,
        url=raw.url,
        category=raw.category,
        is_closed=raw.is_closed,
    )


class CryptoScrapeJob:
    name = SOURCE

    def run_once(self) -> int:
        if not ingest_settings.crypto_enabled:
            log.info("crypto.disabled", message="set CRYPTO_ENABLED=true to enable")
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
            with CryptoScraper() as scraper:
                for raw_batch in scraper.scrape_all():
                    specs = [s for s in (_to_scraped(r) for r in raw_batch) if s is not None]
                    written = persist_batch(specs)
                    total_written += written
                    log.info(
                        "crypto.batch_persisted",
                        batch_size=len(specs),
                        running_total=total_written,
                    )
        except Exception as exc:
            success = False
            error_message = f"{type(exc).__name__}: {exc}"[:512]
            log.error("crypto.scrape_failed", error=error_message)
        finally:
            asyncio.run(
                record_audit_in_scrape_context(
                    source=SOURCE,
                    started=started,
                    success=success,
                    records=total_written,
                    error_class=None if success else "CryptoScrapeFailure",
                    error_message=error_message,
                )
            )

        log.info(
            "crypto.scrape_done",
            success=success,
            records=total_written,
            duration_ms=int((datetime.now(UTC) - started).total_seconds() * 1000),
        )
        if not success and error_message:
            raise RuntimeError(error_message)
        return total_written
