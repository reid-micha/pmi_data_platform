# TODO: 真實 End-to-End（筆電 demo 版）

> **目標**：在 reid 筆電上，用 docker compose 跑一次**真資料進 → 全 factor 真 LLM → 算對 → 對外 serve**的完整鏈，
> 取代現在的基線（mock ingest + 只有 1 個 factor 真 LLM + supercronic cron + 地端）。
> **不負責**：cloud deploy、auth 嚴格化、election seats 算法 — 那些留在 [`TODO-跑出來.md`](TODO-跑出來.md) / [`TODO-跑得對.md`](TODO-跑得對.md)。
> **最後更新**：2026-05-30。

---

## 決策（2026-05-30 reid 拍板）

| ID | 決策 | 影響 |
|---|---|---|
| **R1** | ✅ Polymarket ToS **允許**商業重新分發資料 | 真資料 ingest 解禁，可對外 |
| **R2** | ✅ LLM **先用 OpenAI**，key 從 `pmi_data_platform/.env` 拿（`OPENAI_API_KEY`，已接 SHIP-0.7） | CORR-0.1 收尾只需 OpenAI path；Anthropic provider 延後 |
| **R5** | ✅ 先用筆電 docker compose demo（containerise 後**筆電/雲端等價**，差別只在網路環境） | SHIP-1.x（cloud spec）暫緩，但 image 要保持「換 host 即可上線」。E2E-1 的 DNS 處理**不是筆電專屬**——雲端一樣可能有 DNS/網路問題，所以是必要的 robustness 步驟 |

**標的 index**：`polymarket-war-index`（7 factors，aggregator 已能正確跑）。
Election seats suite **不在本清單範圍**（要再 +CORR-1.1~1.5，另計）。

---

## Critical Path（5 步，war index）

| # | Todo | 動作 | 估算 | 對應 |
|---|---|---|---|---|
| ✅ **E2E-1** | **真資料進來** — **DONE 2026-05-30**。`dns: [1.1.1.1, 8.8.8.8]` 已在 compose `pmi-ingest`，`POLYMARKET_USE_MOCK=false` 已設。實測現在的網路 **DNS 沒被擋**（gamma-api 全 200 OK，不需 monkeypatch fallback）。一輪 poll 抓進 **18,682 真市場 / 561,342 price snapshots**，`audit_source_health: polymarket-rest=healthy, records_24h=10100`。war-index 關鍵字 match **448 markets**。 | ✅ 半天 | R1 + SHIP-0.5 反向 |
| ✅ **E2E-2** | **全 factor 真 LLM** — **DONE 2026-05-30**。發現只有 `directly_about_war` 之前有 promoted `CoreFactorModel`，其餘 6 個 fallback 到 stub（resolver 設計：無 registry row → `stub-deterministic-v1`）。**純 data 操作、非 code 改**：register + promote 另外 6 個 factor model（direction/armed_conflict/state_actor/kinetic_action/near_term/high_severity，全 `gpt-4o-mini-2024-07-18` temp=0.1 production，factor_model id=2~7）。Prompt 先跑一次 `score` 註冊進 `core_prompts`（register 前置）。 | ✅ 半天（比估的便宜，data 操作） | CORR-0.1 剩餘 |
| **E2E-3** | **war-index prompt 確認可用**：現有 7 個 markdown prompt 是否足夠讓真 LLM 回對的 JSON（binary/ternary/score）。低信心就補 few-shot | 跑 5-10 個真市場看 rationale 合不合理；爛的 bump v2 | 1 天 | CORR-1.5 精神（war 版） |
| **E2E-4** | **cost 可見**（CORR-0.4 收尾，可選但建議）：roll up 子 row 到 `audit_pipeline_runs.cost_usd / llm_calls` | aggregator/pipeline tick SUM `audit_evaluations.cost_usd` | 半天 | CORR-0.4 |
| ✅ **E2E-5** | **跑 + 驗 e2e** — **DONE 2026-05-30**。完整鏈打通：真資料(18,682 markets) → war selector 449/500(撞 cap) → 全 7 factor 真 gpt-4o-mini(3143 evals 全 `stub=false`，total cost **$0.2915**) → committed score **47.1078 / 181 components** → `curl localhost:8001/indexes/polymarket-war-index/score` 回 47.11 → pmi-web SSR `localhost:3030/indexes/polymarket-war-index` 渲出 47.11 / 181 / "War Index"。 | ✅ | SHIP-0.4 重驗 |

