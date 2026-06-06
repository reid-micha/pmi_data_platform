"""Polygon RPC chain indexer (CORR-4.2).

Walks the Polygon log stream for the four contracts that matter:
* CTF Exchange (`polygon_ctf_exchange_address`) — `OrderFilled` →
  `audit_chain_events('ctf_fill')` + `ts_trades(source='chain')` +
  upsert maker/taker into `core_traders`.
* ConditionalTokens (`polygon_ctf_address`) — `ConditionPreparation`
  (market spawn) + `ConditionResolution` (oracle payout) →
  `audit_chain_events('condition_prepared' / 'condition_resolved')`.
* UMA Optimistic Oracle V2 (`polygon_uma_oo_address`) —
  `ProposePrice` / `DisputePrice` / `Settle` →
  `audit_chain_events('uma_propose' / 'uma_dispute' / 'uma_settle')`.
* UmaCtfAdapter (`polygon_uma_adapter_address`) — `QuestionResolved` →
  `audit_chain_events('uma_question_resolved')` (cleanest per-market
  resolution signal). `uma_resolver` projects this onto
  `core_markets.chain_resolution`.

Checkpoint
----------
The "next block to scan" is derived from `audit_chain_events`:
    next_block = max(block_number) + 1 over the contracts we own
                 (or `polygon_indexer_start_block` on cold start)

This avoids a separate checkpoint table — the natural idempotency key
`(tx_hash, log_index)` already guards against double-insert if we ever
overlap windows on restart.

Chunking
--------
Polygon RPC providers cap `eth_getLogs` block range. We default to
`polygon_indexer_chunk_blocks=2000` (safe across Alchemy/Infura/Quicknode);
public RPCs may need lower. The poller exits cleanly when it reaches head;
re-invoke periodically to follow the chain.

Empty-RPC behavior
------------------
If `polygon_rpc_url` is unset, `run_once()` returns 0 immediately and
records a healthy zero-records audit row — the indexer is opt-in and
should not break the cron when an operator hasn't wired an RPC yet.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from pmi_core.db import session_scope
from pmi_core.models import (
    AuditChainEvent,
    CoreMarket,
    CoreTrader,
    TsTrade,
)
from pmi_ingest.chain.abis import (
    ADAPTER_QUESTION_RESOLVED_ABI,
    CONDITION_PREPARATION_ABI,
    CONDITION_RESOLUTION_ABI,
    ORDER_FILLED_ABI,
    UMA_DISPUTE_PRICE_ABI,
    UMA_PROPOSE_PRICE_ABI,
    UMA_SETTLE_ABI,
)
from pmi_ingest.config import ingest_settings
from pmi_ingest.health import record_poll

log = structlog.get_logger(__name__)

SOURCE = "polygon-indexer"

# USDC is 6-decimal on Polygon. Polymarket trades quote in USDC.
USDC_DECIMALS = 6
# Outcome token shares are also 6-decimal in Polymarket's CTF setup.
SHARE_DECIMALS = 6


def _bytes32_to_hex(value: Any) -> str:
    """Normalize a web3.py bytes32 input → '0x…' lowercase hex."""
    if isinstance(value, (bytes, bytearray)):
        return "0x" + value.hex()
    if isinstance(value, str):
        return value.lower() if value.startswith("0x") else "0x" + value.lower()
    return str(value)


def _addr(value: Any) -> str:
    """Lowercase a Polygon address."""
    return str(value).lower() if value else ""


def _uint_to_decimal(value: int, decimals: int) -> float:
    return float(value) / (10**decimals)


async def _max_indexed_block(
    session: AsyncSession, contract_addresses: list[str]
) -> int | None:
    """Pick up where we left off, scoped to the contracts we own."""
    from sqlalchemy import func, select

    if not contract_addresses:
        return None
    stmt = select(func.max(AuditChainEvent.block_number)).where(
        AuditChainEvent.contract_address.in_(contract_addresses)
    )
    return (await session.execute(stmt)).scalar()


async def _upsert_trader(
    session: AsyncSession, address: str, now: datetime
) -> None:
    """First-sight insert of a wallet. Cohort defaults to 'unknown' —
    rollup runs separately (`pmi-ingest cohort`)."""
    if not address or address == "0x0000000000000000000000000000000000000000":
        return
    stmt = pg_insert(CoreTrader).values(
        address=address,
        first_seen_at=now,
        last_seen_at=now,
        trade_count=1,
        cohort="unknown",
    )
    # On duplicate, bump last_seen_at + trade_count. Use the raw arithmetic
    # so concurrent indexer instances stay consistent (`+= 1` lives in PG).
    stmt = stmt.on_conflict_do_update(
        index_elements=["address"],
        set_={
            "last_seen_at": stmt.excluded.last_seen_at,
            "trade_count": CoreTrader.trade_count + 1,
        },
    )
    await session.execute(stmt)


async def _resolve_market_id(
    session: AsyncSession, token_id: str
) -> int | None:
    """Find which market a CLOB token belongs to. Cached in-process at the
    caller level (`_TokenMarketCache`) so we don't roundtrip per log."""
    from sqlalchemy import or_, select

    stmt = select(CoreMarket.id).where(
        or_(
            CoreMarket.clob_yes_token == token_id,
            CoreMarket.clob_no_token == token_id,
        )
    )
    return (await session.execute(stmt)).scalar()


