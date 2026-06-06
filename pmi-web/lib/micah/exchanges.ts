/**
 * Prediction-market exchange metadata (glyph + brand colour) for the Micah UI
 * chips. Ported verbatim from the prototype `pmi-new-frontend/data.js`. This is
 * static presentation data — exchange branding, not market data — so it stays a
 * hand-maintained constant rather than coming from pmi-api.
 */

export interface Exchange {
  name: string;
  color: string;
  glyph: string;
  label: string;
  /** Light glyph text needed on this exchange's (light) brand colour. */
  dark?: boolean;
}

export const EXCHANGES: Record<string, Exchange> = {
  kalshi: { name: "Kalshi", color: "#00D08C", glyph: "K", label: "Kalshi" },
  polymarket: { name: "Polymarket", color: "#1652F0", glyph: "P", label: "Polymarket" },
  robinhood: { name: "Robinhood", color: "#CCFF00", glyph: "R", label: "Robinhood", dark: true },
  metaculus: { name: "Metaculus", color: "#111111", glyph: "M", label: "Metaculus" },
  coinbase: { name: "Coinbase", color: "#1652F0", glyph: "C", label: "Coinbase" },
  manifold: { name: "Manifold", color: "#4E2DE0", glyph: "M", label: "Manifold" },
  predictit: { name: "PredictIt", color: "#E66A2C", glyph: "P", label: "PredictIt" },
  pinata: { name: "Pinata", color: "#111111", glyph: "P", label: "Pinata" },
  crowncoin: { name: "CrownCoin", color: "#4E2DE0", glyph: "♛", label: "CrownCoin" },
  insightpred: { name: "InsightPred", color: "#FFD500", glyph: "i", label: "Insight", dark: true },
  forecast: { name: "Forecast", color: "#111111", glyph: "F", label: "Forecast" },
  crypto: { name: "Crypto", color: "#F7931A", glyph: "₿", label: "Crypto" },
};

export function exchange(id: string): Exchange | undefined {
  return EXCHANGES[id];
}

/**
 * Resolve a venue string from pmi-api (e.g. "polymarket", "kalshi") to its chip
 * metadata, falling back to a neutral chip (first initial) for any venue not in
 * the table so a new exchange never renders blank.
 */
export function venueChip(venue: string | null | undefined): Exchange {
  if (venue && EXCHANGES[venue]) return EXCHANGES[venue];
  const name = venue ? venue.charAt(0).toUpperCase() + venue.slice(1) : "Unknown";
  return { name, color: "#8A8F98", glyph: (venue?.[0] ?? "?").toUpperCase(), label: name };
}
