# mlflow

Thin Dockerfile wrapping the upstream MLflow tracking server with the Postgres
driver (`psycopg2-binary`) and S3 client (`boto3`) pre-installed.

- **Backend store**: Postgres `mlflow` database (auto-created by db-init / `just mlflow-create-db`)
- **Artifact store**: local Docker volume `pmi-mlartifacts` (mounted at `/mlartifacts`)
- **Port**: 5000 (mapped to `${MLFLOW_PORT:-5500}` on host to avoid clashing with macOS AirPlay)

## What MLflow is doing in this platform

| Concern | Where it lives | MLflow role |
|---|---|---|
| Authoritative prompt history (sha256, append-only) | `core_prompts` in `pmi` DB | Mirror — `mlflow.register_prompt()` on first use, store `prompts:/...` URI back on the DB row |
| Every LLM evaluation (immutable, lineage-bearing) | `audit_evaluations` in `pmi` DB | Mirror as child MLflow run; store `run_id` on the DB row |
| Each pipeline tick | `audit_pipeline_runs` in `pmi` DB | Parent MLflow run; experiment = `index_id` |
| Index definition (SCD Type 2) | `core_index_definitions` in `pmi` DB | One MLflow experiment per index_id; store `experiment_id` on the DB row |
| Model promotion (P1+) | `core_factor_models` (not yet built) | MLflow Model Registry: Staging/Production aliases |

**The Postgres tables are the compliance floor; MLflow is the productivity layer.**
If MLflow is unreachable, `pmi-core` pipeline still runs (graceful degradation,
`mlflow_run_id` is NULL on that audit row).

## Versioning policy

- Pin: `mlflow>=2.22,<3` (see `Dockerfile`). The Prompt Registry API has been
  stable since 2.17; the lower bound is "latest line we test against". Bump the
  ceiling deliberately and re-run the full `just pmi-bootstrap` cycle.
- Migration: `mlflow server` runs `db upgrade` on every boot, so upgrading the
  pin = restart the container. Downgrade requires manual schema rollback.
