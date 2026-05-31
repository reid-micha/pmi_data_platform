"""Multi-index `score-all` job.

Pulls every `is_current=true` `CoreIndexDefinition` from the database and
runs one pipeline tick per index, sequentially. Sequential is intentional at
P0: pmi-core's pipeline opens its own `session_scope()` and the LLM stub is
deterministic, so there's no concurrency win to extract until M1 (real LLM
calls) lands. Parallelism is the P1 Arq job.
"""

from __future__ import annotations

import structlog
from sqlalchemy import select

from pmi_core.db import session_scope
from pmi_core.models import CoreIndexDefinition
from pmi_workers.jobs.score import score_index
from pmi_workers.registry import register

log = structlog.get_logger("pmi_workers.jobs.score_all")


async def _current_index_ids() -> list[str]:
    async with session_scope() as session:
        rows = (
            await session.execute(
                select(CoreIndexDefinition.index_id)
                .where(CoreIndexDefinition.is_current.is_(True))
                .order_by(CoreIndexDefinition.index_id)
            )
        ).scalars().all()
    return list(rows)


@register("score-all")
async def run() -> None:
    """Score every current index in registry order."""
    index_ids = await _current_index_ids()
    if not index_ids:
        log.warning("score_all.no_indexes")
        return

    log.info("score_all.start", count=len(index_ids), indexes=index_ids)
    failures: list[tuple[str, str]] = []
    for idx in index_ids:
        try:
            await score_index(idx)
        except Exception as exc:
            log.exception("score_all.index_failed", index_id=idx, error=str(exc))
            failures.append((idx, str(exc)))

    log.info(
        "score_all.done",
        succeeded=len(index_ids) - len(failures),
        failed=len(failures),
        failures=failures,
    )
    if failures:
        # Bubble up so supercronic logs it as non-zero exit.
        raise RuntimeError(f"{len(failures)}/{len(index_ids)} indexes failed: {failures}")
