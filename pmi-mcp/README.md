# pmi-mcp — stub (P3)

**Status**: placeholder, not implemented yet.

MCP server arrives in **P3** per `../../pmi-platform-proposal/04-visualisation-execution-plan.md` M6.
At P0/P1 the gateway to data is `pmi-api` REST; an MCP layer wrapping it adds value
once there's actually something for agents to do (more than one index, real LLM eval,
explain endpoint with reasoning trace).

## Why not P0?

Per `CLAUDE.md` §8, MCP tools split into three tiers:

- **Tier A — Discovery**: `pmi.list_indexes`, `pmi.get_score`, `pmi.search_markets`
- **Tier B — Analysis**: `pmi.explain_score`, `pmi.compare_indexes`, `pmi.backtest`
- **Tier C — Write**: `pmi.draft_index`, `pmi.commit_index`, `pmi.create_alert`

Tier A is just REST wrappers — building MCP without Tier B/C value is premature.
Tier B/C requires: explain endpoint with LLM synthesis (P1), DSL parser for
`draft_index` (P1), alert routing (P2). So MCP lands at **P3**, after those are real.

## Likely layout (P3)

```
pmi-mcp/
├── pyproject.toml          deps: mcp, pmi-core (read-only)
├── pmi_mcp/
│   ├── server.py           stdio MCP server entrypoint
│   ├── tools/
│   │   ├── list_indexes.py     Tier A
│   │   ├── get_score.py        Tier A
│   │   ├── explain_score.py    Tier B
│   │   ├── compare_indexes.py  Tier B
│   │   ├── backtest.py         Tier B
│   │   ├── draft_index.py      Tier C
│   │   └── commit_index.py     Tier C
│   └── auth.py             API key → user_id mapping for Tier C confirmation
└── Dockerfile
```

## P0 alternative

For now, point a Claude / Cursor / ChatGPT agent at `pmi-api` directly. Tier A is
just `curl GET /indexes/...`; the LLM can call those tools through generic HTTP
in any MCP-capable client.
