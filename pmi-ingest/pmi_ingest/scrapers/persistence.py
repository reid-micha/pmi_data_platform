"""Shared persistence helpers for Playwright scrapers.

Both Robinhood and Crypto.com scrapers yield raw contract dicts (slug,
title, price, ...). This module owns the translation into the
`core_markets` + `ts_price_snapshots` write pattern, mirroring the
async helpers in `pollers/polymarket_rest.py` and `pollers/kalshi_rest.py`
but exposed as **sync** functions because Playwright sync_api is sync.

We wrap the async session_scope in `asyncio.run()` per scrape batch so
the caller stays in plain sync code. Batch size is intentionally small
(the scraper yields ~50 markets per scroll) so the run() startup cost
is bounded.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from pmi_core.db import session_scope
from pmi_core.models import CoreMarket, TsPriceSnapshot

log = structlog.get_logger(__name__)


@dataclass
class ScrapedMarket:
    """Normalized scraper output. Both Robinhood and Crypto.com map into this."""

    venue: str
    external_id: str
    slug: str | None
    title: str
    probability: float | None
    volume: float | None = None
    close_date: datetime | None = None
    url: str | None = None
    category: str | None = None
    description: str | None = None
    is_closed: bool = False
    raw: dict[str, Any] | None = None


async def _upsert_one(session: AsyncSession, m: ScrapedMarket) -> CoreMarket:
    resolution: str | None = "RESOLVED" if m.is_closed else None
    stmt = pg_insert(CoreMarket).values(
        venue=m.venue,
        external_id=m.external_id,
        slug=m.slug or m.external_id,
        title=m.title or "(untitled)",
        description=m.description,
        category=m.category,
        tags=None,
        opens_at=None,
        closes_at=m.close_date,
        resolved_at=m.close_date if m.is_closed else None,
        resolution=resolution,
        raw=m.raw or {"url": m.url} if m.url else m.raw,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["venue", "external_id"],
        set_={
            "slug": stmt.excluded.slug,
            "title": stmt.excluded.title,
            "description": stmt.excluded.description,
            "category": stmt.excluded.category,
            "closes_at": stmt.excluded.closes_at,
            "resolved_at": stmt.excluded.resolved_at,
            "resolution": stmt.excluded.resolution,
            "raw": stmt.excluded.raw,
            "updated_at": datetime.now(UTC),
        },
    ).returning(CoreMarket.id)
    market_id = (await session.execute(stmt)).scalar_one()

    if m.probability is not None:
        session.add(
            TsPriceSnapshot(
                market_id=market_id,
                snapshot_at=datetime.now(UTC),
                last_price=m.probability,
                volume_24h=m.volume,
            )
        )
    stub = CoreMarket()
    stub.id = market_id
    stub.venue = m.venue
    stub.external_id = m.external_id
    return stub


async def _persist_batch_async(batch: list[ScrapedMarket]) -> int:
    if not batch:
        return 0
    # SQLAlchemy's async engine is a module-level singleton (pmi_core.db.engine);
    # asyncpg pins its connection pool to whichever event loop first opened it.
    # Each `asyncio.run()` here spawns a fresh loop, so the previous pool is
    # tied to a dead loop and any further use raises
    # `Future ... attached to a different loop`. Disposing forces a fresh pool
    # bound to the current loop. Cost is one TCP setup per scrape batch —
    # negligible vs. the Playwright nav cost.
    from pmi_core.db import engine

    await engine.dispose()
    written = 0
    async with session_scope() as session:
        for m in batch:
            # Per-row savepoint: when one row hits a DB constraint (bad
            # category len, weird unicode, etc.) PG marks the *outer*
            # transaction aborted — every subsequent INSERT in this session
            # then fails with `current transaction is aborted, commands
            # ignored until end of transaction block` and the loop's
            # try/except cascades. Wrapping each upsert in `begin_nested()`
            # rolls back the failed row to the savepoint without poisoning
            # the rest of the batch. Cost = one extra SAVEPOINT statement
            # per row; negligible at scraper batch sizes (~hundreds).
            try:
                async with session.begin_nested():
                    await _upsert_one(session, m)
                written += 1
            except Exception as inner:
                log.warning(
                    "scraper.persist_skip",
                    venue=m.venue,
                    external_id=m.external_id,
                    error=str(inner)[:200],
                )
    return written


async def record_audit_in_scrape_context(
    *,
    source: str,
    started: datetime,
    success: bool,
    records: int,
    error_class: str | None = None,
    error_message: str | None = None,
) -> None:
    """Audit-log writer for scraper jobs — same engine.dispose() concern.

    Scraper job.py modules call `asyncio.run(record_audit_in_scrape_context(...))`
    from their `finally:` block; without the dispose we'd hit the
    cross-loop-future error too.
    """
    from pmi_core.db import engine

    from pmi_ingest.health import record_poll

    await engine.dispose()
    async with session_scope() as session:
        await record_poll(
            session,
            source=source,
            started_at=started,
            finished_at=datetime.now(UTC),
            success=success,
            records=records if success else None,
            error_class=error_class,
            error_message=error_message,
            expected_records_24h=None,
        )


def persist_batch(batch: list[ScrapedMarket]) -> int:
    """Sync entry point — runs the async upsert in an event loop.

    Three relevant call shapes:
    * Plain sync caller (no loop in this thread): `asyncio.run()`.
    * Playwright sync_api active (Robinhood does parallel workers and yields
      from the main thread AFTER all workers closed → still falls through to
      the simple path).
    * Playwright sync_api yielding mid-greenlet (Crypto.com scraper does this
      — `scrape_all()` yields while the sync_playwright context is open in
      the same thread). `asyncio.run()` errors with "cannot be called from a
      running event loop"; fall back to running the upsert on a fresh worker
      thread with its own loop.
    """
    if not batch:
        return 0
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(_persist_batch_async(batch))

    # A loop is already active in this thread (Playwright greenlet). Bounce
    # to a worker thread that owns its own loop — cheaper than rearchitecting
    # the scraper to defer persistence past the `with` block.
    import threading

    result: list[int] = [0]
    error: list[BaseException | None] = [None]

    def _worker() -> None:
        try:
            result[0] = asyncio.run(_persist_batch_async(batch))
        except BaseException as exc:  # noqa: BLE001 — re-raised in main thread
            error[0] = exc

    t = threading.Thread(target=_worker, name="scraper-persist", daemon=False)
    t.start()
    t.join()
    if error[0] is not None:
        raise error[0]
    return result[0]
