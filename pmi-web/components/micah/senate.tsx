/**
 * Senate board components ported from `pmi-new-frontend/views-senate.jsx`.
 * Server-rendered against the real /senate-board payload. Per-race state &
 * matchup are null until CORR-1.3, so the table renders the market title and
 * row navigation is disabled until a market→seat mapping exists.
 */
import { heatColor, isDarkHeat, BAND_ORDER, BAND_META, type Band } from "@/lib/heat";
import { ExchangeStack, Tag } from "./ui";
import type { SenateRace } from "@/lib/types";

const BAND_LABEL: Record<Band, string> = {
  "safe-d": "Safe Dem",
  "likely-d": "Likely Dem",
  "lean-d": "Lean Dem",
  tossup: "Toss-up",
  "lean-r": "Lean GOP",
  "likely-r": "Likely GOP",
  "safe-r": "Safe GOP",
};

export function SeatBalanceBar({
  counts,
  tossups,
}: {
  counts: Record<string, number>;
  tossups: number;
}) {
  const total = BAND_ORDER.reduce((a, k) => a + (counts[k] ?? 0), 0) || 100;
  return (
    <div className="seat-bar">
      <div className="seat-bar__head">
        <div className="seat-bar__title">Projected Senate composition · 119th Congress</div>
        <div className="seat-bar__sub">
          100 seats · 51 to control · {tossups} toss-up{tossups === 1 ? "" : "s"}
        </div>
      </div>

      <div className="seat-bar__chart">
        <div className="seat-bar__row">
          {BAND_ORDER.map((key) => {
            const n = counts[key] ?? 0;
            if (n === 0) return null;
            const heat = BAND_META[key].heat;
            return (
              <div
                key={key}
                className="seat-bar__seg"
                style={{ flexBasis: `${(n / total) * 100}%`, background: heatColor(heat), color: isDarkHeat(heat) ? "#FBFAF6" : "#11192C" }}
                title={`${BAND_LABEL[key]}: ${n}`}
              >
                <span className="seat-bar__seg-num">{n}</span>
              </div>
            );
          })}
        </div>
        <div className="seat-bar__threshold" data-label="DEM 51" style={{ left: "51%" }} />
        <div className="seat-bar__threshold seat-bar__threshold--right" data-label="GOP 51" style={{ left: "49%" }} />
      </div>

      <div className="seat-bar__scale">
        {[0, 25, 50, 75, 100].map((t) => (
          <span key={t} className="seat-bar__tick" style={{ left: `${t}%` }}>
            {t}
          </span>
        ))}
      </div>

      <div className="seat-bar__legend">
        {BAND_ORDER.map((key) => (
          <span key={key} className="seat-bar__legend-item">
            <span className="seat-bar__swatch" style={{ background: heatColor(BAND_META[key].heat) }} />
            {BAND_LABEL[key]} · {counts[key] ?? 0}
          </span>
        ))}
      </div>
    </div>
  );
}

export function SenateRaceTable({ races }: { races: SenateRace[] }) {
  return (
    <div className="senate-table">
      <div className="senate-table__head">
        <span>Race</span>
        <span>Market</span>
        <span>Rating</span>
        <span style={{ textAlign: "right" }}>P(GOP)</span>
        <span style={{ textAlign: "right" }}>24h Vol</span>
        <span>Exchanges</span>
      </div>

      {races.map((r) => {
        const swatch = heatColor(r.prob_r);
        const band = (BAND_ORDER as readonly string[]).includes(r.band) ? (r.band as Band) : "tossup";
        return (
          <div key={r.market_id} className="senate-table__row">
            <span className="senate-table__state">
              <span className="senate-table__state-swatch" style={{ background: swatch }} />
              {r.state ?? "—"}
            </span>
            <span>
              <div className="senate-table__matchup">{r.matchup ?? r.title}</div>
              {r.incumbent_party && (
                <div className="senate-table__tag-row">
                  <span className={`inc-badge inc-badge--${r.incumbent_party.toLowerCase()}`}>
                    Inc · {r.incumbent_party}
                  </span>
                </div>
              )}
            </span>
            <span className="senate-table__band">{BAND_LABEL[band]}</span>
            <span className="senate-table__prob">
              {r.prob_r.toFixed(0)}
              <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 500 }}>%</span>
            </span>
            <span className="senate-table__delta senate-table__delta--flat">
              {r.volume_24h == null ? "—" : `$${(r.volume_24h / 1000).toFixed(0)}k`}
            </span>
            <span className="senate-table__excs">
              {r.exchanges.length > 0 ? (
                <ExchangeStack ids={r.exchanges.slice(0, 4)} extras={Math.max(0, r.exchanges.length - 4)} size={22} />
              ) : (
                <Tag>polymarket</Tag>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
