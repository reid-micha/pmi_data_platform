# HOWTO: 新增 / 修改一個 PMI Index

> **這份給誰**：要在 pmi-platform 上開發一個新 PMI 指數的人（reid 自己，或日後接手的開發者 / 研究員）。
> **不負責**：新的 aggregator（`formula: ...` enum 擴張，例如 senate seats E[X]）、新的 selector type、schema migration——那些是 engine 層的事，要動 [`pmi-core/pmi_core/engine/`](pmi-core/pmi_core/engine/) 跟 alembic migration，規模跟 CORR-1.6/1.7 同級。
> **前置**：dev stack 已起（`docker compose --profile pmi up -d postgres`），pmi-core/api/workers image 已 build（`just build-pmi-all`）。
> **最後更新**：2026-05-31。

---

## 0. 心智圖

```
   ┌─ Step 1  起 YAML  ────────────────────────┐  iterate in-memory，秒級、$0
   │  pmi-core/pmi_core/index_defs/<id>.yaml   │
   └────────────────────┬──────────────────────┘
                        ▼
   ┌─ Step 2  缺的 factor 寫 markdown prompt  ─┐
   │  prompts/factors/<factor>-v1.md           │
   └────────────────────┬──────────────────────┘
                        ▼
   ┌─ Step 3  dry-run  ────────────────────────┐  host in-process，無 DB / LLM
   │  just dry-run YAML=…                      │  ← iterate selectors/weights 卡這
   └────────────────────┬──────────────────────┘
                        ▼
   ┌─ Step 4  seed 落 DB  ─────────────────────┐  SCD2 寫 core_index_definitions
   │  just pmi-seed                            │
   └────────────────────┬──────────────────────┘
                        ▼
        ┌───────────────┴───────────────┐
        ▼  路徑 A：stub 先通 plumbing    ▼  路徑 B：真 LLM
   不 register factor model        ┌─ Step 5  prompt + factor model ─┐
   → fallback stub-deterministic   │  跑一次 score 把 prompt 寫進     │
   → cost = $0                     │  core_prompts; 再 models         │
                                   │  register + promote              │
                                   └─────────────┬────────────────────┘
        ┌───────────────────────────────────────┘
        ▼
   ┌─ Step 6  score  ──────────────────────────┐
   │  just pmi-score INDEX_ID=<id>             │
   └────────────────────┬──────────────────────┘
                        ▼
   ┌─ Step 7  驗 serving  ─────────────────────┐
   │  GET /indexes/<id>/score                  │
   │  GET /indexes/<id>/explain                │
   │  pmi-web :3030/indexes/<id>               │
   └────────────────────┬──────────────────────┘
                        ▼
   ┌─ Step 8 (optional)  鎖 e2e baseline  ─────┐
   │  tests/e2e/conftest.py:                   │
   │  EXPECTED_INDEX_IDS / EXPECTED_SCORES     │
   └───────────────────────────────────────────┘
```

**最短路徑（reuse 既有 factor）**：Step 1 → 3 → 4 → 6 → 7，整個 < 10 min，stub mode 零成本。

---

## 1. 起 YAML

抄一份既有的改：

```bash
cp pmi-core/pmi_core/index_defs/polymarket-war-index.yaml \
   pmi-core/pmi_core/index_defs/<new-id>.yaml
```

必填欄位（schema 在 [`pmi-core/pmi_core/dsl/schema/index-def.schema.json`](pmi-core/pmi_core/dsl/schema/index-def.schema.json)，IDE 可掛 YAML 驗證）：

| 區塊 | 重點 |
|---|---|
| `id` / `version` | id 是 slug、URL-safe；新 index 從 `version: 1` 起。改版（不是新 index）才 bump |
| `selectors[]` | 至少一個。`keyword` 是 Postgres `\m...\M` word-boundary regex（會撈中性詞像 "strike" → Counter-Strike，挑詞時想清楚）；`category` 是 Polymarket tag；`semantic` 已有 IR stub 但 engine P2 才接 |
| `factors[]` | `prompt_ref` 指 `prompts/factors/<name>-v<n>` (對應 markdown 檔)。`weight: null` 的 factor 不參與 relevancy（war-index 的 `direction` 就是這樣）。權重不需要加總到 100，aggregator 會除總和 |
| `weighting.liquidity.method: quantile` | 目前唯一支援的方法。boost rules 是 optional |
| `aggregation.collapse` | 同一條 condition 多個 outcome 自動 collapse（避免重複計算）；新 index 預設 enabled |
| `aggregation.formula` | 目前 `weighted_average_x_100` / `partition_sum`（後者 senate seats 系列在用）。**要新公式 = engine 改動，不是寫 YAML 能解** |
| `aggregation.min_components` | P0/P1 demo 用 `1`，真實對外建議 ≥10 |

