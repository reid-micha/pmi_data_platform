# Single-EC2 deploy — runbook

Productionizes the proven ingest → DB → aggregate → score → DB → API → web
chain onto one EC2 box with `docker compose`, Caddy TLS, Polymarket
(REST + CLOB + history) + Kalshi (REST + CLOB) sources, and real-LLM scoring.

These are the **operator steps**. The code/config they reference (compose,
Caddyfile, db-init, systemd units, scripts) all live in this `deploy/` dir.

Topology and locked decisions are in
`/.cursor/plans/single-ec2-pmi-launch_cbfde423.plan.md`.

---

## 0. Prerequisites (once)

- A domain in Route 53 (or NS delegated to it).
- GHCR images built by `.github/workflows/build-images.yml` — push to `main`
  (or run the workflow manually) and note the produced short SHA tag. If the
  GHCR packages are private, the instance must `docker login ghcr.io` with a
  PAT (`read:packages`); make them public to skip that.
- Set the repo Actions **variable** `NEXT_PUBLIC_PMI_API_URL` =
  `https://api.pmi.<domain>` so the pmi-web client bundle is baked with the
  right browser API URL.

## 1. AWS infra (console or CLI, ~1.5h)

1. **S3 artifact bucket** — `pmi-mlflow-artifacts-<acct>`, private, default
   encryption on. (Replaces the local MLflow volume; boto3 is already in the
   mlflow image.)
2. **IAM role** for the instance (`pmi-ec2-role`), instance profile attached,
   with policies allowing:
   - `s3:GetObject/PutObject/ListBucket` on the artifact bucket,
   - `secretsmanager:GetSecretValue` on `pmi/prod/secrets`,
   - `logs:CreateLogGroup/CreateLogStream/PutLogEvents` on `/pmi/prod:*`,
   - `AmazonSSMManagedInstanceCore` (for shell via Session Manager).
3. **Security group** — inbound 80 + 443 from `0.0.0.0/0` only. **No port 22**
   (use SSM Session Manager). Outbound all.
4. **EC2 instance** — `t3.large` (2 vCPU / 8 GB), Amazon Linux 2023, the IAM
   role above, the SG above. Add a **gp3 100 GB** data volume (separate from
   root). Allocate + associate an **Elastic IP**.
5. **Route 53** — A records `pmi`, `api.pmi`, `mlflow.pmi` → the Elastic IP.
6. **Secrets Manager** — create secret `pmi/prod/secrets` (JSON):
   ```json
   {
     "PMI_DB_PASSWORD": "<strong-random>",
     "OPENAI_API_KEY": "sk-...",
     "PMI_API_KEY": "<filled after step 3 of bring-up>",
     "MLFLOW_BASICAUTH_HASH": "<caddy hash-password output>",
     "KALSHI_API_KEY_ID": "",
     "KALSHI_PRIVATE_KEY": ""
   }
   ```
   Generate the MLflow hash:
   `docker run --rm caddy:2-alpine caddy hash-password --plaintext '<pw>'`.
7. **AWS Budgets** — a monthly cost alarm (guards LLM + EC2 spend).

## 2. Host prep (once, via SSM shell)

```bash
sudo -E REPO_URL=https://github.com/<org>/pmi_data_platform.git \
        GIT_SHA=<short-sha-matching-IMAGE_TAG> \
        EBS_DEVICE=/dev/nvme1n1 \
        bash /opt/pmi/app/deploy/scripts/bootstrap.sh
# (first run: clone manually to /opt/pmi/app, then invoke bootstrap.sh from it)
```

`bootstrap.sh` installs docker + compose, formats/mounts the gp3 EBS at
`/mnt/data`, checks out the repo at `GIT_SHA`, installs the systemd units, and
seeds `deploy/.env.base`. Then edit `deploy/.env.base` (IMAGE_OWNER, IMAGE_TAG,
PMI_DOMAIN, ACME_EMAIL, MLFLOW_S3_BUCKET, NEXT_PUBLIC_PMI_API_URL, …).

