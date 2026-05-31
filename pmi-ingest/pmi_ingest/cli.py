"""pmi-ingest CLI."""

from __future__ import annotations

import asyncio
import logging
import sys

import click
import structlog

from pmi_core.config import settings
from pmi_ingest.config import ingest_settings
from pmi_ingest.pollers.mock_polymarket import MockPolymarketPoller
from pmi_ingest.pollers.polymarket_rest import PolymarketRestPoller


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


@cli.command()
@click.option("--once", is_flag=True, help="Run a single cycle and exit.")
@click.option(
    "--source",
    default="polymarket-rest",
    type=click.Choice(["polymarket-rest"]),
    help="Source to poll (P0 has one).",
)
def run(once: bool, source: str) -> None:
    """Run the poller loop, or one cycle with --once.

    Selects mock vs live based on `POLYMARKET_USE_MOCK` in the env-loaded
    `IngestSettings`. The choice is logged so it's obvious in container logs.
    """
    if source != "polymarket-rest":
        raise click.UsageError(f"Source not supported at P0: {source}")
    if ingest_settings.polymarket_use_mock:
        click.echo(
            f"[polymarket-rest] MOCK mode — loading fixture "
            f"{ingest_settings.polymarket_mock_fixture_path}",
            err=True,
        )
        poller: PolymarketRestPoller | MockPolymarketPoller = MockPolymarketPoller()
    else:
        poller = PolymarketRestPoller()

    async def _loop() -> None:
        while True:
            try:
                count = await poller.run_once()
                click.echo(f"[{poller.name}] processed {count} markets")
            except Exception as exc:
                click.echo(f"[{poller.name}] cycle failed: {exc}", err=True)
            if once:
                return
            await asyncio.sleep(ingest_settings.polymarket_poll_interval_sec)

    asyncio.run(_loop())


if __name__ == "__main__":
    cli()
