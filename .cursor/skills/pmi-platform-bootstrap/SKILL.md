---
name: pmi-platform-bootstrap
description: >-
  CURRENT — Navigator for the live Polymarket PMI Platform code in this
  repo (`pmi_data_platform/`). Use whenever the user touches pmi-core /
  pmi-ingest / pmi-api / pmi-workers / pmi-mcp / pmi-web / mlflow / pmi-demo,
  mentions index defs / DSL / IR / MCP tools / Polymarket ingest, or asks
  any "where does X live in the platform" question. For prod maintenance on
  the legacy Micah three-repo system see `micah-codebase-navigator`.
---

# Polymarket PMI Platform — Navigator (CURRENT)

> **Status (2026-05-29)**: P0 scaffold **landed and e2e-runnable** at
> [`pmi_data_platform/`](../../../) (workspace-root sibling
> of `micah/`, `micah-db/`, `pmi-platform-proposal/`). 7 packages runnable:
> `pmi-core` / `pmi-ingest` / `pmi-api` / `mlflow` / `pmi-demo` /
> `pmi-workers` / `pmi-web` (`pmi-mcp` is a P3 stub).
>
> Live status, package roles, and quickstart commands are maintained in
> [`pmi_data_platform/README.md`](../../../README.md).
> Day-to-day TODO lists:
> [`TODO.md`](../../../TODO.md) (consolidated active list, 2026-06-11; the themed
> TODO files were deleted — history via `git show aa45741:<file>`).
>
> Design authority (the "why") = `./CLAUDE.md` + `./AGENTS.md` §1–§14.
> This skill = the **what & where** for navigating the live code.

## One-liner

A Polymarket-only PMI platform where indexes are **declarative, versioned,
backtestable** YAML objects, evaluated by a typed IR + engine, with deep
Polymarket signals (orderbook, cohort, UMA, conditional trees in roadmap)
and an MCP server that lets any agent read/write indexes.

## On-disk layout (live)

Every conceptual `pmi-X/` resolves to `pmi_data_platform/pmi-X/`:

```
pmi_data_platform/
├── pmi-core/      # Shared schema + IR + engine + Alembic + MLflow client + CLI
│   └── pmi_core/
│       ├── alembic/                  # tier-prefixed migrations (0001, 0002 mlflow links, 0003 factor models)
│       ├── config.py                 # pydantic-settings, reads ../.env
│       ├── db.py                     # async SQLAlchemy engine
│       ├── dsl/
│       │   ├── ir.py                 # IndexDef pydantic model (`load_index_def()` → ir, raw, sha256)
│       │   └── schema/               # generated JSON Schema (regen via `just schema-dump`)
│       ├── engine/
│       │   ├── selector.py           # keyword / category selectors
│       │   ├── factor_evaluator.py   # P0 stub; real LLM lands via factor_resolver
│       │   ├── factor_resolver.py    # CoreFactorModel registry lookup → ResolvedFactorModel
│       │   ├── aggregator.py         # weighted_average_x_100; partition_sum/polarity = CORR-2.x
│       │   ├── pipeline.py           # selector → resolver → evaluator → aggregator → write ts_index_scores
│       │   └── dry_run.py            # in-process e2e against fixtures, no DB / LLM cost
│       ├── index_defs/               # *.yaml index definitions (the user-facing artifact)
│       │   ├── polymarket-war-index.yaml
│       │   ├── us-senate-2026-republican-share.yaml
│       │   ├── us-senate-2026-republican-seats.yaml
│       │   ├── us-house-2026-republican-share.yaml
│       │   └── us-house-2026-republican-seats.yaml
│       ├── mlflow_client.py          # graceful-degradation mirror to MLflow Tracking + Prompt Registry
│       ├── models/                   # SQLAlchemy: core_*, ts_*, audit_*, vec_*
│       └── cli.py                    # `pmi-core migrate / seed / score / history / list-defs / mlflow-init / prompts / models`
├── pmi-ingest/    # Polymarket REST poller; writes core_markets + ts_price_snapshots + audit_source_health
├── pmi-api/       # FastAPI :8001 — /indexes, /score, /history, /explain, /sources/health
├── mlflow/        # MLflow tracking server :5500 (Postgres backend, Prompt Registry UI)
├── pmi-demo/      # Synthetic markets fixture; bind-mounted into pmi-core / pmi-api for dry-run
├── pmi-workers/   # Supercronic cron runner (replaces micah-job-executor); Arq queue lands in P1
├── pmi-web/       # Next.js 15 + recharts dashboard reading pmi-api
└── pmi-mcp/       # P3 stub (Tier A read / Tier B analysis / Tier C write)
```

## Where to look first

