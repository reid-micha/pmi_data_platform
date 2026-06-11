# TODO — 平台現役主清單（2026-06-11 整併）

> **這是唯一的 active TODO 入口**。2026-06-11 把四本主題式 TODO 裡**還開著的項目**整併到這裡，按優先序重排。
> 其中三本（跑出來 / 跑得對 / 真實e2e）**已刪除**——每項的完整設計、實作計畫、驗收條件在 **git history**
> （最後存在於 commit `aa45741`，`git show aa45741:TODO-跑得對.md` 可調閱）；
> [`TODO-next-version.md`](TODO-next-version.md)（typed multigraph 設計稿，未動工）保留。
> HTML 版見 [`docs/todo-bilingual.html`](docs/todo-bilingual.html)。新增/完成項目時：**改這裡 + 同步 HTML**。
>
> **前情**：平台已跑在單台 AWS EC2（Tesla T4）上——真實 6-venue ingest（~32 萬 market）、GPU 本地 LLM
> （ollama llama3.2）、vector DB（pgvector + Tier 0 + SemanticSelector）、T1 並發 factor eval、
> hourly 真實 scoring。e2e 鏈全通。本檔列的是**之後**的事。

---

## ❌ 已拿掉（2026-06-11 reid 決策，不再是 TODO）

| 原編號 | 內容 | 拿掉理由 |
|---|---|---|
| ~~SHIP-1.8~~ | 真 AWS production infra apply（Caddy TLS / GHCR / Secrets Manager / systemd / CloudWatch） | 現行 EC2 dev compose 即為部署形態；`deploy/` 物件保留，未來要 prod 化再撿回 |
| ~~CORR-7.2~~ ~~7.3~~ ~~7.4~~ ~~7.5~~ | OTel / Prometheus / Grafana dashboards / Slack alert 整套觀測 | 暫以 structured logs + `/sources/health` + MLflow 為觀測面；要上再撿回 |
| ~~CORR-0.1 的 Anthropic provider 子項~~ | Anthropic LLM provider | 不需要——provider 抽象已支援 OpenAI-compatible endpoint（`PMI_LLM_BASE_URL` / `ollama/*` / `local/*`），夠用 |

---

## 1. 🔴 高槓桿（下一步從這裡挑）

| # | 項目 | 為什麼 / 條件 | 細節 |
|---|---|---|---|
| **SHIP-2.3** | **pmi-mcp：Tier A read tools ×5**（`pmi.list_indexes / get_index / get_score / get_history / get_group`） | 「AI native」招牌；`pmi-mcp/` 仍 stub。外部 agent 一句話拿任何 index 分數 | 細節:git history（跑出來 §2）|
| **CORR-3.12** | **cross-venue 進 pipeline**：`embed_markets.py` + `engine/selector.py` 拿掉 `venue='polymarket'` 硬篩，改 per-index 可宣告 venues | 已 ingest 的 kalshi 8 萬 / manifold 18 萬 / forecastex 等全 dormant；§11 MVP 多源 parity 的必經之路。動 scoring 語意——要配 golden regression | 細節:git history（跑得對 §3,2026-06-11 新增）|
| **CORR-2.6 / T4** | **selector `.limit(500)` 可覆寫**（config / per-index cap） | 真實資料下 war/house/senate/semantic 多個 index 已撞 cap，**正 silently 漏資料** | 細節:git history（跑得對 §2）|
| **CORR-0.4 / T2** | **cost roll-up 到 `audit_pipeline_runs`**（目前 pipeline-level cost 靠 SUM 子 row） | 計費 / 成本可見性；半天 | 細節:git history（跑得對 §0）|

## 2. 🟡 LLM 分層（§6 四層的後段；Tier 0/1 已落地）

| # | 項目 | 摘要 |
|---|---|---|
| **CORR-5.3** 🔥 | Batch API integration（搬 Micah `batch_evaluator.py`）— nightly 半價 recompute |
| **CORR-5.6** | Tier 2 agentic deep eval（帶 web search / 讀 resolution criteria，reasoning trace 入 audit） |
| **CORR-5.2** | Tier 3 週期 re-eval trigger（價格漂移 > X% → 重算單一 market） |
| **CORR-5.7** | Tier 1 → Tier 2 升級條件（信心 < X / factor 矛盾 / 資料稀疏） |
| **CORR-5.8** | Factor disagreement detection（如 `directly_about_war=1` 但 `armed_conflict=0`） |
| **CORR-5.9** | Multi-model voting / ensemble |
| **CORR-5.10** | Model promotion calibration / drift detection（換 LLM 後分數漂移是否在預期內） |
| **CORR-5.11** | Prompt namespace 統一（`core_prompts` vs MLflow 命名） |
| **CORR-0.1**（剩） | structured output（`response_format=json_schema`）+ self-consistency / retry-on-low-confidence（~~Anthropic provider~~ 已拿掉） |
| **CORR-0.5**（剩） | account-wide circuit breaker + cost budget enforcement（與 CORR-5.4 重疊） |
| **CORR-5.4** | Cost budget enforcement：每 tick 預算 $X 超過停 + alert |

## 3. 🟡 Polymarket / Kalshi 深度訊號（§5；scaffold 多已落地，剩真實 smoke / 演算法）

