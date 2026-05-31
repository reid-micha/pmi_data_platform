"""Market → contested-seat mapping for balance-of-power boards (CORR-1.3).

The senate-board's seat distribution (engine/seat_distribution.py) needs ONE
probability per contested seat. A keyword selector for "senate" is far too
broad — on live Polymarket data it matches ~390 markets: primary-nominee
markets ("Will X be the Democratic nominee for Senate in Y?"), foreign senates
(Peru / Brazil / Philippines), procedural markets ("Will the Senate pass a
reconciliation bill?"), Majority-Leader markets, and chamber-level brackets
("47 or fewer Senate seats"). Feeding all of those into a Poisson-binomial as
if each were an independent seat produces nonsense (E[R seats] > 100).

The clean per-seat signal is one tight title pattern:

    "Will the Republicans win the Ohio Senate race in 2026?"
    "Will the Democrats win the Texas Senate race in 2026?"

This module parses (party, state) out of those titles, groups by state, and
collapses each state to a single P(Republican wins the seat):

  * if a "Republicans win" market exists  → p_r = its price
  * else if a "Democrats win" market exists → p_r = 1 - its price

States that have both (the markets are complementary outcomes of the same
seat) therefore collapse to ONE seat, not two — which is the whole point.

Deliberately OUT of scope here (different aggregation, future work):
  * candidate-name markets ("Will Dan Sullivan win the Alaska Senate race…")
  * "an independent win…" markets
  * chamber-level seat-count brackets ("47 or fewer Senate seats") — those
    want a `negRisk` / `condition_id` partition aggregation, not a per-seat
    Bernoulli. Persisting `condition_id` for that path is tracked separately.

Pure-Python, no DB / network — unit-testable in isolation.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# "Will the Republicans win the North Carolina Senate race in 2026?"
#                ^^^^^^^^^^^                ^^^^^^^^^^^^^^
_SEAT_RACE_RE = re.compile(
    r"will the (republicans|democrats) win the (.+?) senate race in 2026",
    re.IGNORECASE,
)

# US state / DC name → 2-letter code (mirror of the design's map.jsx
# stateNameToCode, used to populate the board's prob_by_state for the map).
_STATE_NAME_TO_CODE: dict[str, str] = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "district of columbia": "DC", "florida": "FL", "georgia": "GA", "hawaii": "HI",
    "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
    "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
    "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
    "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI",
    "south carolina": "SC", "south dakota": "SD", "tennessee": "TN", "texas": "TX",
    "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA",
    "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
}


@dataclass(frozen=True)
class ContestedSeat:
    """One contested Senate seat, collapsed from its per-party market(s)."""

    state: str            # canonical Title-Case state name, e.g. "North Carolina"
    state_code: str | None  # 2-letter code, e.g. "NC" (None if unrecognized)
    prob_r: float         # P(Republican wins the seat), in [0, 1]
    market_id: int        # representative market (the one whose price set prob_r)
    source_party: str     # "R" (used R market directly) or "D" (used 1 - D price)


def state_code(name: str) -> str | None:
    """2-letter code for a state name (case-insensitive), or None."""
    return _STATE_NAME_TO_CODE.get(name.strip().lower())


def parse_seat_race(title: str) -> tuple[str, str] | None:
    """Return (party, state) for a per-state general-election race title.

    party is "R" or "D"; state is canonical Title-Case. Returns None for any
    title that isn't a party-direct per-state senate race (nominee markets,
    candidate-name markets, foreign senates, brackets, procedural, etc.).
    """
    m = _SEAT_RACE_RE.search(title)
    if m is None:
        return None
    party = "R" if m.group(1).lower() == "republicans" else "D"
    state = m.group(2).strip().title()
    return party, state


@dataclass(frozen=True)
class _SeatBuild:
    r_price: float | None = None
    r_market: int | None = None
    d_price: float | None = None
    d_market: int | None = None


def extract_contested_seats(
    markets: list[tuple[int, str, float]],
) -> list[ContestedSeat]:
    """Collapse per-party race markets into one ContestedSeat per state.

    ``markets`` is a list of (market_id, title, price) where price is the
    market's latest YES probability in [0, 1]. Non-matching titles are
    ignored. States with both an R and a D market collapse to one seat,
    preferring the R market's price as the direct P(R wins).

    Returns seats sorted by state name for deterministic output.
    """
    by_state: dict[str, _SeatBuild] = {}
    for market_id, title, price in markets:
        parsed = parse_seat_race(title)
        if parsed is None:
            continue
        party, state = parsed
        cur = by_state.get(state, _SeatBuild())
        if party == "R":
            by_state[state] = _SeatBuild(
                r_price=price, r_market=market_id,
                d_price=cur.d_price, d_market=cur.d_market,
            )
        else:
            by_state[state] = _SeatBuild(
                r_price=cur.r_price, r_market=cur.r_market,
                d_price=price, d_market=market_id,
            )

    seats: list[ContestedSeat] = []
    for state in sorted(by_state):
        b = by_state[state]
        if b.r_price is not None and b.r_market is not None:
            p_r = max(0.0, min(1.0, b.r_price))
            seats.append(ContestedSeat(state, state_code(state), p_r, b.r_market, "R"))
        elif b.d_price is not None and b.d_market is not None:
            p_r = max(0.0, min(1.0, 1.0 - b.d_price))
            seats.append(ContestedSeat(state, state_code(state), p_r, b.d_market, "D"))
    return seats
