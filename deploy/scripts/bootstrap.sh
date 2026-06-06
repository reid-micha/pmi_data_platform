#!/usr/bin/env bash
# One-time EC2 host preparation for the single-box PMI stack. Run as root on a
# fresh Amazon Linux 2023 instance (via SSM Session Manager or as user-data).
#
# Idempotent-ish: safe to re-run; skips steps already done. It does NOT bring
# the stack up — that's `systemctl start pmi` (see deploy/README.md runbook),
# so you can mint the dashboard key + run migrations first.
#
#   REPO_URL=https://github.com/<org>/pmi_data_platform.git \
#   GIT_SHA=<short-or-full-sha> \
#   EBS_DEVICE=/dev/nvme1n1 \
#   sudo -E bash bootstrap.sh
set -euo pipefail

REPO_URL="${REPO_URL:?set REPO_URL to the pmi_data_platform git remote}"
GIT_SHA="${GIT_SHA:?set GIT_SHA to the commit matching IMAGE_TAG}"
APP_DIR="${APP_DIR:-/opt/pmi/app}"
DATA_DIR="${PMI_DATA_DIR:-/mnt/data}"
EBS_DEVICE="${EBS_DEVICE:-/dev/nvme1n1}"

echo "==> Installing docker + git + jq + awscli"
dnf install -y docker git jq awscli
# docker compose v2 plugin
mkdir -p /usr/libexec/docker/cli-plugins
if [[ ! -x /usr/libexec/docker/cli-plugins/docker-compose ]]; then
  COMPOSE_VER="v2.29.7"
  curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VER}/docker-compose-linux-x86_64" \
    -o /usr/libexec/docker/cli-plugins/docker-compose
  chmod +x /usr/libexec/docker/cli-plugins/docker-compose
fi
systemctl enable --now docker

echo "==> Mounting gp3 EBS at ${DATA_DIR} (device ${EBS_DEVICE})"
if ! blkid "${EBS_DEVICE}" >/dev/null 2>&1; then
  mkfs -t ext4 "${EBS_DEVICE}"
fi
mkdir -p "${DATA_DIR}"
if ! mountpoint -q "${DATA_DIR}"; then
  uuid="$(blkid -s UUID -o value "${EBS_DEVICE}")"
  grep -q "${uuid}" /etc/fstab || echo "UUID=${uuid} ${DATA_DIR} ext4 defaults,nofail 0 2" >> /etc/fstab
  mount "${DATA_DIR}"
fi
mkdir -p "${DATA_DIR}/pgdata"

echo "==> Checking out ${REPO_URL} @ ${GIT_SHA} into ${APP_DIR}"
mkdir -p "$(dirname "${APP_DIR}")"
if [[ ! -d "${APP_DIR}/.git" ]]; then
  git clone "${REPO_URL}" "${APP_DIR}"
fi
git -C "${APP_DIR}" fetch --all --tags
git -C "${APP_DIR}" checkout "${GIT_SHA}"

echo "==> Seeding deploy/.env.base if absent (edit before first start)"
if [[ ! -f "${APP_DIR}/deploy/.env.base" ]]; then
  cp "${APP_DIR}/deploy/.env.base.example" "${APP_DIR}/deploy/.env.base"
  echo "    !! edit ${APP_DIR}/deploy/.env.base (IMAGE_OWNER, IMAGE_TAG, PMI_DOMAIN, ...)"
fi

echo "==> Installing systemd units"
install -m 0755 "${APP_DIR}/deploy/scripts/fetch-secrets.sh" "${APP_DIR}/deploy/scripts/fetch-secrets.sh"
cp "${APP_DIR}/deploy/systemd/pmi-env-fetch.service" /etc/systemd/system/
cp "${APP_DIR}/deploy/systemd/pmi.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable pmi-env-fetch.service pmi.service

cat <<EOF

==> Host prepared. Next (see deploy/README.md "Bring-up runbook"):
    1. Edit ${APP_DIR}/deploy/.env.base, create the Secrets Manager secret.
    2. docker login ghcr.io   (or rely on a public package)
    3. systemctl start pmi-env-fetch   # render .env
    4. Run migrate / seed / register-models one-shots, mint the web key.
    5. systemctl start pmi             # bring the whole stack up
EOF
