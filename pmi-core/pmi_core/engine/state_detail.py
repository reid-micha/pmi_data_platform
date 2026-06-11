"""Per-state MAGA detail: chamber groups + contributing contracts.

Extends ``state_lean`` (which collapses a state to a single heat value) to the
granularity the MAGA *state-detail* page needs: the same partisan race markets,
but grouped by office (senate / governor / house) and carrying each contributing
contract so the page can render holdings.

Same parser, same directed-P(Republican) convention, same volume weighting as
``state_lean`` — this only changes the grouping key (state → state×office) and
keeps the underlying markets around as ``RaceContract`` rows.

Pure-Python, no DB / network. The route layer supplies
(market_id, title, last_price, volume_24h, venue, slug) tuples.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from pmi_core.engine.seat_mapping import state_code
from pmi_core.engine.state_lean import aggregate_state_lean, parse_state_race

# Display labels per parsed office, used to synthesise a base question.
_OFFICE_LABEL = {"senate": "Senate", "governor": "Governor", "house": "House"}


@dataclass(frozen=True)
class RaceContract:
    """One contributing market, directed to the Republican outcome."""

    market_id: int
    title: str
    venue: str
    yes_pct: float          # the market's own latest YES probability, 0–100
    p_r: float              # directed P(Republican wins), 0–1
    volume_24h: float | None
    slug: str | None


@dataclass(frozen=True)
class StateGroup:
    """One (state, office) cell: a collapsed heat + its contracts."""

    state: str
    state_code: str
    office: str              # senate / governor / house
    heat: float              # 0–100 volume-weighted P(Republican)
    n_markets: int
    volume_24h: float
    base_question: str
    contracts: list[RaceContract]


@dataclass(frozen=True)
class StateDetail:
    """A state's overall lean plus its per-office groups."""

    state: str
    state_code: str
    heat: float
    n_markets: int
    volume_24h: float
    offices: list[str]
    groups: list[StateGroup]


@dataclass
class _GroupAcc:
    weighted: float = 0.0
    weight: float = 0.0
    simple: float = 0.0
    n: int = 0
    volume: float = 0.0
    state: str = ""
    contracts: list[RaceContract] = field(default_factory=list)


def _collapse(acc: _GroupAcc) -> float:
    """Volume-weighted mean P(R), falling back to a simple mean when no volume."""
    mean = acc.weighted / acc.weight if acc.weight > 0 else acc.simple / acc.n
    return round(mean * 100.0, 2)


def aggregate_state_detail(
    markets: list[tuple[int, str, float, float | None, str, str | None]],
) -> dict[str, StateDetail]:
    """Collapse partisan race markets into per-state, per-office detail.

    ``markets`` is (market_id, title, last_price, volume_24h, venue, slug) where
    ``last_price`` is the market's latest YES probability in [0, 1]. Returns a
    dict keyed by 2-letter state code. States/offices with no recognised market
    are absent.
    """
    by_cell: dict[tuple[str, str], _GroupAcc] = defaultdict(_GroupAcc)
    for market_id, title, price, volume, venue, slug in markets:
        parsed = parse_state_race(title)
        if parsed is None:
            continue
        party, state, office = parsed
        code = state_code(state)
        if code is None:
            continue
        p_r = max(0.0, min(1.0, price if party == "R" else 1.0 - price))
        w = float(volume) if volume and volume > 0 else 0.0
        acc = by_cell[(code, office)]
        acc.weighted += p_r * w
        acc.weight += w
        acc.simple += p_r
        acc.n += 1
        acc.volume += float(volume) if volume else 0.0
        acc.state = state
        acc.contracts.append(
            RaceContract(
                market_id=market_id,
                title=title,
                venue=venue,
                yes_pct=round(max(0.0, min(1.0, price)) * 100.0, 2),
                p_r=round(p_r, 4),
                volume_24h=float(volume) if volume is not None else None,
                slug=slug,
            )
        )

    # Build StateGroups, then fold them up into per-state StateDetail.
    groups_by_state: dict[str, list[StateGroup]] = defaultdict(list)
    for (code, office), acc in by_cell.items():
        label = _OFFICE_LABEL.get(office, office.title())
        groups_by_state[code].append(
            StateGroup(
                state=acc.state,
                state_code=code,
                office=office,
                heat=_collapse(acc),
                n_markets=acc.n,
                volume_24h=round(acc.volume, 2),
                base_question=f"Will the Republicans win the {acc.state} {label} race in 2026?",
                # Most-traded contract first so the headline holding is meaningful.
                contracts=sorted(acc.contracts, key=lambda c: -(c.volume_24h or 0.0)),
            )
        )

    out: dict[str, StateDetail] = {}
    for code, groups in groups_by_state.items():
        groups.sort(key=lambda g: g.office)
        n = sum(g.n_markets for g in groups)
        vol = round(sum(g.volume_24h for g in groups), 2)
        # State heat = volume-weighted across its groups (mirrors state_lean).
        if vol > 0:
            heat = round(sum(g.heat * g.volume_24h for g in groups) / vol, 2)
        else:
            heat = round(sum(g.heat for g in groups) / len(groups), 2)
        out[code] = StateDetail(
            state=groups[0].state,
            state_code=code,
            heat=heat,
            n_markets=n,
            volume_24h=vol,
            offices=sorted(g.office for g in groups),
            groups=groups,
        )
    return out


