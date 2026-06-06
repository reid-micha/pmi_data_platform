"""Per-state partisan lean for the MAGA-by-state choropleth (Task #6).

The design's National MAGA Index map colours every state on a 0–100 heat scale
(0 = Dem, 100 = Rep). Rather than standing up 50 separate state-level index
definitions, we derive each state's lean on demand from the partisan
general-election race markets we already ingest, grouped by state.

This generalises ``seat_mapping.parse_seat_race`` (which only matched *senate*
races) to the offices that carry a MAGA signal:

    "Will the Republicans win the Ohio Senate race in 2026?"
    "Will the Democrats win the Texas gubernatorial race in 2026?"
    "Will the Republicans win the Georgia governor race in 2026?"

For each matching market we read a directed P(Republican wins) — using the R
market's price directly, or ``1 - price`` for a D market — then collapse all of
a state's matching markets into one volume-weighted mean. That mean × 100 is the
state's heat value.

Pure-Python, no DB / network — unit-testable in isolation. The route layer
(pmi-api routes/maga.py) supplies (market_id, title, price, volume) tuples.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass

from pmi_core.engine.seat_mapping import STATE_NAME_TO_CODE, state_code

# Real prediction-market titles phrase the same per-state race many ways:
#   "Will the Republicans win the Ohio Senate race in 2026?"
#   "Will the GOP win the Ohio Senate seat in the 2026 election?"
#   "Will Democrats hold the Arizona Senate seat in 2026?"
#   "Will Republicans flip the Nevada Senate seat in 2026?"
#   "Will the Democrats win the Texas gubernatorial race in 2026?"
# So rather than one rigid regex we gate on four independent signals — party,
# control verb, office, and a recognised state name — all of which must be
# present (plus the 2026 cycle). This matches the casual seed titles AND the
# stricter live-data phrasing, while still rejecting chamber-level markets
# ("...control the U.S. Senate...", no state) and candidate-name markets
# ("Will Dan Sullivan win...", no party word).

_PARTY_R = re.compile(r"\b(republicans?|gop)\b", re.IGNORECASE)
_PARTY_D = re.compile(r"\b(democrats?|democratic|dems)\b", re.IGNORECASE)
# Control verbs: the named party ends up holding the seat. "lose" would invert,
# but no live/seed title uses it in this construction, so we don't claim it.
_CONTROL = re.compile(r"\b(win|wins|hold|holds|flip|flips|keep|keeps|retain|retains|gain|gains)\b", re.IGNORECASE)
_OFFICE = (
    ("senate", re.compile(r"\bsenate\b", re.IGNORECASE)),
    ("governor", re.compile(r"\b(gubernatorial|governor(?:'s)?)\b", re.IGNORECASE)),
    ("house", re.compile(r"\bhouse\b", re.IGNORECASE)),
)

# State names longest-first so "north carolina" matches before "carolina"-less
# partials and "new york" isn't shadowed. Word-boundary anchored.
_STATE_PATTERNS: list[tuple[str, str, re.Pattern[str]]] = sorted(
    (
        (name.title(), code, re.compile(rf"\b{re.escape(name)}\b", re.IGNORECASE))
        for name, code in STATE_NAME_TO_CODE.items()
    ),
    key=lambda t: -len(t[0]),
)


def _find_state(title: str) -> tuple[str, str] | None:
    for name, code, pat in _STATE_PATTERNS:
        if pat.search(title):
            return name, code
    return None


def parse_state_race(title: str) -> tuple[str, str, str] | None:
    """Return (party, state, office) for a partisan per-state race title.

    party is "R"/"D"; state is canonical Title-Case; office is one of
    "senate"/"governor"/"house". None unless the title carries a party word, a
    control verb, an office keyword, a recognised state name, and the 2026
    cycle. Ambiguous (both parties / no state) titles return None.
    """
    if "2026" not in title:
        return None
    if _CONTROL.search(title) is None:
        return None
    is_r = _PARTY_R.search(title) is not None
    is_d = _PARTY_D.search(title) is not None
    if is_r == is_d:  # neither, or both → ambiguous
        return None
    office = next((name for name, pat in _OFFICE if pat.search(title)), None)
    if office is None:
        return None
    found = _find_state(title)
    if found is None:
        return None
    _, _ = found
    return ("R" if is_r else "D"), found[0], office


@dataclass(frozen=True)
class StateLean:
    """One state's aggregated MAGA lean."""

    state: str            # canonical Title-Case name, e.g. "North Carolina"
    state_code: str       # 2-letter code, e.g. "NC"
    heat: float           # 0–100 volume-weighted P(Republican), 100 = deep Rep
    n_markets: int        # contributing race markets
    offices: list[str]    # distinct offices contributing (sorted)
    volume_24h: float     # summed 24h volume across contributing markets


@dataclass
class _Acc:
    weighted: float = 0.0   # Σ p_r · w
    weight: float = 0.0     # Σ w   (w = volume)
    simple: float = 0.0     # Σ p_r (fallback when all volumes are 0/None)
    n: int = 0
    volume: float = 0.0
    name: str = ""          # canonical Title-Case state name
    offices: set[str] | None = None


def aggregate_state_lean(
    markets: list[tuple[int, str, float, float | None]],
) -> dict[str, StateLean]:
    """Collapse partisan race markets into one StateLean per state.

    ``markets`` is (market_id, title, price, volume_24h) where ``price`` is the
    market's latest YES probability in [0, 1]. Returns a dict keyed by 2-letter
    state code. States with no recognised market are absent (the map greys
    them). Weighting is by 24h volume; when a state's markets all lack volume we
    fall back to a simple mean so the state still colours.
    """
    by_state: dict[str, _Acc] = defaultdict(_Acc)
    for market_id, title, price, volume in markets:
        parsed = parse_state_race(title)
        if parsed is None:
            continue
        party, state, office = parsed
        code = state_code(state)
        if code is None:
            continue
        p_r = price if party == "R" else 1.0 - price
        p_r = max(0.0, min(1.0, p_r))
        w = float(volume) if volume and volume > 0 else 0.0
        acc = by_state[code]
        if acc.offices is None:
            acc.offices = set()
        acc.weighted += p_r * w
        acc.weight += w
        acc.simple += p_r
        acc.n += 1
        acc.volume += float(volume) if volume else 0.0
        acc.offices.add(office)
        acc.name = state

    out: dict[str, StateLean] = {}
    for code, acc in by_state.items():
        mean = acc.weighted / acc.weight if acc.weight > 0 else acc.simple / acc.n
        out[code] = StateLean(
            state=acc.name or code,
            state_code=code,
            heat=round(mean * 100.0, 2),
            n_markets=acc.n,
            offices=sorted(acc.offices or set()),
            volume_24h=round(acc.volume, 2),
        )
    return out
