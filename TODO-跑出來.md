+ # TODO: 跑出來 (Ship-it)

> **目的**：把現在跑不起來 / demo 看不到 / 部署不上去 / DX 卡住的東西做到「能 demo 給人看」。
> **不負責**：分數正不正確、LLM 真不真、auth 嚴不嚴、long-term schema 對不對 — 那些去 [`TODO-跑得對.md`](TODO-跑得對.md)。
>
> **整合來源**：r3 `TODO.md`（已刪）+ `TODO-combined-seat-prediction.md`（已刪）+ 2026-05-27 chat 對話拆出的 A1-A4 / B1-B10。
> **最後更新**：2026-05-28（整合版 v4 — 第三輪 ship batch：env 整合 + mock ingest + real LLM 接通；見附錄 B）。

---

## 0. 進行中：Combined Senate/House Seat Prediction（demo plumbing）

> 第一個 election-class task。本節走完 = pmi-web landing 看得到 4 個新 index。分數是 stub 亂數，但 schema / pipeline / cron / UI 端到端通。**累計 ~半天**。

| # | Todo | 動作 | 改的檔案 |
|---|---|---|---|
| ✅ **SHIP-0.1** | 寫 2 個 factor prompt（A1） | placeholder 即可；stub LLM 不會 render | `pmi-core/pmi_core/prompts/factors/is-senate-race-2026-v1.md`、`is-house-race-2026-v1.md`、`republican-on-yes-v1.md`（多加 house 版本一致對稱） |
| ✅ **SHIP-0.2** | 寫 4 份 YAML index def（A2） | keyword + category selector；share 用 `formula: weighted_average_x_100`、seats 宣告 `formula: seat_projection_sum`（YAML 先到位；aggregator 落地見 CORR-2.x） | `pmi-core/pmi_core/index_defs/us-{senate,house}-2026-republican-{seats,share}.yaml`（4 份） |
| ✅ **SHIP-0.3** | 註冊 + 跑（A3） | `docker compose --profile pmi run --rm pmi-core migrate && seed`（13 markets + 5 index defs）→ `... run --rm pmi-workers run-job score-all`（`succeeded: 5, failed: 0`，96 audit_evaluations 都帶 mlflow_run_id） | — |
| ✅ **SHIP-0.4** | 驗證（A4） | `curl localhost:8001/indexes` 列出 5 個；`/indexes/<id>/score` 全部 200（war=49.03、house={75.23, 75.23}、senate={76.47, 76.47}）；`/indexes/<id>/score/history` 也通；landing `http://localhost:3030/` SSR 出 5 張 card；`/indexes/us-senate-2026-republican-share` dashboard 渲出 score + history chart | — |
| ✅ **SHIP-0.5** | **Mock ingest mode**（本機網路被 ISP DNS block `gamma-api.polymarket.com` 時用）：`POLYMARKET_USE_MOCK=true` → bypass HTTP，讀 `pmi-demo/fixtures/markets.json`、轉成 Polymarket Gamma 格式、走原 `_upsert_market`/`_write_price`/`audit_source_health` 路徑。**source name 維持 `polymarket-rest`** 所以 observability 拿到一樣的 shape；換 cloud 部署只要翻 flag = false。 | 半天 | 2026-05-28 對話「return 資料那段送 mock 用 conf 控制」 |
| ✅ **SHIP-0.6** | **Real LLM dispatch 接通**（CORR-0.1 / 0.2 / 0.3 / 0.4 / 0.5 部分完成）：`pmi_core.llm.{base,openai_client}` 抽象層、`render_prompt()` helper、`factor_evaluator` 對 `gpt-*` model_id dispatch 走真 OpenAI、retry / cost tracking / fallback-to-stub on error。Smoke：`directly_about_war` factor on `gpt-4o-mini-2024-07-18` 跑 5 markets，cost = $0.000350，rationale 寫進 `audit_evaluations.model_response.rationale`。 | 半天 | 2026-05-28 對話「.env 裡找 OPENAI_API_KEY 繼續跑 2」 |
| ✅ **SHIP-0.7** | **`.env` 單一 source of truth**：合併 5 個 per-service `.env` → `pmi_data_platform/.env`；docker-compose `env_file:` 全指向；pmi-core/api/ingest pydantic-settings 加 `parents[2]/.env` probe；per-service 留 `.env.example` 當 pointer + 加 `pmi_data_platform/.gitignore`。也修了 `openai_api_key` 沒套 `env_prefix="PMI_"` 的 alias bug（用 `validation_alias="OPENAI_API_KEY"`）。 | 1 小時 | 2026-05-28 對話「全部 env 都移到 pmi_data_platform/.env」 |

**不做的部分**（推到 [`TODO-跑得對.md`](TODO-跑得對.md)）：seat_projection formula、baseline、conditional bracket markets、bucket collapse、combined view UI、把更多 factor 接 real LLM（CORR-0.x 剩餘）。

**SHIP-0.1 / 0.2 落地附帶 fixture 擴充**：`pmi-demo/fixtures/markets.json` 從 6 筆加到 13 筆（補了 OH/AZ/NV senate、NY-17/CA-22 house、senate/house control 等 8 筆 2026 election markets），讓 dry-run 對新 YAML 有可見的 selector matches。

---

## 1. 部署 / Cloud（MVP M4）

> **狀態（2026-06-04 更新）**：SHIP-1.0（地端 docker e2e）完成；**R5 已決策 = 單台 AWS EC2 + docker compose + Caddy**（2026-06-04 single-EC2 launch plan）。
> 對應的 launch 實作（code + 全套 deploy 物件）已落地在 [`deploy/`](deploy/)，本機 docker compose 也已驗過 auth / ingest split / keys CLI / race-fix / LLM endpoint。
> **唯一還沒做的是「真的開 AWS 機器」那步**（沒有 AWS 帳號/box 可在此環境執行）——以 runbook + scripts 形式交付，待 reid 在有帳號的環境照 [`deploy/README.md`](deploy/README.md) 跑。
>
> **R5 決策結論**：選 **單台 EC2 t3.large（2 vCPU / 8 GB）+ gp3 100 GB EBS + Elastic IP**，Postgres 跑 container（RDS 是未來遷移）、Caddy 在 host 自動 Let's Encrypt（取代 ALB+ACM）。理由：最省、最自由、與既有 docker-compose 拓樸 1:1、enterprise SLA/VPC 需求未到。Render / Fly.io / Modal 的比較留在附錄 D 當紀錄。

