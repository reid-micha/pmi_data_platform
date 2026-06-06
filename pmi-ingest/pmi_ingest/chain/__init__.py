"""Polygon RPC chain indexer + UMA Optimistic Oracle resolver.

`polygon_indexer` walks block ranges and writes:
* `audit_chain_events` — every decoded log (idempotent on (tx_hash, log_index))
* `ts_trades` — CTF Exchange OrderFilled → trade row with maker/taker
* `core_traders` — wallet upsert on first sight, rollup job sets cohort

`uma_resolver` reads UMA OO V2 events (forwarded from the indexer) and
projects them onto `core_markets.chain_resolution` / `chain_resolution_at`.

Both components share helpers below for RPC wiring + checkpoint tracking.
"""
