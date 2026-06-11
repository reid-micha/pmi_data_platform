# TODO: 跑得對 (Correctness)

> **目的**：讓 PMI 算出來的數字真的反映預測；讓 auth / audit / observability 撐得起 enterprise pilot；補齊「現在分數是亂數 / schema 沒預留 / bug 在那裡 / 評估算法太簡化」這些核心缺漏。
> **不負責**：把東西 ship 起來看得到、cloud deploy、DX 工具 — 那些去 [`TODO-跑出來.md`](TODO-跑出來.md)。
>
> **整合來源**：r3 `TODO.md`（已刪）+ `TODO-combined-seat-prediction.md`（已刪）+ 2026-05-27 chat 對話拆出的 B1-B10。
> **最後更新**：2026-06-11 — **active 清單已整併到 [`TODO.md`](TODO.md)（主入口，先看那裡）**；本檔保留為細節 + 歷史紀錄。
> 同日 reid 決策拿掉：**CORR-7.2~7.5**（觀測整套）與 **CORR-0.1 的 Anthropic provider 子項**——理由見 `TODO.md` 拿掉表。

---

## 0. 阻擋型（沒這節，所有分數都是亂數）

> 這節**全部**完成 = pmi-core 從 "scaffolded but stub" → "scaffolded and correct"。MVP 商業意義的真正門檻。

| # | Todo | 估算 | 源 |
|---|---|---|---|
| 🟡 **CORR-0.1** | **真 LLM 落地** — ✅ **基本接通**（[`pmi_core/llm/openai_client.py`](pmi-core/pmi_core/llm/openai_client.py) + `factor_evaluator` model_id dispatch + binary/ternary/score JSON parsing + fallback-to-stub on error，見 SHIP-0.6）。**剩**：structured output (`response_format=json_schema`)、self-consistency / retry-on-low-confidence。~~Anthropic provider~~ **拿掉（2026-06-11）**——provider 抽象已支援任何 OpenAI-compatible endpoint（`PMI_LLM_BASE_URL` / `ollama/*` / `local/*`），夠用。 | ~2 天剩 | M1 / P0-1 / §1.1 第一條 |
| ✅ **CORR-0.2** | **Prompt template rendering** — done in SHIP-0.6 `pmi_core.llm.render_prompt()`；regex-based 留 `{value}` 等 prompt body 自帶 placeholder 不替換。 | — | §1.1 / §5.5 C1 |
| ✅ **CORR-0.3** | **LLM provider abstraction layer** — done in SHIP-0.6 `pmi_core/llm/{base.py,openai_client.py}`；`get_provider()` 走 prefix dispatch（`gpt-*` / `openai/*`），加 Anthropic 只要 drop file。 | — | §1.7 S10 / §5.5 C2 |
| 🟡 **CORR-0.4** | **Cost tracking** — ✅ `audit_evaluations.cost_usd` 每次 LLM 評估都寫真值（SHIP-0.6 用 `_PRICE_PER_M_TOKENS` table）。**剩**：roll up 到 `audit_pipeline_runs.cost_usd / llm_calls`（目前 pipeline-level 還沒 SUM 子 row）。 | 半天剩 | §1.1 / §5.5 C4 一部分 |
| 🟡 **CORR-0.5** | **LLM retry / circuit breaker / 429** — ✅ **基本 retry**：SHIP-0.6 在 OpenAI client 套了 `tenacity` exp backoff × 3 attempts（涵蓋 `APIConnectionError / RateLimitError / APIStatusError`）。**剩**：account-wide circuit breaker（連續 N 次 429 就停 tick）、cost budget enforcement（CORR-5.4 部分重疊）、跨 factor 共用 token bucket。 | 半天剩 | §5.5 C4 |
| ✅ ~~**CORR-0.6**~~ | ~~**API auth 真的掛上 `Depends(require_api_key)`**：目前 0 個 route 用、`PMI_API_REQUIRE_AUTH` 預設 `false` = 完全開放讀取~~ **完成 2026-06-02**：`indexes` router 整層加 `dependencies=[Depends(require_api_key)]`（[routes/indexes.py](pmi-api/pmi_api/routes/indexes.py)）；`/sources/health` 個別 route 加同款 dep（[routes/health.py](pmi-api/pmi_api/routes/health.py)）；`/health` liveness 保持公開（cloud 平台 healthcheck 不會帶 X-API-Key）。test 端 `conftest.client` fixture override `require_api_key` 回 None（match dev `.env` 的 `PMI_API_REQUIRE_AUTH=false`），所以既有 18 個 route test 不破。新增 9 個 integration test ([`test_routes_auth.py`](pmi-api/tests/test_routes_auth.py))：`/health` 公開、`/sources/health` + `/indexes/*` 在 auth-on 模式 missing/invalid key → 401、valid key → 200、auth-off → 全開。全部 27 個 pmi-api test pass。`.env.example` 加註解說明 prod 翻 true、跟 CORR-0.7 keys CLI 串。 | 1 天 | M2 / P0-2 |
| ✅ ~~**CORR-0.7**~~ | ~~API key 發放 CLI：`pmi-core keys create / revoke / list / rotate`~~ **完成 2026-06-04**：`keys` Click group 落在 [`pmi-core/pmi_core/cli.py`](pmi-core/pmi_core/cli.py)。`_mint_raw_key()` 生 `pmi_<token>`、存 `key_prefix`（前 12 字元供識別）+ sha256（明文只在 create/rotate 印一次）。`create`（帶 `--owner` / `--scopes` / `--rate-limit` / `--expires-days`）、`list`（顯示 prefix / owner / status / last_used）、`revoke <prefix>`（set `revoked_at`）、`rotate <prefix>`（atomic 撤舊發新、繼承 owner/scopes）。驗：對 live DB 跑 create→list→rotate→revoke 全綠，搭 CORR-0.6 auth 翻 `PMI_API_REQUIRE_AUTH=true` 後 valid key 200 / revoked key 401。並接上 pmi-web server-side 注入（見 SHIP-1 §0c）。 | 1 天 | M2 / P0-2 |
| ✅ ~~**CORR-0.8**~~ | ~~修 `pmi-api/pmi_api/deps.py` 兩個 bug：(a) `require_api_key` 的 `session=None` 改 `Depends(get_session)`（B1）(b) `_check_key` 直接 `await session.commit()` 跟 `session_scope` 雙重 commit 衝突（B2）~~ **完成 2026-05-31**：`require_api_key` 改成 `session: AsyncSession = Depends(get_session)`，現在跟 route handler 共享同一條 session（不再每 req 偷開第二條）。`get_session` 本身 docstring 明確寫「不 auto-commit」+ `_check_key` 內 `await session.commit()` 是合法的 single commit point。驗證：[`tests/test_deps_auth.py`](pmi-api/tests/test_deps_auth.py) 4 個 test（missing key 401、invalid key 401、valid key + 共享 session、auth disabled = None principal）全 pass。 | 1 小時 | §1.8 B1 / B2 / §5.5 E1 / E2 |

---

## 1. Combined Senate/House Seat Prediction 的「對」部分

> 本節 5 條完成 = 對話裡 election task 的「跑得對」路徑 B1-B10 全到位。**單獨拆出來**因為這個 task 同時逼出 formula parser / condition_id / baseline / suite 四個 platform-wide 升級。