| # | Todo | 估算 | 源 | 狀態 |
|---|---|---|---|---|
| ✅ **SHIP-1.0** | **地端 docker e2e 驗**（cloud 部署的前置）：postgres + mlflow + pmi-api + pmi-ingest + pmi-workers + pmi-web 六個 service 同時起 + 跑完整 migrate / seed / score-all / curl / SSR pipeline。確保 cloud 部署只是「同一組 image + 同樣的 env vars 換 host」 | 半天 | 2026-05-28 對話 | ✅ |
| 🟡 **SHIP-1.1** | ~~render.yaml / fly.toml~~ → R5 改單台 EC2：**`deploy/docker-compose.prod.yml`** 落地（GHCR image、postgres+pgvector、mlflow、pmi-api、5 個 ingest service、pmi-workers、pmi-web、caddy 共 11 service，`docker compose config` 驗過）。剩：在真 AWS 上 `systemctl start pmi` 拉起（待帳號） | 2 天 | M4 / P0-6 | 🟡 compose 好、AWS apply 待跑 |
| ✅ **SHIP-1.2** | `pmi-workers` 在 prod compose 是 always-on container（supercronic 讀 `/app/cron/crontab`，hourly `run-job hourly`）；ingest 拆成 5 個獨立 long-lived service（pm-rest / pm-clob / pm-history / kalshi-rest / kalshi-clob，profile `ingest`） | 半天 | P0-10 | ✅ |
| ✅ **SHIP-1.3** | Container registry：GitHub Actions [`.github/workflows/build-images.yml`](.github/workflows/build-images.yml) matrix build+push `pmi-core / pmi-api / pmi-ingest / pmi-workers / pmi-web / mlflow` 到 GHCR；tag = short git SHA + `latest`；pmi-web bake `NEXT_PUBLIC_PMI_API_URL` build-arg。prod compose pin `:${IMAGE_TAG}` | 半天 | M4 子項 | ✅ |
| ✅ **SHIP-1.4** | MLflow artifact 搬到 S3：prod compose 設 `MLFLOW_ARTIFACTS_DESTINATION=s3://${MLFLOW_S3_BUCKET}`，credentials 走 instance IAM role（boto3 自 IMDS 取）。剩：建 bucket（在 SHIP-1.x AWS apply 一起） | 半天 | §4.3 子項 | ✅ 配置好、bucket 待建 |
| ✅ **SHIP-1.5** | pgvector extension：prod 用 `pgvector/pgvector:pg16` image + [`deploy/db-init/00-extensions.sql`](deploy/db-init/00-extensions.sql)（`CREATE EXTENSION vector`）+ alembic 0001 已 `CREATE EXTENSION IF NOT EXISTS vector`（雙保險）；`01-mlflow-database.sql` 建 mlflow DB | 1 小時 | §4.3 | ✅ |
| ✅ **SHIP-1.6** | Secrets：[`deploy/scripts/fetch-secrets.sh`](deploy/scripts/fetch-secrets.sh) 開機從 AWS Secrets Manager（`pmi/prod/secrets` JSON）render `deploy/.env` + `kalshi.key`，由 [`deploy/systemd/pmi-env-fetch.service`](deploy/systemd/pmi-env-fetch.service) 在 `pmi.service` 前跑；`.gitignore` 加 `deploy/.env` / `deploy/.env.base`。non-secret 留 `deploy/.env.base.example` | 1 小時 | §4.3 | ✅ |
| ✅ **SHIP-1.7** | DNS + TLS：[`deploy/caddy/Caddyfile`](deploy/caddy/Caddyfile) 3 subdomain（`pmi.` → web、`api.pmi.` → api、`mlflow.pmi.` → mlflow + basic-auth）自動 Let's Encrypt；`.env.base` 對齊 `NEXT_PUBLIC_PMI_API_URL` / CORS。剩：Route 53 A record 指 Elastic IP（AWS apply） | 半天 | 2026-05-28 對話 | ✅ 配置好、DNS record 待設 |
| 📋 **SHIP-1.8** | **AWS infra apply（唯一待人工執行）**：開 EC2 t3.large + gp3 + Elastic IP + SG(80/443, SSM only) + IAM role + S3 bucket + Route 53 + Secrets Manager + Budgets，跑 [`deploy/scripts/bootstrap.sh`](deploy/scripts/bootstrap.sh) + bring-up runbook。完整步驟見 [`deploy/README.md`](deploy/README.md) | 1.5 天 | 2026-06-04 plan | 📋 待 AWS 帳號 |

---

## 2. User-facing demo surface（MVP M5）

> r3 已上 pmi-web，但功能薄；MCP 還是 0 行 code。