---

## 2. 缺的 factor 寫 prompt

新 factor 才需要這步。reuse 既有 factor → 直接 `prompt_ref` 過去就跳到 Step 3。

新檔放 [`pmi-core/pmi_core/prompts/factors/<factor>-v1.md`](pmi-core/pmi_core/prompts/factors/)，**版號 `-v1` 從 1 起算，append-only：改 prompt 就 bump 到 `-v2.md`，舊檔不刪**（`core_prompts` 表也是 append-only，sha256 鎖死）。

模板（抄 [`directly_about_war-v1.md`](pmi-core/pmi_core/prompts/factors/directly_about_war-v1.md)）：

```markdown
# Factor prompt: <factor_id> (v1)

You are evaluating whether <one sentence about the question>.

Return JSON with shape:
```json
{ "value": 0 or 1, "confidence": 0.0..1.0, "reasoning": "<one sentence>" }
```

Mark `value=1` only if:
- <criteria>

Mark `value=0` if:
- <criteria>

## Market

Title: {market_title}
Description: {market_description}

Return the JSON only — no extra commentary.
```

**佔位符只能用 `{market_title}` `{market_description}`**——其他變數 engine 不會替換。
**factor type 影響輸出 schema**：`binary` → `value: 0|1`；`ternary` → `value: -1|0|+1`；`score` → `value: 0..100`。

---

## 3. Dry-run（最重要的 iteration loop）

**只動 YAML 的時候千萬別跳過這步直接 seed + score。** Dry-run 在 host process 跑、無 DB、無 LLM（stub evaluator），秒級回 selector hit、formula、collapse 結果。

```bash
just dry-run YAML=pmi_core/index_defs/<new-id>.yaml --compact
# 看細節（每個 factor 評估）：
just dry-run-full YAML=pmi_core/index_defs/<new-id>.yaml
```

要看的：

| 訊號 | 怎麼讀 |
|---|---|
| `selectors_candidates` | selector 抓到幾筆。0 → keyword 太窄；幾百 → 可能太寬 |
| `aggregation.component_count` | collapse 後實際納入幾筆。跟 `candidates_returned` 差距太大表示 collapse 太強 |
| `aggregation.score` | stub 跑出來的 deterministic 值。不是真分數，但相對大小有訊號 |
| `formula_declared` vs `formula_used` | 兩個不一樣表示 fallback 了（譬如 partition_sum 沒湊到群組 → 退 weighted_average） |

Iterate 在這層收斂——選詞、調 weight、調 collapse window 都在這裡試。

---

## 4. Seed 落 DB

```bash
just pmi-seed
```

掃 `index_defs/*.yaml`、新 sha256 → 寫新 row 進 `core_index_definitions`，舊 row 自動 `effective_to = now()`（SCD2）。確認：

```bash
docker compose --profile pmi run --rm pmi-core list-defs
# 或直接 psql 看 core_index_definitions where index_id = '<id>'
```

---

## 5.（可選）真 LLM：prompt + factor model

**stub 跑通就好的話跳過這步**，直接到 Step 6。

要真 LLM 跑這個 factor，三件事：

```bash
# 5a. 先 score 一次（任何 index，跑得到這個 factor），engine 會自動把
#     prompts/factors/<factor>-v1.md 寫進 core_prompts（_ensure_prompt 路徑）
just pmi-score INDEX_ID=<new-id>
docker compose --profile pmi run --rm pmi-core prompts list   # 確認 row 存在

# 5b. 註冊 factor model bundle (staging)
docker compose --profile pmi run --rm pmi-core models register \
    --factor <factor_id> \
    --prompt-name factors/<factor> \
    --prompt-version 1 \
    --llm gpt-4o-mini-2024-07-18 \
    --temperature 0.1

# 5c. promote 到 production（原子 demote 舊 active row）
docker compose --profile pmi run --rm pmi-core models promote <model_id> --stage production
```

之後每次 `score` 就走真 LLM、寫進 `audit_evaluations` 的 row 會帶 `stub=false`、`cost_usd > 0`。

**只有部分 factor 有 promoted model 也 OK** ——其他 factor 自動 fallback stub。混合 mode 的紀錄會在 `audit_evaluations.model_response.model_source` 留 `registry` / `yaml` 痕跡。

---

## 6. Score

```bash
just pmi-score INDEX_ID=<new-id>
```

寫一筆進 `ts_index_scores`，`component_audit_ids[]` 指回每筆 `audit_evaluations`（lineage）。

