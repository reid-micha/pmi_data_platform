"""Top-level pipeline: load IR → select markets → factor eval → aggregate → write score.

End-to-end runnable from CLI:

    pmi-core pipeline run --index polymarket-war-index

Sprint 1/2 deliverable. Writes one `ts_index_scores` row + N `audit_evaluations`.
"""

from __future__ import annotations

import asyncio
import hashlib
import time
from datetime import UTC, datetime
from pathlib import Path

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pmi_core import mlflow_client
from pmi_core.config import settings
from pmi_core.db import session_scope
from pmi_core.dsl.ir import IndexDef, SemanticSelector, load_index_def
from pmi_core.engine.aggregator import MarketEvaluations, aggregate
from pmi_core.engine.factor_evaluator import (
    _is_stub,
    persist_evaluation,
    run_factor_llm,
)
from pmi_core.engine.factor_resolver import ResolvedFactorModel, resolve_factor_model
from pmi_core.engine.selector import select_markets
from pmi_core.llm import embed_query
from pmi_core.models import (
    AuditEvaluation,
    AuditPipelineRun,
    CoreIndexDefinition,
    CorePrompt,
    TsIndexScore,
    TsOrderbookSnapshot,
    TsPriceSnapshot,
)
from pmi_core.vectorstore import get_vector_store

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


async def _tier0_prefilter(markets: list, ir: IndexDef) -> tuple[list, dict]:
    """Drop candidates whose cosine to the index anchor(s) is below the Tier 0 floor.

    The cheap embedding gate that sits between selection and the (expensive)
    factor LLM loop. It uses the SemanticSelector anchors as the relevance
    reference — so an index gets Tier 0 culling for free by declaring at least
    one `semantic` selector, even if it ALSO selects by keyword/category. An
    index with no anchor has no embedding reference, so the gate is a no-op.

    Policy decisions:
      * **max over anchors** — a market relevant to ANY anchor survives.
      * **fail-open on missing embeddings** — a market with no vector row (writer
        hasn't run, or it's brand new) is KEPT, never silently dropped. Better to
        spend a factor call than to vanish a real market from the index.
      * **fail-open on embed errors** — if the anchor can't be embedded (endpoint
        down), the gate is skipped entirely for this tick.

    Returns `(survivors, stats)` where stats feeds the run log / summary.
    """
    stats = {"considered": len(markets), "dropped": 0, "no_embedding": 0, "enabled": False}
    anchors = [s.anchor for s in ir.selectors if isinstance(s, SemanticSelector)]
    if not anchors or not markets:
        return markets, stats

    model = settings.active_embedding_model
    floor = settings.embedding_tier0_min_cosine
    store = get_vector_store()
    market_ids = [m.id for m in markets]

    best: dict[int, float] = {}
    try:
        for anchor in anchors:
            anchor_vec = await embed_query(anchor, model=model)
            sims = await store.cosine_for_markets(
                market_ids=market_ids, query_embedding=anchor_vec, model=model
            )
            for mid, cos in sims.items():
                if mid not in best or cos > best[mid]:
                    best[mid] = cos
    except Exception as exc:  # noqa: BLE001 - graceful degradation by design
        log.warning("tier0.skipped_embed_error", index_id=ir.id, error=str(exc))
        return markets, stats

    stats["enabled"] = True
    survivors = []
    for m in markets:
        cos = best.get(m.id)
        if cos is None:
            stats["no_embedding"] += 1
            survivors.append(m)  # fail-open
        elif cos >= floor:
            survivors.append(m)
        else:
            stats["dropped"] += 1
    log.info(
        "tier0.prefilter",
        index_id=ir.id,
        floor=floor,
        kept=len(survivors),
        dropped=stats["dropped"],
        no_embedding=stats["no_embedding"],
    )
    return survivors, stats


async def _batch_load_evaluations(
    session: AsyncSession,
    index_definition_id: int,
    ir: IndexDef,
    resolved_models: dict[str, ResolvedFactorModel],
    market_ids: list[int],
) -> dict[tuple[int, str], AuditEvaluation]:
    """Stage 1 of T1: one IN-query per factor instead of one SELECT per
    (market, factor). Returns `{(market_id, factor_id): AuditEvaluation}` for
    rows already in `audit_evaluations` under this tick's cache keys.
    """
    existing: dict[tuple[int, str], AuditEvaluation] = {}
    if not market_ids:
        return existing
    for factor in ir.factors:
        resolved = resolved_models[factor.id]
        rows = (
            await session.execute(
                select(AuditEvaluation).where(
                    AuditEvaluation.index_definition_id == index_definition_id,
                    AuditEvaluation.factor_id == factor.id,
                    AuditEvaluation.prompt_sha256 == resolved.prompt.sha256,
                    AuditEvaluation.model_id == resolved.llm_model_id,
                    AuditEvaluation.market_id.in_(market_ids),
                )
            )
        ).scalars().all()
        for row in rows:
            existing[(row.market_id, factor.id)] = row
    return existing


