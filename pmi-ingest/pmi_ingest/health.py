"""Source health writer: append-only poll log + row-per-source UPSERT.

Imported by every poller's wrapper. P0 = SQL UPSERT; P1 wires OTel counter alongside.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from pmi_core.models import AuditSourceHealth, AuditSourcePollLog


async def record_poll(
    session: AsyncSession,
    *,
    source: str,
    started_at: datetime,
    finished_at: datetime,
    success: bool,
    records: int | None = None,
    error_class: str | None = None,
    error_message: str | None = None,
    expected_records_24h: int | None = None,
) -> None:
    """Insert one immutable poll-log row and UPSERT the current source_health row."""

    duration_ms = int((finished_at - started_at).total_seconds() * 1000)

    session.add(
        AuditSourcePollLog(
            source=source,
            polled_at=started_at,
            duration_ms=duration_ms,
            records_returned=records,
            success=success,
            error_class=error_class,
            error_message=error_message,
        )
    )

    existing = (
        await session.execute(
            select(AuditSourceHealth).where(AuditSourceHealth.source == source)
        )
    ).scalar_one_or_none()

    if existing is None:
        status = "healthy" if success else "down"
        session.add(
            AuditSourceHealth(
                source=source,
                last_success_at=finished_at if success else None,
                last_failure_at=None if success else finished_at,
                consecutive_failures=0 if success else 1,
                p95_latency_ms_24h=duration_ms,
                records_24h=records or 0,
                expected_records_24h=expected_records_24h,
                status=status,
            )
        )
        return

    if success:
        existing.last_success_at = finished_at
        existing.consecutive_failures = 0
        existing.status = "healthy"
    else:
        existing.last_failure_at = finished_at
        existing.consecutive_failures = (existing.consecutive_failures or 0) + 1
        existing.status = "degraded" if existing.consecutive_failures < 3 else "down"

    # Naive moving stats; P1 replaces with a SQL window or OTel histogram.
    existing.p95_latency_ms_24h = duration_ms
    if records is not None:
        existing.records_24h = records
    if expected_records_24h is not None:
        existing.expected_records_24h = expected_records_24h
    existing.updated_at = datetime.now(UTC)