| # | Todo | 估算 | 源 |
|---|---|---|---|
| **SHIP-2.1** | pmi-web `/groups/[slug]` 頁：一頁顯示一組相關 index（demo 用：Election 2026 suite 顯示 4 張卡） | 2 天 | 對話 B8 / 新加 |
| **SHIP-2.2** | pmi-web `/indexes/[id]` 補 **explain breakdown** 區塊（cards-per-market），等 `/explain` 端點修好（`TODO-跑得對.md` CORR-3.3）後接 | 1 天 | P0-9 |
| **SHIP-2.3** | pmi-mcp 起手：實作 Tier A read tool 5 個（`pmi.list_indexes / pmi.get_index / pmi.get_score / pmi.get_history / pmi.get_group`），讓外部 agent 一句話拿到任何 index 分數 | 3-4 天 | M5 / P1-1 / 對話 B10 |
| **SHIP-2.4** | pmi-web `/`、`/indexes/[id]` 加 error boundary + Suspense streaming（現在 pmi-api 掛了整頁 500） | 半天 | P0-9 |
| **SHIP-2.5** | **Senate Board UI 併進 pmi-web**（把 `pmi-new-frontend/views-senate.jsx` 那塊席次盤面接真資料，production Next.js 15 / React 19，**非** Babel-standalone prototype）。子任務：(a) ✅ **後端 board endpoint**（2026-05-31，step-1 契約 + happy path）：`GET /indexes/{id}/senate-board` → `SenateBoardEnvelope{summary, data}`。**真實**欄位：`p_r_majority`/`p_d_majority`/`expected_r_seats`/`stdev_r_seats`/`counts`(7-band)/`d_secured`/`r_secured`/`tossups`/`n_contested` 由 CORR-1.6 `compute_seat_distribution` + `band_counts` 算；per-race `prob_r`/`band`/`volume_24h` 從 component markets 的最新 `ts_price_snapshots` 拿；`series_14d` 取 `ts_index_scores` 尾 14 點。**deferred 到 CORR-1.3**：per-race `state`/`matchup`/`incumbent_party`/`delta_14d`/`contracts`/`exchanges` 為 null、`prob_by_state={}`（沒 market→seat 對應）。holdover/total_seats/threshold 暫從 `definition.aggregation` 讀、fallback Senate 100/51/0（CORR-1.2 會正式化）。**驗證**：[`tests/test_routes_indexes.py`](pmi-api/tests/test_routes_indexes.py) 3 個新 test（2 tossup@0.50 + holdover 49/49 → P(R maj)=25%、E[seats]=50、tossup=2 deterministic；no-score 404；missing-index 404），full pmi-api suite 25 passed、ruff clean。**雷已修**：pmi-api image 的 Dockerfile 硬寫 dep list 沒含 numpy（pmi-core 是 bind-mount 不帶自己的 deps），import `seat_distribution` 會 runtime 炸 → 已加 `numpy>=1.26` 進 [`pmi-api/Dockerfile`](pmi-api/Dockerfile)（pmi-workers/pmi-ingest 將來 import 到也要比照）。**剩 step 2**：接真 market→seat 對應（CORR-1.3）+ 真 holdover（CORR-1.2）+ `-seats` 真吐席次（NEXT-3.3）。(a-next) per-race `d14`/`contracts`/`excs` 補資料源；`series14` 改 `/score/history` 對齊；
  (b) ✅ **前端 types + client**（2026-05-31）：[`lib/types.ts`](pmi-web/lib/types.ts) 加 `SenateBoardEnvelope`/`SenateBoardPayload`/`SenateRace`（鏡像 schemas.py，snake_case）；[`lib/api-client.ts`](pmi-web/lib/api-client.ts) 加 `senateBoard(id, {asOf})`。
  (c) ✅ **前端移植進 pmi-web**（2026-05-31，production Next.js 15 server component，**非** Babel prototype）：新 [`components/SenateBoard.tsx`](pmi-web/components/SenateBoard.tsx)（2 majority tile + E[seats] + 7-band seat-balance bar + 51-席 threshold marker + band legend + 排序 per-race 表）+ 新 [`lib/heat.ts`](pmi-web/lib/heat.ts)（9-stop heat scale `heatColor`/`isDarkHeat` + band metadata，連續值走 inline style）。`app/indexes/[id]/page.tsx` 用 `isSeatProjectionIndex(id)` regex gate 只對 senate/house/seats index fetch board（war index 不顯示）；Spectral serif 加進 tailwind theme + globals 字體 import。**驗證**：`next build` 綠（typecheck + prod build）；live stack `:8001/.../senate-board` http=200 回 6 race + 7-band counts；`:3030/indexes/us-senate-2026-republican-seats` SSR 渲出 "Balance of power"/"Contested races"/"Expected R seats"/"Toss-up" legend；war index SSR 0 個 board（gate 生效）。**已知**：holdover=0（CORR-1.2 未接 → live def E[R seats]=3.47），choropleth + per-state 色塊待 `prob_by_state`（CORR-1.3）。
  (d) ✅ **heat-scale token**（同上，落在 `lib/heat.ts` + tailwind serif）；(e) 🟡 USA choropleth：**`prob_by_state` 後端已填**（CORR-1.3 seat_mapping，live 16 州）+ `SenateRace.state` 已帶 code；**剩前端真的畫地圖**（D3 server-render 或既有 chart lib）。board 現在 per-race 表已顯示州別、tossup rail 可用真 state。(b) `lib/types.ts` 加 `SenateBoard` interface + `lib/api-client.ts` 加 `getSenateBoard(id)`；(c) port `views-senate.jsx` → React component（`app/indexes/[id]/senate/page.tsx`，server-render 為主）：SeatBalanceBar / TossupRail / SenateRaceTable / 2 個 majority ScoreTile；(d) `colors_and_type.css` 9-stop heat scale + serif/sans token 抽進 pmi-web Tailwind theme（與 SHIP-3.3 schema-export 無關，純樣式）；(e) USA choropleth：prototype 的 CDN d3 + runtime us-atlas fetch → 改 server-render 或併入既有 chart 依賴（別在 production runtime fetch）。**Fast path**：純 scalar 版本零改動已可在 `/indexes/us-senate-2026-republican-seats` 出現（data-driven），board 是增量。**依賴**：CORR-1.6（majority 機率）、NEXT-3.3（seat aggregator 讓 `-seats` 真的吐席次而非機率%）、NEXT-3.5（`ts_index_scores.unit` 區分 `probability_pct` vs `seat_count`）。**取代** `TODO-真實e2e.md` T8 的 senate 部分。 | 4-5 天 | 2026-05-31 board UI 對話 / 真實e2e T8 |

---

## 3. DX 工具：PMI 迭代加速

> 不影響分數正確性，但讓「新加一個 PMI」從 30 分鐘變 5 分鐘。

| # | Todo | 估算 | 源 |
|---|---|---|---|
| ✅ **SHIP-3.1** | `pmi-core dry-run <yaml>` CLI：load YAML → selector → evaluator → aggregate → 印結果，**不寫 DB** | 半天 | §5.5 B1 |
| **SHIP-3.2** | `pmi-core diff <index_id> <v1> <v2>` CLI：比較兩版 PMI 在哪些 market 上分數差多少（CLAUDE.md §4 承諾） | 2 天 | §5.5 B2 |
| ✅ **SHIP-3.3** | YAML JSON Schema export（Pydantic `IndexDef.model_json_schema()` 一行 → 寫進 repo） — 給 IDE / Cursor autocomplete | 1 小時 | §5.5 B6 |
| **SHIP-3.4** | Backtest CLI（一鍵 replay 過去 90 天並出 CSV）— 客戶 demo 必問「之前怎樣」 | 1 週 | P1-7 |
| **SHIP-3.5** | 第 2-3 個 baseline index（election 已落 4 個，剩 fed-rate / crypto-cycle 各一）以證明 DSL 跑得起來 | 2-3 天 | P1-6 |

---

## 4. 修壞掉的 / 文件不一致