| # | Todo | 估算 | 源 |
|---|---|---|---|
| **CORR-1.1** | **Aggregation formula expression evaluator**：至少支援 `expected_count = Σ P_i × outcome_size_i + baseline`。目前 [`pmi-core/pmi_core/dsl/ir.py`](pmi-core/pmi_core/dsl/ir.py) `AggregationSpec.formula` 是 string label，aggregator 強制走 `weighted_average_x_100` | 1 週 | §1.7 S4 / P1-8 / §5.5 B7 / 對話 B2 |
| ✅ ~~**CORR-1.2**~~ | ~~**`AggregationSpec.baseline` / `total_seats` 兩個 IR 欄位** + aggregator 把 baseline 加進公式。election 場景：Senate 100 席 = 33 上 ballot + 67 非改選；67 那部分要當常數~~ **完成 2026-06-01**：做成 nested [`SeatProjectionSpec`](pmi-core/pmi_core/dsl/ir.py)（`total_seats` / `majority_threshold` / `holdover_r` / `holdover_d`，含 `holdover_r+d ≤ total` 與 `threshold ≤ total` validator），掛在 `AggregationSpec.seat_projection`（Optional，非 seat index 不填）。senate YAML bump **v2** 帶 `seat_projection: {100, 51, 30, 37}`（67 holdover）、house v2 帶 `{435, 218, 0, 0}`（零 holdover）。board endpoint 從 `definition.aggregation.seat_projection` 讀真值餵 CORR-1.6（fallback no-holdover Senate）。**驗證**：7 個新 IR test（[`tests/test_ir_seat_projection.py`](pmi-core/tests/test_ir_seat_projection.py)，含 holdover>total reject、house 零-holdover、extra-field reject）+ pmi-core 69 passed + pmi-api 18 passed（fixture 改 nested `seat_projection`，holdover 49/49 → E[seats]=50 解析正確）；ruff clean；兩 YAML load 出正確 geometry。**踩到 SCD2**：原地改 YAML → sha256 mismatch RuntimeError，照 contract bump v1→v2 才 seed 成功（這是 feature）。⚠️ **暴露 CORR-1.3**：live board 接 v2 後 `holdover` 正確流通（30/37），但 selector 撈到 **326** 個「senate」market 當 contested → `E[R seats]=106.62 > 100`（物理上不可能）。CORR-1.2 數學對（fixture 證），錯在沒有 market→seat 對應 → contested set 是 326 而非 ~33。**這是 CORR-1.3 的活，不是 CORR-1.2 的 bug**。 | 2 天 | 對話 B5（r3 TODO 沒列） |
| 🟡 **CORR-1.3** | ~~**`core_markets.condition_id` column**：alembic 0004 + pmi-ingest 寫入 + selector group-by~~ **部分完成 2026-06-01（重新界定範圍）**：原設計假設「per-seat 訊號要靠 condition_id 把 bracket markets 歸組」——**查 live data 後發現假設錯**。392 個「senate」market 裡，乾淨的 per-seat 訊號是 **per-state 一般選舉 race title**：`Will the (Republicans\|Democrats) win the {STATE} Senate race in 2026?`（live 有 16 州、含 OH/TX/NC/GA…，其中 5 州 R+D 兩個 market 要 dedup 成一席）。其餘是 primary-nominee（最多）、外國參議院（祕魯/巴西/菲律賓）、程序性（reconciliation bill）、Majority-Leader、chamber bracket（"47 or fewer seats"）= 全是雜訊。**這個修正不需要新 column** — 純 title parser。**已落地**：[`engine/seat_mapping.py`](pmi-core/pmi_core/engine/seat_mapping.py)（`extract_contested_seats`：parse (party, state)、group by state、R 直用 / 只有 D 則 1−p、含 state→code map 餵 `prob_by_state`）+ 14 test（[`tests/test_seat_mapping.py`](pmi-core/tests/test_seat_mapping.py)，含 nominee/foreign/bracket/candidate-name reject、R+D dedup）。board endpoint 改用它：**live contested set 326 → 16、E[R seats] 106.62 → 38.41（終於 ≤ 100）、`prob_by_state` 16 州填上**。**剩（真正還沒做的）**：(1) `condition_id` column + ingest + negRisk 偵測 → 給 **chamber-bracket** 的 partition_sum 路徑（跟 per-seat 是兩條獨立 aggregation，不是同一個）；(2) candidate-name race（Alaska 只有候選人名 market）+ independent race 目前 skip；(3) 真 holdover roster 校正（CORR-1.2 用近似 30/37）。**已知 honest artifact**：只有 16/~33 Class-II 席有 market → max R = 30 holdover + 16 = 46 < 51 → `p_r_majority=0`（數學正確，partial data 所致，非 bug）。 | 3-4 天 | §1.7 S1 / §5.5 A1 / 對話 B3 |
| ✅ ~~**CORR-1.4**~~ | ~~**Bucket collapse algorithm**：搬 `micah-job-executor/.../mutually_exclusive.py`（graph-based）取代現在 `aggregator.py::_collapse()` 的 naive prefix-3-token grouping~~ **完成 2026-05-30**：搬 Micah PR #15（2026-05-29 重命名 `mutually_exclusive.py` → `bucket_collapser.py`）的 noisy-OR + mean 算法。Calendar buckets（≥ 2 dates within `max_spread_days`）走 `1 - Π(1-p_i)`，multi-year deadline variants（"by end of 2030" vs "2040"）走 arithmetic mean。Date-aware grouping 用 ported [`pmi_core.utils.date_analyzer`](pmi-core/pmi_core/utils/date_analyzer.py)（`parse_bucket_date` / `strip_date_suffix` / `is_active_bucket`）。落點：[`pmi_core/engine/bucket_collapser.py`](pmi-core/pmi_core/engine/bucket_collapser.py)（新檔）+ [`aggregator.py::_collapse`](pmi-core/pmi_core/engine/aggregator.py) 改成 thin wrapper。Honor `ir.aggregation.collapse.max_spread_days` 而非 module 常數。**驗證**：33 個新 unit test pass（含 noisy-OR ≈ 0.91、multi-year mean ≈ (0.576+0.584+0.324)/3、expired bucket 排除、`max_spread_days` 分群、disabled passthrough）；5 個 fixture index dry-run score 不變（war-index 49.0294、senate-share/seats 75.5667、house-share/seats 76.1296）— 因為 demo fixture markets 無 date suffix，新 collapser 是 no-op，符合預期。已知未做：preserve sibling `audit_evaluations.id` 進 lineage（synthetic 只指 representative；同 Micah 行為）；`representative: highest_liquidity` 仍 fallback `max_probability`（需 CORR-3.4 liquidity 落地）。 | 3 天 | P1-4 / 對話 B4 / Micah PR #15 (2026-05-29) |
| **CORR-1.5** | **重寫 election factor prompt 成真 LLM 可用版**（v2）：`is-senate-race-2026-v2` / `republican-on-yes-v2`，含完整 instruction + few-shot example + JSON schema | 1 天 | 對話 B9 |
| ✅ ~~**CORR-1.6**~~ | ~~**Balance-of-power majority 機率（Poisson-binomial）**：senate board 的 `pmiGOPMajority` = P(R 控制席次 ≥ 51)，**不是** per-race 機率相加，而是把每個 race 當 Bernoulli(p=probR)、對「R 贏的席數」做 Poisson-binomial 和分布，再加 holdover 常數算尾機率。同一套順手吐 `counts` 7-band 分類 + E[seats]。落點：`engine/seat_distribution.py`~~ **完成 2026-05-31**：新檔 [`pmi_core/engine/seat_distribution.py`](pmi-core/pmi_core/engine/seat_distribution.py)，用 `np.convolve` 把 n 個 `[1−p_i, p_i]` 兩點分布卷成 exact Poisson-binomial PMF（加 `numpy>=1.26` 進 pmi-core deps；**不加 scipy** — scipy 沒有 exact Poisson-binomial，只有 n~35 用不到的常態近似）。`compute_seat_distribution(contested_probs, *, holdover_r, holdover_d, total_seats=100, majority_threshold=51)` → frozen `SeatDistribution{expected_r_seats, stdev_r_seats, p_r_majority, p_d_majority, contested_pmf, total_seats_pmf, ...}`。E[R]/Var 用 linearity 解析式（`E=holdover_r+Σp`、`Var=Σp(1−p)`）。另含 `classify_band` / `band_counts`（鏡像前端 `data-senate.js` bandOf，holdover 折進 safe-d/safe-r）。**驗證**：[`tests/test_seat_distribution.py`](pmi-core/tests/test_seat_distribution.py) 13 個 test 全綠（含 2^n brute-force 對拍 majority/E[seats]、PMF 加總=1、對稱 coinflip、band 邊界、VP tie-break threshold=50、clamp 越界）；ruff clean；full suite 100 passed 無 regression。**註**：tie mass 存在時 `p_r_majority+p_d_majority` 刻意不強制=1（偶數 chamber 的 50-50）。**剩下**：被 SHIP-2.5 board endpoint 消費（API 層 ×100 轉前端格式）+ 真實 holdover 常數（CORR-1.2 baseline/total_seats）接進來。 | 3 天 | senate PoC `senate_2026_pmi.py` docstring / 2026-05-31 board UI 對話 |
| ✅ ~~**CORR-1.8**~~ | ~~**`formula: seat_projection_sum` 在主 aggregator 接線**：seats index 的 `aggregate()` 之前不讀 `formula`、silently fallthrough 到 `weighted_average_x_100`，主分數形狀跟 share 變體一樣（YAML header 自承 NOT YET）~~ **完成 2026-06-07**：[`aggregator.py::aggregate`](pmi-core/pmi_core/engine/aggregator.py) 改成 dispatch on `ir.aggregation.formula`；新 `_seat_projection_aggregate()` **複用 board 那條已寫對的路徑**（`seat_mapping.extract_contested_seats` 每州一個 P(R)、polarity 自動處理 → `seat_distribution.compute_seat_distribution` Poisson-binomial），主分數回傳 **E[R seats]**（席次數，非 0..100），`breakdown` 帶 `expected_r_seats/stdev/p_r_majority/p_d_majority/n_contested`。主分數與 `/senate-board` 端點保證一致。House 暫 `score=None`（`parse_seat_race` 只認 per-state senate，honest degradation）。`dry_run.py` 的 `formula_used` 改成讀 `breakdown["formula"]`；兩個 seats YAML header 改現況。**驗證**：6 個新 test（[`tests/test_aggregator_seat_projection.py`](pmi-core/tests/test_aggregator_seat_projection.py)，含 holdover E[seats]、D-market 1−p、同州 R/D dedup、default geometry、非-senate→None、below-min→None）；pmi-core full suite **118 passed**。**⚠️ 下游**：seats index 主分數語意從「share 0..100」變「席次數」，pmi-web/API 若有把 score 當 0..100 index render 之處會誤標（待查）。 | 1 天 | senate-seats/house-seats YAML header（原指 CORR-2.x）|

