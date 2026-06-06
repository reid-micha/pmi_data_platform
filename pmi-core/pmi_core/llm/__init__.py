"""LLM provider abstraction.

Layered above `pmi_core.engine.factor_evaluator` so the evaluator stays a
single function regardless of which model is bound. Implementations live in
sibling modules and are selected by `get_provider(model_id)`.

Currently registered providers:
    - `stub-*`   → `pmi_core.engine.factor_evaluator._stub_score` (in-evaluator)
    - `gpt-*`    → `pmi_core.llm.openai_client.OpenAIProvider`
    - `ollama/*` → `pmi_core.llm.ollama_client.OllamaProvider` (local models)

Adding a new provider:
    1. Drop `pmi_core/llm/<name>_client.py` implementing `LLMProvider`.
    2. Add a prefix → factory entry to `_PROVIDER_REGISTRY` in `base.py`.
    3. No factor / evaluator code changes required.
"""

from pmi_core.llm.base import (
    LLMProvider,
    LLMResponse,
    ParseError,
    UnknownModelError,
    get_provider,
    render_prompt,
)

__all__ = [
    "LLMProvider",
    "LLMResponse",
    "ParseError",
    "UnknownModelError",
    "get_provider",
    "render_prompt",
]
