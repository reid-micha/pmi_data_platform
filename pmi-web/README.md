# pmi-web — Next.js 15 dashboard

**Status (2026-05-27)**: 🟡 P1 M4 scaffold. Server-rendered index list +
per-index dashboard (current score card + 14-day-ish history chart + metadata)
backed by `pmi-api`. The chat surface, index builder, and OG image generator
are P1 M5+ / P3 work.

Stack (per [`CLAUDE.md §13`](../../CLAUDE.md)): **Next.js 15 App Router +
React 19 + Server Components**. Chart visuals are ported from
[`micah-frontend/apps/war-index`](../../micah-frontend/apps/war-index/) (recharts
pattern in `components/ScoreHistoryChart.tsx`).

---

## Layout

```
pmi-web/
├── package.json              next ^15, react ^19, recharts, tailwind v3
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── Dockerfile                multi-stage: deps / dev / build / prod
├── .env.example
├── app/                      Next App Router
│   ├── layout.tsx            shell (header / nav / footer) + globals.css
│   ├── globals.css           tailwind directives + tiny base
│   ├── page.tsx              "/"          list every current index
│   ├── not-found.tsx         404
│   ├── health/page.tsx       "/health"    pmi-api + ingest source health
│   └── indexes/[id]/page.tsx "/indexes/:id" score card + history chart + metadata
├── components/
│   ├── ScoreCard.tsx              current score envelope renderer
│   └── ScoreHistoryChart.tsx      recharts line chart (ported from war-index)
├── lib/
│   ├── api-client.ts         typed fetch over pmi-api (server/browser aware)
│   └── types.ts              mirrors pmi-api/pmi_api/schemas.py
└── public/                   static assets (empty for now)
```

---

## Local usage

```bash
# Bring up pmi-api + dependencies first (Postgres / MLflow / poller).
just api-up

# Build + start pmi-web (Next dev with bind-mounted source).
just web-build
just web-up

# Open in browser:
#   http://localhost:3000              landing — list of indexes
#   http://localhost:3000/health       health page
#   http://localhost:3000/indexes/polymarket-war-index    dashboard

# Local dev without Docker (requires node 20+):
just web-install
just web-dev
```

Tail logs with `just web-logs`, stop with `just web-down`.

---

## Pages

| Route                  | Source file                          | Notes                                            |
|------------------------|--------------------------------------|--------------------------------------------------|
| `/`                    | `app/page.tsx`                       | Lists `pmi-api GET /indexes`                     |
| `/indexes/[id]`        | `app/indexes/[id]/page.tsx`          | Score card + 14-day-ish history chart + metadata |
| `/health`              | `app/health/page.tsx`                | `GET /health` + `GET /sources/health`            |

All pages are **Server Components** that call `pmi-api` server-side via
`lib/api-client.ts`. Client-side `useEffect` polling will come in P1 M5
when live updates (WS-driven price ticks) matter.

---

## Migration provenance (what was ported)

| Concept                              | Source                                                                                | Destination                            |
|--------------------------------------|---------------------------------------------------------------------------------------|----------------------------------------|
| recharts time-series line chart      | `micah-frontend/apps/war-index/src/components/PMI-score-chart.tsx`                    | `components/ScoreHistoryChart.tsx`     |
| Layout colour palette (ink / accent) | `micah-frontend/apps/war-index/figma-export-css-micah.css` (approximate)              | `tailwind.config.ts` `theme.colors`    |

What was **not** ported from `micah-frontend`:
- The `@micah/api` / `@micah/types` workspace packages — pmi-web targets
  `pmi-api`, which has a different (and saner) schema. `lib/api-client.ts` +
  `lib/types.ts` replace them.
- Auth (Google SSO staging gate, JWT cookie) — pmi-api auth is off in P0
  (see TODO §1.3); when it lands we'll port the cookie pattern.
- Vite-specific config (`vite.config.ts`, `vite-env.d.ts`, Vitest tests) —
  Next.js handles dev server, transpile, and tests differently.
- Domain pages (`Country`, `RegionPage`, `Question`) — those are war-index
  specific; pmi-web is index-generic.

---

## Why not P0?

The P0 demo deliverable is `curl localhost:8001/indexes/polymarket-war-index/score`.
A proper dashboard is the P1 M4 unlock and lands now because:

1. The MVP definition (TODO §2) explicitly requires "at least one user-facing
   surface" — pmi-web counts.
2. pmi-api stabilised in Sprint 2; the contract no longer wobbles, so the
   `lib/types.ts` shim won't churn.
3. The chart pattern already exists in `micah-frontend` — porting is hours
   not days.

---

## What's deferred to P1 M5

- **Index builder UI** (YAML editor + sample matches + 90-day backtest preview) —
  needs a `POST /indexes/draft` endpoint that doesn't exist yet.
- **TS codegen** from pmi-core Pydantic via `datamodel-code-generator` — wire
  it once the schema stops changing weekly.
- **OG image generation** (`app/api/og/[id]/route.ts`) — needed for the §9 SEO
  funnel but not for MVP demos.
- **Auth provider** — gated on pmi-api actually enforcing `require_api_key`.

---

## Why Next.js 15 (not Vite)?

Decided in [`CLAUDE.md §13`](../../CLAUDE.md):

> **Frontend: Next.js 15 (App Router) + Server Components** — 省 admin/auth/SEO
> 樣板，搭配 §9 SEO funnel 策略需要 SSR.

Server Components also let us hide the pmi-api URL from the browser when
auth lands (server-side calls use `PMI_API_URL`, browser calls use
`NEXT_PUBLIC_PMI_API_URL`).
