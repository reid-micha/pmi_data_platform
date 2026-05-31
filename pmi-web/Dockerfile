# Multi-stage Dockerfile for pmi-web. Two targets:
#   - dev:  `next dev` with bind-mounted source (used by docker-compose `pmi-web` profile)
#   - prod: `next build` + `next start` (used in Render/Fly deploys)
#
# Build with `--target dev` for live reload, `--target prod` for releases.

# ── deps ─────────────────────────────────────────────────────────────────────
FROM node:20.19-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# `npm install` instead of `ci` because we don't commit the lockfile in P1.
# Swap to `npm ci` once the lockfile lives in git.
RUN npm install --no-audit --no-fund

# ── dev (bind-mount source, hot reload) ─────────────────────────────────────
FROM node:20.19-alpine AS dev
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ── build (compile next) ─────────────────────────────────────────────────────
FROM node:20.19-alpine AS build
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── prod (slim runtime) ──────────────────────────────────────────────────────
FROM node:20.19-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/package.json ./
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/ >/dev/null 2>&1 || exit 1
CMD ["npm", "run", "start"]
