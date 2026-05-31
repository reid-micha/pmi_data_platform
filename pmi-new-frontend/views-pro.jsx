/* Research Desk — focused single-topic view with dimension switches.
   Editorial style. Pick ONE contract, then swap between
   Price · Analogues · Calibration · Venues · Correlations · Notes. */

const { useState: rState, useEffect: rEffect, useMemo: rMemo } = React;

// ============================================================
// Data (kept stable)
// ============================================================
const RESEARCH_DATA = (() => {
  const universe = [
    { sym: 'TX-GOV-26',   short:'TX Gov 2026',           desc: 'Republican wins',          mkt: 0.820, fair: 0.847, vol: 1842310, brier: 0.18, polls: 0.84, news: 12, category: 'Politics' },
    { sym: 'FL-GOV-26',   short:'FL Gov 2026',           desc: 'Republican wins',          mkt: 0.780, fair: 0.812, vol: 2401200, brier: 0.16, polls: 0.81, news:  9, category: 'Politics' },
    { sym: 'MI-GOV-26',   short:'MI Gov 2026',           desc: 'Democratic candidate wins',mkt: 0.580, fair: 0.612, vol:  892140, brier: 0.21, polls: 0.59, news: 14, category: 'Politics' },
    { sym: 'GA-3P-26',    short:'GA 3rd-party',          desc: 'Third party >5% in 2026',  mkt: 0.880, fair: 0.831, vol:  720500, brier: 0.32, polls: 0.79, news:  5, category: 'Politics' },
    { sym: 'REC-Q4-26',   short:'US Recession',          desc: 'Recession by Q4 2026',     mkt: 0.420, fair: 0.388, vol: 3120800, brier: 0.14, polls: null, news: 28, category: 'Macro' },
    { sym: 'FED-50-OCT',  short:'Fed -50bp',             desc: 'Fed cuts ≥50bp by October',mkt: 0.310, fair: 0.342, vol: 1408200, brier: 0.12, polls: null, news: 22, category: 'Macro' },
    { sym: 'MAGA-IDX',    short:'MAGA Composite',        desc: 'National political index',  mkt: 0.930, fair: 0.918, vol: 8419700, brier: 0.15, polls: 0.91, news: 41, category: 'Politics' },
    { sym: 'BTC-100K-EOY',short:'BTC >$100k',            desc: 'Bitcoin closes above $100k',mkt: 0.670, fair: 0.704, vol: 2104500, brier: 0.13, polls: null, news: 17, category: 'Crypto' },
  ];

  function mkSeries(n, base, drift, noise, seed) {
    const out = []; let v = base;
    for (let i = 0; i < n; i++) {
      const trend = drift * (i / n);
      const s = Math.sin((seed + i) * 0.4) * noise;
      const r = (Math.cos((seed + i) * 1.1) - 0.5) * noise * 0.6;
      v = base + trend + s + r;
      out.push(Math.max(0.05, Math.min(0.97, v)));
    }
    return out;
  }
  const series = {
    market: mkSeries(60, 0.785, 0.04, 0.013, 1.0),
    fair:   mkSeries(60, 0.815, 0.025, 0.005, 2.0),
    polls:  mkSeries(60, 0.825, 0.02, 0.014, 3.0),
  };
  const events = [
    { x: 8,  label: 'GOP primary debate, Houston',      pol: 'up'   },
    { x: 18, label: 'Quinnipiac TX poll release',       pol: 'down' },
    { x: 27, label: 'Federal indictment dropped',       pol: 'down' },
    { x: 36, label: 'Polymarket whale +$1.8M long',     pol: 'up'   },
    { x: 47, label: 'Reuters scoop · cabinet reshuffle',pol: 'up'   },
    { x: 55, label: 'CPI prints hotter than expected',  pol: 'flat' },
  ];

  const decomp = [
    { exc: 'polymarket', price: 0.823, weight: 38, vol: '$4.2M', confidence: 'high' },
    { exc: 'kalshi',     price: 0.819, weight: 26, vol: '$2.8M', confidence: 'high' },
    { exc: 'robinhood',  price: 0.821, weight: 14, vol: '$870K', confidence: 'med'  },
    { exc: 'manifold',   price: 0.815, weight:  9, vol: '$220K', confidence: 'low'  },
    { exc: 'metaculus',  price: 0.827, weight:  8, vol: '$110K', confidence: 'med'  },
    { exc: 'predictit',  price: 0.812, weight:  5, vol:  '$95K', confidence: 'low'  },
  ];

  const calCategories = ['Politics', 'Macro', 'Geopolitics', 'Crypto', 'Sports'];
  const calExchanges  = ['polymarket','kalshi','robinhood','metaculus','manifold','predictit'];
  function mkCalibration() {
    const m = {};
    calExchanges.forEach((e, ei) => {
      m[e] = {};
      calCategories.forEach((c, ci) => {
        const v = 0.08 + Math.abs(Math.sin((ei + 1) * (ci + 3) * 1.7)) * 0.22;
        m[e][c] = +v.toFixed(3);
      });
    });
    return m;
  }
  const calibration = mkCalibration();

  const eventStudy = {
    summary: 'Across 4 analogous Texas gubernatorial cycles, prediction-market prices at T-180 days have consistently underpriced the eventual Republican win probability by 19-28 percentage points. Mean miss: +23pp.',
    analogues: [
      { year: 2022, label: 'Abbott vs O\'Rourke',  mktAt: 0.74, error: +0.26 },
      { year: 2018, label: 'Abbott vs Valdez',     mktAt: 0.81, error: +0.19 },
      { year: 2014, label: 'Abbott vs Davis',      mktAt: 0.79, error: +0.21 },
      { year: 2010, label: 'Perry vs White',       mktAt: 0.72, error: +0.28 },
    ],
  };

  const correlations = [
    { sym: 'FL-GOV-26',    label: 'FL Gov · Republican wins',     r:  0.81, n: 142 },
    { sym: 'MAGA-IDX',     label: 'MAGA Composite Index',         r:  0.74, n: 142 },
    { sym: 'GA-3P-26',     label: 'GA third-party >5%',           r: -0.42, n: 142 },
    { sym: 'REC-Q4-26',    label: 'US Recession by Q4 2026',      r: -0.31, n: 142 },
    { sym: 'FED-50-OCT',   label: 'Fed cuts ≥50bp by October',    r: -0.18, n: 142 },
  ];

  return { universe, series, events, decomp, calCategories, calExchanges, calibration, eventStudy, correlations };
})();
window.RESEARCH_DATA = RESEARCH_DATA;

