"""Metaculus REST + RSC poller.

Ported from [`micah/server/app/sources/metaculus.py`](../../../micah/server/app/sources/metaculus.py),
adapted to write into the pmi-core schema instead of Micah's NormalizedContract.

Hybrid fetch (same as legacy)
-----------------------------
* **REST** `https://www.metaculus.com/api2/questions/?limit=100&type=forecast` —
  paginated, returns question metadata (id, title, status, close date,
  forecaster count). Requires `METACULUS_API_TOKEN` since 2025 (Metaculus
  hides this endpoint behind auth even though the underlying questions
  are public on the website).
* **RSC** `https://www.metaculus.com/questions/{qid}/?_rsc=1` — no auth.
  The Next.js React Server Component payload embeds the community
  prediction probability; we regex it out per question in parallel.

Why play-money belongs in core_markets anyway
---------------------------------------------
CLAUDE.md §4.5.4 originally listed Metaculus as "deliberately deferred"
(play-money, no orderbook depth). Reid 2026-06-01 reopened it — community
probability is a useful Tier-2 reference signal for cross-source PMI
sanity-checks, and the schema cost is zero (just another `venue='metaculus'`
row). We persist:
* `core_markets.venue='metaculus'`, `external_id='<question_id>'`
* `ts_price_snapshots.last_price = community probability (0..1)`
* `ts_price_snapshots.volume_24h = forecaster_count` (proxy — Metaculus
  has no monetary volume; forecaster count is the closest signal of
  "how many forecasters contributed to this CP").

Auth header
-----------
Token-style: `Authorization: Token <api_token>` (NOT `Bearer`). If unset
we still try the REST call and surface the 403 cleanly in audit_source_health.
"""

from __future__ import annotations

import asyncio
import re
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

VENUE = "metaculus"
SOURCE = "metaculus-rest"

REST_BASE = "https://www.metaculus.com"
QUESTIONS_PATH = "/api2/questions/"

# RSC extraction regex from the legacy implementation. The Metaculus React
# Server Component payload embeds question data as JSON within React component
# lines; the "centers" array under "latest" holds the community prediction's
# point estimate (median of the latest CP distribution).
_LATEST_CENTERS_RE: re.Pattern[str] = re.compile(
    r'"latest":\{.*?"centers":\[([0-9.]+)\]', re.DOTALL
)


def _parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        if isinstance(value, datetime):
            return value
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


async def _fetch_rsc_probability(
    client: httpx.AsyncClient, qid: int | str
) -> float | None:
    """Fetch the community prediction for one question via its RSC endpoint."""
    headers = {
        "Accept": "text/x-component",
        "RSC": "1",
        "Next-Url": f"/questions/{qid}/",
        "User-Agent": ingest_settings.metaculus_user_agent,
    }
    try:
        resp = await client.get(
            f"/questions/{qid}/", params={"_rsc": "1"}, headers=headers, timeout=10.0
        )
        if resp.status_code != 200:
            return None
        body = resp.text
        match = _LATEST_CENTERS_RE.search(body)
        return float(match.group(1)) if match else None
    except Exception:
        return None


async def _fetch_questions_page(
    client: httpx.AsyncClient, offset: int, limit: int
) -> dict[str, Any]:
    """Fetch one page of Metaculus questions. Retries transient network errors."""
    params: dict[str, str] = {
        "limit": str(limit),
        "type": "forecast",
        "offset": str(offset),
    }
    headers: dict[str, str] = {}
    if ingest_settings.metaculus_api_token:
        # Metaculus uses `Token <token>`, NOT `Bearer <token>`.
        headers["Authorization"] = f"Token {ingest_settings.metaculus_api_token}"

    async for attempt in AsyncRetrying(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=8),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
        reraise=True,
    ):
        with attempt:
            resp = await client.get(QUESTIONS_PATH, params=params, headers=headers, timeout=15.0)
            resp.raise_for_status()
            data = resp.json()
            return data if isinstance(data, dict) else {}
    return {}  # unreachable


