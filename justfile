# Polymarket PMI Platform — one-command local dev for the whole stack.
# Self-contained: every recipe runs against ./docker-compose.yml in this repo.
# Run `just` (no args) for the recipe list, or `just doctor` to check your env.
#
# Conventions
#   • All app commands run in Docker (see CLAUDE.md §0 rule 4). The only host
#     recipe is `just dry-run` (in-process, no DB/LLM).
#   • Credentials + ports come from ./.env (copy from .env.example first).

set shell        := ["bash", "-uc"]
set dotenv-load  := true
set positional-arguments

root_dir := justfile_directory()

# Default = grouped recipe list.
default:
    @just --list

# ============================================================================
# Stack — whole-platform bring-up on a single machine
# ============================================================================

# One command: db + mlflow + schema + seed + api/workers/ingest/web.
# Creds + ports come from ./.env (seeded from .env.example on first run).
[group('stack')]
up:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ ! -f .env ]; then
      echo "→ .env missing — seeding from .env.example"
      cp .env.example .env
      echo "✗ Fill credentials in .env (PMI_DB_PASSWORD, OPENAI_API_KEY, …) then re-run 'just up'."
      exit 1
    fi
    echo "→ DB + MLflow"
    docker compose --profile pmi up -d postgres mlflow
    echo "→ schema + seed (idempotent)"
    docker compose --profile pmi run --rm pmi-core migrate
    docker compose --profile pmi run --rm pmi-core seed
    echo "→ build pmi-web (Docker layer cache → no-op unless package.json changed)"
    docker compose --profile pmi --profile pmi-web build pmi-web
    echo "→ services (api · workers · worker · ingest · web)"
    docker compose --profile pmi --profile pmi-web up -d pmi-api pmi-workers pmi-worker pmi-ingest pmi-web
    port() { docker compose --profile pmi --profile pmi-web port "$1" "$2" 2>/dev/null | sed 's/.*://'; }
    web=$(port pmi-web 3000); api=$(port pmi-api 8000); mlf=$(port mlflow 5000)
    echo ""
    echo "✓ Stack up:"
    echo "  web      http://localhost:${web:-3000}/pmi_dashboard"
    echo "  api      http://localhost:${api:-8001}/health"
    echo "  mlflow   http://localhost:${mlf:-5500}"
    echo "  stop:    just down   |   status: just stack-ps"

# Also bring up the deep ingest sources (CLOB depth, history, Kalshi).
[group('stack')]
up-full: up
    docker compose --profile ingest up -d
    @echo "✓ Deep ingest sources up (clob · history · kalshi-rest · kalshi-clob)."

# Stop + remove the whole stack (keeps the postgres data volume).
[group('stack')]
down:
    docker compose --profile pmi --profile pmi-web --profile ingest --profile workers down

# Status of every stack service.
[group('stack')]
stack-ps:
    docker compose --profile pmi --profile pmi-web --profile ingest ps

# Tail logs for the whole pmi stack (Ctrl-C to stop).
[group('stack')]
stack-logs:
    docker compose --profile pmi --profile pmi-web logs -f --tail 50

# Build every pmi-* image (pmi-core, pmi-ingest, pmi-api, pmi-workers, mlflow, pmi-web).
[group('stack')]
build-all:
    @touch .env
    docker compose --profile pmi --profile pmi-web build
    @echo "✓ All images built. List with: docker images | grep pmi"

# ============================================================================
# Database
# ============================================================================

# Start Postgres (pgvector) and wait until healthy.
[group('database')]
db-up:
    docker compose up -d postgres
    @echo "→ Waiting for Postgres to be healthy..."
    @until docker compose exec -T postgres pg_isready -U ${PMI_DB_USER:-warindex} -d ${PMI_DB_NAME:-pmi} >/dev/null 2>&1; do sleep 1; done
    @echo "✓ Postgres healthy on localhost:${PMI_DB_PORT:-5432}"

# Stop Postgres (keeps the data volume).
[group('database')]
db-down:
    docker compose down

