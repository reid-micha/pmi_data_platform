"""MAGA-by-state aggregation (Task #6).

Serves the National MAGA Index choropleth + State detail view. Rather than 50
standalone state index definitions, per-state partisan lean is derived on demand
from the partisan general-election race markets already ingested, grouped by
state via ``pmi_core.engine.state_lean``.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from pmi_api.deps import get_session
from pmi_api.schemas import MagaByStateEnvelope, MagaByStatePayload, StateLeanRow
from pmi_core.engine.state_lean import aggregate_state_lean
from pmi_core.models import CoreMarket, TsPriceSnapshot

router = APIRouter(prefix="/maga", tags=["maga"])


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

    # Pre-filter: partisan per-state race markets. The engine regex does the
    # precise parse; this just narrows the table scan.
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

    title_by_id = {mid: title for mid, title in candidates}
    market_ids = list(title_by_id)

    rows: list[tuple[int, str, float, float | None]] = []
    if market_ids:
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
        for mid, price, vol in (await session.execute(latest)).all():
            if price is None:
                continue
            rows.append(
                (mid, title_by_id[mid], float(price), float(vol) if vol is not None else None)
            )

    leans = aggregate_state_lean(rows)

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