| Question | File / path |
|---|---|
| Schema (which table? which column?) | `pmi-core/pmi_core/models/{core,ts,audit,vec}*.py` |
| How does an index def YAML look? | `pmi-core/pmi_core/index_defs/*.yaml` |
| YAML → IR validation rules | `pmi-core/pmi_core/dsl/ir.py` (`IndexDef`, `FactorSpec`, `AggregationSpec`) |
| End-to-end pipeline tick | `pmi-core/pmi_core/engine/pipeline.py` |
| Selector / aggregator semantics | `pmi-core/pmi_core/engine/{selector,aggregator}.py` |
| Factor model registry lookup | `pmi-core/pmi_core/engine/factor_resolver.py` |
| MLflow mirror behaviour | `pmi-core/pmi_core/mlflow_client.py` |
| Quickstart / docker-compose orchestration | `pmi_data_platform/README.md` + workspace-root `justfile` |
| What's shippable / blocking | `pmi_data_platform/TODO.md` |
| Numerical correctness backlog | `pmi_data_platform/TODO.md`（§2~§6）|

## North-star invariants (from `pmi_data_platform/README.md`)

> 新增第 N 個之物不需要改前 N–1 個之物。
>
> - 新 source（Kalshi、WS、chain）→ drop `pmi-ingest/pollers/<name>.py`，不動 `pmi-core`
> - 新 PMI → drop `pmi-core/pmi_core/index_defs/<id>.yaml`，自動 register
> - 新 consumer → 共用 pmi-api 的 `summary + data` envelope
> - 新 factor → YAML 加一行 + 一個 prompt 檔，不動 column
> - 新 prompt 版本 → bump `-vN`，舊 evaluation 仍指向舊 prompt row（append-only）
>
> 任一條被破壞 = 又在做 Micah 的延伸，不是 platform。

## Running commands — Docker only

All `pmi_data_platform/` commands run **inside Docker**, never on the host.
Drive them through the workspace-root `justfile` (recipes wrap
`docker compose --profile pmi run --rm pmi-core …`) or compose directly:

```bash
just pmi-migrate                                            # alembic upgrade head
just pmi-seed                                               # 13 synthetic markets + register defs
just pmi-score <index_id>                                   # one pipeline tick
just pmi-history <index_id>
just pmi-bootstrap                                          # mlflow-up → build → migrate → seed → score → history
docker compose --profile pmi run --rm pmi-core models list  # factor models / prompts / mlflow-init …
```

The `pmi-core …` strings throughout this skill and `CLAUDE.md` are the
**container entrypoint**, not a host binary. Do NOT run `pmi-core …`,
`cd pmi-core && python -m pmi_core.cli …`, or `uv run …` on the host — the venv
isn't guaranteed, it can target the wrong DB, and it loses the bind-mounted
fixtures. **Only exception**: `just dry-run` (pure in-process, no DB / LLM /
docker) is intentionally host-side.

## Conventions (live, from README.md)

- **Runtime**: Python 3.12+, `uv` for venv + lock (used *inside* the images; host commands still go through Docker — see above).
- **DB**: SQLAlchemy 2.0 async + asyncpg; async Alembic env.py.
- **Tier prefix**: `core_*` / `ts_*` / `audit_*` / `vec_*` — enforced workspace-wide.
- **Append-only audit**: `audit_evaluations`, `audit_source_poll_log` — never UPDATE.
- **Prompt-as-code**: prompt files in git; `core_prompts` stores sha256;
  bump `-vN` not in-place edit.
- **Index DSL**: YAML on disk → `IndexDef` IR → `core_index_definitions` (SCD Type 2).
- **MLflow contract**: DB is the truth; MLflow mirrors prompts + every
  pipeline tick + factor eval. Failures are non-blocking — `mlflow_*`
  columns stay NULL and `pmi-core mlflow-init` backfills later.

## Phase plan (from §11 of CLAUDE.md — live status)

| Phase | Scope | Status |
|---|---|---|
| **P0** | Polymarket REST ingest → Postgres; declarative PMI YAML + IR + engine; FastAPI; MLflow mirror | **landed**, e2e runnable; remaining correctness items in `TODO.md` |
| **P1** | Index builder UI + backtest; Arq queue; real LLM tier 1 factor evaluator; source_health alerts | in progress |
| **P2** | WS ingest, orderbook depth weighting, trader cohort, polarity-aware aggregator | not started |
| **P3** | MCP server + in-app chat + daily briefing agent | `pmi-mcp/` stub only |
| **P4** | Tier 2 agentic eval, cross-market arbitrage, marketplace | future |

## Mining the Micah legacy

Patterns worth porting from `./micah/`, `./micah-db/`, `./micah-job-executor/`
(reference, **not** extension base):