**合計 ~3-4 天**（單人），不含 election。

---

## ✅ 完成紀錄（2026-05-30）

**第一次真實 end-to-end 跑通**——真 Polymarket 資料 + 全 factor 真 LLM + 對外 serve + SSR 渲染，全鏈綠燈：

| 階段 | 結果 |
|---|---|
| 真資料 ingest | 18,682 markets / 561,342 price snapshots，`audit_source_health=healthy`，DNS 沒被擋（`dns:[1.1.1.1,8.8.8.8]` 有效，不需 monkeypatch） |
| war selector | 449 markets 進評估（pre-collapse 撞 500 cap → CORR-2.6） |
| 全 7 factor 真 LLM | 3143 evals 全 `stub=false`，gpt-4o-mini-2024-07-18，total cost **$0.2915** |
| committed score | **47.1078**，181 components（after collapse） |
| serving | `/indexes/polymarket-war-index/score` 200 → 47.11；pmi-web SSR 渲出 |

**踩到的真實 gap（已記在風險區）**：pipeline 是 **concurrency=1 循序評估**（連 cache-only 重算都因 3143 次循序 DB lookup 跑 ~5-6 分；真 LLM 全跑要 ~1hr）。最高優先後續 = **factor eval 並發化**（搬 Micah 三層 async fanout）。

**剩餘小尾巴**：E2E-3（prompt few-shot 強化，目前 rationale 已合理）、E2E-4（cost roll-up 到 `audit_pipeline_runs`，目前靠 SQL SUM 得 $0.2915）。

---

## 明確跳過（本次不做）

- ❌ **SHIP-1.x cloud deploy**（R5 = 筆電）
- ❌ **CORR-0.6 / 0.7**（API auth enforce + key CLI）— demo 開放讀取即可
- ⏭ **CORR-0.5** account-wide circuit breaker — tenacity 既有 retry 對 demo 夠
- ⏭ **CORR-0.8** deps.py 雙 commit bug — 只在 auth 掛上才咬，demo 不掛 auth 先擱（1h 修，順手做也行）
- ⏭ **Anthropic provider**（R2 = OpenAI only）
- ⏭ **Election seats**（CORR-1.1~1.5）— war index 先跑通再說

---

## 風險 / 待觀察

- **E2E-1 DNS**：若 HiNet 連直查 1.1.1.1（UDP/53）都透明攔截，`dns:` 無效，必須走 DoH 或移植 monkeypatch。先試 `dns:`，不行再升級。
- **E2E-2 成本**：7 factor × 真市場數（war index 撈到幾百個就 ×7 次 gpt-4o-mini call）。先用小 `selector.limit` 或 mock 子集驗流程，再放開全量，避免一次燒 OpenAI 額度。
- **真市場數量**：live ingest 撈到 **18,682 markets**，war-index selector 過濾後 **449 markets** 進 LLM 評估（接近 CORR-2.6 `.limit(500)` 寫死上限——若 war 市場再多會 silently 漏，要排 CORR-2.6）。

### 2026-05-30 實測新發現：pipeline 是 sequential 評估（效能 gap）

跑真實 B（449 markets × 7 factors）時實測：**factor evaluation 是 concurrency=1 的循序執行**（OpenAI POST 一次一個，~1.7s/call）。449 markets × 6 個新 factor ≈ 2694 次 call ≈ **~1 小時/輪**。

- 這跟 CLAUDE.md §2「three-tier async fanout」的設計目標不符——Micah 有 topic semaphore × batch×factor gather × OpenAI max_concurrent 三層並發，pmi-core 的 P0 pipeline 還沒搬。
- **影響**：on-demand score 路徑（§3.2）若同步等 = 使用者等 1 小時不可接受。
- **對應 TODO**：本來 §跑得對 CORR-4.6（Arq + on-demand）涵蓋「換 worker」，但**更根本的是 pipeline 內缺 async gather**——建議新開一條 **CORR-3.x「factor eval 並發化」**（asyncio.gather + semaphore，搬 Micah `_evaluate_shared.py` 的三層 fanout pattern），把單輪從 ~1hr 壓到數分鐘。Batch API（CORR-5.3）是另一條互補路徑（nightly recompute 半價）。
- **demo 緩解**：第一次真實跑可先把 selector 限到 ~20-50 markets（需 CORR-2.6 的 limit 可覆寫）驗流程，再放全量。

