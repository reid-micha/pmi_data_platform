"""Unit tests for the balance-of-power seat distribution (CORR-1.6).

Pure-Python, no DB / MLflow / network. Validates the Poisson-binomial
chamber-control math and the band classification that mirrors the frontend
``data-senate.js`` bandOf.
"""

from __future__ import annotations

import math

from pmi_core.engine.seat_distribution import (
    BANDS,
    band_counts,
    classify_band,
    compute_seat_distribution,
)

ABS = 1e-9


# --------------------------------------------------------------------------
# Poisson-binomial PMF correctness
# --------------------------------------------------------------------------


def test_empty_contested_is_pure_holdover():
    d = compute_seat_distribution([], holdover_r=50, holdover_d=50)
    assert d.n_contested == 0
    assert d.contested_pmf == [1.0]
    assert d.expected_r_seats == 50.0
    assert d.stdev_r_seats == 0.0
    # 50 R seats, threshold 51 → no R majority; D also 50 → no D majority.
    assert d.p_r_majority == 0.0
    assert d.p_d_majority == 0.0
    assert d.total_seats_pmf == {50: 1.0}


def test_single_certain_race_tips_majority():
    # holdover 50R/49D + one race R wins for sure → 51 R → R control.
    d = compute_seat_distribution([1.0], holdover_r=50, holdover_d=49)
    assert d.expected_r_seats == 51.0
    assert d.p_r_majority == 1.0
    assert d.p_d_majority == 0.0
    assert d.total_seats_pmf == {51: 1.0}


def test_single_certain_loss():
    d = compute_seat_distribution([0.0], holdover_r=50, holdover_d=49)
    assert d.expected_r_seats == 50.0
    assert d.p_r_majority == 0.0  # 50 R, need 51
    assert d.p_d_majority == 0.0  # 50 D, need 51
    assert d.total_seats_pmf == {50: 1.0}


def test_symmetric_two_coinflips_pmf():
    # 49R/49D holdover + two 50/50 races → contested PMF 0.25/0.5/0.25.
    d = compute_seat_distribution([0.5, 0.5], holdover_r=49, holdover_d=49)
    assert d.contested_pmf == [0.25, 0.5, 0.25]
    # total R: 49→0.25, 50→0.5, 51→0.25
    assert d.total_seats_pmf == {49: 0.25, 50: 0.5, 51: 0.25}
    assert math.isclose(d.p_r_majority, 0.25, abs_tol=ABS)  # R=51
    assert math.isclose(d.p_d_majority, 0.25, abs_tol=ABS)  # R=49 → D=51
    assert math.isclose(d.expected_r_seats, 50.0, abs_tol=ABS)
    assert math.isclose(d.stdev_r_seats, math.sqrt(0.5), abs_tol=ABS)


def test_pmf_sums_to_one():
    d = compute_seat_distribution([0.3, 0.6, 0.9, 0.45, 0.7], holdover_r=40, holdover_d=22)
    assert math.isclose(math.fsum(d.contested_pmf), 1.0, abs_tol=ABS)
    assert math.isclose(math.fsum(d.total_seats_pmf.values()), 1.0, abs_tol=ABS)


def test_expectation_is_linear_sum():
    probs = [0.3, 0.6, 0.9]
    d = compute_seat_distribution(probs, holdover_r=40)
    assert math.isclose(d.expected_r_seats, 40 + 1.8, abs_tol=ABS)
    # variance = Σ p(1-p) = .21 + .24 + .09 = .54
    assert math.isclose(d.stdev_r_seats, math.sqrt(0.54), abs_tol=ABS)


def test_majority_probs_match_brute_force():
    # Independent reference: enumerate all 2^n outcomes.
    probs = [0.2, 0.55, 0.8, 0.35]
    holdover_r, holdover_d, total, thr = 47, 49, 100, 51
    d = compute_seat_distribution(
        probs, holdover_r=holdover_r, holdover_d=holdover_d,
        total_seats=total, majority_threshold=thr,
    )
    n = len(probs)
    p_r = 0.0
    p_d = 0.0
    e_seats = 0.0
    for mask in range(1 << n):
        prob = 1.0
        wins = 0
        for i in range(n):
            if mask & (1 << i):
                prob *= probs[i]
                wins += 1
            else:
                prob *= 1.0 - probs[i]
        r_seats = wins + holdover_r
        e_seats += prob * r_seats
        if r_seats >= thr:
            p_r += prob
        if total - r_seats >= thr:
            p_d += prob
    assert math.isclose(d.p_r_majority, p_r, abs_tol=ABS)
    assert math.isclose(d.p_d_majority, p_d, abs_tol=ABS)
    assert math.isclose(d.expected_r_seats, e_seats, abs_tol=ABS)


def test_clamps_out_of_range_probs():
    d = compute_seat_distribution([1.5, -0.2], holdover_r=49, holdover_d=49)
    # 1.5→1.0 (certain win), -0.2→0.0 (certain loss) → exactly 1 R win.
    assert d.total_seats_pmf == {50: 1.0}
    assert d.expected_r_seats == 50.0


def test_threshold_50_models_vp_tiebreak():
    # With threshold 50, a 50-50 chamber counts as R control.
    d = compute_seat_distribution([0.0], holdover_r=50, holdover_d=49,
                                  majority_threshold=50)
    assert d.p_r_majority == 1.0  # 50 R seats >= 50


# --------------------------------------------------------------------------
# Band classification (mirror of frontend bandOf)
# --------------------------------------------------------------------------


def test_classify_band_cutoffs():
    assert classify_band(0.0) == "safe-d"
    assert classify_band(0.10) == "safe-d"
    assert classify_band(0.11) == "likely-d"
    assert classify_band(0.25) == "likely-d"
    assert classify_band(0.40) == "lean-d"        # upper-inclusive
    assert classify_band(0.50) == "tossup"
    assert classify_band(0.59) == "tossup"
    assert classify_band(0.60) == "lean-r"        # tossup is upper-exclusive
    assert classify_band(0.74) == "lean-r"
    assert classify_band(0.75) == "likely-r"
    assert classify_band(0.89) == "likely-r"
    assert classify_band(0.90) == "safe-r"
    assert classify_band(1.0) == "safe-r"


def test_classify_band_clamps():
    assert classify_band(-1.0) == "safe-d"
    assert classify_band(2.0) == "safe-r"


def test_band_counts_fold_holdover_into_safes():
    # One race per non-safe band + holdover seats added to the safes.
    probs = [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]  # one in each band
    counts = band_counts(probs, holdover_r=30, holdover_d=34)
    assert counts["safe-d"] == 1 + 34
    assert counts["likely-d"] == 1
    assert counts["lean-d"] == 1
    assert counts["tossup"] == 1
    assert counts["lean-r"] == 1
    assert counts["likely-r"] == 1
    assert counts["safe-r"] == 1 + 30
    # Total accounts for every contested race + every holdover seat.
    assert sum(counts.values()) == len(probs) + 30 + 34
    assert set(counts) == set(BANDS)


def test_band_counts_empty():
    counts = band_counts([], holdover_r=3, holdover_d=2)
    assert counts["safe-r"] == 3
    assert counts["safe-d"] == 2
    assert sum(counts.values()) == 5
