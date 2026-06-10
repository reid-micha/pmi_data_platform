"""Coinbase prediction-markets Playwright scraper.

Ported from `micah/server/app/services/coinbase/` (2026-06-09). Two-phase:
GraphQL-intercept category scroll to discover event IDs, then per-event-page
extraction across worker threads. Emits `RawContract` batches that
`scrapers.persistence` writes into `core_markets` + `ts_price_snapshots`.
"""

from __future__ import annotations

from pmi_ingest.scrapers.coinbase.job import CoinbaseScrapeJob
from pmi_ingest.scrapers.coinbase.scraper import CoinbaseScraper
from pmi_ingest.scrapers.coinbase.types import (
    EventContract,
    EventPageResult,
    RawContract,
)

__all__ = [
    "CoinbaseScrapeJob",
    "CoinbaseScraper",
    "EventContract",
    "EventPageResult",
    "RawContract",
]
