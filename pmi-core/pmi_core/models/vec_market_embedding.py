"""vec_market_embeddings — pgvector embeddings for market title + description.

Used by the Tier 0 embedding pre-filter (Calculation M5) + SemanticSelector.

Multi-model by design
---------------------
This table is **row-per-model**: the same market can hold one embedding row per
``(model, text_sha256)``. Switching the active embedding model (e.g. OpenAI
``text-embedding-3-small`` → Ollama ``nomic-embed-text``) does NOT replace old
rows — it inserts new ones with a different ``model``/``dim``. Which model the
engine actually queries is configuration (``settings.active_embedding_model``),
never a column here — storing "the current model" per-row would be denormalised.

Because models differ in dimensionality (1536 vs 768 vs 1024), the ``embedding``
column is an **unsized** ``vector`` so rows of any dimension coexist. The
trade-off: pgvector cannot build an HNSW/IVFFlat ANN index on an unsized column,
so search is an exact cosine seq-scan. That is fine at P0/P1 market counts; when
scale demands ANN (the same trigger as §3.1's Timescale/ClickHouse decisions) we
split per-dim tables/columns or move vectors behind the Milvus ``VectorStore``
implementation. The per-row ``dim`` column records each vector's true width.
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

    model: Mapped[str] = mapped_column(String(64), nullable=False)  # 'nomic-embed-text' / 'text-embedding-3-small'
    dim: Mapped[int] = mapped_column(Integer, nullable=False)
    # Unsized `vector` — rows of any dimension coexist (see module docstring).
    embedding: Mapped[list[float]] = mapped_column(Vector(), nullable=False)

    text_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "market_id", "model", "text_sha256", name="uq_vec_market_embeddings__cache_key"
        ),
    )