async def _upsert_market(
    session: AsyncSession, question: dict[str, Any]
) -> CoreMarket:
    """Atomic upsert. Mirrors polymarket_rest pattern, but for Metaculus."""
    qid = question.get("id")
    if qid is None:
        raise ValueError(f"metaculus question missing id: keys={list(question)[:6]}")
    external_id = str(qid)

    title = str(question.get("title") or "(untitled)")
    description = question.get("description") or question.get("resolution_criteria")
    category = None  # Metaculus has `categories[]` — flat list, pick first.
    cats = question.get("categories") or []
    if cats and isinstance(cats, list) and isinstance(cats[0], dict):
        category = cats[0].get("name") or cats[0].get("slug")
    tags = [c.get("slug") or c.get("name") for c in cats if isinstance(c, dict)] or None

    opens_at = _parse_dt(question.get("publish_time") or question.get("created_time"))
    closes_at = _parse_dt(
        question.get("close_time")
        or question.get("scheduled_close_time")
        or question.get("resolve_time")
    )
    resolved_at = _parse_dt(question.get("resolve_time")) if (
        question.get("status") or ""
    ).lower() == "resolved" else None

    status = (question.get("status") or "").lower()
    # Metaculus status values: "open", "closed", "resolved", "pending".
    # Anything non-open means trading-equivalent stopped.
    is_resolved = bool(status) and status not in ("open", "pending")
    resolution: str | None = None
    if is_resolved:
        # Metaculus encodes binary outcomes as resolution=1/0 or as a string.
        r = question.get("resolution")
        if r in (1, "1", "yes", "YES", True):
            resolution = "YES"
        elif r in (0, "0", "no", "NO", False):
            resolution = "NO"
        else:
            resolution = status.upper()[:32]

    stmt = pg_insert(CoreMarket).values(
        venue=VENUE,
        external_id=external_id,
        slug=external_id,
        title=title,
        description=description,
        category=category,
        tags=tags,
        opens_at=opens_at,
        closes_at=closes_at,
        resolved_at=resolved_at,
        resolution=resolution,
        raw=question,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["venue", "external_id"],
        set_={
            "slug": stmt.excluded.slug,
            "title": stmt.excluded.title,
            "description": stmt.excluded.description,
            "category": stmt.excluded.category,
            "tags": stmt.excluded.tags,
            "opens_at": stmt.excluded.opens_at,
            "closes_at": stmt.excluded.closes_at,
            "resolved_at": stmt.excluded.resolved_at,
            "resolution": stmt.excluded.resolution,
            "raw": stmt.excluded.raw,
            "updated_at": datetime.now(UTC),
        },
    ).returning(CoreMarket.id)
    market_id = (await session.execute(stmt)).scalar_one()

    stub = CoreMarket()
    stub.id = market_id
    stub.venue = VENUE
    stub.external_id = external_id
    return stub


async def _write_price(
    session: AsyncSession,
    market: CoreMarket,
    probability: float | None,
    question: dict[str, Any],
) -> bool:
    """Append a ts_price_snapshots row with the community prediction.

    Metaculus has no bid/ask/orderbook — we record `last_price` only.
    `volume_24h` is repurposed to carry `nr_forecasters` (a proxy for
    "engagement" — there's no monetary volume on play-money platforms).
    """
    if probability is None:
        return False
    forecaster_count = _parse_float(question.get("nr_forecasters"))
    session.add(
        TsPriceSnapshot(
            market_id=market.id,
            snapshot_at=datetime.now(UTC),
            last_price=probability,
            volume_24h=forecaster_count,
        )
    )
    return True


async def _fetch_probabilities(
    client: httpx.AsyncClient, qids: list[int | str], concurrency: int
) -> dict[int | str, float | None]:
    """Concurrent RSC fetch for a page of question IDs."""
    sem = asyncio.Semaphore(concurrency)

    async def _one(qid: int | str) -> tuple[int | str, float | None]:
        async with sem:
            prob = await _fetch_rsc_probability(client, qid)
        return qid, prob

    results = await asyncio.gather(*(_one(q) for q in qids), return_exceptions=False)
    return dict(results)


class MetaculusRestPoller:
    """Implements `pmi_ingest.pollers.Poller` for Metaculus."""

    name = SOURCE

    def __init__(self) -> None:
        self._base_url = REST_BASE
        self._page_size = ingest_settings.metaculus_page_size
        self._max_pages = ingest_settings.metaculus_max_pages
        self._rsc_concurrency = ingest_settings.metaculus_rsc_concurrency

    async def run_once(self) -> int:
        started = datetime.now(UTC)
        total = 0
        success = True
        error_class: str | None = None
        error_message: str | None = None

        log.info(
            "metaculus.poll_start",
            authenticated=bool(ingest_settings.metaculus_api_token),
            base_url=self._base_url,
        )
        if not ingest_settings.metaculus_api_token:
            log.warning(
                "metaculus.no_token",
                message=(
                    "METACULUS_API_TOKEN not set — list API requires auth since 2025; "
                    "expect 403."
                ),
            )

        try:
            async with httpx.AsyncClient(
                base_url=self._base_url, follow_redirects=True
            ) as client:
                offset = 0
                page = 0
                while page < self._max_pages:
                    data = await _fetch_questions_page(client, offset, self._page_size)
                    results = data.get("results") or []
                    if not results:
                        if offset == 0:
                            log.warning(
                                "metaculus.empty_first_page",
                                message="likely 403 / auth failure — see metaculus_api_token",
                            )
                        break

                    qids = [q["id"] for q in results if "id" in q]
                    probs = await _fetch_probabilities(
                        client, qids, self._rsc_concurrency
                    )

                    async with session_scope() as session:
                        for q in results:
                            try:
                                market = await _upsert_market(session, q)
                                prob = probs.get(q.get("id"))
                                await _write_price(session, market, prob, q)
                                total += 1
                            except Exception as inner:
                                log.warning(
                                    "metaculus.market_skip",
                                    error=str(inner),
                                    qid=q.get("id"),
                                )

                    next_url = data.get("next")
                    if not next_url:
                        break
                    offset += self._page_size
                    page += 1
        except Exception as exc:
            success = False
            error_class = type(exc).__name__
            error_message = str(exc)[:512]
            log.error("metaculus.poll_failed", error=error_message)
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
            "metaculus.poll_done",
            success=success,
            records=total,
            duration_ms=int((datetime.now(UTC) - started).total_seconds() * 1000),
        )
        if not success and error_message:
            raise RuntimeError(error_message)
        return total
