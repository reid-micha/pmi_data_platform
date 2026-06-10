"""pmi-ingest CLI."""

from __future__ import annotations

import asyncio
import logging
import sys

import click
import structlog

from pmi_core.config import settings
from pmi_ingest.config import ingest_settings
from pmi_ingest.pollers.forecastex_rest import ForecastExRestPoller
from pmi_ingest.pollers.gemini_rest import GeminiRestPoller
from pmi_ingest.pollers.kalshi_clob import KalshiClobPoller
from pmi_ingest.pollers.kalshi_rest import KalshiRestPoller
from pmi_ingest.pollers.manifold_rest import ManifoldRestPoller
from pmi_ingest.pollers.metaculus_rest import MetaculusRestPoller
from pmi_ingest.pollers.mock_polymarket import MockPolymarketPoller
from pmi_ingest.pollers.polymarket_clob import PolymarketClobPoller
from pmi_ingest.pollers.polymarket_history import PolymarketHistoryPoller
from pmi_ingest.pollers.polymarket_rest import PolymarketRestPoller
from pmi_ingest.pollers.predictit_rest import PredictItRestPoller


def _setup_logging() -> None:
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(message)s",
        stream=sys.stdout,
    )
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ]
    )


@click.group()
def cli() -> None:
    """pmi-ingest CLI."""
    _setup_logging()
    from pmi_core.observability import init_sentry

    init_sentry("pmi-ingest")


PollerImpl = (
    PolymarketRestPoller
    | MockPolymarketPoller
    | KalshiRestPoller
    | PolymarketClobPoller
    | KalshiClobPoller
    | MetaculusRestPoller
    | ForecastExRestPoller
    | GeminiRestPoller
    | ManifoldRestPoller
    | PredictItRestPoller
)


def _build_poller(source: str) -> PollerImpl:
    if source == "polymarket-rest":
        if ingest_settings.polymarket_use_mock:
            click.echo(
                f"[polymarket-rest] MOCK mode — loading fixture "
                f"{ingest_settings.polymarket_mock_fixture_path}",
                err=True,
            )
            return MockPolymarketPoller()
        return PolymarketRestPoller()
    if source == "kalshi-rest":
        return KalshiRestPoller()
    if source == "polymarket-clob":
        return PolymarketClobPoller()
    if source == "kalshi-clob":
        return KalshiClobPoller()
    if source == "metaculus-rest":
        return MetaculusRestPoller()
    if source == "forecastex-rest":
        return ForecastExRestPoller()
    if source == "gemini-rest":
        return GeminiRestPoller()
    if source == "manifold-rest":
        return ManifoldRestPoller()
    if source == "predictit-rest":
        return PredictItRestPoller()
    raise click.UsageError(f"Unknown source: {source}")


def _interval_for(source: str) -> int:
    if source == "kalshi-rest":
        return ingest_settings.kalshi_poll_interval_sec
    if source == "polymarket-clob":
        return ingest_settings.polymarket_clob_poll_interval_sec
    if source == "kalshi-clob":
        return ingest_settings.kalshi_clob_poll_interval_sec
    return ingest_settings.polymarket_poll_interval_sec


@cli.command()
@click.option("--once", is_flag=True, help="Run a single cycle and exit.")
@click.option(
    "--source",
    default="polymarket-rest",
    type=click.Choice(
        [
            "polymarket-rest",
            "kalshi-rest",
            "polymarket-clob",
            "kalshi-clob",
            "metaculus-rest",
            "forecastex-rest",
            "gemini-rest",
            "manifold-rest",
            "predictit-rest",
        ]
    ),
    help="Source to poll.",
)
def run(once: bool, source: str) -> None:
    """Run the poller loop, or one cycle with --once."""
    poller = _build_poller(source)
    interval = _interval_for(source)

    async def _loop() -> None:
        while True:
            try:
                count = await poller.run_once()
                click.echo(f"[{poller.name}] processed {count} records")
            except Exception as exc:
                click.echo(f"[{poller.name}] cycle failed: {exc}", err=True)
            if once:
                return
            await asyncio.sleep(interval)

    asyncio.run(_loop())


