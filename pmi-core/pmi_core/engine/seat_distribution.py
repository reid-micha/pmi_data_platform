"""Balance-of-power seat distribution (CORR-1.6).

Drives the senate-board UI's top-line probabilities. Given the per-race
market-implied probability that Republicans *win each contested seat*, plus
the holdover seats not on the ballot, this module computes:

  * ``p_r_majority`` = P(total R seats >= threshold)   → board ``pmiGOPMajority``
  * ``p_d_majority`` = P(total D seats >= threshold)   → board ``pmiDemMajority``
  * ``expected_r_seats`` / ``stdev_r_seats``           → board E[seats] tile
  * ``total_seats_pmf``                                → seat-count histogram

The crucial correctness point this fixes (vs the senate PoC
``senate_2026_pmi.py::_aggregate_pmi``, which liquidity-weight-*averages*
direct/BoP markets): the chamber-control probability is **not** an average
or a sum of per-race probabilities. Each contested race is an independent
Bernoulli(p_i); the number of R wins among them follows a
**Poisson-binomial** distribution. Its exact PMF is the convolution of the
n per-race ``[1 - p_i, p_i]`` two-point distributions, which we evaluate with
``numpy.convolve``; we then shift it by the holdover R seats and read tail
mass for the majority thresholds. (We use numpy rather than scipy because
scipy has no *exact* Poisson-binomial — only normal approximations, which we
don't need at n~35.)

Independence across races is an approximation (national swing correlates
races), the same approximation the noisy-OR bucket collapser already makes.
A correlated model is future work; this is the honest first-order answer and
is exact *given* independence.

Pure-Python, no DB / LLM / network — unit-testable in isolation.

Band classification (``classify_band`` / ``band_counts``) mirrors the
frontend ``pmi-new-frontend/data-senate.js`` ``bandOf`` so the board's
7-band seat tally is computed once, server-side. Cutoffs here are in
probability space [0, 1]; the frontend expresses them as 0..100.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

# --- Band classification (mirror of frontend data-senate.js `bandOf`) ------
# Keys and order are load-bearing: the board renders bands left→right Dem→Rep.
BANDS: tuple[str, ...] = (
    "safe-d",
    "likely-d",
    "lean-d",
    "tossup",
    "lean-r",
    "likely-r",
    "safe-r",
)

# Upper-inclusive cutoffs in P(R wins) space. Checked in ascending order;
# first match wins. Mirrors bandOf: <=0.10 safe-d, <=0.25 likely-d,
# <=0.40 lean-d, <0.60 tossup, <0.75 lean-r, <0.90 likely-r, else safe-r.
_BAND_CUTOFFS: tuple[tuple[float, str], ...] = (
    (0.10, "safe-d"),
    (0.25, "likely-d"),
    (0.40, "lean-d"),
    (0.60, "tossup"),   # 0.40 < p < 0.60
    (0.75, "lean-r"),
    (0.90, "likely-r"),
)


def classify_band(p_r_win: float) -> str:
    """Map a single race's P(R wins) in [0, 1] to one of the 7 bands.

    The tossup / lean cutoffs are half-open on the upper side to match the
    frontend (a 0.40 race is lean-d, a 0.60 race is lean-r).
    """
    p = _clamp(p_r_win)
    # safe-d / likely-d / lean-d are upper-inclusive; tossup/lean-r/likely-r
    # are upper-exclusive. The lean-d cutoff (<=0.40) and tossup lower bound
    # (>0.40) are handled by ordering: a value of exactly 0.40 matches lean-d.
    for cutoff, band in _BAND_CUTOFFS:
        if band in ("safe-d", "likely-d", "lean-d"):
            if p <= cutoff:
                return band
        elif p < cutoff:
            return band
    return "safe-r"


def band_counts(
    contested_probs: list[float],
    *,
    holdover_r: int = 0,
    holdover_d: int = 0,
) -> dict[str, int]:
    """Count contested races per band, then fold holdover seats into the safes.

    Mirrors the frontend's ``counts`` object: every contested race lands in
    exactly one band by ``classify_band``; holdover (not-on-ballot) R seats
    add to ``safe-r`` and holdover D seats add to ``safe-d`` — they are, by
    definition, locked.
    """
    counts = dict.fromkeys(BANDS, 0)
    for p in contested_probs:
        counts[classify_band(p)] += 1
    counts["safe-d"] += holdover_d
    counts["safe-r"] += holdover_r
    return counts


# --- Poisson-binomial seat distribution ------------------------------------


@dataclass(frozen=True)
class SeatDistribution:
    """Result of folding per-race Bernoulli outcomes into a chamber view.

    All probabilities are in [0, 1]; the API layer (SHIP-2.5) multiplies by
    100 for the board's ``pmiGOPMajority`` / ``pmiDemMajority`` fields.
    """

    expected_r_seats: float
    stdev_r_seats: float
    p_r_majority: float            # P(total R seats >= threshold)
    p_d_majority: float            # P(total D seats >= threshold)
    contested_pmf: list[float]     # pmf[k] = P(exactly k R wins among contested)
    total_seats_pmf: dict[int, float]  # total R seats (incl holdover) -> prob
    n_contested: int
    holdover_r: int
    holdover_d: int
    total_seats: int
    majority_threshold: int


def _clamp(p: float) -> float:
    return max(0.0, min(1.0, float(p)))


def _poisson_binomial_pmf(probs: list[float]) -> list[float]:
    """Exact PMF of the number of successes across independent Bernoulli(p_i).

    The Poisson-binomial PMF is the convolution of the n per-race two-point
    distributions ``[1 - p_i, p_i]``; we fold them with ``np.convolve``.
    Returns ``pmf`` of length ``len(probs) + 1`` where ``pmf[k]`` is
    P(exactly k successes). Empty input → ``[1.0]`` (0 successes w.p. 1).
    """
    pmf = np.array([1.0])
    for p in probs:
        p = _clamp(p)
        pmf = np.convolve(pmf, [1.0 - p, p])
    return pmf.tolist()


def compute_seat_distribution(
    contested_probs: list[float],
    *,
    holdover_r: int = 0,
    holdover_d: int = 0,
    total_seats: int = 100,
    majority_threshold: int = 51,
) -> SeatDistribution:
    """Build the chamber-control distribution from per-race R-win probabilities.

    Parameters
    ----------
    contested_probs:
        P(Republican wins) for each seat on the ballot, in [0, 1].
    holdover_r / holdover_d:
        Seats not on the ballot, already held by each party (constants added
        to every realization). For the 2026 Senate: 100 = 33 contested +
        67 holdover, so e.g. holdover_r=32, holdover_d=34, leaving 34 (or 33)
        contested depending on specials.
    total_seats:
        Chamber size (100 for Senate, 435 for House). Used to derive the D
        seat count as ``total_seats - r_seats``.
    majority_threshold:
        Seats needed for control (51 for a 100-seat Senate majority; pass 50
        if you want to model a VP tie-break as control).

    Returns a :class:`SeatDistribution`. ``p_r_majority + p_d_majority`` need
    not equal 1: with an even chamber and threshold = size/2 + 1 there is
    tie mass (e.g. 50-50) belonging to neither.
    """
    probs = [_clamp(p) for p in contested_probs]
    contested_pmf = _poisson_binomial_pmf(probs)

    # Shift contested wins by holdover to get total R seats; build the pmf.
    total_seats_pmf: dict[int, float] = {}
    p_r_majority = 0.0
    for k, mass in enumerate(contested_pmf):
        if mass == 0.0:
            continue
        r_seats = k + holdover_r
        total_seats_pmf[r_seats] = total_seats_pmf.get(r_seats, 0.0) + mass
        if r_seats >= majority_threshold:
            p_r_majority += mass

    # D majority: D seats = total_seats - r_seats >= threshold.
    p_d_majority = 0.0
    for r_seats, mass in total_seats_pmf.items():
        if total_seats - r_seats >= majority_threshold:
            p_d_majority += mass

    # Expectation / variance via linearity (exact for Poisson-binomial):
    #   E[R] = holdover_r + Σ p_i ;  Var[R] = Σ p_i (1 - p_i).
    p_arr = np.array(probs, dtype=float)
    expected_r_seats = holdover_r + float(p_arr.sum())
    variance = float((p_arr * (1.0 - p_arr)).sum())
    stdev_r_seats = math.sqrt(variance) if variance > 0 else 0.0

    return SeatDistribution(
        expected_r_seats=expected_r_seats,
        stdev_r_seats=stdev_r_seats,
        p_r_majority=p_r_majority,
        p_d_majority=p_d_majority,
        contested_pmf=contested_pmf,
        total_seats_pmf=total_seats_pmf,
        n_contested=len(probs),
        holdover_r=holdover_r,
        holdover_d=holdover_d,
        total_seats=total_seats,
        majority_threshold=majority_threshold,
    )