---

## ✅ 新 UI 接真實資料（2026-05-30）

把 war-index 真實數據接進 `pmi-new-frontend`（static React-via-Babel 原型，無 build/fetch，資料來自 `window.PMI_MODEL` / `window.MICAH`）：

- **做法**：生成真實 [`pmi-new-frontend/pmi-model.js`](pmi-new-frontend/pmi-model.js)（原 sample 備份成 `pmi-model.sample.js.bak`）。`pmiScore=47.1078`（真 aggregator 輸出）、`pmiName='Polymarket War Index'`、13 個 contract = **真 LLM 確認（`directly_about_war=1`）的 top war 市場 by 24h volume**，帶真 `title / last_price / volume`。`meta` 記 components=181 / universe=449 / ingested=18682 / cost=$0.2915。
- **serve**：`python3 -m http.server 8090`（@ `pmi-new-frontend/`）→ `http://127.0.0.1:8090/`。預設 'world' 視圖仍是 sample；點頂部 **◰ Research Desk / A·Analyst density / B·PMI Simulator** 看真實 war index。
- **JS 已 `node --check` 過。**

### 暴出來的資料品質問題（記下來）

- 🐛 **keyword selector 假陽性**：`strike` 關鍵字 match 到「Counter-**Strike**: magic vs FaZe」「**Stake** Ranked」等電競市場。靠 `directly_about_war` LLM gate 過濾掉了（UI 成分用 LLM-confirmed 撈），但 keyword pool 本身髒 → 強化 selector（更精準 keyword / 上 semantic selector **CORR-3.6**）。

---

## 📋 未完成 TODO（2026-05-30 彙整，依優先序）

> 真實 war-index e2e 已跑通（E2E-1/2/5 ✅）。以下是這輪暴出來、還沒做的：

| # | Todo | 為什麼 | 對應 |
|---|---|---|---|
| **T1（最高）** | **factor eval 並發化**（具體做法見下方 ▼） | 現在 concurrency=1，449×7 循序跑要近 1 小時，on-demand 路徑不可用 | 新開 CORR-3.x；CLAUDE.md §2 |
| **T2** | **cost roll-up 到 `audit_pipeline_runs`** — 目前 pipeline-level cost 是 NULL，靠 SQL `SUM(audit_evaluations.cost_usd)` 才得 $0.2915 | 計費 / 成本可見性 | CORR-0.4（E2E-4） |
| **T3** | **selector 品質** — keyword 假陽性（Counter-Strike→strike）；上 semantic selector 或精修 keyword | war pool 髒，靠 LLM 事後濾浪費成本 | CORR-3.6 |
| **T4** | **selector `.limit(500)` 可覆寫** — war 已撞 500 cap，再多會 silently 漏；也讓 demo 能限小量省成本 | 資料完整性 + demo 成本控制 | CORR-2.6 |
| **T5** | **新 UI：真實 conditional-impact 矩陣** — 現在 `cond={}`（空），PMI Simulator 的依賴網路是空的 | §5 conditional markets 差異化 | 新開；CLAUDE.md §5 / CORR-8.7 |
| **T6** | **新 UI：真實 brier** — 現在用 `(1-LLM_confidence)²` proxy；真 brier 需 resolution-outcome scoring | Analyst 視圖校準指標 | 新開（需 resolved 結算追蹤） |
| **T7** | **新 UI：live fetch 取代 static 快照** — 現在 `pmi-model.js` 是一次性 DB 快照；加 pmi-api fetch + CORS（或 build step） | 數據會過時 | 新開 |
| **T8** | ~~**新 UI：world/senate/state 視圖接真實 election index**~~ → **senate 部分移到 [`TODO-跑出來.md`](TODO-跑出來.md) SHIP-2.5**（board endpoint + 移植進 pmi-web production，依賴 CORR-1.6 majority 機率 + NEXT-3.3 seat aggregator）。world/state 熱力圖視圖仍待辦（沿用 `MICAH` sample 直到有 per-state election index） | senate → SHIP-2.5；world/state 仍假資料 | 依賴 CORR-1.1~1.6 / NEXT-3.3 |
| **T9** | **prompt few-shot 強化（E2E-3）** — 現有 rationale 已合理，可選 | 評估品質 | CORR-1.5 精神 |
| **T10** | **容器時鐘 skew** — pmi-core 容器時間有 ~7hr 偏移（score timestamp 跳 18:08→01:02）；查 TZ / NTP | timestamp 對不準，不影響資料正確性 | 新開（環境） |