// ============================================================
// Format helpers
// ============================================================
const rFmt = {
  px:  v => (v * 100).toFixed(1) + '¢',
  pxF: v => (v * 100).toFixed(2) + '¢',
  pp:  v => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + 'pp',
};

function brierFill(v) {
  const t = Math.max(0, Math.min(1, (v - 0.05) / 0.27));
  const stops = [
    [0,    [22, 52, 138]],    [0.25, [111, 143, 219]],
    [0.50, [233, 226, 220]],  [0.75, [220, 139, 149]], [1.00, [139, 30, 45]],
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i+1][0]) { lo = stops[i]; hi = stops[i+1]; break; }
  }
  const u = (t - lo[0]) / (hi[0] - lo[0] || 1);
  const c = lo[1].map((x, i) => Math.round(x + (hi[1][i] - x) * u));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ============================================================
// Hero — single focused stats row
// ============================================================
function Hero({ contract }) {
  const edge = contract.fair - contract.mkt;
  const edgeTone = edge > 0.01 ? 'pos' : edge < -0.01 ? 'neg' : 'flat';
  return (
    <div className="rd2-hero">
      <div className="rd2-hero__cell">
        <div className="t-label">Market price</div>
        <div className="rd2-hero__v">{rFmt.pxF(contract.mkt)}</div>
        <div className="t-label" style={{color:'var(--ink-3)'}}>implied probability</div>
      </div>
      <div className="rd2-hero__cell rd2-hero__cell--fair">
        <div className="t-label">Micah Fair value</div>
        <div className="rd2-hero__v">{rFmt.pxF(contract.fair)}</div>
        <div className="t-label" style={{color:'var(--ink-3)'}}>weighted composite</div>
      </div>
      <div className={`rd2-hero__cell rd2-hero__cell--edge rd2-hero__cell--${edgeTone}`}>
        <div className="t-label">Edge</div>
        <div className="rd2-hero__v">{rFmt.pp(edge)}</div>
        <div className="t-label" style={{color:'var(--ink-3)'}}>fair − market</div>
      </div>
      <div className="rd2-hero__cell">
        <div className="t-label">Confidence</div>
        <div className="rd2-hero__v">0.91</div>
        <div className="t-label" style={{color:'var(--ink-3)'}}>high · 6 venues</div>
      </div>
    </div>
  );
}