---

## 2. Schema / IR 設計層級補洞

> 不補 = 「現在 schema 連欄位都沒有」的承諾 → 上線後改災難（特別是 multi-tenant）。

| # | Todo | 估算 | 源 |
|---|---|---|---|
| **CORR-2.1** | `WeightingSpec` / `LiquidityWeighting` IR 補齊 CLAUDE.md §4 欄位：`boost_threshold`、`trader_cohort.whale_boost`、`retail_only_penalty`（目前 YAML 寫這些直接 `extra=forbid` 失敗） | 2 天 | §1.7 S3 / §5.5 B5 |
| **CORR-2.2** | Multi-tenant `owner_id` / `tenant_id` 預留 column：所有 `core_*` table 加 column，預設 NULL。**現在補微痛，上線後改災難** | 1 天 | §1.7 S6 / §5.5 D8 / §6 R6 |
| **CORR-2.3** | `vec_market_embeddings` 解除 `Vector(1536)` 寫死，按 model 動態 dim — 將來想用 `text-embedding-3-large` (3072) 才不卡 | 半天 | §1.7 S5 / §5.5 C7 |
| **CORR-2.4** | `ts_trades` / `ts_orderbook_depth` schema **預留** migration 0004（不必實作 ingest，但 schema 在）— P1 WS / P2 CLOB 落地時不用 break compatibility | 半天 | §1.7 S2 / §5.5 A2 |
| **CORR-2.5** | `ts_price_snapshots` 加 `(market_id, snapshot_at)` unique constraint — poller retry / 雙開時去重，避免污染 time-series | 1 小時 | §1.7 S9 / §5.5 A3 |
| **CORR-2.6** | Selector `.limit(500)` 寫死改成 cursor / config 可覆蓋 — 一個 PMI 涵蓋 > 500 markets 時現在 **silently 漏資料** | 半天 | §1.7 S7 / §5.5 B4 |

---

## 3. Engine / API 缺陷修補

