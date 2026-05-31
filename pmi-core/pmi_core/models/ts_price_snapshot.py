"""ts_price_snapshots — time-series of last/bid/ask + volume per market.

Future P1: convert to TimescaleDB hypertable on `snapshot_at`.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from pmi_core.models.base import Base


class TsPriceSnapshot(Base):
    __tablename__ = "ts_price_snapshots"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    market_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("core_markets.id", ondelete="CASCADE"), nullable=False
    )
    snapshot_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    last_price: Mapped[float | None] = mapped_column(Numeric(10, 6))
    bid: Mapped[float | None] = mapped_column(Numeric(10, 6))
    ask: Mapped[float | None] = mapped_column(Numeric(10, 6))
    volume_24h: Mapped[float | None] = mapped_column(Numeric(20, 4))
    liquidity: Mapped[float | None] = mapped_column(Numeric(20, 4))

    __table_args__ = (
        Index("ix_ts_price_snapshots__market_time", "market_id", "snapshot_at"),
    )
