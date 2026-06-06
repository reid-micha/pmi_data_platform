"""Unit tests for the MAGA-by-state lean engine (Task #6, pure logic)."""

from __future__ import annotations

from pmi_core.engine.state_lean import aggregate_state_lean, parse_state_race


def test_parse_matches_partisan_per_state_races():
    assert parse_state_race("Will the Republicans win the Ohio Senate race in 2026?") == (
        "R",
        "Ohio",
        "senate",
    )
    assert parse_state_race(
        "Will the Democrats win the Texas gubernatorial race in 2026?"
    ) == ("D", "Texas", "governor")
    assert parse_state_race(
        "Will the Republicans win the Georgia governor race in 2026?"
    ) == ("R", "Georgia", "governor")


def test_parse_matches_casual_seed_phrasings():
    # "seat ... 2026 election" / GOP / hold / flip — the looser live + seed forms.
    assert parse_state_race("Will the GOP win the Ohio Senate seat in the 2026 election?") == (
        "R",
        "Ohio",
        "senate",
    )
    assert parse_state_race("Will Democrats hold the Arizona Senate seat in 2026?") == (
        "D",
        "Arizona",
        "senate",
    )
    assert parse_state_race("Will Republicans flip the Nevada Senate seat in 2026?") == (
        "R",
        "Nevada",
        "senate",
    )


def test_parse_rejects_chamber_level_and_district_markets():
    # No state name → not a per-state race.
    assert parse_state_race("Will Republicans control the U.S. Senate after the 2026 election?") is None
    # District markets (NY-17) carry no full state name → skipped for now.
    assert parse_state_race("Will the GOP win NY-17 in the 2026 House election?") is None


def test_parse_rejects_non_partisan_or_non_race_titles():
    # candidate-name markets are out of scope (handled elsewhere)
    assert parse_state_race("Will Dan Sullivan win the Alaska Senate race in 2026?") is None
    # procedural / chamber-level
    assert parse_state_race("Will the Senate pass a reconciliation bill?") is None
    # wrong cycle
    assert parse_state_race("Will the Republicans win the Ohio Senate race in 2028?") is None


def test_d_market_inverts_to_p_r():
    # A lone Democrat market at 0.70 → P(R) = 0.30 → heat 30.
    out = aggregate_state_lean(
        [(1, "Will the Democrats win the Maine Senate race in 2026?", 0.70, 1000.0)]
    )
    assert out["ME"].heat == 30.0
    assert out["ME"].n_markets == 1


def test_volume_weighted_collapse_of_same_state():
    # R@0.62 (vol 100k) + D@0.40→P(R)0.60 (vol 50k) → (62000+30000)/150000.
    out = aggregate_state_lean(
        [
            (1, "Will the Republicans win the Ohio Senate race in 2026?", 0.62, 100_000.0),
            (2, "Will the Democrats win the Ohio Senate race in 2026?", 0.40, 50_000.0),
        ]
    )
    assert out["OH"].heat == 61.33
    assert out["OH"].n_markets == 2
    assert out["OH"].volume_24h == 150_000.0


def test_simple_mean_fallback_without_volume():
    out = aggregate_state_lean(
        [(3, "Will the Republicans win the Texas gubernatorial race in 2026?", 0.80, None)]
    )
    assert out["TX"].heat == 80.0
    assert out["TX"].offices == ["governor"]


def test_unrecognised_state_dropped():
    out = aggregate_state_lean(
        [(9, "Will the Republicans win the Atlantis Senate race in 2026?", 0.9, 10.0)]
    )
    assert out == {}
