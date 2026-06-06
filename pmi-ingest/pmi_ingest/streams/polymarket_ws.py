"""Polymarket CLOB WebSocket consumer (CORR-4.1).

Subscribes to the `market` channel for every active YES token and persists
`last_trade_price` events as rows in `ts_trades`. Long-lived process:
* refresh subscribed token list from `core_markets` every `token_refresh_sec`
* reconnect with exponential backoff on connection drop
* heartbeat poll-log every `heartbeat_sec` so `audit_source_health` reflects
  liveness even when traffic is sparse

Channel
-------
`wss://ws-subscriptions-clob.polymarket.com/ws/market`

Subscribe message (no auth needed for public market channel):
    {"type": "market", "auth": {}, "markets": ["<token_id>", ...]}

Events of interest (we ignore the others at P0):
* `last_trade_price` — `{event_type, asset_id, market, price, side, size, timestamp, ...}`
  → one row in `ts_trades` with `source='ws'`.

Trade dedup
-----------
The WS event has no `tx_hash` / `log_index`, so the same fill arriving twice
(rare; happens on reconnect mid-event) would create duplicate rows. We avoid
this by including `trade_id`-like signal (`asset_id + timestamp + price + size`)
as `trade_external_id`; downstream chain enrichment (CORR-4.2) is responsible
for stamping the canonical `(tx_hash, log_index)` and DELETE'ing the dup, OR
the unique constraint on `(tx_hash, log_index)` simply rejects it.

At P0 we let the cheap dup happen and rely on the chain indexer to converge.

Failure modes
-------------
* `websockets.ConnectionClosed` → reconnect with backoff, increment
  `consecutive_failures` in audit_source_health.
* JSON parse fail → log + skip event (don't kill the loop).
* DB write fail → log + skip event. The loop survives a transient DB outage
  by keeping reading from the socket; trades during the outage are lost (no
  in-memory buffer at P0). Future P1: write to Redis stream first, drain to
  PG separately.
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

log = structlog.get_logger(__name__)

SOURCE = "polymarket-ws"


async def _load_active_tokens(session: AsyncSession) -> dict[str, int]:
    """Return {token_id: market_id} for actively-trading Polymarket tokens.

    Filters out markets in a UMA terminal state — those have no further
    fills coming and only bloat the subscribe payload. (Polymarket's
    `active=true` flag stays on for many of these until full settlement
    posts to Polygon hours / days later.) Empirically the live universe
    shrinks from ~67k tokens → ~15k once UMA settled / proposed states
    are excluded.
    """
    now = datetime.now(UTC)
    stmt = (
        select(CoreMarket.id, CoreMarket.clob_yes_token, CoreMarket.clob_no_token)
        .where(CoreMarket.venue == "polymarket")
        .where(CoreMarket.resolution.is_(None))
        .where((CoreMarket.closes_at.is_(None)) | (CoreMarket.closes_at > now))
        .where(
            (CoreMarket.chain_resolution.is_(None))
            | (CoreMarket.chain_resolution == "")
        )
        # Pick the freshest markets first — when capped via
        # `polymarket_ws_max_tokens`, we want the live universe, not random.
        # closes_at DESC NULLS LAST puts the longest-running open markets at
        # the top of the candidate set.
        .order_by(CoreMarket.closes_at.desc().nulls_last())
    )
    cap = ingest_settings.polymarket_ws_max_tokens
    if cap > 0:
        # Need ≈ cap/2 markets to fill `cap` token slots (YES + NO each).
        stmt = stmt.limit(max(1, cap // 2))
    rows = (await session.execute(stmt)).all()
    out: dict[str, int] = {}
    for mid, yes_tok, no_tok in rows:
        if yes_tok:
            out[yes_tok] = mid
        if no_tok:
            # WS publishes trades on BOTH sides of a binary market — capture
            # NO too so the trade count isn't artificially halved.
            out[no_tok] = mid
    return out


def _parse_trade_event(evt: dict[str, Any]) -> dict[str, Any] | None:
    """Coerce a WS event dict into a row spec, or None to skip."""
    if evt.get("event_type") not in ("last_trade_price", "trade"):
        return None
    token_id = evt.get("asset_id") or evt.get("market")
    if not token_id:
        return None
    try:
        price = float(evt["price"])
        size = float(evt["size"])
    except (KeyError, TypeError, ValueError):
        return None

    side = str(evt.get("side") or "").upper()
    if side not in ("BUY", "SELL"):
        # Some payloads use 0/1; treat unknown as BUY by default rather than drop —
        # losing a trade due to schema drift is worse than mislabeling its side.
        side = "BUY"

    timestamp = evt.get("timestamp")
    if isinstance(timestamp, (int, float)):
        # Polymarket sends ms epoch
        traded_at = datetime.fromtimestamp(float(timestamp) / 1000.0, tz=UTC)
    elif isinstance(timestamp, str):
        try:
            traded_at = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except ValueError:
            traded_at = datetime.now(UTC)
    else:
        traded_at = datetime.now(UTC)

    # Synthetic dedup key from public fields. The chain indexer will overwrite
    # with the canonical tx_hash/log_index pair once it sees the same fill.
    trade_external_id = (
        f"ws:{token_id}:{int(traded_at.timestamp() * 1000)}:{price}:{size}:{side}"
    )

    return {
        "token_id": str(token_id),
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
    """Insert one trade row. Returns True on insert, False on duplicate."""
    stmt = pg_insert(TsTrade).values(
        market_id=market_id,
        token_id=spec["token_id"],
        traded_at=spec["traded_at"],
        price=spec["price"],
        size=spec["size"],
        side=spec["side"],
        source="ws",
        trade_external_id=spec["trade_external_id"],
        raw=raw,
    )
    # On (tx_hash, log_index) unique constraint we'd skip; for WS rows both
    # are NULL so the constraint never trips here. Drop ON CONFLICT NOTHING
    # so a real chain-indexer-side dup (with non-null tx_hash) is safe.
    stmt = stmt.on_conflict_do_nothing(constraint="uq_ts_trades__tx_hash_log_index")
    result = await session.execute(stmt)
    # rowcount is 1 when inserted, 0 when conflict skipped. SQLAlchemy
    # AsyncResult: rowcount reflects the statement.
    return bool(result.rowcount)


class PolymarketWsConsumer:
    """Long-lived WS consumer. Caller runs `await consumer.run_forever()`."""

    name = SOURCE

    def __init__(self) -> None:
        self._url = ingest_settings.polymarket_ws_url
        self._token_refresh_sec = ingest_settings.polymarket_ws_token_refresh_sec
        self._heartbeat_sec = ingest_settings.polymarket_ws_heartbeat_sec
        # In-memory state for the current run.
        self._tokens: dict[str, int] = {}
        self._trades_since_heartbeat = 0

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

    async def _refresh_tokens(self) -> None:
        async with session_scope() as session:
            self._tokens = await _load_active_tokens(session)
        log.info("polymarket.ws.tokens_loaded", count=len(self._tokens))

    async def _subscribe_in_chunks(self, ws: Any, token_ids: list[str]) -> None:
        """Send subscribes in batches so a 60k-token universe doesn't trip
        the server's per-message size limit.

        Empirically Polymarket's CLOB WS rejects (closes connection without
        a close frame) when a single `markets:` list exceeds ~10k tokens.
        The server's behaviour is replace-not-merge by default per message,
        but in practice consecutive subscribes on the same connection
        accumulate. Cap at `polymarket_ws_subscribe_chunk` per message and
        send sequentially — fast enough (< 1s for 15k tokens).
        """
        chunk = ingest_settings.polymarket_ws_subscribe_chunk
        for i in range(0, len(token_ids), chunk):
            batch = token_ids[i : i + chunk]
            # Field name + casing per the official py-clob-client source —
            # subscribe payload is {"type": "Market", "assets_ids": [...]}.
            # Sending the lowercase variant or `markets:` makes the server
            # close the socket without a close frame (no error code).
            await ws.send(
                json.dumps({"type": "Market", "assets_ids": batch})
            )

    async def _connect_and_consume(self) -> None:
        """One connection lifetime. Reconnect is the caller's responsibility."""
        # websockets is imported lazily so the dep is optional at install time
        # — tests / dev environments without WS deps still import this module.
        import websockets

        await self._refresh_tokens()

        if not self._tokens:
            log.warning("polymarket.ws.no_tokens_to_subscribe")
            # Stay alive but idle — refresh after `token_refresh_sec`.
            await asyncio.sleep(self._token_refresh_sec)
            return

        log.info(
            "polymarket.ws.connecting", url=self._url, tokens=len(self._tokens)
        )
        async with websockets.connect(
            self._url, ping_interval=30, ping_timeout=10, max_size=2**22
        ) as ws:
            await self._subscribe_in_chunks(ws, list(self._tokens.keys()))
            log.info("polymarket.ws.subscribed", tokens=len(self._tokens))

            heartbeat_started = datetime.now(UTC)
            last_refresh = asyncio.get_event_loop().time()

            async for message in ws:
                # Polymarket sometimes sends a literal text sentinel
                # `INVALID OPERATION` (not JSON) when an unrecognised subscribe
                # field slips through. Quiet drop — anything else gets logged.
                if isinstance(message, str) and message.strip() == "INVALID OPERATION":
                    continue
                # Polymarket sometimes batches events as a JSON array.
                try:
                    payload = json.loads(message)
                except json.JSONDecodeError:
                    log.warning("polymarket.ws.bad_json", preview=str(message)[:200])
                    continue

                events = payload if isinstance(payload, list) else [payload]
                async with session_scope() as session:
                    for evt in events:
                        if not isinstance(evt, dict):
                            continue
                        spec = _parse_trade_event(evt)
                        if spec is None:
                            continue
                        market_id = self._tokens.get(spec["token_id"])
                        if market_id is None:
                            # Subscribed to a token we no longer know about
                            # — happens after token list refresh removes a
                            # closed market mid-feed. Drop the event.
                            continue
                        try:
                            inserted = await _persist_trade(
                                session, market_id, spec, evt
                            )
                            if inserted:
                                self._trades_since_heartbeat += 1
                        except Exception as exc:
                            log.warning(
                                "polymarket.ws.persist_failed",
                                error=str(exc)[:200],
                                token=spec["token_id"],
                            )

                # Heartbeat + token refresh tick (non-blocking).
                now = asyncio.get_event_loop().time()
                if (
                    (datetime.now(UTC) - heartbeat_started).total_seconds()
                    >= self._heartbeat_sec
                ):
                    await self._emit_heartbeat(
                        started=heartbeat_started,
                        success=True,
                        error_message=None,
                    )
                    log.info(
                        "polymarket.ws.heartbeat",
                        trades=self._trades_since_heartbeat,
                    )
                    self._trades_since_heartbeat = 0
                    heartbeat_started = datetime.now(UTC)

                if now - last_refresh >= self._token_refresh_sec:
                    new_tokens = self._tokens.copy()
                    await self._refresh_tokens()
                    added = set(self._tokens) - set(new_tokens)
                    removed = set(new_tokens) - set(self._tokens)
                    if added or removed:
                        # Send the full new token list, chunked. Server
                        # tolerates re-subscribing already-known tokens.
                        await self._subscribe_in_chunks(
                            ws, list(self._tokens.keys())
                        )
                        log.info(
                            "polymarket.ws.resubscribed",
                            added=len(added),
                            removed=len(removed),
                            total=len(self._tokens),
                        )
                    last_refresh = now

    async def run_forever(self) -> None:
        """Reconnect loop with exponential backoff."""
        backoff = 1.0
        while True:
            heartbeat_started = datetime.now(UTC)
            self._trades_since_heartbeat = 0
            try:
                await self._connect_and_consume()
                # Normal exit (no_tokens path) — keep backoff modest.
                backoff = 1.0
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                error_message = f"{type(exc).__name__}: {exc}"
                log.error(
                    "polymarket.ws.connection_lost",
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
