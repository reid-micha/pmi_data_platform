/* views-senate.jsx — SenateView (2026 US Senate Index) */

const { useState: sState } = React;

// ---------- Seat balance bar (the spine of the page) ----------
// Renders 7 stacked segments across 100% width, with a dashed "51" needle.
function SeatBalanceBar({ counts, holdover, dSecured, rSecured, tossups }) {
  // band order, left → right: D-safest first, R-safest last
  const order = [
    { key: 'safe-d',   label: 'Safe Dem',    color: window.heatColor(8),   fg: '#FBFAF6' },
    { key: 'likely-d', label: 'Likely Dem',  color: window.heatColor(22),  fg: '#FBFAF6' },
    { key: 'lean-d',   label: 'Lean Dem',    color: window.heatColor(36),  fg: '#11192C' },
    { key: 'tossup',   label: 'Toss-up',     color: window.heatColor(50),  fg: '#11192C' },
    { key: 'lean-r',   label: 'Lean GOP',    color: window.heatColor(64),  fg: '#11192C' },
    { key: 'likely-r', label: 'Likely GOP',  color: window.heatColor(78),  fg: '#FBFAF6' },
    { key: 'safe-r',   label: 'Safe GOP',    color: window.heatColor(92),  fg: '#FBFAF6' },
  ];

  // The two 51-thresholds. From the left (D needs 51), 51% mark is at position 51/100.
  // From the right (R needs 51), 51% mark is at position 49/100 (i.e., 100-51).
  // Each party "owns" the side they're growing from.
  const dThreshold = 51; // pixels position as % from left
  const rThreshold = 49;

  return (
    <div className="seat-bar">
      <div className="seat-bar__head">
        <div className="seat-bar__title">Projected Senate composition · 119th Congress</div>
        <div className="seat-bar__sub">100 seats · 51 to control · {tossups} toss-up{tossups === 1 ? '' : 's'}</div>
      </div>

      <div className="seat-bar__chart">
        <div className="seat-bar__row">
          {order.map(o => {
            const n = counts[o.key];
            if (n === 0) return null;
            return (
              <div key={o.key}
                className="seat-bar__seg"
                style={{ flexBasis: `${n}%`, background: o.color, color: o.fg }}
                title={`${o.label}: ${n}`}>
                <span className="seat-bar__seg-num">{n}</span>
              </div>
            );
          })}
        </div>

        {/* D threshold (51 from the left, marker on the right side of the line) */}
        <div className="seat-bar__threshold"
             data-label="DEM 51"
             style={{ left: `${dThreshold}%` }} />
        {/* R threshold (51 from the right) */}
        <div className="seat-bar__threshold seat-bar__threshold--right"
             data-label="GOP 51"
             style={{ left: `${rThreshold}%` }} />
      </div>

      <div className="seat-bar__scale">
        {[0, 25, 50, 75, 100].map(t => (
          <span key={t} className="seat-bar__tick" style={{ left: `${t}%` }}>{t}</span>
        ))}
      </div>

      <div className="seat-bar__legend">
        {order.map(o => (
          <span key={o.key} className="seat-bar__legend-item">
            <span className="seat-bar__swatch" style={{ background: o.color }} />
            {o.label} · {counts[o.key]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------- Tossup right-rail ----------
function TossupRail({ races, onNavigate }) {
  return (
    <div className="tossup-rail">
      <div className="tossup-rail__title">TOSS-UPS · {races.length}</div>
      <div className="tossup-rail__list">
        {races.map(r => {
          const fill = window.heatColor(r.probR);
          const dark = r.probR > 65 || r.probR < 35;
          return (
            <div key={r.state}
                 className="tossup-rail__cell"
                 onClick={() => onNavigate && onNavigate({ view: 'state', state: r.state })}
                 role="button"
                 tabIndex={0}>
              <span className="tossup-rail__code"
                    style={{ background: fill, color: dark ? '#FBFAF6' : '#11192C' }}>
                {r.state}
              </span>
              <span className="tossup-rail__matchup">{r.matchup}</span>
              <span className="tossup-rail__prob">{r.probR}<span style={{ fontSize: 10, color: 'var(--ink-3)' }}>R</span></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Marquee race table ----------
function SenateRaceTable({ races, onNavigate }) {
  const bandLabel = {
    'safe-d': 'Safe Dem', 'likely-d': 'Likely Dem', 'lean-d': 'Lean Dem',
    'tossup': 'Toss-up',
    'lean-r': 'Lean GOP', 'likely-r': 'Likely GOP', 'safe-r': 'Safe GOP',
  };

  return (
    <div className="senate-table">
      <div className="senate-table__head">
        <span>State</span>
        <span>Matchup</span>
        <span>Rating</span>
        <span style={{ textAlign: 'right' }}>P(GOP)</span>
        <span style={{ textAlign: 'right' }}>14-day Δ</span>
        <span>Exchanges</span>
      </div>

      {races.map(r => {
        const swatch = window.heatColor(r.probR);
        const deltaCls = r.d14 > 0.05 ? 'senate-table__delta--up'
                      : r.d14 < -0.05 ? 'senate-table__delta--down'
                                      : 'senate-table__delta--flat';
        const deltaTxt = (r.d14 > 0 ? '+' : '') + r.d14.toFixed(1);
        return (
          <div key={r.state}
               className="senate-table__row"
               onClick={() => onNavigate && onNavigate({ view: 'state', state: r.state })}
               role="button"
               tabIndex={0}>
            <span className="senate-table__state">
              <span className="senate-table__state-swatch" style={{ background: swatch }} />
              {r.state}
            </span>

            <span>
              <div className="senate-table__matchup">{r.matchup}</div>
              <div className="senate-table__tag-row">
                <span className={`inc-badge inc-badge--${r.inc.toLowerCase()}`}>
                  Inc · {r.inc}
                </span>
                {r.special && <Tag>Special</Tag>}
              </div>
            </span>

            <span className="senate-table__band">{bandLabel[r.band]}</span>

            <span className="senate-table__prob">{r.probR}<span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 500 }}>%</span></span>

            <span className={`senate-table__delta ${deltaCls}`}>
              {r.d14 === 0 ? '—' : deltaTxt}
            </span>

            <span className="senate-table__excs">
              <ExchangeStack ids={r.excs.slice(0, 4)} extras={Math.max(0, r.excs.length - 4)} size={22} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------- The view itself ----------
function SenateView({ onNavigate, brand }) {
  const S = window.MICAH_SENATE;
  const [mode, setMode] = sState('map'); // 'map' | 'chart'
  const [tab, setTab] = sState('marquee'); // 'marquee' | 'all'

  // Aggregate market signals — sum of contracts & volume across our race set
  const totalContracts = S.races.reduce((a, r) => a + r.contracts, 0);
  const totalVolumeM = (S.races.reduce((a, r) => a + r.volume, 0) / 1_000_000).toFixed(1);

  return (
    <div className="view">
      <CropFrame>
        <div className="breadcrumb">
          <button className="breadcrumb__link" onClick={() => onNavigate({ view: 'world' })}>World</button>
          <span className="breadcrumb__sep">›</span>
          <span>2026 Senate</span>
        </div>

        <PageTitle
          caps={brand === 'caps'}
          title="2026 US Senate Index"
          body="An aggregated, data-driven estimate of which party holds the US Senate after the 2026 midterm elections. The index composites probabilities from 34 individual race markets, applies seat-by-seat weighting against the 51-seat majority threshold, and surfaces the toss-ups that move the needle."
        />

        <div className="row-between" style={{ marginTop: 'var(--s-6)' }}>
          <span className="t-eyebrow">LIVE · 34 SEATS IN PLAY · 51 TO CONTROL · UPDATED MAY 28</span>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'map',   label: 'Map' },
              { value: 'chart', label: '14-Day Graph' },
            ]}
          />
        </div>

        {/* Hero: paired probability tiles + stats column on left ----------------- */}
        <div className="senate-hero">
          <div className="senate-hero__stats">
            <StatCard value={`$${totalVolumeM}M`} label="24h Volume" live />
            <StatCard value={`${(totalContracts).toLocaleString()}`} label="Live Contracts" />
            <StatCard value="11" label="Prediction Market Exchanges">
              <ExchangeStack ids={['kalshi','polymarket','robinhood','coinbase']} extras={7} size={22} />
            </StatCard>
            <StatCard value="34" label="Race PMIs" info />
          </div>

          <div className="senate-hero__main">
            {/* Two big paired probability tiles */}
            <div className="senate-paired">
              <ScoreTile
                value={`${S.pmiGOPMajority}%`}
                label="GOP Majority Probability"
                tone="red"
                size="lg"
              />
              <ScoreTile
                value={`${S.pmiDemMajority}%`}
                label="Dem Majority Probability"
                tone="blue"
                size="lg"
              />
            </div>

            {/* Seat balance bar */}
            <SeatBalanceBar
              counts={S.counts}
              holdover={S.holdover}
              dSecured={S.dSecured}
              rSecured={S.rSecured}
              tossups={S.tossups}
            />
          </div>
        </div>

        {/* Map / Chart toggle area ------------------------------------------------ */}
        <div className="senate-viz" style={{ marginTop: 'var(--s-10)' }}>
          {mode === 'map' ? (
            <>
              <div className="senate-viz__map">
                <UsaMap
                  width={780}
                  height={500}
                  dataByCode={S.probByState}
                  dimMissing
                  tipFormatter={(p) => {
                    const r = S.raceByState[p.code];
                    if (!r) return 'Not on 2026 ballot';
                    return `${r.matchup}  ·  P(R) ${r.probR}%`;
                  }}
                  onSelect={(code) => {
                    if (S.raceByState[code]) onNavigate({ view: 'state', state: code });
                  }}
                />
                <div style={{ marginTop: 'var(--s-5)' }}>
                  <HeatScale />
                </div>
                <p className="t-label" style={{ marginTop: 'var(--s-3)' }}>
                  Colored states have a Senate race on the 2026 ballot. Greyed states are not on the ballot this cycle.
                </p>
              </div>
              <div className="senate-viz__rail">
                <TossupRail races={S.tossupRail} onNavigate={onNavigate} />
              </div>
            </>
          ) : (
            <div className="senate-viz__map" style={{ width: '100%' }}>
              <div style={{ marginBottom: 'var(--s-3)' }}>
                <span className="t-label">P(GOP holds 51+) · trailing 14 days</span>
              </div>
              <TimeChart
                data={S.series14}
                width={960}
                height={460}
                color="#8B1E2D"
                yLabel="P(GOP Majority) %"
              />
            </div>
          )}
        </div>

        {/* Race table ------------------------------------------------------------- */}
        <div className="section" style={{ marginTop: 'var(--s-12)' }}>
          <h2 className={brand === 'caps' ? 't-display-caps' : 't-display'} style={{ fontSize: 36 }}>
            Race PMIs
          </h2>
          <p className="t-body" style={{ marginTop: 'var(--s-2)', maxWidth: 820 }}>
            Each race is a single-factor PMI. Probabilities are derived from active prediction-market contracts
            on Kalshi, Polymarket, Metaculus, Robinhood and 7 other exchanges, weighted by volume and recency.
          </p>

          <div style={{ marginTop: 'var(--s-5)' }}>
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'marquee', label: `Marquee · ${S.marquee.length}` },
                { value: 'all',     label: `All Races · ${S.races.length}` },
              ]}
            />
          </div>

          <SenateRaceTable
            races={tab === 'marquee'
              ? S.marquee
              : S.races.slice().sort((a, b) => Math.abs(a.probR - 50) - Math.abs(b.probR - 50))}
            onNavigate={onNavigate}
          />
        </div>
      </CropFrame>
    </div>
  );
}

Object.assign(window, { SenateView, SeatBalanceBar, TossupRail, SenateRaceTable });
