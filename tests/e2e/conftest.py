"""End-to-end smoke harness for the PMI data platform.

Automates the manual SHIP-0.3 / SHIP-0.4 procedure:
1. Drop and recreate the ``pmi_e2e_test`` Postgres database.
2. ``pmi-core migrate`` → ``pmi-core seed`` (13 fixture markets + 5 index defs).
3. ``pmi-workers run-job score-all`` → 5 deterministic ts_index_scores rows.
4. Start ``pmi-api`` on a non-conflicting port (``8099``).
5. Yield base URL to the tests, which assert known score values + envelopes.
6. Tear down the pmi-api container and drop the test DB.

Runs from the host (not inside a container) because it shells out to
``docker compose``. Requires:
- A running ``micah-postgres`` container (``docker compose up -d postgres``)
- The ``pmi-core`` / ``pmi-api`` / ``pmi-workers`` images already built
  (``just build-pmi-all`` once, or rely on compose's auto-build on first
  ``docker compose run``).

CI invocation:
    cd pmi_data_platform && python -m pytest tests/e2e/ -v

Skip bootstrap (assume stack already up + seeded) for fast inner-loop dev:
    PMI_E2E_SKIP_BOOTSTRAP=1 python -m pytest tests/e2e/ -v
"""

from __future__ import annotations

import os
import subprocess
import time
from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest

# ──────────────────────────────────────────────────────────────────────────
# Paths + constants
# ──────────────────────────────────────────────────────────────────────────

# Walk up from this file to the workspace root (one above pmi_data_platform).
HERE = Path(__file__).resolve()
PLATFORM_ROOT = HERE.parents[2]  # pmi_data_platform/
WORKSPACE_ROOT = PLATFORM_ROOT.parent

COMPOSE_FILES = [
    "-f",
    str(WORKSPACE_ROOT / "docker-compose.yml"),
    "-f",
    str(HERE.parent / "docker-compose.e2e.yml"),
]

TEST_DB_NAME = os.environ.get("PMI_E2E_DB_NAME", "pmi_e2e_test")
API_PORT = int(os.environ.get("PMI_E2E_API_PORT", "8099"))
API_BASE_URL = f"http://localhost:{API_PORT}"

SKIP_BOOTSTRAP = os.environ.get("PMI_E2E_SKIP_BOOTSTRAP", "").lower() in {"1", "true", "yes"}

EXPECTED_INDEX_IDS = {
    "polymarket-war-index",
    "us-senate-2026-republican-seats",
    "us-senate-2026-republican-share",
    "us-house-2026-republican-seats",
    "us-house-2026-republican-share",
}

# All-stub deterministic scores (no CoreFactorModel rows registered → every
# factor falls back to the in-process stub). These match the values captured
# during the CORR-1.4 verification on 2026-05-30 after the bucket-collapser
# port (war-index 49.0294, senate-{seats,share} 75.5667, house-{seats,share}
# 76.1296). The fixture markets carry no date suffixes so the new
# date-aware collapser is a no-op, leaving the scores stable.
EXPECTED_SCORES = {
    "polymarket-war-index": 49.0294,
    "us-senate-2026-republican-share": 75.5667,
    "us-senate-2026-republican-seats": 75.5667,
    "us-house-2026-republican-share": 76.1296,
    "us-house-2026-republican-seats": 76.1296,
}
SCORE_TOLERANCE = 0.01  # 4-decimal score precision in ts_index_scores.score

# ──────────────────────────────────────────────────────────────────────────
# docker compose / psql helpers
# ──────────────────────────────────────────────────────────────────────────


def _compose(*args: str, check: bool = True, capture: bool = False) -> subprocess.CompletedProcess:
    """Run ``docker compose <args>`` with the override file applied."""
    cmd = ["docker", "compose", *COMPOSE_FILES, *args]
    print(f"\n$ {' '.join(cmd)}")
    return subprocess.run(
        cmd,
        cwd=str(WORKSPACE_ROOT),
        check=check,
        capture_output=capture,
        text=True,
    )


def _psql_admin(sql: str) -> None:
    """Execute SQL against the system ``postgres`` DB inside the postgres container."""
    cmd = [
        "docker",
        "compose",
        *COMPOSE_FILES,
        "exec",
        "-T",
        "postgres",
        "psql",
        "-U",
        os.environ.get("DB_USER", "warindex"),
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        sql,
    ]
    print(f"$ psql admin :: {sql}")
    subprocess.run(cmd, cwd=str(WORKSPACE_ROOT), check=True)


def _drop_and_create_test_db() -> None:
    # Terminate any sessions still attached to the test DB (compose run
    # containers may leave idle connections behind across runs).
    _psql_admin(
        f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
        f"WHERE datname = '{TEST_DB_NAME}' AND pid <> pg_backend_pid()"
    )
    _psql_admin(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}"')
    _psql_admin(f'CREATE DATABASE "{TEST_DB_NAME}"')