| # | Todo | 估算 | 源 |
|---|---|---|---|
| ✅ **SHIP-4.1** | ~~`pmi-demo` container 修好~~ → **container 退離**：從 docker-compose / justfile 拿掉，fixtures 留著（被 pmi-core/pmi-api 繼續 bind-mount，且是 `just dry-run` 的預設輸入）。throwaway demo 角色由 SHIP-3.1 接手。 | 半天 | §1.4 / P0-8 |
| ✅ **SHIP-4.2** | 文件不一致：`pmi-core/README.md` 改成 `pmi-score / api-dev` + 新加 `dry-run / schema-dump` 範例；`mlflow/README.md` 改 pin 寫成 `>=2.22,<3`（對齊 Dockerfile） | 1 小時 | §1.5 / P0-7 |
| ✅ **SHIP-4.3** | Root `pmi_data_platform/README.md` 掃一輪：service 表格 + Quickstart 對齊現況（pmi-workers / pmi-web 已不是 stub；pmi-demo 標註已退離；補 dry-run / schema-dump 區塊；補兩本 TODO 連結） | 30 分 | §1.5 |
| ✅ **SHIP-4.4** | Ingest pagination 拿掉 `max_pages=10` 寫死，改 `while True: batch...` 自然 break，`max_pages` 留成 1000 安全閥（含 `polymarket.max_pages_hit` 告警 log） | 1 小時 | §1.7 S8 / §5.5 A4 |
| ✅ **SHIP-4.5** (= CORR-3.10) | ~~Historical price backfill job — SHIP-3.4 backtest 的前置~~ **landed 2026-06-01**：走 CLOB `/prices-history?market=<token>&interval=max` 而非 Subgraph（後者留給 CORR-8.3）。實作 [`pmi-ingest/pmi_ingest/pollers/polymarket_history.py`](pmi-ingest/pmi_ingest/pollers/polymarket_history.py)：8-way concurrency、`POLYMARKET_HISTORY_MAX_PER_CYCLE=1000` cap、ON CONFLICT DO NOTHING 走 alembic 0005 新加的 `uq_ts_price_snapshots__market_time` constraint 做 idempotency。CLI `pmi-ingest polymarket-history` 一次性 backfill，建議 daily cron。Smoke 20 markets → 9674 points 寫入（~484 points/market、覆蓋過去 30 天）；同 20 markets 重跑 → 0 inserted（idempotent verified）。Historical rows 由 `bid IS NULL AND ask IS NULL AND volume_24h IS NULL` 辨識（history endpoint 只給 price）。**剩**：(a) 真實 backfill 整個 universe 要 ~10 個 cron beat（10k markets ÷ 1000/beat）；(b) `audit_source_health.records_24h` 取得 0 重跑值是 noise（idempotent skip 沒寫入），P1 可改成「點數 fetched」而非「inserted」。 | 3 天 | §5.5 A5 + CLAUDE.md §15.10 |

---

## 5. 觀測最小套件（MVP M8）

> 不是「跑得對」，是「跑壞了看得到」。Logflare / Better Stack free tier 半天搞定。

| # | Todo | 估算 | 源 |
|---|---|---|---|
| ✅ **SHIP-5.1** | ~~Render log drain~~ → R5 改 EC2：prod compose 每個 container 套 `awslogs` driver → CloudWatch Logs group `/pmi/prod`（structured JSON 已有）。剩：log group 自動建（driver `awslogs-create-group=true`）+ IAM 權限（在 SHIP-1.8 IAM role） | 半天 | M8 | ✅ 配置好、AWS apply 待跑 |
| ✅ **SHIP-5.2** | Sentry SDK：[`pmi-core/pmi_core/observability.py`](pmi-core/pmi_core/observability.py) `init_sentry(service)`（`SENTRY_DSN` 未設則 no-op）接進 pmi-api / pmi-workers / pmi-ingest entrypoint；3 個 Dockerfile 加 `sentry-sdk`。設 `SENTRY_DSN` 即開 | 半天 | P1-12 | ✅ |

---

## 累積估算

- 第 0 節（election demo）：半天 → **✅ 完成**（地端 docker 跑通）
- 第 1 節（cloud deploy）：~4-5 天 → **R5 已決策（單台 EC2）；SHIP-1.0~1.7 全落地（code + deploy 物件 + 本機驗證）**，只剩 **SHIP-1.8（真 AWS infra apply，~1.5 天，待帳號）**
- 第 2 節（demo surface）：~1 週 — **未動**
- 第 3 節（DX 工具）：~2 週（可分批）→ **剩 SHIP-3.2 / 3.4 / 3.5 ≈ 8 天**
- 第 4 節（修壞掉的）：~1 天 → **剩 SHIP-4.5 ≈ 3 天**（backtest 前置）
- 第 5 節（觀測）：1 天 — **未動**

**剩餘合計：~3 週**，可以分 sprint。**最小 demo 路徑：R5 決策 → 第 1 節剩餘 → SHIP-2.3（MCP）= ~1.5 週**就能對外 demo「上雲 + Polymarket 進來 + 4 個 election index + AI agent 透過 MCP 拿分數」。

> **下一步明顯就是 R5**：先選 platform（Render / Fly.io / Modal / DIY），其他 cloud 任務全跟著走。

2026-05-28 兩輪 ship batch 落地 11 條（第一輪 8 條 + 第二輪 SHIP-0.3 / 0.4 / 1.0）：見附錄 B。

---

## 附錄 A：來源 ID 對照表