def _daily_market_rows(
    titles: dict[int, str],
    snapshots: list[tuple[int, datetime, float, float | None]],
    days: int,
    as_of: datetime,
) -> list[tuple[date, list[tuple[int, str, float, float | None]]]]:
    """Per day boundary, each market's latest snapshot at-or-before it.

    Shared replay step for the trend series: ``titles`` is {market_id: title};
    ``snapshots`` is every (market_id, snapshot_at, last_price, volume_24h) in
    the window. Markets with no snapshot yet at a boundary are absent from that
    day's rows.
    """
    by_market: dict[int, list[tuple[datetime, float, float | None]]] = defaultdict(list)
    for mid, at, price, vol in snapshots:
        if price is None:
            continue
        by_market[mid].append((at, price, vol))
    for lst in by_market.values():
        lst.sort(key=lambda t: t[0])

    out: list[tuple[date, list[tuple[int, str, float, float | None]]]] = []
    for i in range(days, -1, -1):
        boundary = as_of - timedelta(days=i)
        rows: list[tuple[int, str, float, float | None]] = []
        for mid, title in titles.items():
            hist = by_market.get(mid)
            if not hist:
                continue
            latest: tuple[float, float | None] | None = None
            for at, price, vol in hist:
                if at <= boundary:
                    latest = (price, vol)
                else:
                    break
            if latest is not None:
                rows.append((mid, title, latest[0], latest[1]))
        out.append((boundary.date(), rows))
    return out


def state_lean_series(
    titles: dict[int, str],
    snapshots: list[tuple[int, datetime, float, float | None]],
    target_code: str,
    days: int,
    as_of: datetime,
) -> list[tuple[date, float]]:
    """Daily per-state heat over the last ``days`` days (for the trend chart).

    For each day boundary we take each market's latest snapshot at-or-before it,
    re-run ``aggregate_state_lean``, and emit (date, heat). Days where the state
    has no data yet are skipped, so the series naturally starts when markets
    first appear.
    """
    out: list[tuple[date, float]] = []
    for boundary, rows in _daily_market_rows(titles, snapshots, days, as_of):
        st = aggregate_state_lean(rows).get(target_code)
        if st is not None:
            out.append((boundary, st.heat))
    return out


def national_lean_series(
    titles: dict[int, str],
    snapshots: list[tuple[int, datetime, float, float | None]],
    days: int,
    as_of: datetime,
) -> list[tuple[date, float]]:
    """Daily national heat over the last ``days`` days (homepage trend chart).

    Same replay as ``state_lean_series`` but collapsed across every state:
    volume-weighted mean of per-state heats (simple mean when no state carries
    volume) — the same national aggregation the /maga/by-state route uses for
    its point-in-time number. Days with no data at all are skipped.
    """
    out: list[tuple[date, float]] = []
    for boundary, rows in _daily_market_rows(titles, snapshots, days, as_of):
        leans = aggregate_state_lean(rows)
        if not leans:
            continue
        total_vol = sum(l.volume_24h for l in leans.values())
        if total_vol > 0:
            national = sum(l.heat * l.volume_24h for l in leans.values()) / total_vol
        else:
            national = sum(l.heat for l in leans.values()) / len(leans)
        out.append((boundary, round(national, 2)))
    return out