async def _llm_under_sem(
    sem: asyncio.Semaphore,
    market,
    factor,
    resolved: ResolvedFactorModel,
) -> tuple[tuple[int, str], object | None, str | None, int]:
    """Stage 3 of T1: one concurrent LLM call. Pure async HTTP, no session.

    Returns `((market_id, factor_id), llm_response|None, error|None, latency_ms)`.
    Exceptions are captured (not raised) so one bad call can't sink the gather —
    the persist stage turns a captured error into a deterministic stub fallback.
    """
    async with sem:
        t0 = time.perf_counter()
        try:
            resp = await run_factor_llm(market, factor, resolved)
            return (market.id, factor.id), resp, None, int((time.perf_counter() - t0) * 1000)
        except Exception as exc:  # noqa: BLE001 - fallback-to-stub by design
            err = f"{type(exc).__name__}: {exc}"
            return (market.id, factor.id), None, err, int((time.perf_counter() - t0) * 1000)


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

            # Tier 0 embedding pre-filter: cull anchor-irrelevant candidates
            # (e.g. keyword false-positives) before spending factor LLM calls.
            markets, tier0_stats = await _tier0_prefilter(markets, ir)
            if tier0_stats["enabled"]:
                log.info("pipeline.tier0", index_id=index_id, **tier0_stats)

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

                # ── T1: 4-stage concurrent factor eval ──────────────────────
                # Stage 1 — batch-load the cache (one IN-query per factor).
                evalmap = await _batch_load_evaluations(
                    session, index_def_row.id, ir, resolved_models, market_ids
                )
                cache_hits += len(evalmap)

                # Stage 2 — todo = cache misses; split stub (CPU) vs real (LLM).
                todo = [
                    (m, f)
                    for m in markets
                    for f in ir.factors
                    if (m.id, f.id) not in evalmap
                ]
                real_todo = [
                    (m, f)
                    for (m, f) in todo
                    if not _is_stub(resolved_models[f.id].llm_model_id)
                ]

                # Stage 3 — concurrent LLM (the ONLY concurrent point). Pure
                # HTTP under a semaphore; no session is touched here.
                llm_results: dict[tuple[int, str], tuple[object | None, str | None, int]] = {}
                if real_todo:
                    sem = asyncio.Semaphore(settings.llm_concurrency)
                    gathered = await asyncio.gather(
                        *[_llm_under_sem(sem, m, f, resolved_models[f.id]) for (m, f) in real_todo]
                    )
                    for key, resp, err, lat in gathered:
                        llm_results[key] = (resp, err, lat)

                # Stage 4 — persist serially on the single session (AsyncSession
                # is not concurrency-safe). Stubs and LLM-failures fall back here.
                for (m, f) in todo:
                    resp, err, lat = llm_results.get((m.id, f.id), (None, None, 0))
                    row, conflict_hit = await persist_evaluation(
                        session,
                        m,
                        f,
                        index_def_row.id,
                        resolved_models[f.id],
                        llm_response=resp,
                        llm_error=err,
                        latency_ms=lat,
                        experiment_id=index_def_row.mlflow_experiment_id,
                        parent_run_id=parent_run_id,
                    )
                    evalmap[(m.id, f.id)] = row
                    if conflict_hit:
                        # A concurrent tick wrote this cache_key first.
                        cache_hits += 1
                    else:
                        evaluations_written += 1
                        # `model_response.stub` is False only when a real LLM
                        # call returned a parsed response; stub fallbacks on LLM
                        # failure keep stub=True.
                        payload = row.model_response or {}
                        if payload.get("stub") is False:
                            llm_calls += 1
                        if row.cost_usd is not None:
                            cost_usd_total += float(row.cost_usd)

                # Assemble per-market evaluation bundles for the aggregator.
                for market in markets:
                    by_factor = {f.id: evalmap[(market.id, f.id)] for f in ir.factors}
                    # CORR-3.4: depth is the primary liquidity signal; volume_24h
                    # is the cold-start fallback. ``None`` flows through to the
                    # aggregator as "no signal → uniform weight", not a zero.
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