# DESTRUCTIVE: drop all data and restart. Prompts for confirmation.
[group('database')]
[confirm("Drop all local DB data?")]
db-reset:
    docker compose --profile pmi --profile pmi-web --profile ingest down -v
    @just db-up

# Open psql against the pmi database.
[group('database')]
db-shell:
    docker compose exec postgres psql -U ${PMI_DB_USER:-warindex} -d ${PMI_DB_NAME:-pmi}

# Start pgAdmin on http://localhost:5050 (dev@local / dev).
[group('database')]
db-admin-up:
    docker compose --profile admin up -d pgadmin
    @echo "→ pgAdmin: http://localhost:5050 (login dev@local / dev)"
    @echo "  Add server: host=postgres, port=5432, user=${PMI_DB_USER:-warindex}"

# ============================================================================
# pmi-core (engine + DB-backed pipeline)
# ============================================================================

# Build the pmi-core image.
[group('pmi-core')]
pmi-build:
    @touch .env
    docker compose --profile pmi build pmi-core

# Run alembic upgrade head against the pmi database.
[group('pmi-core')]
pmi-migrate:
    docker compose --profile pmi run --rm pmi-core migrate

# Seed: load market fixture + ensure baseline index definitions.
[group('pmi-core')]
pmi-seed:
    docker compose --profile pmi run --rm pmi-core seed

# Compute one PMI tick and persist to ts_index_scores.
# Override the index: just pmi-score polymarket-fed-index
[group('pmi-core')]
pmi-score INDEX_ID='polymarket-war-index':
    docker compose --profile pmi run --rm pmi-core score {{INDEX_ID}}

# Show recent ts_index_scores rows for an index.
[group('pmi-core')]
pmi-history INDEX_ID='polymarket-war-index':
    docker compose --profile pmi run --rm pmi-core history {{INDEX_ID}}

# List every registered index definition.
[group('pmi-core')]
pmi-list-defs:
    docker compose --profile pmi run --rm pmi-core list-defs

# Full bootstrap: mlflow up → build → migrate → seed → score → history.
[group('pmi-core')]
pmi-bootstrap: mlflow-up pmi-build pmi-migrate pmi-seed pmi-score pmi-history

# Run pmi-core unit tests (pytest; fully mocked, no DB/MLflow needed).
[group('pmi-core')]
pmi-test *ARGS='tests/ -v':
    docker compose --profile pmi run --rm --entrypoint sh pmi-core \
        -c "pip install --quiet --no-cache pytest pytest-asyncio && cd /app && python -m pytest {{ARGS}}"

# --- Host-only dry-run (in-process pipeline against fixtures; no docker) ------

# Dry-run a YAML index_def against bundled fixtures. Compact JSON output.
[group('pmi-core')]
dry-run YAML='pmi_core/index_defs/polymarket-war-index.yaml':
    cd {{root_dir}}/pmi-core && python -m pmi_core.cli dry-run {{YAML}} --compact

# Dry-run with the full per-factor evaluation breakdown.
[group('pmi-core')]
dry-run-full YAML='pmi_core/index_defs/polymarket-war-index.yaml':
    cd {{root_dir}}/pmi-core && python -m pmi_core.cli dry-run {{YAML}}

# Regenerate the IndexDef JSON Schema after changing dsl/ir.py.
[group('pmi-core')]
schema-dump:
    cd {{root_dir}}/pmi-core && python -m pmi_core.cli schema dump

# ============================================================================
# MLflow (prompt registry + run tracking; mirrors core_prompts / audit_evaluations)
# ============================================================================

# Build the local mlflow image.
[group('mlflow')]
mlflow-build:
    docker compose --profile mlflow build mlflow

# Start the MLflow tracking server on :${MLFLOW_PORT:-5500} (creates the mlflow DB if missing).
[group('mlflow')]
mlflow-up:
    #!/usr/bin/env bash
    set -euo pipefail
    just db-up
    docker compose exec -T postgres psql -U ${PMI_DB_USER:-warindex} -d ${PMI_DB_NAME:-pmi} -tc \
        "SELECT 1 FROM pg_database WHERE datname='mlflow'" | grep -q 1 || \
        docker compose exec -T postgres psql -U ${PMI_DB_USER:-warindex} -d ${PMI_DB_NAME:-pmi} -c \
        "CREATE DATABASE mlflow"
    docker compose --profile mlflow up -d mlflow
    echo "→ Waiting for MLflow tracking server to be healthy..."
    for _ in {1..30}; do
      curl -fsS "http://localhost:${MLFLOW_PORT:-5500}/health" >/dev/null 2>&1 && break
      sleep 1
    done
    echo "✓ MLflow UI: http://localhost:${MLFLOW_PORT:-5500}"

