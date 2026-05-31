"""`pmi-core` CLI.

Flat command surface matches the workspace `justfile` contract:

    pmi-core migrate        # alembic upgrade head
    pmi-core seed           # load /app/fixtures/markets.json (if present) + register index def
    pmi-core score <ID>     # one pipeline tick
    pmi-core history <ID>   # print N most recent ts_index_scores rows
    pmi-core list-defs      # list index_defs YAML files on disk
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import click
import structlog
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from pmi_core.config import settings
from pmi_core.db import session_scope

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURES_DIR = Path(os.environ.get("PMI_FIXTURES_DIR", "/app/fixtures"))


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
    """pmi-core CLI."""
    _setup_logging()


@cli.command()
@click.argument("revision", default="head")
def migrate(revision: str) -> None:
    """Apply alembic migrations up to REVISION (default: head)."""
    cmd = ["alembic", "-c", str(REPO_ROOT / "alembic.ini"), "upgrade", revision]
    click.echo(f"$ {' '.join(cmd)}")
    sys.exit(subprocess.call(cmd, cwd=REPO_ROOT))


def _parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


async def _seed_markets_from_fixture(session: AsyncSession, fixture_path: Path) -> tuple[int, int]:
    """UPSERT core_markets + write one ts_price_snapshot per market with prices.

    Returns (markets_touched, price_snapshots_written).
    """
    from pmi_core.models import CoreMarket, TsPriceSnapshot

    data = json.loads(fixture_path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise click.ClickException(f"{fixture_path}: expected JSON list of markets")

    markets_touched = 0
    snapshots_written = 0
    now = datetime.now(UTC)

    for m in data:
        venue = m.get("venue") or "polymarket"
        external_id = str(m.get("external_id") or m.get("id"))
        if not external_id or external_id == "None":
            continue
        stmt = pg_insert(CoreMarket).values(
            venue=venue,
            external_id=external_id,
            slug=m.get("slug"),
            title=m.get("title") or m.get("question") or "(untitled fixture)",
            description=m.get("description"),
            category=m.get("category"),
            tags=m.get("tags"),
            opens_at=_parse_dt(m.get("opens_at")),
            closes_at=_parse_dt(m.get("closes_at")),
            resolved_at=_parse_dt(m.get("resolved_at")),
            resolution=m.get("resolution"),
            raw=m,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["venue", "external_id"],
            set_={
                "title": stmt.excluded.title,
                "description": stmt.excluded.description,
                "category": stmt.excluded.category,
                "tags": stmt.excluded.tags,
                "raw": stmt.excluded.raw,
                "updated_at": now,
            },
        ).returning(CoreMarket.id)
        market_id = (await session.execute(stmt)).scalar_one()
        markets_touched += 1

        last_price = m.get("last_price")
        if last_price is not None:
            session.add(
                TsPriceSnapshot(
                    market_id=market_id,
                    snapshot_at=now,
                    last_price=last_price,
                    volume_24h=m.get("volume_24h"),
                )
            )
            snapshots_written += 1

    return markets_touched, snapshots_written


async def _seed_async() -> None:
    """Best-effort: load fixture markets if present, then ensure the baseline IndexDef row."""
    from pmi_core.dsl.ir import load_index_def
    from pmi_core.engine.pipeline import _ensure_index_definition  # type: ignore

    fixture = FIXTURES_DIR / "markets.json"

    async with session_scope() as session:
        if fixture.exists():
            markets, snapshots = await _seed_markets_from_fixture(session, fixture)
            click.echo(
                f"✓ seeded {markets} markets, {snapshots} price snapshots from {fixture}"
            )
        else:
            click.echo(f"… no fixture at {fixture}; skipping market seed (ingest will populate).")

        index_dir = REPO_ROOT / "pmi_core" / "index_defs"
        for yaml_path in sorted(index_dir.glob("*.yaml")):
            ir, yaml_text, sha256 = load_index_def(yaml_path)
            row = await _ensure_index_definition(session, ir, yaml_text, sha256)
            click.echo(f"✓ index_def registered: {row.index_id} v{row.version} (id={row.id})")


@cli.command()
def seed() -> None:
    """Load fixture markets + register baseline index definitions."""
    asyncio.run(_seed_async())


@cli.command()
@click.argument("index_id", default="polymarket-war-index")
def score(index_id: str) -> None:
    """Run one pipeline tick for INDEX_ID and persist to ts_index_scores."""
    from pmi_core.engine import run_pipeline

    result = asyncio.run(run_pipeline(index_id=index_id))
    click.echo(json.dumps(result, indent=2, default=str))


async def _history_async(index_id: str, limit: int) -> list[dict]:
    from pmi_core.models import CoreIndexDefinition, TsIndexScore

    async with session_scope() as session:
        def_row = (
            await session.execute(
                select(CoreIndexDefinition)
                .where(CoreIndexDefinition.index_id == index_id)
                .order_by(CoreIndexDefinition.version.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if def_row is None:
            return []
        rows = (
            await session.execute(
                select(TsIndexScore)
                .where(TsIndexScore.index_definition_id == def_row.id)
                .order_by(TsIndexScore.as_of.desc())
                .limit(limit)
            )
        ).scalars().all()
        return [
            {
                "as_of": r.as_of.isoformat(),
                "score": float(r.score),
                "component_count": r.component_count,
                "breakdown": r.breakdown,
            }
            for r in rows
        ]


@cli.command()
@click.argument("index_id", default="polymarket-war-index")
@click.option("--limit", default=10, type=int)
def history(index_id: str, limit: int) -> None:
    """Print the most recent N ts_index_scores rows for INDEX_ID."""
    rows = asyncio.run(_history_async(index_id, limit))
    click.echo(json.dumps(rows, indent=2))


@cli.command("list-defs")
def list_defs() -> None:
    """List index_defs available on disk."""
    defs = sorted((REPO_ROOT / "pmi_core" / "index_defs").glob("*.yaml"))
    for d in defs:
        click.echo(d.stem)


# ──────────────────────────────────────────────────────────────────────────
# dry-run: pipeline in-process, never touches the DB
# ──────────────────────────────────────────────────────────────────────────


@cli.command("dry-run")
@click.argument(
    "yaml_path",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
)
@click.option(
    "--fixture",
    "fixture_path",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    default=None,
    help="JSON list of markets. Default: pmi_data_platform/pmi-demo/fixtures/markets.json",
)
@click.option(
    "--compact/--full",
    default=False,
    help="Compact prints only score + counts. Full prints per-factor evaluations.",
)
def dry_run(yaml_path: Path, fixture_path: Path | None, compact: bool) -> None:
    """Run the pipeline IN MEMORY against a fixture — never writes to the DB.

    Useful for iterating on a YAML index_def: tweak a selector or factor
    weight, re-run, diff the report. No Postgres, no MLflow, no migrations.
    """
    from pmi_core.dsl.ir import load_index_def
    from pmi_core.engine.dry_run import dry_run as engine_dry_run

    if fixture_path is None:
        candidate = REPO_ROOT.parent / "pmi-demo" / "fixtures" / "markets.json"
        if not candidate.exists():
            raise click.ClickException(
                f"No fixture at {candidate}. Pass --fixture explicitly."
            )
        fixture_path = candidate

    ir, _yaml_text, sha256 = load_index_def(yaml_path)
    report = engine_dry_run(ir, fixture_path, yaml_sha256=sha256)

    if compact:
        click.echo(
            json.dumps(
                {
                    "index_id": report.index_id,
                    "version": report.version,
                    "score": report.aggregation["score"],
                    "component_count": report.aggregation["component_count"],
                    "selectors_candidates": report.selectors["candidates_returned"],
                    "fixture_market_count": report.fixture_market_count,
                    "formula_declared": report.aggregation["formula_declared"],
                    "formula_used": report.aggregation["formula_used"],
                },
                indent=2,
            )
        )
    else:
        click.echo(json.dumps(report.to_dict(), indent=2, default=str))


# ──────────────────────────────────────────────────────────────────────────
# schema: dump JSON Schema for IndexDef YAML
# ──────────────────────────────────────────────────────────────────────────


SCHEMA_OUTPUT_PATH = REPO_ROOT / "pmi_core" / "dsl" / "schema" / "index-def.schema.json"


@cli.group("schema")
def schema() -> None:
    """JSON Schema utilities for the IndexDef YAML DSL."""


@schema.command("dump")
@click.option(
    "--output",
    "output_path",
    type=click.Path(dir_okay=False, path_type=Path),
    default=None,
    help=f"Where to write the schema. Default: {SCHEMA_OUTPUT_PATH}",
)
@click.option(
    "--stdout",
    "to_stdout",
    is_flag=True,
    default=False,
    help="Print to stdout instead of writing to a file.",
)
def schema_dump(output_path: Path | None, to_stdout: bool) -> None:
    """Emit JSON Schema (draft 2020-12) for IndexDef. Run after changing IR fields."""
    from pmi_core.dsl.ir import IndexDef

    schema_obj = IndexDef.model_json_schema()
    schema_obj["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema_obj["$id"] = "https://pmi-platform.example.com/schema/index-def.schema.json"
    text = json.dumps(schema_obj, indent=2, sort_keys=True) + "\n"

    if to_stdout:
        click.echo(text, nl=False)
        return

    dest = output_path or SCHEMA_OUTPUT_PATH
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(text, encoding="utf-8")
    click.echo(f"✓ wrote {dest} ({len(text)} bytes)")


# ──────────────────────────────────────────────────────────────────────────
# MLflow
# ──────────────────────────────────────────────────────────────────────────


async def _mlflow_init_async() -> dict:
    """Backfill MLflow links for any rows missing them.

    1. Ensure an MLflow experiment exists for every index_id and persist its id
       on `core_index_definitions.mlflow_experiment_id` (where NULL).
    2. Register every `core_prompts` row to MLflow Prompt Registry and persist
       its URI on `core_prompts.mlflow_prompt_uri` (where NULL).

    Safe to re-run: skips rows already populated, idempotent on MLflow side via
    sha256 tag.
    """
    from pmi_core import mlflow_client
    from pmi_core.models import CoreIndexDefinition, CorePrompt

    if not mlflow_client.is_enabled():
        raise click.ClickException(
            f"MLflow at {settings.mlflow_tracking_uri} unreachable. "
            "Bring up `just mlflow-up` first or set PMI_MLFLOW_ENABLED=false."
        )

    experiments_linked = 0
    prompts_linked = 0

    async with session_scope() as session:
        for row in (
            await session.execute(
                select(CoreIndexDefinition).where(
                    CoreIndexDefinition.mlflow_experiment_id.is_(None)
                )
            )
        ).scalars().all():
            exp_id = mlflow_client.ensure_experiment(row.index_id)
            if exp_id is not None:
                row.mlflow_experiment_id = exp_id
                experiments_linked += 1

        for row in (
            await session.execute(
                select(CorePrompt).where(CorePrompt.mlflow_prompt_uri.is_(None))
            )
        ).scalars().all():
            uri = mlflow_client.register_prompt(
                name=row.name,
                template=row.template,
                sha256=row.sha256,
                tags={"version": str(row.version), "source": "backfill"},
            )
            if uri:
                row.mlflow_prompt_uri = uri
                prompts_linked += 1

    return {
        "tracking_uri": settings.mlflow_tracking_uri,
        "experiments_linked": experiments_linked,
        "prompts_linked": prompts_linked,
    }


@cli.command("mlflow-init")
def mlflow_init() -> None:
    """Backfill MLflow experiments + prompt URIs onto existing rows. Idempotent."""
    result = asyncio.run(_mlflow_init_async())
    click.echo(json.dumps(result, indent=2))


async def _prompts_list_async() -> list[dict]:
    from pmi_core.models import CorePrompt

    async with session_scope() as session:
        rows = (
            await session.execute(
                select(CorePrompt).order_by(CorePrompt.name, CorePrompt.version)
            )
        ).scalars().all()
        return [
            {
                "name": r.name,
                "version": r.version,
                "sha256": r.sha256[:12],
                "mlflow_prompt_uri": r.mlflow_prompt_uri,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]


@cli.command("prompts")
@click.argument("action", type=click.Choice(["list"], case_sensitive=False))
def prompts(action: str) -> None:
    """`prompts list` — show every CorePrompt row with its MLflow URI."""
    if action.lower() == "list":
        rows = asyncio.run(_prompts_list_async())
        click.echo(json.dumps(rows, indent=2))


# ──────────────────────────────────────────────────────────────────────────
# Factor Models — Model Registry mirror
# ──────────────────────────────────────────────────────────────────────────


async def _models_list_async(factor: str | None) -> list[dict]:
    from pmi_core.models import CoreFactorModel, CorePrompt

    async with session_scope() as session:
        stmt = (
            select(CoreFactorModel, CorePrompt)
            .join(CorePrompt, CorePrompt.id == CoreFactorModel.prompt_id)
            .order_by(CoreFactorModel.factor_id, CoreFactorModel.version)
        )
        if factor:
            stmt = stmt.where(CoreFactorModel.factor_id == factor)
        rows = (await session.execute(stmt)).all()
        return [
            {
                "id": fm.id,
                "factor_id": fm.factor_id,
                "version": fm.version,
                "prompt": f"{cp.name}-v{cp.version}",
                "prompt_sha256_short": cp.sha256[:12],
                "llm_model_id": fm.llm_model_id,
                "temperature": float(fm.temperature) if fm.temperature is not None else None,
                "stage": fm.stage,
                "is_active": fm.is_active,
                "mlflow_registered_model_name": fm.mlflow_registered_model_name,
                "mlflow_model_version": fm.mlflow_model_version,
                "description": fm.description,
                "created_at": fm.created_at.isoformat() if fm.created_at else None,
                "created_by": fm.created_by,
            }
            for fm, cp in rows
        ]


async def _models_register_async(
    factor_id: str,
    prompt_name: str,
    prompt_version: int,
    llm_model_id: str,
    temperature: float | None,
    description: str | None,
    created_by: str | None,
    mlflow_register: bool,
) -> dict:
    from pmi_core import mlflow_client
    from pmi_core.models import CoreFactorModel, CorePrompt

    async with session_scope() as session:
        prompt_row = (
            await session.execute(
                select(CorePrompt).where(
                    CorePrompt.name == prompt_name,
                    CorePrompt.version == prompt_version,
                )
            )
        ).scalar_one_or_none()
        if prompt_row is None:
            raise click.ClickException(
                f"Prompt {prompt_name}-v{prompt_version} not found in core_prompts. "
                "Run `pmi-core score` once to register baseline prompts, or check `prompts list`."
            )

        next_version = (
            (
                await session.execute(
                    select(CoreFactorModel.version)
                    .where(CoreFactorModel.factor_id == factor_id)
                    .order_by(CoreFactorModel.version.desc())
                    .limit(1)
                )
            ).scalar()
            or 0
        ) + 1

        mlflow_registered_model_name = None
        mlflow_model_version = None
        if mlflow_register and mlflow_client.is_enabled():
            mlflow_registered_model_name = f"pmi.factor.{factor_id}"
            # Real model artifact registration lands when LLM is real (P1).
            # For now we just reserve the name; version stays NULL until the
            # first real artifact lands.
            mlflow_model_version = None

        fm = CoreFactorModel(
            factor_id=factor_id,
            version=next_version,
            prompt_id=prompt_row.id,
            llm_model_id=llm_model_id,
            temperature=temperature,
            stage="staging",
            is_active=False,
            description=description,
            created_by=created_by,
            mlflow_registered_model_name=mlflow_registered_model_name,
            mlflow_model_version=mlflow_model_version,
        )
        session.add(fm)
        await session.flush()

        return {
            "id": fm.id,
            "factor_id": fm.factor_id,
            "version": fm.version,
            "prompt": f"{prompt_row.name}-v{prompt_row.version}",
            "llm_model_id": fm.llm_model_id,
            "temperature": float(fm.temperature) if fm.temperature is not None else None,
            "stage": fm.stage,
            "is_active": fm.is_active,
            "mlflow_registered_model_name": fm.mlflow_registered_model_name,
        }


async def _models_promote_async(model_id: int, stage: str) -> dict:
    from pmi_core.models import CoreFactorModel

    async with session_scope() as session:
        target = (
            await session.execute(select(CoreFactorModel).where(CoreFactorModel.id == model_id))
        ).scalar_one_or_none()
        if target is None:
            raise click.ClickException(f"No CoreFactorModel with id={model_id}")

        # Demote any current active row at the same (factor_id, stage).
        demoted = []
        prev = (
            await session.execute(
                select(CoreFactorModel).where(
                    CoreFactorModel.factor_id == target.factor_id,
                    CoreFactorModel.stage == stage,
                    CoreFactorModel.is_active.is_(True),
                    CoreFactorModel.id != target.id,
                )
            )
        ).scalars().all()
        for row in prev:
            row.is_active = False
            demoted.append({"id": row.id, "version": row.version})

        target.stage = stage
        target.is_active = True
        await session.flush()

        return {
            "promoted": {
                "id": target.id,
                "factor_id": target.factor_id,
                "version": target.version,
                "stage": target.stage,
                "is_active": target.is_active,
            },
            "demoted": demoted,
        }


@cli.group("models")
def models() -> None:
    """Manage factor model bundles (prompt + LLM + temperature + tools)."""


@models.command("list")
@click.option("--factor", default=None, help="Filter by factor_id.")
def models_list(factor: str | None) -> None:
    """List every CoreFactorModel row."""
    rows = asyncio.run(_models_list_async(factor))
    click.echo(json.dumps(rows, indent=2))


@models.command("register")
@click.option("--factor", "factor_id", required=True)
@click.option("--prompt-name", required=True, help="e.g. factors/directly_about_war")
@click.option("--prompt-version", required=True, type=int)
@click.option("--llm", "llm_model_id", required=True, help="e.g. gpt-4o-mini-2024-07-18")
@click.option("--temperature", default=None, type=float)
@click.option("--description", default=None)
@click.option("--created-by", default=None)
@click.option(
    "--no-mlflow",
    is_flag=True,
    default=False,
    help="Skip reserving an MLflow Model Registry name.",
)
def models_register(
    factor_id: str,
    prompt_name: str,
    prompt_version: int,
    llm_model_id: str,
    temperature: float | None,
    description: str | None,
    created_by: str | None,
    no_mlflow: bool,
) -> None:
    """Register a new factor model in 'staging'. Use `models promote` to activate."""
    result = asyncio.run(
        _models_register_async(
            factor_id=factor_id,
            prompt_name=prompt_name,
            prompt_version=prompt_version,
            llm_model_id=llm_model_id,
            temperature=temperature,
            description=description,
            created_by=created_by,
            mlflow_register=not no_mlflow,
        )
    )
    click.echo(json.dumps(result, indent=2))


@models.command("promote")
@click.argument("model_id", type=int)
@click.option(
    "--stage",
    type=click.Choice(["staging", "production", "archived"]),
    default="production",
)
def models_promote(model_id: int, stage: str) -> None:
    """Promote a factor model to STAGE; demotes any other active row in same slot."""
    result = asyncio.run(_models_promote_async(model_id, stage))
    click.echo(json.dumps(result, indent=2))


if __name__ == "__main__":
    cli()