> **下一步建議**：T1（並發化）最有感——解掉「跑一輪 1 小時」這個唯一真正卡 demo 的瓶頸。其餘 T2~T10 多為品質 / 完整性 / 環境尾巴。

---

### ▼ T1 具體實作計畫：factor eval 並發化（2026-05-30 設計）

**根因（不只是「沒並發」）**：[`engine/pipeline.py`](pmi-core/pmi_core/engine/pipeline.py) L227-247 是雙層
`for market → for factor → await evaluate_factor()` 一次一個。而 `evaluate_factor`
把 **cache 查詢 + LLM 呼叫 + DB 寫入 + MLflow child run** 四件事綁在一起、共用同一個
`session`。**SQLAlchemy AsyncSession 非並發安全**（多 coroutine 同時用一個 session →
`InvalidRequestError`），所以**不能直接 `asyncio.gather(evaluate_factor...)`**。

**關鍵洞**：[`llm/openai_client.py`](pmi-core/pmi_core/llm/openai_client.py) `OpenAIProvider.evaluate`
是**純 async HTTP、零 DB 依賴**，回 `LLMResponse`。**只有 LLM 呼叫需要並發，DB 寫入維持序列**。
正好對上 CLAUDE.md §2 / Micah `_evaluate_shared.py` 三層 fanout。

**改動範圍**：
1. **拆 `factor_evaluator.py`**（1 函式 → 3）：
   - `run_llm(market, factor, resolved) -> LLMResponse`：純 LLM，**無 session**，可並發。
   - `persist_evaluation(session, ..., llm_response|None, fallback_reason|None) -> AuditEvaluation`：
     純 DB 寫入 + MLflow child run（把現有 session.add/flush + MLflow 那段搬來），序列呼叫。
   - 保留 `_stub_score`（純算、無網路）。
2. **`pipeline.py` 雙層 for → 四階段**：
   - **階段1 批次 cache 載入**：每 factor 一次 `WHERE market_id IN (...)` 查詢建
     `existing[(market_id, factor_id)]` dict（**殺掉 3143 次循序 SELECT → 7 次 IN 查詢**，
     cache-only 重算 5-6 分 → 秒級）。
   - **階段2 待做清單**：`todo = [(m,f) for m in markets for f in ir.factors
     if (m.id,f.id) not in existing and not _is_stub(resolved[f.id])]`。
   - **階段3 並發 LLM**（唯一並發點）：`sem = asyncio.Semaphore(CONC)`，
     `gather(*[_one(m,f) ...])`，`_one` 內 `async with sem: try run_llm / except → (m,f,None,err)`。
   - **階段4 序列寫入**（單一 session）：cached 直接用 existing；stub 序列算；
     LLM 成功/失敗 → `persist_evaluation`（失敗 fallback stub，行為同現在）。
3. **`settings` 加 `llm_concurrency`**（env `PMI_LLM_CONCURRENCY`，預設 10）。
4. **`openai_client` reuse client**：L98 每次 call 都 `AsyncOpenAI(...)` 新建 → 改成
   `get_provider` 快取 provider + 共用一個 client（省連線開銷）。

**預期**：2694 真 LLM call @ concurrency 10 → ~1hr **→ ~5 分**；cache-only → 秒級。

**收尾細節**：
- gpt-4o-mini tier 額度寬，CONC=10 安全；tenacity retry（SHIP-0.6）已涵蓋 429 退避。
- **MLflow child-run-per-eval 是次要 perf sink**（fresh eval 每筆開一個 network run，階段4 序列開會慢）→ 另記：可 batch 化或加 flag 關掉 per-eval child run。
- 這是 **in-process 並發**（對 P0 supercronic 夠）。**Arq/Temporal（CORR-4.6）正交**——那是把整個 tick 丟 worker，不影響 tick 內部 fanout。