# Stop the MLflow server (keeps Postgres data + artifacts volume).
[group('mlflow')]
mlflow-down:
    docker compose --profile mlflow stop mlflow && docker compose --profile mlflow rm -f mlflow

# Tail MLflow server logs.
[group('mlflow')]
mlflow-logs:
    docker compose --profile mlflow logs -f --tail 80 mlflow

# Backfill experiments + prompt URIs onto existing rows. Idempotent.
[group('mlflow')]
mlflow-init:
    docker compose --profile pmi run --rm pmi-core mlflow-init

# List every CorePrompt row with its MLflow URI.
[group('mlflow')]
prompts-list:
    docker compose --profile pmi run --rm pmi-core prompts list

# DESTRUCTIVE: drop MLflow's database + artifacts volume + container.
[group('mlflow')]
[confirm("Drop MLflow tracking history + prompt registry?")]
mlflow-reset:
    docker compose --profile mlflow down
    docker compose exec -T postgres psql -U ${PMI_DB_USER:-warindex} -d ${PMI_DB_NAME:-pmi} -c \
        "DROP DATABASE IF EXISTS mlflow"
    docker volume rm -f pmi-mlartifacts
    @echo "✓ MLflow state cleared. Run 'just mlflow-up' to re-init."

# ============================================================================
# pmi-api (FastAPI gateway over pmi-core)
# ============================================================================

# Build the pmi-api image.
[group('pmi-api')]
api-build:
    @touch .env
    docker compose --profile pmi build pmi-api

# Run pmi-api in foreground (uvicorn --reload). Ctrl-C to stop.
[group('pmi-api')]
api-dev:
    docker compose --profile pmi up pmi-api

# Start pmi-api in background.
[group('pmi-api')]
api-up:
    docker compose --profile pmi up -d pmi-api
    @echo "✓ http://localhost:${PMI_API_PORT:-8001}   /docs   /openapi.json"

# Stop pmi-api.
[group('pmi-api')]
api-down:
    docker compose --profile pmi stop pmi-api && docker compose --profile pmi rm -f pmi-api

# Tail pmi-api logs.
[group('pmi-api')]
api-logs:
    docker compose --profile pmi logs -f --tail 50 pmi-api

# Smoke test: hit health, list, score, history endpoints.
[group('pmi-api')]
api-curl INDEX_ID='polymarket-war-index':
    #!/usr/bin/env bash
    PORT="${PMI_API_PORT:-8001}"
    set -e
    echo "=== /health ===";                            curl -fsS http://localhost:$PORT/health | jq .
    echo ""; echo "=== /indexes ===";                  curl -fsS http://localhost:$PORT/indexes | jq '.[] | {id, version, title, is_current}'
    echo ""; echo "=== /indexes/{{INDEX_ID}}/score ==="; curl -fsS "http://localhost:$PORT/indexes/{{INDEX_ID}}/score" | jq .
    echo ""; echo "=== /indexes/{{INDEX_ID}}/score/history ==="; curl -fsS "http://localhost:$PORT/indexes/{{INDEX_ID}}/score/history?limit=5" | jq .

# Run pmi-api route tests against an ephemeral postgres DB (needs `just db-up`).
[group('pmi-api')]
api-test *ARGS='tests/ -v':
    docker compose --profile pmi run --rm --entrypoint sh \
        -v "{{root_dir}}/pmi-api/tests:/app/tests:ro" \
        pmi-api \
        -c "pip install --quiet --no-cache pytest pytest-asyncio httpx && cd /app && python -m pytest {{ARGS}}"

