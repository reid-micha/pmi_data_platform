# Polymarket PMI Platform — Project Design

> **Status (2026-06-11)** — 兩個並存系統：
>
> | 系統 | 路徑 | 狀態 | 何時動 |
> |---|---|---|---|
> | **Polymarket PMI Platform**（本檔主題） | [`./`](./) | **CURRENT** — 跑在**單台 AWS EC2（Tesla T4 GPU）**上：真實多源 ingest（6 venue ~32 萬 market）+ 本地 GPU LLM（ollama）+ vector DB（pgvector，38.9k polymarket embedding）+ hourly 真實 scoring，全 $0。7 packages runnable，pmi-mcp 仍 P3 stub | 一切新功能、新 index def、schema 改動、forward-looking work |
> | **Project Micah** | [`../micah/`](../micah/) · [`../micah-db/`](../micah-db/) · [`../micah-job-executor/`](../micah-job-executor/) | **LEGACY** — 仍跑 prod ([thewarindex.org](https://thewarindex.org))，文件留作 **reference / mine for patterns** | 僅限 production 維運 / hotfix；**不再加新功能** |
>
> **2026-06-11 EC2 session 對帳**（環境從「reid 筆電 + mock」改成「AWS EC2 + 真實資料」）：
> - **環境**：dev box 是 AWS EC2（Tesla T4、30GB RAM），真實 Polymarket API 在此可達（不受 reid 家 HiNet DNS 劫持影響）。`POLYMARKET_USE_MOCK=false`。
> - **多源 ingest 上線**（`docker compose --profile ingest`）：polymarket rest/clob/history、kalshi rest/clob、manifold、forecastex、predictit、gemini、coinbase——~32 萬 market across 6 venue。metaculus API2 回 403（外部封鎖，容器已停）。
> - **GPU 本地 LLM**：ollama 自動偵測 T4 跑 llama3.2 + nomic-embed-text（`docker-compose.gpu.yml` override + `just ollama-up`/`scripts/e2e-ollama.sh` 自動偵測）。10 個 factor model 綁 `ollama/llama3.2`。
> - **vector DB 啟動**：38.9k polymarket market 進 pgvector（GPU nomic）；`semantic-war-demo.yaml`（首個 `type: semantic` anchor index）讓 SemanticSelector + Tier 0 真的作用。
> - **真實 scoring**：6 index 全 succeeded、hourly cron 續算、$0（GPU）。senate-seats 在真資料下從 null → 47.x（Class II 補齊）。
> - **T1 factor eval 並發化 ✅ 已做+驗證（2026-06-11）**：pipeline 4 階段（批次 cache → `asyncio.gather` 並發 LLM → 序列寫入）+ ollama `OLLAMA_NUM_PARALLEL` + MLflow per-eval gate（`PMI_MLFLOW_FACTOR_CHILD_RUNS`）。單 T4 量到 ~2x（GPU compute-bound；network-bound 的 OpenAI 會接近 concurrency 倍數）。
> - **2026-06-11 稍晚批次再完成**：CORR-3.12 cross-venue（IR `venues:`，war+kalshi 驗證 +67）、CORR-2.6 selector cap（house 原默默丟 527）、Tier 2/3 + escalation + ensemble + budget/breaker + disagreement（全真資料/真 LLM 驗證）、Batch API（submit 端驗證；poll/ingest 未 e2e）。
> - **仍未做**（別誤判為 done）：**MCP server（SHIP-2.3 stub）——唯一剩下的高槓桿項**。完整 active 清單見 [`TODO.md`](TODO.md)。
> - **拿掉（同日 reid 決策，不再是 TODO）**：~~SHIP-1.8~~ production infra apply（EC2 dev compose 即為部署形態，`deploy/` 物件保留備用）；~~CORR-7.2~7.5~~ OTel/Grafana/Slack 觀測整套（暫以 structured logs + `/sources/health` + MLflow 為觀測面）；~~Anthropic provider~~（provider 抽象已支援任何 OpenAI-compatible endpoint）。§3.3/§3.4 的設計章節保留，落地與否依此決策。
>
> **方向**：未來持續往本目錄（`pmi_data_platform/`，即本檔所在處）收斂。Micah 三 repo 是「為什麼這樣設計」的 reference，不是延伸基底。
>
> 本檔（§1–§14）保留為**設計權威**（為什麼這樣設計）；**實作狀態**看 §15.10 的 2026-06-07 snapshot
> （§15.1–§15.9 是 Micah legacy 的 2026-05-29 snapshot）。**TODO 主入口 = [`TODO.md`](TODO.md)**
> （2026-06-11 整併；HTML 版 [`docs/todo-bilingual.html`](docs/todo-bilingual.html)）。
> 原三本主題式 TODO（跑出來 / 跑得對 / 真實e2e）**已刪**——細節在 git history
> （`git show aa45741:<檔名>` 調閱）；[`TODO-next-version.md`](TODO-next-version.md)（multigraph 設計稿）保留。
> 雙語 HTML 文件入口在 [`docs/index.html`](docs/index.html)（snapshot 2026-06-07）。

---

## 0. Cursor Skills — 自動載入

本專案同時使用 Cursor 開發。啟動任何任務前，先讀取下列 SKILL.md，把其中的 domain knowledge 當作本次對話的 context。**新平台 skill 已收進本 repo 的 [`.cursor/skills/`](.cursor/skills/)；legacy 的 `micah-*` 仍在 workspace-root `../.cursor/skills/`**（它們跨三個 legacy repo，留在 root 共用）：

| Skill | 路徑 | 用途 | 狀態 |
|---|---|---|---|
| **pmi-platform-bootstrap** | `.cursor/skills/pmi-platform-bootstrap/SKILL.md`（repo-local） | **CURRENT** 平台導覽（pmi_data_platform 7 packages） | current |
| micah-codebase-navigator | `../.cursor/skills/micah-codebase-navigator/SKILL.md` | Micah 三 repo 架構導覽、檔案定位（mine for patterns） | legacy |
| micah-add-prediction-source | `../.cursor/skills/micah-add-prediction-source/SKILL.md` | Micah server 新增資料源 playbook | legacy |
| micah-llm-factor-pipeline | `../.cursor/skills/micah-llm-factor-pipeline/SKILL.md` | Micah 寫死的 8-factor pipeline | legacy（pmi-core engine 已取代） |
| micah-db-migration | `../.cursor/skills/micah-db-migration/SKILL.md` | `micah-db` Alembic 流程 | legacy（pmi-core 有自己的 alembic） |

**規則**：
1. **新功能 / 平台相關任務** → 讀 `pmi-platform-bootstrap`，動本目錄（`pmi_data_platform/`）。
2. **prod 維運 / hotfix on thewarindex.org** → 讀對應 `micah-*` skill。
3. 任務模糊（例如「加個新的預測市場」），預設走 (1) `pmi-ingest/`。
4. **本目錄（`pmi_data_platform/`）的指令一律用 Docker 跑，且在本目錄內跑**——本平台
   self-contained：自帶 [`justfile`](justfile) + [`docker-compose.yml`](docker-compose.yml)
   + 自己的 Postgres。一律 `cd pmi_data_platform` 後用**本目錄的** `just` recipe
   （`just up` / `just pmi-migrate` / `pmi-seed` / `pmi-score` …，內部都是
   `docker compose --profile pmi run --rm pmi-core …`），或直接
   `docker compose --profile {pmi,mlflow} …`。**不再透過 workspace-root 的 justfile**
   ——root 的 justfile / docker-compose.yml 已切成 **legacy Micah 專用**，不再管 pmi
   （見根目錄 [`../CLAUDE.md`](../CLAUDE.md)）。**不要在 host 直接 `pmi-core …`
   或 `cd pmi-core && python -m pmi_core.cli …` / `uv run …`**（host venv 不保證存在、
   會接錯 DB／少掉 bind-mount 的 fixtures）。唯一例外是不碰 DB／LLM 的純算 dry-run
   （`just dry-run`），它刻意在 host in-process 跑。

---

## 1. Vision

**Polymarket-only 的深度 PMI 平台 + AI agent 資料層。**

核心三件事：
1. **PMI 為 declarative 物件**：使用者可定義、可版本控、可分享、可 backtest。
2. **吃透 Polymarket 深度資料**：orderbook、trade flow、trader cohort、UMA 結算事件、conditional market 樹狀結構——不是只有 title + last price。
3. **AI interface 透過 MCP 變成 leverage**：不靠完美 UI 取勝，而是把 read+write 能力 plug 進 Claude / ChatGPT / Cursor / 任何使用者既有的 agent。

一句話定位：把 Micah 從寫死的 war index pipeline，重構成 Polymarket 上的「PMI-as-a-product 平台 + AI 資料層」。

**平台目標（北極星 why）**：能**因應不同市場策略，快速迭代出各種 PMI**。指數開發週期越短，能探索的策略空間越大。要做到這點，下列四項是硬需求（每項都對得上既有機制，不是口號）：

| 支柱 | 意思 | 落地機制 |
|---|---|---|
| **高可控** | 每個 factor / weight / prompt / 選股條件都精確可指定，不被黑箱牽著走 | declarative YAML DSL · prompt-as-code（git + sha256）· 人寫 keyword（非 LLM 自動長髒詞，見 §15.9）· factor model registry（register / promote / stage） |
| **高彈性** | 新策略 = 新 PMI，要快、且互不牽動 | north-star「新增第 N 個不需改前 N–1 個」· 一源一檔 poller · 一 index 一 YAML 自動 register · 可組合 factor · formula registry（NEXT-3.x） |
| **準確 + 確定性** | 分數可信、可重算、不隨機漂 | sha256 lineage（yaml / prompt / model）· append-only `audit_evaluations` · evaluation cache key 同條件完全 reuse · deterministic stub · byte-identical 回歸 · 每個 score 可追回原始合約 |
| **多版本共存** | 改 weight 不破壞歷史可比性；compliance 看「我們用 v3，過去 6 個月一致」 | SCD2 `core_index_definitions`（version + effective_from/to）· prompt append-only `-vN`· 舊版本仍可繼續算 · backtest replay · diff view（SHIP-3.2） |

這四項即 §4「PMI as Declarative Object」與 §6.1「Prompt / Model 版本控管」要保證的性質——本檔後續設計都應回頭服務它們。

---

## 2. 從 Project Micah 學到 / 帶來的設計

### 保留
| 概念 | Micah 出處 | 本專案用法 |
|---|---|---|
| Factor-based LLM 評估 | `../micah-db/micah_db/models/constants.py` FACTORS | 升級為使用者可定義、版本化 factor schema |
| Bucket collapse 演算法 | `../micah-job-executor/app/jobs/workflows/evaluate_contracts/bucket_collapser.py` (was `app/shared/workflows/...mutually_exclusive.py` pre-2026-05-20 relocation) | **已 port** 到 [`pmi-core/pmi_core/engine/bucket_collapser.py`](pmi-core/pmi_core/engine/bucket_collapser.py) (2026-05-30, CORR-1.4)；推廣到 conditional markets / multi-outcome 仍是後續工作 |
| 分位數 source weight | `../micah-job-executor/app/jobs/workflows/score_index/source_weights.py` (path relocated 2026-05-20) | 保留，但分位數對象從 cross-source 改為 **orderbook depth / cohort** |
| DB-checkpointed pipeline | `(contract_id, topic_id)` 唯一鍵 | 升級為 event-sourced，每筆評估 immutable + reproducible |
| Three-tier async fanout | topic semaphore × batch×factor gather × OpenAI client max_concurrent | 同模式，但搬進 workflow engine |
| Shared schema package | `micah-db` private GitHub | 模式相同（`pmi-core`），但 schema 切細 |

### 改寫
| Micah 做法 | 本專案改成 | 為什麼 |
|---|---|---|
| 9 個 source 整合 | 聚焦 Polymarket | 省掉跨家對齊、scraper 維護的工程負擔；要時再加 Kalshi |
| Render cron 每日批次 | 24/7 always-on workers + WS-triggered | Polymarket 是 24/7 市場，cron 不夠 |
| PMI 寫死在 code | Declarative YAML DSL → IR → engine | 使用者自定義是核心產品價值 |
| 8 個 factor hardcoded | 可組合 factor，每個 index 自己挑 | 不同主題的 PMI 需要不同 factor |
| 單一 LLM tier | Embedding → cheap → deep agentic 三層 | 成本控制 + 品質升級兼顧 |
| server/client 各寫 type | Pydantic → 自動生 TS | 避免 Micah 的 type drift 問題 |
| Render + Supercronic | K8s / Fly / Modal + Temporal | 規模、可觀測、durable |

---

## 3. 整體架構

```
   ┌────────────────────────────────────────────────────────────────────────────┐
   │                              Polymarket 資料層                              │
   │  REST / GQL          WebSocket            Polygon RPC         Subgraph     │
   │   markets, prices    real-time trades     on-chain events     historical   │
   └──────┬───────────────────┬─────────────────────┬───────────────────┬───────┘
          │                   │                     │                   │
          ▼                   ▼                     ▼                   ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │  pmi-ingest  (Python — asyncio)                                          │
   │    • REST poller   • WS consumer   • Chain indexer                        │
   │    • 每次 poll 寫 source_poll_log + UPSERT source_health                   │
   └──────────────────────────────────────────────────────────────────────────┘
                                       │
       ┌───────────────────────────────┼───────────────────────────────┐
       ▼                               ▼                               ▼
   ┌─────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────┐
   │  PostgreSQL 16      │  │  Redis 7                 │  │  Cloudflare R2 (S3)  │
   │  ┌───────────────┐  │  │  • Arq queue             │  │  • LLM batch blobs   │
   │  │ TimescaleDB   │  │  │  • Hot result cache      │  │  • backtest snaps    │
   │  │  hypertables: │  │  │  • Rate limit tokens     │  │  • export dumps      │
   │  │   trades,     │  │  │  • WS pub/sub            │  └──────────────────────┘
   │  │   prices,     │  │  └──────────────────────────┘
   │  │   index_score │  │              ▲   ▲
   │  │   source_log  │  │              │   │
   │  ├───────────────┤  │              │   │
   │  │ OLTP:         │  │              │   │
   │  │  markets,     │  │              │   │
   │  │  index_def,   │  │              │   │
   │  │  prompt,      │  │              │   │
   │  │  evaluation,  │  │              │   │
   │  │  source_health│  │              │   │
   │  ├───────────────┤  │              │   │
   │  │ pgvector:     │  │              │   │
   │  │  embeddings   │  │              │   │
   │  └───────────────┘  │              │   │
   └──────────┬──────────┘              │   │
              ▼                          │   │
   ┌──────────────────────────────────────────────────┐
   │  pmi-workers                                      │
   │  ┌──────────────────┐   ┌───────────────────┐    │
   │  │  Arq (P0/P1+)    │   │  Temporal (P2+)   │    │
   │  │  fire-and-forget │   │  durable workflow │    │
   │  │  WS-triggered    │   │  backtest         │    │
   │  │  webhook fanout  │   │  Tier 2 agentic   │    │
   │  └──────────────────┘   └───────────────────┘    │
   │                    │                              │
   │                    ▼                              │
   │  ┌────────────────────────────────────────────┐  │
   │  │   pmi-core  (engine, shared library)       │  │
   │  │   DSL parser • Factor evaluator (Tier 0/1) │  │
   │  │   Liquidity weighter • Aggregator • BT     │  │
   │  └────────────────────────────────────────────┘  │
   └────────────────────┬─────────────────────────────┘
                        ▼
   ┌──────────────────────────────────────────────────────┐
   │  pmi-api  (FastAPI + Strawberry)                     │
   │  REST  •  GraphQL  •  WebSocket  •  OAuth + API keys │
   └────┬──────────────────┬─────────────────────┬────────┘
        ▼                  ▼                     ▼
   ┌───────────┐  ┌──────────────────┐  ┌──────────────────┐
   │ pmi-web   │  │  pmi-mcp         │  │ External clients │
   │ Next.js   │  │  MCP server      │  │ Webhook / Slack  │
   │ Dashboard │  │  Tier A/B/C tools│  │ Direct API       │
   │ Builder   │  │  → Claude /      │  │ (Pro / Team /    │
   │ Chat      │  │    Cursor /      │  │  Enterprise)     │
   │ Backtest  │  │    ChatGPT       │  │                  │
   └───────────┘  └──────────────────┘  └──────────────────┘

   ═════════════════════ 兩條橫切關注 ═════════════════════

   Observability   all services → OTel SDK → Grafana Cloud
                   (Prometheus / Loki / Tempo) + Sentry → Slack

   Version Control git: code + YAML defs + prompts
                   Postgres: SCD2 (index_definition) + append-only
                             (evaluation, index_score) + sha256 lineage
                   Alembic: schema migration
```

### 3.1 Storage 策略：single Postgres first

P0/P1 用**單一 PostgreSQL 16**（managed），配 **TimescaleDB extension**（time-series hypertable）+ **pgvector**（embeddings）。**不**在 day-1 拆三個 DB；該拆的訊號是「Timescale 撐不住分析查詢」，那是 P2+ 的事。

| 資料用途 | 物理位置 | 範例 table |
|---|---|---|
| OLTP metadata | Postgres OLTP | `markets`, `users`, `api_keys`, `index_definition`, `prompt`, `source_health` |
| Time-series（高頻寫） | Timescale hypertable | `trades`, `prices`, `index_score`, `source_poll_log` |
| Vector | pgvector | `contract_embedding` |
| Cache / queue / pub-sub | Redis 7 | Arq queue、hot score cache、rate limit、WS publish |
| Blob | Cloudflare R2 (S3-compat) | LLM Batch payload、backtest snapshot、CSV / Parquet export |

**明確不引入**：Kafka / Redpanda（Polymarket 流量級用 Redis Streams 即可）、ClickHouse（P2+ 才視 Timescale 表現決定）、Qdrant（pgvector 跨 50M rows 還沒到瓶頸）、Iceberg / lakeFS / Dolt（PMI 是 SQL 友善結構，不需要 git-like 資料層）。

### 3.2 On-demand PMI 請求路徑

```
   Client (web / MCP / API)
        │ GET /indexes/{id}/score?as_of=now
        ▼
   ┌──────────────────────────────────────────────────┐
   │ pmi-api                                          │
   │ ① Redis cache hit? (key includes index_def_id +  │
   │   minute-bucket)                                 │
   │     HIT  → return (P50 < 20ms)                   │
   │     MISS ↓                                       │
   │ ② index_score 最近一筆距 now < TTL?              │
   │     YES → return + 補 Redis                       │
   │     NO  ↓                                        │
   │ ③ Arq enqueue 計算 → 回 202 + job_id（或同步等）  │
   └────────────┬─────────────────────────────────────┘
                ▼
   ┌──────────────────────────────────────────────────┐
   │ Arq worker                                       │
   │  1. 撈 active index_definition                    │
   │  2. selectors → contracts (keyword / pgvector)   │
   │  3. 對每個 contract：                             │
   │     evaluation 已存且 prompt/model 沒換 → reuse   │
   │     否則 Tier 0/1 LLM → 寫 evaluation (immutable) │
   │  4. aggregate → 寫 index_score (immutable +       │
   │     component_evaluation_ids[] lineage)          │
   │  5. update Redis cache + publish WS              │
   └──────────────────────────────────────────────────┘
```

**關鍵不變式**：evaluation cache key = `(contract_id, index_definition_id, prompt_id, model_id)`。**定義 / prompt / model 沒換 → 完全 reuse，只有 fresh 合約或 fresh 價格才花 LLM cost**。

### 3.3 Source health monitoring 資料流

```
   pmi-ingest poll loop
        │  每次 poll 完成（成功或失敗）
        ▼
   ① INSERT source_poll_log  (immutable, TS hypertable)
   ② UPSERT source_health     (current state, row-per-source)
   ③ OTel counter / histogram → Prometheus
        │
        ▼
   Grafana 面板（Source Health / Latency / Volume）
        │
        ▼  alert rule:
        ▼   consecutive_failures > 3
        ▼   records_24h < 0.5 × expected_records_24h
        ▼   latency_p95_ms > baseline × 3
        ▼
   Slack / PagerDuty
```

支撐這兩張 schema：

```sql
CREATE TABLE source_poll_log (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL,           -- 'polymarket-rest', 'polymarket-ws', 'polygon-rpc'
    polled_at TIMESTAMPTZ NOT NULL,
    duration_ms INT,
    records_returned INT,
    success BOOLEAN,
    error_class TEXT,
    error_message TEXT
);
-- SELECT create_hypertable('source_poll_log', 'polled_at');

CREATE TABLE source_health (
    source TEXT PRIMARY KEY,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    consecutive_failures INT DEFAULT 0,
    p95_latency_ms_24h INT,
    records_24h BIGINT,
    expected_records_24h BIGINT,
    status TEXT                     -- 'healthy' / 'degraded' / 'down'
);
```

**不引入 Great Expectations / Soda / dbt tests** 這類重型 data quality framework——這個 scale 純 SQL + Grafana panel 就足夠透明。

### 3.4 觀測層

| 訊號 | 工具 | 用途 |
|---|---|---|
| Metrics | OTel SDK → Prometheus（Grafana Cloud free tier 起步） | poll rate、latency、queue depth、LLM cost |
| Logs | structured JSON → Loki | 錯誤回溯、低基數 query |
| Traces | OTel → Tempo | 端到端「PMI 計算為什麼慢」追蹤 |
| Errors | Sentry | exception + release version |
| Dashboards | Grafana | source health、LLM cost、PMI freshness 三個基礎面板 |

**起步策略**：用 Grafana Cloud free tier，**不要 day-1 自託管 LGTM stack**——等真的成本 / 合規逼到才搬。

### 3.5 Deployment view

```
Render / Fly.io（起步）                   ~$215/mo P0/P1 總計
  pmi-api          web service        $25/mo
  pmi-ingest       background worker  $25/mo
  pmi-workers      Arq pool           $25/mo
  pmi-web          Next.js SSR        $20/mo
  Postgres+TS+pgv  managed (4GB)      $90/mo
  Redis            managed            $25/mo

Grafana Cloud      free tier          $0
Sentry             free tier          $0
Cloudflare R2      blob storage       ~$5/mo
GitHub Actions     CI                 free

P2+ 加：
  Temporal Cloud   durable workflow   +$200/mo
  ClickHouse / Tinybird               +$50–200/mo （視 Timescale 撐到哪）
  LLM (OpenAI Batch + on-demand)      +$100–500/mo
```

---

## 4. PMI as Declarative Object（核心抽象）

Micah 把 PMI 寫死進 code（8 factor、6 weight、war index 邏輯）。本平台 PMI 是**可宣告、可版本控、可分享**的物件：

```yaml
# index_defs/fed-rate-uncertainty.yaml
id: fed-rate-uncertainty
version: 3
title: "Fed Rate Uncertainty Index"
owner: reid

selectors:
  - type: keyword
    terms: ["FOMC", "Fed", "rate cut", "rate hike", "Powell"]
  - type: semantic           # pgvector 語意搜尋
    anchor: "Federal Reserve monetary policy decisions"
    min_similarity: 0.78
  - type: category
    polymarket_tag: "economics"

factors:                     # 取代寫死的 8 factor
  - id: direction
    type: ternary
    prompt_ref: prompts/direction-v4
    weight: null             # direction 不參與 relevancy
  - id: directly_about_fed
    type: binary
    prompt_ref: prompts/direct-link-v2
    weight: 40
  - id: time_horizon_short   # 自訂 factor
    type: binary
    prompt_ref: prompts/short-horizon-v1
    weight: 15

weighting:
  liquidity:
    method: quantile         # p20/p50/p80/p95 階梯
    boost_threshold:
      depth_p95: true
      score_gt: 0.85
      direct_link: 1
      boost_to: 20
  trader_cohort:             # Polymarket 獨有
    whale_boost: 1.3
    retail_only_penalty: 0.7

aggregation:
  collapse:
    enabled: true
    max_spread_days: 30
    representative: max_probability
  min_components: 10
  formula: "Σ(score × weight) / Σ(weight) × 100"

publish:
  cadence: real_time         # 或 hourly / daily
  channels: [api, websocket]
```

**設計原則：**
- **Index Registry**：平台提供 baseline indexes，使用者可 fork / clone / 自訂。
- **Versioning**：改 factor weight 不是 in-place，而是 bump version；舊版本仍可繼續算（保留歷史可比性）。
- **DSL → IR**：YAML 解析成 internal representation，engine 只認 IR。
- **Backtest 內建**：改完 def 一鍵 replay 過去 6 個月。
- **Diff view**：「比較這版跟上版的 PMI 差在哪個合約」。

### 版本血緣 schema（落地 SQL）

把上面抽象的「versioning」具體化成四張 table，**任一 score 都能還原當時的 definition / prompt / model**，這直接是 §9 Enterprise audit log 賣點的根：

```sql
-- a) PMI 定義走 SCD Type 2
CREATE TABLE index_definition (
    id BIGSERIAL PRIMARY KEY,
    index_id TEXT NOT NULL,                  -- 'fed-rate-uncertainty'
    version INT NOT NULL,                    -- 1, 2, 3, ...
    definition JSONB NOT NULL,               -- parsed IR
    yaml_source TEXT NOT NULL,
    yaml_sha256 TEXT NOT NULL,               -- ←  對得回 git commit
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,                -- NULL = current
    UNIQUE (index_id, version)
);

-- b) Prompt append-only，永遠不刪
CREATE TABLE prompt (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    version INT NOT NULL,
    template TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (name, version)
);

-- c) Evaluation 不可變，帶上游 lineage 欄位
CREATE TABLE evaluation (
    id BIGSERIAL PRIMARY KEY,
    contract_id BIGINT NOT NULL,
    index_definition_id BIGINT NOT NULL REFERENCES index_definition(id),
    prompt_id BIGINT NOT NULL REFERENCES prompt(id),
    prompt_sha256 TEXT NOT NULL,             -- 雙保險
    model_id TEXT NOT NULL,                  -- 'gpt-4o-mini-2024-07-18'
    model_response JSONB NOT NULL,
    factor_values JSONB NOT NULL,
    evaluated_at TIMESTAMPTZ NOT NULL,
    UNIQUE (contract_id, index_definition_id, prompt_id, model_id)
    -- 沒有 updated_at；要改 = 寫新一筆
);

-- d) Index score 也不可變，陣列欄位指回 evaluation
CREATE TABLE index_score (
    id BIGSERIAL PRIMARY KEY,
    index_definition_id BIGINT NOT NULL REFERENCES index_definition(id),
    as_of TIMESTAMPTZ NOT NULL,
    score NUMERIC NOT NULL,
    component_evaluation_ids BIGINT[] NOT NULL,  -- ← lineage
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (index_definition_id, as_of)
);
-- SELECT create_hypertable('index_score', 'as_of');
```

**還原一筆 score 的程序**：`index_score.id` → `index_definition_id` 拿到當時 IR → `component_evaluation_ids[]` 逐筆 join `evaluation` → 每筆 `prompt_id` / `model_id` 還原當時 LLM 條件。**這四張 table 撐起來的不只是版本控，是審計與 backtest 重播**。

---

## 5. Polymarket 專屬訊號（Micah 拿不到的）

| 訊號 | 來源 | 用途 |
|---|---|---|
| **Orderbook depth** | CLOB API | 取代「volume」做 liquidity weight 更準 |
| **Trade flow** | WS trades | 偵測「最近 1h 大量買單」→ momentum 指標 |
| **Trader cohort** | Polygon chain | 區分 whale vs retail；whale 持倉的市場加成 |
| **UMA disputes** | 鏈上事件 | 排除爭議中市場（避免結算糾紛污染 PMI） |
| **Conditional market 樹狀** | Polymarket conditions | collapse 演算法推廣到「同 condition 不同 outcome」 |
| **Market age / settle window** | metadata | 老市場 / 即將結算給不同 prior |
| **Cross-market arbitrage** | 多市場聯立 | mutually exclusive 但 Σ≠1 → 信號劣化 |

---

## 6. LLM 評估的升級（四層）

```
┌──────────────────────────────────────────────────────────────────────┐
│  Tier 0  Embedding Pre-filter (本地 / 小模型)                          │
│    • 新市場 embedding → 跟 index anchor 算 cosine                      │
│    • 餘弦 <0.5 直接跳過，省 LLM 呼叫                                   │
├──────────────────────────────────────────────────────────────────────┤
│  Tier 1  Cheap Factor Eval (Haiku / 4o-mini)                          │
│    • N 個 factor 同 Micah 做法，便宜模型快速跑                         │
├──────────────────────────────────────────────────────────────────────┤
│  Tier 2  Deep Eval — Agentic (Sonnet / Opus，有工具)                   │
│    • 觸發條件：合約描述模糊 / factor 矛盾 / Tier1 信心低                 │
│    • 工具：search web、讀 resolution criteria、查歷史 trade            │
│    • 產出有 reasoning trace 供 audit                                  │
├──────────────────────────────────────────────────────────────────────┤
│  Tier 3  Periodic Re-evaluation                                       │
│    • 不每天全表跑；用 (價格漂移 > X%) 或 (新資訊到達) 觸發              │
└──────────────────────────────────────────────────────────────────────┘
```

額外：
- **Prompt as code**：git 管 prompt、DB 存 active version + 歷史評估的 prompt_hash → 任何 evaluation 都 reproducible。
- **Batch API**：nightly cheap recompute 用 Anthropic / OpenAI Batch API，成本減半。
- **觀測**：factor LLM 回應分佈、disagreement、self-consistency、cost 統一走 OTel → Prometheus / Grafana；raw response 寫進 Postgres `evaluation.model_response`（JSONB）。**ClickHouse 是 P2+ 才視 Timescale 表現決定要不要加**，見 §3.1。

### 6.1 Prompt / Model 版本控管 — MLflow 鏡像層

Postgres 的 `core_prompts` + `audit_evaluations` 是 compliance-grade 的真相來源，
但只給工程師看 SQL 用——MLflow 是套在上面的「productivity layer」，給研究員、
PM、外部稽核看 UI。**雙寫但有清楚的主從**：

```
git *.md  ─►  pmi-core/_ensure_prompt()  ─►  core_prompts  ─►  mlflow.register_prompt()
                                                                       │
            (sha256 是真相)        (append-only, 不覆寫)        (UI / alias / promote)
```

| 概念 | Postgres（authoritative） | MLflow（mirror） |
|---|---|---|
| Prompt 模板 + 版本鏈 | `core_prompts(name, version, sha256, template)` append-only | `prompts:/<name>/<v>` URI 寫回 `core_prompts.mlflow_prompt_uri` |
| 每次 LLM 評估 | `audit_evaluations` append-only，含 prompt_sha256、model_id、temperature、cost | 一個 child run；run_id 寫回 `audit_evaluations.mlflow_run_id` |
| 每次 pipeline tick | `audit_pipeline_runs` | 一個 parent run（experiment = `pmi.<index_id>`）；id 寫回 `audit_pipeline_runs.mlflow_run_id` |
| Index 定義（SCD2） | `core_index_definitions` | 一個 experiment per `index_id`（跨版本共用，version 是 run tag） |
| Model 綁定（prompt+LLM+temp+tools） | `core_factor_models`（stage / is_active 驅動 evaluator） | `mlflow_registered_model_name` 預留 Model Registry artifact upload（Tier 1 真 LLM 落地時填） |

**Graceful degradation**：MLflow 服務掛了，pipeline 仍然成功——`mlflow_*` 欄位
留 NULL，事後 `pmi-core mlflow-init` 補拉。**從不阻斷 evaluation**。

**為什麼不用 MLflow 取代 `core_prompts` / `audit_evaluations`**：
1. MLflow backend 升版會跑 alembic migration，可能斷服務——稽核不能容忍。
2. MLflow 沒有「append-only」hard constraint，UPDATE / DELETE 可被 client 觸發。
3. SQL 查詢比 MLflow API 強很多（factor-level join、跨 index 比較、cost rollup）。

**P0 範圍**：
- ✅ Prompt Registry 鏡像（`_ensure_prompt` 內呼叫）
- ✅ Tracking 鏡像（pipeline parent run + factor child run）
- ✅ Schema hook 欄位 + alembic 0002 migration
- ✅ Model Registry table（`core_factor_models`）+ evaluator 走 lookup（registry hit → 用 promoted bundle；無 row → fallback YAML）—— alembic 0003
- ⏭ Model artifact upload（Tier 1 真 LLM 落地時把 `MlflowClient.create_model_version` 接進 `models register`）

**Factor Model lookup flow（每 tick 每 factor 一次）**：

```
                    ┌──► CoreFactorModel(factor_id, stage='production', is_active=True)
                    │      ├──► YES: 使用該 row 的 (prompt, llm_model_id, temperature, tools)
                    │      │         model_source = 'registry'
   resolve_factor_model  ─┤
                    │      └──► NO : 使用 YAML factor.prompt_ref + DEFAULT_STUB_MODEL_ID
                    │                model_source = 'yaml'
                    │
                    └──► 結果包成 ResolvedFactorModel，傳給 evaluate_factor()
```

`audit_evaluations.model_id` + `model_response.model_source` 就是這個 lookup 的事後痕跡；
MLflow child run 額外帶 `factor_model_id`、`mlflow_registered_model` tag，
讓 UI 一眼看出哪些 eval 走 registry、哪些是 YAML fallback。

**CLI 操作**（[`pmi-core models`](pmi-core/pmi_core/cli.py)）。
下面的 `pmi-core …` 是 **container 內**的 entrypoint，host 端一律包進 Docker 跑
（見 §0 規則 4）——例如 `docker compose --profile pmi run --rm pmi-core models list`：

```
pmi-core models list                                  # 全部 factor models
pmi-core models register --factor X --prompt-name F  # 寫進 staging, is_active=False
                        --prompt-version 1 --llm gpt-4o-mini-2024-07-18
                        --temperature 0.1
pmi-core models promote <id> --stage production       # 原子 demote 舊 active + 推此 row
```

實作：[`pmi-core/pmi_core/mlflow_client.py`](pmi-core/pmi_core/mlflow_client.py)、
[`pmi-core/pmi_core/engine/factor_resolver.py`](pmi-core/pmi_core/engine/factor_resolver.py)、
[`pmi-core/pmi_core/models/core_factor_model.py`](pmi-core/pmi_core/models/core_factor_model.py)、
[`mlflow/Dockerfile`](mlflow/Dockerfile)。

---

## 7. Workers: Temporal vs Arq —— 混合策略

### Workload 特性

| 工作類型 | 例子 | 適合 |
|---|---|---|
| Fire-and-forget short | embed 新市場、發 alert webhook | **Arq** |
| Periodic batch | 每日 PMI recompute | Temporal |
| Long-running orchestration | Backtest、index def 改版後全表 re-eval | **Temporal** |
| Streaming-triggered | WS 觸發單一市場 re-eval | **Arq** |
| 多 step agentic LLM | Tier 2 deep eval | **Temporal** |

### 工具特性
- **Arq**：Redis-backed async task queue，pydantic 作者寫的。簡單到爆、原生 async、上線 5 分鐘；但沒有 durable workflow、觀測差、不適合長跑。
- **Temporal**：分散式 workflow engine，event sourcing 讓 workflow 永遠可 replay；durable execution、worker 掛了下次接續；內建 retry / heartbeat / signals / 觀測 UI。代價：部署複雜（自託管要起 Postgres + 4 service，或上 Temporal Cloud $200+/月），SDK 學習曲線。

### 分工

```
┌─────────────────────────────────────────────────────────────┐
│  Arq (Redis)                                                 │
│  • alert / webhook fan-out                                   │
│  • WS-triggered single-market re-evaluation                 │
│  • 簡單的 idempotent 短任務                                  │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Temporal                                                    │
│  • Nightly PMI 全表 recompute (~30 min)                      │
│  • Backtest workflow (數小時可能斷)                          │
│  • Index def 改版 → full re-evaluation                       │
│  • Tier 2 agentic deep eval                                  │
│  • LLM Batch API submit + 12 小時後拉結果                    │
└─────────────────────────────────────────────────────────────┘
```

### 決策表

| 問題 | 是 → | 否 → |
|---|---|---|
| 單次 runtime > 5 分鐘？ | Temporal | Arq |
| 跨多 LLM/外部 API，全失敗成本高？ | Temporal | Arq |
| 要中途暫停 / 等人類確認？ | Temporal | Arq |
| 個別任務丟了沒差（下次觸發補上）？ | Arq | Temporal |
| 團隊 < 2 人，最小化 ops？ | Arq first，痛了再加 Temporal | — |

### 起步路徑（避免 over-engineer）
1. **P0/P1 全 Arq**：MVP 階段，所有 job 寫成 idempotent。
2. **P2 引入 Temporal**：第一次「backtest 跑 2 小時然後 worker OOM」發生時，把 long-running 搬進來。
3. **P3+**：Tier 2 agentic eval 必上 Temporal。

---

## 8. MCP Tool Schema

把 MCP server 當作平台「不用做完美 UI 就贏」的槓桿。

### 設計原則
1. **單一動作 = 單一 tool**，不做瑞士刀。
2. **回傳結構化 + LLM-readable summary**：`summary: str` + `data: {...}` + `links[]`。
3. **參數命名動詞化、限制 enum**。
4. **危險動作分兩階段**：先 dry-run 後 confirm。
5. **每個 tool 有 `as_of` 參數**，預設 now。
6. **錯誤訊息給 next-step**。

### Tool 分層

```
┌────────────────────────────────────────────────────────────┐
│  Tier A — Discovery (純讀，便宜)                             │
│  pmi.list_indexes                                          │
│  pmi.search_markets                                        │
│  pmi.get_index                                             │
│  pmi.get_score                                             │
│  pmi.get_market                                            │
├────────────────────────────────────────────────────────────┤
│  Tier B — Analysis (純讀，會跑 LLM/計算)                     │
│  pmi.explain_score                                         │
│  pmi.compare_indexes                                       │
│  pmi.backtest                                              │
│  pmi.market_diff                                           │
├────────────────────────────────────────────────────────────┤
│  Tier C — Write (需要 user_id + confirmation)                │
│  pmi.draft_index   # 不寫入，回 IR + diff vs sibling          │
│  pmi.commit_index  # 真正寫入（需 draft_id）                  │
│  pmi.create_alert                                          │
│  pmi.subscribe                                             │
└────────────────────────────────────────────────────────────┘
```

### Schema 範例

```json
{
  "name": "pmi.get_score",
  "description": "Get the current or historical score for a PMI index. Use this when the user asks 'what is the X index right now' or 'what was X on date Y'.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "index_id": {"type": "string", "description": "Index slug. Get from pmi.list_indexes."},
      "as_of": {"type": "string", "format": "date-time", "description": "ISO 8601. Defaults to now."},
      "version": {"type": "integer", "description": "Index def version. Defaults to live."}
    },
    "required": ["index_id"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "summary": {"type": "string"},
      "data": {
        "type": "object",
        "properties": {
          "score": {"type": "number"},
          "as_of": {"type": "string"},
          "component_count": {"type": "integer"},
          "delta_24h": {"type": "number"},
          "confidence": {"enum": ["high", "medium", "low"]}
        }
      },
      "links": {"type": "array"}
    }
  }
}
```

```json
{
  "name": "pmi.explain_score",
  "description": "Explain WHY an index has its current value. Use when user asks 'why is X high/low' or 'what's driving the index'.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "index_id": {"type": "string"},
      "as_of": {"type": "string", "format": "date-time"},
      "depth": {"enum": ["shallow", "deep"], "default": "shallow",
                "description": "deep triggers an LLM synthesis pass (costs credits)."},
      "compare_to": {"type": "string", "format": "date-time"}
    },
    "required": ["index_id"]
  }
}
```

```json
{
  "name": "pmi.draft_index",
  "description": "Validate and preview a new PMI index WITHOUT saving. Returns the parsed IR, sample markets matched, and a 90-day backtest. ALWAYS call before pmi.commit_index.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "definition_yaml": {"type": "string"},
      "sample_size": {"type": "integer", "default": 20, "maximum": 200}
    },
    "required": ["definition_yaml"]
  }
}
```

```json
{
  "name": "pmi.commit_index",
  "description": "Persist a previously-drafted index. Requires draft_id. CONFIRMS WITH USER before writing — does not auto-commit.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "draft_id": {"type": "string"},
      "confirm": {"const": true, "description": "Must be literally true. Surface draft summary to user and get explicit yes."},
      "visibility": {"enum": ["private", "team", "public"], "default": "private"}
    },
    "required": ["draft_id", "confirm"]
  }
}
```

### Schema 細節（容易忽略）
- `required` 越短越好——可選參數讓 agent 不會卡。
- `description` 寫「**什麼情境下用**」而非「這個 tool 做什麼」。
- `data` 給結構、`summary` 給敘述——讓 agent 能引用、UI 能 render。
- Token 預算：list 預設只回 top 30 + `cursor`，agent 要更多再分頁。
- 錯誤格式：`{error: {code: "INDEX_NOT_FOUND", hint: "Try pmi.list_indexes"}}`。
- 權限放回應：`data.permissions: {can_edit: bool}`。

### 三種 AI 互動模式
1. **MCP Server**：給 Claude / ChatGPT / Cursor / 自家 agent 接（最大 leverage）。
2. **In-app Chat with Tools**：平台內建 chat，UI 顯示工具呼叫過程；寫操作需 explicit confirmation。
3. **Daily Briefing Agent**：每天/每週自動生成異動最大的 N 個 index + LLM 解釋 + push 到 Slack/Email。

---

## 9. 商業模式 / 訂閱層級

> ⚠️ **2026-05-25 狀態：本節為 2026-05 期間的設計探索，定價數字、訂閱層級結構、獲客策略 *尚未決定*。**
> 不要把本節當成已 commit 的商業模式做技術決策。技術側只要保留下列三個 invariant 即可，其他都待定：
> 1. Schema 預留 multi-tenant column（`owner_id` / `tenant_id`）— 未來不論單租戶 / 多租戶都可走
> 2. API key 機制 + rate limit 欄位 — 不論未來是 free / seat-based / usage-based 都用得上
> 3. Cost tracking（`audit_evaluations.cost_usd`、`audit_pipeline_runs.cost_usd`）— 不論最後怎麼計費都需要
>
> 本節保留是為了當初討論的脈絡（為什麼選 Polymarket-only、為什麼要 MCP、為什麼 AI 分層）。
> **若要重啟商業模式討論，從 [`business-overview.html`](business-overview.html) 的「技術開發 + 指標開發週期」基礎上往外延伸**。

### 使用者光譜

```
   個人 quant / 散戶          研究員 / 媒體            機構：基金、政策、保險
   ──────────────────         ──────────────         ──────────────────────
   想看現成 PMI                 自訂 index + 引用報導    要 API + SLA + 客製
   $20–50/月                   $200–500/月            $3k–20k+/月
   chat 為主                    chat + dashboard       API + 專屬 PMI 設計
```

**關鍵：從一開始規劃 B2B，C2C / 個人是 funnel，不是主要收入。**

### 訂閱層級

| Tier | 月費 | 對誰 | 核心能力 |
|---|---|---|---|
| **Free** | $0 | 試水溫 / SEO | 公開 indexes 看 30 天；無 chat；無 API；無 alerts |
| **Pro** | $39 | 個人重度用戶、quant | 全歷史；每月 20 自訂 indexes；100 alerts；chat 100k tokens；REST API 1k call/day |
| **Team** | $199 / 5 seats | 小型 hedge fund、研究團隊 | Pro × 5；私密 sharing；webhook；API 50k/day；backtest 無限；priority queue |
| **Enterprise** | $3k+ 起 | 機構、政府、媒體 | SLA、VPC、客製 PMI 設計、WS stream、API 無上限、Slack 支援 |
| **Data API** | usage-based | LLM 廠商、quant fund | 純 API，~$0.01/call |

### Marginal cost 盤點

```
Free:        ~$0       (公開 index 結果，靜態 CDN)
Pro:         ~$5/月    (chat tokens + 自訂 index 評估)
Team:        ~$30/月   (5 seats + backtest 算力)
Enterprise:  varies    (專屬 LLM 預算)
```

Pro $39 vs cost $5 → 88% gross margin，**前提是限制 chat token + 自訂 index 配額**。

### 收費點對齊「真正的 leverage」

| 定價維度 | 為什麼好 |
|---|---|
| 自訂 index 數 | 對應研究深度 |
| Alert 數 + WS stream | 量化依賴程度 |
| Backtest 算力 / 月 | 重度 quant，可拆 add-on |
| 歷史 depth (30d / 1y / all) | 機構研究需 multi-year |
| 資料延遲 (15min / real-time) | 真即時溢價 2–3× |
| 客製 factor prompt 設計 | 高毛利顧問式 |

### Add-on / 加值
- **Index Marketplace**（P4+）：第三方研究員發佈付費 index，平台抽 30%。建立平台效應。
- **Custom PMI 顧問服務**：機構帶業務問題，一週設計專屬 PMI，一次性 $5k–20k。
- **MCP Pro**：機構自家 agent 接 MCP server，$50/月/seat。
- **Embedding API**：純語意搜尋 endpoint。
- **Data export**：CSV / Parquet 歷史 dump，按 GB 計。

### 機構特殊賣點（很重要）
機構買的是「**安心**」：
- **Audit log**：每個 PMI 分數可追溯到當時市場、prompt、LLM response。
- **Versioned indexes**：legal/compliance 看到「我們用 v3，過去 6 個月一致」。
- **On-prem / VPC**：銀行買得最多。
- **SLA**：99.9% uptime、4 小時回應、Slack 直通。
- **SOC 2**：拿到後客單價立刻翻倍。

### 三年路徑（粗線條）

| 階段 | 目標 | 收入結構 |
|---|---|---|
| **Y1** | Pro launch、500 paying users、5 個 enterprise pilot | $25k ARR + $50k pilot deals |
| **Y2** | Enterprise GA、SOC 2、Marketplace beta | $300k ARR，70% enterprise |
| **Y3** | MCP 成主流通路、Marketplace 顯著抽成 | $1–2M ARR |

### Anti-patterns（避雷）
- **不要按 API call 收個人戶**：使用者算不清楚 → 不訂閱。改 seat-based 或 quota with overage。
- **不要 chat 完全免費**：LLM 帳單會殺死你。
- **不要太早 Enterprise**：MVP 階段做 enterprise 會被 RFP / SOC 2 拖住——但 architecture 要保留「可升級」（multi-tenant cleanly separable）。
- **要做 free SEO**：每個 public index 自帶漂亮 OG page，「Polymarket Fed Index」等關鍵字帶 free funnel。

---

## 10. Repo / Service 切分

> 本檔即位於 `pmi_data_platform/` 根（workspace-root sibling of `../micah/`、`../micah-db/`、`../pmi-platform-proposal/`）。下方所有相對路徑都以**本目錄**為根：例如 `pmi-core/` = 本目錄下的 `pmi-core/`；sibling repo 用 `../`（如 `../micah/`）。

```
pmi-core/              # 取代 micah-db
  ├ models/             SQLAlchemy schema
  ├ alembic/            migrations
  ├ dsl/                Index DSL parser
  ├ engine/             Factor / weight / aggregate
  ├ backtest/
  └ types/              Pydantic shared types (auto-gen TS for frontend)

pmi-ingest/             Python ingestion (asyncio + httpx/websockets/web3.py)
  ├ rest_poller
  ├ ws_consumer
  ├ chain_indexer
  ├ health/             寫 source_poll_log + UPSERT source_health
  └ redis_stream/       fan-out 到下游 Arq worker (取代 Kafka，P0/P1 量級夠)

pmi-workers/            # 取代 micah-job-executor
  ├ workflows/          Temporal
  ├ tasks/              Arq
  ├ evaluators/         LLM tier 0/1/2/3
  └ embeddings/

pmi-api/                FastAPI + Strawberry GQL
  ├ rest
  ├ graphql
  ├ ws
  └ auth (OAuth + API keys)

pmi-mcp/                MCP server
  └ tools.py            包 pmi-api

pmi-web/                Next.js frontend
  ├ dashboard
  ├ index-builder
  ├ chat
  └ backtest
```

**為什麼這樣切**：每個服務獨立 scale / deploy；全 Python stack 讓 ingest / workers / api 共用 pmi-core，降低維護成本與團隊上手門檻；Python 爬蟲生態（httpx、websockets、web3.py、BeautifulSoup、Playwright）遠比 Rust/Go 豐富，24/7 WS + chain indexing 的 latency 需求用 asyncio 足以應付。

---

## 11. Phasing

> **MVP scope（2026-06-08 reid 拍板）**：**把目前 Micah 有的全部搬到新架構，端到端跑通——爬蟲 → 產出 index → UI 呈現**。即 Micah 全功能 parity on new platform（多源 ingest：Kalshi/Polymarket/PredictIt/ForecastEx/Metaculus/Manifold REST + Robinhood/Coinbase/Crypto 爬蟲；合約→國家→區域→世界多層聚合；war/senate dashboard 接真資料），**不是**新差異化。比本節原本「Polymarket-only 起手」更廣；deep signals（orderbook/chain/cohort）與 typed-multigraph 維持在 MVP 之後（P1–P2）。對應/缺口表與 4 件待辦見 [`docs/roadmap-bilingual.html`](docs/roadmap-bilingual.html) 的「MVP 範圍」段。

每階段都要有「能 demo 給使用者」的產出：

| 階段 | 範圍 | 何時可 demo |
|---|---|---|
| **P0 (4-6 週)** | Polymarket ingest（REST + WS）→ TimescaleDB；一個寫死的 PMI（沿用 Micah factor）跑出來 | 「我們有 Polymarket 的 PMI 時序」 |
| **P1 (4-6 週)** | Index DSL + builder UI + backtest；3-5 個內建 index；REST API | 「使用者可以建自己的 PMI」 |
| **P2 (4-6 週)** | LLM tier 0/1 升級、orderbook 訊號、trader cohort 加成 | 「比 Micah 更準的 PMI」 |
| **P3 (3-4 週)** | MCP server + in-app chat；daily briefing agent | 「AI native 平台」 |
| **P4 (持續)** | Tier 2 agentic eval、cross-market 套利訊號、社群 index 分享 | 「平台效應」 |

P0+P1 約三個月後手上就有「Polymarket 版的 Micah，但 PMI 可自訂」——這個東西本身已有商業假設可驗。

---

## 12. 交織決策（三主題如何相互影響）

- **MCP schema** 直接影響商業模式：Tier C 寫操作會吃 worker 資源，要計入 Pro/Team 配額。
- **Temporal** 讓 Enterprise 賣點成立（durable backtest、audit log、reproducibility）——沒 Temporal-grade workflow，機構 deal 簽不下來。
- **訂閱層級** 決定 worker capacity planning：Pro 100 alert × 1000 user = Arq 撐；Enterprise 1 萬 user × 即時 stream = 必須 Temporal + 專屬 worker pool。

---

## 13. Open Questions（之後要回來決定）

- [ ] Self-host Temporal 還是上 Temporal Cloud？看 P2 進入時的 ops 預算。
- [x] ~~Frontend：Next.js + Server Components 還是繼續 Vite SPA？~~ **已決定：Next.js 15（App Router）+ Server Components**——省 admin/auth/SEO 樣板，搭配 §9 SEO funnel 策略需要 SSR。
- [x] ~~Ingest 用 Rust 還是 Go？~~ **已決定：Python（asyncio）**。爬蟲 lib 生態最豐富，且與 workers/api 共用 pmi-core 省維護。
- [x] ~~ClickHouse 是 P0 就上還是 P2 再加？~~ **已決定：P2+ 才加**。P0/P1 用 Timescale hypertable + Postgres OLTP，等 cohort 查詢 / backtest aggregation 撐不住才補 ClickHouse 或 Tinybird，見 §3.1。
- [x] ~~觀測 stack 選什麼？~~ **已決定：OTel SDK + Grafana Cloud free tier + Sentry**——見 §3.4。自託管 LGTM 是 P3+ 看合規 / 成本決定。
- [x] ~~Kafka / Redpanda 進場時機？~~ **已決定：P0/P1 不引入**，用 Redis Streams + 直接寫 Postgres。流量 / 多消費者真需要才上，見 §3.1。
- [ ] Index Marketplace 抽成 30% 是否合理？參考 App Store / OpenAI plugin 等慣例。
- [ ] SOC 2 觸發時機？Enterprise pilot 客戶要求才做，避免提早負擔。
- [ ] Polymarket API rate limit / ToS 是否允許商業重新分發資料？**必須在 P0 前釐清**。

---

## 14. Reference — 同工作區 Micah 相關檔案

啟動本專案前，重溫這些檔案的設計：

| 設計重點 | Micah 檔案 |
|---|---|
| Factor 定義 | `../micah-db/micah_db/models/constants.py` |
| Relevancy 權重 | 同上（`RELEVANCY_WEIGHTS`） |
| Bucket collapse (legacy file, renamed) | `../micah-job-executor/app/jobs/workflows/evaluate_contracts/bucket_collapser.py` (was `mutually_exclusive.py`; PR #15 2026-05-29 added noisy-OR + mean — ported to platform [`pmi_core/engine/bucket_collapser.py`](pmi-core/pmi_core/engine/bucket_collapser.py) 2026-05-30) |
| LLM factor evaluation | `../micah-job-executor/app/jobs/workflows/evaluate_contracts/factor_evaluator.py` |
| Source weight | `../micah-job-executor/app/jobs/workflows/score_index/source_weights.py` |
| Index calculator | `../micah-job-executor/app/jobs/workflows/score_index/index_calculator.py` |
| 三層 async fanout | `../micah-job-executor/app/jobs/_evaluate_shared.py` + `../micah-job-executor/app/jobs/update/war_index.py` |
| Playwright scraper 模式 | `../micah/server/app/services/playwright_base.py`、`../micah/server/app/services/robinhood/` |
| Region / world aggregation | `../micah-job-executor/app/jobs/workflows/war_index/` |

---

## 15. 現況（Current State — Micah legacy §15.1–§15.9 為 2026-05-29 snapshot；platform §15.10 為 2026-06-07 snapshot）

> 兩個並存系統，**未來方向 = 持續往 (2) 收斂**：
>
> 1. **§15.1–15.9 — Project Micah（LEGACY）**：`../micah/` · `../micah-db/` · `../micah-job-executor/`。
>    跑在 thewarindex.org production，文件留作 **reference / mine for patterns**。
>    **不再加新功能**；只做 prod 維運 / hotfix。
> 2. **§15.10 — Polymarket PMI Platform（CURRENT）**：`./`。
>    2026-05-23 起 P0 scaffold、2026-05-28 e2e 跑通、2026-05-29 senate-2026 PoC 探索（在 `../micah/server/scripts/` 因為要重用 Micah 的 Polymarket REST client；之後會搬進 `pmi-ingest/`）。
>    7 packages runnable（pmi-mcp 為 P3 stub）。
>
> 細節 TODO 不在這裡列，請看主清單 [`TODO.md`](TODO.md)（原 TODO-跑出來 / 跑得對 已於 2026-06-11 整併後刪除，git 留史）。
>
> §15.8「與設計差距」記錄的是 Micah ↔ §1–§14 設計目標的 gap；多數差距已在 §15.10 由 pmi_data_platform 補上，留著是為了「**從 Micah 看怎麼換掉**」的對位 reference。

### 15.1 三個 repo 一覽

| Repo | 角色 | Language / Runtime | 部署 |
|---|---|---|---|
| `../micah/` | API server（`server/`）+ 兩個 Vite SPA（`client/apps/main-site`, `client/apps/war-index`） | Python 3.11 / Node 20.19 | Render（web + static + 數個 cron）|
| `../micah-db/` | Shared schema 套件（SQLAlchemy + Alembic + DAO + utils），私有 GitHub package | Python 3.11 | 不部署，被另兩個 repo `pip install` |
| `../micah-job-executor/` | Worker 服務（FastAPI 觸發 + Supercronic cron） | Python 3.11 | Render（Docker：web + cron worker）|

### 15.2 Tech stack（實際使用中）

- **Backend**：FastAPI 0.115、SQLAlchemy 2.0（async）、asyncpg、Alembic、Pydantic、httpx
- **Frontend**：Vite 7 + React + TypeScript（**目前是 Vite SPA，非 Next.js**；對應 §13 open question）
- **DB**：單一 PostgreSQL（Render managed, `pro-4gb`），含 **pgvector**；**無 Timescale、無 ClickHouse**
- **LLM**：OpenAI Chat + Batch API（async client）；**無 Anthropic、無本地小模型、無 tier 分層**
- **Scraping**：Playwright（Robinhood、Coinbase）+ BeautifulSoup
- **Worker**：Supercronic + Render cron；**無 Arq、無 Temporal、無 Kafka**
- **Auth**：Passlib bcrypt + python-jose JWT + Authlib OAuth
- **觀測**：Slack webhook + structured logging；無 APM

### 15.3 Data sources（已串接 9 個，非只有 Polymarket）

| Source | 取得方式 | 備註 |
|---|---|---|
| Kalshi | REST API | real-money |
| Polymarket | REST API | real-money；**目前無 WS、無 chain indexer、無 orderbook** |
| PredictIt | REST API | real-money |
| ForecastEx | REST API | real-money |
| Robinhood | Playwright scraper | real-money |
| Coinbase | Playwright scraper | real-money（crypto 價驗證）|
| Crypto | 直接 scraping | real-money |
| Metaculus | REST API | play-money |
| Manifold | REST API | play-money |

對應 §5 設計：**Polymarket-only 深度訊號（orderbook depth、trade flow、trader cohort、UMA、conditional tree）目前一個都沒有**。

### 15.4 DB schema 現況（`../micah-db/micah_db/models/`）

主要 table：`contract`、`contract_price`、`contract_evaluation`（8 個 factor 寫死）、`country`、`region`、`topic`、`index`、`index_score`、`hourly_contract_prices`、`hourly_index_scores`、`contract_embedding`（pgvector）、`peer_group`、`pmi_configuration`。

Factor / weight 寫死於 [`constants.py`](../micah-db/micah_db/models/constants.py)（對應 §4 要改成 declarative DSL 的部分）。

### 15.5 Jobs 現況

**`../micah/server/app/jobs/`（Render cron 直接觸發）**

| Job | 排程 | 狀態 |
|---|---|---|
| sync_contracts_api | Daily 09:00 UTC | active |
| sync_contracts_scraper | Daily 09:00 UTC | active（Docker / Playwright）|
| generate_embeddings | Daily 10:00 UTC | active |
| update_war_index | — | **disabled (commented out)** |
| update_pmi_score_hourly | Every 2h :40 | active |
| update_pmi_probability_hourly | Every 2h :50 | active |
| refresh_keywords | Monthly 1st 08:00 | active |
| update_check_contracts_api | Daily 09:30 UTC | active |
| update_peer_groups | Daily 12:00 UTC | disabled |
| update_peer_groups_hourly | Hourly | active |

**`../micah-job-executor/app/jobs/`（Supercronic 觸發）**

| Job | 排程 |
|---|---|
| `daily`（= generate-embeddings + update-war-index 串接） | `0 10 * * *` |
| 其他（`generate-embeddings`、`update-war-index`、`update-midterm-election-tags`） | manual / 透過 `daily` |

### 15.6 LLM 評估現況

- 單一 tier：Batch evaluator（[`batch_evaluator.py`](../micah-job-executor/app/jobs/workflows/evaluate_contracts/batch_evaluator.py)）→ Factor evaluator（[`factor_evaluator.py`](../micah-job-executor/app/jobs/workflows/evaluate_contracts/factor_evaluator.py)）→ 寫進 `contract_evaluation`。
- 沒有 embedding pre-filter、沒有 agentic deep eval、沒有 prompt-as-code with hash。
- 對應 §6 設計的「四層 LLM」**目前只實作了類似 Tier 1**。

### 15.7 Frontend 現況

- 兩個獨立 Vite app（monorepo workspace）：
  - `main-site` (port 5175)：landing + admin + auth
  - `war-index` (port 5174)：country / region PMI dashboard
- 無 chat UI、無 index builder、無 backtest playground——對應 §3 / §8 的 frontend 都尚未存在。

### 15.8 與設計差距（明確盤點）

| 設計章節 | 設計目標 | 現況 | 差距 |
|---|---|---|---|
| §3 | Python asyncio ingest + 單一 Postgres (Timescale + pgvector) + Redis + R2 + OTel/Grafana | Python REST poller + 單一 Postgres，無 Redis / R2 / OTel | 擴充現有 Python client 加 WS/chain；起 Redis + R2 + OTel collector |
| §4 | Declarative PMI DSL + versioning + backtest | 8 factor 寫死 in code | 全要重做 |
| §5 | Polymarket WS / chain / orderbook / cohort | 只有 Polymarket REST | 全要重做 |
| §6 | Tier 0/1/2/3 LLM | 單一 batch tier | 加 3 層 |
| §7 | Arq + Temporal | Render cron + Supercronic | 換 worker stack |
| §8 | MCP server + tools | 只有 REST | 全新 |
| §9 | 多 tier 訂閱 + B2B | 單租戶內部使用 | 商業層全新 |
| §10 | 5 個獨立 service（ingest/workers/api/mcp/web），全 Python | 3 個 repo（server / job-executor / shared db） | 拆分 + 新增 |

### 15.9 啟動 Polymarket PMI Platform 時的搬運清單

可以「**抄走 / 改寫**」的 Micah 既有成果：

- `../micah-db/micah_db/models/constants.py` — FACTORS、RELEVANCY_WEIGHTS、REGION_MAPPING、MIN_CONTRACTS 這些常數可作為新 DSL 的 default values。
- ~~`../micah-job-executor/app/shared/workflows/evaluate_contracts/mutually_exclusive.py`~~ → 已搬：Micah 2026-05-29 PR #15 把該檔重命名 `bucket_collapser.py` 並加上 noisy-OR (calendar) + mean (multi-year) 算法；platform 已於 2026-05-30 落地為 [`pmi-core/pmi_core/engine/bucket_collapser.py`](pmi-core/pmi_core/engine/bucket_collapser.py)（CORR-1.4 done）。
- `../micah-job-executor/app/jobs/workflows/score_index/source_weights.py` — 分位數權重邏輯保留，但分位對象改為 orderbook depth / cohort。
- `../micah-job-executor/app/shared/services/async_openai.py` — async LLM client（含 Batch API）pattern 可直接重用。
- `../micah/server/app/sources/polymarket.py` — Polymarket REST 既有 client 是 P0 起點。
- Alembic migration 流程、pgvector embedding 模式可整套保留。

**不適合搬**的：Render cron 結構、Playwright scrapers（新平台 Polymarket-only 不需要）、寫死的 war index 邏輯、單體 server/job-executor 分法。

**刻意走不一樣路線的——contract → topic 分類**：Micah 用 **LLM 月度自動生成 keyword pool**（`refresh-keywords` job 叫 LLM 對每個 topic 列詞 → 存 DB → Python in-memory `\b(...)\b` regex 比對 contract title；embedding 只用在 peer-group 跨家去重，不在分類路徑上）。Platform 改走**人寫 YAML keyword + Postgres word-boundary regex**（[`engine/selector.py`](pmi-core/pmi_core/engine/selector.py)，`\m...\M`，2026-05-31 從 `ilike(%term%)` 改過來），補上 `SemanticSelector`（pgvector cosine vs anchor）— **2026-06-06（CORR-3.6）已落地並真查 pgvector**（預設 Ollama nomic embedding，本地免費），但現役 index def 尚未宣告 `type: semantic` anchor，故對它們暫為 dormant。差異：

| | Micah | pmi-platform |
|---|---|---|
| Keyword 來源 | LLM 月補（自動） | 人寫 YAML（sha256 鎖進 `core_index_definitions`） |
| 匹配 | Python `\b...\b` | Postgres `\m...\M` |
| Embedding 角色 | peer-group 跨家去重 | semantic selector（P2，**分類用**） |
| Audit | 追當月 keyword 版本 | YAML sha256 + SCD2 自動還原 |

**為什麼不照搬**：（a）LLM 自動 keyword 會莫名長出髒詞（Micah 也踩過——譬如某月生出「strike」就會抓到 Counter-Strike），但 audit 要追當月版本很麻煩；（b）pmi-platform 商業承諾是 §4「使用者可定義、可版本控、可分享」的 declarative index，**keyword 是 user-facing input** 而非系統內部 artifact，LLM 自動產 user 看不懂為何漂；（c）走 semantic selector 比 LLM-月補-keyword 更能處理 synonyms / plurals / 語境，後者只是中間態。

`refresh-keywords` job、keyword DB schema、`peerSimilarity` prompt **都不搬**。但 Micah 的 embedding 生成 pipeline（`generate-embeddings` job + `text-embedding-3-small` client）將來做 `SemanticSelector` 時可以抄過來，從 contract embedding 改成 market embedding 即可。

### 15.10 Polymarket PMI Platform 已落地（2026-06-07 snapshot）

> **較新進度看本檔頂部的「2026-06-11 EC2 session 對帳」**——下表多個 ❌/🟡 已被那輪推進（真實多源 ingest 上線、GPU 本地 LLM、vector DB 啟動、Tier 0 經 `semantic-war-demo` 實際作用）。下表維持 2026-06-07 原貌作對位 reference。
>
> 完整 TODO 看主清單 [`TODO.md`](TODO.md)（原主題式 TODO 檔已整併刪除，細項 ship 紀錄在 git history）。這裡只列**架構層面的已落地**事實，作為對 §3 ~ §10 設計目標的對位表。

| 設計 § | 設計目標 | 落地狀態 | 證據 / 入口 |
|---|---|---|---|
| §3.1 Storage | 單一 Postgres + pgvector + Timescale（hypertable P2+） | ✅ Postgres + pgvector 已上；hypertable migration 待 CORR-4.5 | `pmi-core/alembic/versions/20260520_0001_initial.py` |
| §3.2 On-demand 計算 | Redis cache + Arq enqueue | ❌ Arq 待 CORR-4.6；目前走 supercronic cron + `run-job score-all` | `pmi-workers/cron/crontab` |
| §3.3 Source health | `audit_source_health` table + `/sources/health` 端點 | ✅ | `pmi-ingest/pmi_ingest/pollers/polymarket_rest.py::record_poll` |
| §3.4 觀測 | OTel + Grafana + Sentry | ❌ 全待 CORR-7.x | — |
| §4 PMI as declarative | YAML → IR → engine；SCD2 version + sha256 lineage | ✅ 5 個 YAML index def（含 senate-2026 兩個變體）；`load_index_def()` 回 (IR, raw_text, sha256)；`core_index_definitions` SCD2 落 DB；✅ CORR-1.6 BoP Poisson-binomial（`engine/seat_distribution.py`，2026-05-31 完成）；🟡 senate board UI step-1 已接（`/indexes/{id}/senate-board`，SHIP-2.5a 2026-05-31），per-race state/matchup 對應待 CORR-1.3 step-2 | `pmi-core/pmi_core/dsl/ir.py`、`pmi-core/pmi_core/index_defs/*.yaml`、`pmi-core/pmi_core/engine/seat_distribution.py` |
| §4 audit lineage | `evaluation` / `index_score` immutable + component_evaluation_ids[] | ✅ append-only `audit_evaluations` + `ts_index_scores.component_audit_ids[]` 全有 lineage | `pmi-core/alembic/versions/` |
| §5 Polymarket 訊號 | orderbook depth, WS trade, chain cohort, UMA, conditional tree | 🟡 **scaffold landed 2026-06-01**：CORR-4.3 ✅ CLOB orderbook depth (mid/spread/depth_1pct/5pct + top-25 raw levels → `ts_orderbook_snapshots`)；CORR-3.4 ✅ aggregator quantile-weights by `bid_depth_1pct+ask_depth_1pct`（fallback `volume_24h`，Micah-ladder 0.90/1.00/1.20/1.50，2026-06-02）；CORR-4.1 🟡 WS trade feed (CLOB `market` channel → `ts_trades`，auto-reconnect)；CORR-4.2 🟡 Polygon chain indexer (CTF Exchange + ConditionalTokens + UMA OO V2 events，需付費 RPC)；CORR-4.4 🟡 UMA dispute → `core_markets.chain_resolution`（Gamma-only 路徑可用）；CORR-4.7 🟡 Kalshi parity (orderbook landed、WS 待 Kalshi side enable streaming scope)。**剩**：對 mainnet RPC 跑真 smoke | `pmi-ingest/pmi_ingest/{pollers/polymarket_clob.py, streams/polymarket_ws.py, chain/polygon_indexer.py, chain/uma_resolver.py}`、`pmi-core/pmi_core/engine/aggregator.py::_liquidity_weights` |
| §6 Tier 0/1/2/3 LLM | embedding pre-filter / cheap factor / agentic / periodic | 🟡 **Tier 0 ✅ 落地**（2026-06-06 CORR-3.6+5.1，commit `02318f0`/`1174e33`）：`embed-markets` job 寫 `vec_market_embeddings`（預設 **Ollama nomic**，本地免費）、`pipeline._tier0_prefilter` 在 factor LLM 前用 cosine floor cull、`SemanticSelector` 真查 pgvector — 但**只在 index def 宣告 `type: semantic` anchor 時啟動，現役 5 個 index 都沒 anchor → dormant**。**Tier 1 ✅ 真 OpenAI**（gpt-4o-mini，cost tracking、tenacity retry、fallback-to-stub）；**多 provider 並存**：`get_provider()` 前綴路由 — `gpt-*`/`openai/*`/`local/*`/`self-hosted/*`→OpenAIProvider（全域 `PMI_LLM_BASE_URL`），`ollama/*`→OllamaProvider（獨立 `PMI_OLLAMA_BASE_URL`）。Tier 2/3 待 CORR-5.6/5.2 | `pmi-core/pmi_core/{engine/pipeline.py,engine/selector.py,llm/*}`、`pmi-workers/pmi_workers/jobs/embed_markets.py` |
| §6 prompt as code | git markdown + sha256 + DB row | ✅ 7 個 markdown prompt template、`core_prompts` append-only、MLflow Prompt Registry 鏡像 | `pmi-core/pmi_core/prompts/factors/*.md`、`mlflow_client.py::_ensure_prompt` |
| §7 Arq + Temporal | 雙 worker 混合 | ❌ supercronic only；Arq 上線是 CORR-4.6、Temporal 是 CORR-8.1 | `pmi-workers/cron/crontab` |
| §8 MCP | Tier A/B/C tools | ❌ `pmi-mcp/` 仍是 stub；SHIP-2.3 待做 | `pmi-mcp/` |
| §10 Repo 拆分 | 5+ service Python monorepo | ✅ 7 個 package（多了 `pmi-demo` + `mlflow`），全 Python | `./`（本目錄） |

**P0 e2e 已可 demo**（2026-05-28）：`docker compose --profile pmi up` → migrate → seed 13 markets + 5 index defs → `pmi-workers run-job score-all`（5 indexes 全 success、96 audit_evaluations 全帶 MLflow run_id）→ pmi-api `/indexes/<id>/score` 200 → pmi-web SSR 5 張 card + dashboard 渲分數 + history。

**已知環境問題（僅限 reid 家用網路，EC2 上不存在）**：Reid **本機**ISP（HiNet）DNS 劫持 `gamma-api.polymarket.com` 回攔截頁，故在他家用機器要 `POLYMARKET_USE_MOCK=true` mock fixture mode（SHIP-0.5）或用 `../micah/server/scripts/polymarket_local.py` 的 1.1.1.1 DNS monkeypatch。**2026-06-11 起：dev 跑在 AWS EC2，真 Polymarket API 直接可達**（gamma + clob），故 `POLYMARKET_USE_MOCK=false`，mock 模式在 EC2 上不需要。compose 仍把 ingest 容器 DNS 設 `1.1.1.1`/`8.8.8.8` 當 robustness 保險。

**Senate 2026 PoC（2026-05-29 探索）**：在 `../micah/server/scripts/` 下三個 standalone script 證明了：
1. event-first scraping 比全表掃描快 ~109× — 暗示 ingest 也可加「query-scoped poller」mode（→ SHIP-3.7）
2. BoP 互斥事件需要新的 `formula: partition_sum` aggregator（→ CORR-1.6）
3. seat-count exact + range bucket 算 E[seats] + stdev 是另一種 PMI 變體（→ CORR-1.7）
4. CLOB `/prices-history?market=<token>&interval=max` 可拿過去 30 天每 10 min 的價格 — 可用於 backtest backfill（→ CORR-3.10）
5. senate「board」UI（views-senate.jsx 原型）已規劃 port 進 pmi-web production，配新 `/indexes/{id}/senate-board` 端點（→ SHIP-2.5，吃 CORR-1.6 的 per-band counts + E[seats]）

詳細實作 + 結論寫在 `../micah/server/scripts/{polymarket_local,scrape_polymarket_by_query,senate_2026_pmi}.py` 的 docstring 裡。