| # | Todo | 估算 | 源 |
|---|---|---|---|
| ✅ ~~**CORR-3.1**~~ | ~~`_upsert_market` 改用 atomic `INSERT ... ON CONFLICT (venue, external_id) DO UPDATE`~~ **完成 2026-05-28**：改用 `sqlalchemy.dialects.postgresql.insert(...).on_conflict_do_update(index_elements=["venue","external_id"], set_={...})` 一次 atomic INSERT+UPDATE，且回傳 `RETURNING id`；caller 用 detached stub 拿 `market.id` 避免每筆多一次 SELECT。Live 10k+ markets 跑過一輪零 `polymarket.market_skip`。位置：[`pmi-ingest/pmi_ingest/pollers/polymarket_rest.py:_upsert_market`](pmi-ingest/pmi_ingest/pollers/polymarket_rest.py)。 | 1 天 | §1.8 B5 + 2026-05-28 subagent report → 已修 |
| **CORR-3.2** | CLI 升級 private import：把 `_ensure_index_definition` rename 成 public `ensure_index_definition`；移除 `pmi-core/pmi_core/cli.py` L144 的 leak | 1 小時 | §1.8 B3 / §5.5 E4 |
| ✅ ~~**CORR-3.3**~~ | ~~**`/explain` 端點補完**：(a) **修 dict-update bug**（relevancy/direction 永遠回 0 — `bucket = setdefault(..., {"relevancy": 0.0, ...})` 建立時寫死，迴圈內只 update `factors`） (b) `last_price` 從 `ts_price_snapshots` LATERAL JOIN (c) 從 aggregator 抽 `_relevancy` / `_direction_value` 當共用 helper~~ **完成 2026-05-31**：(a) 把 setdefault dict 拆成 `by_market_evals: dict[int, dict[str, AuditEvaluation]]` + `by_market_factors`，迴圈結束後對每個 market 呼叫 `_relevancy(evals, ir)` / `_direction_value(evals)`；(b) 用 `DISTINCT ON (market_id) ORDER BY market_id, snapshot_at DESC` 在 `ts_price_snapshots` 撈 score.as_of 之前最新 last_price；(c) 直接 `from pmi_core.engine.aggregator import _direction_value, _relevancy` — single source of truth，不再 reimplement。驗證：[`tests/test_routes_indexes.py::test_explain_returns_factors_and_relevancy`](pmi-api/tests/test_routes_indexes.py) 同時 assert relevancy=1.0 / direction=+1 / last_price=0.60 / factors dict 含兩個 factor_id。 | 1 天 | M7 / §1.1 / §5.5 E3 |
| ✅ ~~**CORR-3.4**~~ | ~~Liquidity weighting 落地：aggregator 真的用 `volume` / orderbook depth quantile~~ **完成 2026-06-02**：aggregator 新 `_liquidity_weights(rows, ir)` + `_percentile()` helper。primary signal = `ts_orderbook_snapshots.bid_depth_1pct + ask_depth_1pct`（最新 snapshot per market，via `pipeline._latest_orderbook_depths`）；cold-start fallback = `ts_price_snapshots.volume_24h`（從 `_latest_prices` 同時拉回避免二查）。Quantile ladder 採 Micah `source_weights` 同款 0.90 / 1.00 / 1.20 / 1.50（p20/p50/p80 interpolated），N < 4 樣本或全等值（p20=p50=p80）回 uniform 1.0 保留 pre-CORR-3.4 行為。method=`none` short-circuits，`linear` max-normalises 到 [0.5, 1.5]。`MarketEvaluations` 加 `liquidity: float\|None` 欄；`liquidity=None` 的 market 一律 weight=1.0（cold start 不被懲罰）。`ts_index_scores.breakdown.liquidity_weighting` 帶 `{method, sample_size, applied, p20/p50/p80 or max_d}` 供 audit 看出 tick 為何長這樣。**驗證**：11 個新 unit test ([`tests/test_aggregator_liquidity.py`](pmi-core/tests/test_aggregator_liquidity.py)) — quantile ladder bucket-by-bucket、cold start、no-variance、method=none uniform、aggregate score boost vs unweighted；pmi-core 101 passed total；5 個 fixture dry-run all green（war 49.0098 vs prev 49.0294 微 drift 是 quantile 真接上的證明）。**未做**：`representative: highest_liquidity` 仍 fallback `max_probability`（bucket_collapser 的 P2 工作，CORR-1.4 留尾巴）。 | 2 天 | §1.1 / P1-3 |
| **CORR-3.5** | Ingest 補 volume 訊號：`core_markets.volume_24h` 從 Gamma `volumeNum` 寫入 **或** `/explain` 從 `ts_price_snapshots` LATERAL JOIN（二選一；ingest 已寫進 `ts_price_snapshots.volume_24h`） | 半天 | M6 / P0-5 |
| ✅ ~~**CORR-3.6**~~ | ~~Embeddings 真的寫入 `vec_market_embeddings` + Semantic selector 真的查 pgvector（目前 schema 接受但 selector 完全忽略）~~ **完成 2026-06-06**（commit `02318f0` + `1174e33`）：(a) 新 `embed-markets` worker job ([`pmi-workers/pmi_workers/jobs/embed_markets.py`](pmi-workers/pmi_workers/jobs/embed_markets.py)) 寫入 `vec_market_embeddings`，append-only、`(market_id, model, text_sha256)` dedup；(b) `SemanticSelector` 真的查 pgvector cosine ([`engine/selector.py::_semantic_market_ids`](pmi-core/pmi_core/engine/selector.py))，`min_similarity` 門檻、fail-open；(c) 預設用 **Ollama nomic**（本地免費）而非 OpenAI，`VectorStore` 抽象 + alembic 0007 把 `embedding` 改 unsized vector 以容不同 dim；rollout 一鍵 [`scripts/apply-embeddings.sh`](scripts/apply-embeddings.sh)。**剩尾巴**：① `embed-markets` 還沒掛上 `daily` cron alias（目前手動 `run-job embed-markets`）；② **現役 5 個 index def 沒有任何一個宣告 `type: semantic` anchor → SemanticSelector + Tier 0 對它們是 dormant**，要啟用得在 YAML 加 anchor。 | 3 天 | §1.1 第 4/5 條 + 2026-06-01 對話 |
| **CORR-3.7** | `audit_pipeline_runs.metadata_json` 欄位定義但從沒被寫過 — 要嘛刪 column 要嘛真寫東西進去 | 1 小時 | §1.8 B4 |
| ✅ ~~**CORR-3.8**~~ | ~~Polymarket Gamma API offset hard cap ~10,000 → 422~~ **完成 2026-05-28**（路徑 a）：`_fetch_page` 在 `raise_for_status()` 之前先檢查 `resp.status_code==422`，若是則丟自訂 `_OffsetCapReached`（不繼承 `httpx.HTTPError`，retry predicate 不會抓它），poll loop 在外層 `try/except _OffsetCapReached` 把它當「end of dataset」正常 break，cycle 仍標 `success=true`、records=已寫筆數。**驗證**：實際跑到 offset=10100 → 收到 422 → log `polymarket.offset_cap_reached`（INFO，不是 ERROR）→ `audit_source_health.status='healthy'`、`records_24h=10100`。⚠️ 還有後續：要徹底窮舉 > 10k 的市場，需走 keyset pagination（API 回 422 body 直接提示 `/markets/keyset`）— 開 **CORR-3.9** 追蹤。 | 1-2 小時 | 2026-05-28 subagent report → 已修 |
| ✅ ~~**CORR-3.9**~~ | ~~實作 Polymarket `/markets/keyset` cursor pagination 取齊 > 10k markets~~ **完成 2026-05-30**：整個 poller 從 `/markets?offset=` 改成 `/markets/keyset?after_cursor=`。發現過程：probe 5 個候選 cursor param 都被 server 忽略（連 garbage cursor 都回 page 1）→ 從 `/openapi.json` 的 sibling `/spotlights/keyset` 文件找到正確 param 名 `after_cursor`（`/markets/keyset` 本身未文件化但同 convention）。Verify: 一次 cycle 撈到 **42,016 markets**（vs 舊 10,100）、其中 **26,460 markets** 位於先前兩個方向 offset 都搆不到的 id 中段（2,032,547 ~ 2,375,198）；audit `status=healthy` / 0 skip / 0 retry。Side effect：`_OffsetCapReached` 整段刪掉（CORR-3.8 變成 dead code，因為 offset endpoint 已經不在 hot path）；poll loop 改 cursor-driven + fixpoint guard (`next_cursor==cursor` 早抓 stuck loop)。位置：[`pmi-ingest/pmi_ingest/pollers/polymarket_rest.py`](pmi-ingest/pmi_ingest/pollers/polymarket_rest.py) 整支 module docstring + `_fetch_keyset_page` + `PolymarketRestPoller.run_once`。 | 1 天 | 2026-05-30 已修 |
| ✅ ~~**CORR-3.11**~~ | ~~`audit_evaluations` write path 缺 ON CONFLICT 保護~~（背景：`evaluate_factor()` 走 SELECT → INSERT 兩步，supercronic hourly tick × 手動 `score` 撞同一 cache key → 第二個 INSERT IntegrityError → 整 tick rollback。2026-06-02 reproduce 過）。**完成 2026-06-04**：採推薦的 (a) atomic 路徑 — [`factor_evaluator.py`](pmi-core/pmi_core/engine/factor_evaluator.py) 改用 `pg_insert(...).on_conflict_do_nothing(constraint="uq_audit_evaluations__cache_key").returning(id)`；`returning` 為 None（即衝突）時 re-read 既有 row 當 cache hit 回傳。idempotent，兩容器並行也不爆。驗：對 Postgres dialect compile 出預期的 `INSERT ... ON CONFLICT ON CONSTRAINT ... DO NOTHING RETURNING` SQL。否決 (b) advisory lock（太重）/ (c) Arq dedupe（屬 CORR-4.6）。 | 半天 | 2026-06-02 對話 — CORR-3.4 smoke 發現 |
| **CORR-3.12** | **cross-venue 進 pipeline**：[`embed_markets.py`](pmi-workers/pmi_workers/jobs/embed_markets.py) 與 [`engine/selector.py`](pmi-core/pmi_core/engine/selector.py) 都硬篩 `venue == 'polymarket'`——已 ingest 的 kalshi（8 萬）/ manifold（18 萬）/ forecastex / predictit / gemini market **全部進不了 embedding / LLM pipeline**。改成 per-index 可宣告 venues（IR 加欄位，預設 `[polymarket]` 保持向後相容）+ embed job 吃 config venue 清單。**動 scoring 語意**——要配 golden regression（既有 5 index 分數 byte-identical）。§11 MVP 多源 parity 的必經之路 | 2-3 天 | 2026-06-10 EC2 session 發現（多源 ingest 上線後暴出） |

---

## 4. Polymarket 訊號深度（CLAUDE.md §5 承諾的差異化）

