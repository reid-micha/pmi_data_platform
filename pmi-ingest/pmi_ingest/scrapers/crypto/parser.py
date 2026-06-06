"""Parsing utilities for Crypto.com prediction markets.

The Crypto.com frontend uses Next.js App Router with React Server Components.
Market data is embedded in SSR ``__next_f`` script tags as JSON props.

This module provides data types and helpers for parsing event/contract data.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

BASE_URL = "https://web.crypto.com"
SPORTS_URL = f"{BASE_URL}/explore/predict/sports"
EVENTS_URL = f"{BASE_URL}/explore/predict/events"


@dataclass
class ParsedEvent:
    """Parsed event from the RSC payload."""

    id: str
    title: str
    event_kind: str
    event_kind_slug: str
    status: str
    close_date: str | None
    slug: str
    contracts: list[ParsedContract] = field(default_factory=list)


@dataclass
class ParsedContract:
    """Parsed contract from the RSC payload."""

    id: str
    title: str
    yes: str | None  # Price string, e.g. "3.60"
    no: str | None
    chance: str | None  # Probability %, e.g. "37"
    status: str


def _slugify(text: str) -> str:
    """Convert text to a URL-safe slug."""
    s = text.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s[:80]


def event_to_parsed(raw_event: dict) -> ParsedEvent:
    """Convert a raw event dict to a ParsedEvent."""
    contracts = []
    for c in raw_event.get("contracts", []):
        contracts.append(
            ParsedContract(
                id=c.get("id", ""),
                title=c.get("contract_title", ""),
                yes=c.get("yes"),
                no=c.get("no"),
                chance=c.get("chance"),
                status=c.get("status", ""),
            )
        )

    return ParsedEvent(
        id=raw_event.get("id", ""),
        title=raw_event.get("title", ""),
        event_kind=raw_event.get("event_kind", ""),
        event_kind_slug=raw_event.get("event_kind_slug", ""),
        status=raw_event.get("status", ""),
        close_date=raw_event.get("close_date"),
        slug=raw_event.get("slug", ""),
        contracts=contracts,
    )


def contract_probability(contract: ParsedContract) -> float | None:
    """Extract probability (0.0–1.0) from a parsed contract.

    The ``chance`` field is a string percentage (e.g. "37" means 37%).
    The ``yes`` field is a price string (e.g. "3.60" out of 10, or "0.37" out of 1).
    We prefer ``chance`` when available.
    """
    # Try chance field first (percentage string)
    if contract.chance:
        try:
            pct = float(contract.chance)
            if 0 <= pct <= 100:
                return pct / 100.0
        except (ValueError, TypeError):
            pass

    # Fallback to yes price
    if contract.yes:
        try:
            price = float(contract.yes)
            # Prices on Crypto.com are either out of 1.00 or out of 10.00
            # determined by contract_range. We normalize assuming:
            # - prices <= 1.0 are already probabilities
            # - prices > 1.0 are out of 10.0
            if price <= 1.0:
                return price
            elif price <= 10.0:
                return price / 10.0
        except (ValueError, TypeError):
            pass

    return None


def build_contract_url(event_slug: str, category: str = "events") -> str:
    """Build a full URL for a Crypto.com prediction market event."""
    return f"{BASE_URL}/explore/predict/{category}/details/{event_slug}"
