# pmi-workers — scheduled + queued worker pool

**Status (2026-05-27)**: 🟡 P0 scaffolded. Supercronic-driven `run-job <name>`
runner ships; Arq fan-out is gated behind `.[arq]` and lands in P1.

P0 deliverable: replace the `just pmi-score` cron habit with a real
scheduler that ticks `pmi-core`'s pipeline on a crontab without anyone at
the keyboard. Mirrors the
[`micah-job-executor`](../../micah-job-executor/) contract (`run-job`
console script + supercronic crontab) so legacy schedule entries port
across verbatim.

P1 layers Arq on top for fire-and-forget tasks (webhook fan-out,
WS-triggered single-market re-eval). P2+ adds a Temporal layer for
durable / long-running work (backtest, Tier 2 agentic eval). See
[`../../pmi-platform-proposal/03-calculation-execution-plan.md`](../pmi-platform-proposal/).

---

## Layout

```
pmi-workers/
├── pyproject.toml                deps: pmi-core, click, structlog; arq is .[arq]
├── Dockerfile                    supercronic + uv + bind-mounted pmi-core
├── cron/crontab                  supercronic schedule
├── pmi_workers/
│   ├── __init__.py               re-exports jobs package for @register side-effects
│   ├── registry.py               name → async fn lookup (ported from micah-job-executor)
│   ├── runner.py                 `run-job <name>` entry point
│   ├── cli.py                    `pmi-workers list / run / score / arq`
│   └── jobs/
│       ├── __init__.py           imports every job module for registration
│       ├── score.py              single-index pipeline tick
│       ├── score_all.py          loops every is_current=true index
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

| Phase | Trigger                                | Responsible                                              |
|-------|----------------------------------------|----------------------------------------------------------|
| P0    | supercronic crontab                    | `cron/crontab` → `run-job` → `pmi_workers.registry`      |
| P1    | + Arq fire-and-forget (WS / webhook)   | `pmi-workers arq` listener (stub today, needs Redis)     |
| P2    | + Temporal for backtests + Tier 2 eval | New `pmi_workers/workflows/` package                     |

The job-class pattern from
[`micah-job-executor/app/jobs/update/pmi_score.py`](../../micah-job-executor/app/jobs/update/pmi_score.py)
(Slack notify, structured timing, JobLogger) is **not** ported at P0 — pmi-core's
own structlog inside `run_pipeline()` covers it. Add it back if/when a
prod operator wants per-tick Slack pings.

---

## Why not Arq today?

Arq needs Redis. Redis isn't in the P0 docker-compose. Adding it just to
schedule one cron is over-engineering. Once any of the following lands,
flip `.[arq]` on and implement `pmi-workers arq`:

- WS consumer in `pmi-ingest` (P1 Ingestion M5) — needs queue for single-market re-eval
- First alert subscriber requests delivery — needs webhook fan-out worker
- Crontab grows more than ~3 schedules — switch from supercronic to Arq scheduler

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
