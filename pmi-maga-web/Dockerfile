# Image for pmi-maga-web — the lifted micah-frontend maga-index Vite SPA.
#
# Build context = this directory (pmi-maga-web/) so npm workspaces resolve the
# `@micah/*` packages that travel alongside the app.
#
# Two targets, matching pmi-web's convention:
#   - dev:  `vite` dev server, source bind-mounted by docker-compose (hot reload)
#   - prod: `vite build` → static assets served by nginx with SPA fallback
#
# Build dev:   docker build --target dev  -t pmi-maga-web:dev  .
# Build prod:  docker build --target prod -t pmi-maga-web:prod \
#                --build-arg VITE_API_URL=https://war-index-api-staging.onrender.com/api/maga .

# ── deps ─────────────────────────────────────────────────────────────────────
# Copy every workspace package.json first so `npm install` builds the dep graph
# without source — slow layer stays cached across source-only edits.
FROM node:20.19-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* .npmrc ./
COPY apps/maga-index/package.json ./apps/maga-index/
COPY packages/api/package.json    ./packages/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/types/package.json  ./packages/types/
COPY packages/ui/package.json     ./packages/ui/
RUN npm install --legacy-peer-deps --no-audit --no-fund

# ── dev (bind-mount source, hot reload) ──────────────────────────────────────
FROM node:20.19-alpine AS dev
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 5173
# --host so the dev server is reachable from outside the container.
CMD ["npm", "run", "dev", "-w", "apps/maga-index", "--", "--host", "0.0.0.0", "--port", "5173"]

# ── build (compile vite) ─────────────────────────────────────────────────────
FROM node:20.19-alpine AS build
WORKDIR /app
ENV NODE_ENV=production
# Vite inlines VITE_* into the bundle at build time, so the API URL must be
# supplied here. Defaults to the legacy staging backend the site uses today.
ARG VITE_API_URL=https://war-index-api-staging.onrender.com/api/maga
ENV VITE_API_URL=${VITE_API_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -w apps/maga-index

# ── prod (nginx static + SPA fallback) ───────────────────────────────────────
FROM nginx:1.27-alpine AS prod
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    location /assets/ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
        try_files $uri =404;\n\
    }\n\
\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
        add_header Cache-Control "no-cache";\n\
    }\n\
\n\
    location = /healthz { return 200 "ok"; add_header Content-Type text/plain; }\n\
}\n' > /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/maga-index/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
