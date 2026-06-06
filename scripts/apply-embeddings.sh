#!/usr/bin/env bash
# ============================================================================
# apply-embeddings.sh — bring a machine up to the Ollama-embeddings / Tier 0
# pre-filter change (CORR-3.6 + CORR-5.1) after a `git pull`.
#
# What it does, in order:
#   1. build pmi-core            (the alembic 0007 migration is baked INTO the
#                                 image — a rebuild is mandatory before migrate)
#   2. migrate                   (vec_market_embeddings.embedding → unsized vector)
#   3. [unless MIGRATE_ONLY=1] ollama up + pull the embedding model
#   4. run-job embed-markets     (populate vec_market_embeddings, append-only)
#   5. run-job score-all         (Tier 0 now active for any index def with a
#                                 `semantic` anchor; others are unaffected)
#
# Safe to re-run: migrate is idempotent (no-op at head), embed-markets dedups on
# (market_id, model, text_sha256), scoring reuses cached evaluations.
#
# Without Ollama nothing breaks — SemanticSelector + Tier 0 fail open (no-op) —
# so `MIGRATE_ONLY=1` is a valid "just apply the schema" mode.
#
# Usage (from anywhere):
#   pmi_data_platform/scripts/apply-embeddings.sh
#
# Env overrides:
#   EMBED_MODEL    bare Ollama embedding tag   (default: nomic-embed-text)
#   MIGRATE_ONLY   1 = stop after migrate, skip ollama/embed/score (default: 0)
#   SCORE          1 = run score-all after embedding (default: 1)
# ============================================================================
set -euo pipefail

MODEL="${EMBED_MODEL:-nomic-embed-text}"
MIGRATE_ONLY="${MIGRATE_ONLY:-0}"
SCORE="${SCORE:-1}"

# Resolve workspace root (the dir holding docker-compose.yml), regardless of CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"   # …/pmi_data_platform/scripts → workspace root
cd "$ROOT"

if [ ! -f docker-compose.yml ]; then
  echo "✗ docker-compose.yml not found in $ROOT — run from the micah workspace." >&2
  exit 1
fi

DC="docker compose --profile pmi"
CORE="$DC run --rm -T pmi-core"
WORKERS="$DC run --rm -T pmi-workers"

echo "════════════════════════════════════════════════════════════════════"
echo " apply-embeddings │ model=ollama/$MODEL │ migrate_only=$MIGRATE_ONLY"
echo "════════════════════════════════════════════════════════════════════"

echo "▶ 1/5  Postgres up + build pmi-core (rebuild needed: migration is in the image)"
docker compose up -d postgres
$DC build pmi-core

echo "▶ 2/5  migrate (vec_market_embeddings.embedding → unsized vector)"
$CORE migrate

if [ "$MIGRATE_ONLY" = "1" ]; then
  echo "════════════════════════════════════════════════════════════════════"
  echo " ✓ schema applied (MIGRATE_ONLY=1) — embeddings/scoring skipped."
  echo "════════════════════════════════════════════════════════════════════"
  exit 0
fi

echo "▶ 3/5  Ollama up + pull $MODEL  (weights are heavy — first run is slow)"
docker compose --profile ollama up -d ollama
docker compose exec -T ollama sh -c 'until ollama list >/dev/null 2>&1; do sleep 1; done'
docker compose exec -T ollama ollama pull "$MODEL"

echo "▶ 4/5  run-job embed-markets  (populate vec_market_embeddings)"
$WORKERS run-job embed-markets

if [ "$SCORE" = "1" ]; then
  echo "▶ 5/5  run-job score-all  (Tier 0 active for indexes with a semantic anchor)"
  $WORKERS run-job score-all
else
  echo "▶ 5/5  (skipped score-all — set SCORE=1 to enable)"
fi

echo "════════════════════════════════════════════════════════════════════"
echo " ✓ done — embeddings populated with ollama/$MODEL; Tier 0 pre-filter live."
echo "   tear down ollama:  docker compose --profile ollama down"
echo "════════════════════════════════════════════════════════════════════"
