"""pmi-api settings layered on top of pmi-core's DB config."""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ApiSettings(BaseSettings):
    require_auth: bool = Field(default=True)
    cors_origins: str = Field(default="")  # comma-separated; "" = no CORS
    port: int = Field(default=8000)

    model_config = SettingsConfigDict(
        env_prefix="PMI_API_",
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
    def cors_origins_list(self) -> list[str]:
        if not self.cors_origins:
            return []
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


api_settings = ApiSettings()
