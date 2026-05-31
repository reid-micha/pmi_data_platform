# pmi-api

Read-only REST gateway over `pmi-core`. P0 acceptance: `curl localhost:8001/indexes/polymarket-war-index/score` returns JSON.

## Endpoints (P0)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness + DB ping |
| GET | `/indexes` | List index definitions (current versions) |
| GET | `/indexes/{id}` | One index — metadata + latest score |
| GET | `/indexes/{id}/score` | Latest score, `?as_of=` for historical |
| GET | `/indexes/{id}/score/history?from=&to=&limit=` | Time series |
| GET | `/indexes/{id}/explain?as_of=` | Component breakdown (which markets, which factors) |
| GET | `/sources/health` | Source health summary (powers Grafana / status page) |

API key auth via `X-API-Key` header (matches `core_api_keys.key_hash`). At P0 the
endpoint accepts unauthenticated reads in `dev` mode (`PMI_API_REQUIRE_AUTH=false`)
so the demo curl works without seeding a key.

Maps to Visualisation M1 / Sprint 2 Week 4 of P0.

## Quickstart

```bash
uv sync
cp .env.example .env
uv run pmi-api                # uvicorn :8000
curl localhost:8000/health
curl localhost:8000/indexes/polymarket-war-index/score
```

## Docker

```bash
just dev-api                  # postgres + pmi-api up
curl localhost:8001/indexes/polymarket-war-index/score
```