# ============================================================================
# pmi-ingest (Polymarket / Kalshi data ingestion)
# ============================================================================

# Build the pmi-ingest image.
[group('pmi-ingest')]
ingest-build:
    @touch .env
    docker compose --profile pmi build pmi-ingest

# Run a single REST poll cycle and exit (useful for demos / CI).
[group('pmi-ingest')]
ingest-once:
    docker compose --profile pmi run --rm pmi-ingest run --once

# Start the REST poller in background (long-lived poll loop).
[group('pmi-ingest')]
ingest-up:
    docker compose --profile pmi up -d pmi-ingest
    @echo "✓ pmi-ingest polling every \${POLYMARKET_POLL_INTERVAL_SEC:-300}s. Logs: just ingest-logs"

# Start the deep / cross-venue sources (CLOB depth, history, Kalshi).
[group('pmi-ingest')]
ingest-deep-up:
    docker compose --profile ingest up -d
    @echo "✓ clob · history · kalshi-rest · kalshi-clob up. Logs: just ingest-logs"

# Stop the REST poller.
[group('pmi-ingest')]
ingest-down:
    docker compose --profile pmi stop pmi-ingest && docker compose --profile pmi rm -f pmi-ingest

# Tail all ingest logs.
[group('pmi-ingest')]
ingest-logs:
    docker compose --profile pmi --profile ingest logs -f --tail 50

# ============================================================================
# pmi-workers (supercronic-scheduled job runner over pmi-core)
# ============================================================================

# Build the pmi-workers image.
[group('pmi-workers')]
workers-build:
    @touch .env
    docker compose --profile pmi build pmi-workers

# Run one registered job (e.g. `just workers-run score-all`, `just workers-run hourly`).
[group('pmi-workers')]
workers-run JOB='score-all':
    docker compose --profile pmi run --rm pmi-workers run-job {{JOB}}

# Tick one specific index.
[group('pmi-workers')]
workers-score INDEX_ID='polymarket-war-index':
    docker compose --profile pmi run --rm pmi-workers pmi-workers score {{INDEX_ID}}

# List every registered job name.
[group('pmi-workers')]
workers-list:
    docker compose --profile pmi run --rm pmi-workers pmi-workers list

# Start supercronic (enqueue beats) + the queue worker (executes) together.
[group('pmi-workers')]
workers-up:
    docker compose --profile pmi up -d pmi-workers pmi-worker
    @echo "✓ pmi-workers (supercronic, enqueues) + pmi-worker (queue loop, executes)."
    @echo "  Schedule: pmi-workers/cron/crontab — tail logs: just workers-logs"

# Stop the supercronic + worker containers.
[group('pmi-workers')]
workers-down:
    docker compose --profile pmi stop pmi-workers pmi-worker && docker compose --profile pmi rm -f pmi-workers pmi-worker

# Tail pmi-workers + pmi-worker logs.
[group('pmi-workers')]
workers-logs:
    docker compose --profile pmi logs -f --tail 50 pmi-workers pmi-worker

# Enqueue a job onto the Postgres queue (CORR-4.6): just enqueue score '{"index_id": "polymarket-war-index"}'
[group('pmi-workers')]
enqueue NAME ARGS='':
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -n "{{ARGS}}" ]; then
        docker compose --profile pmi run --rm pmi-workers pmi-workers enqueue {{NAME}} --args '{{ARGS}}'
    else
        docker compose --profile pmi run --rm pmi-workers pmi-workers enqueue {{NAME}}
    fi

# Show recent queue jobs + workflow runs.
[group('pmi-workers')]
queue-ps:
    docker compose exec -T postgres psql -U ${PMI_DB_USER:-warindex} -d ${PMI_DB_NAME:-pmi} -c \
        "SELECT id, name, status, attempts, priority, dedupe_key, enqueued_at, finished_at, left(error, 60) AS error FROM core_jobs ORDER BY id DESC LIMIT 20" -c \
        "SELECT id, workflow, status, steps_done, steps_total, created_at, finished_at FROM core_workflow_runs ORDER BY id DESC LIMIT 10"

