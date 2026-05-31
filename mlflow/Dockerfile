# MLflow tracking server: thin layer over python:3.12-slim that installs the
# server + Postgres driver + boto3 (S3-compatible artifact store, P1+).
#
# Version pin: 2.22.x — Prompt Registry API stable; matches mlflow-skinny client
# pinned in pmi_data_platform/pmi-core/pyproject.toml (mlflow-skinny>=2.22,<3).
# Older 2.18 server rejected client 'dummy-source' on register_prompt — keep
# the two ends in lockstep.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libpq5 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    "mlflow>=2.22,<3" \
    "psycopg2-binary>=2.9.9" \
    "boto3>=1.34"

WORKDIR /mlflow

EXPOSE 5000

# Defaults; can be overridden via env in docker-compose.
ENV MLFLOW_BACKEND_STORE_URI=postgresql+psycopg2://warindex:warindex@postgres:5432/mlflow \
    MLFLOW_ARTIFACTS_DESTINATION=/mlartifacts \
    MLFLOW_PORT=5000

# `mlflow server` runs `db upgrade` on first boot to create / migrate its schema.
ENTRYPOINT ["sh", "-c", "exec mlflow server \
    --host 0.0.0.0 \
    --port $MLFLOW_PORT \
    --backend-store-uri $MLFLOW_BACKEND_STORE_URI \
    --artifacts-destination $MLFLOW_ARTIFACTS_DESTINATION \
    --serve-artifacts"]