| # | Todo | 估算 | 源 |
|---|---|---|---|
| 🟡 **CORR-4.1** | ~~Polymarket WebSocket trade feed — real-time + momentum 訊號的前置~~ **scaffold landed 2026-06-01**：[`pmi-ingest/pmi_ingest/streams/polymarket_ws.py`](pmi-ingest/pmi_ingest/streams/polymarket_ws.py) 訂閱 CLOB market channel → 落 `ts_trades(source='ws')`；auto-reconnect (exp backoff)、token refresh 60s、heartbeat 寫 `audit_source_health`。CLI `pmi-ingest ws`。**剩**：對 full 42k-token universe 沒實跑過，subscribe-replace 行為靠文件假設、需要對著真 server 試；DB outage 時 in-flight 事件會丟（P1 加 Redis stream buffer）；single-market re-eval trigger 要 CORR-4.6 Arq 才能接上。 | 1-2 週 | P1-11 |
| 🟡 **CORR-4.2** | ~~Polygon chain indexer — trader cohort（whale vs retail）、UMA dispute 偵測~~ **scaffold landed 2026-06-01**：[`pmi-ingest/pmi_ingest/chain/polygon_indexer.py`](pmi-ingest/pmi_ingest/chain/polygon_indexer.py) — web3.py + `eth_getLogs` chunked walker，解 CTF Exchange `OrderFilled` → `ts_trades(source='chain')` + maker/taker → `core_traders`；ConditionalTokens `ConditionPreparation`/`Resolution` + UMA OO V2 `ProposePrice`/`DisputePrice`/`Settle` + UmaCtfAdapter `QuestionResolved` → `audit_chain_events`。checkpoint = `MAX(block_number) FROM audit_chain_events`，再開機從那繼續，`(tx_hash, log_index)` idempotency 保證 overlap safe。Cohort rollup 在 [`chain/cohort.py`](pmi-ingest/pmi_ingest/chain/cohort.py) — 滾過 30d ts_trades 加總 notional → 設 cohort。**剩**：未對 mainnet 實跑過；chunk_blocks 預設 2000 對特定 RPC provider 可能要降；rate-limit 失敗 retry 還沒接 tenacity；需要 `POLYGON_RPC_URL` 才會跑（空則 no-op + audit healthy）。 | 2 週 | P2-1 |
| 🟡 **CORR-4.3** | ~~Orderbook depth via CLOB API — liquidity weight 換掉 volume proxy~~ **landed 2026-06-01**：[`pmi-ingest/pmi_ingest/pollers/polymarket_clob.py`](pmi-ingest/pmi_ingest/pollers/polymarket_clob.py) 對每個 active YES token 拉 `clob.polymarket.com/book` → 算 mid / spread / depth_1pct / depth_5pct / total → 寫 [`ts_orderbook_snapshots`](pmi-core/pmi_core/models/ts_orderbook_snapshot.py)，並 keep top-25 raw levels JSON 在 `bids` / `asks` 欄做 forensic 重算。 16-way concurrency 切，每 cycle cap 5000 token，預設 60s 一輪。**接通條件**：先跑 polymarket_rest 把 `clob_yes_token` 從 Gamma `clobTokenIds[0]` 寫進 `core_markets`（已落，見 `_parse_clob_tokens`）。**剩**：aggregator 還沒讀 `ts_orderbook_snapshots`（要等 CORR-3.4 liquidity weighting 落地）；NO token 暫不 poll（symmetric 對 binary market 不必要）。 | 1 週 | P2-2 |
| 🟡 **CORR-4.4** | ~~UMA dispute vs Polymarket display resolution 對齊 → `core_markets.chain_resolution`~~ **scaffold landed 2026-06-01**：[`pmi-ingest/pmi_ingest/chain/uma_resolver.py`](pmi-ingest/pmi_ingest/chain/uma_resolver.py) 兩條路徑：(a) `--gamma-only` 純走 Gamma `raw.umaResolutionStatuses`（不需 chain RPC）但只認得 'proposed' / 'disputed'，settled 留 NULL；(b) 預設模式從 `audit_chain_events` 撈 `uma_propose` / `uma_dispute` / `uma_settle` / `uma_question_resolved`，DISTINCT ON questionKey → join `condition_prepared` 拿 conditionId → UPDATE `core_markets.chain_resolution`。`UMA_SETTLED_YES/NO/INVALID` 由 settled price ≥0.75 / ≤0.25 / else 決定。**剩**：要等 CORR-4.2 跑過至少一次有 `condition_prepared` event 才能做完整 chain path；aggregator filter `WHERE chain_resolution NOT IN ('UMA_DISPUTED', ...)` 也是 CORR-3.4 一起。 | 2 天 | §5.5 A6（跟 4.2 一起） |
| 🟡 **CORR-4.7** | **Kalshi parity for CORR-4.1 / 4.3** — orderbook + WS trades 跨 venue 一致 schema。**landed 2026-06-01**：[`pmi-ingest/pmi_ingest/pollers/kalshi_clob.py`](pmi-ingest/pmi_ingest/pollers/kalshi_clob.py) 走 `/markets/{ticker}/orderbook` （anon endpoint 回 `orderbook_fp.{yes_dollars,no_dollars}` with string-dollar prices — 真實 shape vs docs 寫的差距，第一次 smoke 0 snapshots 才發現），YES-centric mid from dual-bid book 寫進同一張 `ts_orderbook_snapshots`（token_id=ticker），smoke 1966 snapshots、Kalshi avg spread 9.7% vs Polymarket 27%。WS consumer [`streams/kalshi_ws.py`](pmi-ingest/pmi_ingest/streams/kalshi_ws.py) 用 `_load_private_key` （已 patch 支援 file 內容是 escaped `\n` 字串的 PEM）→ `ts_trades(source='kalshi-ws')`。**剩 / Open**：這把 Kalshi API key（與 REST 共用、REST 200 OK）打 WS handshake 一律回 `401 {"details":"NOT_FOUND"}` — 跨 5 個 signed path 變體 + 5 個 host 變體都同樣；同 key REST 通、WS 401，幾乎肯定是 **Kalshi-side streaming permission 沒開**，不是 code bug。要解：到 Kalshi developer console 把這把 key 升 trader scope（或新開 streaming-enabled key），不動 code。 | 1 天剩 Kalshi-side enable | 對話 2026-06-01 |
| **CORR-4.5** | TimescaleDB hypertables on `ts_price_snapshots` + `ts_index_scores` + `audit_source_health` — 時序查詢效能 | 2-3 天 | P1-9 |
| **CORR-4.6** | Arq + Redis 落地：把 cron 換成 worker + on-demand score（WS 觸發 single-market re-eval）。目前 pmi-workers 走 supercronic + `run-job`，OK for P0 不 OK for P1 scale | 1 週 | P1-2 |

---

## 4.5 Data source landscape（2026-06-01 對話：reid「還有哪些 data source 尚未整合」整理）