# Start a durable backtest workflow (CORR-8.1): just backtest polymarket-war-index 90
[group('pmi-workers')]
backtest INDEX_ID='polymarket-war-index' DAYS='90':
    docker compose --profile pmi run --rm pmi-workers pmi-workers backtest {{INDEX_ID}} --days {{DAYS}}

# Run pmi-workers queue/workflow tests against the dev postgres (needs `just db-up`).
[group('pmi-workers')]
workers-test *ARGS='tests/ -v':
    docker compose --profile pmi run --rm --entrypoint sh \
        -v "{{root_dir}}/pmi-workers/tests:/app/tests:ro" \
        pmi-workers \
        -c "pip install --quiet --no-cache pytest pytest-asyncio && cd /app && python -m pytest {{ARGS}}"

# ============================================================================
# pmi-web (Next.js 15 dashboard over pmi-api)
# ============================================================================

# Build the pmi-web image (multi-stage; `dev` target = next dev).
[group('pmi-web')]
web-build:
    docker compose --profile pmi-web build pmi-web

# Start Next dev server in background. Visit http://localhost:${PMI_WEB_PORT:-3000}.
[group('pmi-web')]
web-up:
    docker compose --profile pmi-web up -d pmi-web
    @echo "✓ pmi-web on http://localhost:${PMI_WEB_PORT:-3000} (depends on pmi-api at :${PMI_API_PORT:-8001})"
    @echo "  Tail logs: just web-logs"

# Stop pmi-web.
[group('pmi-web')]
web-down:
    docker compose --profile pmi-web stop pmi-web && docker compose --profile pmi-web rm -f pmi-web

# Tail pmi-web logs.
[group('pmi-web')]
web-logs:
    docker compose --profile pmi-web logs -f --tail 50 pmi-web

# Local Next dev without Docker (requires Node 20.19+ and `npm install` first).
[group('pmi-web')]
web-dev:
    cd {{root_dir}}/pmi-web && npm run dev

# ============================================================================
# pmi-maga-web (1:1 clone of the legacy micah-frontend maga-index Vite SPA)
# ============================================================================
# Self-contained Vite app (Tailwind v4 + react-router-7) — kept separate from
# pmi-web because their build pipelines are incompatible. Talks to the legacy
# war-index maga API by default (apps/maga-index/.env VITE_API_URL); does not
# need pmi-api. See pmi-maga-web/README.md.

# Build the pmi-maga-web image (multi-stage; `dev`=vite, `prod`=nginx static).
[group('pmi-maga-web')]
maga-build:
    docker compose --profile pmi-maga-web build pmi-maga-web

# Start the Vite dev server in background. Visit http://localhost:${PMI_MAGA_WEB_PORT:-5173}.
[group('pmi-maga-web')]
maga-up:
    docker compose --profile pmi-maga-web up -d pmi-maga-web
    @echo "✓ pmi-maga-web on http://localhost:${PMI_MAGA_WEB_PORT:-5173}"
    @echo "  Tail logs: just maga-logs"

# Stop pmi-maga-web.
[group('pmi-maga-web')]
maga-down:
    docker compose --profile pmi-maga-web stop pmi-maga-web && docker compose --profile pmi-maga-web rm -f pmi-maga-web

# Tail pmi-maga-web logs.
[group('pmi-maga-web')]
maga-logs:
    docker compose --profile pmi-maga-web logs -f --tail 50 pmi-maga-web

# Verify the clone compiles (tsc --noEmit && vite build) inside Docker.
[group('pmi-maga-web')]
maga-buildcheck:
    cd {{root_dir}}/pmi-maga-web && docker build --target build -t pmi-maga-web:buildcheck .

# ============================================================================
# pmi-e2e (full-stack smoke against an isolated pmi_e2e_test database)
# ============================================================================

