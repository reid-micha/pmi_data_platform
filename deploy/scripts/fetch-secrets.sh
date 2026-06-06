#!/usr/bin/env bash
# Render deploy/.env from a committed non-secret base + an AWS Secrets Manager
# JSON secret. Runs at boot (via pmi-env-fetch.service) before compose starts,
# so secrets never live in the AMI or in git — only in Secrets Manager + the
# ephemeral .env on the instance.
#
#   Secret layout (JSON), name from $PMI_SECRET_ID (default pmi/prod/secrets):
#     {
#       "PMI_DB_PASSWORD": "...",
#       "OPENAI_API_KEY": "sk-...",
#       "PMI_API_KEY": "pmi_...",           # dashboard service key (pmi-web)
#       "MLFLOW_BASICAUTH_HASH": "$2a$...", # caddy hash-password output
#       "KALSHI_API_KEY_ID": "...",         # optional
#       "KALSHI_PRIVATE_KEY": "-----BEGIN...# optional; PEM (\n-escaped) or path
#     }
#
# Requires: aws CLI + jq on the instance, and an instance IAM role allowed to
# secretsmanager:GetSecretValue on the secret.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/pmi/app}"
DEPLOY_DIR="${APP_DIR}/deploy"
SECRET_ID="${PMI_SECRET_ID:-pmi/prod/secrets}"
REGION="${AWS_REGION:-us-east-1}"

cd "${DEPLOY_DIR}"

if [[ ! -f .env.base ]]; then
  echo "fetch-secrets: missing ${DEPLOY_DIR}/.env.base" >&2
  exit 1
fi

echo "fetch-secrets: pulling ${SECRET_ID} from Secrets Manager (${REGION})" >&2
secret_json="$(aws secretsmanager get-secret-value \
  --secret-id "${SECRET_ID}" \
  --region "${REGION}" \
  --query SecretString --output text)"

umask 077
{
  echo "# ─── Generated $(date -u +%FT%TZ) by fetch-secrets.sh — DO NOT EDIT ───"
  echo "# Non-secret base:"
  cat .env.base
  echo ""
  echo "# Secrets from ${SECRET_ID}:"
  # Flatten the JSON object to KEY=VALUE lines (skip the kalshi PEM — written
  # to its own file below so newlines survive).
  echo "${secret_json}" | jq -r '
    to_entries[]
    | select(.key != "KALSHI_PRIVATE_KEY")
    | "\(.key)=\(.value)"'
} > .env

# Kalshi private key → its own file (compose bind-mounts deploy/kalshi.key).
# Always create the file so the bind mount has a target even when unset.
kalshi_pem="$(echo "${secret_json}" | jq -r '.KALSHI_PRIVATE_KEY // empty')"
if [[ -n "${kalshi_pem}" ]]; then
  printf '%b' "${kalshi_pem}" > kalshi.key
else
  : > kalshi.key
fi
chmod 600 .env kalshi.key

echo "fetch-secrets: wrote ${DEPLOY_DIR}/.env and kalshi.key" >&2
