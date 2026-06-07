#!/usr/bin/env bash
#
# One-shot bring-up for the Polymarket PMI Platform on a single machine.
# Self-contained: operates ONLY on pmi_data_platform/ (this directory). It does
# not touch the legacy Micah workspace one level up.
#
#   1. Ensure `just` is installed (brew, else the official just.systems installer).
#   2. Ensure Docker is running.
#   3. `just up` — every service running + schema + seed, credentials from
#      ./.env (the recipe seeds .env from .env.example and stops if it's missing,
#      so you fill secrets once).
#
# Idempotent: safe to re-run. Usage:  cd pmi_data_platform && ./up.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # = pmi_data_platform/
cd "$ROOT"

# Where to drop the `just` binary if we have to install it without brew.
INSTALL_DIR="${JUST_INSTALL_DIR:-$HOME/.local/bin}"

note() { printf '\033[1;36m%s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m%s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

ensure_docker() {
  command -v docker >/dev/null 2>&1 \
    || die "✗ Docker not found. Install Docker Desktop / engine first: https://docs.docker.com/get-docker/"
  docker info >/dev/null 2>&1 \
    || die "✗ Docker is installed but not running. Start Docker and re-run ./up.sh"
  ok "✓ docker ready ($(docker --version | awk '{print $3}' | tr -d ,))"
}

ensure_just() {
  if command -v just >/dev/null 2>&1; then
    ok "✓ just present ($(just --version))"
    return
  fi
  note "→ just not found — installing…"
  if command -v brew >/dev/null 2>&1; then
    brew install just
  else
    note "  no Homebrew; using the just.systems installer → $INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"
    curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh \
      | bash -s -- --to "$INSTALL_DIR"
    # Make it usable for the rest of THIS run.
    case ":$PATH:" in
      *":$INSTALL_DIR:"*) ;;
      *) export PATH="$INSTALL_DIR:$PATH" ;;
    esac
  fi
  command -v just >/dev/null 2>&1 \
    || die "✗ just install failed. Add $INSTALL_DIR to your PATH, or install manually: https://just.systems"
  ok "✓ just installed ($(just --version))"
}

note "── PMI Platform one-shot bring-up ──"
ensure_docker
ensure_just
note "→ just up"
exec just up
