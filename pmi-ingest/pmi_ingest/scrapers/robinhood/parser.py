"""Robinhood DOM extraction and URL parsing utilities.

Data is extracted via Playwright page.evaluate() (JavaScript) rather than
BeautifulSoup, because the 20 MB SPA HTML is impractical to parse server-side
and CSS class names are generated (fragile).  This module provides:

- The JavaScript extraction snippet used by the scraper
- Python helpers for parsing slugs and dates from Robinhood URLs
"""

from __future__ import annotations

import re
from datetime import date

from pmi_ingest.scrapers.robinhood.types import RawContract
from pmi_ingest.scrapers.scripts import load_js

BASE_URL = "https://robinhood.com"


# Slugify helper for building unique child contract identifiers
def _slugify(text: str) -> str:
    """Convert text to a URL-safe slug."""
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:80]  # truncate to reasonable length


# JavaScript executed via page.evaluate() to extract event cards.
# Uses structural DOM patterns (child positions/sizes) rather than CSS class names.
EXTRACT_EVENTS_JS = load_js("robinhood/extract_events.js")

# JavaScript executed on an event detail page to extract all child outcomes.
EXTRACT_CHILD_CONTRACTS_JS = load_js("robinhood/extract_child_contracts.js")

# JavaScript to click "Show N more" button on event detail pages.
CLICK_SHOW_MORE_JS = load_js("robinhood/click_show_more.js")


# ---------------------------------------------------------------------------
# Category / subcategory discovery JS
# ---------------------------------------------------------------------------

# Extracts all parent category buttons from the horizontal nav bar.
# Buttons with an <svg> child (chevron icon) have subcategories.
DISCOVER_CATEGORIES_JS = load_js("robinhood/discover_categories.js")

# After hovering a parent button, extracts subcategory buttons that
# appeared below the nav bar.  Excludes top-level category names.
#
# To avoid falsely classifying the first dropdown item as a nav button
# (e.g. "Baseball" at y≈210 vs nav buttons at y≈151), we cluster
# candidate buttons by their `top` value — the largest cluster is the
# actual nav bar row.  Everything below that row is a dropdown candidate.
DISCOVER_DROPDOWN_JS = load_js("robinhood/discover_dropdown.js")

# Removes the Usercentrics consent overlay (#usercentrics-root) that
# intercepts pointer events and causes 30s hover timeouts during discovery.
DISMISS_CONSENT_JS = load_js("robinhood/dismiss_consent.js")


def display_name_to_slug(name: str) -> str:
    """Convert a category/subcategory display name to a URL slug.

    Rule validated against all 56+ Robinhood subcategories::

        "S&P"        -> "sandp"
        "The Fed"    -> "the-fed"
        "College basketball (M)" -> "college-basketball-m"
    """
    return name.lower().replace("&", "and").replace(" ", "-").replace("(", "").replace(")", "")


_TITLE_SUFFIX_RE = re.compile(r"\s+Predictions?\s*-\s*Robinhood$", re.IGNORECASE)


def parse_default_sub_from_title(title: str, parent_name: str) -> str | None:
    """Extract the default subcategory slug from a Robinhood page title.

    Title format: ``"{Parent} {Subcategory} Predictions - Robinhood"``

    Returns the slugified subcategory name, or ``None`` for generic titles
    like ``"Prediction markets - Robinhood"``.
    """
    body = _TITLE_SUFFIX_RE.sub("", title).strip()
    if not body:
        return None

    # The body should start with the parent display name (case-insensitive)
    parent_lower = parent_name.lower()
    body_lower = body.lower()

    if not body_lower.startswith(parent_lower):
        return None

    remainder = body[len(parent_name) :].strip()
    if not remainder:
        return None

    return display_name_to_slug(remainder)


# Months for URL slug date parsing
_MONTH_MAP: dict[str, int] = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

# Pattern: slug ends with -{month_abbr}-{day}-{year}
_SLUG_DATE_RE = re.compile(r"-([a-z]{3})-(\d{1,2})-(\d{4})/?$")


