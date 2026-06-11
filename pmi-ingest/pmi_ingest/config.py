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

    # ─── Polymarket CLOB orderbook depth (CORR-4.3) ─────────────────────────
    polymarket_clob_base_url: str = Field(default="https://clob.polymarket.com")
    polymarket_clob_poll_interval_sec: int = Field(default=60)
    polymarket_clob_concurrency: int = Field(default=16)
    # Per-cycle ceiling — at 16-way concurrency a 5k-token poll is ~30s.
    # Bump if the active universe genuinely exceeds this and you can afford
    # the latency. Markets dropped from one cycle are picked up on the next.
    polymarket_clob_max_per_cycle: int = Field(default=5000)

    # ─── Polymarket /prices-history backfill (CORR-3.10 / SHIP-4.5) ─────────
    # `interval=max` is the default — one call gets ~200 evenly-spaced bars
    # across each market's whole life. Switch to `1w` / `1d` for finer recent
    # granularity at the cost of older data. Valid: 1h / 6h / 1d / 1w / 1m / max.
    polymarket_history_interval: str = Field(default="max")
    # Minutes-per-bar override. 0 = let server pick (recommended for `max`).
    polymarket_history_fidelity_min: int = Field(default=0)
    # 8-way concurrency stays well under any sane rate limit; bump cautiously.
    polymarket_history_concurrency: int = Field(default=8)
    # Markets per invocation. Multi-cron-beat backfill: at 1000 markets/run
    # and a daily cron, a 10k-market universe completes in ~10 days. Bump
    # if you have headroom or want a one-shot historical seed.
    polymarket_history_max_per_cycle: int = Field(default=1000)

    # ─── Metaculus (REST + RSC) ─────────────────────────────────────────────
    metaculus_api_token: str = Field(default="")  # required since 2025 for list API
    metaculus_page_size: int = Field(default=100)
    metaculus_max_pages: int = Field(default=200)
    metaculus_rsc_concurrency: int = Field(default=5)
    metaculus_user_agent: str = Field(
        default=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        )
    )

    # ─── ForecastEx REST ────────────────────────────────────────────────────
    forecastex_base_url: str = Field(default="https://forecastex.com")
    forecastex_page_size: int = Field(default=100)
    forecastex_max_pages: int = Field(default=50)

    # ─── Gemini prediction-markets REST ─────────────────────────────────────
    gemini_base_url: str = Field(default="https://exchange.gemini.com")

    # ─── Manifold REST ──────────────────────────────────────────────────────
    manifold_base_url: str = Field(default="https://api.manifold.markets")
    manifold_page_size: int = Field(default=1000)
    # `before=<id>` cursor pages of 1000; 50 pages = 50k markets, ample headroom.
    manifold_max_pages: int = Field(default=50)

    # ─── PredictIt REST ─────────────────────────────────────────────────────
    # Whole universe in one call (/api/marketdata/all/); no pagination knobs.
    predictit_base_url: str = Field(default="https://www.predictit.org")

    # ─── Coinbase prediction-markets scraper ───────────────────────────────
    coinbase_enabled: bool = Field(default=False)
    coinbase_page_load_wait_sec: float = Field(default=5.0)
    coinbase_tab_switch_wait_sec: float = Field(default=3.0)
    coinbase_scroll_pause_sec: float = Field(default=2.0)
    coinbase_skip_categories: list[str] = Field(default=["Trending"])
    coinbase_skip_region_check: bool = Field(default=False)
    # Phase-2 per-event-page pacing (rate-limit avoidance).
    coinbase_verify_delay_sec: float = Field(default=3.0)
    coinbase_verify_batch_size: int = Field(default=25)
    coinbase_verify_batch_pause_sec: float = Field(default=10.0)
    coinbase_scrape_workers: int = Field(default=4)

    # ─── Playwright (shared by robinhood + crypto scrapers) ────────────────
    # Disabled by default — set the per-source enable flag below before use.
    # Chromium binary lives in the pmi-ingest image (added in Dockerfile);
    # `playwright install chromium --with-deps` runs at build time.
    playwright_headless: bool = Field(default=True)
    playwright_user_agent: str = Field(
        default=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        )
    )
    playwright_viewport_width: int = Field(default=1280)
    playwright_viewport_height: int = Field(default=900)
    playwright_navigation_timeout_ms: int = Field(default=60_000)
    playwright_nav_delay_sec: float = Field(default=2.0)
    playwright_retry_max: int = Field(default=3)
    playwright_retry_backoff_sec: float = Field(default=30.0)

    # ─── Robinhood prediction-markets scraper ──────────────────────────────
    robinhood_enabled: bool = Field(default=False)
    robinhood_base_url: str = Field(
        default="https://robinhood.com/us/en/prediction-markets/"
    )
    robinhood_page_load_wait_sec: float = Field(default=5.0)
    robinhood_scroll_pause_sec: float = Field(default=2.0)
    robinhood_max_scroll_attempts: int = Field(default=30)
    robinhood_max_no_new_content_scrolls: int = Field(default=3)
    robinhood_discovery_hover_wait_ms: int = Field(default=1500)
    robinhood_scrape_workers: int = Field(default=2)

    # ─── Crypto.com prediction-markets scraper ─────────────────────────────
    crypto_enabled: bool = Field(default=False)
    crypto_page_load_wait_sec: float = Field(default=5.0)
    crypto_max_see_more_clicks: int = Field(default=50)

    # ─── Polymarket CLOB WebSocket (CORR-4.1) ──────────────────────────────
    polymarket_ws_url: str = Field(
        default="wss://ws-subscriptions-clob.polymarket.com/ws/market"
    )
    # How often to refresh the subscribed token list from core_markets.
    # New markets land in core_markets via the REST poller (5-min cadence);
    # 60s here means new markets see WS coverage within ~6min worst case.
    polymarket_ws_token_refresh_sec: int = Field(default=60)
    polymarket_ws_heartbeat_sec: int = Field(default=60)
    # Server closes the socket with no close frame if a single subscribe
    # message exceeds ~10k tokens. Chunk to stay under that ceiling.
    polymarket_ws_subscribe_chunk: int = Field(default=2500)
    # Per-connection cap on subscribed markets. 0 = no cap (server may
    # disconnect on the full live universe — empirically a single
    # connection survives ~thousands but not tens of thousands of tokens).
    # When non-zero, the loader picks the most-recently-active tokens (by
    # closes_at DESC) so we keep coverage on the markets users care about.
    # P1 follow-up: split into N parallel WS connections each holding a
    # disjoint chunk so we can subscribe to the entire universe.
    polymarket_ws_max_tokens: int = Field(default=2000)

    # ─── WS-triggered re-eval (CORR-4.6) ────────────────────────────────────
    # When a trade lands on a market that is a component of some current
    # index's latest score, enqueue a `reeval-market` job onto the Postgres
    # queue (core_jobs) so the pmi-worker re-scores affected indexes ahead of
    # the hourly cron. Debounce is in-memory per market; further storm control
    # (job dedupe + per-index freshness floor) lives queue/worker-side.
    ws_reeval_enabled: bool = Field(default=True)
    ws_reeval_debounce_sec: float = Field(default=60.0)

    # ─── Polygon chain indexer (CORR-4.2) ──────────────────────────────────
    # Leave blank to disable — `pmi-ingest chain` will exit cleanly without
    # an RPC URL configured. Recommended provider: Alchemy / Quicknode /
    # Infura free tier; public RPC may need polygon_indexer_chunk_blocks=500.
    polygon_rpc_url: str = Field(default="")
    polygon_indexer_chunk_blocks: int = Field(default=2000)
    polygon_indexer_chunks_per_cycle: int = Field(default=10)
    polygon_indexer_head_lag_blocks: int = Field(default=32)  # ~64s reorg buffer
    # Polymarket CTF Exchange was deployed at block ~33373050. Older blocks
    # are pre-launch and contain nothing relevant — skip ahead by default.
    polygon_indexer_start_block: int = Field(default=33_373_050)
    polygon_ctf_exchange_address: str = Field(
        default="0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E"
    )
    polygon_ctf_address: str = Field(
        default="0x4D97DCd97eC945f40cF65F87097ACe5EA0476045"
    )
    polygon_uma_oo_address: str = Field(
        default="0xeE3Afe347D5C74317041E2618C49534dAf887c24"
    )
    polygon_uma_adapter_address: str = Field(
        default="0xCB1822859cEF82Cd2Eb4E6276C7D1d3D533DBD12"
    )

    # ─── Trader cohort rollup (CORR-4.2 sub-job) ───────────────────────────
    cohort_window_days: int = Field(default=30)
    cohort_whale_threshold_usd: float = Field(default=100_000.0)
    cohort_mid_threshold_usd: float = Field(default=1_000.0)

    # ─── Kalshi Elections REST ──────────────────────────────────────────────
    kalshi_base_url: str = Field(default="https://api.elections.kalshi.com")
    kalshi_poll_interval_sec: int = Field(default=300)
    kalshi_page_size: int = Field(default=1000)
    kalshi_max_pages: int = Field(default=200)
    # Throttle: sleep between paginated /events and /markets requests to stay
    # under Kalshi's rate limit (429s even when authenticated). 0 = no delay
    # (default, unchanged for existing deployments); set ~0.5 to smooth bursts.
    kalshi_page_delay_sec: float = Field(default=0.0)
    # Auth is optional — leave blank to poll anonymously (lower rate limits).
    # `kalshi_private_key` accepts either an inline PEM (with `\n` allowed) or
    # a filesystem path to a PEM file.
    kalshi_api_key_id: str = Field(default="")
    kalshi_private_key: str = Field(default="")

    # ─── Kalshi orderbook depth (CORR-4.3 Kalshi parity) ────────────────────
    kalshi_clob_poll_interval_sec: int = Field(default=60)
    # Kalshi caps anonymous reads at ~10 rps. 4-way concurrency stays well
    # inside; bump if you set an API key id.
    kalshi_clob_concurrency: int = Field(default=4)
    kalshi_clob_max_per_cycle: int = Field(default=2000)

    # ─── Kalshi WS trade feed (CORR-4.1 Kalshi parity) ─────────────────────
    kalshi_ws_token_refresh_sec: int = Field(default=60)
    kalshi_ws_heartbeat_sec: int = Field(default=60)
    # Per Kalshi docs ~250 market_tickers per subscribe message is safe.
    kalshi_ws_subscribe_chunk: int = Field(default=250)
    # Per-connection cap. 0 = no cap. See polymarket_ws_max_tokens — same
    # tradeoff. Default 1000 keeps the smoke runnable on any Kalshi tier.
    kalshi_ws_max_tokens: int = Field(default=1000)

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