class _TokenMarketCache:
    """Process-local cache. Invalidated implicitly when the indexer restarts.

    Cold misses fall back to a DB lookup. This is intentional — a brand-new
    market created by `ConditionPreparation` in this same indexer run won't
    have a row in `core_markets` yet (the REST poller writes that). The
    indexer captures the event into `audit_chain_events` regardless, and
    the next `ts_trades` write that references a new token will resolve
    once the REST poller catches up.
    """

    def __init__(self) -> None:
        self._cache: dict[str, int | None] = {}

    async def get(self, session: AsyncSession, token_id: str) -> int | None:
        if token_id in self._cache:
            return self._cache[token_id]
        market_id = await _resolve_market_id(session, token_id)
        self._cache[token_id] = market_id
        return market_id


async def _insert_chain_event(
    session: AsyncSession,
    *,
    kind: str,
    contract_address: str,
    block_number: int,
    block_time: datetime,
    tx_hash: str,
    log_index: int,
    data: dict[str, Any],
) -> bool:
    """Idempotent insert. Returns True if a new row landed."""
    stmt = pg_insert(AuditChainEvent).values(
        event_kind=kind,
        contract_address=contract_address,
        block_number=block_number,
        block_time=block_time,
        tx_hash=tx_hash,
        log_index=log_index,
        data=data,
    )
    stmt = stmt.on_conflict_do_nothing(constraint="uq_audit_chain_events__tx_log")
    result = await session.execute(stmt)
    return bool(result.rowcount)


async def _handle_order_filled(
    session: AsyncSession,
    log_dict: dict[str, Any],
    block_time: datetime,
    token_cache: _TokenMarketCache,
) -> bool:
    """OrderFilled → audit_chain_events + ts_trades + traders upsert."""
    args = log_dict["args"]
    maker = _addr(args["maker"])
    taker = _addr(args["taker"])
    maker_asset_id = str(args["makerAssetId"])
    taker_asset_id = str(args["takerAssetId"])
    maker_filled = int(args["makerAmountFilled"])
    taker_filled = int(args["takerAmountFilled"])

    contract = _addr(log_dict["address"])
    tx_hash = _bytes32_to_hex(log_dict["transactionHash"])
    log_index = int(log_dict["logIndex"])
    block_number = int(log_dict["blockNumber"])

    # Always log the raw event for forensics.
    await _insert_chain_event(
        session,
        kind="ctf_fill",
        contract_address=contract,
        block_number=block_number,
        block_time=block_time,
        tx_hash=tx_hash,
        log_index=log_index,
        data={
            "orderHash": _bytes32_to_hex(args.get("orderHash") or b""),
            "maker": maker,
            "taker": taker,
            "makerAssetId": maker_asset_id,
            "takerAssetId": taker_asset_id,
            "makerAmountFilled": str(maker_filled),
            "takerAmountFilled": str(taker_filled),
            "fee": str(args.get("fee") or 0),
        },
    )

    # Identify position side vs. cash side. In Polymarket's CTF Exchange
    # one of (makerAssetId, takerAssetId) is the ERC-1155 outcome token
    # and the other is 0 (USDC ERC-20 — not an ERC-1155 positionId).
    position_token = (
        maker_asset_id if maker_asset_id != "0" else taker_asset_id
    )
    if position_token == "0":
        # Both sides zero shouldn't happen, but if it does we can't map
        # to a market; the audit row already captured the data.
        return True

    market_id = await token_cache.get(session, position_token)
    if market_id is None:
        # Token unknown — REST poller hasn't seen this market yet. Don't
        # write a dangling ts_trades row; audit_chain_events keeps the data.
        return True

    # Derive price + size. The "size" is shares of the position token; the
    # "price" is USDC per share. Whichever side has the position token is
    # the "shares" side; the other is USDC.
    if maker_asset_id == position_token:
        size_raw, cash_raw = maker_filled, taker_filled
    else:
        size_raw, cash_raw = taker_filled, maker_filled

    size = _uint_to_decimal(size_raw, SHARE_DECIMALS)
    cash = _uint_to_decimal(cash_raw, USDC_DECIMALS)
    price = (cash / size) if size > 0 else 0.0
    # CTF Exchange doesn't expose taker buy/sell in the event signature;
    # we infer from which side held the position. Taker held position →
    # taker is selling (SELL); maker held position → taker is buying (BUY).
    side = "SELL" if taker_asset_id == position_token else "BUY"

    trade_stmt = pg_insert(TsTrade).values(
        market_id=market_id,
        token_id=position_token,
        traded_at=block_time,
        price=price,
        size=size,
        side=side,
        maker_address=maker,
        taker_address=taker,
        tx_hash=tx_hash,
        log_index=log_index,
        source="chain",
        trade_external_id=_bytes32_to_hex(args.get("orderHash") or b""),
        raw={k: str(v) if isinstance(v, int) else v for k, v in args.items()},
    )
    trade_stmt = trade_stmt.on_conflict_do_nothing(
        constraint="uq_ts_trades__tx_hash_log_index"
    )
    await session.execute(trade_stmt)

    await _upsert_trader(session, maker, block_time)
    await _upsert_trader(session, taker, block_time)
    return True


