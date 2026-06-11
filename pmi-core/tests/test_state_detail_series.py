"""Unit tests for the trend-series replay in engine/state_detail.py.

Covers the shared day-boundary replay (via the public series functions) and
the national collapse: volume-weighted mean of per-state heats, simple mean
when no volume, and day-skipping before any data exists.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from pmi_core.engine.state_detail import national_lean_series, state_lean_series

AS_OF = datetime(2026, 6, 10, 12, 0, 0, tzinfo=UTC)

# Two recognised partisan race markets in different states.
TITLES = {
    1: "Will the Republicans win the Ohio Senate race in 2026?",
    2: "Will the Democrats win the Texas Senate race in 2026?",
}


def test_national_series_volume_weights_across_states() -> None:
    # OH: R market at 0.80 → heat 80, vol 1000.
    # TX: D market at 0.30 → P(R)=0.70 → heat 70, vol 3000.
    snapshots = [
        (1, AS_OF - timedelta(minutes=5), 0.80, 1000.0),
        (2, AS_OF - timedelta(minutes=5), 0.30, 3000.0),
    ]
    series = national_lean_series(TITLES, snapshots, days=14, as_of=AS_OF)
    # Single snapshot day → single point: (80*1000 + 70*3000) / 4000 = 72.5.
    assert series == [(AS_OF.date(), 72.5)]


def test_national_series_simple_mean_without_volume() -> None:
    snapshots = [
        (1, AS_OF - timedelta(minutes=5), 0.80, None),
        (2, AS_OF - timedelta(minutes=5), 0.30, None),
    ]
    series = national_lean_series(TITLES, snapshots, days=14, as_of=AS_OF)
    assert series == [(AS_OF.date(), 75.0)]


def test_national_series_skips_days_before_first_snapshot() -> None:
    # Snapshots only on the last two day boundaries of a 5-day window.
    snapshots = [
        (1, AS_OF - timedelta(days=1, hours=1), 0.60, 100.0),
    ]
    series = national_lean_series(TITLES, snapshots, days=5, as_of=AS_OF)
    dates = [d for d, _ in series]
    assert dates == [(AS_OF - timedelta(days=1)).date(), AS_OF.date()]
    assert all(v == 60.0 for _, v in series)


def test_state_series_unchanged_by_refactor() -> None:
    # The per-state series still filters to its target state only.
    snapshots = [
        (1, AS_OF - timedelta(minutes=5), 0.80, 1000.0),
        (2, AS_OF - timedelta(minutes=5), 0.30, 3000.0),
    ]
    series = state_lean_series(TITLES, snapshots, "OH", days=14, as_of=AS_OF)
    assert series == [(AS_OF.date(), 80.0)]
