# pmi_data_platform

實作目錄 — Polymarket PMI Platform 的全部 code packages。

設計文件留在 workspace root 的 [`../pmi-platform-proposal/`](../pmi-platform-proposal/)；
vision / north-star 在 [`../CLAUDE.md`](../CLAUDE.md) / [`../AGENTS.md`](../AGENTS.md)。

跨領域 TODO 分兩本維護：[`./TODO-跑出來.md`](./TODO-跑出來.md)（ship-it / DX）
與 [`./TODO-跑得對.md`](./TODO-跑得對.md)（correctness / 數值正確性）。

開發 how-to：新增 / 改一個 PMI index 從 YAML 到 serving 的完整流程
看 [`./HOWTO-新增index.md`](./HOWTO-新增index.md)。

實作現況的 data-flow 架構圖（含 ✅/🟡/❌ 狀態，對應上述兩本 TODO 的 SHIP-* / CORR-* ID）：
[`./architecture-current.html`](./architecture-current.html)（snapshot 2026-05-29）。

---

## Layout

| Package | 角色 | 狀態 |
|---|---|---|
| [`pmi-core/`](./pmi-core/) | Shared schema (tier-prefixed) + DSL IR + engine pipeline + CLI + Alembic + MLflow client | **P0** — runnable |
| [`pmi-ingest/`](./pmi-ingest/) | Polymarket REST poller + `audit_source_health` 寫入 | **P0** — runnable |
| [`pmi-api/`](./pmi-api/) | Read-only FastAPI gateway (`/indexes`, `/score`, `/explain`) | **P0** — runnable |
| [`mlflow/`](./mlflow/) | MLflow tracking server (Postgres backend) + Prompt Registry UI | **P0** — runnable |
| [`pmi-demo/`](./pmi-demo/) | 合成 markets fixture，被 pmi-core / pmi-api bind-mount 進 `/app/fixtures`；同時是 `pmi-core dry-run` 的預設輸入 | **P0** — runnable（container 已退離，見 [`SHIP-4.1`](./TODO-跑出來.md)） |
| [`pmi-workers/`](./pmi-workers/) | Supercronic-driven job runner（取代 micah-job-executor pattern）；Arq queue 預留 P1+ | **P0** — runnable（cron-only），Arq P1 落地 |
| [`pmi-web/`](./pmi-web/) | Next.js 15 + recharts dashboard，讀 pmi-api | **P0** — runnable（基礎 index / score / history 頁面），index builder + chat P1 落地 |
| [`pmi-mcp/`](./pmi-mcp/) | MCP server (Tier A 讀 / Tier B 分析 / Tier C 寫) | Stub — **P3** 落地 |

---

## Runtime topology

```
                      ┌─────────────────────────┐
                      │ Polymarket Gamma REST   │
                      └──────────┬──────────────┘
                                 │ httpx
                       ┌─────────▼─────────┐
                       │ pmi-ingest        │   loop every 5min
                       │ (always-on)       │
                       └─────────┬─────────┘
                                 │
                                 ▼
       ┌─────────────────────────────────────────────────────────┐
       │ Postgres (workspace docker-compose)                     │
       │   db = pmi   (shared instance w/ warindex)              │
       │     - core_* (markets, index_defs, prompts, api_keys)   │
       │     - ts_*   (price_snapshots, index_scores)            │
       │     - audit_*(evaluations, source_health, pipeline)     │
       │     - vec_*  (market_embeddings, pgvector)              │
       │   db = mlflow  (MLflow's own alembic-managed schema)    │
       └─────────────────────────────────────────────────────────┘
                ▲                    ▲                    ▲
                │ read+write         │ read               │ read+write
       ┌────────┴───────┐   ┌────────┴────────┐   ┌───────┴─────────┐
       │ pmi-core       │   │ pmi-api         │   │ mlflow server   │
       │ (CLI: migrate /│   │ FastAPI :8001   │   │ :5500           │
       │  seed / score /│   │ /indexes /score │   │ tracking +      │
       │  history /     │   │ /explain        │   │ Prompt Registry │
       │  mlflow-init / │   │ /sources/health │   │ UI              │
       │  prompts list) │   └─────────────────┘   └─────────────────┘
       └────────┬───────┘            ▲                     ▲
                │ mirror              │                     │
                │ ─ runs, prompts ────┴─ curl / pmi-web / pmi-mcp
                ▼
       ┌─────────────────────┐
       │ pmi-mlartifacts     │
       │ (docker volume,     │
       │  artifact store)    │
       └─────────────────────┘
```

**MLflow contract**: `audit_evaluations`, `core_prompts`, `audit_pipeline_runs`
remain the compliance-grade source of truth. MLflow mirrors every prompt
registration + pipeline tick + factor evaluation for UI / search / promotion.
If the MLflow server is down, the pipeline silently degrades (`mlflow_*` columns
on the audit rows stay NULL) — no pipeline break.