| 本檔 ID | 來源 |
|---|---|
| SHIP-0.1 ~ SHIP-0.4 | 2026-05-27 對話 A1-A4 + `TODO-combined-seat-prediction.md` Phase 1/2/4 |
| SHIP-0.5 | 2026-05-28 對話「return 資料那段送 mock 用 conf 控制」（reid laptop ISP 把 gamma-api 整個 DNS-block 掉） |
| SHIP-0.6 | 2026-05-28 對話「.env 裡找 OPENAI_API_KEY 繼續跑 2」(CORR-0.1 / 0.2 / 0.3 / 0.4 / 0.5 部分完成 spinout) |
| SHIP-0.7 | 2026-05-28 對話「全部 env 都移到 pmi_data_platform/.env」 |
| SHIP-1.0 | 2026-05-28 對話「SHIP-0.3 / 0.4 跟 1.0 都先用 docker 地端測試」 |
| SHIP-1.1 ~ SHIP-1.6 | r3 `TODO.md` §2 M4、§5.2 P0-6 / P0-10、§4.3 |
| SHIP-1.7 | 2026-05-28 對話「DNS / custom domain / TLS 之前漏列」（reid 追問補上） |
| SHIP-1.8 | 2026-06-04 single-EC2 launch plan（R5 決策後新增的「真 AWS apply」獨立項） |
| R5（platform 決策） | 2026-05-28 立 callout → **2026-06-04 決策 = 單台 EC2 + docker compose + Caddy**（見 single-ec2-pmi-launch plan） |
| SHIP-2.1 | 對話 B8（新概念，r3 TODO 沒列） |
| SHIP-2.2 | r3 `TODO.md` §5.2 P0-9 |
| SHIP-2.3 | r3 `TODO.md` §2 M5 / §5.3 P1-1 + 對話 B10 |
| SHIP-2.4 | r3 `TODO.md` §5.2 P0-9 |
| SHIP-3.1 ~ SHIP-3.3 | r3 `TODO.md` §5.5 B1 / B2 / B6 |
| SHIP-3.4 | r3 `TODO.md` §5.3 P1-7 |
| SHIP-3.5 | r3 `TODO.md` §5.3 P1-6 |
| SHIP-4.1 | r3 `TODO.md` §1.4 / §5.2 P0-8 |
| SHIP-4.2 ~ SHIP-4.3 | r3 `TODO.md` §1.5 / §5.2 P0-7 |
| SHIP-4.4 | r3 `TODO.md` §1.7 S8 / §5.5 A4（這條同時 block 第 0 節 election task ingestion） |
| SHIP-4.5 | r3 `TODO.md` §5.5 A5 |
| SHIP-5.1 | r3 `TODO.md` §2 M8 |
| SHIP-5.2 | r3 `TODO.md` §5.3 P1-12 |

---

## 附錄 B：完成的歷史記錄（從 r3 TODO 搬過來）

> **已完成項目**（保留在這裡而不刪除，因為以後找「為什麼這個東西長這樣」會用到）：

- ✅ **MVP M3**（worker scheduling）— r3 完成。`pmi-workers` + supercronic crontab + `run-job <name>` runner，ported from `micah-job-executor`。剩下只是 cloud 部署時把 worker service 啟用（在本檔 SHIP-1.2）。
- ✅ **MVP M5 部分**（user-facing surface）— r3 完成 pmi-web Next.js 15 scaffold（landing / `/indexes/[id]` / `/health`）。剩下：group view（SHIP-2.1）+ explain breakdown（SHIP-2.2）+ MCP（SHIP-2.3）。
- ✅ **r3 P0-3** 整個移除（worker scheduling 已落地，併入 SHIP-1.2）。
- ✅ **§5.5 B3** `pmi-core score --all` — 已落在 `pmi-workers score-all` job。

### 2026-05-28 第一輪 ship batch（無外部決策的最小可動條目）

> 一次 chat session 內走完的，沒有 cloud 或 LLM 選型決策卡關。共 8 條 SHIP-X.Y：

- ✅ **SHIP-0.1**（factor prompts）— 加了 3 個 prompt：`is-senate-race-2026-v1.md`、`is-house-race-2026-v1.md`（補齊對稱性）、`republican-on-yes-v1.md`。binary 0/1 schema，confidence + reasoning，full resolution criteria。
- ✅ **SHIP-0.2**（4 YAML index defs）— `us-{senate,house}-2026-republican-{seats,share}.yaml`。share 走現有 `weighted_average_x_100`；seats 宣告 `formula: seat_projection_sum`（forward-compat，aggregator dispatch 落地見 [`TODO-跑得對.md`](TODO-跑得對.md) CORR-2.x）。順手把 `pmi-demo/fixtures/markets.json` 從 6 → 13 筆，補 8 筆 2026 election markets 讓 dry-run 有 selector matches。所有 5 個 YAML 都過 `IndexDef.model_validate`。
- ✅ **SHIP-3.1**（dry-run CLI）— 新檔 [`pmi-core/pmi_core/engine/dry_run.py`](pmi-core/pmi_core/engine/dry_run.py) 純函式 in-process pipeline（從 JSON fixture 讀 markets → 跑 keyword/category selector → 用既有 `_stub_score` 評估 → 呼叫真的 `aggregate()`）。CLI `pmi-core dry-run <yaml> [--fixture <path>] [--compact|--full]`、`just dry-run / dry-run-full`。**0 DB writes、0 MLflow calls、0 docker dependency**。output report 內含 `selectors / factors / aggregation` + 明確標記 `formula_declared` vs `formula_used`。5 個 YAML 都驗過跑得通。
- ✅ **SHIP-3.3**（JSON Schema export）— `pmi-core schema dump [--stdout|--output]`、`just schema-dump`。產出 [`pmi-core/pmi_core/dsl/schema/index-def.schema.json`](pmi-core/pmi_core/dsl/schema/index-def.schema.json)（296 行、draft 2020-12、自帶 `$id`）。將來改 `dsl/ir.py` 後跑一次 `just schema-dump` 即更新。
- ✅ **SHIP-4.1**（pmi-demo container 退離）— 從 `docker-compose.yml` 拿掉整個 service + `profile: demo`、`justfile` 拿掉 `demo-build/demo-stub/demo-llm` recipes、`build-pmi-all` 不再 build pmi-demo image、頂部 profile 清單刪 `demo` row、刪 `pmi-demo/.env`、重寫 `pmi-demo/README.md` 說明 container 已退離、fixtures 仍在原位被 bind-mount。throwaway demo 由 SHIP-3.1 接手（更好：免 docker）。
- ✅ **SHIP-4.2**（doc drift）— `pmi-core/README.md` 把 `just pmi-run / pipeline run` 改成正確的 `pmi-score`、新加 `dry-run / schema-dump` 範例；`mlflow/README.md` 把版本 pin 寫成 `mlflow>=2.22,<3` 對齊 Dockerfile。
- ✅ **SHIP-4.3**（root README sibling-path 掃整）— `pmi_data_platform/README.md` service 表格實況化（pmi-workers / pmi-web 改 P0 runnable、pmi-demo 標 container 已退離）、Quickstart 補 dry-run / schema-dump 區塊、頂部加兩本 TODO 連結、`just pmi-seed` 描述更新為 13 筆 markets。
- ✅ **SHIP-4.4**（ingest pagination 不再寫死）— `pmi-ingest/pmi_ingest/pollers/polymarket_rest.py` 改 `while True: ... break on partial batch`，`polymarket_max_pages` 拉到 1000 留成安全閥；越界時 emit `polymarket.max_pages_hit` warning log。election markets 不再會撞上限。

