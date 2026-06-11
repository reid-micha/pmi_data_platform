# pmi-workers — scheduled + queued worker pool

**Status (2026-06-11)**: 🟢 cron + Postgres queue + durable workflows live.
Supercronic now *enqueues* (`pmi-workers enqueue <name>`); the long-running
`pmi-workers worker` loop (compose service `pmi-worker`) claims + executes
with retry / heartbeat / crash recovery.

2026-06-11 decision: the §7 Arq/Temporal roles are filled **on Postgres** —
no Redis, no Temporal. `core_jobs` is the queue (FOR UPDATE SKIP LOCKED +
LISTEN/NOTIFY, see `pmi_core/queue.py`); `core_workflow_runs/steps` are the
durable-workflow event log (step checkpoint + replay, see
`pmi_core/workflow.py`). Covers CORR-4.6 (fire-and-forget, WS-triggered
re-eval, §3.2 on-demand score) and CORR-8.1 (durable backtest). Revisit real
Temporal only when signals/timers/multi-worker-fan-out of one run are needed.

---

## Layout

```
pmi-workers/
├── pyproject.toml                deps: pmi-core, click, structlog, sqlalchemy, asyncpg
├── Dockerfile                    supercronic + uv + bind-mounted pmi-core
├── cron/crontab                  supercronic schedule (lines enqueue, worker executes)
├── pmi_workers/
│   ├── __init__.py               re-exports jobs package for @register side-effects
│   ├── registry.py               name → async fn lookup (ported from micah-job-executor)
│   ├── runner.py                 `run-job <name>` entry point (one-shot, in-process)
│   ├── worker.py                 Postgres-queue claim loop (`pmi-workers worker`)
│   ├── cli.py                    `pmi-workers list / run / score / worker / enqueue / backtest`
│   └── jobs/
│       ├── __init__.py           imports every job module for registration
│       ├── score.py              single-index pipeline tick (queue passes index_id)
│       ├── score_all.py          loops every is_current=true index
│       ├── reeval_market.py      WS-triggered single-market → per-index score fan-out
│       ├── workflow.py           executes a durable workflow run (e.g. backtest)
│       ├── hourly.py             cron alias → score-all
│       └── daily.py              cron alias → score-all (placeholder for embeddings/peer/rebuilds)
└── .env.example                  PMI_WORKERS_DEFAULT_INDEX only; rest inherited from pmi-core
```

---

## Registered jobs (P0)

| Name                              | What it does                                                                  |
|-----------------------------------|-------------------------------------------------------------------------------|
| `score`                           | One tick of `$PMI_WORKERS_DEFAULT_INDEX` (default `polymarket-war-index`)     |
| `score:polymarket-war-index`      | Same as above but with the index pinned in the registry key                   |
| `score-all`                       | Sequentially tick every `is_current=true` `CoreIndexDefinition`               |
| `hourly`                          | Alias → `score-all` (called by cron `0 * * * *`)                              |
| `daily`                           | Alias → `score-all` (called by cron `0 10 * * *`); future: embeddings, peers  |

`pmi-workers list` prints the live registry; new modules under `pmi_workers/jobs/`
auto-register at import time when added to `pmi_workers/jobs/__init__.py`.

---

## Local usage

```bash
# Build the image (one-shot)
docker compose build pmi-workers

# One tick of the default index (no cron)
docker compose run --rm pmi-workers run-job score

# Score a specific index
docker compose run --rm pmi-workers pmi-workers score polymarket-war-index

# List registered jobs
docker compose run --rm pmi-workers pmi-workers list

# Start the long-running supercronic container (the prod entry point)
docker compose up -d pmi-workers
```

The justfile recipes (`just workers-run`, `just workers-up`, `just workers-list`)
wrap the same commands. See [`../../justfile`](../../justfile).

---

## How this maps to the long-term design

| Phase | Trigger                                | Responsible                                                        |
|-------|----------------------------------------|--------------------------------------------------------------------|
| P0    | supercronic crontab                    | `cron/crontab` → `pmi-workers enqueue` → `core_jobs`               |
| ✅ now | Postgres queue (WS / on-demand / cron) | `pmi-workers worker` claim loop → `pmi_workers.registry`           |
| ✅ now | Durable workflows (backtest)           | `workflow` job → `pmi_core.workflow.execute_run` (step checkpoint) |

The job-class pattern from
[`micah-job-executor/app/jobs/update/pmi_score.py`](../../micah-job-executor/app/jobs/update/pmi_score.py)
(Slack notify, structured timing, JobLogger) is **not** ported at P0 — pmi-core's
own structlog inside `run_pipeline()` covers it. Add it back if/when a
prod operator wants per-tick Slack pings.

---

## Why not Arq / Temporal? (2026-06-11 decision)

Arq needs Redis; Temporal needs four services. On a single-EC2 deployment
where Postgres is already the only stateful infra, both roles are filled by
Postgres tables instead:

- **Queue** (`core_jobs`): SKIP LOCKED claims scale across N worker
  containers; LISTEN/NOTIFY gives ms-level wakeup; `dedupe_key` collapses
  storms; heartbeat + stale-sweep recover from crashes. This is plenty for
  the platform's job volume (tens of jobs/hour, not thousands/second).
- **Durable workflows** (`core_workflow_runs/steps`): step results are
  checkpointed; queue retry replays the workflow function and completed
  steps return their persisted result — a 90-day backtest that dies at day
  60 resumes at 61. Revisit Temporal when signals / timers / child
  workflows / fan-out-one-run-across-workers are actually needed.

---

## Migration provenance (what was ported from `micah-job-executor`)

| Concept                  | Source                                                            | Destination                         |
|--------------------------|-------------------------------------------------------------------|-------------------------------------|
| `register` decorator     | `micah-job-executor/app/jobs/registry.py`                         | `pmi_workers/registry.py`           |
| `run-job <name>` CLI     | `micah-job-executor/app/runner.py`                                | `pmi_workers/runner.py`             |
| Supercronic Dockerfile   | `micah-job-executor/Dockerfile`                                   | `pmi-workers/Dockerfile`            |
| Hourly / daily orchestrator pattern | `micah-job-executor/app/jobs/hourly.py` + `daily.py`   | `pmi_workers/jobs/{hourly,daily}.py`|
| Per-job module structure | `micah-job-executor/app/jobs/update/pmi_score.py`                 | `pmi_workers/jobs/score.py`         |

What was **not** ported:
- Per-source sync jobs (`sync/*.py`) — pmi-ingest owns ingest, not workers.
- FastAPI trigger endpoint (`api/routes/jobs.py`) — cron + CLI cover P0; if
  HTTP-triggered re-runs become useful, add a route to `pmi-api` instead of
  bringing a second FastAPI app into the stack.
- Job-class pattern with Slack notifications — see note above; structured
  logs cover the P0 case.
- `app/scripts/recalculate_*.py` — pmi-core's `run_pipeline` is the equivalent
  and is already idempotent on `(index_definition_id, as_of)`.