> **Context**：legacy Micah 接 9 個 source（[CLAUDE.md §15.3](#)）；新平台到 2026-06-01 為止接 **2 個 venue + 5 個 Polymarket 衍生子源**（深度 / WS / chain / UMA / 歷史）。這節記**還沒整合的、為什麼、以及優先序**，避免下次又問一次。

### 4.5.1 Polymarket sub-sources（CLAUDE.md §15.10 + 此 §4 衍生）

| Source | 狀態 | TODO ID | 動作 |
|---|---|---|---|
| Gamma REST `/markets/keyset` | ✅ landed | — | base poller，每 5 min |
| CLOB `/book` orderbook depth | ✅ landed | CORR-4.3 | 60s cadence |
| CLOB WS `market` channel | 🟡 scaffold | CORR-4.1 | 200-token cap，full universe 要 multi-connection |
| CLOB `/prices-history` 歷史 backfill | ✅ landed 2026-06-01 | CORR-3.10 / SHIP-4.5 | daily cron |
| Polygon RPC chain events (CTF Exchange / ConditionalTokens / UMA OO V2 / UmaCtfAdapter) | 🟡 code-only no-op | CORR-4.2 | **要付費 RPC**（Alchemy / Quicknode / Infura） — `POLYGON_RPC_URL` 一填就跑 |
| UMA dispute projection | 🟡 Gamma-only path live；chain path 待 RPC | CORR-4.4 | 同上 |
| Polymarket Subgraph (TheGraph / Goldsky) | ❌ | CORR-8.3 (P2+) | 跟 chain-RPC 二擇一的歷史 source；subgraph 較完整但 query 慢、chain 較即時 |
| Polymarket events endpoint (event-first scraping) | ❌ | SHIP-3.7 | senate PoC 驗過快 ~109×；index def 預先綁 event 就能省全表掃描 |

### 4.5.2 Kalshi sub-sources

| Source | 狀態 | TODO ID |
|---|---|---|
| REST `/markets` | ✅ landed | — |
| `/markets/{ticker}/orderbook` (anon `orderbook_fp` shape) | ✅ landed | CORR-4.7 |
| WS `/trade-api/ws/v2` | ⏳ key blocked | CORR-4.7 (Kalshi-side permission) |

### 4.5.3 LLM / 推理層 source（CLAUDE.md §6 + reid 對話 ROI 排序）

| Source | 狀態 | TODO | 優先 |
|---|---|---|---|
| OpenAI Chat (`gpt-4o-mini-*`) Tier 1 evaluator | ✅ landed (SHIP-0.6) | — | — |
| **Embeddings** for `vec_market_embeddings` | ✅ landed 2026-06-06（**Ollama nomic** 預設本地免費，非 OpenAI；OpenAI embedding provider 仍可選） | CORR-3.6 + CORR-5.1 done | — — semantic selector + Tier 0 pre-filter 已接通（但現役 index 沒宣告 anchor → dormant） |
| OpenAI / Anthropic **Batch API** | ❌ | CORR-5.3 | 🔥 #2 next（nightly eval cost -50%） |
| Anthropic (Sonnet/Opus) Tier 2 agentic | ❌ | CORR-5.6 | 後 |
| Web search / Bloomberg / Reuters / FRED / BLS (Tier 2 tools) | ❌ | CORR-5.6 子任務 | 後 — Tier 2 上線才需要 |

### 4.5.4 Legacy Micah sources（adoption matrix）

> **2026-06-01 update**：reid 推翻原本「砍 7 個」的設計決定，把 Metaculus / Robinhood / Crypto.com 三個拉回平台。剩下四個維持 deferred。

| Source | Micah 怎麼接 | 平台狀態 | 備註 |
|---|---|---|---|
| 🟢 **Metaculus** | REST + RSC | ✅ landed 2026-06-01 ([`pollers/metaculus_rest.py`](pmi-ingest/pmi_ingest/pollers/metaculus_rest.py)) | `pmi-ingest run --source metaculus-rest`。Smoke: 無 token 回 403、audit 寫 down，需在 metaculus.com profile 拿 `Token <key>` 才能跑 list API |
| 🟢 **Robinhood** | Playwright scraper | ✅ ported 2026-06-01 ([`scrapers/robinhood/`](pmi-ingest/pmi_ingest/scrapers/robinhood/)) | `pmi-ingest robinhood-scrape`，需 `ROBINHOOD_ENABLED=true`。Chromium bundled in pmi-ingest image (+~500MB). 3-phase scrape (discovery → listing → detail) 跑 ~6-15 min full universe |
| 🟢 **Crypto.com** | Playwright scraper | ✅ ported 2026-06-01 ([`scrapers/crypto/`](pmi-ingest/pmi_ingest/scrapers/crypto/)) | `pmi-ingest crypto-scrape`，需 `CRYPTO_ENABLED=true`。RSC-extraction（不爬 DOM），see-more clicks 到 50 次 cap |
| ⛔ **PredictIt** | REST | deferred | 量太小（< $1M monthly），美國僅 5 listing；Kalshi 已蓋掉這個 niche |
| ⛔ **ForecastEx** | REST | deferred | IBKR-only、量小、API 少 |
| ⛔ **Manifold** | REST | deferred | play-money、self-priced、無真 liquidity；若日後需 forecasting consensus 再加 |
| ⛔ **Coinbase** | Playwright scraper | deferred | crypto price 走 Coinbase REST 或 CoinGecko 更便宜，scraper 維護成本不值得 |

**deferred 4 個的 reopen 條件**：(a) 某 enterprise customer 明確要求；(b) 某個 commit 的 PMI def 需要那個 venue 的覆蓋率；否則維持 deferred。

### 4.5.5 Scrapers fragility 風險（Robinhood / Crypto.com）

兩個 scraper 都靠 DOM 結構（Robinhood）或 RSC payload shape（Crypto.com）—— 網站改版時會悄悄壞。Mitigation:

* `audit_source_health` 抓到 0-record cycle 就會 `status=down`、`consecutive_failures` 累加 → Slack alert (CORR-7.5)
* JS extractors 都是 standalone `.js` 文件，DOM 結構變了改 selector 即可（不用動 Python）
* PR #N（未來）若 Micah 那邊先發現 scraper 壞了，他們的 fix 是 1:1 portable 到這邊（同 JS 同 parser 同 scraper.py）

### 4.5.6 Scrapers smoke 2026-06-01 — 邊跑邊修的 3 個 bug

* **B1 — Crypto: nested asyncio loop**：Crypto scraper 的 `scrape_all()` yields 是在 Playwright sync greenlet 內，主執行緒已有 loop running，`persist_batch()` 用 `asyncio.run()` 撞 `cannot be called from a running event loop`。Fix: [`persistence.py`](pmi-ingest/pmi_ingest/scrapers/persistence.py) 偵測 `get_running_loop()`，nested 時改用 worker thread 跑 fresh loop。
* **B2 — Cross-loop dead-pool**：pmi-core 的 `engine` 是 module-level singleton，asyncpg 把 connection pool pin 在第一個碰到它的 loop；後續 `asyncio.run()` 開新 loop 後用舊 pool 就炸 `Future ... attached to a different loop`。Fix: 在每個 scraper-context async helper 開頭 `await engine.dispose()` 強制 fresh pool。新 helper `record_audit_in_scrape_context` 統一 audit 寫入。
* **B3 — InFailedSQLTransactionError cascade**：Robinhood scrape 第一輪跑到 1083 rows 後撞到一筆 bad row（很可能是 title 太長 / unicode / category 超字），try/except 在 Python 層 catch 了但 PG 已把整個 transaction 標 abort，後續所有 INSERT 都失敗。Fix: [`persistence.py`](pmi-ingest/pmi_ingest/scrapers/persistence.py) 用 `session.begin_nested()` 每 row 包 savepoint，一筆失敗只 rollback 到該 savepoint，不污染 batch 其他列。

三個都已 fix；savepoint pattern 是 SQLAlchemy 的 canonical solution，回歸風險低。

---

## 5. AI 分層 / 多 algo（CLAUDE.md §6 四層 LLM 的後三層）

| # | Todo | 估算 | 源 |
|---|---|---|---|
| ✅ ~~**CORR-5.1**~~ | ~~**Tier 0 embedding pre-filter**（pgvector + embeddings）— 新市場 cosine < floor 跳過 LLM 評估，成本控制~~ **完成 2026-06-06**（commit `02318f0`，與 CORR-3.6 同批）：[`engine/pipeline.py::_tier0_prefilter`](pmi-core/pmi_core/engine/pipeline.py) 串在 selection 之後、factor LLM loop 之前；cosine floor = `settings.embedding_tier0_min_cosine`，對每個 SemanticSelector anchor 取 max cosine，低於 floor 的 candidate cull 掉；**fail-open**（無 embedding / embed endpoint 掛 → 不擋）。**門檻**：只有宣告 `type: semantic` anchor 的 index 會啟動（無 anchor = no-op）；**現役 5 個 index 都沒 anchor → 全 dormant**，要省成本得先在 YAML 加 semantic anchor + 跑 `embed-markets`。 | 1 週 | P1-5 / §5.5 C7 |
| **CORR-5.2** | **Tier 3 周期性 re-evaluation trigger**（價格漂移 > X% → 觸發重算單一 market） | 1 週 | CLAUDE.md §6 / §5.5 D5 |
| 🔥 **CORR-5.3** | **OpenAI / Anthropic Batch API integration**（搬 [`micah-job-executor/.../batch_evaluator.py`](../micah-job-executor/app/jobs/workflows/evaluate_contracts/batch_evaluator.py)）— 成本減半。**reid 2026-06-01 對話 ROI #4**：nightly eval 直接省 50%。Tier 1 已接 real LLM（SHIP-0.6），加 batch path 是純 cost 優化，不解新功能。 | 3 天 | CLAUDE.md §6 / §5.5 C6 + 2026-06-01 對話 |
| **CORR-5.4** | **Cost budget enforcement**：每次 tick 預算 $X 超過停 + alert | 2 天 | §5.5 C5 |
| **CORR-5.5** | **A/B testing / shadow mode**：`CoreFactorModel` 加 `traffic_pct` + shadow flag，evaluator 按比例分流 | 1 週 | §5.5 D1 |
| **CORR-5.6** | **Tier 2 agentic deep eval**（Sonnet / Opus 帶 web search / read resolution criteria tools）— 觸發條件：Tier1 信心低 / factor 矛盾 | 2 週 | P2-3 / §5.5 D6 |
| **CORR-5.7** | **Tier 升級 trigger 邏輯**：Tier 1 → Tier 2 條件（信心 < X / 矛盾 / 資料稀疏） | 1 週 | §5.5 D3（CORR-5.6 前置） |
| **CORR-5.8** | **Factor disagreement detection**：`directly_about_war=1` 但 `armed_conflict=0` → flag 走 Tier 2 | 3 天 | §5.5 D4 |
| **CORR-5.9** | **Multi-model voting / ensemble**：同 market 跑 N 個 model 比 disagreement | 1 週 | §5.5 D2 |
| **CORR-5.10** | **Model promotion calibration / drift detection**：換 LLM 後分數漂移是否在預期內 | 1 週 | §5.5 D7 |
| **CORR-5.11** | **Prompt namespace 統一**：`core_prompts` `factors/{name}-v{N}` vs MLflow `pmi.factor.{factor_id}` — 對齊命名 | 1 天 | §5.5 C8 |

---

## 6. Audit / Security（enterprise 賣點底線）

| # | Todo | 估算 | 源 |
|---|---|---|---|
| **CORR-6.1** | API rate limiting — `core_api_keys.rate_limit_per_minute` 欄位存在但沒人 enforce | 1 天 | §1.3 |
| **CORR-6.2** | Append-only audit DB-level 強制：對 `audit_*` table 做 `REVOKE UPDATE, DELETE` from app role；現在只是規則文件約定 | 半天 | §1.3 / P1-10 |
| **CORR-6.3** | `audit_source_health.p95_latency_ms_24h` 真的算 24h sliding window p95（目前用「最後一次 poll duration」當代理） | 1 天 | §1.6 |
| **CORR-6.4** | `expected_records_24h` 用過去 7 天實際資料中位數（目前 poller 寫死啟發式公式） | 半天 | §1.6 |
| **CORR-6.5** | Score 寫入時機從 CLI 手動 → Arq 排程 + WS-triggered（依賴 CORR-4.6） | 1 天 | §1.6（CORR-4.6 子任務） |

---

## 7. 觀測 / Engine 測試覆蓋

| # | Todo | 估算 | 源 |
|---|---|---|---|
| 🟡 **CORR-7.1** | **Engine 層 unit tests** — ✅ **partial**：(1) 2026-05-30 加 33 個 test 蓋掉 aggregator collapse path（[`tests/test_bucket_collapser.py`](pmi-core/tests/test_bucket_collapser.py) + [`tests/test_date_analyzer.py`](pmi-core/tests/test_date_analyzer.py))。(2) 2026-05-31 加 18 個 **pmi-api route tests**（[`pmi-api/tests/`](pmi-api/tests/)）蓋住 `/health`、`/sources/health`、`/indexes`、`/indexes/{id}`、`/indexes/{id}/score`、`/score/history`、`/explain`、`require_api_key`。**剩 0 test**：[`engine/selector.py`](pmi-core/pmi_core/engine/selector.py)（keyword / category match）、[`engine/factor_evaluator.py`](pmi-core/pmi_core/engine/factor_evaluator.py)（stub vs real LLM dispatch、JSON parsing、cost tracking、fallback-to-stub）、[`engine/factor_resolver.py`](pmi-core/pmi_core/engine/factor_resolver.py)（CoreFactorModel registry hit vs YAML fallback）、[`engine/pipeline.py`](pmi-core/pmi_core/engine/pipeline.py)（SCD2 ensure_index_definition、prompt sha256 mismatch error path）、[`dsl/ir.py`](pmi-core/pmi_core/dsl/ir.py)（IndexDef validator：總權重 > 0、所有 selector 類型、extra fields rejected）、aggregator 的 `_relevancy` / `_direction_value` / `aggregate()` 邊界（zero relevancy / below min_components）。 | 半週剩 | §5.5 E5 |
| ❌ ~~**CORR-7.2**~~ | ~~OTel SDK → Grafana Cloud free tier~~ **拿掉（2026-06-11 reid 決策）**：暫以 structured logs + `/sources/health` + MLflow 為觀測面 | — | CLAUDE.md §3.4 |
| ❌ ~~**CORR-7.3**~~ | ~~Ingest metrics → Prometheus~~ **拿掉（2026-06-11，同上）** | — | §5.5 A7 |
| ❌ ~~**CORR-7.4**~~ | ~~Grafana 三個基礎 dashboard~~ **拿掉（2026-06-11，同上）** | — | CLAUDE.md §3.4 |
| ❌ ~~**CORR-7.5**~~ | ~~Slack / PagerDuty alert rule~~ **拿掉（2026-06-11，同上）** | — | CLAUDE.md §3.3 |

