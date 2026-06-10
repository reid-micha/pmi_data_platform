"""Manifold Markets REST poller.

Ported from [`micah/server/app/sources/manifold.py`](../../../micah/server/app/sources/manifold.py),
adapted to write into the pmi-core schema. Manifold paginates by `before=<id>`
cursor (the list endpoint returns a JSON *array*, not an object). Binary /
numeric markets map 1:1; `MULTIPLE_CHOICE` markets are expanded into one
`core_markets` row per answer via a per-market detail call.

Play-money note
---------------
Manifold is play-money — `probability` (0..1) is the signal, `volume` is
mana not USD. We persist `volume` into `volume_24h` as a relative engagement
proxy, same as the legacy normalizer carried it.

Mirrored titles
---------------
Manifold often mirrors questions from other platforms with a provenance tag
like "[Polymarket]" in the title; `_strip_source_prefix` removes it so the
selector keyword match isn't polluted.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx
import structlog
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from pmi_core.db import session_scope
from pmi_core.models import CoreMarket, TsPriceSnapshot
from pmi_ingest.config import ingest_settings
from pmi_ingest.health import record_poll

log = structlog.get_logger(__name__)

VENUE = "manifold"
SOURCE = "manifold-rest"

MARKETS_PATH = "/v0/markets"
MARKET_DETAIL_PATH = "/v0/market"

_SOURCE_TAGS = ("[metaculus]", "[kalshi]", "[polymarket]")


def _strip_source_prefix(title: str) -> str:
    t = (title or "").lstrip()
    lower = t.lower()
    for tag in _SOURCE_TAGS:
        if lower.startswith(tag):
            return t[len(tag) :].lstrip()
    return title or ""


def _parse_dt(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    try:
        if isinstance(value, datetime):
            return value
        if isinstance(value, (int, float)):
            ts = float(value)
            if ts > 1e12:  # Manifold closeTime is epoch ms
                ts /= 1000.0
            return datetime.fromtimestamp(ts, tz=UTC)
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def _parse_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


async def _get(client: httpx.AsyncClient, path: str, params: dict[str, str]) -> Any:
    async for attempt in AsyncRetrying(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=8),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
        reraise=True,
    ):
        with attempt:
            resp = await client.get(path, params=params, timeout=20.0)
            resp.raise_for_status()
            return resp.json()
    return None  # unreachable


def _build_rows(
    market: dict[str, Any], detail: dict[str, Any] | None
) -> list[tuple[str, dict[str, Any]]]:
    """Return [(external_id, fields)] — one per outcome contract.

    `fields` carries title / probability / closes_at / url / is_closed / raw.
    For non-MULTIPLE_CHOICE markets, a single row; otherwise one per answer.
    """
    market_id = str(market.get("id") or "")
    url = market.get("url")
    close_ts = market.get("closeTime")
    volume = market.get("volume")

    if market.get("outcomeType") == "MULTIPLE_CHOICE" and detail is not None:
        is_closed = bool(detail.get("isResolved"))
        question = _strip_source_prefix(detail.get("question", ""))
        rows: list[tuple[str, dict[str, Any]]] = []
        for answer in detail.get("answers") or []:
            prob = answer.get("probability")
            if prob is None:
                continue
            aid = str(answer.get("id") or "")
            rows.append(
                (
                    f"{market_id}:{aid}",
                    {
                        "title": f"{question} — {answer.get('text', '')}",
                        "probability": prob,
                        "closes_at": close_ts,
                        "url": url,
                        "is_closed": is_closed,
                        "volume": volume,
                        "raw": {"market": market, "answer": answer},
                    },
                )
            )
        return rows

    return [
        (
            market_id,
            {
                "title": _strip_source_prefix(market.get("question", "")),
                "probability": market.get("probability"),
                "closes_at": close_ts,
                "url": url,
                "is_closed": bool(market.get("isResolved")),
                "volume": volume,
                "raw": market,
            },
        )
    ]


async def _upsert_row(
    session: AsyncSession, external_id: str, fields: dict[str, Any]
) -> CoreMarket:
    if not external_id:
        raise ValueError("manifold row missing external_id")

    raw = fields["raw"]
    if isinstance(raw, dict) and fields.get("url"):
        raw = {**raw, "url": fields["url"]}

    stmt = pg_insert(CoreMarket).values(
        venue=VENUE,
        external_id=external_id,
        slug=external_id,
        title=(fields.get("title") or "(untitled)")[:1024],
        description=None,
        category=None,
        tags=None,
        opens_at=None,
        closes_at=_parse_dt(fields.get("closes_at")),
        resolved_at=None,
        resolution="CLOSED" if fields.get("is_closed") else None,
        raw=raw,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["venue", "external_id"],
        set_={
            "slug": stmt.excluded.slug,
            "title": stmt.excluded.title,
            "closes_at": stmt.excluded.closes_at,
            "resolution": stmt.excluded.resolution,
            "raw": stmt.excluded.raw,
            "updated_at": datetime.now(UTC),
        },
    ).returning(CoreMarket.id)
    mid = (await session.execute(stmt)).scalar_one()

    stub = CoreMarket()
    stub.id = mid
    stub.venue = VENUE
    stub.external_id = external_id
    return stub


async def _write_price(
    session: AsyncSession, market: CoreMarket, fields: dict[str, Any]
) -> bool:
    last = _parse_float(fields.get("probability"))
    volume = _parse_float(fields.get("volume"))
    if last is None and volume is None:
        return False
    session.add(
        TsPriceSnapshot(
            market_id=market.id,
            snapshot_at=datetime.now(UTC),
            last_price=last,
            volume_24h=volume,
        )
    )
    return True


class ManifoldRestPoller:
    """Implements `pmi_ingest.pollers.Poller` for Manifold."""

    name = SOURCE

    def __init__(self) -> None:
        self._base_url = ingest_settings.manifold_base_url
        self._page_size = ingest_settings.manifold_page_size
        self._max_pages = ingest_settings.manifold_max_pages

    async def run_once(self) -> int:
        started = datetime.now(UTC)
        total = 0
        success = True
        error_class: str | None = None
        error_message: str | None = None

        log.info("manifold.poll_start", base_url=self._base_url)
        try:
            async with httpx.AsyncClient(
                base_url=self._base_url, follow_redirects=True
            ) as client:
                before: str | None = None
                page = 0
                while page < self._max_pages:
                    params: dict[str, str] = {"limit": str(self._page_size)}
                    if before:
                        params["before"] = before
                    markets = await _get(client, MARKETS_PATH, params)
                    if not isinstance(markets, list) or not markets:
                        break

                    async with session_scope() as session:
                        for m in markets:
                            try:
                                detail = None
                                if m.get("outcomeType") == "MULTIPLE_CHOICE":
                                    detail = await _get(
                                        client,
                                        f"{MARKET_DETAIL_PATH}/{m.get('id', '')}",
                                        {},
                                    )
                                    if not isinstance(detail, dict):
                                        detail = m
                                for external_id, fields in _build_rows(m, detail):
                                    market = await _upsert_row(session, external_id, fields)
                                    await _write_price(session, market, fields)
                                    total += 1
                            except Exception as inner:
                                log.warning(
                                    "manifold.market_skip",
                                    error=str(inner),
                                    market_id=m.get("id"),
                                )

                    before = markets[-1].get("id")
                    if not before:
                        break
                    page += 1
        except Exception as exc:
            success = False
            error_class = type(exc).__name__
            error_message = str(exc)[:512]
            log.error("manifold.poll_failed", error=error_message)
        finally:
            finished = datetime.now(UTC)
            async with session_scope() as session:
                await record_poll(
                    session,
                    source=SOURCE,
                    started_at=started,
                    finished_at=finished,
                    success=success,
                    records=total if success else None,
                    error_class=error_class,
                    error_message=error_message,
                    expected_records_24h=None,
                )

        log.info(
            "manifold.poll_done",
            success=success,
            records=total,
            duration_ms=int((datetime.now(UTC) - started).total_seconds() * 1000),
        )
        if not success and error_message:
            raise RuntimeError(error_message)
        return total