def extract_event_slug(href: str) -> str | None:
    """Extract the event slug from an event page href.

    Example: /us/en/prediction-markets/politics/events/some-slug-jan-20-2026/
    Returns: some-slug-jan-20-2026
    """
    parts = href.rstrip("/").split("/")
    try:
        idx = parts.index("events")
        if idx + 1 < len(parts):
            return parts[idx + 1]
    except ValueError:
        pass
    return None


def extract_category(href: str) -> str | None:
    """Extract the category slug from an event page href.

    Example: /us/en/prediction-markets/politics/events/some-slug/
    Returns: politics
    """
    parts = href.rstrip("/").split("/")
    try:
        idx = parts.index("prediction-markets")
        if idx + 1 < len(parts) and parts[idx + 1] != "events":
            return parts[idx + 1]
    except ValueError:
        pass
    return None


def parse_close_date_from_slug(slug: str) -> str | None:
    """Parse close date from the event slug as an ISO date string.

    Robinhood encodes dates in event slugs:
      some-event-name-jan-20-2026 -> 2026-01-20

    Returns ISO format string or None if no date found.
    """
    m = _SLUG_DATE_RE.search(slug)
    if not m:
        return None
    month_abbr, day_str, year_str = m.group(1), m.group(2), m.group(3)
    month = _MONTH_MAP.get(month_abbr)
    if month is None:
        return None
    try:
        d = date(int(year_str), month, int(day_str))
        # Reject obviously invalid dates (Unix epoch default: 1969-12-31)
        if d.year < 2020:
            return None
        return d.isoformat()
    except ValueError:
        return None


def js_results_to_raw_contracts(
    js_results: list[dict[str, object]],
    category_slug: str,
) -> list[RawContract]:
    """Convert page.evaluate() results to RawContract objects."""
    contracts: list[RawContract] = []
    for item in js_results:
        href = str(item.get("href", ""))
        slug = extract_event_slug(href)
        if not slug:
            continue

        title = str(item.get("title", ""))
        outcome_name = str(item.get("outcomeName", ""))
        # Build descriptive title: "Question — Top Outcome"
        full_title = f"{title} — {outcome_name}" if outcome_name else title

        prob_raw = item.get("probability")
        probability = int(str(prob_raw)) / 100.0 if prob_raw is not None else None

        vol_raw = item.get("volume")
        volume = int(str(vol_raw)) if vol_raw is not None else None

        close_date = parse_close_date_from_slug(slug)

        contracts.append(
            RawContract(
                slug=slug,
                title=full_title,
                yes_price=probability,
                volume=volume,
                close_date=close_date,
                category=category_slug,
                url=f"{BASE_URL}{href}" if href.startswith("/") else href,
            )
        )

    return contracts


def js_child_results_to_raw_contracts(
    js_results: list[dict[str, object]],
    event_slug: str,
    event_title: str,
    event_volume: int | None,
    event_close_date: str | None,
    event_url: str,
    category_slug: str,
) -> list[RawContract]:
    """Convert detail-page child outcome JS results to RawContract objects.

    Each child outcome becomes its own RawContract with:
    - slug: ``{event_slug}--{outcome-name-slugified}``
    - title: ``{event_title} — {outcome_name}``
    - yes_price: price in cents / 100 (probability)
    - volume: inherited from the parent event
    - close_date: inherited from the parent event slug
    """
    contracts: list[RawContract] = []
    for item in js_results:
        name = str(item.get("name", "")).strip()
        if not name or len(name) < 2:
            continue

        price_raw = item.get("price")
        if price_raw is None:
            continue
        probability = int(str(price_raw)) / 100.0

        outcome_slug = _slugify(name)
        if not outcome_slug:
            continue

        child_slug = f"{event_slug}--{outcome_slug}"
        full_title = f"{event_title} — {name}"

        contracts.append(
            RawContract(
                slug=child_slug,
                title=full_title,
                yes_price=probability,
                volume=event_volume,
                close_date=event_close_date,
                category=category_slug,
                url=event_url,
            )
        )

    return contracts
