"""Factor evaluator.

Dispatches on the resolved model_id:

* `stub-*`     → deterministic in-process pseudo-eval (`_stub_score`). Used
                 when no `CoreFactorModel` is promoted for a factor, so the
                 pipeline keeps running with zero LLM cost.
* `gpt-*` /
  `openai/*`   → `pmi_core.llm.openai_client.OpenAIProvider` (real eval, cost
                 + tokens recorded into `audit_evaluations`).
* others       → looked up via `pmi_core.llm.get_provider(model_id)`. Adding a
                 new provider = registering a prefix there.

Contract:
  evaluate_factor(session, market, factor, index_def_id, resolved,
                  experiment_id=None, parent_run_id=None)
      -> tuple[AuditEvaluation, bool]

  Returns `(row, cache_hit)`. `cache_hit=True` means the row was returned
  from the existing `audit_evaluations` entry without any LLM call or new
  write this tick — the caller uses this to roll fresh cost / llm_calls
  into `audit_pipeline_runs` without double-counting cached spend.

  `resolved: ResolvedFactorModel` is produced by
  `factor_resolver.resolve_factor_model` and bundles
  (prompt, llm_model_id, temperature, tools_config, source).

Idempotency: if an AuditEvaluation with the same cache_key
(market_id, index_definition_id, factor_id, prompt_sha256, model_id) exists,
it's returned unchanged with `cache_hit=True`. Switching to a new
CoreFactorModel with a different llm_model_id automatically invalidates the
cache and runs fresh evaluations.

MLflow mirroring: every NEW evaluation opens an MLflow child run under the
caller's parent run and logs params + metrics, including the registry binding
(`factor_model_id`, `mlflow_registered_model_name`) when source='registry'.

Failure mode: if the real LLM call raises (auth, parse, network exhaustion),
we fall back to the deterministic stub and tag the evaluation row's
`model_response.fallback_reason` so the audit trail captures why. The pipeline
never breaks because of a single factor's LLM hiccup.
"""

from __future__ import annotations

import hashlib
import random
import time
from datetime import UTC, datetime

import structlog
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from pmi_core import mlflow_client
from pmi_core.dsl.ir import FactorSpec
from pmi_core.engine.factor_resolver import (
    DEFAULT_STUB_MODEL_ID,  # re-export so legacy imports keep working
    ResolvedFactorModel,
)
from pmi_core.llm import LLMResponse, get_provider, render_prompt
from pmi_core.models import AuditEvaluation, CoreMarket

log = structlog.get_logger(__name__)

# Kept for backward compatibility with anything still importing this constant.
STUB_MODEL_ID = DEFAULT_STUB_MODEL_ID


def _stub_score(market: CoreMarket, factor: FactorSpec) -> tuple[float, str | None, float]:
    """Reproducible pseudo-evaluation seeded by (market.id, factor.id)."""
    seed = f"{market.id}:{factor.id}".encode()
    digest = hashlib.sha256(seed).digest()
    rng = random.Random(int.from_bytes(digest[:8], "big"))

    confidence = 0.5 + rng.random() * 0.45

    if factor.type == "binary":
        value = 1.0 if rng.random() > 0.4 else 0.0
        return value, None, confidence
    if factor.type == "ternary":
        choice = rng.choice([-1.0, 0.0, 1.0])
        label = {-1.0: "-", 0.0: "0", 1.0: "+"}[choice]
        return choice, label, confidence
    return rng.random(), None, confidence  # score


def _is_stub(model_id: str) -> bool:
    return model_id.startswith("stub-") or model_id == DEFAULT_STUB_MODEL_ID


async def _run_real_llm(
    market: CoreMarket,
    factor: FactorSpec,
    resolved: ResolvedFactorModel,
) -> LLMResponse:
    """Render the prompt and dispatch to the provider matching `model_id`.

    `market` + `resolved.tools_config` are forwarded for Tier 2 (agentic)
    providers — single-shot providers accept and ignore them.
    """
    provider = get_provider(resolved.llm_model_id)
    rendered = render_prompt(resolved.prompt.template, market)
    return await provider.evaluate(
        rendered_prompt=rendered,
        factor=factor,
        temperature=resolved.temperature,
        market=market,
        tools_config=resolved.tools_config,
    )


