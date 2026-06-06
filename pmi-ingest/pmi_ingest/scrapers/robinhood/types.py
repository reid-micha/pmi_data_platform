"""Raw data types for Robinhood scraper output."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class RawContract:
    """Raw contract data extracted from the Robinhood DOM.

    Intermediate representation between raw HTML and NormalizedContract.
    Fields may be None if extraction fails for a particular element.
    """

    slug: str
    title: str
    yes_price: float | None
    volume: int | None
    close_date: str | None
    category: str | None
    url: str
