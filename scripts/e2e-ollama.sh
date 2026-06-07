#!/usr/bin/env bash
# ============================================================================
# e2e-ollama.sh — run the P0 pipeline end-to-end with a *local Ollama* model
# as the default factor LLM (instead of the deterministic stub / OpenAI).
#
# "Default LLM = ollama" is NOT an env switch: factor → model binding lives in
# the DB (core_factor_models). resolve_factor_model() only calls a real LLM
# when a CoreFactorModel row is promoted to (stage=production, is_active=true)
# for that factor; otherwise it falls back to DEFAULT_STUB_MODEL_ID and never
# hits an LLM. So this script:
#
#   1. brings up ollama + pulls the model
#   2. migrate + seed
#   3. scores ONCE with the stub  → populates core_prompts (models register
#      refuses to run until the baseline prompt rows exist)
#   4. registers + promotes an `ollama/<model>` CoreFactorModel for every
#      factor of the target index
#   5. scores AGAIN → every factor now resolves to ollama/<model>
#   6. prints history + the live factor-model bindings, then (optional) curls
#      pmi-api to prove the score is served.
#
# Fully local & free: needs Ollama only, no OPENAI_API_KEY.
#
# Usage (from anywhere):
#   pmi_data_platform/scripts/e2e-ollama.sh [MODEL]
#   just e2e-ollama                       # MODEL=llama3.1, index=polymarket-war-index
#   just e2e-ollama qwen2.5:7b
#
# Env overrides:
#   OLLAMA_MODEL        default model tag           (default: llama3.1)
#   INDEX_ID            index to score              (default: polymarket-war-index)
#   OLLAMA_TEMPERATURE  factor-model temperature    (default: 0.1)
#   API_CHECK=1         also bring pmi-api up + curl the score (default: off)
# ============================================================================
set -euo pipefail

MODEL="${1:-${OLLAMA_MODEL:-llama3.1}}"
INDEX_ID="${INDEX_ID:-polymarket-war-index}"
TEMP="${OLLAMA_TEMPERATURE:-0.1}"

# Resolve the pmi_data_platform root (the dir holding docker-compose.yml),
# regardless of CWD. This platform is self-contained — it does NOT use the
# legacy Micah workspace one level up.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"   # …/pmi_data_platform/scripts → pmi_data_platform
cd "$ROOT"

if [ ! -f docker-compose.yml ]; then
  echo "✗ docker-compose.yml not found in $ROOT — run from pmi_data_platform/." >&2
  exit 1
fi
if [ ! -f .env ]; then
  echo "→ .env missing — seeding from .env.example"
  cp .env.example .env
fi

DC="docker compose --profile pmi"
CORE="$DC run --rm -T pmi-core"

# factor_id : core_prompts.name : version   (must match the index_def YAML).
# For polymarket-war-index, prompt_ref `prompts/factors/<x>-vN` maps to
# core_prompts (name=factors/<x>, version=N) via pipeline._ensure_prompt.
FACTORS=(
  "direction:factors/direction:1"
  "directly_about_war:factors/directly_about_war:1"
  "armed_conflict:factors/armed_conflict:1"
  "state_actor:factors/state_actor:1"
  "kinetic_action:factors/kinetic_action:1"
  "near_term:factors/near_term:1"
  "high_severity:factors/high_severity:1"
)

# Pull the integer `id` out of `models register` JSON. Filter on the
# register result (stage=staging) so any mlflow/structlog noise is ignored.
extract_id() {
  python3 -c '
import sys, json, re
buf = sys.stdin.read()
for m in re.finditer(r"\{[^{}]*\}", buf, re.S):
    try:
        o = json.loads(m.group(0))
    except Exception:
        continue
    if isinstance(o, dict) and "id" in o and o.get("stage") == "staging":
        print(o["id"]); break
'
}

echo "════════════════════════════════════════════════════════════════════"
echo " e2e-ollama │ model=ollama/$MODEL │ index=$INDEX_ID │ temp=$TEMP"
echo "════════════════════════════════════════════════════════════════════"

echo "▶ 1/7  Ollama up + pull $MODEL  (image + weights are heavy — first run is slow)"
docker compose --profile ollama up -d ollama
echo "       waiting for ollama to answer…"
docker compose exec -T ollama sh -c 'until ollama list >/dev/null 2>&1; do sleep 1; done'
docker compose exec -T ollama ollama pull "$MODEL"

echo "▶ 2/7  Postgres + MLflow + build pmi-core"
docker compose up -d postgres
docker compose --profile mlflow up -d mlflow || echo "  (mlflow optional — continuing)"
$DC build pmi-core

echo "▶ 3/7  migrate + seed"
$CORE migrate
$CORE seed

echo "▶ 4/7  score once (stub) — registers baseline prompts into core_prompts"
$CORE score "$INDEX_ID"

echo "▶ 5/7  bind every factor to ollama/$MODEL  (register → promote)"
for entry in "${FACTORS[@]}"; do
  IFS=":" read -r fid pname pver <<< "$entry"
  printf '  → %-20s register…' "$fid"
  out="$($CORE models register \
            --factor "$fid" \
            --prompt-name "$pname" \
            --prompt-version "$pver" \
            --llm "ollama/$MODEL" \
            --temperature "$TEMP" 2>&1)" || { echo " FAILED"; echo "$out" >&2; exit 1; }
  rid="$(printf '%s' "$out" | extract_id)"
  if [ -z "$rid" ]; then
    echo " FAILED (could not parse model id)"; echo "$out" >&2; exit 1
  fi
  printf ' id=%s → promote production\n' "$rid"
  $CORE models promote "$rid" --stage production >/dev/null
done

echo "▶ 6/7  score again — factors now resolve to ollama/$MODEL"
$CORE score "$INDEX_ID"
echo "  --- recent ts_index_scores ---"
$CORE history "$INDEX_ID"
echo "  --- live factor-model bindings (model_source should be 'registry') ---"
$CORE models list

if [ "${API_CHECK:-0}" = "1" ]; then
  echo "▶ 7/7  pmi-api up + curl the served score"
  docker compose --profile pmi up -d pmi-api
  PORT="${PMI_API_PORT:-8001}"
  echo "       waiting for pmi-api on :$PORT…"
  for _ in $(seq 1 30); do curl -fsS "http://localhost:$PORT/health" >/dev/null 2>&1 && break; sleep 1; done
  curl -fsS "http://localhost:$PORT/indexes/$INDEX_ID/score" | (jq . 2>/dev/null || cat)
else
  echo "▶ 7/7  (skipped pmi-api check — set API_CHECK=1 to enable)"
fi

echo "════════════════════════════════════════════════════════════════════"
echo " ✓ done — $INDEX_ID scored end-to-end with ollama/$MODEL"
echo "   audit: each audit_evaluations row now has model_id=ollama/$MODEL"
echo "   tear down ollama:  docker compose --profile ollama down"
echo "════════════════════════════════════════════════════════════════════"