**剩下 P0 的「跑出來」工作**：SHIP-0.3 / 0.4（需要起 docker stack）、SHIP-1.x（雲端部署，需 R5 platform 決策）、SHIP-2.x（demo surface 擴充）、SHIP-3.2 / 3.4 / 3.5（DX 中型工具）、SHIP-4.5（historical backfill）、SHIP-5.x（觀測）。

### 2026-05-28 第二輪 ship batch（地端 docker e2e 驗）

> Reid 要求「SHIP-0.3 / 0.4 跟 1.0 都先用 docker 地端測試」，即在寫 cloud spec 之前先用 docker-compose 把預定部署到雲端的 6 個 service 在本機跑完整一輪。

- ✅ **SHIP-0.3**（score-all e2e）— `docker compose --profile pmi`：postgres → mlflow → migrate (`alembic upgrade head` 過所有 3 個版本) → seed（13 markets + 5 index defs 全 register）→ pmi-workers run-job score-all（成功 5 / 失敗 0，duration ~1.5s/index，共 96 audit_evaluations、每個都帶 mlflow_run_id 全 distinct）。`ts_index_scores` 表內有 5 個新 row：war=49.03、{house,senate}-{seats,share}=75.23 / 76.47。
- ✅ **SHIP-0.4**（用戶端驗證）— `/indexes` 列出 5 個 def（含 yaml_sha256、effective_from）；`/indexes/<id>/score` 全部 200 + 內含 `breakdown.raw` + `components_pre_collapse: 7` vs `after_collapse: 5`；`/indexes/<id>/score/history` 也通；landing `http://localhost:3030/` SSR 出 5 張 index card（含 owner / yaml sha / effective 日期）；dashboard `/indexes/us-senate-2026-republican-share` 渲出 76.47 score + 1-point history chart + full definition metadata。
- ✅ **SHIP-1.0**（topology validation — 新立項）— 全 6 個 container 同時 up：micah-postgres healthy、pmi-mlflow healthy、pmi-api up、pmi-ingest up（poll loop 跑了 + 寫 `audit_source_health`）、pmi-workers up（supercronic 讀到 `/app/cron/crontab`，schedule = `0 * * * * run-job hourly` + `0 10 * * * run-job daily`）、pmi-web up（SSR fetch pmi-api 經 docker network `http://pmi-api:8000`）。**cloud 部署只是換 host：同一組 image + 同樣 env vars 就能上線**。
- 🔧 **副產 bug fix（不在 TODO 上的）**：`pmi-workers/Dockerfile` 缺 `PYTHONPATH=/app`，導致 `run-job` console script（住 `/usr/local/bin/`）import 不到 bind-mount 在 `/app/pmi_core/` 的 pmi-core。修法：加 `ENV PYTHONPATH=/app`，supercronic spawn 出的 child process 也吃得到（rebuild 後 score-all 一次過）。pmi-ingest 之所以沒撞到是因為它走 `python -m pmi_ingest.cli`（從 `/app` cwd 起跑，cwd 自動上 sys.path）。

### 真實 bug / 環境問題（順手暴出來的）

- 🐛 ~~**`/explain` endpoint** 回 `last_price=null`、`relevancy=0.0`、`direction=0.0` 給每個 component，但同時 `/score` 卻能用同樣的 markets 算出 `raw=0.529412`、`score=76.47`（顯然 aggregator 有讀到 ts_price_snapshots）。`/explain` 沒 join `ts_price_snapshots` + 用了不同的計算路徑。已記錄在 [`TODO-跑得對.md`](TODO-跑得對.md) **CORR-3.3** 範圍內。~~ **已修 2026-05-31**（CORR-3.3 三段子任務全完成）：dict-update bug → 改成在 loop 完後對每個 market 呼叫 `_relevancy(evals, ir)` / `_direction_value(evals)`；`last_price` → `DISTINCT ON (market_id) ORDER BY snapshot_at DESC` 在 `ts_price_snapshots` 撈 `<= score.as_of` 的最新一筆；`_relevancy` / `_direction_value` → 直接 import aggregator 模組裡的兩個 helper，single source of truth。Regression 在 [`pmi-api/tests/test_routes_indexes.py::test_explain_returns_factors_and_relevancy`](pmi-api/tests/test_routes_indexes.py) + [`tests/e2e/test_pipeline_smoke.py::test_explain_returns_components`](tests/e2e/test_pipeline_smoke.py) 雙重 lock 住。
- 🌐 **環境問題**（不是 code bug）：本機 host 出 `curl https://gamma-api.polymarket.com` 也撞 `SSL certificate problem: self signed certificate` → 代表 reid 機器目前後面有 TLS-inspecting middlebox（corporate proxy / Zscaler / VPN MITM 攔截）。pmi-ingest poll cycle 正確抓到 exception + 寫 `audit_source_health.status='down'` + `/sources/health` 端點回傳，**observability 迴圈完全運作**，只是上游打不到。cloud 部署不會遇到這問題。

### 2026-05-31 testing harness（CORR-7.1 partial + 自動化 SHIP-0.3/0.4）

> Reid 追問「有 pmi data platform 的 e2e tests 嗎」，盤點下來只有 `pmi-core`
> 拿到 33 個 unit test（CORR-1.4 順手加的），`pmi-api` / cross-service e2e
> 都掛零。決定一次補 3 個層級：(1) pmi-api route tests、(2) full-stack
> docker e2e 自動化、(3) 修兩個老 bug 順便當 regression sample。