**驗證**：war index 重跑——全 cache 秒級、真 LLM（清掉 evals 後）~5 分，score 應與序列版一致（47.1078）。

---

## 🖥️ 現況快照 + 重現 runbook（2026-05-30，session 結束時）

> 這次 session 把東西跑起來但**狀態是活的/ephemeral**，記下來免得下次摸黑。

### 目前在跑（docker compose，reid 筆電）
| service | 狀態 | 備註 |
|---|---|---|
| micah-postgres | up | 真資料在 volume（**markets 已從 18,682 → 55,574**，ingest 還在 poll） |
| pmi-mlflow | up | tracking + prompt registry |
| pmi-ingest | up | 每 300s poll 真 Polymarket（`dns:[1.1.1.1,8.8.8.8]` + `POLYMARKET_USE_MOCK=false`） |
| pmi-api | up | `localhost:8001` |
| pmi-web（舊 scaffold） | up | `localhost:3030`，SSR 渲 47.11 |
| 新 UI static server | **ephemeral nohup** | `python3 -m http.server 8090` @ `pmi-new-frontend/`；reboot/logout 就沒了 |
| **pmi-workers** | **沒開** | ⚠️ **分數不會自動刷新**；要連續評分得 `docker compose --profile pmi up -d pmi-workers` |

### 幾個會「漂」/ephemeral 的點
- **score 47.1078 是快照**：算的時候 universe=18,682 markets / 449 war；現在 DB 已 55,574，**重算會得到不同分數**（更多 war 成分）。
- **新 UI `pmi-model.js` 是凍結快照**（13 contracts，當時資料）→ 對應 **T7 live fetch** 才會跟著動。
- **7 個 factor model 在 DB volume**（id=1~7，active@production）——**volume 一旦清掉就沒了**，要照下面重 register。
- **容器時鐘 ~7hr skew**（T10），timestamp 會怪但資料正確。

### 重現 / 刷新 demo 的命令
```bash
cd /Users/reid/micah            # compose + justfile 在 workspace root，不在 pmi_data_platform/
# 0) Docker Desktop 要先開（open -a Docker）
# 1) 起底層
docker compose --profile pmi up -d postgres mlflow
docker compose --profile pmi run --rm pmi-core migrate
docker compose --profile pmi run --rm pmi-core seed          # 13 fixture markets + 5 index defs
# 2) 真資料 ingest（DNS/flag 已在 compose/.env，起來就 poll）
docker compose --profile pmi up -d pmi-ingest
# 3) 若 DB 是全新的 → 重 register+promote 7 個 war factor model（否則跳過）
docker compose --profile pmi run --rm pmi-core score polymarket-war-index   # 先跑一次註冊 prompts
docker compose --profile pmi run --rm --entrypoint bash pmi-core -c '
  for f in direction armed_conflict state_actor kinetic_action near_term high_severity directly_about_war; do
    id=$(pmi-core models register --factor "$f" --prompt-name "factors/$f" --prompt-version 1 \
         --llm gpt-4o-mini-2024-07-18 --temperature 0.1 --no-mlflow \
         | python3 -c "import sys,json;print(json.load(sys.stdin)[\"id\"])")
    pmi-core models promote "$id" --stage production; done'
# 4) 真實全 LLM 評分（⚠️ 目前循序，449×7 要 ~1hr；T1 並發化後 ~5 分）
docker compose --profile pmi run --rm pmi-core score polymarket-war-index
# 5) serving
docker compose --profile pmi up -d pmi-api
docker compose --profile pmi --profile pmi-web up -d pmi-web      # 舊 UI :3030
( cd pmi_data_platform/pmi-new-frontend && python3 -m http.server 8090 )  # 新 UI :8090
# 驗：curl localhost:8001/indexes/polymarket-war-index/score
```

### 重新生成新 UI 的真實 `pmi-model.js`（資料刷新後）
快照來源 = `audit_evaluations`（`directly_about_war=1, stub=false`）join 最新 `ts_price_snapshots`，
top N by volume_24h → 套 `PMI_MODEL` shape。生成腳本邏輯記在本檔「新 UI 接真實資料」段；
原 sample 備份在 `pmi-new-frontend/pmi-model.sample.js.bak`。