| Pattern | Source file (legacy) | Destination (platform) |
|---|---|---|
| Bucket collapse / mutually-exclusive contracts | ~~`micah-job-executor/.../mutually_exclusive.py`~~ → `micah-job-executor/app/jobs/workflows/evaluate_contracts/bucket_collapser.py` (renamed + noisy-OR/mean math by Micah PR #15 2026-05-29) | **done 2026-05-30** in [`pmi-core/pmi_core/engine/bucket_collapser.py`](../../../pmi-core/pmi_core/engine/bucket_collapser.py) + [`pmi-core/pmi_core/utils/date_analyzer.py`](../../../pmi-core/pmi_core/utils/date_analyzer.py) (CORR-1.4) |
| Polarity-aware aggregation (subtract when YES=opposite party) | `micah-job-executor/app/jobs/workflows/evaluate_contracts/bucket_collapser.py` (same file, different concern) | new formula in `aggregator.py` (CORR-2.x) |
| Quantile-based weighting (apply to orderbook depth) | `micah-job-executor/app/jobs/workflows/score_index/source_weights.py` | `pmi-core/pmi_core/engine/aggregator.py` `weighting.liquidity.method: quantile` |
| Async OpenAI client with Batch API | `micah-job-executor/app/shared/services/async_openai.py` | `pmi-core/pmi_core/engine/factor_evaluator.py` (Tier 1 LLM) |
| Three-tier async fanout (10 topics × 80 OpenAI) | `micah-job-executor/app/jobs/_evaluate_shared.py` | `pmi-workers/` once Arq lands |
| Polymarket REST client | `micah/server/app/sources/polymarket.py` | already adapted into `pmi-ingest/`; `micah/server/scripts/polymarket_local.py` shows the DNS-bypass + lazy-load pattern for local dev |
| Alembic + pgvector pattern | `micah-db/micah_db/alembic/` | `pmi-core/alembic/` (already applied) |

**Anti-patterns to keep out of the platform** (the things that made Micah
hard to evolve): Render cron glue, Playwright scrapers, hardcoded factor
lists, monolithic server/job-executor split, hand-written TS types diverging
from Pydantic, in-place edits of factor weights (always bump `version:`).

## Declarative PMI object — live example

The user-facing artifact is a YAML file in
`pmi-core/pmi_core/index_defs/` that parses through `dsl/ir.py::IndexDef`
into typed IR. Shape:

```yaml
id: us-senate-2026-republican-share
version: 1
title: "US Senate 2026 — Republican Seat Share (%)"
owner: reid

selectors:                # keyword | category | semantic (P1+)
  - {type: keyword, terms: [...]}
  - {type: category, polymarket_tag: politics}

factors:                  # binary | ternary | score
  - {id: ..., type: binary, prompt_ref: prompts/..., weight: 60}

weighting:
  liquidity: {method: quantile}     # or linear / none

aggregation:
  collapse: {enabled, max_spread_days, representative}
  min_components: 1
  formula: weighted_average_x_100   # P0 stub; partition_sum / polarity = CORR-2.x

publish:
  cadence: every_2h                 # real_time | hourly | every_2h | daily
  channels: [api]                   # api | websocket | webhook
```

**Versioning rule** (enforced by the SCD Type 2 `core_index_definitions`
table): changing `factors` or `weighting` **bumps `version:`**, never
edits in place. Old `version` rows stay computable so historical
comparisons hold.

## MCP layer (§8 — stub; P3 lands)

`pmi-mcp/` is a stub. When it lands the design (from `CLAUDE.md` §8) is:

- **Tier A** discovery (read, cheap): `pmi.list_indexes`, `pmi.search_markets`, `pmi.get_index`, `pmi.get_score`, `pmi.get_market`.
- **Tier B** analysis (read, runs LLM): `pmi.explain_score`, `pmi.compare_indexes`, `pmi.backtest`, `pmi.market_diff`.
- **Tier C** write (two-phase commit): `pmi.draft_index` → `pmi.commit_index`, `pmi.create_alert`, `pmi.subscribe`.

Every tool: `summary` + `data` + `links[]` envelope, `as_of` parameter,
errors return `{code, hint}` with a next-step.

## Polymarket-specific signals (§5 — roadmap)

What separates this from Micah's title-only treatment. P0 used REST only;
the rest land in P1 / P2:

| Signal | Source | Status |
|---|---|---|
| Mid-quote price (`outcomePrices[0]`) | Gamma REST | **landed** in `pmi-ingest/` |
| Liquidity (`liquidityClob`) | Gamma REST | **landed**; used in `weighting.liquidity` |
| Orderbook depth (bestBid / bestAsk / depth tiers) | CLOB REST | P1 |
| Real-time trade flow | WS | P1 |
| Trader cohort (whale vs retail) | Polygon chain | P2 |
| UMA disputes (exclude disputed markets) | Polygon CTF events | P2 |
| Conditional market trees | events API | P2 |
