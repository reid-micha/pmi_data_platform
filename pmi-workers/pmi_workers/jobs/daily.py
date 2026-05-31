"""Daily cron: heavier maintenance.

P0: placeholder that just runs `score-all` (because nothing else is wired
yet). The shape mirrors `micah-job-executor/app/jobs/daily.py` so we can
add embedding regeneration / peer-group rebuild / Tier 3 re-evaluation as
they land without changing the supercronic crontab.
"""

from __future__ import annotations

import structlog

from pmi_workers.jobs.score_all import run as score_all_run
from pmi_workers.registry import register

log = structlog.get_logger("pmi_workers.jobs.daily")


@register("daily")
async def run() -> None:
    """Daily tick: full re-score (placeholder for future Tier 0/3 work)."""
    log.info("daily.start")
    await score_all_run()
    # Future hooks (P1+):
    #   - regenerate market embeddings for new contracts (Tier 0 pre-filter)
    #   - rebuild peer-group cache (CLAUDE.md §5 trader cohort)
    #   - emit cost/coverage rollups to Slack
    log.info("daily.done")
