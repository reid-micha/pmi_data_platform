"""MAGA-by-state aggregation (Task #6).

Serves the National MAGA Index choropleth + State detail view. Rather than 50
standalone state index definitions, per-state partisan lean is derived on demand
from the partisan general-election race markets already ingested, grouped by
state via ``pmi_core.engine.state_lean``.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from pmi_api.deps import get_session
from pmi_api.schemas import (
    MagaByStateEnvelope,
    MagaByStatePayload,
    MagaGroupRow,
    MagaGroupsEnvelope,
    MagaGroupsPayload,
    MagaLastUpdatedEnvelope,
    MagaLastUpdatedPayload,
    MagaNationalTrendsEnvelope,
    MagaNationalTrendsPayload,
    MagaRaceContractRow,
    MagaStateDetailEnvelope,
    MagaStateDetailPayload,
    MagaTrendPoint,
    MagaTrendsEnvelope,
    MagaTrendsPayload,
    StateLeanRow,
)
from pmi_core.engine.seat_mapping import state_code as state_code_of
from pmi_core.engine.state_detail import (
    StateGroup,
    aggregate_state_detail,
    national_lean_series,
    state_lean_series,
)
from pmi_core.engine.state_lean import aggregate_state_lean, parse_state_race
from pmi_core.models import CoreMarket, TsPriceSnapshot

router = APIRouter(prefix="/maga", tags=["maga"])

# Race-market row as loaded from the DB: (id, title, last_price, volume, venue, slug).
RaceRow = tuple[int, str, float, float | None, str, str | None]


async def _load_race_rows(session: AsyncSession, cutoff: datetime) -> list[RaceRow]:
    """Partisan per-state race markets with their latest price at-or-before cutoff.

    Shared by every MAGA endpoint. Pre-filters with ``ILIKE`` (cheap scan) — the
    engine regex (``parse_state_race``) does the precise party/office/state parse.
    """
    candidates = (
        await session.execute(
            select(
                CoreMarket.id, CoreMarket.title, CoreMarket.venue, CoreMarket.slug
            ).where(
                and_(
                    CoreMarket.title.ilike("%race in 2026%"),
                    or_(
                        CoreMarket.title.ilike("%republicans win%"),
                        CoreMarket.title.ilike("%democrats win%"),
                    ),
                )
            )
        )
    ).all()
    meta_by_id = {mid: (title, venue, slug) for mid, title, venue, slug in candidates}
    market_ids = list(meta_by_id)
    if not market_ids:
        return []

    # Latest snapshot per market at-or-before cutoff (one row each).
    latest = (
        select(
            TsPriceSnapshot.market_id,
            TsPriceSnapshot.last_price,
            TsPriceSnapshot.volume_24h,
        )
        .where(
            TsPriceSnapshot.market_id.in_(market_ids),
            TsPriceSnapshot.snapshot_at <= cutoff,
        )
        .order_by(TsPriceSnapshot.market_id, TsPriceSnapshot.snapshot_at.desc())
        .distinct(TsPriceSnapshot.market_id)
    )
    rows: list[RaceRow] = []
    for mid, price, vol in (await session.execute(latest)).all():
        if price is None:
            continue
        title, venue, slug = meta_by_id[mid]
        rows.append(
            (mid, title, float(price), float(vol) if vol is not None else None, venue, slug)
        )
    return rows


def _group_row(g: StateGroup) -> MagaGroupRow:
    """Engine StateGroup → API row (with its contributing contracts)."""
    return MagaGroupRow(
        state=g.state,
        state_code=g.state_code,
        office=g.office,
        district=None,
        heat=g.heat,
        n_markets=g.n_markets,
        volume_24h=g.volume_24h,
        base_question=g.base_question,
        contracts=[
            MagaRaceContractRow(
                market_id=c.market_id,
                title=c.title,
                venue=c.venue,
                yes_pct=c.yes_pct,
                p_r=c.p_r,
                volume_24h=c.volume_24h,
                slug=c.slug,
            )
            for c in g.contracts
        ],
    )


@router.get("/by-state", response_model=MagaByStateEnvelope)
async def maga_by_state(
    as_of: datetime | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> MagaByStateEnvelope:
    """Per-state partisan lean (0–100, 100 = Republican) for the MAGA map.

    Pre-filters to "...win the <State> <office> race in 2026" markets with
    ``ILIKE`` (keeps the scan small), reads each one's latest price/volume
    at-or-before ``as_of`` (default now), and collapses them per state.
    """
    cutoff = as_of or datetime.now(timezone.utc)

    race_rows = await _load_race_rows(session, cutoff)
    # state_lean wants 4-tuples (id, title, price, volume); drop venue/slug.
    leans = aggregate_state_lean([(r[0], r[1], r[2], r[3]) for r in race_rows])

    states = {
        code: StateLeanRow(
            state=l.state,
            state_code=l.state_code,
            heat=l.heat,
            n_markets=l.n_markets,
            offices=l.offices,
            volume_24h=l.volume_24h,
        )
        for code, l in leans.items()
    }

    # National lean: volume-weighted across states (simple mean if no volume).
    total_vol = sum(l.volume_24h for l in leans.values())
    if leans:
        if total_vol > 0:
            national = sum(l.heat * l.volume_24h for l in leans.values()) / total_vol
        else:
            national = sum(l.heat for l in leans.values()) / len(leans)
        national_heat: float | None = round(national, 2)
    else:
        national_heat = None

    n_markets = sum(l.n_markets for l in leans.values())
    summary = (
        f"MAGA lean across {len(states)} states from {n_markets} race markets; "
        f"national {national_heat if national_heat is not None else 'n/a'}."
    )
    return MagaByStateEnvelope(
        summary=summary,
        data=MagaByStatePayload(
            as_of=cutoff,
            states=states,
            national_heat=national_heat,
            n_states=len(states),
            n_markets=n_markets,
        ),
    )


@router.get("/by-state/{state_code}", response_model=MagaStateDetailEnvelope)
async def maga_state_detail(
    state_code: str = Path(..., min_length=2, max_length=2, description="2-letter state code"),
    as_of: datetime | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> MagaStateDetailEnvelope:
    """One state's MAGA detail: overall lean + per-chamber groups + contracts.

    Backs the state-detail / chamber pages. 404 when the state has no recognised
    partisan race market.
    """
    cutoff = as_of or datetime.now(timezone.utc)
    code = state_code.upper()

    detail = aggregate_state_detail(await _load_race_rows(session, cutoff)).get(code)
    if detail is None:
        raise HTTPException(
            status_code=404,
            detail=f"No MAGA race markets for state '{code}'.",
        )

    return MagaStateDetailEnvelope(
        summary=(
            f"{detail.state}: MAGA lean {detail.heat} across {detail.n_markets} "
            f"race markets in {len(detail.groups)} chamber(s)."
        ),
        data=MagaStateDetailPayload(
            state=detail.state,
            state_code=detail.state_code,
            heat=detail.heat,
            n_markets=detail.n_markets,
            volume_24h=detail.volume_24h,
            offices=detail.offices,
            groups=[_group_row(g) for g in detail.groups],
        ),
    )


@router.get("/groups", response_model=MagaGroupsEnvelope)
async def maga_groups(
    chamber: str | None = Query(
        default=None,
        description="Filter to one office: senate / governor / house. Omit for all.",
    ),
    as_of: datetime | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> MagaGroupsEnvelope:
    """Every (state, chamber) race group, flattened across all states.

    Backs the home Questions tab, chamber listings, and search. ``chamber``
    optionally narrows to one office.
    """
    cutoff = as_of or datetime.now(timezone.utc)
    want = chamber.lower() if chamber else None

    details = aggregate_state_detail(await _load_race_rows(session, cutoff))
    groups: list[MagaGroupRow] = []
    for detail in details.values():
        for g in detail.groups:
            if want and want not in ("all", "state") and g.office != want:
                continue
            groups.append(_group_row(g))
    # Strongest Republican lean first — a sensible default ordering for listings.
    groups.sort(key=lambda r: -r.heat)

    n_states = len({g.state_code for g in groups})
    n_markets = sum(g.n_markets for g in groups)
    return MagaGroupsEnvelope(
        summary=(
            f"{len(groups)} race groups across {n_states} states "
            f"from {n_markets} markets."
        ),
        data=MagaGroupsPayload(
            as_of=cutoff,
            groups=groups,
            n_states=n_states,
            n_markets=n_markets,
        ),
    )


@router.get("/by-state/{state_code}/trends", response_model=MagaTrendsEnvelope)
async def maga_state_trends(
    state_code: str = Path(..., min_length=2, max_length=2, description="2-letter state code"),
    days: int = Query(default=14, ge=1, le=90),
    as_of: datetime | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> MagaTrendsEnvelope:
    """Daily MAGA heat (0–100) for one state over the last ``days`` days.

    Recomputes the state's lean from each market's latest snapshot at-or-before
    each day boundary. Empty ``points`` when the state has no race markets.
    """
    cutoff = as_of or datetime.now(timezone.utc)
    code = state_code.upper()
    window_start = cutoff - timedelta(days=days + 1)

    # Race-market titles for THIS state only (parse narrows the candidate set).
    candidates = (
        await session.execute(
            select(CoreMarket.id, CoreMarket.title).where(
                and_(
                    CoreMarket.title.ilike("%race in 2026%"),
                    or_(
                        CoreMarket.title.ilike("%republicans win%"),
                        CoreMarket.title.ilike("%democrats win%"),
                    ),
                )
            )
        )
    ).all()
    titles: dict[int, str] = {}
    for mid, title in candidates:
        parsed = parse_state_race(title)
        if parsed and state_code_of(parsed[1]) == code:
            titles[mid] = title

    points: list[MagaTrendPoint] = []
    if titles:
        snaps = (
            await session.execute(
                select(
                    TsPriceSnapshot.market_id,
                    TsPriceSnapshot.snapshot_at,
                    TsPriceSnapshot.last_price,
                    TsPriceSnapshot.volume_24h,
                ).where(
                    TsPriceSnapshot.market_id.in_(list(titles)),
                    TsPriceSnapshot.snapshot_at <= cutoff,
                    TsPriceSnapshot.snapshot_at >= window_start,
                )
            )
        ).all()
        series = state_lean_series(
            titles,
            [(mid, at, float(p), float(v) if v is not None else None) for mid, at, p, v in snaps if p is not None],
            code,
            days,
            cutoff,
        )
        points = [MagaTrendPoint(date=d.isoformat(), value=h) for d, h in series]

    return MagaTrendsEnvelope(
        summary=f"{code}: {len(points)} daily heat points over {days}d.",
        data=MagaTrendsPayload(state_code=code, days=days, points=points),
    )


async def _race_titles(session: AsyncSession) -> dict[int, str]:
    """{market_id: title} for every recognised partisan race market."""
    candidates = (
        await session.execute(
            select(CoreMarket.id, CoreMarket.title).where(
                and_(
                    CoreMarket.title.ilike("%race in 2026%"),
                    or_(
                        CoreMarket.title.ilike("%republicans win%"),
                        CoreMarket.title.ilike("%democrats win%"),
                    ),
                )
            )
        )
    ).all()
    return {mid: title for mid, title in candidates if parse_state_race(title)}


@router.get("/trends", response_model=MagaNationalTrendsEnvelope)
async def maga_national_trends(
    days: int = Query(default=14, ge=1, le=90),
    as_of: datetime | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> MagaNationalTrendsEnvelope:
    """Daily national MAGA heat (0–100) over the last ``days`` days.

    Backs the homepage 14-day graph. Same replay as the per-state trends but
    collapsed across all states with the /maga/by-state national aggregation
    (volume-weighted mean of state heats).
    """
    cutoff = as_of or datetime.now(timezone.utc)
    window_start = cutoff - timedelta(days=days + 1)

    titles = await _race_titles(session)
    points: list[MagaTrendPoint] = []
    if titles:
        snaps = (
            await session.execute(
                select(
                    TsPriceSnapshot.market_id,
                    TsPriceSnapshot.snapshot_at,
                    TsPriceSnapshot.last_price,
                    TsPriceSnapshot.volume_24h,
                ).where(
                    TsPriceSnapshot.market_id.in_(list(titles)),
                    TsPriceSnapshot.snapshot_at <= cutoff,
                    TsPriceSnapshot.snapshot_at >= window_start,
                )
            )
        ).all()
        series = national_lean_series(
            titles,
            [
                (mid, at, float(p), float(v) if v is not None else None)
                for mid, at, p, v in snaps
                if p is not None
            ],
            days,
            cutoff,
        )
        points = [MagaTrendPoint(date=d.isoformat(), value=h) for d, h in series]

    return MagaNationalTrendsEnvelope(
        summary=f"National MAGA heat: {len(points)} daily points over {days}d.",
        data=MagaNationalTrendsPayload(days=days, points=points),
    )


@router.get("/last-updated", response_model=MagaLastUpdatedEnvelope)
async def maga_last_updated(
    session: AsyncSession = Depends(get_session),
) -> MagaLastUpdatedEnvelope:
    """When MAGA data was last refreshed: the newest race-market price snapshot.

    ``generated_at`` is None when no race market has any snapshot yet (the
    client should fall back to "n/a" rather than erroring).
    """
    titles = await _race_titles(session)
    generated_at: datetime | None = None
    if titles:
        generated_at = await session.scalar(
            select(func.max(TsPriceSnapshot.snapshot_at)).where(
                TsPriceSnapshot.market_id.in_(list(titles))
            )
        )
    return MagaLastUpdatedEnvelope(
        summary=(
            f"MAGA data last updated {generated_at.isoformat()}."
            if generated_at
            else "No MAGA race-market snapshots yet."
        ),
        data=MagaLastUpdatedPayload(generated_at=generated_at),
    )
