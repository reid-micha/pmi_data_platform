"""End-to-end pipeline smoke tests.

Automates SHIP-0.4 acceptance:
- ``GET /indexes`` returns the 5 seeded index defs.
- ``GET /indexes/<id>/score`` returns the deterministic stub-LLM score
  matching the values captured in SHIP-0.3 (war=49.03, senate=76.47,
  house=75.23). Tolerance is ±0.05 to absorb price-snapshot rounding.
- ``GET /indexes/<id>/score/history`` returns at least one point per index.
- ``GET /indexes/<id>/explain`` returns components — guards CORR-3.3
  against future regressions.
- ``GET /health`` + ``GET /sources/health`` both return 200.

Cost: zero LLM calls — all factors fall back to the stub evaluator because
no ``core_factor_models`` rows are seeded.

Wall time: ~25-40s on a warm Docker (postgres already up). Cold-start
(images need build) adds 60-180s on first run.
"""

from __future__ import annotations

import httpx
import pytest

from tests.e2e.conftest import EXPECTED_INDEX_IDS, EXPECTED_SCORES, SCORE_TOLERANCE


def test_health_ok(api_client: httpx.Client) -> None:
    resp = api_client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["db"] is True


def test_sources_health_returns_list(api_client: httpx.Client) -> None:
    """E2E doesn't bring up pmi-ingest, so the list is empty — but the
    endpoint must serialise cleanly (regression guard on Pydantic shapes)."""
    resp = api_client.get("/sources/health")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_indexes_listing_has_all_five(api_client: httpx.Client) -> None:
    resp = api_client.get("/indexes")
    assert resp.status_code == 200
    rows = resp.json()
    ids = {r["id"] for r in rows}
    assert ids == EXPECTED_INDEX_IDS, (
        f"Expected exactly the seeded indexes; got {ids - EXPECTED_INDEX_IDS} extra, "
        f"{EXPECTED_INDEX_IDS - ids} missing"
    )
    for row in rows:
        assert row["version"] >= 1
        assert row["is_current"] is True
        assert len(row["yaml_sha256"]) == 64
        assert row["title"]


@pytest.mark.parametrize("index_id,expected_score", sorted(EXPECTED_SCORES.items()))
def test_score_matches_baseline(
    api_client: httpx.Client, index_id: str, expected_score: float
) -> None:
    """Score-all produced these exact values in SHIP-0.3 (all-stub mode).

    A drift here means either the aggregator math changed (CORR-1.4 bucket
    collapse port etc.), the stub evaluator changed, or the index defs
    were modified — any of which warrants explicit attention.
    """
    resp = api_client.get(f"/indexes/{index_id}/score")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    score = body["data"]["score"]
    assert abs(score - expected_score) < SCORE_TOLERANCE, (
        f"{index_id}: score {score} drifted from baseline {expected_score} "
        f"(tolerance ±{SCORE_TOLERANCE})"
    )
    assert body["data"]["component_count"] >= 1
    assert body["data"]["index_id"] == index_id
    assert body["summary"]  # human-readable envelope present


@pytest.mark.parametrize("index_id", sorted(EXPECTED_INDEX_IDS))
def test_score_history_returns_points(api_client: httpx.Client, index_id: str) -> None:
    resp = api_client.get(f"/indexes/{index_id}/score/history")
    assert resp.status_code == 200
    points = resp.json()["data"]["points"]
    assert len(points) >= 1
    for p in points:
        assert "as_of" in p
        assert p["component_count"] >= 1


def test_explain_returns_components(api_client: httpx.Client) -> None:
    """CORR-3.3 regression guard: at e2e level, /explain must surface a
    non-empty components list with non-zero relevancy + a real last_price
    (the explain bug pre-fix returned 0.0 / null for every market)."""
    resp = api_client.get("/indexes/polymarket-war-index/explain")
    assert resp.status_code == 200
    body = resp.json()
    components = body["components"]
    assert len(components) >= 1, "explain should surface the markets that fed into the score"
    # At least one component should have a real numeric relevancy from the
    # weighted factor (stub evaluator emits value_numeric=1.0 for binary
    # factors → relevancy=1.0 after weighting).
    assert any(c["relevancy"] > 0 for c in components)
    # At least one component should have a last_price (seeded via ts_price_snapshots).
    assert any(c["last_price"] is not None for c in components)
    # `factors` dict must be populated.
    for c in components:
        assert isinstance(c["factors"], dict)


def test_404_for_unknown_index(api_client: httpx.Client) -> None:
    resp = api_client.get("/indexes/does-not-exist-9999")
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"]["code"] == "INDEX_NOT_FOUND"
