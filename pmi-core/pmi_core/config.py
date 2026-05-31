"""Pydantic settings loaded from env (PMI_* prefix) and / or .env."""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    db_host: str = Field(default="localhost")
    db_port: int = Field(default=5432)
    db_name: str = Field(default="pmi")
    db_user: str = Field(default="warindex")
    db_password: str = Field(default="warindex")
    db_ssl: bool = Field(default=False)

    # Use the conventional unprefixed `OPENAI_API_KEY` name (matches OpenAI's
    # SDK default and what `pmi_data_platform/.env` provides). Without this
    # alias, the `env_prefix="PMI_"` below would otherwise force callers to
    # use `PMI_OPENAI_API_KEY`, which would confuse anyone copying a key from
    # an `OPENAI_API_KEY=...` env block.
    openai_api_key: str = Field(default="", validation_alias="OPENAI_API_KEY")

    # MLflow tracking + Prompt Registry. Pipeline gracefully degrades if unreachable
    # or if PMI_MLFLOW_ENABLED=false — audit_evaluations remain the source of truth.
    mlflow_tracking_uri: str = Field(default="http://localhost:5500")
    mlflow_enabled: bool = Field(default=True)
    mlflow_experiment_prefix: str = Field(default="pmi.")  # experiments named e.g. "pmi.polymarket-war-index"

    log_level: str = Field(default="INFO")

    model_config = SettingsConfigDict(
        env_prefix="PMI_",
        # Probe order: cwd .env, service-root .env (legacy), platform-root .env
        # (the consolidated single source of truth at pmi_data_platform/.env).
        env_file=(
            ".env",
            Path(__file__).resolve().parents[1] / ".env",
            Path(__file__).resolve().parents[2] / ".env",
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def database_url(self) -> str:
        """Async SQLAlchemy URL."""
        ssl = "?ssl=require" if self.db_ssl else ""
        return (
            f"postgresql+asyncpg://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}{ssl}"
        )

    @property
    def sync_database_url(self) -> str:
        """Sync URL used by Alembic."""
        ssl = "?sslmode=require" if self.db_ssl else ""
        return (
            f"postgresql+psycopg2://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}{ssl}"
        )


settings = Settings()
