# pmi-ingest

Ingestion services for the pmi-core schema. Six modes:

| Mode | Module | What it writes | Cadence |
|---|---|---|---|
| `pmi-ingest run [--source polymarket-rest]` | [`pollers/polymarket_rest.py`](pmi_ingest/pollers/polymarket_rest.py) | `core_markets` (+ `condition_id` / `clob_yes_token` / `clob_no_token`) + `ts_price_snapshots` | 5 min |
| `pmi-ingest run --source kalshi-rest` | [`pollers/kalshi_rest.py`](pmi_ingest/pollers/kalshi_rest.py) | `core_markets` (venue=`kalshi`) + `ts_price_snapshots` | 5 min |
| `pmi-ingest clob` *(CORR-4.3)* | [`pollers/polymarket_clob.py`](pmi_ingest/pollers/polymarket_clob.py) | `ts_orderbook_snapshots` (mid/spread/depth_1pct/depth_5pct) | 60 sec |
| `pmi-ingest polymarket-history` *(CORR-3.10 / SHIP-4.5)* | [`pollers/polymarket_history.py`](pmi_ingest/pollers/polymarket_history.py) | `ts_price_snapshots` (historical `last_price` per market — unlocks SHIP-3.4 backtest) | daily, idempotent |
| `pmi-ingest run --source metaculus-rest` | [`pollers/metaculus_rest.py`](pmi_ingest/pollers/metaculus_rest.py) | `core_markets` (venue=`metaculus`) + `ts_price_snapshots` (community prediction → `last_price`, forecaster count → `volume_24h`) | 5 min |
| `pmi-ingest robinhood-scrape` | [`scrapers/robinhood/`](pmi_ingest/scrapers/robinhood/) | Playwright; `ROBINHOOD_ENABLED=true` to enable; `core_markets` venue=`robinhood` + `ts_price_snapshots.last_price` | daily |
| `pmi-ingest crypto-scrape` | [`scrapers/crypto/`](pmi_ingest/scrapers/crypto/) | Playwright; `CRYPTO_ENABLED=true` to enable; `core_markets` venue=`crypto` + `ts_price_snapshots.last_price` | daily |
| `pmi-ingest kalshi-clob` *(CORR-4.3 Kalshi)* | [`pollers/kalshi_clob.py`](pmi_ingest/pollers/kalshi_clob.py) | `ts_orderbook_snapshots` (token_id=ticker, YES-centric mid from dual-bid book) | 60 sec |
| `pmi-ingest ws` *(CORR-4.1)* | [`streams/polymarket_ws.py`](pmi_ingest/streams/polymarket_ws.py) | `ts_trades` (source=`ws`) | long-lived process |
| `pmi-ingest kalshi-ws` *(CORR-4.1 Kalshi)* | [`streams/kalshi_ws.py`](pmi_ingest/streams/kalshi_ws.py) | `ts_trades` (source=`kalshi-ws`) — auth required; market-data-only Kalshi keys can hit 401 NOT_FOUND on WS even when REST works (streaming needs Kalshi-side enable) | long-lived process |
| `pmi-ingest chain` *(CORR-4.2)* | [`chain/polygon_indexer.py`](pmi_ingest/chain/polygon_indexer.py) | `audit_chain_events` + `ts_trades` (source=`chain`) + `core_traders` | every 30 sec / cron |
| `pmi-ingest cohort` *(CORR-4.2 sub)* | [`chain/cohort.py`](pmi_ingest/chain/cohort.py) | `core_traders.cohort` (whale / mid / retail) | daily |
| `pmi-ingest uma [--gamma-only]` *(CORR-4.4)* | [`chain/uma_resolver.py`](pmi_ingest/chain/uma_resolver.py) | `core_markets.chain_resolution` / `chain_resolution_at` | hourly |

All modes share [`pmi_ingest/health.py`](pmi_ingest/health.py) — every cycle appends to
`audit_source_poll_log` and UPSERTs `audit_source_health` so the `/sources/health` API
endpoint and Grafana panels see them uniformly.

## Quickstart

```bash
# REST (always works — no auth needed)
docker compose --profile pmi run --rm pmi-ingest run --once

# CLOB orderbook depth (needs the REST poller to have run at least once, so
# clob_yes_token is populated on active markets)
docker compose --profile pmi run --rm pmi-ingest clob --once

# Polygon chain indexer (needs POLYGON_RPC_URL in .env — Alchemy / Quicknode
# / Infura URL. Leave blank to no-op cleanly.)
docker compose --profile pmi run --rm pmi-ingest chain --once

# Trader cohort rollup (after chain has populated ts_trades)
docker compose --profile pmi run --rm pmi-ingest cohort

# UMA dispute / settle projection
docker compose --profile pmi run --rm pmi-ingest uma

# WS feed (long-running — recommended as its own service in compose)
docker compose --profile pmi run --rm pmi-ingest ws
```

The `Poller` protocol in [`pollers/`](pmi_ingest/pollers/) is the seam — adding a new
REST source = drop a file alongside `polymarket_rest.py` and register it in
[`cli.py`](pmi_ingest/cli.py). Long-lived sockets go in [`streams/`](pmi_ingest/streams/);
chain-RPC consumers go in [`chain/`](pmi_ingest/chain/).

## Status (2026-06-01)

| CORR | What | State |
|---|---|---|
| **4.1** | WS trade feed | ✅ scaffold runnable. Auto-reconnect + token-list refresh + heartbeat. Not stress-tested against full Polymarket universe; reconnect storm under sustained outage is untuned. |
| **4.2** | Polygon chain indexer | ✅ scaffold runnable. CTF Exchange OrderFilled + ConditionalTokens + UMA OO V2 + UmaCtfAdapter QuestionResolved decoded. **Requires POLYGON_RPC_URL.** Has not been run against mainnet yet — RPC chunk size / log filter throttle behaviour will need tuning against the chosen provider. |
| **4.3** | CLOB orderbook depth | ✅ runnable end-to-end. Depends on REST poller having populated `clob_yes_token`. |
| **4.4** | UMA projection | ✅ runnable. Two modes: `--gamma-only` reads Polymarket Gamma `raw.umaResolutionStatuses` (no chain needed); default also walks `audit_chain_events` for `uma_settle` / `uma_question_resolved` to get YES/NO settled labels. |
| **4.7** | Kalshi orderbook / WS parity | ✅ orderbook runnable (smoke 1966 snapshots, avg spread 9.7%); WS auth code-complete but key needs Kalshi-side streaming permission. |
| **3.10 / SHIP-4.5** | Polymarket /prices-history backfill | ✅ landed + idempotent. Smoke 9674 historical points / 20 markets / interval=max; re-run = 0 inserts. |
| — | Metaculus REST + RSC | ✅ runnable when `METACULUS_API_TOKEN` set. List API requires Token auth since 2025; RSC community-prediction extraction is anon. |
| — | Robinhood scraper (Playwright) | 🟡 ported from legacy Micah, Phase 1 verified live (539 events across 80 categories). Full Phase 2 e2e tested separately. |
| — | Crypto.com scraper (Playwright) | ✅ landed + smoked 2026-06-01: 2301 markets persisted. RSC-extract approach (no DOM scrape) — robust. |

Still missing for "production-grade" (tracked separately):
* No unit tests on the new pollers — CORR-7.1 sweep
* Backpressure / DB-outage buffering on WS — P1 (Redis stream pre-write)
* TimescaleDB hypertable conversion for `ts_trades` / `ts_orderbook_snapshots` — CORR-4.5
* Trigger single-market re-eval from WS trade arrival — depends on CORR-4.6 (Arq)