---

## Configuration (single source of truth)

Every PMI service reads its config from **one** file:

```
pmi_data_platform/.env          ← real values (gitignored)
pmi_data_platform/.env.example  ← committed template; cp to .env on fresh checkout
```

`docker-compose` injects this file into every `pmi-*` container via `env_file:`.
`pmi-core` / `pmi-api` / `pmi-ingest` pydantic-settings classes additionally
probe it from the host so direct CLI invocations (no docker) also work.
Per-service `.env` files have been retired; only `.env.example` pointers remain
inside each service directory for documentation.

## Quickstart (from workspace root)

```bash
cp pmi_data_platform/.env.example pmi_data_platform/.env   # one-time, fill secrets

just db-up                                          # Postgres + extensions
just mlflow-up                                      # MLflow tracking + Prompt Registry :5500
just pmi-build                                      # build pmi-core + pmi-ingest + pmi-api images
just pmi-migrate                                    # apply alembic (0001 schema + 0002 mlflow links + 0003 factor models)
just pmi-seed                                       # load 13 synthetic markets (war + 2026 senate/house) + register every index_def
just pmi-score                                      # one pipeline tick → ts_index_scores + MLflow runs
just api-up                                         # start FastAPI on :8001
just api-curl                                       # /health → /indexes → /score → /history
just mlflow-ui                                      # open http://localhost:5500
```

The shortcut `just pmi-bootstrap` chains `mlflow-up → pmi-build → migrate → seed
→ score → history` so the very first PMI tick has full MLflow lineage.

In-process dry-run (no docker, no DB, no LLM cost — added in SHIP-3.1):

```bash
just dry-run                                                              # war index, compact JSON
just dry-run pmi_core/index_defs/us-senate-2026-republican-share.yaml     # other index
just dry-run-full <yaml>                                                  # also dump every factor evaluation
just schema-dump                                                          # regenerate IndexDef JSON Schema
```

For real Polymarket data instead of fixtures:

```bash
just ingest-once                                    # one REST cycle
# or
just ingest-up                                      # 5-min poll loop in background
```

If your network blocks `gamma-api.polymarket.com` (corporate proxy, DNS filter,
etc.), flip on the mock ingest:

```bash
# In pmi_data_platform/.env
POLYMARKET_USE_MOCK=true
POLYMARKET_MOCK_FIXTURE_PATH=/app/fixtures/markets.json   # bind-mounted

just ingest-once                                    # reads fixture, same UPSERT path
```

Prompt + run inspection:

```bash
just prompts-list                                   # every CorePrompt row with its MLflow URI
just mlflow-init                                    # backfill mlflow_* links onto pre-existing rows
```

---

## North-star constraints （重複自 `../pmi-platform-proposal/README.md`）

> 新增第 N 個之物不需要改前 N–1 個之物。
>
> - 新 source（Kalshi、WS、chain）→ drop `pmi-ingest/pollers/<name>.py`，不動 `pmi-core`
> - 新 PMI → drop `pmi-core/pmi_core/index_defs/<id>.yaml`，自動 register
> - 新 consumer → 共用 pmi-api 的 `summary + data` envelope
> - 新 factor → YAML 加一行 + 一個 prompt 檔，不動 column
> - 新 prompt 版本 → bump `-vN`，舊 evaluation 仍指向舊 prompt row（append-only）

任一條被破壞 = 又在做 Micah 的延伸，不是 platform。

---

## Conventions

- **Language / runtime**: Python 3.12+，`uv` 管 venv + lock
- **DB driver**: SQLAlchemy 2.0 async + asyncpg；Alembic env.py 是 async 版
- **Type system**: Pydantic v2，工作區內共用 `pmi-core` 為單一 source of truth
- **Logging**: `structlog` JSON output（OTel-friendly，P1 接 collector）
- **Tier prefix**: `core_*` / `ts_*` / `audit_*` / `vec_*` — 跨整個 schema 強制
- **Append-only audit**: `audit_evaluations` 與 `audit_source_poll_log` 不 UPDATE（P1 用 REVOKE UPDATE 在 DB 強制）
- **Prompt-as-code**: prompt 檔在 git，DB `core_prompts` 寫 sha256；改 prompt = bump `-vN` 不覆寫
- **Index DSL**: YAML on disk → Pydantic `IndexDef` IR → DB `core_index_definitions` (SCD Type 2)
- **MLflow mirror**: 每次 prompt 註冊、pipeline tick、factor eval 都進 MLflow（experiment per index_id；parent run per tick；child run per evaluation）。**DB is the truth；MLflow is the UI**——失聯時 pipeline 不中斷，`mlflow_*` 欄位留 NULL，可用 `just mlflow-init` 補拉。