// ============================================================
// Dimension switcher (tabs)
// ============================================================
const TABS = [
  { id: 'price',     label: 'Price history',  hint: '14-day, with poll & news overlay' },
  { id: 'analogues', label: 'Analogues',      hint: '4 prior election cycles' },
  { id: 'calib',     label: 'Calibration',    hint: 'Brier by venue × category' },
  { id: 'venues',    label: 'Venue decomp',   hint: 'Where the fair value comes from' },
  { id: 'correl',    label: 'Correlations',   hint: 'Top co-movers, 142d window' },
  { id: 'notes',     label: 'Notes',          hint: 'Hypothesis log for this contract' },
];

function TabBar({ active, onChange }) {
  return (
    <div className="rd2-tabs" role="tablist">
      {TABS.map(t => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === active}
          className={`rd2-tab ${t.id === active ? 'is-active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// TAB: Price history (multi-line + event markers)
// ============================================================
function TabPrice() {
  const [overlays, setOverlays] = rState({ fair: true, polls: true, events: true, edge: true });
  const w = 980, h = 380;
  const pad = { l: 60, r: 78, t: 16, b: 50 };
  const inner = { w: w - pad.l - pad.r, h: h - pad.t - pad.b };
  const { market, fair, polls } = RESEARCH_DATA.series;
  const allMin = Math.min(...market, ...fair, ...polls) - 0.02;
  const allMax = Math.max(...market, ...fair, ...polls) + 0.02;
  const range = allMax - allMin;
  const xStep = inner.w / (market.length - 1);
  const px2y = v => pad.t + inner.h - ((v - allMin) / range) * inner.h;
  const idx2x = i => pad.l + i * xStep;
  const line = (arr) => 'M ' + arr.map((v, i) => idx2x(i) + ',' + px2y(v)).join(' L ');

  const last = { m: market.at(-1), f: fair.at(-1) };
  const edgeNow = last.f - last.m;

  const [hover, setHover] = rState(null);

  return (
    <div className="rd2-pane">
      <div className="rd2-pane__head">
        <div>
          <h3 className="t-h3" style={{margin:0}}>14-day implied probability</h3>
          <p className="t-body-sm" style={{margin:'4px 0 0',color:'var(--ink-3)'}}>
            Market price is the canonical observation. Toggle overlays to compare.
          </p>
        </div>
        <div className="rd2-overlays">
          {[
            { k:'fair',   label:'Micah Fair', dot:'#1A3FA8' },
            { k:'polls',  label:'Polls',      dot:'#6B7180', dash: true },
            { k:'edge',   label:'Edge band',  dot:'rgba(26,63,168,.25)' },
            { k:'events', label:'News events',dot:'#11192C', circle: true },
          ].map(o => (
            <label key={o.k} className={`rd2-overlay ${overlays[o.k] ? 'is-on' : ''}`}>
              <input type="checkbox" checked={overlays[o.k]}
                     onChange={e => setOverlays({...overlays, [o.k]: e.target.checked})} />
              <span className={`rd2-overlay__dot ${o.dash ? 'is-dash' : ''} ${o.circle ? 'is-circle' : ''}`} style={{background: o.dot}} />
              {o.label}
            </label>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="rd2-svg">
        {/* grid */}
        {[0, 0.25, 0.5, 0.75, 1].map(t => {
          const y = pad.t + t * inner.h;
          return (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke="#E1DCD0" strokeWidth="1" />
              <text x={pad.l - 10} y={y + 3} fontSize="11" textAnchor="end" fill="#6B7180" fontFamily="Inter">
                {((allMax - t * range) * 100).toFixed(0)}¢
              </text>
            </g>
          );
        })}
        {[0, 15, 30, 45, 59].map(i => (
          <text key={i} x={idx2x(i)} y={h - 28} fontSize="11" fill="#6B7180" textAnchor="middle" fontFamily="Inter">
            T-{60 - i}d
          </text>
        ))}

        {/* edge band */}
        {overlays.edge && overlays.fair && (
          <path
            d={line(market) + ' L ' + idx2x(market.length - 1) + ',' + px2y(fair[fair.length - 1])
              + ' L ' + [...fair].reverse().map((v, i) => idx2x(fair.length - 1 - i) + ',' + px2y(v)).join(' L ') + ' Z'}
            fill={edgeNow > 0 ? 'rgba(26,63,168,.10)' : 'rgba(139,30,45,.10)'}
          />
        )}

        {/* event markers */}
        {overlays.events && RESEARCH_DATA.events.map((ev, i) => {
          const x = idx2x(ev.x);
          const color = ev.pol === 'up' ? '#1A3FA8' : ev.pol === 'down' ? '#8B1E2D' : '#6B7180';
          return (
            <g key={i} onMouseEnter={() => setHover({ x, y: pad.t + 6, ev })} onMouseLeave={() => setHover(null)}
               style={{cursor:'pointer'}}>
              <line x1={x} x2={x} y1={pad.t + 14} y2={pad.t + inner.h} stroke={color} strokeWidth="1" strokeDasharray="2 3" opacity=".4" />
              <circle cx={x} cy={pad.t + 6} r={4} fill={color} />
            </g>
          );
        })}

        {/* lines */}
        {overlays.polls && <path d={line(polls)} fill="none" stroke="#6B7180" strokeWidth="1.5" strokeDasharray="5 4" opacity=".9" />}
        {overlays.fair  && <path d={line(fair)}  fill="none" stroke="#1A3FA8" strokeWidth="1.8" />}
        <path d={line(market)} fill="none" stroke="#11192C" strokeWidth="2.4" />

        {/* last labels */}
        {[{v:last.m,c:'#11192C'}].concat(overlays.fair ? [{v:last.f,c:'#1A3FA8'}] : []).map((p,i) => (
          <g key={i}>
            <rect x={w - pad.r + 6} y={px2y(p.v) - 10} width={pad.r - 12} height={20} fill={p.c} rx="3" />
            <text x={w - pad.r + 13} y={px2y(p.v) + 4} fontSize="11" fontWeight="700" fill="#FBFAF6" fontFamily="Inter">
              {rFmt.px(p.v)}
            </text>
          </g>
        ))}

        {hover && (
          <g>
            <rect x={Math.min(hover.x + 8, w - 240)} y={hover.y + 6} width={230} height={28}
                  fill="#FBFAF6" stroke="#C9C3B5" rx="3" />
            <text x={Math.min(hover.x + 16, w - 232)} y={hover.y + 25} fontSize="12" fill="#11192C" fontFamily="Inter">
              {hover.ev.label}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ============================================================
// TAB: Analogues
// ============================================================
function TabAnalogues() {
  const study = RESEARCH_DATA.eventStudy;
  const maxErr = Math.max(...study.analogues.map(a => Math.abs(a.error)));
  return (
    <div className="rd2-pane">
      <blockquote className="rd-quote">{study.summary}</blockquote>
      <div className="rd-table">
        <div className="rd-table__row rd-table__row--head">
          <span>Cycle</span>
          <span>Market at T-180</span>
          <span>Resolution</span>
          <span>Error</span>
          <span>Distribution</span>
        </div>
        {study.analogues.map(a => (
          <div key={a.year} className="rd-table__row">
            <span className="rd-analogue__label">
              <strong>{a.year}</strong>
              <span className="t-body-sm" style={{color:'var(--ink-3)'}}>{a.label}</span>
            </span>
            <span className="rd-table__num">{rFmt.pxF(a.mktAt)}</span>
            <span className="rd-resolved">
              <span className="rd-resolved__dot" />Yes · 100¢
            </span>
            <span className={`rd-table__num ${a.error >= 0 ? 'rd-num--pos' : 'rd-num--neg'}`}>{rFmt.pp(a.error)}</span>
            <span className="rd-bar">
              <span className="rd-bar__mid" />
              <span className={`rd-bar__fill ${a.error >= 0 ? 'rd-bar__fill--pos' : 'rd-bar__fill--neg'}`}
                    style={{ width: `${(Math.abs(a.error) / maxErr) * 50}%`, [a.error >= 0 ? 'left' : 'right']: '50%' }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// TAB: Calibration
// ============================================================
function TabCalibration() {
  const { calCategories: cats, calExchanges: exs, calibration: m } = RESEARCH_DATA;
  return (
    <div className="rd2-pane">
      <p className="t-body" style={{color:'var(--ink-2)', maxWidth:760, margin:'0 0 var(--s-4)'}}>
        Brier score by venue × category — lower is better. Polymarket and Metaculus lead on Politics;
        Kalshi is strongest on Macro. The selected contract (<strong>TX-GOV-26</strong>) sits in the Politics column.
      </p>
      <div className="rd-heatmap">
        <div className="rd-heatmap__row rd-heatmap__row--head">
          <span></span>
          {cats.map(c => <span key={c} className="rd-heatmap__hcell t-label">{c}</span>)}
        </div>
        {exs.map(e => (
          <div key={e} className="rd-heatmap__row">
            <span className="rd-heatmap__rowlabel">
              <ExchangeChip id={e} size={18} />
              <span className="t-body-sm" style={{fontWeight:600}}>{window.MICAH.exchanges[e].name}</span>
            </span>
            {cats.map(c => {
              const v = m[e][c];
              const bg = brierFill(v);
              const isLight = v > 0.13 && v < 0.22;
              return (
                <span key={c} className="rd-heatmap__cell" style={{background:bg, color:isLight?'var(--ink-1)':'#FBFAF6'}}>
                  {v.toFixed(2)}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="rd-heatmap__legend t-label">
        <span>better calibration</span>
        <div className="rd-heatmap__scale">
          {[0.06,0.12,0.18,0.24,0.30].map(v => <span key={v} style={{background:brierFill(v)}} />)}
        </div>
        <span>worse</span>
      </div>
    </div>
  );
}

// ============================================================
// TAB: Venue decomp + cross-venue board
// ============================================================
function TabVenues() {
  const rows = RESEARCH_DATA.decomp;
  const weighted = rows.reduce((s, r) => s + r.price * r.weight, 0) / 100;
  const bestAsk = Math.min(...rows.map(r => r.price + 0.002));
  const bestBid = Math.max(...rows.map(r => r.price - 0.002));
  return (
    <div className="rd2-pane">
      <div className="rd2-venues-grid">
        <div>
          <h4 className="t-h3" style={{margin:'0 0 var(--s-3)', fontSize:18}}>Source decomposition</h4>
          <div className="rd-decomp">
            {rows.map(r => (
              <div key={r.exc} className="rd-decomp__row">
                <span className="rd-decomp__exc">
                  <ExchangeChip id={r.exc} size={18} />
                  <span className="t-body-sm">{window.MICAH.exchanges[r.exc].name}</span>
                </span>
                <span className="rd-decomp__bar">
                  <span style={{width: r.weight + '%'}} className={`rd-decomp__bar-fill rd-decomp__bar-fill--${r.confidence}`} />
                </span>
                <span className="rd-decomp__weight">{r.weight}%</span>
                <span className="rd-decomp__price">{rFmt.px(r.price)}</span>
              </div>
            ))}
          </div>
          <div className="rd2-venues__foot">
            <span className="t-label">Weighted composite</span>
            <span className="rd2-venues__total">{rFmt.pxF(weighted)}</span>
          </div>
        </div>
        <div>
          <h4 className="t-h3" style={{margin:'0 0 var(--s-3)', fontSize:18}}>Cross-venue board</h4>
          <div className="rd-table">
            <div className="rd-table__row rd-table__row--head rd-table__row--venues">
              <span>Venue</span><span>Bid</span><span>Ask</span><span>Last</span><span>Vol 24h</span><span>Conf.</span>
            </div>
            {rows.map(r => {
              const bid = +(r.price - 0.002).toFixed(3);
              const ask = +(r.price + 0.002).toFixed(3);
              return (
                <div key={r.exc} className="rd-table__row rd-table__row--venues">
                  <span className="rd-venue__name">
                    <ExchangeChip id={r.exc} size={20} />
                    <span>{window.MICAH.exchanges[r.exc].name}</span>
                  </span>
                  <span className={`rd-table__num ${bid === bestBid ? 'rd-table__num--best' : ''}`}>{rFmt.px(bid)}</span>
                  <span className={`rd-table__num ${ask === bestAsk ? 'rd-table__num--best' : ''}`}>{rFmt.px(ask)}</span>
                  <span className="rd-table__num">{rFmt.px(r.price)}</span>
                  <span className="rd-table__num rd-table__num--muted">{r.vol}</span>
                  <span><Tag tone={r.confidence === 'high' ? 'direct' : 'neutral'}>{r.confidence}</Tag></span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TAB: Correlations
// ============================================================
function TabCorrelations() {
  return (
    <div className="rd2-pane">
      <p className="t-body" style={{color:'var(--ink-2)', maxWidth:760, margin:'0 0 var(--s-4)'}}>
        Pearson correlation against other contracts over a 142-day window. Positive values move together;
        negative values diverge.
      </p>
      <div className="rd-corr" style={{padding:'var(--s-2) 0'}}>
        {RESEARCH_DATA.correlations.map(c => {
          const w = Math.abs(c.r);
          const pos = c.r >= 0;
          return (
            <div key={c.sym} className="rd-corr__row" style={{padding:'12px 0'}}>
              <span className="rd-corr__label">
                <span className="t-body-sm" style={{fontWeight:600}}>{c.sym}</span>
                <span className="t-label" style={{color:'var(--ink-3)'}}>{c.label}</span>
              </span>
              <span className="rd-corr__bar">
                <span className="rd-corr__bar-mid" />
                <span className={`rd-corr__bar-fill ${pos ? 'rd-corr__bar-fill--pos' : 'rd-corr__bar-fill--neg'}`}
                      style={{width: w * 50 + '%', [pos ? 'left' : 'right']: '50%'}} />
              </span>
              <span className={`rd-corr__r ${pos ? 'rd-num--pos' : 'rd-num--neg'}`}>{c.r >= 0 ? '+' : ''}{c.r.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// TAB: Notes
// ============================================================
function TabNotes({ sym }) {
  const seed = [
    { id:1, dt:'2026-05-26 14:22', text:'Polymarket whale built +$1.8M long over 48h on TX-GOV-26 — Edge model flagged as low-confidence (single liquidity provider).' },
    { id:2, dt:'2026-05-25 09:11', text:'Quinnipiac Texas poll shows GOP +9, vs market implying +18. Watching for revert by next poll cycle.' },
    { id:3, dt:'2026-05-23 17:48', text:'Historical analogues (2014, 2018, 2022) all underpriced GOP at T-180 by 19-28pp. Treat market as upper bound on Dem probability.' },
  ];
  const [notes, setNotes] = rState(seed);
  const [draft, setDraft] = rState('');
  function pin() {
    if (!draft.trim()) return;
    setNotes([{ id: Date.now(), dt: new Date().toISOString().replace('T',' ').slice(0,16), text: draft }, ...notes]);
    setDraft('');
  }
  return (
    <div className="rd2-pane">
      <div className="rd2-notes-editor">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Pin a hypothesis, observation, or contradicting data point…"
          rows={3}
        />
        <button className="rd-pin-btn" onClick={pin} disabled={!draft.trim()}>Pin note</button>
      </div>
      <div className="rd2-notes-list">
        {notes.map(n => (
          <article key={n.id} className="rd-note" style={{padding:'var(--s-3) 0'}}>
            <div className="rd-note__dt t-label">{n.dt}</div>
            <div className="rd-note__text t-body">{n.text}</div>
          </article>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Contract picker (compact)
// ============================================================
function ContractPicker({ value, onChange }) {
  const [open, setOpen] = rState(false);
  const sel = RESEARCH_DATA.universe.find(u => u.sym === value);
  return (
    <div className={`rd2-picker ${open ? 'is-open' : ''}`}>
      <button className="rd2-picker__btn" onClick={() => setOpen(!open)}>
        <span className="t-label" style={{color:'var(--ink-3)'}}>VIEWING</span>
        <span className="rd2-picker__cur">{sel.sym}<span style={{opacity:.5,margin:'0 6px'}}>·</span>{sel.short}</span>
        <span className="rd2-picker__caret">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="rd2-picker__menu">
          {RESEARCH_DATA.universe.map(u => {
            const edge = u.fair - u.mkt;
            const cls = edge > 0.005 ? 'pos' : edge < -0.005 ? 'neg' : 'flat';
            return (
              <button key={u.sym}
                className={`rd2-picker__item ${u.sym === value ? 'is-active' : ''}`}
                onClick={() => { onChange(u.sym); setOpen(false); }}>
                <span style={{minWidth:0}}>
                  <span className="rd2-picker__sym">{u.sym}</span>
                  <span className="rd2-picker__desc">{u.short} · {u.desc}</span>
                </span>
                <span className={`rd2-picker__edge rd2-picker__edge--${cls}`}>{rFmt.pp(edge)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// View shell — focused single-topic with dimension switches
// ============================================================
function ProView({ brand }) {
  const [sym, setSym]   = rState('TX-GOV-26');
  const [tab, setTab]   = rState('price');
  const [range, setRange] = rState('30D');
  const contract = RESEARCH_DATA.universe.find(u => u.sym === sym);

  // Reset to price tab when switching contracts
  rEffect(() => { setTab('price'); }, [sym]);

  return (
    <div className="rd2-view">
      <CropFrame>
        <div className="rd2-topbar">
          <span className="t-eyebrow">RESEARCH DESK · {contract.category.toUpperCase()}</span>
          <div className="rd2-topbar__right">
            <div className="rd-range">
              {['7D','30D','90D','1Y','ALL'].map(r => (
                <button key={r} className={`rd-range__btn ${r === range ? 'is-active' : ''}`} onClick={() => setRange(r)}>{r}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="rd2-header">
          <div className="rd2-header__title">
            <h1 className={brand === 'caps' ? 't-display-caps' : 't-display'}>{contract.short}</h1>
            <p className="t-body" style={{marginTop:'var(--s-2)', fontSize:16, color:'var(--ink-2)'}}>
              {contract.desc}
            </p>
          </div>
          <ContractPicker value={sym} onChange={setSym} />
        </div>

        <Hero contract={contract} />

        <div className="rd2-dim">
          <TabBar active={tab} onChange={setTab} />
          <span className="t-label rd2-dim__hint">{TABS.find(t => t.id === tab).hint}</span>
        </div>

        <div className="rd2-content">
          {tab === 'price'     && <TabPrice />}
          {tab === 'analogues' && <TabAnalogues />}
          {tab === 'calib'     && <TabCalibration />}
          {tab === 'venues'    && <TabVenues />}
          {tab === 'correl'    && <TabCorrelations />}
          {tab === 'notes'     && <TabNotes sym={sym} />}
        </div>
      </CropFrame>
    </div>
  );
}

Object.assign(window, {
  ProView, TABS, TabBar, TabPrice, TabAnalogues, TabCalibration,
  TabVenues, TabCorrelations, TabNotes, ContractPicker, Hero,
  rFmt, brierFill,
});
