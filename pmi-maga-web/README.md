# pmi-maga-web

A **1:1 clone** of the legacy `micah-frontend/apps/maga-index` Vite SPA, lifted
wholesale into `pmi_data_platform/` so the MAGA Index site lives in the CURRENT
platform alongside the other packages.

## Why it's a separate app (not folded into `pmi-web`)

`pmi-web` is **Next.js 15 + Tailwind v3 + recharts-2**. maga-index is **Vite +
Tailwind v4 + react-router-7 + recharts-3 + react-simple-maps**, and is hard-coupled
to Vite (`import.meta.env`, `@import "tailwindcss"`, local-font CSS assets). Forcing
the SPA into pmi-web's build would mean downgrading Tailwind v4→v3, recharts 3→2,
replacing `import.meta.env`, and wrapping react-router inside the App Router — every
one of which breaks visual/behavioral fidelity. Keeping it as its own Vite app is the
only faithful "1:1" path.

## Layout

The npm-workspace structure from `micah-frontend` is preserved verbatim, so the
~98 app source files needed **zero edits** (one exception below):

```
pmi-maga-web/
  package.json            workspaces: ["packages/*", "apps/maga-index"]
  apps/maga-index/        the SPA (src, public, vite.config, index.html, .env)
  packages/
    api/    @micah/api    REST client (api → types)
    shared/ @micah/shared
    types/  @micah/types
    ui/     @micah/ui     (ui → shared)
  Dockerfile              dev (vite) + build + prod (nginx static) targets
```

### The one edit vs. the original

`MagaAllSection.tsx` and `MagaQuestionsSection.tsx` in the original imported
`ShareButton` from the **sibling war-index app**
(`war-index-frontend/src/components/shared/ShareButton.tsx`). That cross-app
dependency can't resolve here (war-index wasn't lifted). Since maga-index already
ships a **byte-identical** `src/components/shared/ShareButton.tsx`, both imports were
repointed to the local copy — fully behavior-preserving.

## Backend

Talks to the legacy war-index MAGA API, configured in `apps/maga-index/.env`:

```
VITE_API_URL=https://war-index-api-staging.onrender.com/api/maga
```

It does **not** depend on `pmi-api` (pmi-api doesn't expose the maga
regions/countries/states/questions endpoints). The staging Google-SSO gate is OFF
by default (`VITE_IS_STAGING=false`) so the clone is directly viewable.

### Opt-in pmi-platform bridge

The whole **MAGA domain** can be served from the **pmi platform** instead of
legacy, via `VITE_PMI_API_URL`. When set, the maga client (`fetchMagaIndex`,
`fetchMagaStates`, `fetchMagaState`, `fetchMagaStateHoldings`, `fetchMagaGroups`,
`fetchMagaStateGroup`, `fetchMagaQuestions`, `fetchMagaSearchCatalog`,
`fetchMagaStateTrends`) calls pmi-api and reshapes the response into the legacy
view-model shapes (`packages/api/src/pmi_backend.ts`). All of it is derived from
the per-state partisan race markets pmi already ingests:

| Legacy page / call | pmi-api endpoint | data |
|---|---|---|
| Home US map + state cards (`fetchMagaIndex`/`fetchMagaStates`) | `GET /maga/by-state` | per-state lean + national heat |
| State detail `/state/:id` + chamber pages (`fetchMagaState`) | `GET /maga/by-state/{code}` | per-chamber groups + contributing contracts |
| State holdings (`fetchMagaStateHoldings`) | `GET /maga/by-state/{code}` | the chamber's contracts as `ComponentContract[]` |
| Questions tab (`fetchMagaQuestions`), groups, search (`fetchMagaSearchCatalog`) | `GET /maga/groups` | every (state, chamber) race group |
| State trend chart (`fetchMagaStateTrends`) | — | empty (no per-state history in pmi yet) |

The pmi-api side adds `engine/state_detail.py` + `/maga/by-state/{code}` and
`/maga/groups` (`pmi-api/pmi_api/routes/maga.py`). **Not** pmi-backed — no data
source exists: `/region/:slug`, `/country/:slug`, the world-conflict hourly
breakdown, anchor-question peer groups, and auth/settings/admin. Those calls
aren't overridden, so they transparently fall through to the legacy backend
(`VITE_API_URL`) — the app runs hybrid. When `VITE_PMI_API_URL` is unset the
client stays 100% legacy —
the 1:1 default. All other pages (state detail, questions, regions, search) have
no pmi-api source yet and remain on legacy regardless.

```sh
# 1. bring up the pmi stack (db + api + seed)
just up               # or: docker compose --profile pmi up -d postgres && \
                      #     docker compose --profile pmi run --rm pmi-core migrate && \
                      #     ... seed && docker compose --profile pmi up -d pmi-api
# 2. enable the bridge (committed .env stays legacy; .env.local is local-only)
echo 'VITE_PMI_API_URL=http://localhost:8001' \
  > apps/maga-index/.env.local        # 8001 = pmi-api host-mapped port
just maga-build && just maga-up
```

Requires pmi-api CORS to allow the SPA origin —
`PMI_API_CORS_ORIGINS=http://localhost:5173` (already in `.env.example`). The
pmi-api host port is the left side of `${PMI_API_PORT:-8001}:8000`.

## Run (Docker — platform convention)

```sh
just maga-up          # build + start the Vite dev server (hot reload)
# → http://localhost:${PMI_MAGA_WEB_PORT:-5173}
just maga-logs        # tail logs
just maga-down        # stop
just maga-buildcheck  # tsc --noEmit && vite build (compile proof)
```

Or directly:

```sh
docker compose --profile pmi-maga-web up -d --build pmi-maga-web
```

The `pmi-maga-web` compose profile keeps it out of the default stack. Source dirs
(`apps/maga-index/src`, `public`, `index.html`, `packages/`) are bind-mounted for
hot reload; `node_modules` stays baked in the image.

## Production build

```sh
docker build --target prod \
  --build-arg VITE_API_URL=https://war-index-api-staging.onrender.com/api/maga \
  -t pmi-maga-web:prod pmi_data_platform/pmi-maga-web
```

Produces an nginx image serving the static `dist/` with SPA-fallback routing.