If GHCR is private: `docker login ghcr.io -u <user> -p <PAT>`.

## 3. Bring-up runbook

```bash
cd /opt/pmi/app/deploy

# 3.1 Render .env from Secrets Manager + .env.base
sudo systemctl start pmi-env-fetch        # writes deploy/.env + kalshi.key

# 3.2 Bring DB + MLflow up first
docker compose -f docker-compose.prod.yml --env-file .env up -d postgres mlflow

# 3.3 Schema + extensions + baseline data. The pmi-api image carries pmi-core's
#     deps and bind-mounts pmi_core, so run the pmi-core CLI through it:
docker compose -f docker-compose.prod.yml --env-file .env run --rm \
  --entrypoint python pmi-api -m pmi_core.cli migrate
docker compose -f docker-compose.prod.yml --env-file .env run --rm \
  --entrypoint python pmi-api -m pmi_core.cli seed

# 3.4 Promote real-LLM factor models (registry → gpt-4o-mini). Example:
docker compose ... run --rm --entrypoint python pmi-api -m pmi_core.cli \
  models register --factor directly_about_war \
  --prompt-name factors/directly_about_war --prompt-version 1 \
  --llm gpt-4o-mini-2024-07-18 --temperature 0.1
docker compose ... run --rm --entrypoint python pmi-api -m pmi_core.cli \
  models promote <id> --stage production

# 3.5 Mint the dashboard service key (CORR-0.7), paste into Secrets Manager
#     as PMI_API_KEY, then re-run 3.1 so pmi-web's .env picks it up.
docker compose ... run --rm --entrypoint python pmi-api -m pmi_core.cli \
  keys create --label pmi-web

# 3.6 Bring up the whole stack (api, workers, 5 ingest, web, caddy)
sudo systemctl start pmi      # = compose pull + up -d (see pmi.service)

# 3.7 Smoke test (Caddy auto-issues certs on first hit; allow ~30s)
curl -fsS https://api.pmi.<domain>/health
curl -fsS https://pmi.<domain>/        # dashboard HTML
```

## 4. Deploy a new version

1. Push to `main` → CI builds new GHCR images tagged with the new short SHA.
2. On the box: `cd /opt/pmi/app && git fetch && git checkout <new-sha>`
   (keeps the bind-mounted `pmi_core` in lockstep with the image), bump
   `IMAGE_TAG=<new-sha>` in `deploy/.env.base`, `sudo systemctl start
   pmi-env-fetch`, then `sudo systemctl restart pmi` (pulls + recreates).
3. Rollback = set `IMAGE_TAG` + `git checkout` back to the previous SHA and
   `systemctl restart pmi`.

## 5. Notes / tradeoffs

- **`pmi_core` is bind-mounted**, not baked into the service images, so the git
  checkout SHA and `IMAGE_TAG` must move together. A future hardening is to
  COPY `pmi_core` into each image (build context = repo root) for fully
  self-contained, SHA-authoritative artifacts.
- **Auth**: `PMI_API_REQUIRE_AUTH=true` in prod. pmi-web reads through the
  server-only `PMI_API_KEY`; external consumers get their own keys via
  `pmi-core keys create`. The browser never sees a key.
- **LLM endpoint**: leave `PMI_LLM_BASE_URL` blank for OpenAI. To move to a
  self-hosted OpenAI-compatible server later, set `PMI_LLM_BASE_URL` +
  `PMI_LLM_API_KEY` and register factor models with a `local/<model>` id — no
  code change.
- **Logs**: every container ships to CloudWatch group `/pmi/prod` via the
  `awslogs` driver. `/sources/health` gives a quick per-source ingest liveness
  check. Sentry turns on by putting `SENTRY_DSN` in the secret/.env.
- **Out of scope (fast-follow)**: MCP server, T1 eval concurrency, Polygon
  chain / Kalshi WS / scrapers, Timescale hypertables, OTel/Grafana, RDS,
  ECS/autoscaling.
