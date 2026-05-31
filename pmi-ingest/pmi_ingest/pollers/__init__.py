"""Poller protocol — each source implements `name` and `run_once`."""

from __future__ import annotations

from typing import Protocol


class Poller(Protocol):
    name: str

    async def run_once(self) -> int:
        """Execute one fetch cycle. Returns records processed. Raises on hard failure."""
        ...