async def _handle_condition_event(
    session: AsyncSession,
    log_dict: dict[str, Any],
    block_time: datetime,
    *,
    kind: str,
) -> None:
    args = log_dict["args"]
    await _insert_chain_event(
        session,
        kind=kind,
        contract_address=_addr(log_dict["address"]),
        block_number=int(log_dict["blockNumber"]),
        block_time=block_time,
        tx_hash=_bytes32_to_hex(log_dict["transactionHash"]),
        log_index=int(log_dict["logIndex"]),
        data={
            "conditionId": _bytes32_to_hex(args["conditionId"]),
            "oracle": _addr(args["oracle"]),
            "questionId": _bytes32_to_hex(args["questionId"]),
            "outcomeSlotCount": int(args["outcomeSlotCount"]),
            **(
                {"payoutNumerators": [int(n) for n in args["payoutNumerators"]]}
                if "payoutNumerators" in args
                else {}
            ),
        },
    )


async def _handle_uma_event(
    session: AsyncSession,
    log_dict: dict[str, Any],
    block_time: datetime,
    *,
    kind: str,
) -> None:
    args = log_dict["args"]
    payload: dict[str, Any] = {
        k: (
            _bytes32_to_hex(v)
            if isinstance(v, (bytes, bytearray))
            else (str(v) if isinstance(v, int) else v)
        )
        for k, v in args.items()
    }
    # Addresses come through web3.py as checksummed strings; lowercase for
    # join consistency with `core_traders.address`.
    for k in ("requester", "proposer", "disputer", "currency"):
        if k in payload and isinstance(payload[k], str):
            payload[k] = payload[k].lower()
    await _insert_chain_event(
        session,
        kind=kind,
        contract_address=_addr(log_dict["address"]),
        block_number=int(log_dict["blockNumber"]),
        block_time=block_time,
        tx_hash=_bytes32_to_hex(log_dict["transactionHash"]),
        log_index=int(log_dict["logIndex"]),
        data=payload,
    )


async def _handle_question_resolved(
    session: AsyncSession,
    log_dict: dict[str, Any],
    block_time: datetime,
) -> None:
    """Adapter resolution → audit_chain_events. uma_resolver projects this
    onto core_markets.chain_resolution (separate runtime path so the
    indexer stays write-only on audit / trade tables)."""
    args = log_dict["args"]
    await _insert_chain_event(
        session,
        kind="uma_question_resolved",
        contract_address=_addr(log_dict["address"]),
        block_number=int(log_dict["blockNumber"]),
        block_time=block_time,
        tx_hash=_bytes32_to_hex(log_dict["transactionHash"]),
        log_index=int(log_dict["logIndex"]),
        data={
            "questionID": _bytes32_to_hex(args["questionID"]),
            "settledPrice": str(args["settledPrice"]),
            "payouts": [int(n) for n in args["payouts"]],
        },
    )


