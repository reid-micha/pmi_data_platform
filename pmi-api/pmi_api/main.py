"""FastAPI app entrypoint."""

from __future__ import annotations

import logging
import sys

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from pmi_api.config import api_settings
from pmi_api.routes.health import router as health_router
from pmi_api.routes.indexes import router as indexes_router
from pmi_api.routes.maga import router as maga_router
from pmi_core.config import settings


def _setup_logging() -> None:
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(message)s",
        stream=sys.stdout,
    )
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ]
    )


def create_app() -> FastAPI:
    _setup_logging()
    from pmi_core.observability import init_sentry

    init_sentry("pmi-api")
    app = FastAPI(
        title="pmi-api",
        version="0.1.0",
        description="Read-only REST gateway over pmi-core (P0).",
    )
    if api_settings.cors_origins_list:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=api_settings.cors_origins_list,
            allow_credentials=True,
            allow_methods=["GET"],
            allow_headers=["*"],
        )
    app.include_router(health_router)
    app.include_router(indexes_router)
    app.include_router(maga_router)
    return app


app = create_app()


def run() -> None:
    """Console script entrypoint: `uv run pmi-api`."""
    import uvicorn

    uvicorn.run(
        "pmi_api.main:app",
        host="0.0.0.0",
        port=api_settings.port,
        reload=False,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    run()
