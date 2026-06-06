"""Raw data types for Crypto.com scraper output."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class RawContract:
    """Raw contract data extracted from Crypto.com RSC payload.

    Intermediate representation between RSC JSON and NormalizedContract.
    """

    slug: str
    title: str
    event_title: str
    probability: float | None  # 0.0–1.0 (from chance field)
    close_date: str | None  # ISO 8601
    url: str
    event_kind: str | None = None  # e.g. "GOLD", "ELECT", "CLIM"
    category: str | None = None  # e.g. "financials", "politics"
    contract_id: str | None = None  # Crypto.com contract UUID
    event_id: str | None = None  # Crypto.com event UUID
    is_closed: bool = False  # True when event/contract status != "active"