| # | 項目 | 摘要 |
|---|---|---|
| **CORR-4.1**（剩） | WS trade feed 真實長跑 smoke + momentum 訊號消費 |
| **CORR-4.2**（剩） | Polygon chain indexer 對 mainnet 真跑（需付費 RPC）→ trader cohort（whale/retail） |
| **CORR-4.4**（剩） | UMA dispute 全路徑驗證（Gamma-only 路徑已可用） |
| **CORR-4.7**（剩） | Kalshi WS（待 Kalshi 開 streaming scope） |
| **CORR-3.5** | `core_markets.volume_24h` 從 Gamma `volumeNum` 補寫 |
| **CORR-8.7** | Cross-market arbitrage signal（互斥但 Σ≠1 → 信號劣化） |

## 4. 🟡 Worker / Storage 演進

| # | 項目 | 摘要 |
|---|---|---|
| **CORR-4.6** | Arq + Redis：cron → worker + on-demand score（WS 觸發 single-market re-eval） |
| **CORR-6.5** | Score 寫入排程化（依賴 CORR-4.6） |
| **CORR-4.5** | TimescaleDB hypertables（`ts_price_snapshots` / `ts_index_scores` / `audit_source_*`） |
| **CORR-8.1** | Temporal（durable backtest / Tier 2 agentic；P2+） |
| **CORR-8.2** | ClickHouse / Tinybird（等 Timescale 撐不住；P2+） |
| **CORR-8.3** | Polymarket Subgraph（歷史回放補完；P2+） |

## 5. 🟡 Correctness 細項

| # | 項目 | 摘要 |
|---|---|---|
| **CORR-1.1** | Aggregation formula expression evaluator（`expected_count = Σ P_i × outcome_i` 等） |
| **CORR-1.3**（剩） | senate board step-2：per-race `state`/`matchup`/`incumbent` 完整對應（`prob_by_state` 已有 16 州） |
| **CORR-1.5** | election factor prompt v2（真 LLM 可用版 + few-shot；T9 同源） |
| **CORR-2.1** | `WeightingSpec` IR 補 §4 欄位（`boost_threshold`、trader_cohort） |
| **CORR-2.2** | Multi-tenant `owner_id`/`tenant_id` 預留 column（§9 invariant） |
| **CORR-2.4** | `ts_trades` / `ts_orderbook_depth` schema 預留 |
| **CORR-2.5** | `ts_price_snapshots` unique constraint（poller retry 防重） |
| **CORR-3.2** | CLI 升 public import（`_ensure_index_definition` → public） |
| **CORR-3.7** | `audit_pipeline_runs.metadata_json` 沒人寫——刪 column 或真用 |
| **T10** | 容器時鐘 skew（timestamp 偏移；資料正確但對不準） |
| us-house-seats null | `us-house-2026-republican-seats` 真實資料下 collapse 後 0 component——查 seat_projection 幾何 |

## 6. 🟡 Audit / Security（enterprise 底線）

| # | 項目 | 摘要 |
|---|---|---|
| **CORR-6.1** | API rate limiting enforce（`rate_limit_per_minute` 欄位已在，沒人 enforce） |
| **CORR-6.2** | Append-only DB 強制：`audit_*` REVOKE UPDATE/DELETE |
| **CORR-6.3** | `p95_latency_ms_24h` 真算 24h sliding window |
| **CORR-6.4** | `expected_records_24h` 用 7 天實際中位數 |
| **CORR-8.6** | SOC 2（enterprise pilot 客戶要求才做） |

## 7. 🟢 DX / UI

| # | 項目 | 摘要 |
|---|---|---|
| **SHIP-3.4** | Backtest CLI（一鍵 replay 90 天出 CSV）— 客戶 demo 必問 |
| **SHIP-3.2** | `pmi-core diff <index_id> <v1> <v2>`（§4 diff view 承諾） |
| **SHIP-3.5** | 更多 baseline index（fed-rate / crypto-cycle） |
| **SHIP-2.1** | pmi-web `/groups/[slug]` 頁（Election 2026 suite 4 張卡） |
| **SHIP-2.2** | explain breakdown 區塊（等 `/explain` 修好，CORR-3.3） |
| **SHIP-2.4** | error boundary + Suspense streaming（api 掛了整頁 500） |
| **SHIP-2.5(e)** | Senate board USA choropleth 前端（`prob_by_state` 後端已填） |
| **T5** | 真實 conditional-impact 矩陣（PMI Simulator 依賴網路現在是空的） |
| **T6** | 真 Brier（需 resolution-outcome 追蹤） |
| **T7** | 新 UI live fetch 取代 static `pmi-model.js` 快照 |
| **T8**（剩） | world/state 熱力圖接真資料（senate 部分已走 SHIP-2.5） |
| **T3**（剩） | keyword selector 假陽性精修（semantic 路徑已通，純 keyword index 仍髒） |

## 8. 🔮 Next Version — Typed Multigraph（整本未動工，刻意排 MVP 之後）

設計定稿在 [`TODO-next-version.md`](TODO-next-version.md)：`core_market_edges` 邊儲存（NEXT-1.x）→
圖建構 / collapse / coherence 投影（NEXT-2.x）→ **Formula Registry** 取代寫死 aggregator（NEXT-3.x，
含 `-seats` 真吐席次的 NEXT-3.3/3.5）→ Edge-Proposer agent(NEXT-4.x)。Phase 0（Formula Registry）
無 edge 依賴、最低風險，可先動。

## 9. 💼 商業 / 長期（P2+，記著別忘）

CORR-8.4 Index Marketplace · CORR-8.5 MCP Pro / Embedding API / Data export · §13 open questions
（Polymarket ToS 商業重分發 **P0 前必釐清**、Temporal self-host vs Cloud、Marketplace 抽成）。
