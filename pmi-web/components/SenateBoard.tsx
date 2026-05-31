import type { SenateBoardPayload } from "@/lib/types";
import { BAND_META, BAND_ORDER, heatColor, isDarkHeat, type Band } from "@/lib/heat";

/**
 * Senate balance-of-power board (SHIP-2.5 (c)) — ported from the design
 * prototype `pmi-new-frontend/views-senate.jsx` into a Next.js server
 * component. Renders the real CORR-1.6 distribution: two majority tiles, a
 * 7-band seat-balance bar, and a per-race table. The USA choropleth and
 * per-state colouring are deferred (prob_by_state is empty until CORR-1.3).
 */
export function SenateBoard({ board }: { board: SenateBoardPayload }) {
  const races = [...board.races].sort(
    (a, b) => Math.abs(a.prob_r - 50) - Math.abs(b.prob_r - 50),
  );
  const totalBandSeats = BAND_ORDER.reduce((s, b) => s + (board.counts[b] ?? 0), 0);
  const thresholdPct =
    board.total_seats > 0 ? (board.majority_threshold / board.total_seats) * 100 : 50;

  return (
    <section className="space-y-6">
      <h2 className="font-serif text-2xl text-ink">Balance of power</h2>

      {/* Majority tiles + expected seats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <MajorityTile
          label="R majority"
          pct={board.p_r_majority}
          heat={95}
        />
        <MajorityTile
          label="D majority"
          pct={board.p_d_majority}
          heat={5}
        />
        <div className="rounded-xl border border-surface-border bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-ink-muted">
            Expected R seats
          </p>
          <p className="mt-1 text-4xl font-semibold tabular-nums text-ink">
            {board.expected_r_seats.toFixed(1)}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            ± {board.stdev_r_seats.toFixed(1)} · {board.n_contested} contested ·{" "}
            {board.holdover_r + board.holdover_d} holdover
          </p>
        </div>
      </div>

      {/* Seat-balance bar */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-xs text-ink-muted">
          <span>{board.d_secured} secured D</span>
          <span>{board.tossups} toss-ups</span>
          <span>{board.r_secured} secured R</span>
        </div>
        <div className="relative flex h-7 w-full overflow-hidden rounded-md">
          {BAND_ORDER.map((band) => {
            const n = board.counts[band] ?? 0;
            if (n === 0) return null;
            const pct = totalBandSeats > 0 ? (n / totalBandSeats) * 100 : 0;
            const heat = BAND_META[band].heat;
            return (
              <div
                key={band}
                className="flex items-center justify-center text-[11px] font-semibold"
                style={{
                  flexBasis: `${pct}%`,
                  background: heatColor(heat),
                  color: isDarkHeat(heat) ? "#FBFAF6" : "#11192C",
                }}
                title={`${BAND_META[band].label}: ${n}`}
              >
                {n}
              </div>
            );
          })}
          {/* majority threshold marker */}
          <div
            className="absolute top-0 h-full border-l-2 border-dashed border-ink"
            style={{ left: `${thresholdPct}%` }}
            title={`${board.majority_threshold} seats = majority`}
          />
        </div>
        <BandLegend counts={board.counts} />
      </div>

      {/* Per-race table */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h3 className="font-serif text-xl text-ink">Contested races</h3>
          <span className="text-xs text-ink-muted">
            sorted by closeness to 50
          </span>
        </div>
        {races.length === 0 ? (
          <p className="text-sm text-ink-muted">No contested races in this index yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-surface-border">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">P(R)</th>
                  <th className="px-3 py-2 font-medium">Race</th>
                  <th className="px-3 py-2 font-medium">Rating</th>
                  <th className="px-3 py-2 text-right font-medium">Volume 24h</th>
                </tr>
              </thead>
              <tbody>
                {races.map((r) => (
                  <tr key={r.market_id} className="border-t border-surface-border">
                    <td className="px-3 py-2">
                      <span
                        className="inline-block min-w-[3rem] rounded px-2 py-1 text-center text-xs font-semibold tabular-nums"
                        style={{
                          background: heatColor(r.prob_r),
                          color: isDarkHeat(r.prob_r) ? "#FBFAF6" : "#11192C",
                        }}
                      >
                        {r.prob_r.toFixed(0)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-ink">
                      {r.matchup ?? r.title}
                      {r.state && (
                        <span className="ml-2 font-mono text-xs text-ink-muted">
                          {r.state}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">
                      {bandLabel(r.band)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                      {r.volume_24h != null
                        ? `$${Math.round(r.volume_24h).toLocaleString()}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Deferred: USA choropleth needs a market→seat mapping (CORR-1.3). */}
      {Object.keys(board.prob_by_state).length === 0 && (
        <p className="rounded-lg border border-dashed border-surface-border bg-surface px-4 py-3 text-xs text-ink-muted">
          Per-state map and race attribution (matchup, incumbent, 14-day move)
          are pending a market→seat mapping (CORR-1.3).
        </p>
      )}
    </section>
  );
}

function MajorityTile({
  label,
  pct,
  heat,
}: {
  label: string;
  pct: number;
  heat: number;
}) {
  const dark = isDarkHeat(heat);
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: heatColor(heat), color: dark ? "#FBFAF6" : "#11192C" }}
    >
      <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-4xl font-semibold tabular-nums">{pct.toFixed(1)}%</p>
    </div>
  );
}

function BandLegend({ counts }: { counts: Record<string, number> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
      {BAND_ORDER.map((band) => (
        <span key={band} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: heatColor(BAND_META[band].heat) }}
          />
          {BAND_META[band].label}
          <span className="font-semibold text-ink">{counts[band] ?? 0}</span>
        </span>
      ))}
    </div>
  );
}

function bandLabel(band: string): string {
  return (BAND_META as Record<string, { label: string }>)[band]?.label ?? band;
}
