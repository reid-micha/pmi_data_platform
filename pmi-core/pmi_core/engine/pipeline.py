"""Top-level pipeline: load IR → select markets → factor eval → aggregate → write score.

End-to-end runnable from CLI:

    pmi-core pipeline run --index polymarket-war-index

Sprint 1/2 deliverable. Writes one `ts_index_scores` row + N `audit_evaluations`.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from pathlib import Path

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pmi_core import mlflow_client
from pmi_core.db import session_scope
from pmi_core.dsl.ir import IndexDef, load_index_def
from pmi_core.engine.aggregator import MarketEvaluations, aggregate
from pmi_core.engine.factor_evaluator import evaluate_factor
from pmi_core.engine.factor_resolver import ResolvedFactorModel, resolve_factor_model
from pmi_core.engine.selector import select_markets
from pmi_core.models import (
    AuditPipelineRun,
    CoreIndexDefinition,
    CorePrompt,
    TsIndexScore,
    TsOrderbookSnapshot,
    TsPriceSnapshot,
)

log = structlog.get_logger(__name__)

INDEX_DEFS_DIR = Path(__file__).resolve().parent.parent / "index_defs"
PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


async def _ensure_index_definition(
    session: AsyncSession, ir: IndexDef, yaml_text: str, sha256: str
) -> CoreIndexDefinition:
    """Idempotent UPSERT-by-version. Bumping IR.version retires the previous current."""
    existing = (
        await session.execute(
            select(CoreIndexDefinition).where(
                CoreIndexDefinition.index_id == ir.id,
                CoreIndexDefinition.version == ir.version,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        if existing.yaml_sha256 != sha256:
            raise RuntimeError(
                f"index_def {ir.id} v{ir.version} on disk diverged from DB (sha256 mismatch). "
                "Bump version instead of editing in place — SCD Type 2 contract."
            )
        return existing

    # Retire any older currently-active row for the same index_id (SCD Type 2).
    now = datetime.now(UTC)
    prev = (
        await session.execute(
            select(CoreIndexDefinition)
            .where(
                CoreIndexDefinition.index_id == ir.id,
                CoreIndexDefinition.is_current.is_(True),
            )
        )
    ).scalars().all()
    for p in prev:
        p.is_current = False
        p.effective_to = now

    # Open / look up a single MLflow experiment per index_id. NULL on failure.
    experiment_id = mlflow_client.ensure_experiment(ir.id)

    row = CoreIndexDefinition(
        index_id=ir.id,
        version=ir.version,
        title=ir.title,
        owner=ir.owner,
        definition=ir.model_dump(mode="json"),
        yaml_source=yaml_text,
        yaml_sha256=sha256,
        is_current=True,
        mlflow_experiment_id=experiment_id,
        effective_from=now,
    )
    session.add(row)
    await session.flush()
    return row


async def _ensure_prompt(session: AsyncSession, factor_prompt_ref: str) -> CorePrompt:
    """Load `prompts/factors/<name>-vN.md`, register or fetch the matching CorePrompt row."""
    if not factor_prompt_ref.startswith("prompts/"):
        raise ValueError(f"prompt_ref must start with 'prompts/': {factor_prompt_ref}")
    rel = factor_prompt_ref.removeprefix("prompts/")
    path = PROMPTS_DIR / f"{rel}.md"
    template = path.read_text(encoding="utf-8")
    sha256 = hashlib.sha256(template.encode("utf-8")).hexdigest()

    # Pull name + version from filename: "factors/direction-v4" → name=factors/direction, version=4
    if "-v" not in rel:
        raise ValueError(f"prompt_ref must end with -vN: {factor_prompt_ref}")
    name_part, version_part = rel.rsplit("-v", 1)
    version = int(version_part)

    existing = await session.execute(
        select(CorePrompt).where(
            CorePrompt.name == name_part,
            CorePrompt.version == version,
        )
    )
    row = existing.scalar_one_or_none()
    if row is not None:
        if row.sha256 != sha256:
            raise RuntimeError(
                f"Prompt {factor_prompt_ref} on disk diverged from DB (sha256 mismatch). "
                f"Bump version instead of editing in place."
            )
        return row

    prompt_uri = mlflow_client.register_prompt(
        name=name_part,
        template=template,
        sha256=sha256,
        tags={"version": str(version), "source": "git"},
    )
    row = CorePrompt(
        name=name_part,
        version=version,
        template=template,
        sha256=sha256,
        mlflow_prompt_uri=prompt_uri,
    )
    session.add(row)
    await session.flush()
    return row


async def _latest_prices(
    session: AsyncSession, market_ids: list[int]
) -> tuple[dict[int, float], dict[int, float | None]]:
    """Return the most recent (last_price, volume_24h) per market.

    Volume is the CORR-3.4 cold-start fallback for liquidity weighting —
    used by the aggregator only when no ``ts_orderbook_snapshots`` row
    exists for the market yet (e.g. a freshly ingested market that the
    CLOB poller hasn't picked up in its 60s cycle).
    """
    if not market_ids:
        return {}, {}
    stmt = (
        select(
            TsPriceSnapshot.market_id,
            TsPriceSnapshot.last_price,
            TsPriceSnapshot.volume_24h,
            TsPriceSnapshot.snapshot_at,
        )
        .where(TsPriceSnapshot.market_id.in_(market_ids))
        .order_by(TsPriceSnapshot.market_id, TsPriceSnapshot.snapshot_at.desc())
    )
    result = (await session.execute(stmt)).all()
    prices: dict[int, float] = {}
    volumes: dict[int, float | None] = {}
    for mid, price, vol, _ts in result:
        if mid not in prices and price is not None:
            prices[mid] = float(price)
            volumes[mid] = float(vol) if vol is not None else None
    return prices, volumes


async def _latest_orderbook_depths(
    session: AsyncSession, market_ids: list[int]
) -> dict[int, float]:
    """Return the freshest ``bid_depth_1pct + ask_depth_1pct`` per market.

    Uses two-sided depth (CORR-3.4) so one-sided books — common for
    illiquid sides of binary markets — don't pretend to be deep. Markets
    with no orderbook snapshot are simply absent from the returned dict
    so the caller can fall back to ``volume_24h``.
    """
    if not market_ids:
        return {}
    stmt = (
        select(
            TsOrderbookSnapshot.market_id,
            TsOrderbookSnapshot.bid_depth_1pct,
            TsOrderbookSnapshot.ask_depth_1pct,
            TsOrderbookSnapshot.snapshot_at,
        )
        .where(TsOrderbookSnapshot.market_id.in_(market_ids))
        .order_by(
            TsOrderbookSnapshot.market_id,
            TsOrderbookSnapshot.snapshot_at.desc(),
        )
    )
    result = (await session.execute(stmt)).all()
    out: dict[int, float] = {}
    for mid, bid, ask, _ts in result:
        if mid in out:
            continue
        total = (float(bid) if bid is not None else 0.0) + (
            float(ask) if ask is not None else 0.0
        )
        if total > 0:
            out[mid] = total
    return out


async def run_pipeline(index_id: str, as_of: datetime | None = None) -> dict:
    """Single tick of the pipeline. Returns a dict summary for CLI display."""
    as_of = as_of or datetime.now(UTC)
    yaml_path = INDEX_DEFS_DIR / f"{index_id}.yaml"
    ir, yaml_text, sha256 = load_index_def(yaml_path)

    async with session_scope() as session:
        run = AuditPipelineRun(
            name=f"pipeline:{index_id}",
            started_at=as_of,
            status="running",
        )
        session.add(run)
        await session.flush()

        try:
            index_def_row = await _ensure_index_definition(session, ir, yaml_text, sha256)
            run.index_definition_id = index_def_row.id

            markets = await select_markets(session, ir)
            log.info("pipeline.selected", index_id=index_id, count=len(markets))

            # Cache prompt rows AND resolve the active (factor_model) per factor.
            # If any factor has a CoreFactorModel registered + is_active=True at the
            # default stage, the resolver swaps in its (prompt + llm + temp + tools).
            # Otherwise the YAML-loaded prompt + stub-deterministic-v1 wins.
            prompt_rows: dict[str, CorePrompt] = {}
            resolved_models: dict[str, ResolvedFactorModel] = {}
            for factor in ir.factors:
                yaml_prompt = await _ensure_prompt(session, factor.prompt_ref)
                prompt_rows[factor.id] = yaml_prompt
                resolved_models[factor.id] = await resolve_factor_model(
                    session, factor, yaml_prompt
                )

            # Cost / counter roll-up for audit_pipeline_runs.
            # cache_hits  → existing rows, no new spend this tick.
            # llm_calls   → fresh writes where the real LLM actually responded
            #               (stub fallbacks on failure don't count — they cost $0
            #               and produced `stub=True` payloads).
            # cost_usd    → sum of fresh writes' cost_usd (cache hits excluded
            #               so reruns don't double-charge).
            # evaluations_written → fresh writes only, matching the column name.
            evaluations_written = 0
            cache_hits = 0
            llm_calls = 0
            cost_usd_total = 0.0
            market_rows: list[MarketEvaluations] = []
            market_ids = [m.id for m in markets]
            prices, volumes = await _latest_prices(session, market_ids)
            depths = await _latest_orderbook_depths(session, market_ids)

            # Parent MLflow run for this tick. Child runs (one per factor eval)
            # hang under it. NULL when MLflow is down — pipeline still proceeds.
            parent_run_name = f"tick:{index_id}@{as_of.isoformat(timespec='seconds')}"
            with mlflow_client.start_run(
                experiment_id=index_def_row.mlflow_experiment_id,
                run_name=parent_run_name,
                tags={
                    "index_id": index_id,
                    "index_version": str(index_def_row.version),
                    "index_definition_id": index_def_row.id,
                    "yaml_sha256": sha256,
                    "pipeline_run_id": run.id,
                },
            ) as parent_run_id:
                run.mlflow_run_id = parent_run_id
                mlflow_client.log_params(
                    parent_run_id,
                    {
                        "index_id": index_id,
                        "index_version": index_def_row.version,
                        "yaml_sha256": sha256,
                        "factor_count": len(ir.factors),
                        "min_components": ir.aggregation.min_components,
                        "collapse_enabled": ir.aggregation.collapse.enabled,
                    },
                )

                for market in markets:
                    by_factor = {}
                    for factor in ir.factors:
                        evalrow, cache_hit = await evaluate_factor(
                            session,
                            market=market,
                            factor=factor,
                            index_definition_id=index_def_row.id,
                            resolved=resolved_models[factor.id],
                            experiment_id=index_def_row.mlflow_experiment_id,
                            parent_run_id=parent_run_id,
                        )
                        by_factor[factor.id] = evalrow
                        if cache_hit:
                            cache_hits += 1
                        else:
                            evaluations_written += 1
                            # `model_response.stub` is False only when a real
                            # LLM call actually returned a parsed response;
                            # stub fallbacks on LLM failure keep stub=True.
                            payload = evalrow.model_response or {}
                            if payload.get("stub") is False:
                                llm_calls += 1
                            if evalrow.cost_usd is not None:
                                cost_usd_total += float(evalrow.cost_usd)
                    # CORR-3.4: depth is the primary liquidity signal;
                    # volume_24h is the cold-start fallback. ``None`` flows
                    # through to the aggregator, which treats it as
                    # "no signal → uniform weight" rather than a zero.
                    liquidity = depths.get(market.id)
                    if liquidity is None:
                        liquidity = volumes.get(market.id)
                    market_rows.append(
                        MarketEvaluations(
                            market=market,
                            by_factor=by_factor,
                            last_price=prices.get(market.id),
                            liquidity=liquidity,
                        )
                    )

                result = aggregate(market_rows, ir)

                score_row = TsIndexScore(
                    index_definition_id=index_def_row.id,
                    as_of=as_of,
                    score=result.score,
                    component_count=result.component_count,
                    component_evaluation_ids=result.component_evaluation_ids,
                    breakdown=result.breakdown,
                )
                session.add(score_row)

                mlflow_client.log_metrics(
                    parent_run_id,
                    {
                        "score": result.score,
                        "component_count": result.component_count,
                        "markets_in": len(markets),
                        "evaluations_written": evaluations_written,
                        "cache_hits": cache_hits,
                        "llm_calls": llm_calls,
                        "cost_usd": cost_usd_total,
                    },
                )

            run.ended_at = datetime.now(UTC)
            run.markets_in = len(markets)
            run.evaluations_written = evaluations_written
            run.scores_out = 1
            run.llm_calls = llm_calls
            run.cost_usd = cost_usd_total
            run.status = "succeeded"

            log.info(
                "pipeline.done",
                index_id=index_id,
                markets=len(markets),
                evals=evaluations_written,
                cache_hits=cache_hits,
                llm_calls=llm_calls,
                cost_usd=cost_usd_total,
                score=result.score,
                mlflow_run_id=run.mlflow_run_id,
            )

            return {
                "index_id": index_id,
                "index_definition_id": index_def_row.id,
                "as_of": as_of.isoformat(),
                "score": result.score,
                "component_count": result.component_count,
                "markets_in": len(markets),
                "evaluations_written": evaluations_written,
                "cache_hits": cache_hits,
                "llm_calls": llm_calls,
                "cost_usd": cost_usd_total,
                "breakdown": result.breakdown,
                "mlflow_run_id": run.mlflow_run_id,
                "mlflow_experiment_id": index_def_row.mlflow_experiment_id,
            }
        except Exception as exc:
            run.ended_at = datetime.now(UTC)
            run.status = "failed"
            run.error_message = repr(exc)
            log.error("pipeline.failed", index_id=index_id, error=str(exc))
            raise