async def evaluate_factor(
    session: AsyncSession,
    market: CoreMarket,
    factor: FactorSpec,
    index_definition_id: int,
    resolved: ResolvedFactorModel,
    *,
    experiment_id: str | None = None,
    parent_run_id: str | None = None,
) -> tuple[AuditEvaluation, bool]:
    prompt = resolved.prompt
    model_id = resolved.llm_model_id

    cache_q = select(AuditEvaluation).where(
        AuditEvaluation.market_id == market.id,
        AuditEvaluation.index_definition_id == index_definition_id,
        AuditEvaluation.factor_id == factor.id,
        AuditEvaluation.prompt_sha256 == prompt.sha256,
        AuditEvaluation.model_id == model_id,
    )
    existing = (await session.execute(cache_q)).scalar_one_or_none()
    if existing is not None:
        return existing, True

    started = time.perf_counter()
    llm_response: LLMResponse | None = None
    fallback_reason: str | None = None

    if _is_stub(model_id):
        value_numeric, value_label, confidence = _stub_score(market, factor)
        rationale = "deterministic stub at P0"
        cost_usd = 0.0
        prompt_tokens = 0
        completion_tokens = 0
        model_response_payload: dict = {
            "stub": True,
            "rationale": rationale,
            "model_source": resolved.source,
        }
    else:
        try:
            llm_response = await _run_real_llm(market, factor, resolved)
            value_numeric = llm_response.value_numeric
            value_label = llm_response.value_label
            confidence = llm_response.confidence
            rationale = llm_response.rationale
            cost_usd = llm_response.cost_usd
            prompt_tokens = llm_response.prompt_tokens
            completion_tokens = llm_response.completion_tokens
            model_response_payload = {
                "stub": False,
                "model_source": resolved.source,
                "rationale": rationale,
                "raw_text": llm_response.raw_text,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                # raw_response is large — kept under a nested key so JSON
                # search/index queries can still hit the summary fields fast.
                "raw_response": llm_response.raw_response,
            }
            # Tier 2 (agentic) providers populate `extras` with the reasoning /
            # tool-call trace + tier marker. Persisting it here is the §9
            # "every score is traceable" guarantee; single-shot providers leave
            # extras empty so this is a no-op for Tier 1.
            if llm_response.extras:
                model_response_payload["extras"] = llm_response.extras
        except Exception as exc:
            fallback_reason = f"{type(exc).__name__}: {exc}"
            log.warning(
                "factor_evaluator.llm_failed_fallback_to_stub",
                factor_id=factor.id,
                model_id=model_id,
                market_id=market.id,
                error=fallback_reason[:200],
            )
            value_numeric, value_label, confidence = _stub_score(market, factor)
            rationale = f"LLM call failed; using stub. Reason: {fallback_reason[:200]}"
            cost_usd = 0.0
            prompt_tokens = 0
            completion_tokens = 0
            model_response_payload = {
                "stub": True,
                "fallback_reason": fallback_reason,
                "model_source": resolved.source,
                "rationale": rationale,
                "intended_model_id": model_id,
            }

    latency_ms = int((time.perf_counter() - started) * 1000)

    run_tags: dict[str, str | int] = {
        "factor_id": factor.id,
        "factor_type": factor.type,
        "market_id": market.id,
        "model_id": model_id,
        "model_source": resolved.source,  # 'yaml' or 'registry'
        "prompt_name": prompt.name,
        "prompt_version": prompt.version,
        "prompt_uri": prompt.mlflow_prompt_uri or "",
        "real_llm": "true" if llm_response is not None else "false",
    }
    if fallback_reason:
        run_tags["fallback_reason"] = fallback_reason[:120]
    if resolved.factor_model_id is not None:
        run_tags["factor_model_id"] = resolved.factor_model_id
    if resolved.mlflow_registered_model_name:
        run_tags["mlflow_registered_model"] = resolved.mlflow_registered_model_name
    if resolved.mlflow_model_version:
        run_tags["mlflow_model_version"] = resolved.mlflow_model_version

    run_name = f"{factor.id}:{market.id}"
    with mlflow_client.start_run(
        experiment_id=experiment_id,
        run_name=run_name,
        parent_run_id=parent_run_id,
        tags=run_tags,
    ) as child_run_id:
        mlflow_client.log_params(
            child_run_id,
            {
                "factor_id": factor.id,
                "factor_type": factor.type,
                "market_id": market.id,
                "market_title": (market.title or "")[:250],
                "prompt_sha256": prompt.sha256,
                "prompt_name": prompt.name,
                "prompt_version": prompt.version,
                "model_id": model_id,
                "model_source": resolved.source,
                "factor_model_id": resolved.factor_model_id or "",
                "temperature": resolved.temperature if resolved.temperature is not None else "",
            },
        )
        mlflow_client.log_metrics(
            child_run_id,
            {
                "value_numeric": value_numeric,
                "confidence": confidence,
                "latency_ms": latency_ms,
                "cost_usd": cost_usd,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
            },
        )
        if value_label is not None:
            mlflow_client.set_tags(child_run_id, {"value_label": value_label})

        # CORR-3.11: atomic INSERT ... ON CONFLICT DO NOTHING instead of a bare
        # session.add(). Without this, when the supercronic `hourly` tick and a
        # manual `score` (or a 2nd worker) both miss the cache above and race to
        # insert the same cache_key, the loser hits IntegrityError on
        # `uq_audit_evaluations__cache_key` and rolls back the ENTIRE tick. With
        # DO NOTHING the loser simply finds the winner's row and treats it as a
        # cache hit — append-only invariant preserved, no tick lost.
        insert_stmt = (
            pg_insert(AuditEvaluation)
            .values(
                market_id=market.id,
                index_definition_id=index_definition_id,
                factor_id=factor.id,
                prompt_id=prompt.id,
                prompt_sha256=prompt.sha256,
                model_id=model_id,
                temperature=resolved.temperature,
                value_numeric=value_numeric,
                value_label=value_label,
                confidence=confidence,
                model_response=model_response_payload,
                cost_usd=cost_usd,
                latency_ms=latency_ms,
                mlflow_run_id=child_run_id,
                evaluated_at=datetime.now(UTC),
            )
            .on_conflict_do_nothing(constraint="uq_audit_evaluations__cache_key")
            .returning(AuditEvaluation.id)
        )
        new_id = (await session.execute(insert_stmt)).scalar_one_or_none()

    if new_id is None:
        # A concurrent tick committed the same cache_key between our SELECT and
        # INSERT. Re-read the winning row and surface it as a cache hit.
        existing = (await session.execute(cache_q)).scalar_one_or_none()
        if existing is not None:
            return existing, True
        raise RuntimeError(
            "audit_evaluations ON CONFLICT fired but the conflicting row was "
            f"not found on re-read (market={market.id}, factor={factor.id})"
        )

    row = await session.get(AuditEvaluation, new_id)
    if row is None:  # pragma: no cover — inserted id must be fetchable
        raise RuntimeError(f"inserted audit_evaluation id={new_id} not retrievable")
    return row, False