---

## 8. P2+ Long-term（記著別忘）

| # | Todo | 對應 |
|---|---|---|
| **CORR-8.1** | Temporal（durable backtest / 長 workflow / Tier 2 agentic） | P2-4 / CLAUDE.md §7 |
| **CORR-8.2** | ClickHouse / Tinybird for analytics（等 Timescale hypertable 撐不住時） | P2-5 / CLAUDE.md §3.1 |
| **CORR-8.3** | Polymarket Subgraph 整合（歷史回放更完整） | — |
| **CORR-8.4** | Index Marketplace（第三方研究員發布付費 index） | P3-1 |
| **CORR-8.5** | MCP Pro / Embedding API / Data export（多 SKU） | P3-2 |
| **CORR-8.6** | SOC 2 | P3-3 |
| **CORR-8.7** | Cross-market arbitrage signal（mutually exclusive 但 Σ≠1 → 信號劣化） | CLAUDE.md §5 |

---

## 9. Open Questions / Risks（要先解才做後續）

| # | 問題 | 觸發點 | 源 |
|---|---|---|---|
| **R1** | Polymarket ToS 是否允許商業重新分發資料？ | 在 SHIP cloud deploy 對外開放前必解 | r3 §6 R1 |
| ✅ **R2** | ~~LLM 廠商選 OpenAI / Anthropic / both routing？~~ **已決（2026-06-11）：OpenAI-compatible only**——`get_provider()` prefix 路由 + `PMI_LLM_BASE_URL` 已可接 OpenAI / Ollama / 任何 self-hosted OpenAI-compatible server；Anthropic provider 拿掉不做 | — | r3 §6 R2 |
| **R3** | MLflow Model Registry artifact 要不要真的傳？ | CORR-0.1 完成後 | r3 §6 R3 |
| **R4** | Self-host MLflow 還是上 Databricks-managed？ | 開始有 prod 流量時 | r3 §6 R4 |
| **R5** | Cloud 平台 Render / Fly.io / Railway？ | SHIP-1.1 一起決定 | r3 §6 R5 |
| **R6** | Multi-tenant isolation model（row / schema / DB）？ | 第一個 enterprise pilot 出現時；CORR-2.2 同步決定 | r3 §6 R6 |
| **R7** | Self-host Temporal 還是 Temporal Cloud？ | CORR-8.1 開工前 | CLAUDE.md §13 |
| **R8** | Index Marketplace 抽成 30% 合理嗎？ | CORR-8.4 開工前 | CLAUDE.md §13 |
| **R9** | SOC 2 觸發時機？ | 第一個 enterprise 客戶要求才做 | CLAUDE.md §13 |

