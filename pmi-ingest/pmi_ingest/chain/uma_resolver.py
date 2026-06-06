"""UMA dispute / settle projector (CORR-4.4).

Reads `audit_chain_events` rows produced by the Polygon indexer for kinds
{`uma_propose`, `uma_dispute`, `uma_settle`, `uma_question_resolved`} and
projects the latest per-market state onto two columns:

    core_markets.chain_resolution      — the projected enum below
    core_markets.chain_resolution_at   — block_time of the state-setting event

The projected enum (separate from the existing `core_markets.resolution`
column which mirrors the Polymarket Gamma display field):

    UMA_PROPOSED         — proposer posted a price, no dispute yet
    UMA_DISPUTED         — disputer challenged; awaits DVM vote
    UMA_SETTLED_YES      — settled with payout favoring YES outcome (price ≈ 1)
    UMA_SETTLED_NO       — settled with payout favoring NO outcome (price ≈ 0)
    UMA_SETTLED_INVALID  — settled at 0.5 / split outcome (UMA edge case)

Why this matters
----------------
The display-side `resolution` flips when Polymarket UI marks the market as
resolved, but UMA can be in dispute for days; users / quants need to see the
*chain* truth so disputed markets don't poison aggregation. Aggregator can
filter `WHERE chain_resolution NOT IN ('UMA_DISPUTED', 'UMA_PROPOSED')`
once weighting is wired (CORR-3.4).

Mapping path: question_id → condition_id → core_markets
-------------------------------------------------------
* UMA OO events carry `identifier + ancillaryData` (UMA's "question" key).
  Polymarket's adapter contract translates that to a CTF `questionId`.
* The CTF `ConditionPreparation` event ties that questionId to a conditionId.
* `core_markets.condition_id` is the join key.

This module reads the events directly via SQL (no chain calls), so it works
even when the indexer is off — provided someone has populated audit_chain_events
already. A Gamma-only fallback path (`gamma_only=True`) reads
`raw->umaResolutionStatuses` from `core_markets.raw` for environments where
the indexer hasn't been wired up yet.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy import select, text, update

from pmi_core.db import session_scope
from pmi_core.models import CoreMarket
from pmi_ingest.config import ingest_settings
from pmi_ingest.health import record_poll

log = structlog.get_logger(__name__)

SOURCE = "polymarket-uma"


def _settle_label(price: int) -> str:
    """UMA settles a binary YES/NO at price=1e18 (YES) / 0 (NO) / 0.5e18 (split).

    `price` arrives as a signed integer; we compare magnitudes in 1e18 fixed
    point. Anything above 0.75 → YES, below 0.25 → NO, otherwise INVALID.
    """
    one_e18 = 10**18
    if price >= int(0.75 * one_e18):
        return "UMA_SETTLED_YES"
    if price <= int(0.25 * one_e18):
        return "UMA_SETTLED_NO"
    return "UMA_SETTLED_INVALID"


# Latest event per (question_id), joined with current condition_id mapping.
# The CTE picks the highest (block_number, log_index) per question to pin the
# "current" UMA state, then maps question → condition via ConditionPreparation,
# then condition → market via core_markets.condition_id.
PROJECT_FROM_CHAIN_SQL = text(
    """
    WITH ranked AS (
        SELECT
            event_kind,
            data,
            block_time,
            block_number,
            log_index,
            COALESCE(
                data->>'questionID',     -- adapter QuestionResolved
                data->>'identifier'      -- UMA OO ProposePrice/DisputePrice/Settle
            ) AS question_key
        FROM audit_chain_events
        WHERE event_kind IN ('uma_propose', 'uma_dispute', 'uma_settle', 'uma_question_resolved')
    ),
    latest AS (
        SELECT DISTINCT ON (question_key)
            event_kind, data, block_time, block_number, log_index, question_key
        FROM ranked
        WHERE question_key IS NOT NULL
        ORDER BY question_key, block_number DESC, log_index DESC
    ),
    -- condition-id lookup via the ConditionPreparation event (questionId ↔ conditionId)
    condition_map AS (
        SELECT DISTINCT ON (data->>'questionId')
            data->>'questionId' AS question_id,
            data->>'conditionId' AS condition_id
        FROM audit_chain_events
        WHERE event_kind = 'condition_prepared'
        ORDER BY data->>'questionId', block_number DESC
    )
    SELECT
        l.event_kind,
        l.data,
        l.block_time,
        l.question_key,
        cm.condition_id
    FROM latest l
    LEFT JOIN condition_map cm ON cm.question_id = l.question_key
    """
)


def _project_label(event_kind: str, data: dict[str, Any]) -> str:
    if event_kind == "uma_propose":
        return "UMA_PROPOSED"
    if event_kind == "uma_dispute":
        return "UMA_DISPUTED"
    if event_kind == "uma_settle":
        try:
            return _settle_label(int(data.get("price", "0")))
        except (TypeError, ValueError):
            return "UMA_SETTLED_INVALID"
    if event_kind == "uma_question_resolved":
        try:
            return _settle_label(int(data.get("settledPrice", "0")))
        except (TypeError, ValueError):
            return "UMA_SETTLED_INVALID"
    return ""


async def _project_from_chain() -> int:
    """Walk latest UMA events from audit_chain_events → core_markets."""
    updated = 0
    async with session_scope() as session:
        rows = (await session.execute(PROJECT_FROM_CHAIN_SQL)).all()
        for event_kind, data, block_time, question_key, condition_id in rows:
            label = _project_label(event_kind, data or {})
            if not label or not condition_id:
                continue
            # Match by condition_id. (Could match by questionId on
            # core_markets.raw->'questionID' as fallback, but condition_id
            # is the column we keep first-class.)
            stmt = (
                update(CoreMarket)
                .where(CoreMarket.condition_id == condition_id)
                .values(
                    chain_resolution=label,
                    chain_resolution_at=block_time,
                )
            )
            result = await session.execute(stmt)
            updated += result.rowcount or 0
    return updated


# Gamma fallback: Polymarket's REST `/markets` payload includes the field
# `umaResolutionStatuses` (sometimes `umaResolutionStatus`) which we stash
# verbatim under `core_markets.raw`. Until the chain indexer is wired up,
# this is the only signal we have.
# `core_markets.raw` is the legacy JSON type (not JSONB) so the `?` containment
# operator is unavailable. Cast to JSONB inline only where it's safe — the
# table size at P0 (<100k rows) makes the cost negligible. The `IS NOT NULL`
# guards filter to candidates before the cast.
GAMMA_FALLBACK_SQL = text(
    """
    SELECT id,
           raw->'umaResolutionStatuses'  AS statuses_array,
           raw->>'umaResolutionStatus'   AS status_scalar
    FROM core_markets
    WHERE venue = 'polymarket'
      AND chain_resolution IS NULL
      AND (
        raw->'umaResolutionStatuses'  IS NOT NULL
        OR raw->>'umaResolutionStatus' IS NOT NULL
      )
    """
)


def _gamma_label(status: str | None) -> str | None:
    """Polymarket Gamma's stringly status → our enum.

    Observed values: 'proposed', 'disputed', 'settled', 'resolved'. The
    settled label doesn't tell us YES vs NO — that signal needs the on-chain
    Settle event price. Fallback path can only land on 'UMA_PROPOSED' /
    'UMA_DISPUTED'; settled/resolved we leave NULL so the chain projection
    fills it in later.
    """
    if not status:
        return None
    s = status.strip().lower()
    if s == "proposed":
        return "UMA_PROPOSED"
    if s == "disputed":
        return "UMA_DISPUTED"
    return None


async def _project_from_gamma() -> int:
    """Best-effort projection when the chain indexer hasn't been run yet."""
    updated = 0
    async with session_scope() as session:
        rows = (await session.execute(GAMMA_FALLBACK_SQL)).all()
        now = datetime.now(UTC)
        for market_id, statuses_array, status_scalar in rows:
            # Some markets carry an array of {outcomeIndex, status} dicts;
            # take the first non-null status. Others carry a flat string.
            label: str | None = None
            if isinstance(statuses_array, list):
                for entry in statuses_array:
                    if isinstance(entry, dict):
                        candidate = _gamma_label(entry.get("status"))
                        if candidate:
                            label = candidate
                            break
            if not label and status_scalar:
                label = _gamma_label(status_scalar)
            if not label:
                continue
            await session.execute(
                update(CoreMarket)
                .where(CoreMarket.id == market_id)
                .values(chain_resolution=label, chain_resolution_at=now)
            )
            updated += 1
    return updated


async def run_uma_projection(*, gamma_only: bool = False) -> int:
    """Project UMA state onto core_markets.

    `gamma_only=True` skips the chain projection; useful when the indexer
    isn't wired up. The two passes are independent — running both in the
    same cycle is safe (chain overrides Gamma since it runs second).
    """
    started = datetime.now(UTC)
    total = 0
    success = True
    error_message: str | None = None

    try:
        if gamma_only:
            total = await _project_from_gamma()
        else:
            # Gamma first, chain second — chain wins on any market that has
            # both signals because it has the YES/NO settled distinction.
            total = await _project_from_gamma()
            total += await _project_from_chain()
        log.info("polymarket.uma.projection", updated=total, gamma_only=gamma_only)
    except Exception as exc:
        success = False
        error_message = f"{type(exc).__name__}: {exc}"[:512]
        log.error("polymarket.uma.failed", error=error_message)
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
                error_class=None if success else "UmaProjectionFailure",
                error_message=error_message,
                expected_records_24h=None,
            )

    if not success and error_message:
        raise RuntimeError(error_message)
    return total
