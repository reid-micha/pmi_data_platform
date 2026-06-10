"""Raw data types for Coinbase scraper output.

Ported verbatim from `micah/server/app/services/coinbase/types.py` (2026-06-09).
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class RawContract:
    """Raw contract data extracted from the Coinbase DOM.

    Intermediate representation between raw HTML and the persistence layer.
    Fields may be None if extraction fails for a particular element.
    """

    slug: str
    title: str
    yes_price: float | None
    volume: int | None
    close_date: str | None
    category: str | None
    url: str


@dataclass
class EventContract:
    """A single outcome/contract extracted from a Coinbase event page.

    Represents one row from the Details section (div#MarketSelectorSection)
    of an event page (e.g., one outcome in a multi-outcome market).
    Volume is event-level, stored on EventPageResult instead.
    """

    name: str
    probability: float | None  # 0.0–1.0


@dataclass
class EventPageResult:
    """Full scrape result from a single Coinbase event page."""

    event_id: str
    category: str
    url: str
    title: str
    status: int  # HTTP status code
    redirected: bool  # True if redirected back to /predictions
    contracts: list[EventContract] = field(default_factory=list)
    volume: int | None = None  # Event-level volume from "Key stats"
    volume_raw: str | None = None  # Raw volume text (e.g. "$1.2M")
    close_date: str | None = None  # Expiry date from "Key stats" (e.g. "Jan 1, 2027")
