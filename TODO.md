# TODO — 平台現役主清單（2026-06-11 整併；同日完成大批次後更新）

> **這是唯一的 active TODO 入口**。2026-06-11 把四本主題式 TODO 裡還開著的項目整併到這裡；
> 其中三本（跑出來 / 跑得對 / 真實e2e）**已刪除**——細節在 git history
> （`git show aa45741:<檔名>` 調閱）；[`TODO-next-version.md`](TODO-next-version.md)（multigraph 設計稿）保留。
> HTML 版見 [`docs/todo-bilingual.html`](docs/todo-bilingual.html)。新增/完成項目時：**改這裡 + 同步 HTML**。
>
> **前情**：平台跑在單台 AWS EC2（Tesla T4）——真實 6-venue ingest（~32 萬 market）、GPU 本地 LLM、
> vector DB（Tier 0 + SemanticSelector live）、T1 並發 factor eval、hourly + drift-triggered 真實 scoring、
> **Postgres job queue + durable workflow**（cron→worker、on-demand score、WS-trigger re-eval、backtest——
> 2026-06-11 以無 Redis / 無 Temporal 的 Postgres 版落地）。本檔列的是**之後**的事。

---

## ❌ 已拿掉（2026-06-11 reid 決策，不再是 TODO）

| 原編號 | 內容 | 拿掉理由 |
|---|---|---|
| ~~SHIP-1.8~~ | 真 AWS production infra apply（Caddy TLS / GHCR / Secrets Manager / systemd / CloudWatch） | 現行 EC2 dev compose 即為部署形態；`deploy/` 物件保留，未來要 prod 化再撿回 |
| ~~CORR-7.2~~ ~~7.3~~ ~~7.4~~ ~~7.5~~ | OTel / Prometheus / Grafana dashboards / Slack alert 整套觀測 | 暫以 structured logs + `/sources/health` + MLflow 為觀測面；要上再撿回 |
| ~~CORR-0.1 的 Anthropic provider 子項~~ | Anthropic LLM provider | provider 抽象已支援 OpenAI-compatible endpoint（`PMI_LLM_BASE_URL` / `ollama/*` / `local/*`），夠用 |

## ✅ 已完成（2026-06-10 ~ 06-11 EC2 批次；驗證數字見 git log 與 HTML 版）

- **基礎**：多源 ingest 上線（6 venue ~32 萬 market；kalshi 節流修復）· GPU ollama（auto-detect T4）·
  vector DB 啟動（38.9k embeddings + semantic-war-demo）· **T1 並發 factor eval**（~2x on 單 T4）
- **CORR-3.12** cross-venue：IR `venues:` + selector/embed 通用化（驗：war+kalshi 多選 67 個）
- **CORR-2.6 / T4** selector cap 可覆寫 + 飽和告警（驗：house 原默默丟 527 個 → 1027 全選）
- **CORR-0.4 / T2** cost roll-up（隨 T1 落地，已驗證）
- **CORR-5.2** Tier 3 drift re-eval job + 15-min cron（首跑命中 17.5 點漂移）
- **CORR-5.6** Tier 2 agentic 在 ollama 真跑驗證（tool 呼叫 + trace）
- **CORR-5.7** 低信心升級 Tier 2（兩筆入 audit、tier2 聚合優先）
- **CORR-5.8** factor disagreement → `breakdown.disagreement`（真資料標 5 個經典模式）
- **CORR-5.9** `ensemble/<m1>+<m2>` 投票 provider（GPU 雙模型真跑）
- **CORR-0.5 / 5.4** `_LLMGuard` budget cap + circuit breaker（行為測試通過）
- **CORR-5.3** Batch API submit/poll jobs + `core_llm_batches`（submit 端真資料 dry-run 驗證；**poll/ingest 未 e2e**，列下方 §2）
- **CORR-4.6（改 Postgres 版，無 Redis）** job queue 落地：`core_jobs`（SKIP LOCKED claim +
  LISTEN/NOTIFY + dedupe + retry/backoff + stale 回收）、`pmi-workers worker` 長駐 loop（compose `pmi-worker`）、
  cron → enqueue（crontab 全改 `pmi-workers enqueue`）、§3.2 on-demand（`GET /score?max_age_s=&wait_s=`
  202+job_id / 同步等、`POST /score/refresh`、`GET /jobs/{id}`）、WS-trigger（trade on component market →
  `reeval-market` → per-index score fan-out，三層 storm control：debounce/dedupe/freshness floor）。
  驗證：queue 行為測試 6/6、API 測試 46/46、e2e NOTIFY 喚醒 13ms、500-market 真 tick 9s、
  reeval-market 真資料命中 semantic-war-demo（fresh → 正確 skip）、WS consumer 載入 811 component markets