---

## 累積估算

- 第 0 節（核心阻擋）：原估 **~2 週**，SHIP-0.6 + 0.7 完成後**剩 ~1 週**（CORR-0.1 / 0.4 / 0.5 各還有半-1 天細項；CORR-0.6 / 0.7 / 0.8 auth 三條原計 ~2 天未動）
- 第 1 節（election task）：~3 週（與第 2/3 節高度共用）
- 第 2 節（schema 補洞）：~1 週
- 第 3 節（engine/api 缺陷）：~1.5 週
- 第 4 節（Polymarket 深度）：~6-8 週（P1-P2 跨度）
- 第 5 節（AI 分層）：~8-10 週（P1-P2 跨度）
- 第 6 節（audit/security）：~1 週
- 第 7 節（觀測 + 測試）：~2 週

**第 0 + 1 + 2 + 3 + 6 + 7 = ~9-10 週**（單人全職）= MVP 上線後的「真的可用 + 可給 enterprise 看」門檻。
**第 4 + 5 + 8 = ~6 個月+** = 平台差異化的真正深度。

---

## 附錄 A：來源 ID 對照表

| 本檔 ID | 來源 |
|---|---|
| CORR-0.1 ~ CORR-0.5 | r3 `TODO.md` §2 M1 / §5.2 P0-1 / §1.1 / §5.5 C1-C4 / §1.7 S10 / 對話 B1 |
| CORR-0.6 ~ CORR-0.7 | r3 `TODO.md` §2 M2 / §5.2 P0-2 |
| CORR-0.8 | r3 `TODO.md` §1.8 B1 / B2 / §5.5 E1 / E2 |
| CORR-1.1 ~ CORR-1.5 | 對話 B2-B5 + B9 / r3 `TODO.md` §1.7 S1 / S4 / §5.5 A1 / B7 / P1-4 + `TODO-combined-seat-prediction.md` Phase 1/2 |
| CORR-2.* | r3 `TODO.md` §1.7 S2-S9 / §5.5 A2-A3 / B4-B5 / D8 / C7 |
| CORR-3.1 ~ CORR-3.2 | r3 `TODO.md` §1.8 B3-B5 / §5.5 E4 |
| CORR-3.3 | r3 `TODO.md` §2 M7 / §1.1 / §5.5 E3 + `TODO-combined-seat-prediction.md` 4.2 / 4.3 |
| CORR-3.4 | r3 `TODO.md` §1.1 / §5.3 P1-3 |
| CORR-3.5 | r3 `TODO.md` §2 M6 / §5.2 P0-5 |
| CORR-3.6 | r3 `TODO.md` §1.1 第 4/5 條 |
| CORR-3.7 | r3 `TODO.md` §1.8 B4 |
| CORR-4.* | r3 `TODO.md` §5.3 P1-11 / §5.4 P2-1 / P2-2 / P1-9 / P1-2 / §5.5 A6 |
| CORR-5.* | r3 `TODO.md` §5.3 P1-5 / §5.4 P2-3 / §5.5 C5-C8 / D1-D7 / CLAUDE.md §6 |
| CORR-6.* | r3 `TODO.md` §1.3 / §1.6 / §5.3 P1-10 |
| CORR-7.* | r3 `TODO.md` §5.5 E5 / A7 / CLAUDE.md §3.3 / §3.4 |
| CORR-8.* | r3 `TODO.md` §5.4 P2-4 / P2-5 / §5.3 P3-1 ~ P3-3 / CLAUDE.md §5 |
| R1-R9 | r3 `TODO.md` §6 R1-R6 + CLAUDE.md §13 open questions |

---

## 附錄 B：已完成（從 r3 TODO 搬過來保留）

> **已完成項目**保留在這裡，因為以後找「為什麼這個東西長這樣」會用到 audit trail。

- ✅ **Schema 4-tier**（`core_/ts_/audit_/vec_`）11 tables、SCD2、append-only audit pattern。
- ✅ **Alembic 0001/0002/0003**（initial / mlflow_links / core_factor_models）。
- ✅ **DSL → IR**：YAML → `IndexDef`；keyword + category + semantic selector（semantic 自 2026-06-06 CORR-3.6 起真的查 pgvector，不再只是 schema stub；現役 index 尚未宣告 anchor）。
- ✅ **內建 index** `polymarket-war-index` v1（7 factors，沿用 Micah war index）。
- ✅ **Prompts**：7 個 markdown 模板，git-tracked、SHA256-hashed、寫進 `core_prompts` + MLflow Prompt Registry。
- ✅ **Pipeline**：完整 tick（SCD2 ensure → prompt register → factor resolve → eval loop → aggregate → write `ts_index_scores` + `audit_pipeline_runs`）。
- ✅ **Factor resolver**：DB lookup `CoreFactorModel` (active production) → YAML fallback。
- ✅ **Aggregator**：Weighted relevancy × direction × price → 0–100；簡化 collapse（待 CORR-1.4 升級）。
- ✅ **MLflow integration**：Experiments + parent/child runs + Prompt Registry + graceful degradation；43 unit tests pass。
- ✅ **pmi-ingest**：Polymarket Gamma REST poller。
- ✅ **pmi-api**：Read-only FastAPI（auth 寫好沒掛 → CORR-0.6 才算完）。
- ✅ **pmi-workers** (r3)：supercronic + `run-job` runner + score / score-all / hourly / daily jobs。
- ✅ **pmi-web** (r3)：Next.js 15 三頁 dashboard scaffold over pmi-api。
- ✅ **MLflow server**：Docker image (>=2.22)、Postgres backend、local artifact volume。
- ✅ **本地 orchestration**：`docker-compose.yml` 多 profile + `justfile` 40+ recipes。
- ✅ **MVP M3** worker scheduling（拆出去 [`TODO-跑出來.md`](TODO-跑出來.md) 附錄 B）。
- ✅ **MVP M5 部分** user-facing surface（pmi-web 起手；MCP 仍待 [`TODO-跑出來.md`](TODO-跑出來.md) SHIP-2.3）。
- ✅ **2026-05-28 SHIP-0.6**：CORR-0.2 + CORR-0.3 完成；CORR-0.1 / 0.4 / 0.5 拿掉 80% — 詳見 [`TODO-跑出來.md`](TODO-跑出來.md#2026-05-28-第三輪-ship-batchenv-整合--mock-ingest--real-llm-接通)。
  - LLM 抽象層：`pmi_core/llm/{base,openai_client}.py` + `factor_evaluator` dispatch + render helper + JSON parser。
  - Cost tracking：`audit_evaluations.cost_usd` / `prompt_tokens` / `completion_tokens` 在 OpenAI path 真值寫入；MLflow child run metric 也記。
  - Retry：tenacity exp backoff × 3，APIConnectionError/RateLimitError/APIStatusError 涵蓋。
  - **Smoke 證據**：`directly_about_war` factor on 5 war markets via `gpt-4o-mini-2024-07-18` → 全 confidence 0.85-0.95、value=1.0、rationale 帶 resolution criteria 推理、cost $0.000350 total。Index score 49.03（all-stub）→ 49.23（1 factor real）。
- ✅ **2026-05-30 Micah PR #15 backport**：CORR-1.4 完成。新增 [`pmi_core/utils/{dates,date_analyzer}.py`](pmi-core/pmi_core/utils/) + [`pmi_core/engine/bucket_collapser.py`](pmi-core/pmi_core/engine/bucket_collapser.py) + 33 個 unit test（`tests/test_bucket_collapser.py` + `tests/test_date_analyzer.py`）。Date-aware grouping、noisy-OR (calendar) + mean (multi-year)、honors `ir.aggregation.collapse.max_spread_days`。詳見 §1 CORR-1.4 row。