- stub mode：449 markets × 7 factor 約幾秒
- 真 LLM：concurrency=1 sequential（known gap，**~1hr** for war-index 規模），CORR-Z 之前都這樣

歷史：

```bash
just pmi-history INDEX_ID=<new-id>
```

---

## 7. 驗 serving

```bash
# API
curl -s localhost:8001/indexes/<new-id>/score | jq
curl -s localhost:8001/indexes/<new-id>/explain | jq '.components[0]'

# Web UI
open http://localhost:3030/indexes/<new-id>
```

`explain` 才是 debug 的金礦——回每個 component 的 factor breakdown、relevancy、last_price。stub mode 全部 binary=1.0 / ternary=+1.0；真 LLM 才看得出真實 disagreement。

---

## 8.（可選）鎖 e2e baseline

新 index 要進 CI regression 防線，編輯 [`tests/e2e/conftest.py`](tests/e2e/conftest.py)：

```python
EXPECTED_INDEX_IDS = {
    "polymarket-war-index",
    ...,
    "<new-id>",                             # ← 加進去
}

EXPECTED_SCORES = {
    ...,
    "<new-id>": <stub-mode 跑出來的數字>,    # ← 4 位小數
}
```

跑 `just pmi-e2e` 綠 → 新 index 進入回歸保護網。任何未來改動讓這個分數漂 → 紅燈（aggregator 漂移 / stub evaluator 改 / YAML 被動 都會抓到）。

---

## 改版（不是新 index）流程

```
  改 YAML  →  bump  version: N+1  →  just pmi-seed
                                            │
                                            ▼
              core_index_definitions 寫新 row,
              舊 row.effective_to = now() (不刪)
                                            │
                                            ▼
                  新 score 用新 def_id
                  舊 score 仍可用舊 def 重播 (audit lineage)
```

**規則**：

- `version` 不 bump 而改 YAML → seed 會偵測到 sha256 mismatch 並拒絕（強制走 SCD2）
- 改 prompt **必定** bump 到 `-v<n+1>.md` + 新 `models register` + `promote`（舊 prompt 永遠保留）
- 改 LLM provider / temperature → 也是新 `models register` + `promote`，**不要** in-place 改 `core_factor_models`

---

## 容易踩的線

| 情境 | 處理 |
|---|---|
| 改 selector 想試 | 一定先 dry-run，別 seed → score → 浪費 LLM 錢 |
| 改 prompt | **必須** bump 檔名 `-v2.md`，跑 score 讓 `_ensure_prompt` 註冊，然後 `models register` 新 row、`models promote` |
| 新 factor 想 tune weight | dry-run 是 stub 值（看不出 weight 差異）；先 N=20 markets 走真 LLM 試訊號 |
| YAML 寫錯 schema | `IndexDef` Pydantic 直接 raise（dry-run 階段就會抓到）；IDE 掛 `index-def.schema.json` 可即時驗 |
| 想看是哪些 market 撐起分數 | `/indexes/<id>/explain` |
| 想知道某個歷史分數當時的 def / prompt | `ts_index_scores.component_audit_ids[]` → join `audit_evaluations` → `prompt_id` + `index_definition_id` 完整還原 |
| 新 index 需要新 aggregator（E[X]、分佈式...） | **不是 YAML 能解**——`formula:` enum 擴張 + `engine/aggregator.py` 新實作，規模同 CORR-1.6/1.7 |
| Polymarket 真資料試新 selector | 起 `just pmi-ingest`（**已決定 R1：ToS 允許**），新 selector 跑在真 18k+ markets 上才看得到 long tail |

---

## 參考

- 設計章節：[CLAUDE.md §4 PMI as Declarative Object](../CLAUDE.md#4-pmi-as-declarative-object核心抽象) / [§6 Prompt as code](../CLAUDE.md#6-llm-評估的升級四層)
- 既有 index 範例：
  - [`polymarket-war-index.yaml`](pmi-core/pmi_core/index_defs/polymarket-war-index.yaml) — 7-factor war，weighted_average
  - [`us-senate-2026-republican-seats.yaml`](pmi-core/pmi_core/index_defs/us-senate-2026-republican-seats.yaml) — partition_sum 範例
- 真實 e2e 紀錄（首次 OpenAI 真 LLM 跑通 2026-05-30）：git history（`git show aa45741:TODO-真實e2e.md`；2026-06-11 整併入 [`TODO.md`](TODO.md) 後刪除）
- Pipeline 入口：[`pmi-core/pmi_core/engine/pipeline.py`](pmi-core/pmi_core/engine/pipeline.py)
- Factor resolver（registry vs YAML fallback 路徑）：[`pmi-core/pmi_core/engine/factor_resolver.py`](pmi-core/pmi_core/engine/factor_resolver.py)