- **CORR-8.1（改 Postgres 版，無 Temporal）** durable workflow：`core_workflow_runs/steps` step checkpoint +
  queue retry replay（已完成 step 直接吃 cache）；旗艦 = **backtest workflow**（每 replay 點一個 durable step，
  cached evals + 歷史價格，$0、不寫 ts_index_scores）。驗證：workflow 測試 4/4（含 crash→resume 不重跑）、
  e2e 7-day backtest 7/7 steps + CSV。真 Temporal 等到需要 signals/timers/multi-worker fan-out 再回頭
- **CORR-6.5** score 寫入排程化：hourly cron→queue + 15-min drift + WS-trigger + on-demand 四路都進同一 queue（dedupe 防疊）
- **SHIP-3.4** Backtest CLI/API：`pmi-workers backtest <index> --days 90 --wait` 直接吐 CSV；
  API `POST /indexes/{id}/backtest` → `GET /workflows/{id}/csv`（早期天數受價格快照回填深度限制，誠實留空）

---

# 🔵 尚未做（active）

## 1. 🔴 高槓桿

| # | 項目 | 為什麼 |
|---|---|---|
| **SHIP-2.3** | **pmi-mcp：Tier A read tools ×5**（`pmi.list_indexes / get_index / get_score / get_history / get_group`） | 「AI native」招牌；`pmi-mcp/` 仍 stub。外部 agent 一句話拿任何 index 分數。**唯一剩下的高槓桿項** |

## 2. 🟡 LLM 分層尾巴

| # | 項目 | 摘要 |
|---|---|---|
| **CORR-5.3**（剩） | Batch API **poll/ingest 端 e2e 驗證** — code-complete，需真 `OPENAI_API_KEY` + gpt-* factor binding 跑一輪真 batch 回收 |
| **CORR-5.6**（剩） | Tier 2 agentic 加 **web search tool**（目前 tool 只有本地深度訊號 `recent_trades`） |
| **CORR-5.10** | Model promotion calibration / drift detection（換 LLM 後分數漂移是否在預期內） |
| **CORR-5.11** | Prompt namespace 統一（`core_prompts` vs MLflow 命名） |
| **CORR-0.1**（剩） | structured output（`response_format=json_schema`，目前 json_object）+ self-consistency / retry-on-low-confidence |

## 3. 🟡 深度訊號（scaffold 已落地，剩真實 smoke / 演算法）

| # | 項目 | 摘要 |
|---|---|---|
| **CORR-4.1**（剩） | WS trade feed 真實長跑 smoke + momentum 訊號消費 |
| **CORR-4.2**（剩） | Polygon chain indexer 對 mainnet 真跑（需付費 RPC）→ trader cohort（whale/retail） |
| **CORR-4.4**（剩） | UMA dispute 全路徑驗證（Gamma-only 路徑已可用） |
| **CORR-4.7**（剩） | Kalshi WS（待 Kalshi 開 streaming scope） |
| **CORR-3.5** | `core_markets.volume_24h` 從 Gamma `volumeNum` 補寫 |
| **CORR-8.7** | Cross-market arbitrage signal（互斥但 Σ≠1 → 信號劣化；與 NEXT-2.4 coherence 相關） |

