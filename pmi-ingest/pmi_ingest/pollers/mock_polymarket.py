"""Mock Polymarket poller — bypass live HTTP, load markets from a JSON fixture.

Why this exists
---------------
The live REST poller (`polymarket_rest.py`) requires the host to reach
`gamma-api.polymarket.com`. In several common dev environments that's blocked:

  * Corporate proxies that MITM-inspect TLS (cert verify failures)
  * DNS filters that return block pages (Taiwan / HK institutional ISPs)
  * Air-gapped CI without outbound internet

Until the platform is on a cloud host without those constraints, this poller
lets the same pipeline run end-to-end against fixture data. **It runs the
exact same UPSERT/health-record code paths** as the live poller — the only
difference is the source of the market dicts.

Activation
----------
Set `POLYMARKET_USE_MOCK=true` in `pmi_data_platform/.env` (and optionally
override `POLYMARKET_MOCK_FIXTURE_PATH`). `pmi-ingest run` then routes to
this class instead of `PolymarketRestPoller`.

Format
------
The fixture (`pmi-demo/fixtures/markets.json`) uses an *internal* schema
(external_id / title / last_price / volume_24h / opens_at / closes_at).
This module translates each row into a **Polymarket Gamma-shaped dict**
before handing it to `_upsert_market` + `_write_price`, so all downstream
data lineage looks identical to a real poll cycle.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog

from pmi_core.db import session_scope
from pmi_ingest.config import ingest_settings
from pmi_ingest.health import record_poll
from pmi_ingest.pollers.polymarket_rest import (
    SOURCE,
    _upsert_market,
    _write_price,
)

log = structlog.get_logger(__name__)


def _to_gamma_shape(row: dict[str, Any]) -> dict[str, Any]:
    """Translate an internal fixture row into a Polymarket Gamma-shaped dict.

    The shared `_upsert_market` / `_write_price` helpers read the Gamma field
    names (`id`, `question`, `lastTradePrice`, `volume`, `startDate`, ...).
    Mapping here keeps both code paths unified.
    """
    return {
        # IDs
        "id": row.get("external_id") or row.get("slug"),
        "slug": row.get("slug"),
        "conditionId": row.get("condition_id"),
        # Text
        "question": row.get("title"),
        "title": row.get("title"),
        "description": row.get("description"),
        "category": row.get("category"),
        "group": row.get("category"),
        "tags": [{"label": t} for t in (row.get("tags") or [])],
        # Time
        "startDate": row.get("opens_at"),
        "createdAt": row.get("opens_at"),
        "endDate": row.get("closes_at"),
        "closedTime": row.get("closes_at"),
        "resolvedAt": row.get("resolved_at"),
        "resolved": bool(row.get("resolution")),
        "resolution": row.get("resolution"),
        # Price / liquidity
        "lastTradePrice": row.get("last_price"),
        "lastPrice": row.get("last_price"),
        "bestBid": row.get("bid"),
        "bestAsk": row.get("ask"),
        "volume": row.get("volume_24h"),
        "volume24Hr": row.get("volume_24h"),
        "liquidity": row.get("liquidity"),
    }


class MockPolymarketPoller:
    """Drop-in replacement for `PolymarketRestPoller` using a local JSON fixture.

    Implements `pmi_ingest.pollers.Poller`. Records to `audit_source_health`
    under the same `polymarket-rest` source name so dashboards / alerts treat
    mock cycles identically to real ones — set `POLYMARKET_USE_MOCK=false` in
    cloud env to flip back to live HTTP without changing any downstream code.
    """

    name = SOURCE  # share the source name so audit/health rollup is identical

    def __init__(self) -> None:
        self._fixture_path = Path(ingest_settings.polymarket_mock_fixture_path)

    async def run_once(self) -> int:
        started = datetime.now(UTC)
        total_markets = 0
        success = True
        error_class: str | None = None
        error_message: str | None = None

        try:
            if not self._fixture_path.exists():
                raise FileNotFoundError(
                    f"mock fixture not found: {self._fixture_path}. "
                    "Bind-mount pmi-demo/fixtures/ or override "
                    "POLYMARKET_MOCK_FIXTURE_PATH."
                )
            raw = json.loads(self._fixture_path.read_text())
            if not isinstance(raw, list):
                raise ValueError(
                    f"mock fixture must be a JSON array of market dicts; got {type(raw).__name__}"
                )

            log.info(
                "polymarket.mock_load",
                fixture=str(self._fixture_path),
                markets=len(raw),
            )

            async with session_scope() as session:
                for row in raw:
                    try:
                        gamma = _to_gamma_shape(row)
                        market = await _upsert_market(session, gamma)
                        await _write_price(session, market, gamma)
                        total_markets += 1
                    except Exception as inner:
                        log.warning(
                            "polymarket.mock_skip",
                            error=str(inner),
                            external_id=row.get("external_id"),
                        )
        except Exception as exc:
            success = False
            error_class = type(exc).__name__
            error_message = str(exc)[:512]
            log.error("polymarket.mock_failed", error=error_message)
        finally:
            finished = datetime.now(UTC)
            async with session_scope() as session:
                await record_poll(
                    session,
                    source=SOURCE,
                    started_at=started,
                    finished_at=finished,
                    success=success,
                    records=total_markets if success else None,
                    error_class=error_class,
                    error_message=error_message,
                    # Mock has a fixed universe, so "expected" matches what we just loaded.
                    expected_records_24h=total_markets * 12 * 24 if success else None,
                )

        log.info(
            "polymarket.mock_done",
            success=success,
            records=total_markets,
            duration_ms=int((datetime.now(UTC) - started).total_seconds() * 1000),
        )
        if not success and error_message:
            raise RuntimeError(error_message)
        return total_markets