@cli.command(name="clob")
@click.option("--once", is_flag=True, help="One cycle and exit.")
def clob_cmd(once: bool) -> None:
    """Polymarket CLOB orderbook depth poller (CORR-4.3)."""
    poller = PolymarketClobPoller()
    interval = ingest_settings.polymarket_clob_poll_interval_sec

    async def _loop() -> None:
        while True:
            try:
                count = await poller.run_once()
                click.echo(f"[{poller.name}] {count} orderbook snapshots written")
            except Exception as exc:
                click.echo(f"[{poller.name}] cycle failed: {exc}", err=True)
            if once:
                return
            await asyncio.sleep(interval)

    asyncio.run(_loop())


@cli.command(name="ws")
def ws_cmd() -> None:
    """Polymarket CLOB WebSocket trade-feed consumer (CORR-4.1).

    Long-running. Auto-reconnects with exponential backoff. Heartbeats to
    audit_source_health every `polymarket_ws_heartbeat_sec`.
    """
    # Import lazily so a missing `websockets` dep doesn't break unrelated commands.
    from pmi_ingest.streams.polymarket_ws import PolymarketWsConsumer

    consumer = PolymarketWsConsumer()
    asyncio.run(consumer.run_forever())


@cli.command(name="polymarket-history")
@click.option("--once", is_flag=True, default=True, help="One backfill cycle (default — this poller is one-shot).")
@click.option(
    "--interval",
    type=click.Choice(["1h", "6h", "1d", "1w", "1m", "max"]),
    default=None,
    help="Override POLYMARKET_HISTORY_INTERVAL for this run.",
)
def polymarket_history_cmd(once: bool, interval: str | None) -> None:
    """Polymarket /prices-history backfill (CORR-3.10 / SHIP-4.5).

    Pulls historical price points per active YES token and inserts them
    into `ts_price_snapshots` (last_price only, no bid/ask/volume —
    Polymarket's history endpoint doesn't carry them). Idempotent via the
    `(market_id, snapshot_at)` unique constraint.

    Designed as a daily cron — re-run picks up newly active markets.
    """
    if interval is not None:
        # Per-run override without mutating settings module state.
        ingest_settings.polymarket_history_interval = interval  # type: ignore[misc]
    poller = PolymarketHistoryPoller()

    async def _loop() -> None:
        while True:
            try:
                count = await poller.run_once()
                click.echo(
                    f"[{poller.name}] {count} historical price points inserted "
                    f"(interval={poller._interval})"  # noqa: SLF001 — diagnostic only
                )
            except Exception as exc:
                click.echo(f"[{poller.name}] cycle failed: {exc}", err=True)
            if once:
                return
            # Long sleep — historical data doesn't change retroactively.
            await asyncio.sleep(24 * 3600)

    asyncio.run(_loop())


@cli.command(name="kalshi-clob")
@click.option("--once", is_flag=True, help="One cycle and exit.")
def kalshi_clob_cmd(once: bool) -> None:
    """Kalshi orderbook depth poller (CORR-4.3 Kalshi parity)."""
    poller = KalshiClobPoller()
    interval = ingest_settings.kalshi_clob_poll_interval_sec

    async def _loop() -> None:
        while True:
            try:
                count = await poller.run_once()
                click.echo(f"[{poller.name}] {count} orderbook snapshots written")
            except Exception as exc:
                click.echo(f"[{poller.name}] cycle failed: {exc}", err=True)
            if once:
                return
            await asyncio.sleep(interval)

    asyncio.run(_loop())


@cli.command(name="robinhood-scrape")
def robinhood_scrape_cmd() -> None:
    """Robinhood prediction-markets scraper (legacy Micah port).

    Requires `ROBINHOOD_ENABLED=true` + Playwright Chromium in the image.
    One-shot — schedule via cron.
    """
    from pmi_ingest.scrapers.robinhood.job import RobinhoodScrapeJob

    job = RobinhoodScrapeJob()
    total = job.run_once()
    click.echo(f"[{job.name}] {total} contracts persisted")