# Brings the entire P0 stack up against an isolated `pmi_e2e_test` Postgres DB,
# runs migrate → seed → score-all → pmi-api up → curl assertions, then tears
# down. Zero LLM cost (no factor models registered → all-stub).
# See tests/e2e/README.md for details.
[group('pmi-core')]
pmi-e2e *ARGS='tests/e2e/ -v':
    #!/usr/bin/env bash
    set -euo pipefail
    if ! python3 -c "import httpx, pytest" >/dev/null 2>&1; then
        echo "→ Installing pytest + httpx into a transient venv for the harness..."
        python3 -m venv .e2e-venv
        .e2e-venv/bin/pip install --quiet pytest httpx
        PY=.e2e-venv/bin/python
    else
        PY=$(command -v python3)
    fi
    $PY -m pytest {{ARGS}}

# Tear down anything the e2e suite may have left behind (lingering pmi-api
# container after Ctrl-C, leftover pmi_e2e_test database).
[group('pmi-core')]
pmi-e2e-clean:
    -docker compose --profile pmi -f docker-compose.yml -f tests/e2e/docker-compose.e2e.yml stop pmi-api
    -docker compose --profile pmi -f docker-compose.yml -f tests/e2e/docker-compose.e2e.yml rm -f pmi-api
    -docker compose exec -T postgres psql -U ${PMI_DB_USER:-warindex} -d postgres -c "DROP DATABASE IF EXISTS pmi_e2e_test"
    @echo "✓ e2e remnants cleared"

# End-to-end with a LOCAL OLLAMA model as the default factor LLM (not the stub).
# Brings up ollama, pulls MODEL, migrate→seed→score(stub)→binds every factor to
# ollama/MODEL (register+promote)→score again→history. Fully local, no OpenAI key.
# Add API_CHECK=1 to also bring pmi-api up and curl the served score.
#   just e2e-ollama                 # MODEL=llama3.1, index=polymarket-war-index
#   just e2e-ollama qwen2.5:7b
#   API_CHECK=1 just e2e-ollama
[group('pmi-core')]
e2e-ollama MODEL='llama3.1':
    {{root_dir}}/scripts/e2e-ollama.sh {{MODEL}}

# ============================================================================
# Ollama (optional local LLM provider)
# ============================================================================

# Start the Ollama server in background. Auto-uses the host GPU when present
# (NVIDIA driver + Container Toolkit); else CPU. Force with OLLAMA_GPU=1, skip
# with OLLAMA_GPU=0.
[group('ollama')]
ollama-up:
    #!/usr/bin/env bash
    set -euo pipefail
    files=(-f docker-compose.yml)
    want="${OLLAMA_GPU:-auto}"
    have_gpu() { command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1 \
                   && docker info 2>/dev/null | grep -qiE 'Runtimes:.*nvidia'; }
    if [ "$want" = 1 ] || { [ "$want" = auto ] && have_gpu; }; then
      files+=(-f docker-compose.gpu.yml); mode="GPU (nvidia)"
    else
      mode="CPU"
    fi
    docker compose "${files[@]}" --profile ollama up -d ollama
    echo "✓ Ollama [$mode] on http://localhost:${OLLAMA_PORT:-11434}. Pull a model: just ollama-pull llama3.1"

# Pull a model into the running Ollama server.
[group('ollama')]
ollama-pull MODEL='llama3.1':
    docker compose exec ollama ollama pull {{MODEL}}

# Stop the Ollama server.
[group('ollama')]
ollama-down:
    docker compose --profile ollama stop ollama && docker compose --profile ollama rm -f ollama

# ============================================================================
# Misc
# ============================================================================

# Diagnose common local-dev problems.
[group('misc')]
doctor:
    #!/usr/bin/env bash
    echo "=== Environment doctor ==="
    have() { command -v "$1" >/dev/null && echo "✓ $1" || echo "✗ $1  ($2)"; }
    have docker "install Docker Desktop"
    have just   "brew install just"
    have jq     "brew install jq (used by just api-curl)"

    docker compose ps postgres 2>/dev/null | grep -q running \
      && echo "✓ postgres running" \
      || echo "✗ postgres not running  (just db-up)"

    test -f .env && echo "✓ .env present" || echo "✗ .env missing  (cp .env.example .env)"

    grep -q "OPENAI_API_KEY=." .env 2>/dev/null \
      && echo "✓ OPENAI_API_KEY set" \
      || echo "⚠ OPENAI_API_KEY empty  (Tier 1 LLM falls back to stub)"
