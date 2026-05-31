"""`pmi-workers` Click CLI.

Local debug surface. The production cron entry point is `run-job <name>`
(see [`pmi_workers.runner`](runner.py)); this CLI is just sugar for humans:

    pmi-workers list                       # all registered jobs
    pmi-workers run <name>                 # run one by registered name
    pmi-workers score <index_id>           # shortcut for one PMI tick

P1 lands `pmi-workers arq` to start the Arq listener. Kept stubbed so the
help text already advertises the shape.
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys

import click
import structlog

from pmi_core.config import settings
from pmi_workers import registry
from pmi_workers.jobs.score import score_index


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
    """pmi-workers CLI."""
    _setup_logging()


@cli.command(name="list")
def list_jobs() -> None:
    """List every registered job name."""
    names = registry.all_names()
    if not names:
        click.echo("(no jobs registered)")
        return
    for n in names:
        click.echo(n)


@cli.command()
@click.argument("name")
def run(name: str) -> None:
    """Run a registered job by name."""
    try:
        job = registry.get(name)
    except KeyError:
        click.echo(f"error: '{name}' not registered. Try `pmi-workers list`.", err=True)
        sys.exit(2)
    asyncio.run(job())


@cli.command()
@click.argument("index_id")
def score(index_id: str) -> None:
    """Run one pipeline tick for INDEX_ID (shortcut over `run score:<id>`)."""
    result = asyncio.run(score_index(index_id))
    click.echo(json.dumps(result, indent=2, default=str))


@cli.command()
def arq() -> None:
    """Start the Arq listener (P1, install with `.[arq]`)."""
    click.echo(
        "Arq worker not implemented yet — landing in P1 alongside Redis. "
        "See README.md 'Why not P0?'.",
        err=True,
    )
    sys.exit(1)


if __name__ == "__main__":
    cli()
