# pmi-core

Shared library for the Polymarket PMI Platform:

- **Tier-prefixed SQLAlchemy schema** (`core_*`, `ts_*`, `audit_*`, `vec_*`) with Alembic migrations
- **DSL IR** — Pydantic models that parse `index_defs/*.yaml` into in-memory `IndexDef`
- **Engine** — selector → factor evaluator (stub at P0) → aggregator → write `ts_index_scores`
- **MLflow client** — `mlflow_client.py` mirrors prompts + runs into MLflow Prompt Registry + Tracking; graceful degradation when server is unreachable
- **CLI** — `pmi-core migrate / seed / score / history / list-defs / mlflow-init / prompts list`

See [`../../pmi-platform-proposal/06-p0-sequencing.md`](../../pmi-platform-proposal/06-p0-sequencing.md) for the
P0 sprint plan this package implements (Sprint 1 + half of Sprint 2).

## Layout

```
pmi-core/
├── pmi_core/
│   ├── config.py            Pydantic settings (PMI_DB_*, PMI_MLFLOW_* env vars)
│   ├── db.py                async SQLAlchemy engine + session factory
│   ├── mlflow_client.py     MLflow Prompt Registry + Tracking wrapper, graceful degradation
│   ├── cli.py               click entrypoint (flat command surface)
│   ├── models/              SQLAlchemy models, one file per tier
│   ├── dsl/                 IndexDef IR + YAML parser
│   ├── engine/              pipeline + selector + factor_evaluator + aggregator
│   ├── prompts/factors/     prompt-as-code (committed, hashed at use)
│   └── index_defs/          declarative PMI definitions (committed)
├── alembic/                 migrations (0001 schema, 0002 mlflow_links)
├── alembic.ini
├── Dockerfile
└── pyproject.toml
```

## Quickstart (host, requires `uv`)

```bash
uv sync
cp .env.example .env  # edit PMI_DB_* if needed
uv run alembic upgrade head
uv run pmi-core score polymarket-war-index           # one pipeline tick
uv run pmi-core dry-run pmi_core/index_defs/polymarket-war-index.yaml --compact
                                                     # in-process, no DB writes
uv run pmi-core schema dump                          # regen JSON Schema for the YAML DSL
```

## Quickstart (Docker, via workspace `just`)

```bash
just pmi-migrate                                # alembic upgrade head
just pmi-score polymarket-war-index             # one tick of the pipeline
just dry-run                                    # in-process dry-run (no docker)
just schema-dump                                # regen the IndexDef JSON Schema
```

## Schema tiers (north-star: "新增第 N 個之物不需要改前 N–1 個之物")

| Prefix | Lifecycle | Examples |
|---|---|---|
| `core_*`  | OLTP, mutable identity | `core_markets`, `core_index_definitions`, `core_prompts`, `core_api_keys` |
| `ts_*`    | Time-series, append-only | `ts_price_snapshots`, `ts_index_scores` |
| `audit_*` | **Immutable**, lineage-bearing | `audit_evaluations`, `audit_source_health`, `audit_pipeline_runs` |
| `vec_*`   | Vector embeddings | `vec_market_embeddings` |

Audit rows are append-only by convention at P0 (P1 enforces via Postgres RULE / REVOKE UPDATE).

## P0 scope (what's here today)

- ✅ Schema for all 4 tiers
- ✅ Alembic migrations 0001 (schema) + 0002 (mlflow links) + 0003 (core_factor_models)
- ✅ Pydantic `IndexDef` IR + YAML loader
- ✅ Polymarket War Index `index_def` (mirrors Micah's 8 factors)
- ✅ Pipeline skeleton (selector + stub factor eval + collapse aggregator)
- ✅ CLI for migrate / seed / score / history / list-defs / models / prompts / mlflow-init
- ✅ MLflow Prompt Registry + Tracking integration (graceful degradation)
- ✅ Factor Model Registry (`core_factor_models` + `factor_resolver` lookup; YAML fallback)
- ✅ Unit tests for `mlflow_client` graceful-degradation (16 tests, pure mock)
- ⏳ Real LLM factor evaluator dispatched by `resolved.llm_model_id` — Sprint 2 (Week 3) of P0
- ⏳ MLflow Model Registry artifact upload on `models register` — once real LLM lands
- ⏳ `audit_pipeline_runs` cost tracking — Sprint 3

## MLflow integration (prompt + model version control)

The platform treats Postgres as the compliance floor and MLflow as the
productivity layer. Both stay synchronised; if MLflow is down, the pipeline
runs anyway and `mlflow_*` columns are populated later by `pmi-core mlflow-init`.

| Concern | Authoritative (Postgres) | MLflow mirror |
|---|---|---|
| Prompt template & lineage | `core_prompts(name, version, sha256, template)` — append-only | `prompts:/<name>/<mlflow_version>` URI stored in `core_prompts.mlflow_prompt_uri` |
| Each LLM call | `audit_evaluations` — append-only, sha256-bound | One MLflow child run; `audit_evaluations.mlflow_run_id` |
| Each pipeline tick | `audit_pipeline_runs` | One MLflow parent run; `audit_pipeline_runs.mlflow_run_id` |
| Index definition (SCD2) | `core_index_definitions` | One MLflow experiment per `index_id`; `core_index_definitions.mlflow_experiment_id` |
| Factor model promotion | `core_factor_models(factor_id, version, prompt_id, llm_model_id, temperature, stage, is_active)` — stage transition gated by partial-unique index | `mlflow_registered_model_name` reserved per factor; artifact + version land with real LLM (Sprint 2) |

Versioning rules unchanged: prompt edit = bump `-vN` in filename (never overwrite);
`mlflow.register_prompt` is called once per unique `(name, sha256)` and is idempotent.

### Factor Model lookup at evaluation time

`pmi_core.engine.factor_resolver.resolve_factor_model(session, factor, yaml_prompt)`
runs once per factor per tick:

1. Query `CoreFactorModel(factor_id, stage='production', is_active=True)`.
2. If found → use its `(prompt, llm_model_id, temperature, tools_config)`.
   `audit_evaluations.model_id` records the registry's LLM id;
   `model_response.model_source = 'registry'`.
3. If not found → fall back to YAML's `factor.prompt_ref` + `DEFAULT_STUB_MODEL_ID`.
   `model_source = 'yaml'`.

The evaluator cache (`market_id, index_definition_id, factor_id, prompt_sha256, model_id`)
makes registry promotions automatically trigger re-evaluation of just that factor — the
other factors hit cache.

CLI surface:

```bash
pmi-core mlflow-init                         # backfill experiments + prompt URIs onto rows missing them
pmi-core prompts list                        # JSON dump of every CorePrompt + its prompts:/ URI

pmi-core models list [--factor X]            # list factor models (id, version, stage, is_active, …)
pmi-core models register \
    --factor directly_about_war \
    --prompt-name factors/directly_about_war \
    --prompt-version 1 \
    --llm gpt-4o-mini-2024-07-18 \
    --temperature 0.1                        # writes a 'staging', is_active=False row
pmi-core models promote <id> --stage production
                                             # atomic: demote any current active row in
                                             # (factor_id, stage), promote this one
```

UI: `just mlflow-ui` opens `http://localhost:5500`.

## What's intentionally NOT here

- DSL parser beyond YAML→Pydantic (P1, see Calculation M4)
- Backtest (P1)
- Tier 0 embedding pre-filter (P2)
- Tier 2 agentic deep eval (P3)
- Real LLM dispatch inside `factor_evaluator._stub_score` (P1, Sprint 2 — schema and registry path are already in place)
