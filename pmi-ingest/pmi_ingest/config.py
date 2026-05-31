"""ingest-specific settings — DB config inherited from pmi-core via env."""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class IngestSettings(BaseSettings):
    polymarket_base_url: str = Field(default="https://gamma-api.polymarket.com")
    polymarket_poll_interval_sec: int = Field(default=300)  # 5 min
    polymarket_page_size: int = Field(default=100)
    # Hard cap on pages-per-cycle to bound runaway API costs / accidental loops.
    # The poller stops earlier as soon as it receives a partial page; this ceiling
    # only fires if Polymarket starts paginating beyond N×page_size markets.
    # Default chosen so 1000 × 100 = 100k markets, well above the live universe.
    polymarket_max_pages: int = Field(default=1000)

    # A: mock data mode — bypass the live HTTP call and load markets from a
    # JSON fixture instead. Useful when the host network blocks Polymarket
    # (corporate proxy / DNS filter) or for offline iteration.
    polymarket_use_mock: bool = Field(default=False)
    polymarket_mock_fixture_path: str = Field(default="/app/fixtures/markets.json")

    model_config = SettingsConfigDict(
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


ingest_settings = IngestSettings()
