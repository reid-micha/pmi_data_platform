"""Coinbase DOM extraction and URL parsing utilities.

Ported from `micah/server/app/services/coinbase/parser.py` (2026-06-09), with
imports retargeted at the pmi-ingest package. Data is extracted via
Playwright `page.evaluate()` (JavaScript) rather than BeautifulSoup, because
the SPA HTML is impractical to parse server-side and CSS class names are
generated (fragile). This module provides:

- The JavaScript extraction snippets used by the scraper (loaded from
  `scrapers/scripts/coinbase/*.js`)
- Python helpers for parsing slugs and URLs from Coinbase pages
"""

from __future__ import annotations

import re

from pmi_ingest.scrapers.coinbase.types import RawContract
from pmi_ingest.scrapers.scripts import load_js

BASE_URL = "https://www.coinbase.com"
PREDICTIONS_URL = f"{BASE_URL}/predictions"


def _slugify(text: str) -> str:
    """Convert text to a URL-safe slug."""
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:80]


# ---------------------------------------------------------------------------
# JavaScript snippets — executed via page.evaluate()
# ---------------------------------------------------------------------------

# Check for regional restriction immediately after page load.
CHECK_REGIONAL_RESTRICTION_JS = load_js("coinbase/check_regional_restriction.js")

# Discover categories and subcategories via role="tablist" elements.
DISCOVER_CATEGORIES_JS = load_js("coinbase/discover_categories.js")

# Click a specific category tab by name in the first tablist (parameterized).
CLICK_CATEGORY_TAB_JS = load_js("coinbase/click_category_tab.js")

# Extract contract cards from the current page (link-based + div-based layouts).
EXTRACT_CONTRACTS_JS = load_js("coinbase/extract_contracts.js")

# Extract event-level stats (volume + expiry) from the "Key stats" section.
EXTRACT_KEY_STATS_JS = load_js("coinbase/extract_key_stats.js")

# Click "See ... more" button inside the Details section.
CLICK_SEE_MORE_JS = load_js("coinbase/click_see_more.js")

# Extract the event page title (the main heading).
EXTRACT_EVENT_TITLE_JS = load_js("coinbase/extract_event_title.js")

# Extract contract rows from an event page's Details section.
EXTRACT_EVENT_CONTRACTS_JS = load_js("coinbase/extract_event_contracts.js")

# Extract probability from a single-contract page (no Details section).
EXTRACT_SINGLE_CONTRACT_PROB_JS = load_js("coinbase/extract_single_contract_prob.js")

# Diagnostic: dump key structural info from an event page.
DIAGNOSE_EVENT_PAGE_JS = load_js("coinbase/diagnose_event_page.js")


# ---------------------------------------------------------------------------
# Python helpers
# ---------------------------------------------------------------------------


def extract_slug_from_href(href: str) -> str | None:
    """Extract a unique slug from a Coinbase predictions href.

    Example: /predictions/politics/will-trump-win -> will-trump-win
    """
    parts = href.rstrip("/").split("/")
    if len(parts) >= 2:
        slug = parts[-1]
        if slug in ("predictions",):
            return None
        return slug
    return None


def extract_category_from_href(href: str) -> str | None:
    """Extract category from a Coinbase predictions href.

    Example: /predictions/politics/will-trump-win -> politics
    """
    parts = href.rstrip("/").split("/")
    try:
        idx = parts.index("predictions")
        if idx + 1 < len(parts):
            return parts[idx + 1]
    except ValueError:
        pass
    return None


def js_results_to_raw_contracts(
    js_results: list[dict[str, object]],
    category: str,
) -> list[RawContract]:
    """Convert page.evaluate() results to RawContract objects."""
    contracts: list[RawContract] = []
    for item in js_results:
        href = str(item.get("href", ""))

        title = str(item.get("title", ""))
        if not title or len(title) < 5:
            continue

        slug = extract_slug_from_href(href) if href else None
        if not slug:
            slug = _slugify(title)
        if not slug:
            continue

        prob_raw = item.get("probability")
        probability = int(str(prob_raw)) / 100.0 if prob_raw is not None else None

        vol_raw = item.get("volume")
        volume = int(str(vol_raw)) if vol_raw is not None else None

        if href.startswith("/"):
            full_url = f"{BASE_URL}{href}"
        elif href:
            full_url = href
        else:
            cat_slug = _slugify(category) if category else ""
            full_url = f"{PREDICTIONS_URL}/{cat_slug}/{slug}" if cat_slug else ""

        contracts.append(
            RawContract(
                slug=slug,
                title=title,
                yes_price=probability,
                volume=volume,
                close_date=None,
                category=category,
                url=full_url,
            )
        )

    return contracts
