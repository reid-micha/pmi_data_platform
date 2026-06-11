# TODO: Next Version — Typed Multigraph Scoring

> **目的**：把 PMI scoring 從「扁平 contract list + 寫死 aggregator」升級成 **typed multigraph**：contract↔contract 之間建 typed 邊,collapse / 互斥家族 / 翻轉 / 邏輯一致性全部從**圖結構推出來**,而不是寫死在 selector / regex / `ROLE_FLIPS`。這是把 senate PoC 的一次性 hack 提煉成 platform-wide engine 能力。
> **不負責**：把分數 ship 出來看得到、auth、observability、cloud deploy（→ [`TODO-跑出來.md`](TODO-跑出來.md)）；以及單純的 correctness bug / schema 補洞（→ [`TODO-跑得對.md`](TODO-跑得對.md)）。本檔是**架構方向**,落地時很多步會回頭吃掉 / 取代 `TODO-跑得對.md` 的 CORR-1.x。
>
> **整合來源**：2026-05-31 chat 對話（contract 歸類 → graph 解法 → typed multigraph → formula registry → pipeline 對比）。
> **架構對比圖**：[`docs/pipeline-comparison.html`](docs/pipeline-comparison.html)（瀏覽器開）— 左「現況單迴圈」vs 右「新雙迴圈」,顏色標出新增/改動/不變 + 三個量的位置。
> **最後更新**：2026-06-11 — **active 清單已整併到 [`TODO.md`](TODO.md)（主入口）**；本檔整本仍未動工,保留為設計定稿。Phase 0（Formula Registry,NEXT-3.x）無 edge 依賴,可最先動。

---

## 0. 設計決策（為什麼這樣做,定稿後別再翻案）

> 這節是 invariant,實作時所有 PR 都要守住。

| # | 決策 | 理由 |
|---|---|---|
| **D1 typed multigraph,不是 single-scalar graph** | 邊是 `(type, weight, direction, confidence)`,不是一個 0..1 分數 | `0.9 相似` ≠ `0.9 蘊含` ≠ `−0.9 相關`;單一 scalar 把「該翻轉/該求和/該 collapse/只是弱相關」的資訊壓死 |
| **D2 結構邊 vs 統計邊分流** | 結構邊（`equivalent/complement/mutually_exclusive/implies/same_event`）靜態、進 audit lineage,存 `core_market_edges`;統計邊（`correlates` 價格相關）會漂、定期重算,存 `ts_market_correlations` | 生命週期不同,混一張表是坑 |
| **D3 三個量分清楚** | `probability`=被加權的值(0..1) / `volume`=權重(mass,正交) / 佔比=family 內 normalize 的衍生視角(Σ=1) | 最常見錯誤是「volume 大當機率高」= 把信心當幅度 double-count |
| **D4 agent 提議邊,不歸類節點** | edge-proposer 給一對 (A,B) 判 `relation/direction/confidence`;role/bucket/family 由圖演算法 emerge | 關係 local 可逐條 adversarial 驗;LLM 一次性宣告桶不穩 |
| **D5 formula registry（值軸選 c）** | aggregator 改 registry：`weighted_average_x_100` / `partition_sum` / `expectation` + 預留受限 mini-language;**不做 `eval()` 任意字串**（RCE 雷） | 機率型 / 期望型共用 family 結構,只差最後 `Σp` vs `Σ N·p` |
| **D6 留在 Postgres,不上 Neo4j** | 一張 `core_market_edges` + recursive CTE + in-memory networkx | 符合 §3.1「single Postgres first、能不加 infra 就不加」 |
| **D7 邊全域共用,雙迴圈解耦** | 迴圈 A（edge 維護,market 全域,ingest 觸發）/ 迴圈 B（scoring,per-index per-tick,只讀邊） | 最貴的 LLM 關係判斷攤平 + 跨 index 共用 + 增量;scoring tick 只讀邊(便宜) |
| **D8 graceful degradation** | edge 表空 → 迴圈 B 退化成現況扁平行為 | 跟「MLflow 掛掉不擋 evaluation」同原則 |
| **D9 GraphRAG 借 pattern 不 adopt framework** | scoring graph（typed 邏輯邊）自建;只在未來 discovery/explanation（Leiden 群 + community summary,§8 AI 層）借 GraphRAG 方法論,且用輕量 `igraph`/`graspologic` | GraphRAG 的 edge 哲學（自然語言描述 + 單一 strength）跟 PMI 要的邏輯一致性相反 |