- ✅ **CORR-0.8 fix（route-test 順手修）** — [`pmi-api/pmi_api/deps.py`](pmi-api/pmi_api/deps.py) `require_api_key(session: AsyncSession = None)` 改成 `Depends(get_session)`。之前每次認證會偷開第二條 `SessionLocal()`、拿不到 dependency graph、CORS / middleware 都看不到，更要命的是跟 route handler 不共用 transaction。修完 4 個 [`tests/test_deps_auth.py`](pmi-api/tests/test_deps_auth.py) 蓋住：missing/invalid/valid + shared session + auth-disabled。`_check_key` 的 `await session.commit()` 留著，因為 `get_session` 不 auto-commit，這條 commit 是唯一的 single commit point。
- ✅ **CORR-3.3 fix（同上）** — [`pmi-api/pmi_api/routes/indexes.py`](pmi-api/pmi_api/routes/indexes.py) `/explain` 三段：(a) dict-update bug → 把 `setdefault` 從 `bucket = {"relevancy": 0, ...}` 改成 loop 完後在每個 market 呼叫 `_relevancy(evals, ir)` / `_direction_value(evals)`（typed `AuditEvaluation` dict，原 helper 共用）；(b) `last_price` → `select(TsPriceSnapshot.market_id, TsPriceSnapshot.last_price).where(market_id.in_(...), snapshot_at <= score.as_of).order_by(market_id, snapshot_at.desc()).distinct(market_id)`，一個 query 拉所有 market 的 latest price；(c) helper import → `from pmi_core.engine.aggregator import _direction_value, _relevancy` 就好，single source of truth。
- ✅ **pmi-api route tests** — 18 個 test：[`pmi-api/tests/test_routes_health.py`](pmi-api/tests/test_routes_health.py)（2）、[`test_routes_indexes.py`](pmi-api/tests/test_routes_indexes.py)（12 蓋 list/get/score/history/explain 全部 path 含 404、`as_of`、`limit`、`from`、empty components）、[`test_deps_auth.py`](pmi-api/tests/test_deps_auth.py)（4）。Test DB = isolated `pmi_api_test` postgres database（同一 container，不同 DB），用 `NullPool` 跳過 pytest-asyncio 跨 loop pool 雷。`just api-test`（新 recipe）跑 1.81s 全綠。Schema 用 `Base.metadata.create_all(engine)` 直接拉，不跑 alembic migration（純讀 API 不需要）。
- ✅ **e2e smoke harness（SHIP-0.3 / 0.4 自動化）** — 新檔 [`tests/e2e/`](tests/e2e/) 5 個檔：`conftest.py`（docker compose 編排：DROP/CREATE `pmi_e2e_test` DB → migrate → seed → score-all → `up -d pmi-api` on `:8099` → wait /health → yield base URL；teardown stop + DROP DATABASE）、`test_pipeline_smoke.py`（15 個 assertion：`/health` / `/sources/health` / `/indexes` 5 個 / `/score` 全 5 個 deterministic value match within ±0.01 / `/score/history` ≥ 1 point per index / `/explain` non-empty components + non-zero relevancy + real last_price / 404 path）、`docker-compose.e2e.yml`（只覆寫 `PMI_DB_NAME=pmi_e2e_test` + `PMI_MLFLOW_ENABLED=false` + port remap）、`pytest.ini`、`README.md`。`just pmi-e2e` 新 recipe；host 沒 pytest+httpx 自動建 `.e2e-venv`。Wall time **17.32s**（warm cache，包含 migrate/seed/score-all/api boot/15 assertions）；cold start +60-180s build。**Zero LLM cost**（no `core_factor_models` registered → all-stub）。Baseline 分數：war=49.0294、senate-{seats,share}=75.5667、house-{seats,share}=76.1296（match CORR-1.4 verification 跑出來的數字）。Drift 任何一個 → 立刻知道 aggregator / stub / index def 動了東西。
- ✅ **CORR-7.1 partial** — Engine 層 unit test 從「33 個 collapse path」推進到「33 + 18 pmi-api」total **51 個 test**。剩 0 的範圍：selector、factor_evaluator、factor_resolver、pipeline、dsl IR validator 邊界、aggregator 的 zero-relevancy / below-min_components 路徑。

### 2026-05-28 第三輪 ship batch（env 整合 + mock ingest + real LLM 接通）

> Reid 追問「現在可以從爬資料到算出 PMI 了嗎」後，發現本機網路把 `gamma-api.polymarket.com` DNS-block 掉（真的查 raw curl 看到「此網域已經遭到封鎖」block page，是 ISP 級別擋的、不是 SSL bug）。決定走三條路徑：(A) mock ingest 用 conf 控制、(B) 接真 LLM、(C) env 統一。

- ✅ **SHIP-0.7（env 整合）** — `pmi_data_platform/.env` 作為**唯一**真相來源。5 個 per-service `.env` 全刪（保留 `.env.example` 當 pointer / 文件）；docker-compose 5 個 PMI service 的 `env_file:` 全改指向 root `.env`；`pmi-core/api/ingest` 三個 pydantic-settings `SettingsConfigDict` 加 `parents[2]/.env` probe 讓 host-side CLI 也找得到；新加 `pmi_data_platform/.gitignore` 把 `.env` 鎖住。修了一個**副產 bug**：`Settings.openai_api_key` 因為 `env_prefix="PMI_"` 之前一直在等 `PMI_OPENAI_API_KEY`，沒人發現是因為 P0 dispatch 還是 stub；用 `Field(default="", validation_alias="OPENAI_API_KEY")` 解決。
- ✅ **SHIP-0.5（mock ingest）** — 新檔 [`pmi-ingest/pmi_ingest/pollers/mock_polymarket.py`](pmi-ingest/pmi_ingest/pollers/mock_polymarket.py)：`POLYMARKET_USE_MOCK=true` 時讀 fixture → 轉成 Polymarket Gamma 格式（`{lastTradePrice, volume, startDate, ...}`） → 走原來的 `_upsert_market` + `_write_price` + `record_poll`。**source name 維持 `polymarket-rest`** 所以 `audit_source_health` / `/sources/health` / dashboards 拿到一樣的 shape，cloud 翻 flag 即可換回 live。docker-compose 順手把 `pmi-demo/fixtures` 也 bind-mount 進 pmi-ingest。Smoke test：mock 模式 5min poll → 13 markets / 13 price snapshots / `audit_source_health.status='healthy'`（之前是 `down + ConnectError`）。
- ✅ **SHIP-0.6（real LLM 接通，CORR-0.1 ~ 0.5 部分完成）** —
  - 新 module `pmi_core/llm/`：`base.py`（`LLMProvider` Protocol、`LLMResponse` dataclass、`get_provider(model_id)` prefix dispatcher、`render_prompt()` helper、`parse_factor_response()` JSON validator for binary/ternary/score）、`openai_client.py`（`OpenAIProvider` 用 AsyncOpenAI + `response_format=json_object` + tenacity retry + cost table for gpt-4o-mini/gpt-4o/gpt-4.1-{mini,nano}）。
  - `factor_evaluator.py` 改 dispatch：`stub-*` → in-process `_stub_score`；`gpt-*` → `_run_real_llm()`。**Try/except 包住 LLM call**，失敗 fallback 到 stub 並把 `fallback_reason` 寫進 `model_response`、MLflow run tag `real_llm=false`、`fallback_reason=<class>:<msg>`。
  - `audit_evaluations.model_response` 新欄位：`stub: bool`、`rationale: str`、`raw_text: str`、`prompt_tokens / completion_tokens / cost_usd`、`raw_response`（full SDK dump）、`model_source: yaml|registry`。
  - MLflow child run 也記 cost / prompt_tokens / completion_tokens metrics + `real_llm` tag。
  - **Smoke 證據**：跑 `pmi-core score polymarket-war-index` → `directly_about_war` factor on 5 war markets → 5 個真 OpenAI call（200 OK，平均 2.4s latency，total $0.000350）→ 全部 `value=1.0` confidence 0.85-0.95，rationale 例如「The market's resolution depends on a specific kinetic action (missile strike) occurring within the specified date range」→ index score 從 49.03（all-stub）→ 49.23（1 factor real）。
