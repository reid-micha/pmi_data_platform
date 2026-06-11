"""Route tests for /maga — by-state, state detail, groups, trends.

Locks in the public response shapes consumed by pmi-maga-web for the four
endpoints added in the Micah → pmi_data_platform port:

    GET /maga/by-state
    GET /maga/by-state/{state_code}
    GET /maga/by-state/{state_code}/trends
    GET /maga/groups

All four derive per-state partisan lean on demand from the partisan
general-election race markets seeded in ``conftest.seeded_data``. That fixture
seeds exactly three "senate"-keyword markets:

    Ohio  R  price 0.50  vol 1000   → recognised seat
    Texas R  price 0.50  vol 2000   → recognised seat
    "Will Jane Doe be the Democratic nominee for Senate in Ohio?"  → noise

The nominee market carries neither "race in 2026" nor "<party> win", so the
route's ``ILIKE`` pre-filter drops it. Every assertion below therefore expects
two contributing markets (OH + TX), each a 50/50 race → heat 50.0.

Each test pins ``as_of`` to the fixture's score timestamp so the snapshot window
is deterministic regardless of when the suite runs.
"""

from __future__ import annotations

from typing import Any

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_by_state_collapses_seeded_senate_races(
    client: AsyncClient, seeded_data: dict[str, Any]
) -> None:
    as_of = seeded_data["latest_score_as_of"].isoformat()
    resp = await client.get("/maga/by-state", params={"as_of": as_of})
    assert resp.status_code == 200
    body = resp.json()

    data = body["data"]
    # Nominee-noise market is filtered out → exactly the two real seats.
    assert data["n_markets"] == 2
    assert data["n_states"] == 2
    assert set(data["states"]) == {"OH", "TX"}
    # Both seats are 50/50 R races, so national lean is 50.0.
    assert data["national_heat"] == 50.0

    ohio = data["states"]["OH"]
    assert ohio == {
        "state": "Ohio",
        "state_code": "OH",
        "heat": 50.0,
        "n_markets": 1,
        "offices": ["senate"],
        "volume_24h": 1000.0,
    }
    assert "2 states" in body["summary"]


@pytest.mark.asyncio
async def test_by_state_detail_returns_groups_and_contracts(
    client: AsyncClient, seeded_data: dict[str, Any]
) -> None:
    as_of = seeded_data["latest_score_as_of"].isoformat()
    resp = await client.get("/maga/by-state/OH", params={"as_of": as_of})
    assert resp.status_code == 200
    data = resp.json()["data"]

    assert data["state"] == "Ohio"
    assert data["state_code"] == "OH"
    assert data["heat"] == 50.0
    assert data["n_markets"] == 1
    assert data["offices"] == ["senate"]
    assert len(data["groups"]) == 1

    group = data["groups"][0]
    assert group["office"] == "senate"
    assert group["heat"] == 50.0
    assert group["n_markets"] == 1
    assert group["base_question"] == "Will the Republicans win the Ohio Senate race in 2026?"

    assert len(group["contracts"]) == 1
    contract = group["contracts"][0]
    assert contract["title"] == "Will the Republicans win the Ohio Senate race in 2026?"
    assert contract["venue"] == "polymarket"
    assert contract["yes_pct"] == 50.0
    assert contract["p_r"] == 0.5
    assert contract["volume_24h"] == 1000.0
    assert contract["slug"] == "senate-race-0"


@pytest.mark.asyncio
async def test_by_state_detail_is_case_insensitive(
    client: AsyncClient, seeded_data: dict[str, Any]
) -> None:
    as_of = seeded_data["latest_score_as_of"].isoformat()
    resp = await client.get("/maga/by-state/oh", params={"as_of": as_of})
    assert resp.status_code == 200
    assert resp.json()["data"]["state_code"] == "OH"


@pytest.mark.asyncio
async def test_by_state_detail_404_for_unknown_state(
    client: AsyncClient, seeded_data: dict[str, Any]
) -> None:
    as_of = seeded_data["latest_score_as_of"].isoformat()
    resp = await client.get("/maga/by-state/ZZ", params={"as_of": as_of})
    assert resp.status_code == 404
    assert "ZZ" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_by_state_detail_422_for_bad_length(client: AsyncClient) -> None:
    # state_code is Path(min_length=2, max_length=2) — a full name is rejected
    # before the handler runs.
    resp = await client.get("/maga/by-state/OHIO")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_groups_flattens_all_states(
    client: AsyncClient, seeded_data: dict[str, Any]
) -> None:
    as_of = seeded_data["latest_score_as_of"].isoformat()
    resp = await client.get("/maga/groups", params={"as_of": as_of})
    assert resp.status_code == 200
    data = resp.json()["data"]

    assert data["n_states"] == 2
    assert data["n_markets"] == 2
    assert len(data["groups"]) == 2
    assert {g["state_code"] for g in data["groups"]} == {"OH", "TX"}
    assert all(g["office"] == "senate" for g in data["groups"])
    # Listings default to strongest-Republican-lean first (non-increasing heat).
    heats = [g["heat"] for g in data["groups"]]
    assert heats == sorted(heats, reverse=True)


