FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN pip install --no-cache-dir "uv>=0.4.0"

WORKDIR /app

# pmi-core is mounted at runtime via docker-compose volumes (see workspace docker-compose.yml).
# We still install pmi-ingest's own deps at build time.
COPY pyproject.toml ./
COPY pmi_ingest ./pmi_ingest

# Install only ingest deps; pmi-core comes from the bind mount.
RUN uv pip install --system --no-cache \
    "httpx>=0.27.0" \
    "structlog>=24.1.0" \
    "tenacity>=8.4.0" \
    "click>=8.1.7" \
    "pydantic>=2.7.0" \
    "pydantic-settings>=2.3.0" \
    "sqlalchemy[asyncio]>=2.0.30" \
    "asyncpg>=0.29.0" \
    "pgvector>=0.3.0" \
    "pyyaml>=6.0.1"

ENTRYPOINT ["python", "-m", "pmi_ingest.cli"]
CMD ["run"]
