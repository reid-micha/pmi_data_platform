# pmi-ingest

P0 ingestion: **always-on Polymarket REST poller** that writes into the pmi-core schema.

- `pmi_ingest/pollers/polymarket_rest.py` — Polymarket Gamma API (`/markets`) → `core_markets` + `ts_price_snapshots`
- `pmi_ingest/health.py` — `audit_source_poll_log` insert + `audit_source_health` UPSERT after every poll
- `pmi_ingest/cli.py` — `pmi-ingest run --once` (single tick, easy to demo) or `pmi-ingest run` (long-lived loop)

Maps to Ingestion M1–M2 of `../../pmi-platform-proposal/01-ingestion-execution-plan.md` and Sprint 2 Week 3 of P0.

## Quickstart

```bash
uv sync
cp .env.example .env
uv run pmi-ingest run --once       # one cycle, prints summary, exits
uv run pmi-ingest run              # poll every 5 min until killed
```

## Roadmap

| Phase | Track | What lands |
|---|---|---|
| **P0 (now)** | REST | `polymarket_rest` poller + source_health |
| P1 | WS | `polymarket_ws` for trade events, single-market re-eval triggers |
| P2 | Chain | Polygon RPC → CTF / UMA event ingester (trader cohort, dispute detection) |
| P4 | Multi-venue | Kalshi adapter reuses the same `Poller` protocol |

The `Poller` Protocol in `pollers/__init__.py` is the seam — adding a new source = drop a file
in `pollers/`, register it in CLI.
