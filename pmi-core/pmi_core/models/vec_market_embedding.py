"""vec_market_embeddings — pgvector embeddings for market title + description.

Used at P2 by the Tier 0 embedding pre-filter (Calculation M5). Schema lives here
in P0 so the migration is in place when that work lands.
"""

from __future__ import annotations

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from pmi_core.models.base import Base


class VecMarketEmbedding(Base):
    __tablename__ = "vec_market_embeddings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    market_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("core_markets.id", ondelete="CASCADE"), nullable=False
    )

    model: Mapped[str] = mapped_column(String(64), nullable=False)  # 'text-embedding-3-small'
    dim: Mapped[int] = mapped_column(Integer, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(1536), nullable=False)

    text_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "market_id", "model", "text_sha256", name="uq_vec_market_embeddings__cache_key"
        ),
    )