@cli.command(name="crypto-scrape")
def crypto_scrape_cmd() -> None:
    """Crypto.com prediction-markets scraper (legacy Micah port).

    Requires `CRYPTO_ENABLED=true` + Playwright Chromium in the image.
    One-shot — schedule via cron.
    """
    from pmi_ingest.scrapers.crypto.job import CryptoScrapeJob

    job = CryptoScrapeJob()
    total = job.run_once()
    click.echo(f"[{job.name}] {total} contracts persisted")


@cli.command(name="coinbase-scrape")
def coinbase_scrape_cmd() -> None:
    """Coinbase prediction-markets scraper (legacy Micah port).

    Requires `COINBASE_ENABLED=true` + Playwright Chromium in the image.
    Two-phase (GraphQL-intercept discovery → per-event-page extraction);
    one-shot — schedule via cron.
    """
    from pmi_ingest.scrapers.coinbase.job import CoinbaseScrapeJob

    job = CoinbaseScrapeJob()
    total = job.run_once()
    click.echo(f"[{job.name}] {total} contracts persisted")


@cli.command(name="kalshi-ws")
def kalshi_ws_cmd() -> None:
    """Kalshi WebSocket trade-feed consumer (CORR-4.1 Kalshi parity).

    Long-running. Requires KALSHI_API_KEY_ID + KALSHI_PRIVATE_KEY — Kalshi
    has no anonymous WS access. Without creds the consumer logs an error
    and sleeps; set env then restart.
    """
    from pmi_ingest.streams.kalshi_ws import KalshiWsConsumer

    consumer = KalshiWsConsumer()
    asyncio.run(consumer.run_forever())


@cli.command(name="chain")
@click.option("--once", is_flag=True, help="One indexer cycle and exit.")
def chain_cmd(once: bool) -> None:
    """Polygon chain log indexer (CORR-4.2).

    Reads CTF Exchange OrderFilled + ConditionalTokens + UMA Optimistic
    Oracle events. Idempotent on `(tx_hash, log_index)`. Set
    `POLYGON_RPC_URL` to enable; without it the cycle is a no-op.
    """
    from pmi_ingest.chain.polygon_indexer import PolygonChainIndexer

    indexer = PolygonChainIndexer()

    async def _loop() -> None:
        while True:
            try:
                count = await indexer.run_once()
                click.echo(f"[{indexer.name}] {count} chain events written")
            except Exception as exc:
                click.echo(f"[{indexer.name}] cycle failed: {exc}", err=True)
            if once:
                return
            # At head we naturally produce 0 events; keep cadence so we
            # surface new blocks within ~30s of finality.
            await asyncio.sleep(30)

    asyncio.run(_loop())


@cli.command(name="cohort")
def cohort_cmd() -> None:
    """Recompute trader cohort labels (whale / mid / retail).

    Reads the last `COHORT_WINDOW_DAYS` of chain-sourced trades, sums per-
    wallet notional, classifies. Independent of the chain indexer beat —
    schedule this on a daily cron.
    """
    from pmi_ingest.chain.cohort import run_cohort_rollup

    touched = asyncio.run(run_cohort_rollup())
    click.echo(f"[polygon-cohort] {touched} trader rows updated")


@cli.command(name="uma")
@click.option(
    "--gamma-only",
    is_flag=True,
    help="Skip on-chain projection; use Polymarket Gamma raw.umaResolutionStatuses only.",
)
def uma_cmd(gamma_only: bool) -> None:
    """Project UMA dispute / settle state onto core_markets.chain_resolution (CORR-4.4)."""
    from pmi_ingest.chain.uma_resolver import run_uma_projection

    updated = asyncio.run(run_uma_projection(gamma_only=gamma_only))
    click.echo(
        f"[polymarket-uma] chain_resolution updated on {updated} markets "
        f"({'gamma-only' if gamma_only else 'gamma + chain'} mode)"
    )


if __name__ == "__main__":
    cli()
