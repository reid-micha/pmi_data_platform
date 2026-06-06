"""Kalshi WebSocket trade-feed consumer (CORR-4.1 — Kalshi parity).

Subscribes to `wss://api.elections.kalshi.com/trade-api/ws/v2`, channel
`trade`, for every active Kalshi market ticker. Persists fills to
`ts_trades(source='kalshi-ws')` so the aggregator's trade-momentum
signal works uniformly across venues.

Auth
----
Kalshi WS auth is on the HTTP handshake. Signature path = `/trade-api/ws/v2`,
method = `GET`, signed with the same PSS scheme as REST (see `kalshi_rest`).
Without an API key the connection refuses subscribe — anonymous market data
is REST-only at Kalshi. If `KALSHI_API_KEY_ID`/`KALSHI_PRIVATE_KEY` are
empty we log a clear error and bail out of the loop.

Known 401 NOT_FOUND with otherwise-valid creds
----------------------------------------------
Probed 2026-06-01 with a credential pair that passes REST cleanly (200 on
`/trade-api/v2/exchange/status`). WS handshake returned
`{"code":"authentication_error", "details":"NOT_FOUND"}` for every signed
path variant (`/trade-api/ws/v2`, `/trade-api/v2/ws`, `/ws/v2`, ...) and the
only live host is `api.elections.kalshi.com` per their CDN migration banner.
The signature scheme matches REST exactly — REST works, WS doesn't — which
strongly suggests this key isn't provisioned for streaming on the Kalshi side
(market-data-only keys do not get WS access by default). Reid can enable it
from Kalshi's developer console once verified, no code change needed.

Subscribe shape
---------------
    {"id": 1, "cmd": "subscribe", "params": {
        "channels": ["trade"],
        "market_tickers": ["KXPRES-2024-DJT", ...]
    }}

Trade event shape
-----------------
    {"type": "trade", "sid": <int>, "msg": {
        "market_ticker": str,
        "yes_price": <cents>,
        "no_price": <cents>,
        "count": <int>,
        "taker_side": "yes" | "no",
        "ts": <unix_seconds>,
        ...
    }}

We translate to `ts_trades` with `price = yes_price / 100`, `size = count`,
`side = BUY if taker_side==yes else SELL` (mirrors the Polymarket convention
where 'BUY' is the price-positive direction).

Chunked subscribe
-----------------
Kalshi caps each subscribe message at a few hundred market_tickers (per
the docs); we chunk via `kalshi_ws_subscribe_chunk` (default 250).
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from pmi_core.db import session_scope
from pmi_core.models import CoreMarket, TsTrade
from pmi_ingest.config import ingest_settings
from pmi_ingest.health import record_poll
from pmi_ingest.pollers.kalshi_rest import (
    _auth_headers,
    _load_private_key,
)

log = structlog.get_logger(__name__)

SOURCE = "kalshi-ws"
WS_PATH = "/trade-api/ws/v2"


async def _load_active_tickers(session: AsyncSession) -> dict[str, int]:
    """Return {ticker: market_id} for actively-trading Kalshi markets."""
    now = datetime.now(UTC)
    stmt = (
        select(CoreMarket.id, CoreMarket.external_id)
        .where(CoreMarket.venue == "kalshi")
        .where(CoreMarket.resolution.is_(None))
        .where((CoreMarket.closes_at.is_(None)) | (CoreMarket.closes_at > now))
        .order_by(CoreMarket.closes_at.desc().nulls_last())
    )
    cap = ingest_settings.kalshi_ws_max_tokens
    if cap > 0:
        stmt = stmt.limit(cap)
    rows = (await session.execute(stmt)).all()
    return {tkr: mid for mid, tkr in rows if tkr}


def _parse_trade_event(evt: dict[str, Any]) -> dict[str, Any] | None:
    """Coerce a Kalshi WS event into a ts_trades row spec, or None to skip."""
    if evt.get("type") != "trade":
        return None
    msg = evt.get("msg") or {}
    ticker = msg.get("market_ticker")
    if not ticker:
        return None

    yes_price_cents = msg.get("yes_price")
    count = msg.get("count")
    if yes_price_cents is None or count is None:
        return None
    try:
        price = float(yes_price_cents) / 100.0
        size = float(count)
    except (TypeError, ValueError):
        return None

    taker_side = str(msg.get("taker_side") or "").lower()
    side = "BUY" if taker_side == "yes" else "SELL" if taker_side == "no" else "BUY"

    ts = msg.get("ts")
    if isinstance(ts, (int, float)):
        traded_at = datetime.fromtimestamp(float(ts), tz=UTC)
    else:
        traded_at = datetime.now(UTC)

    trade_external_id = (
        f"kalshi-ws:{ticker}:{int(traded_at.timestamp())}:{yes_price_cents}:{count}:{taker_side}"
    )

    return {
        "ticker": str(ticker),
        "traded_at": traded_at,
        "price": price,
        "size": size,
        "side": side,
        "trade_external_id": trade_external_id,
    }


async def _persist_trade(
    session: AsyncSession,
    market_id: int,
    spec: dict[str, Any],
    raw: dict[str, Any],
) -> bool:
    stmt = pg_insert(TsTrade).values(
        market_id=market_id,
        token_id=spec["ticker"],
        traded_at=spec["traded_at"],
        price=spec["price"],
        size=spec["size"],
        side=spec["side"],
        source="kalshi-ws",
        trade_external_id=spec["trade_external_id"],
        raw=raw,
    )
    # Kalshi WS has no tx_hash / log_index — the unique constraint there
    # will never trip from this path. ON CONFLICT NOTHING keeps the
    # statement idempotent if the same trade arrives twice (rare on
    # mid-feed reconnect).
    stmt = stmt.on_conflict_do_nothing(constraint="uq_ts_trades__tx_hash_log_index")
    result = await session.execute(stmt)
    return bool(result.rowcount)


class KalshiWsConsumer:
    """Long-lived Kalshi WS consumer."""

    name = SOURCE

    def __init__(self) -> None:
        # Build wss URL by swapping the scheme on the configured REST host.
        base = ingest_settings.kalshi_base_url
        if base.startswith("https://"):
            self._url = "wss://" + base[len("https://"):] + WS_PATH
        elif base.startswith("http://"):
            self._url = "ws://" + base[len("http://"):] + WS_PATH
        else:
            self._url = "wss://" + base.rstrip("/") + WS_PATH
        self._token_refresh_sec = ingest_settings.kalshi_ws_token_refresh_sec
        self._heartbeat_sec = ingest_settings.kalshi_ws_heartbeat_sec
        self._tickers: dict[str, int] = {}
        self._trades_since_heartbeat = 0
        self._next_subscribe_id = 1

    async def _emit_heartbeat(
        self, *, started: datetime, success: bool, error_message: str | None
    ) -> None:
        finished = datetime.now(UTC)
        async with session_scope() as session:
            await record_poll(
                session,
                source=SOURCE,
                started_at=started,
                finished_at=finished,
                success=success,
                records=self._trades_since_heartbeat if success else None,
                error_class=None if success else "WsHeartbeatFailure",
                error_message=error_message,
                expected_records_24h=None,
            )

    async def _refresh_tickers(self) -> None:
        async with session_scope() as session:
            self._tickers = await _load_active_tickers(session)
        log.info("kalshi.ws.tickers_loaded", count=len(self._tickers))

    async def _subscribe_in_chunks(self, ws: Any, tickers: list[str]) -> None:
        chunk = ingest_settings.kalshi_ws_subscribe_chunk
        for i in range(0, len(tickers), chunk):
            batch = tickers[i : i + chunk]
            payload = {
                "id": self._next_subscribe_id,
                "cmd": "subscribe",
                "params": {"channels": ["trade"], "market_tickers": batch},
            }
            self._next_subscribe_id += 1
            await ws.send(json.dumps(payload))

    async def _connect_and_consume(self) -> None:
        import websockets

        private_key = _load_private_key()
        if private_key is None or not ingest_settings.kalshi_api_key_id:
            log.error(
                "kalshi.ws.no_auth",
                message=(
                    "Kalshi WS requires KALSHI_API_KEY_ID + KALSHI_PRIVATE_KEY. "
                    "Sleeping a long beat before retrying — set creds to enable."
                ),
            )
            # Avoid a tight loop pinging the server with no creds. Wait for
            # operator to set env then a normal pmi-ingest restart will
            # pick it up.
            await asyncio.sleep(self._token_refresh_sec * 5)
            return

        await self._refresh_tickers()
        if not self._tickers:
            log.warning("kalshi.ws.no_tickers_to_subscribe")
            await asyncio.sleep(self._token_refresh_sec)
            return

        headers = _auth_headers(private_key, WS_PATH)
        log.info(
            "kalshi.ws.connecting", url=self._url, tickers=len(self._tickers)
        )
        async with websockets.connect(
            self._url,
            additional_headers=headers,
            ping_interval=30,
            ping_timeout=10,
            max_size=2**22,
        ) as ws:
            await self._subscribe_in_chunks(ws, list(self._tickers.keys()))
            log.info("kalshi.ws.subscribed", tickers=len(self._tickers))

            heartbeat_started = datetime.now(UTC)
            last_refresh = asyncio.get_event_loop().time()

            async for message in ws:
                try:
                    payload = json.loads(message)
                except json.JSONDecodeError:
                    log.warning("kalshi.ws.bad_json", preview=str(message)[:200])
                    continue

                events = payload if isinstance(payload, list) else [payload]
                async with session_scope() as session:
                    for evt in events:
                        if not isinstance(evt, dict):
                            continue
                        # Kalshi sends `{type: "subscribed", ...}` / `{type: "error", ...}`
                        # / `{type: "ok", ...}` — skip non-trade frames silently.
                        evt_type = evt.get("type")
                        if evt_type == "error":
                            log.warning(
                                "kalshi.ws.server_error",
                                code=evt.get("msg", {}).get("code"),
                                detail=str(evt.get("msg"))[:300],
                            )
                            continue
                        if evt_type != "trade":
                            continue
                        spec = _parse_trade_event(evt)
                        if spec is None:
                            continue
                        market_id = self._tickers.get(spec["ticker"])
                        if market_id is None:
                            continue
                        try:
                            inserted = await _persist_trade(
                                session, market_id, spec, evt
                            )
                            if inserted:
                                self._trades_since_heartbeat += 1
                        except Exception as exc:
                            log.warning(
                                "kalshi.ws.persist_failed",
                                error=str(exc)[:200],
                                ticker=spec["ticker"],
                            )

                now = asyncio.get_event_loop().time()
                if (
                    (datetime.now(UTC) - heartbeat_started).total_seconds()
                    >= self._heartbeat_sec
                ):
                    await self._emit_heartbeat(
                        started=heartbeat_started, success=True, error_message=None
                    )
                    log.info(
                        "kalshi.ws.heartbeat", trades=self._trades_since_heartbeat
                    )
                    self._trades_since_heartbeat = 0
                    heartbeat_started = datetime.now(UTC)

                if now - last_refresh >= self._token_refresh_sec:
                    old = self._tickers.copy()
                    await self._refresh_tickers()
                    added = set(self._tickers) - set(old)
                    removed = set(old) - set(self._tickers)
                    if added or removed:
                        await self._subscribe_in_chunks(
                            ws, list(self._tickers.keys())
                        )
                        log.info(
                            "kalshi.ws.resubscribed",
                            added=len(added),
                            removed=len(removed),
                            total=len(self._tickers),
                        )
                    last_refresh = now

    async def run_forever(self) -> None:
        backoff = 1.0
        while True:
            heartbeat_started = datetime.now(UTC)
            self._trades_since_heartbeat = 0
            try:
                await self._connect_and_consume()
                backoff = 1.0
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                error_message = f"{type(exc).__name__}: {exc}"
                log.error(
                    "kalshi.ws.connection_lost",
                    error=error_message[:400],
                    next_retry_sec=backoff,
                )
                await self._emit_heartbeat(
                    started=heartbeat_started,
                    success=False,
                    error_message=error_message[:512],
                )
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60.0)