def _drop_test_db() -> None:
    try:
        _psql_admin(
            f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            f"WHERE datname = '{TEST_DB_NAME}' AND pid <> pg_backend_pid()"
        )
        _psql_admin(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}"')
    except subprocess.CalledProcessError as exc:
        print(f"(warn) failed to drop {TEST_DB_NAME}: {exc}")


def _wait_for_api(url: str, timeout: float = 60.0) -> None:
    """Poll ``/health`` until it returns 200 or timeout."""
    deadline = time.monotonic() + timeout
    last_err: Exception | None = None
    while time.monotonic() < deadline:
        try:
            resp = httpx.get(f"{url}/health", timeout=2.0)
            if resp.status_code == 200 and resp.json().get("db") is True:
                return
        except Exception as exc:  # noqa: BLE001 — we want to swallow + retry
            last_err = exc
        time.sleep(1.0)
    raise TimeoutError(f"pmi-api at {url} did not become healthy in {timeout}s ({last_err})")


def _postgres_running() -> bool:
    try:
        out = subprocess.run(
            ["docker", "compose", *COMPOSE_FILES, "ps", "--status", "running", "postgres"],
            cwd=str(WORKSPACE_ROOT),
            check=True,
            capture_output=True,
            text=True,
        )
        return "postgres" in out.stdout
    except subprocess.CalledProcessError:
        return False


# ──────────────────────────────────────────────────────────────────────────
# Session-scoped fixtures
# ──────────────────────────────────────────────────────────────────────────


@pytest.fixture(scope="session")
def e2e_stack() -> Iterator[str]:
    """Bootstrap the full P0 stack against the test DB and yield the API URL.

    Sequence (mirrors SHIP-0.3 / SHIP-0.4 manual procedure):
        1. Ensure postgres is up (auto-start if not).
        2. DROP+CREATE the test database.
        3. ``pmi-core migrate`` against the test DB.
        4. ``pmi-core seed`` (13 markets + 5 index defs).
        5. ``pmi-workers run-job score-all`` → 5 ts_index_scores rows.
        6. ``pmi-api up -d`` on port 8099.
        7. Wait for /health.
        8. Yield base URL.

    Teardown stops pmi-api and drops the test DB.
    """
    if SKIP_BOOTSTRAP:
        print(f"\n=== PMI_E2E_SKIP_BOOTSTRAP=1 — assuming stack at {API_BASE_URL}")
        yield API_BASE_URL
        return

    # --- 1. Postgres must be up before we can touch it.
    if not _postgres_running():
        print("\n=== Starting postgres (was not running)")
        _compose("up", "-d", "postgres")
        # Healthcheck loop — postgres takes ~3s on cold start.
        for _ in range(30):
            try:
                _psql_admin("SELECT 1")
                break
            except subprocess.CalledProcessError:
                time.sleep(1.0)
        else:
            raise RuntimeError("postgres did not become reachable")

    # --- 2. Fresh test DB.
    print(f"\n=== Resetting test database `{TEST_DB_NAME}`")
    _drop_and_create_test_db()

    api_was_started = False
    try:
        # --- 3 + 4 + 5. One-shot compose-run containers using the override file.
        print("\n=== Running migrations against test DB")
        _compose("--profile", "pmi", "run", "--rm", "pmi-core", "migrate")

        print("\n=== Seeding markets + index defs")
        _compose("--profile", "pmi", "run", "--rm", "pmi-core", "seed")

        print("\n=== Running score-all")
        _compose("--profile", "pmi", "run", "--rm", "pmi-workers", "run-job", "score-all")

        # --- 6. Long-running API container.
        print(f"\n=== Starting pmi-api on port {API_PORT}")
        # `up -d` honours the override file, including the port remap.
        _compose("--profile", "pmi", "up", "-d", "pmi-api")
        api_was_started = True

        # --- 7. Wait for /health to flip to ok.
        print(f"\n=== Waiting for {API_BASE_URL}/health")
        _wait_for_api(API_BASE_URL, timeout=60)

        print(f"\n=== Stack ready at {API_BASE_URL}")
        yield API_BASE_URL

    finally:
        if api_was_started:
            print("\n=== Stopping pmi-api")
            try:
                _compose("--profile", "pmi", "stop", "pmi-api", check=False)
                _compose("--profile", "pmi", "rm", "-f", "pmi-api", check=False)
            except subprocess.CalledProcessError as exc:
                print(f"(warn) failed to stop pmi-api: {exc}")
        print(f"\n=== Dropping test database `{TEST_DB_NAME}`")
        _drop_test_db()


@pytest.fixture(scope="session")
def api_client(e2e_stack: str) -> Iterator[httpx.Client]:
    with httpx.Client(base_url=e2e_stack, timeout=30.0) as client:
        yield client
