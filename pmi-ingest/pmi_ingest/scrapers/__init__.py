"""Playwright-based scrapers.

Two venues at P0 — Robinhood (event contracts) and Crypto.com prediction
markets — neither of which exposes a public REST API. Both subclass
`PlaywrightScraper` (browser lifecycle + rate-limited navigation) and
emit raw contract dicts that the persistence adapter writes into
`core_markets` + `ts_price_snapshots`.

Ported from `micah/server/app/services/{robinhood,crypto}/` (2026-06-01).
"""
