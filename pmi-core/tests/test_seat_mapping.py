"""Unit tests for market → contested-seat mapping (CORR-1.3)."""

from __future__ import annotations

import pytest

from pmi_core.engine.seat_mapping import (
    extract_contested_seats,
    parse_seat_race,
    state_code,
)

# --------------------------------------------------------------------------
# parse_seat_race — only party-direct per-state races match
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "title,expected",
    [
        ("Will the Republicans win the Ohio Senate race in 2026?", ("R", "Ohio")),
        ("Will the Democrats win the Texas Senate race in 2026?", ("D", "Texas")),
        (
            "Will the Republicans win the North Carolina Senate race in 2026?",
            ("R", "North Carolina"),
        ),
        (
            "Will the Republicans win the New Hampshire Senate race in 2026?",
            ("R", "New Hampshire"),
        ),
    ],
)
def test_parse_matches_party_direct_races(title, expected):
    assert parse_seat_race(title) == expected


@pytest.mark.parametrize(
    "title",
    [
        # nominee / primary markets
        "Will Ed Markey be the Democratic nominee for Senate in Massachusetts?",
        "Will Ken Paxton win the Texas Republican Senate Primary runoff by 9% or more?",
        # candidate-name general-election (deferred — not party-direct)
        "Will Dan Sullivan win the Alaska Senate race in 2026?",
        # independent (deferred)
        "Will an independent win the Montana Senate race in 2026?",
        # foreign senates
        "Will Acción Popular (AP) win the most seats in the 2026 Peruvian Senate election?",
        # chamber-level brackets / control / leadership
        "Will the Republican Party hold 47 or fewer Senate seats after the 2026 midterm elections?",
        "2026 Balance of Power: R Senate, R House",
        "Will Chuck Schumer be the next Senate Majority Leader?",
        # procedural
        "Will the Senate pass a reconciliation bill by June 13?",
    ],
)
def test_parse_rejects_noise(title):
    assert parse_seat_race(title) is None


def test_state_code_lookup():
    assert state_code("Ohio") == "OH"
    assert state_code("north carolina") == "NC"
    assert state_code("New Hampshire") == "NH"
    assert state_code("Notastate") is None


# --------------------------------------------------------------------------
# extract_contested_seats — collapse to one P(R) per state
# --------------------------------------------------------------------------


def test_r_market_used_directly():
    seats = extract_contested_seats(
        [(1, "Will the Republicans win the Ohio Senate race in 2026?", 0.62)]
    )
    assert len(seats) == 1
    s = seats[0]
    assert s.state == "Ohio"
    assert s.state_code == "OH"
    assert s.prob_r == pytest.approx(0.62)
    assert s.market_id == 1
    assert s.source_party == "R"


def test_d_market_flipped():
    seats = extract_contested_seats(
        [(2, "Will the Democrats win the Illinois Senate race in 2026?", 0.80)]
    )
    assert len(seats) == 1
    s = seats[0]
    assert s.prob_r == pytest.approx(0.20)  # 1 - 0.80
    assert s.source_party == "D"
    assert s.market_id == 2


def test_both_markets_collapse_to_one_seat_preferring_r():
    # Texas has both an R and a D market → ONE seat, R price wins.
    seats = extract_contested_seats(
        [
            (10, "Will the Republicans win the Texas Senate race in 2026?", 0.78),
            (11, "Will the Democrats win the Texas Senate race in 2026?", 0.21),
        ]
    )
    assert len(seats) == 1
    s = seats[0]
    assert s.state == "Texas"
    assert s.prob_r == pytest.approx(0.78)
    assert s.source_party == "R"
    assert s.market_id == 10


def test_noise_filtered_out_of_contested_set():
    markets = [
        (1, "Will the Republicans win the Ohio Senate race in 2026?", 0.62),
        (2, "Will Ed Markey be the Democratic nominee for Senate in Massachusetts?", 0.4),
        (3, "Will the Senate pass a reconciliation bill by June 13?", 0.5),
        (4, "2026 Balance of Power: R Senate, R House", 0.3),
        (5, "Will the Democrats win the Texas Senate race in 2026?", 0.21),
    ]
    seats = extract_contested_seats(markets)
    # Only Ohio (R) and Texas (D→flip) survive.
    assert {s.state for s in seats} == {"Ohio", "Texas"}


def test_deterministic_sort_by_state():
    seats = extract_contested_seats(
        [
            (1, "Will the Republicans win the Texas Senate race in 2026?", 0.7),
            (2, "Will the Republicans win the Alabama Senate race in 2026?", 0.9),
            (3, "Will the Republicans win the Ohio Senate race in 2026?", 0.6),
        ]
    )
    assert [s.state for s in seats] == ["Alabama", "Ohio", "Texas"]


def test_clamps_out_of_range_price():
    seats = extract_contested_seats(
        [(1, "Will the Republicans win the Ohio Senate race in 2026?", 1.4)]
    )
    assert seats[0].prob_r == 1.0


def test_empty_input():
    assert extract_contested_seats([]) == []