## 4. 🟡 Worker / Storage 演進

> ~~CORR-4.6~~ ~~CORR-6.5~~ ~~CORR-8.1~~ 已於 2026-06-11 以 **Postgres 版**落地
> （無 Redis / 無 Temporal——`core_jobs` queue + `core_workflow_runs/steps` durable workflow，
> 見上方 ✅ 清單）。Tier 2 agentic 排進 workflow 的部分可後續再掛（escalation 已 inline 於 pipeline）。

| # | 項目 | 摘要 |
|---|---|---|
| **CORR-4.5** | TimescaleDB hypertables（`ts_price_snapshots` / `ts_index_scores` / `audit_source_*`；`core_jobs` 完結列的定期清理也可順手掛這裡） |
| **CORR-8.2** | ClickHouse / Tinybird（等 Timescale 撐不住；P2+） |
| **CORR-8.3** | Polymarket Subgraph（歷史回放補完；P2+，也會把 backtest 早期空點補實） |

## 5. 🟡 Correctness 細項

| # | 項目 | 摘要 |
|---|---|---|
| **CORR-1.1** | Aggregation formula expression evaluator（被 NEXT-3.x Formula Registry 取代亦可） |
| **CORR-1.3**（剩） | senate board step-2：per-race `state`/`matchup`/`incumbent` 完整對應（`prob_by_state` 已有 16 州） |
| **CORR-1.5** | election factor prompt v2（真 LLM 可用版 + few-shot；T9 同源） |
| **CORR-2.1** | `WeightingSpec` IR 補 §4 欄位（`boost_threshold`、trader_cohort） |
| **CORR-2.2** | Multi-tenant `owner_id`/`tenant_id` 預留 column（§9 invariant） |
| **CORR-2.4** | `ts_trades` / `ts_orderbook_depth` schema 預留 |
| **CORR-2.5** | `ts_price_snapshots` unique constraint（poller retry 防重） |
| **CORR-3.2** | CLI 升 public import（`_ensure_index_definition` → public；`llm_batch.py` 現在也 import 私名，順手一起） |
| **CORR-3.7** | `audit_pipeline_runs.metadata_json` 沒人寫——刪 column 或真用 |
| **T10** | 容器時鐘 skew（timestamp 偏移；資料正確但對不準） |
| house-seats null | `us-house-2026-republican-seats` 真實資料下 collapse 後 0 component——查 seat_projection 幾何 |

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
| ~~SHIP-3.4~~ | ✅ 2026-06-11 隨 CORR-8.1 落地（`pmi-workers backtest --wait` / `GET /workflows/{id}/csv`） |
| **SHIP-3.2** | `pmi-core diff <index_id> <v1> <v2>`（§4 diff view 承諾） |
| **SHIP-3.5** | 更多 baseline index（fed-rate / crypto-cycle；cross-venue 已通，可直接做多 venue 版） |
| **SHIP-2.1** | pmi-web `/groups/[slug]` 頁（Election 2026 suite 4 張卡） |
| **SHIP-2.2** | explain breakdown 區塊（`/explain` 已修好，接 UI；disagreement / llm_guard 也可一併呈現） |
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
含 `-seats` 真吐席次的 NEXT-3.3/3.5）→ Edge-Proposer agent（NEXT-4.x）。Phase 0（Formula Registry）
無 edge 依賴、最低風險，可先動。

## 9. 💼 商業 / 長期（P2+，記著別忘）

CORR-8.4 Index Marketplace · CORR-8.5 MCP Pro / Embedding API / Data export · §13 open questions
（Polymarket ToS 商業重分發 **P0 前必釐清**、Temporal self-host vs Cloud、Marketplace 抽成）。
