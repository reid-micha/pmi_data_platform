"""Job registry — name → async callable lookup.

Ported verbatim from `micah-job-executor/app/jobs/registry.py` because the
contract (decorate-and-discover) is independent of the underlying engine.
The only change is the job signature: pmi-core jobs receive no `AsyncSession`
because the pmi-core pipeline manages its own `session_scope()` internally
(see [`pmi_core.engine.pipeline.run_pipeline`](../../pmi-core/pmi_core/engine/pipeline.py)).
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import TypeVar

JobFn = Callable[[], Awaitable[None]]

_registry: dict[str, JobFn] = {}

_F = TypeVar("_F", bound=JobFn)


def register(name: str) -> Callable[[_F], _F]:
    """Decorator: register a coroutine under `name` for `run-job <name>`."""

    def decorator(fn: _F) -> _F:
        if name in _registry:
            raise RuntimeError(f"Job '{name}' already registered")
        _registry[name] = fn
        return fn

    return decorator


def get(name: str) -> JobFn:
    if name not in _registry:
        raise KeyError(f"Job '{name}' not registered")
    return _registry[name]


def all_names() -> list[str]:
    return sorted(_registry.keys())