- ✅ **SHIP-0.4 後續驗證**：mock + real LLM 同時跑下 e2e 全綠 — `/sources/health` healthy / `/indexes` 5 個 / `/indexes/polymarket-war-index/score` 49.23（real-LLM-influenced）/ pmi-web SSR 渲 5 個 card 都 OK。

### 2026-05-28 §1 釐清（reid 追問漏列項）

> 第二輪 ship batch 完後，reid 追問「R5 / secrets / DNS 這些有在 todo 嗎」，發現 §1 文字其實沒蓋全：

- 🔍 **R5 platform 決策** 之前只在 §累積估算 那句裡用了「需 R5 platform 決策」當代號，**但 §1 內並沒有對應的 decision callout**。已把 R5 提到 §1 開頭，列出 Render / Fly.io / Modal / DIY VPS 四個選項各自的 trade-off，並標明 SHIP-1.1+ 全部 block 在這個決策上。
- 🔍 **DNS / custom domain / TLS** 之前**整個漏列**（只有 SHIP-1.6 secrets 有蓋到）。已新增 **SHIP-1.7** 涵蓋 domain 申請、CNAME 設定、Let's Encrypt cert（platform 自動）、`NEXT_PUBLIC_PMI_API_URL` + CORS origin 對齊新 domain。
- ✅ **Secrets 管理** 已在 SHIP-1.6 — 沒漏。文字稍微 sharpen 一下講清楚 root `.env` 要進 `.gitignore` 且改 `.env.example` 風格。
- ✏️ **§1 intro 改寫**：從「本地 docker-compose 都通但完全沒有 cloud spec」→「SHIP-1.0 已完成 = 不是『能不能跑』的問題，剩 R5 platform 決策 + secrets + DNS」這個更精準的框架。

### 2026-06-04 single-EC2 launch batch（R5 決策 → 落地 deploy 物件 + 本機驗證）

> Reid：「單台 docker compose」+「主要 data source 爬→入庫→aggregate→算分→入庫→API→前端 publish」+ 真 LLM 循序跑（稍微重構以後可換自建 LLM server）。據此寫了 single-EC2 launch plan 並實作。**R5 拍板 = 單台 AWS EC2 t3.large + docker compose + Caddy**。

- ✅ **Phase 0 code（本機 docker compose 全驗過）**：
  - **LLM endpoint 重構**（0a，對應 reid「以後自建 LLM server」）：`config` 加 `PMI_LLM_BASE_URL` / `PMI_LLM_API_KEY`；`OpenAIProvider` 走 `@lru_cache` 的 `AsyncOpenAI(base_url=...)`；`get_provider()` 加 `local/` + `self-hosted/` prefix 路由同一 provider。驗：`get_provider("local/llama-3.1-8b")` → OpenAIProvider、prefix 剝除、base 生效、client 有 cache。未來換 vLLM/Ollama/TGI = 翻 env + 用 `local/<model>` model_id，零改 code。
  - **Ingest split**（0b）：`docker-compose.yml` 用 YAML anchor 拆成 5 個 long-lived ingest（pm-rest 在 `pmi` profile；clob / history / kalshi-rest / kalshi-clob 在 opt-in `ingest` profile）。history 因 CLI 是 one-shot，包成 daily shell loop。驗：實際 `up -d pmi-ingest-clob` 起來連打 `clob.polymarket.com/book` 200。
  - **Auth 發布路徑**（0c，CORR-0.7）：`pmi-core keys create/list/revoke/rotate`（raw token 只出一次、存 sha256）；`pmi-web/lib/api-client.ts` 只在 server fetch path 注入 `X-API-Key`（讀 non-`NEXT_PUBLIC_` 的 `PMI_API_KEY`，瀏覽器拿不到）。驗：翻 `PMI_API_REQUIRE_AUTH=true` + 注入 key 重建 api/web → 無 key/錯 key 401、對 key 200、`/health` 公開 200、dashboard SSR 照常渲（bytes 與 auth-off baseline 幾乎一致）。
  - **Race-fix**（0d，CORR-3.11）：`factor_evaluator` 寫 `audit_evaluations` 改 `INSERT ... ON CONFLICT ON CONSTRAINT uq_audit_evaluations__cache_key DO NOTHING RETURNING`，衝突則 re-read 當 cache hit。驗：對 Postgres dialect compile 出預期 SQL。
- ✅ **Phase 1 CI（SHIP-1.3）**：`.github/workflows/build-images.yml` matrix build+push 6 image 到 GHCR（tag = short SHA + latest），pmi-web bake `NEXT_PUBLIC_PMI_API_URL`。
- ✅ **Phase 2-4 deploy 物件（SHIP-1.1/1.4/1.5/1.6/1.7/5.1/5.2）**：`deploy/` 下 `docker-compose.prod.yml`（GHCR image、11 service、awslogs、S3 MLflow artifact、EBS pgdata、Caddy；`docker compose config` 驗過）、`caddy/Caddyfile`（3 subdomain + auto-TLS）、`db-init/`、`.env.base.example`、`scripts/{fetch-secrets,bootstrap}.sh`、`systemd/{pmi-env-fetch,pmi}.service`、`README.md`（AWS console + bring-up + deploy/rollback runbook）。Sentry 走 `pmi_core/observability.py::init_sentry`。
- 📋 **唯一待人工（SHIP-1.8）**：真 AWS infra apply（沒帳號無法在此執行）——照 [`deploy/README.md`](deploy/README.md) 跑。
- ⚠️ **已知 tradeoff**：prod 仍 bind-mount `pmi_core`（沒 bake 進 image），所以 git checkout SHA 與 `IMAGE_TAG` 要一起動；未來硬化 = 把 `pmi_core` COPY 進各 image（build context 改 repo root）。