**值軸（D5 展開）**：
- `probability_pct`：P(事件) × 100（Fed uncertainty、senate「R 控制」）
- `expectation`：E[X] = Σ 佔比 × 數量（senate E[席次]）
- custom：受限 mini-language（白名單 `Σ/mean/E[]/+−×÷` 套在具名 aggregate 上）— **phase 後做**

---

## 1. Storage — `core_market_edges`

| # | Todo | 估算 | 對位 |
|---|---|---|---|
| **NEXT-1.1** | `models/core_market_edge.py` + **alembic** 新 migration：`(src_market_id, dst_market_id, edge_type, directed, weight, confidence, derived_by, prompt_id, prompt_sha256, model_id, model_response, as_of)`;`UNIQUE(src,dst,edge_type,prompt_id,model_id)`;`CHECK(src<>dst)`;無向邊 canonical `src<dst` | 1 天 | D1/D2/D6 |
| **NEXT-1.2** | `ts_market_correlations` 表（統計邊,獨立於上）— schema 預留即可,ingest 算法 phase 後 | 半天 | D2 |
| **NEXT-1.3** | edge 當 audited object：lineage 欄位沿用 `audit_evaluations` 那套,append-only,reuse 不變式（prompt/model + 兩邊 resolution text 沒變 → 不重問） | （含在 1.1） | D4/§4 |

---

## 2. Engine — 圖建構 + 推結構

| # | Todo | 估算 | 對位 |
|---|---|---|---|
| **NEXT-2.1** | `engine/market_graph.py`：`build(edges)→nx.MultiDiGraph`（無向邊雙向加邊,directed 保方向） | 1 天 | D6 |
| **NEXT-2.2** | 推結構（純圖演算無 LLM）：`equivalent` 弱連通分量 → collapse 代表點（餵現成 [`bucket_collapser.py`](pmi-core/pmi_core/engine/bucket_collapser.py)）;`mutually_exclusive` 分量 → partition 家族;`complement` → 翻轉旗標 | 2 天 | D3 |
| **NEXT-2.3** | `engine/edge_rules.py`：deterministic bridge — 從 `condition_id` + senate regex 產 `same_event/complement/mutually_exclusive` 規則邊。**先於 LLM**,讓 Phase 1 全程 deterministic | 1 天 | D7 / CORR-1.3 |
| **NEXT-2.4** | `engine/coherence.py`：`implies` DAG topological sort → isotonic 投影（`scipy` 最小範數）;違反量 `Σ max(0, p_src−p_dst)` 寫 `ts_index_scores.detail` 當套利信號 | 3 天 | D1 / §5 cross-market arbitrage |

---

## 3. Engine — Formula Registry（取代寫死 aggregator）

> 這節吃掉 / 取代 [`TODO-跑得對.md`](TODO-跑得對.md) 的 **CORR-1.1**（formula expression evaluator）、**CORR-1.2**（baseline/total_seats）,並落地 senate PoC 暗示的 **CORR-1.6**（partition_sum）、**CORR-1.7**（E[seats]）。

| # | Todo | 估算 | 對位 |
|---|---|---|---|
| **NEXT-3.1** | `aggregator.py` 重構成 `FormulaSpec(fn, params_model, unit)` + `FORMULAS` registry + dispatch | 2 天 | D5 / CORR-1.1 |
| **NEXT-3.2** | `engine/agg_params.py`：`WAParams` / `PartitionParams` / `ExpectationParams`（pydantic,驗 IR `aggregation` 區塊,缺 params load 時 fail） | 1 天 | D5 / CORR-1.2 |
| **NEXT-3.3** | 三個內建 formula：`weighted_average_x_100`（原樣移植,golden regression byte-identical）、`partition_sum`（families 空時退化）、`expectation`（Σ N·p） | 2 天 | CORR-1.6 / CORR-1.7 |
| **NEXT-3.4** | `dsl/ir.py`：`aggregation.formula` 改 registry key 驗證（load 時,非 score 時炸） | 半天 | D5 |
| **NEXT-3.5** | **alembic**：`ts_index_scores` += `formula` / `unit` / `detail JSONB`;API/web 靠 `unit` 決定 render（`probability_pct` 顯示 % / `expectation` 顯示「E[席次]=52.3」） | 半天 | D3 |
| **NEXT-3.6**（後做） | 受限 mini-language `expression` evaluator（白名單運算子,**非** `eval()`） | 1 週 | D5 custom |

