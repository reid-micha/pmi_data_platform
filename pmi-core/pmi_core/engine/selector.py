"""Selector: turn `IndexDef.selectors` into a list of `core_markets` rows.

Three selector kinds, unioned (a market matching ANY selector is included):

* **keyword**  — Postgres POSIX regex (`~*`) with `\\m...\\M` word boundaries
  (not substring ilike): `war` no longer matches `software`/`award`, `strike`
  no longer matches `Counter-Strike`. Multi-word terms match as a bounded
  phrase; terms are regex-escaped so punctuation is literal.
* **category** — exact match on `core_markets.category`.
* **semantic** — cosine search over `vec_market_embeddings` via the active
  embedding model (anchor embedded with the query prefix), keeping markets at or
  above `min_similarity`. Degrades gracefully: if embeddings aren't populated or
  the embed endpoint is down, the semantic clause contributes nothing rather
  than failing the whole selection (keyword/category still apply).

Discovery vs the Tier 0 gate
----------------------------
SemanticSelector *discovers* relevant markets (high bar, ~0.78). The Tier 0
pre-filter in the pipeline is a separate, lower cosine *floor* (~0.5) that culls
keyword/category false-positives before the factor LLM loop. Both read the same
embeddings via the same VectorStore.
"""

from __future__ import annotations

import re

import structlog
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from pmi_core.config import settings
from pmi_core.dsl.ir import CategorySelector, IndexDef, KeywordSelector, SemanticSelector
from pmi_core.llm import embed_query
from pmi_core.models import CoreMarket
from pmi_core.vectorstore import get_vector_store

log = structlog.get_logger(__name__)


def _keyword_pattern(term: str) -> str:
    """Build a Postgres POSIX regex for a single keyword/phrase.

    `\\m` / `\\M` are Postgres word boundary anchors (start / end of word).
    `re.escape` neutralises any regex metacharacters inside the term so e.g.
    a future selector with `"u.s."` matches literally rather than as regex.
    """
    return rf"\m{re.escape(term)}\M"


async def _semantic_market_ids(ir: IndexDef) -> set[int]:
    """Market ids matched by any SemanticSelector, via cosine over the active model.

    Fail-open: any error (no embeddings yet, embed endpoint down) logs a warning
    and yields no ids — keyword/category selection still stands.
    """
    semantic = [s for s in ir.selectors if isinstance(s, SemanticSelector)]
    if not semantic:
        return set()

    model = settings.active_embedding_model
    store = get_vector_store()
    matched: set[int] = set()
    for sel in semantic:
        try:
            anchor_vec = await embed_query(sel.anchor, model=model)
            hits = await store.search(
                query_embedding=anchor_vec,
                model=model,
                min_cosine=sel.min_similarity,
            )
        except Exception as exc:  # noqa: BLE001 - graceful degradation by design
            log.warning(
                "selector.semantic_failed",
                index_id=ir.id,
                anchor=sel.anchor[:80],
                error=str(exc),
            )
            continue
        matched.update(h.market_id for h in hits)
        log.info(
            "selector.semantic",
            index_id=ir.id,
            anchor=sel.anchor[:80],
            min_similarity=sel.min_similarity,
            matched=len(hits),
        )
    return matched


async def select_markets(session: AsyncSession, ir: IndexDef) -> list[CoreMarket]:
    """Return distinct markets matching ANY selector (keyword / category / semantic)."""

    title_clauses = []
    category_clauses = []
    for sel in ir.selectors:
        if isinstance(sel, KeywordSelector):
            for term in sel.terms:
                title_clauses.append(CoreMarket.title.op("~*")(_keyword_pattern(term)))
        elif isinstance(sel, CategorySelector):
            category_clauses.append(CoreMarket.category == sel.polymarket_tag)
        # SemanticSelector handled out-of-band via the vector store (below).

    semantic_ids = await _semantic_market_ids(ir)

    where_clauses = []
    if title_clauses:
        where_clauses.append(or_(*title_clauses))
    if category_clauses:
        where_clauses.append(or_(*category_clauses))
    if semantic_ids:
        where_clauses.append(CoreMarket.id.in_(semantic_ids))

    if not where_clauses:
        return []

    stmt = (
        select(CoreMarket)
        .where(
            CoreMarket.venue == "polymarket",
            CoreMarket.resolved_at.is_(None),
            or_(*where_clauses),
        )
        .order_by(CoreMarket.id.desc())
        .limit(500)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())