@pytest.mark.asyncio
async def test_groups_chamber_filter(
    client: AsyncClient, seeded_data: dict[str, Any]
) -> None:
    as_of = seeded_data["latest_score_as_of"].isoformat()

    senate = await client.get(
        "/maga/groups", params={"as_of": as_of, "chamber": "senate"}
    )
    assert senate.status_code == 200
    assert len(senate.json()["data"]["groups"]) == 2

    # No governor races seeded → empty, and the rollup counts collapse to zero.
    governor = await client.get(
        "/maga/groups", params={"as_of": as_of, "chamber": "governor"}
    )
    assert governor.status_code == 200
    gov_data = governor.json()["data"]
    assert gov_data["groups"] == []
    assert gov_data["n_states"] == 0
    assert gov_data["n_markets"] == 0


@pytest.mark.asyncio
async def test_state_trends_returns_daily_series(
    client: AsyncClient, seeded_data: dict[str, Any]
) -> None:
    as_of = seeded_data["latest_score_as_of"].isoformat()
    resp = await client.get("/maga/by-state/OH/trends", params={"as_of": as_of})
    assert resp.status_code == 200
    data = resp.json()["data"]

    assert data["state_code"] == "OH"
    assert data["days"] == 14
    # Only one snapshot exists, at-or-before the as_of day boundary, so the
    # series carries a single point at that day's heat.
    assert data["points"] == [
        {"date": seeded_data["latest_score_as_of"].date().isoformat(), "value": 50.0}
    ]


@pytest.mark.asyncio
async def test_state_trends_empty_for_unknown_state(
    client: AsyncClient, seeded_data: dict[str, Any]
) -> None:
    # Unlike /by-state/{code}, the trends endpoint does NOT 404 — it returns an
    # empty series so the chart can render a blank state.
    as_of = seeded_data["latest_score_as_of"].isoformat()
    resp = await client.get("/maga/by-state/ZZ/trends", params={"as_of": as_of})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["state_code"] == "ZZ"
    assert data["points"] == []


@pytest.mark.asyncio
async def test_state_trends_days_param_validation(client: AsyncClient) -> None:
    # days is Query(ge=1, le=90).
    assert (await client.get("/maga/by-state/OH/trends", params={"days": 0})).status_code == 422
    assert (await client.get("/maga/by-state/OH/trends", params={"days": 91})).status_code == 422


@pytest.mark.asyncio
async def test_national_trends_returns_daily_series(
    client: AsyncClient, seeded_data: dict[str, Any]
) -> None:
    as_of = seeded_data["latest_score_as_of"].isoformat()
    resp = await client.get("/maga/trends", params={"as_of": as_of})
    assert resp.status_code == 200
    data = resp.json()["data"]

    assert data["days"] == 14
    # Both seeded races are 50/50 → national heat 50.0; the single snapshot day
    # yields a single point (earlier boundaries have no data and are skipped).
    assert data["points"] == [
        {"date": seeded_data["latest_score_as_of"].date().isoformat(), "value": 50.0}
    ]


@pytest.mark.asyncio
async def test_national_trends_days_param_validation(client: AsyncClient) -> None:
    assert (await client.get("/maga/trends", params={"days": 0})).status_code == 422
    assert (await client.get("/maga/trends", params={"days": 91})).status_code == 422


@pytest.mark.asyncio
async def test_last_updated_returns_newest_race_snapshot(
    client: AsyncClient, seeded_data: dict[str, Any]
) -> None:
    from datetime import datetime, timedelta

    resp = await client.get("/maga/last-updated")
    assert resp.status_code == 200
    body = resp.json()

    generated_at = datetime.fromisoformat(body["data"]["generated_at"])
    # Race-market snapshots are seeded at score_as_of - 5min. The war-index
    # market has snapshots too, but it's not a race market and must not count.
    expected = seeded_data["latest_score_as_of"] - timedelta(minutes=5)
    assert generated_at == expected
    assert "last updated" in body["summary"]