---

## 4. Engine — Edge-Proposer Agent

| # | Todo | 估算 | 對位 |
|---|---|---|---|
| **NEXT-4.1** | candidate generation（blocking）**選項 A**：同 event/category + title 詞重疊 → 候選對（砍 O(n²),零新依賴,embedding 延後） | 2 天 | D7 |
| **NEXT-4.2** | `engine/edge_proposer.py` + `prompts/edges/relation-v1.md`：structured output `{relation, direction, confidence, rationale}`;lineage 蓋 `prompt_sha256/model_id`;append-only;reuse | 3 天 | D4 |
| **NEXT-4.3** | MLflow 鏡像（沿用 evaluation child run 那套） | 1 天 | §6.1 |
| **NEXT-4.4** | CLI：`graph build --rules` / `graph propose --index <id>` / `graph show --index` | 1 天 | — |
| **NEXT-4.5**（延後）| candidate generation **選項 B**：embedding kNN blocking — 依賴尚未存在的 Tier 0 embedding pipeline,**明確 defer**,只在需要跨 event 語意連邊才做 | — | D9 / CORR-2.3 |

---

## 5. 分階段落地（每階段可獨立驗收）

> 原則：風險低先做、每階段跑得出 demo、LLM 不確定性盡量晚引入。全程 `pmi_data_platform/` 走 Docker（`just pmi-*`）。

### Phase 0 — Formula Registry（無 edge 依賴,最低風險）
- 範圍：NEXT-3.1 ~ 3.5
- **驗收**：`just pmi-score` 5 個現有 index 分數 **byte-identical**;`partition_sum`/`expectation` 合成 component 單測綠燈。

### Phase 1 — Edge 儲存 + 圖推結構（rule edges,不碰 LLM）
- 範圍：NEXT-1.1、2.1、2.2、2.3
- **里程碑驗收**：senate index 經「`edge_rules` 規則邊 → 家族 → `partition_sum`」算出的數 **= senate PoC `_aggregate_pmi` 的值**（全程 deterministic,證明整條圖路徑對）。

### Phase 2 — Edge-Proposer Agent（引入 LLM）
- 範圍：NEXT-4.1 ~ 4.4
- **驗收**：senate 用 agent 邊算出的分數 ≈ Phase 1 規則邊版本（誤差容忍內）;連跑兩次零新 LLM call（reuse/idempotency）。

### Phase 3 — Coherence 投影（走到「邏輯一致 PMI」）
- 範圍：NEXT-2.4
- **驗收**：含 `implies` 邊的 index 顯示 coherence-adjusted 分數 + `detail` 裡有違反量。

### Phase 4 —（延後）embedding blocking + custom expression + 統計邊
- 範圍：NEXT-4.5、NEXT-3.6、NEXT-1.2 ingest 算法
- 依賴 Tier 0 embedding pipeline;不擋前三階段。

---

## 6. 與既有 TODO 的關係（避免重工）

| 既有項 | 關係 |
|---|---|
| `TODO-跑得對.md` **CORR-1.1**（formula expression evaluator） | **被 NEXT-3.x 取代** — registry 是更乾淨的架構 |
| **CORR-1.2**（baseline/total_seats） | 併進 `ExpectationParams`（NEXT-3.2） |
| **CORR-1.3**（`condition_id` column） | NEXT-2.3 規則邊的前置;先做 CORR-1.3 |
| **CORR-1.4**（bucket collapse,✅done） | 被 NEXT-2.2 `equivalent`-edge collapse **泛化**,但現況 collapser 直接複用當代表點選擇 |
| **CORR-1.6 / 1.7**（partition_sum / E[seats],見 §15.10） | **由 NEXT-3.3 落地** |
| **CORR-2.3**（embedding dim 動態化） | NEXT-4.5 embedding blocking 的前置 |

---

## 7. 收尾（每階段做一點）
- 文件：更新 [`../CLAUDE.md`](../CLAUDE.md) §15.10 對位表 + 本檔狀態 + 在 `TODO-跑得對.md` CORR-1.x 標註「被 NEXT-3.x 取代」。
- ops：edge 維護先掛 supercronic `graph build` job;上 Arq（CORR-4.6）時改 fire-and-forget。
