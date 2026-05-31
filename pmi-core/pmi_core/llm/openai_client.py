"""OpenAI implementation of `LLMProvider`.

Uses the official `openai>=1.0` SDK with the AsyncOpenAI client. Always
requests `response_format={"type": "json_object"}` so the model is forced to
emit parseable JSON (matches our prompt contract).

Retry policy
------------
We wrap the API call in `tenacity` with exponential backoff on transient
errors (429, 500, 502, 503, 504). The retry budget is intentionally small (3
attempts) so a flaky model doesn't silently inflate the per-tick latency
budget — the pipeline as a whole retries by re-running the next tick.

Cost accounting
---------------
A small per-model price table lives in `_PRICE_PER_M_TOKENS`. When a price
is unknown we still return a `cost_usd=0.0` so the field stays populated;
the eval row's `model_id` is enough to reconstruct cost downstream once the
table is patched.

Auth
----
Reads `OPENAI_API_KEY` from `pmi_core.config.settings`. Failing fast with a
clear error message is preferable to a 401 deep inside the SDK.
"""

from __future__ import annotations

import time
from typing import Any

import structlog

from pmi_core.config import settings
from pmi_core.dsl.ir import FactorSpec
from pmi_core.llm.base import LLMResponse, parse_factor_response

log = structlog.get_logger(__name__)

# USD per **million** tokens. Conservative published 2026-05 list prices —
# bump as needed. Models not in this table get cost_usd=0 (still recorded so
# downstream backfills can fill in retroactively from model_id + token counts).
_PRICE_PER_M_TOKENS: dict[str, tuple[float, float]] = {
    # model_id : (input $/M, output $/M)
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o-mini-2024-07-18": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-2024-08-06": (2.50, 10.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1-nano": (0.10, 0.40),
}


def _estimate_cost(model_id: str, prompt_tokens: int, completion_tokens: int) -> float:
    pricing = _PRICE_PER_M_TOKENS.get(model_id)
    if pricing is None:
        # try prefix match (e.g. dated suffixes)
        for prefix, p in _PRICE_PER_M_TOKENS.items():
            if model_id.startswith(prefix):
                pricing = p
                break
    if pricing is None:
        return 0.0
    inp, out = pricing
    return prompt_tokens / 1_000_000 * inp + completion_tokens / 1_000_000 * out


class OpenAIProvider:
    """Async OpenAI client implementing the `LLMProvider` protocol."""

    def __init__(self, model_id: str) -> None:
        # Strip the optional ``openai/`` prefix that some callers use to be
        # explicit about provider; the SDK itself wants the bare model id.
        self.model_id = model_id.removeprefix("openai/")
        if not settings.openai_api_key:
            raise RuntimeError(
                "OPENAI_API_KEY is empty — set it in pmi_data_platform/.env "
                "before promoting a CoreFactorModel onto a real LLM."
            )

    async def evaluate(
        self,
        *,
        rendered_prompt: str,
        factor: FactorSpec,
        temperature: float | None = None,
    ) -> LLMResponse:
        # Lazy import so test environments without the SDK still importable.
        from openai import AsyncOpenAI
        from openai import APIConnectionError, APIError, APIStatusError, RateLimitError
        from tenacity import (
            AsyncRetrying,
            retry_if_exception_type,
            stop_after_attempt,
            wait_exponential,
        )

        client = AsyncOpenAI(api_key=settings.openai_api_key)

        started = time.perf_counter()
        last_error: Exception | None = None
        completion: Any = None

        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=1.0, min=1.0, max=8.0),
            retry=retry_if_exception_type(
                (APIConnectionError, RateLimitError, APIStatusError, APIError)
            ),
            reraise=True,
        ):
            with attempt:
                completion = await client.chat.completions.create(
                    model=self.model_id,
                    temperature=temperature if temperature is not None else 0.1,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are a careful prediction-market analyst. "
                                "Follow the user's instructions exactly. Return "
                                "ONLY a valid JSON object — no prose, no fences."
                            ),
                        },
                        {"role": "user", "content": rendered_prompt},
                    ],
                    response_format={"type": "json_object"},
                )
        latency_ms = int((time.perf_counter() - started) * 1000)

        if completion is None:
            raise RuntimeError(f"OpenAI call exhausted retries: {last_error!r}")

        raw_text = (completion.choices[0].message.content or "").strip()
        value_numeric, value_label, confidence, rationale = parse_factor_response(
            raw_text, factor
        )

        usage = getattr(completion, "usage", None)
        prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
        completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
        cost_usd = _estimate_cost(self.model_id, prompt_tokens, completion_tokens)

        # `.model_dump()` is available on pydantic-2-backed SDK responses.
        try:
            raw_response = completion.model_dump()  # type: ignore[union-attr]
        except Exception:
            raw_response = {"text": raw_text}

        log.debug(
            "openai.evaluate.done",
            model=self.model_id,
            factor=factor.id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_usd=cost_usd,
            latency_ms=latency_ms,
        )

        return LLMResponse(
            model_id=self.model_id,
            value_numeric=value_numeric,
            value_label=value_label,
            confidence=confidence,
            rationale=rationale,
            raw_text=raw_text,
            raw_response=raw_response,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_usd=cost_usd,
            latency_ms=latency_ms,
        )
