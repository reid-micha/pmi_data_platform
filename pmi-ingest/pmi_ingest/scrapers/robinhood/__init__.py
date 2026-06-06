"""Robinhood prediction-markets scraper.

Ported verbatim from `micah/server/app/services/robinhood/` (2026-06-01),
swap import roots: `app.services.*` → `pmi_ingest.scrapers.*`,
`app.config.settings` → `pmi_ingest.config.ingest_settings`.

Entry point for callers: `RobinhoodScrapeJob` in `job.py` (writes into
`core_markets` / `ts_price_snapshots`). Pure scraper output lives in
`scraper.py` for re-use / debugging.
"""

from .job import RobinhoodScrapeJob
from .scraper import RobinhoodScraper
from .types import RawContract

__all__ = ["RawContract", "RobinhoodScraper", "RobinhoodScrapeJob"]
