"""Selector: turn `IndexDef.selectors` into a list of `core_markets` rows.

P0 supports `keyword` (case-insensitive word-boundary match against title) and
`category` (matches `core_markets.category`). Semantic / pgvector selectors come
in P2 once embeddings are populated.

Keyword matching uses Postgres POSIX regex (`~*`) with `\\m...\\M` word boundaries
rather than substring ilike — `war` no longer matches `software`/`award`, and
`strike` no longer matches `Counter-Strike`. Multi-word terms like
`armed forces` are matched as a whole phrase bounded on both sides. Terms are
regex-escaped so punctuation inside a term is treated literally.
"""

from __future__ import annotations

import re

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from pmi_core.dsl.ir import CategorySelector, IndexDef, KeywordSelector
from pmi_core.models import CoreMarket


def _keyword_pattern(term: str) -> str:
    """Build a Postgres POSIX regex for a single keyword/phrase.

    `\\m` / `\\M` are Postgres word boundary anchors (start / end of word).
    `re.escape` neutralises any regex metacharacters inside the term so e.g.
    a future selector with `"u.s."` matches literally rather than as regex.
    """
    return rf"\m{re.escape(term)}\M"


async def select_markets(session: AsyncSession, ir: IndexDef) -> list[CoreMarket]:
    """Return distinct markets matching ANY of the selectors. P0: keyword OR category."""

    title_clauses = []
    category_clauses = []
    for sel in ir.selectors:
        if isinstance(sel, KeywordSelector):
            for term in sel.terms:
                title_clauses.append(CoreMarket.title.op("~*")(_keyword_pattern(term)))
        elif isinstance(sel, CategorySelector):
            category_clauses.append(CoreMarket.category == sel.polymarket_tag)
        # SemanticSelector deliberately ignored at P0 — schema valid, eval is P2.

    where_clauses = []
    if title_clauses:
        where_clauses.append(or_(*title_clauses))
    if category_clauses:
        where_clauses.append(or_(*category_clauses))

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