class PolygonChainIndexer:
    """One-cycle indexer. Each `run_once()` advances the cursor by up to
    `polygon_indexer_chunk_blocks × polygon_indexer_chunks_per_cycle` blocks.

    The CLI is meant to be re-invoked on a cron (`pmi-ingest chain --once`)
    or wrapped in a forever loop (`pmi-ingest chain`). Each invocation is
    fully idempotent thanks to the audit `(tx_hash, log_index)` constraint.
    """

    name = SOURCE

    def __init__(self) -> None:
        self._rpc_url = ingest_settings.polygon_rpc_url
        self._exchange_addr = (
            ingest_settings.polygon_ctf_exchange_address or ""
        ).lower() or None
        self._ctf_addr = (
            ingest_settings.polygon_ctf_address or ""
        ).lower() or None
        self._uma_oo_addr = (
            ingest_settings.polygon_uma_oo_address or ""
        ).lower() or None
        self._uma_adapter_addr = (
            ingest_settings.polygon_uma_adapter_address or ""
        ).lower() or None
        self._chunk = ingest_settings.polygon_indexer_chunk_blocks
        self._chunks_per_cycle = ingest_settings.polygon_indexer_chunks_per_cycle
        self._start_block = ingest_settings.polygon_indexer_start_block
        self._head_lag = ingest_settings.polygon_indexer_head_lag_blocks

    def _enabled(self) -> bool:
        return bool(self._rpc_url) and any(
            (
                self._exchange_addr,
                self._ctf_addr,
                self._uma_oo_addr,
                self._uma_adapter_addr,
            )
        )

    def _all_addresses(self) -> list[str]:
        return [
            a
            for a in (
                self._exchange_addr,
                self._ctf_addr,
                self._uma_oo_addr,
                self._uma_adapter_addr,
            )
            if a
        ]

    async def run_once(self) -> int:  # noqa: PLR0915 — top-level orchestration
        started = datetime.now(UTC)
        events_written = 0
        success = True
        error_class: str | None = None
        error_message: str | None = None

        if not self._enabled():
            log.info(
                "polygon.indexer.disabled",
                rpc_url_set=bool(self._rpc_url),
                addresses_set=any(self._all_addresses()),
            )
            finished = datetime.now(UTC)
            async with session_scope() as session:
                await record_poll(
                    session,
                    source=SOURCE,
                    started_at=started,
                    finished_at=finished,
                    success=True,
                    records=0,
                    expected_records_24h=None,
                )
            return 0

        # web3.py is imported lazily so a missing dep doesn't break unrelated
        # `pmi-ingest run` invocations.
        from web3 import AsyncWeb3, AsyncHTTPProvider
        from web3._utils.events import get_event_data
        from eth_utils import event_abi_to_log_topic

        w3 = AsyncWeb3(AsyncHTTPProvider(self._rpc_url))

        topics_to_handler: dict[
            tuple[str | None, str], tuple[dict, str]
        ] = {}
        if self._exchange_addr:
            topics_to_handler[
                (
                    self._exchange_addr,
                    "0x" + event_abi_to_log_topic(ORDER_FILLED_ABI).hex(),
                )
            ] = (ORDER_FILLED_ABI, "order_filled")
        if self._ctf_addr:
            topics_to_handler[
                (
                    self._ctf_addr,
                    "0x" + event_abi_to_log_topic(CONDITION_PREPARATION_ABI).hex(),
                )
            ] = (CONDITION_PREPARATION_ABI, "condition_prepared")
            topics_to_handler[
                (
                    self._ctf_addr,
                    "0x" + event_abi_to_log_topic(CONDITION_RESOLUTION_ABI).hex(),
                )
            ] = (CONDITION_RESOLUTION_ABI, "condition_resolved")
        if self._uma_oo_addr:
            topics_to_handler[
                (
                    self._uma_oo_addr,
                    "0x" + event_abi_to_log_topic(UMA_PROPOSE_PRICE_ABI).hex(),
                )
            ] = (UMA_PROPOSE_PRICE_ABI, "uma_propose")
            topics_to_handler[
                (
                    self._uma_oo_addr,
                    "0x" + event_abi_to_log_topic(UMA_DISPUTE_PRICE_ABI).hex(),
                )
            ] = (UMA_DISPUTE_PRICE_ABI, "uma_dispute")
            topics_to_handler[
                (
                    self._uma_oo_addr,
                    "0x" + event_abi_to_log_topic(UMA_SETTLE_ABI).hex(),
                )
            ] = (UMA_SETTLE_ABI, "uma_settle")
        if self._uma_adapter_addr:
            topics_to_handler[
                (
                    self._uma_adapter_addr,
                    "0x" + event_abi_to_log_topic(ADAPTER_QUESTION_RESOLVED_ABI).hex(),
                )
            ] = (ADAPTER_QUESTION_RESOLVED_ABI, "uma_question_resolved")

        addresses = self._all_addresses()
        token_cache = _TokenMarketCache()

        try:
            head_block = await w3.eth.block_number
            head_to_scan = max(0, head_block - self._head_lag)

            async with session_scope() as session:
                cursor = await _max_indexed_block(session, addresses)
            if cursor is None:
                cursor = self._start_block - 1

            start = cursor + 1
            end_for_cycle = min(
                head_to_scan, start + self._chunk * self._chunks_per_cycle - 1
            )
            if end_for_cycle < start:
                log.info(
                    "polygon.indexer.at_head",
                    head_block=head_block,
                    cursor=cursor,
                    lag_blocks=self._head_lag,
                )
                finished = datetime.now(UTC)
                async with session_scope() as session:
                    await record_poll(
                        session,
                        source=SOURCE,
                        started_at=started,
                        finished_at=finished,
                        success=True,
                        records=0,
                        expected_records_24h=None,
                    )
                return 0

            for chunk_start in range(start, end_for_cycle + 1, self._chunk):
                chunk_end = min(chunk_start + self._chunk - 1, end_for_cycle)
                logs = await w3.eth.get_logs(
                    {
                        "fromBlock": chunk_start,
                        "toBlock": chunk_end,
                        "address": [
                            AsyncWeb3.to_checksum_address(a) for a in addresses
                        ],
                    }
                )
                if not logs:
                    continue

                # Group logs by block so we can timestamp each in one RPC.
                block_times: dict[int, datetime] = {}
                for entry in logs:
                    bn = int(entry["blockNumber"])
                    if bn not in block_times:
                        blk = await w3.eth.get_block(bn)
                        block_times[bn] = datetime.fromtimestamp(
                            int(blk["timestamp"]), tz=UTC
                        )

                async with session_scope() as session:
                    for entry in logs:
                        contract = _addr(entry["address"])
                        topic0 = (
                            "0x" + entry["topics"][0].hex()
                            if isinstance(entry["topics"][0], (bytes, bytearray))
                            else str(entry["topics"][0]).lower()
                        )
                        key = (contract, topic0)
                        if key not in topics_to_handler:
                            continue
                        abi, handler_kind = topics_to_handler[key]
                        try:
                            decoded = get_event_data(w3.codec, abi, entry)
                        except Exception as decode_err:
                            log.warning(
                                "polygon.indexer.decode_failed",
                                error=str(decode_err)[:200],
                                tx=str(entry.get("transactionHash")),
                            )
                            continue

                        # Normalize web3.py AttributeDict → plain dict for handlers.
                        log_dict = {
                            "args": dict(decoded["args"]),
                            "address": decoded["address"],
                            "blockNumber": decoded["blockNumber"],
                            "transactionHash": decoded["transactionHash"],
                            "logIndex": decoded["logIndex"],
                        }
                        block_time = block_times[int(log_dict["blockNumber"])]

                        if handler_kind == "order_filled":
                            await _handle_order_filled(
                                session, log_dict, block_time, token_cache
                            )
                        elif handler_kind in ("condition_prepared", "condition_resolved"):
                            await _handle_condition_event(
                                session, log_dict, block_time, kind=handler_kind
                            )
                        elif handler_kind in (
                            "uma_propose",
                            "uma_dispute",
                            "uma_settle",
                        ):
                            await _handle_uma_event(
                                session, log_dict, block_time, kind=handler_kind
                            )
                        elif handler_kind == "uma_question_resolved":
                            await _handle_question_resolved(
                                session, log_dict, block_time
                            )
                        events_written += 1

                log.info(
                    "polygon.indexer.chunk_done",
                    from_block=chunk_start,
                    to_block=chunk_end,
                    logs=len(logs),
                )
        except Exception as exc:
            success = False
            error_class = type(exc).__name__
            error_message = str(exc)[:512]
            log.error("polygon.indexer.failed", error=error_message)
        finally:
            finished = datetime.now(UTC)
            async with session_scope() as session:
                await record_poll(
                    session,
                    source=SOURCE,
                    started_at=started,
                    finished_at=finished,
                    success=success,
                    records=events_written if success else None,
                    error_class=error_class,
                    error_message=error_message,
                    expected_records_24h=None,
                )

        if not success and error_message:
            raise RuntimeError(error_message)
        return events_written
