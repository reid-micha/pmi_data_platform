"""Unit tests for `_fetch_event_categories` — /events/keyset enrichment.

Backport of Micah PR #319 / job-executor PR #9 (2026-05-27): walk events
alongside markets so each market gets a topical category from the parent
event's first non-"Featured" tag.

The tests use ``httpx.MockTransport`` so no live Polymarket calls happen.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from pmi_ingest.pollers.polymarket_rest import (
    _fetch_event_categories,
    _upsert_market,
)


pytestmark = pytest.mark.asyncio


def _events_response(events: list[dict[str, Any]], next_cursor: str | None = None) -> dict[str, Any]:
    return {"events": events, "next_cursor": next_cursor or ""}


def _mock_transport(pages: list[dict[str, Any]]) -> httpx.MockTransport:
    """Serve `pages` in order; one request consumes one page."""
    state = {"idx": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if state["idx"] >= len(pages):
            return httpx.Response(200, json=_events_response([]))
        page = pages[state["idx"]]
        state["idx"] += 1
        return httpx.Response(200, json=page)

    return httpx.MockTransport(handler)


async def test_event_categories_picks_first_non_featured_tag() -> None:
    pages = [
        _events_response(
            [
                {
                    "id": "evt-1",
                    "tags": [
                        {"label": "Featured"},
                        {"label": "Politics"},
                        {"label": "US"},
                    ],
                    "markets": [{"id": 100}, {"id": 101}],
                },
                {
                    "id": "evt-2",
                    "tags": [{"label": "Economy"}],
                    "markets": [{"id": 200}],
                },
            ]
        )
    ]
    async with httpx.AsyncClient(
        transport=_mock_transport(pages), base_url="https://example.test"
    ) as client:
        out = await _fetch_event_categories(client, page_size=100, max_pages=5)
    assert out == {"100": "Politics", "101": "Politics", "200": "Economy"}


async def test_event_categories_skips_events_without_usable_tag() -> None:
    """Featured-only / "Hide From New"-only / tag-less events contribute no
    map entries (their child markets keep whatever market-level category
    they have). "Hide From New" is a Polymarket editorial flag observed on
    ~3% of events in live data (2026-06-03 sample)."""
    pages = [
        _events_response(
            [
                {"id": "evt-skip-1", "tags": [{"label": "Featured"}], "markets": [{"id": 1}]},
                {
                    "id": "evt-skip-2",
                    "tags": [{"label": "Hide From New"}],
                    "markets": [{"id": 2}],
                },
                {"id": "evt-skip-3", "tags": [], "markets": [{"id": 3}]},
                {"id": "evt-ok", "tags": [{"label": "Crypto"}], "markets": [{"id": 4}]},
                {
                    "id": "evt-fall-through",
                    "tags": [
                        {"label": "Featured"},
                        {"label": "Hide From New"},
                        {"label": "Bitcoin"},
                    ],
                    "markets": [{"id": 5}],
                },
            ]
        )
    ]
    async with httpx.AsyncClient(
        transport=_mock_transport(pages), base_url="https://example.test"
    ) as client:
        out = await _fetch_event_categories(client, page_size=100, max_pages=5)
    assert out == {"4": "Crypto", "5": "Bitcoin"}


async def test_event_categories_paginates_via_next_cursor() -> None:
    pages = [
        _events_response(
            [{"id": "e1", "tags": [{"label": "A"}], "markets": [{"id": 1}]}],
            next_cursor="cur-1",
        ),
        _events_response(
            [{"id": "e2", "tags": [{"label": "B"}], "markets": [{"id": 2}]}],
            next_cursor=None,
        ),
    ]
    async with httpx.AsyncClient(
        transport=_mock_transport(pages), base_url="https://example.test"
    ) as client:
        out = await _fetch_event_categories(client, page_size=100, max_pages=5)
    assert out == {"1": "A", "2": "B"}


async def test_event_categories_returns_empty_on_http_error() -> None:
    """A flaky /events endpoint must never break the cycle — the markets
    side is the critical path; categories are best-effort enrichment."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler), base_url="https://example.test"
    ) as client:
        out = await _fetch_event_categories(client, page_size=100, max_pages=5)
    assert out == {}


async def test_event_categories_handles_malformed_tags_dict() -> None:
    """Non-dict tag entries must not crash the parser — defend against the
    Gamma API occasionally serialising tags as bare strings."""
    pages = [
        _events_response(
            [
                {
                    "id": "evt-mixed",
                    "tags": ["string-tag", {"label": None}, {"label": "Real"}],
                    "markets": [{"id": 42}],
                }
            ]
        )
    ]
    async with httpx.AsyncClient(
        transport=_mock_transport(pages), base_url="https://example.test"
    ) as client:
        out = await _fetch_event_categories(client, page_size=100, max_pages=5)
    assert out == {"42": "Real"}


# ──────────────────────────────────────────────────────────────────────────
# _upsert_market: integration with the event-categories map
# ──────────────────────────────────────────────────────────────────────────
#
# We don't spin up a real DB here — the goal is to assert that the
# category-resolution *priority* is right (event map > market.category >
# market.group). Calls to `session.execute` are stubbed so the upsert path
# returns a sentinel id without touching SQLAlchemy.


class _StubSession:
    def __init__(self, returned_id: int = 1) -> None:
        self.returned_id = returned_id
        self.captured_category: str | None = None
        self.executed: list[Any] = []

    async def execute(self, stmt: Any) -> Any:
        # Pull `category` out of the inserted values so the test can assert
        # what the upsert actually wrote without round-tripping a DB.
        try:
            values = stmt.compile().params
            self.captured_category = values.get("category")
        except Exception:
            pass
        self.executed.append(stmt)

        class _Result:
            def __init__(self, rid: int) -> None:
                self._rid = rid

            def scalar_one(self) -> int:  # noqa: D401
                return self._rid

        return _Result(self.returned_id)


async def test_upsert_prefers_event_category_over_market_fields() -> None:
    session = _StubSession()
    market = {
        "id": "ext-9001",
        "question": "Will X happen?",
        "category": "MarketCategory",
        "group": "MarketGroup",
    }
    await _upsert_market(session, market, event_categories={"ext-9001": "Politics"})
    assert session.captured_category == "Politics"


async def test_upsert_falls_back_to_market_category_when_event_map_misses() -> None:
    session = _StubSession()
    market = {
        "id": "ext-9002",
        "question": "Will X happen?",
        "category": "MarketCategory",
    }
    await _upsert_market(session, market, event_categories={"some-other-id": "Politics"})
    assert session.captured_category == "MarketCategory"


async def test_upsert_falls_back_to_group_when_no_category_anywhere() -> None:
    session = _StubSession()
    market = {
        "id": "ext-9003",
        "question": "Will X happen?",
        "group": "MarketGroup",
    }
    await _upsert_market(session, market, event_categories={})
    assert session.captured_category == "MarketGroup"


async def test_upsert_accepts_none_event_categories_for_legacy_callers() -> None:
    """Existing scripts that call _upsert_market without the new arg
    must keep working — the parameter has a None default."""
    session = _StubSession()
    market = {
        "id": "ext-9004",
        "question": "Will X happen?",
        "category": "Politics",
    }
    await _upsert_market(session, market)
    assert session.captured_category == "Politics"
