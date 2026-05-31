# End-to-end smoke tests

Automates the manual SHIP-0.3 / SHIP-0.4 procedure as a CI-friendly pytest
suite so a green run proves the entire P0 stack still produces the known
baseline numbers (war=49.03, senate=76.47, house=75.23).

## What it does

1. Drops + recreates `pmi_e2e_test` Postgres database (isolated from dev `pmi`).
2. Runs alembic migrations against the test DB.
3. Seeds 13 fixture markets + 5 baseline index defs.
4. Runs `pmi-workers run-job score-all` → 5 deterministic ts_index_scores rows.
5. Spins up `pmi-api` on port 8099 (avoids clash with dev `:8001`).
6. Hits `/health`, `/indexes`, `/indexes/<id>/score`, `/score/history`,
   `/explain`, `/sources/health` and asserts shape + values.
7. Tears down pmi-api + drops the test DB.

LLM cost: **$0** — no `core_factor_models` rows are registered, so every
factor falls back to the in-process stub evaluator.

## Prerequisites

- Docker Desktop / Docker Engine + `docker compose` v2
- Workspace postgres image pulled (one-off `docker compose pull postgres` is
  enough; the harness will start it if not running)
- pmi-core / pmi-api / pmi-workers images either built (`just build-pmi-all`)
  or available locally. The compose run commands will auto-build if absent.
- Python 3.12+ on host with `httpx` and `pytest` installed.

## Running

From repo root:

```bash
just pmi-e2e                            # all-in-one wrapper
# …or invoke pytest directly:
cd pmi_data_platform
python -m pytest tests/e2e/ -v
```

Wall time on a warm cache: 25-40s. Cold start (images need build): 60-180s.

### Skip bootstrap (fast iteration)

If you already left the stack up from a previous run and only want to
re-execute the assertions:

```bash
PMI_E2E_SKIP_BOOTSTRAP=1 python -m pytest tests/e2e/ -v
```

This skips DB reset + migrate/seed/score-all and just hits the API.

### Override defaults

| env var               | default        | purpose |
|-----------------------|----------------|---------|
| `PMI_E2E_DB_NAME`     | `pmi_e2e_test` | test database name |
| `PMI_E2E_API_PORT`    | `8099`         | host port pmi-api binds to |
| `PMI_E2E_SKIP_BOOTSTRAP` | `0`         | skip the docker compose bring-up |

## Layout

```
tests/e2e/
├── __init__.py
├── conftest.py              # docker compose orchestration + fixtures
├── docker-compose.e2e.yml   # override applied to root compose file
├── pytest.ini               # marker + serial addopts
├── README.md                # you are here
└── test_pipeline_smoke.py   # the actual assertions
```

The override file only sets `PMI_DB_NAME=pmi_e2e_test`,
`PMI_MLFLOW_ENABLED=false`, and remaps `pmi-api`'s host port — nothing else
deviates from the production compose topology.
