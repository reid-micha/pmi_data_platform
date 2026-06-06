"""pgvector-backed VectorStore — exact cosine over vec_market_embeddings.

No ANN index (the column is unsized — see the model docstring), so `search` and
`cosine_for_markets` are exact seq-scans bounded by `WHERE model = :model`
(and, for the gate, `market_id = ANY(:ids)`). Fine at P0/P1 market counts.

Each method opens its own `session_scope()` — the store owns its transaction so
the protocol stays Postgres-agnostic (see base.py). Reads don't need the
caller's transaction; the writer batches via a single `upsert_many`.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence

import structlog
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from pmi_core.db import session_scope
from pmi_core.models import VecMarketEmbedding
from pmi_core.vectorstore.base import EmbeddingItem, ScoredMarket

log = structlog.get_logger(__name__)


class PgVectorStore:
    """VectorStore implementation over the `vec_market_embeddings` table."""

    async def upsert_many(self, items: Iterable[EmbeddingItem]) -> int:
        rows = [
            {
                "market_id": it.market_id,
                "model": it.model,
                "dim": it.dim,
                "embedding": list(it.embedding),
                "text_sha256": it.text_sha256,
            }
            for it in items
        ]
        if not rows:
            return 0

        async with session_scope() as session:
            stmt = (
                pg_insert(VecMarketEmbedding)
                .values(rows)
                # Append-only: an unchanged (market, model, text) never rewrites.
                .on_conflict_do_nothing(
                    constraint="uq_vec_market_embeddings__cache_key"
                )
                .returning(VecMarketEmbedding.id)
            )
            result = await session.execute(stmt)
            written = len(result.scalars().all())

        log.debug("pgvector.upsert_many", submitted=len(rows), written=written)
        return written

    async def search(
        self,
        *,
        query_embedding: Sequence[float],
        model: str,
        min_cosine: float | None = None,
        top_k: int | None = None,
    ) -> list[ScoredMarket]:
        q = list(query_embedding)
        # `<=>` cosine distance; similarity = 1 - distance.
        distance = VecMarketEmbedding.embedding.cosine_distance(q)
        similarity = (1.0 - distance).label("cosine")

        stmt = (
            select(VecMarketEmbedding.market_id, similarity)
            .where(VecMarketEmbedding.model == model)
            .order_by(distance)  # nearest first == highest similarity first
        )
        if min_cosine is not None:
            # distance <= 1 - min_cosine  ⇔  similarity >= min_cosine
            stmt = stmt.where(distance <= (1.0 - min_cosine))
        if top_k is not None:
            stmt = stmt.limit(top_k)

        async with session_scope() as session:
            result = await session.execute(stmt)
            return [ScoredMarket(market_id=mid, cosine=float(cos)) for mid, cos in result.all()]

    async def cosine_for_markets(
        self,
        *,
        market_ids: Sequence[int],
        query_embedding: Sequence[float],
        model: str,
    ) -> dict[int, float]:
        ids = list(market_ids)
        if not ids:
            return {}
        q = list(query_embedding)
        similarity = (1.0 - VecMarketEmbedding.embedding.cosine_distance(q)).label("cosine")

        stmt = select(VecMarketEmbedding.market_id, similarity).where(
            VecMarketEmbedding.model == model,
            VecMarketEmbedding.market_id.in_(ids),
        )
        async with session_scope() as session:
            result = await session.execute(stmt)
            # A market could (in theory) have multiple cache-key rows for one
            # model (different text_sha256 after an edit). Keep the best.
            best: dict[int, float] = {}
            for mid, cos in result.all():
                c = float(cos)
                if mid not in best or c > best[mid]:
                    best[mid] = c
            return best
