/* Option A — Research Desk · ANALYST DENSITY MODE
   Refactored for the PMI model: every contract is Yes/No.
   Hero shows P(Yes), P(No), weight in PMI, and resolution swing on PMI score. */

const { useState: aaState, useEffect: aaEffect, useMemo: aaMemo } = React;

// ============================================================
// Extra analyst data — time series, supplementary stats
// ============================================================
const ANALYST_DATA = (() => {
  // Volume time series (60d)
  const volume = Array.from({length: 60}, (_, i) =>
    Math.round(1.4e6 + Math.sin(i * 0.6) * 4e5 + Math.cos(i * 1.7) * 2.5e5 + (i > 47 ? 9e5 : 0))
  );
  // Spread (bid/ask) basis points
  const spreadBp = Array.from({length: 60}, (_, i) =>
    14 + Math.sin(i * 0.3) * 5 + Math.cos(i * 0.8) * 3
  );

  // Yes-side price (60d) for each contract, seeded by current yes prob.
  function yesSeries(sym, base) {
    const seed = sym.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
    return Array.from({length: 60}, (_, i) => {
      const v = base + Math.sin((seed + i) * 0.4) * 0.035 + Math.cos((seed + i) * 1.1) * 0.012 + (i / 60) * 0.015;
      return Math.max(0.04, Math.min(0.96, v));
    });
  }
  // Micah Fair (small drift away from market)
  function fairSeries(sym, base) {
    const seed = sym.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
    return Array.from({length: 60}, (_, i) => {
      const v = base + 0.015 + Math.sin((seed + i) * 0.35) * 0.02;
      return Math.max(0.04, Math.min(0.96, v));
    });
  }
  // Polls CI half-width
  const pollsCi = Array.from({length: 60}, (_, i) =>
    0.022 + Math.abs(Math.sin(i * 0.5)) * 0.014
  );

  // Analogous prior cycles for each contract (used by Analogues tab).
  // Stable, deterministic.
  function analoguesFor(sym) {
    const seed = sym.charCodeAt(0) + sym.charCodeAt(sym.length - 1);
    const labels = ['2022 cycle','2018 cycle','2014 cycle','2010 cycle','2006 cycle','2002 cycle','1998 cycle','1994 cycle'];
    return labels.map((l, i) => {
      const mktAt = 0.5 + Math.sin((seed + i) * 1.1) * 0.18;
      const resolvedYes = mktAt + 0.06 + Math.sin((seed + i) * 1.7) * 0.12;
      const error = resolvedYes - mktAt;
      return {
        label: l,
        mktAt: +mktAt.toFixed(3),
        resolved: resolvedYes > 0.5 ? 'Yes' : 'No',
        error: +error.toFixed(3),
        n: Math.round(140 + Math.cos(seed + i) * 90),
        brier: +(0.08 + Math.abs(Math.sin(seed + i)) * 0.06).toFixed(3),
      };
    });
  }

  // Reliability diagram for calibration
  const reliability = Array.from({length: 10}, (_, i) => {
    const bin = (i + 0.5) / 10;
    const observed = Math.max(0, Math.min(1, bin + (Math.sin(i * 1.3) * 0.06 - 0.03)));
    const n = Math.round(140 - Math.abs(i - 5) * 18 + Math.cos(i) * 8);
    return { bin, observed, n };
  });

  // Depth/slippage curve per venue
  const depth = [
    { exc: 'polymarket', curve: [0, 5, 12, 24, 42, 68, 105] },
    { exc: 'kalshi',     curve: [0, 7, 16, 31, 54, 88, 138] },
    { exc: 'robinhood',  curve: [0, 9, 22, 45, 80, 132, 210] },
    { exc: 'manifold',   curve: [0, 18, 48, 110, 220, 410, 720] },
  ];

  return { volume, spreadBp, pollsCi, yesSeries, fairSeries, analoguesFor, reliability, depth };
})();

// ============================================================
// HeroPMI — the canonical hero used by Analyst & Microstructure
// ============================================================
function HeroPMI({ sym, density = 'editorial' }) {
  const M = window.PMI_MODEL;
  const c = M.bySym[sym];
  if (!c) return null;
  const contrib = M.contribTo(sym);
  const tone = (v) => v > 0 ? 'pos' : v < 0 ? 'neg' : 'flat';

  const base = [
    { label: 'P(Yes)',           v: (c.yes * 100).toFixed(1) + '¢', sub: 'market implied', tone: 'yes' },
    { label: 'P(No)',            v: ((1 - c.yes) * 100).toFixed(1) + '¢', sub: 'complement', tone: 'no' },
    { label: 'Weight in PMI',    v: c.w + '%', sub: M.pmiName, tone: 'fair' },
    { label: 'Contribution',     v: (contrib.total * 100).toFixed(2) + 'pp', sub: `raw ${(contrib.raw*100).toFixed(2)} + cond ${contrib.cond >= 0 ? '+' : ''}${(contrib.cond*100).toFixed(2)}` },
  ];
  const extra = [
    { label: 'PMI swing · Yes',  v: '+' + (contrib.swingYes * 100).toFixed(2) + 'pp', sub: 'if resolves YES', tone: 'pos' },
    { label: 'PMI swing · No',   v: (contrib.swingNo * 100).toFixed(2) + 'pp', sub: 'if resolves NO', tone: 'neg' },
    { label: 'Volume 24h',       v: '$' + (c.vol / 1e6).toFixed(2) + 'M', sub: '+18% vs 7d avg' },
    { label: 'Open interest',    v: '$' + (c.vol * 1.7 / 1e6).toFixed(1) + 'M', sub: '12,840 contracts' },
    { label: 'Spread',           v: '14bp', sub: ((c.yes - 0.001) * 100).toFixed(1) + ' / ' + ((c.yes + 0.001) * 100).toFixed(1) },
    { label: 'Days to resolve',  v: '187', sub: 'Nov 04, 2026' },
    { label: 'Brier (lifetime)', v: c.brier.toFixed(3), sub: 'vs cat. 0.21' },
    { label: 'Influences',       v: M.influenceesOf(sym).length + ' / ' + M.influencersOf(sym).length, sub: 'out / in (conditional)' },
  ];
  const list = density === 'analyst' ? [...base, ...extra] : base;

  return (
    <div className={`rd2-hero rd2-hero--pmi rd2-hero--${density}`}>
      {list.map((cell, i) => (
        <div key={i} className={`rd2-hero__cell ${cell.tone ? 'rd2-hero__cell--' + cell.tone : ''}`}>
          <div className="t-label">{cell.label}</div>
          <div className="rd2-hero__v">{cell.v}</div>
          <div className="t-label" style={{color:'var(--ink-3)'}}>{cell.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Yes/No question banner — sits above the hero
// ============================================================
function QuestionBanner({ sym }) {
  const c = window.PMI_MODEL.bySym[sym];
  if (!c) return null;
  return (
    <div className="rd2-question">
      <div className="rd2-question__q">{c.q}</div>
      <div className="rd2-question__bar">
        <span className="rd2-question__bar-yes" style={{width: (c.yes * 100) + '%'}}>
          {(c.yes * 100).toFixed(0)}% YES
        </span>
        <span className="rd2-question__bar-no" style={{width: ((1 - c.yes) * 100) + '%'}}>
          {((1 - c.yes) * 100).toFixed(0)}% NO
        </span>
      </div>
    </div>
  );
}

// ============================================================
// PriceDense — Yes line + No (mirror) + Micah Fair + spread + volume
// ============================================================
function PriceDense({ sym, density }) {
  const c = window.PMI_MODEL.bySym[sym];
  const yes = ANALYST_DATA.yesSeries(sym, c.yes);
  const fair = ANALYST_DATA.fairSeries(sym, c.yes);
  const no = yes.map(v => 1 - v);

  const w = 980, h = 460;
  const pad = { l: 60, r: 78, t: 16, b: 130 };
  const innerH = h - pad.t - pad.b;
  const innerW = w - pad.l - pad.r;
  const xStep = innerW / (yes.length - 1);
  const px2y = v => pad.t + innerH - v * innerH;  // y axis is full 0..1
  const idx2x = i => pad.l + i * xStep;
  const line = (arr) => 'M ' + arr.map((v, i) => idx2x(i) + ',' + px2y(v)).join(' L ');

  const { volume, spreadBp } = ANALYST_DATA;
  const maxVol = Math.max(...volume);
  const volH = 80;
  const volTop = h - pad.b + 14;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="rd2-svg">
      {/* Yes / No mid line at 50% */}
      <line x1={pad.l} x2={w - pad.r} y1={px2y(0.5)} y2={px2y(0.5)} stroke="#C9C3B5" strokeWidth="1" strokeDasharray="4 4" />
      <text x={pad.l - 10} y={px2y(0.5) + 3} fontSize="10" textAnchor="end" fill="#6B7180" fontFamily="Inter">50%</text>

      {/* gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <g key={t}>
          <line x1={pad.l} x2={w - pad.r} y1={pad.t + t * innerH} y2={pad.t + t * innerH}
                stroke="#E1DCD0" strokeWidth="1" />
          <text x={pad.l - 10} y={pad.t + t * innerH + 3} fontSize="11" textAnchor="end" fill="#6B7180" fontFamily="Inter">
            {((1 - t) * 100).toFixed(0)}¢
          </text>
        </g>
      ))}

      {/* spread band around Yes */}
      {density === 'analyst' && (
        <path d={'M ' + yes.map((v, i) => idx2x(i) + ',' + px2y(v + spreadBp[i] / 10000)).join(' L ')
              + ' L ' + [...yes].reverse().map((v, i) =>
                  idx2x(yes.length - 1 - i) + ',' + px2y(v - spreadBp[yes.length - 1 - i] / 10000)
                ).join(' L ') + ' Z'}
              fill="rgba(17,25,44,.10)" />
      )}

      {/* Micah fair (yes prob, model-adjusted) */}
      <path d={line(fair)} fill="none" stroke="#1A3FA8" strokeWidth="1.8" strokeDasharray="6 3" />

      {/* No (mirror) line */}
      <path d={line(no)} fill="none" stroke="#8B1E2D" strokeWidth="2.4" />
      {/* Yes line */}
      <path d={line(yes)} fill="none" stroke="#1A3FA8" strokeWidth="2.4" />

      {/* End labels */}
      {[
        { v: yes.at(-1),  c: '#1A3FA8', l: 'Yes' },
        { v: no.at(-1),   c: '#8B1E2D', l: 'No' },
        { v: fair.at(-1), c: '#1A3FA8', l: 'Fair', dash: true },
      ].map((p, i) => (
        <g key={i}>
          <rect x={w - pad.r + 6} y={px2y(p.v) - 10} width={pad.r - 12} height={20} fill={p.dash ? '#FBFAF6' : p.c} stroke={p.c} rx="3" />
          <text x={w - pad.r + 13} y={px2y(p.v) + 4} fontSize="11" fontWeight="700" fill={p.dash ? p.c : '#FBFAF6'} fontFamily="Inter">
            {p.l} {(p.v * 100).toFixed(1)}¢
          </text>
        </g>
      ))}

      {/* volume bars (analyst only) */}
      {density === 'analyst' && volume.map((v, i) => {
        const bh = (v / maxVol) * volH;
        const x = idx2x(i) - xStep * 0.36;
        return <rect key={i} x={x} y={volTop + (volH - bh)} width={xStep * 0.72} height={bh} fill="#11192C" opacity=".25" />;
      })}
      {density === 'analyst' && (
        <text x={pad.l - 10} y={volTop + 12} fontSize="10" textAnchor="end" fill="#6B7180" fontFamily="Inter">VOL 24h</text>
      )}

      {[0, 15, 30, 45, 59].map(i => (
        <text key={i} x={idx2x(i)} y={h - 12} fontSize="11" fill="#6B7180" textAnchor="middle" fontFamily="Inter">
          T-{60 - i}d
        </text>
      ))}
    </svg>
  );
}

// ============================================================
// AnaloguesDense — reframed: prior cycles where this same Yes/No question resolved
// ============================================================
function AnaloguesDense({ sym, density }) {
  const all = ANALYST_DATA.analoguesFor(sym);
  const rows = density === 'analyst' ? all : all.slice(0, 4);
  const errors = all.map(a => a.error);
  const mean = errors.reduce((s, v) => s + v, 0) / errors.length;
  const std = Math.sqrt(errors.reduce((s, v) => s + (v - mean) ** 2, 0) / errors.length);
  const maxErr = Math.max(...rows.map(a => Math.abs(a.error)), 0.001);
  const yesCount = all.filter(a => a.resolved === 'Yes').length;

  // density histogram
  const bins = 10;
  const lo = -0.4, hi = 0.4;
  const hist = Array(bins).fill(0);
  all.forEach(a => { const i = Math.min(bins - 1, Math.max(0, Math.floor((a.error - lo) / (hi - lo) * bins))); hist[i]++; });
  const maxH = Math.max(...hist, 1);

  return (
    <div className="rd2-pane">
      <div className="rd-summary-row">
        <div><span className="t-label">Analogues</span><strong>{all.length}</strong></div>
        <div><span className="t-label">Resolved Yes</span><strong>{yesCount} / {all.length}</strong></div>
        <div><span className="t-label">Mean error</span><strong>{mean >= 0 ? '+' : ''}{(mean * 100).toFixed(1)}pp</strong></div>
        <div><span className="t-label">Std dev</span><strong>{(std * 100).toFixed(1)}pp</strong></div>
        <div><span className="t-label">Inference</span><strong>{mean > 0.05 ? 'Yes-side underpriced' : mean < -0.05 ? 'Yes-side overpriced' : 'Calibrated'}</strong></div>
      </div>

      {density === 'analyst' && (
        <div className="rd-dist">
          <div className="t-label" style={{marginBottom:8}}>ERROR DISTRIBUTION · {all.length} ANALOGUES</div>
          <svg viewBox="0 0 800 120" preserveAspectRatio="none" className="rd-dist__svg">
            {hist.map((cnt, i) => {
              const x = (i / bins) * 800;
              const bw = 800 / bins - 4;
              const bh = (cnt / maxH) * 90;
              return <rect key={i} x={x + 2} y={100 - bh} width={bw} height={bh} fill="#1A3FA8" opacity=".55" />;
            })}
            <line x1={((0 - lo) / (hi - lo)) * 800} x2={((0 - lo) / (hi - lo)) * 800} y1={6} y2={108} stroke="#11192C" strokeDasharray="3 3" />
            <text x={((0 - lo) / (hi - lo)) * 800 + 6} y={18} fontSize="10" fill="#11192C" fontFamily="Inter">zero error</text>
            <line x1={((mean - lo) / (hi - lo)) * 800} x2={((mean - lo) / (hi - lo)) * 800} y1={6} y2={108} stroke="#8B1E2D" strokeWidth="2" />
            <text x={((mean - lo) / (hi - lo)) * 800 + 6} y={32} fontSize="10" fill="#8B1E2D" fontWeight="700" fontFamily="Inter">
              μ {mean >= 0 ? '+' : ''}{(mean*100).toFixed(0)}pp
            </text>
            {[-0.4, -0.2, 0, 0.2, 0.4].map(v => (
              <text key={v} x={((v - lo) / (hi - lo)) * 800} y={117} fontSize="9" fill="#6B7180" textAnchor="middle" fontFamily="Inter">
                {v >= 0 ? '+' : ''}{(v * 100).toFixed(0)}pp
              </text>
            ))}
          </svg>
        </div>
      )}

      <div className="rd-table rd-table--dense">
        <div className="rd-table__row rd-table__row--head rd-table__row--analog">
          <span>Cycle</span><span>Market @ T-180</span><span>Resolved</span><span>Error</span>
          {density === 'analyst' && <span>n</span>}
          {density === 'analyst' && <span>Brier</span>}
          <span>Distribution</span>
        </div>
        {rows.map((a, i) => (
          <div key={a.label + i} className="rd-table__row rd-table__row--analog">
            <span className="rd-analogue__label">
              <strong>{a.label}</strong>
              <span className="t-body-sm" style={{color:'var(--ink-3)'}}>{window.PMI_MODEL.bySym[sym].q.slice(0, 38)}…</span>
            </span>
            <span className="rd-table__num">{(a.mktAt * 100).toFixed(1)}¢</span>
            <span className="rd-resolved">
              <span className="rd-resolved__dot" style={{background: a.resolved === 'Yes' ? 'var(--blue-strong)' : 'var(--red-strong)'}} />
              {a.resolved} · 100¢
            </span>
            <span className={`rd-table__num ${a.error >= 0 ? 'rd-num--pos' : 'rd-num--neg'}`}>
              {a.error >= 0 ? '+' : ''}{(a.error * 100).toFixed(1)}pp
            </span>
            {density === 'analyst' && <span className="rd-table__num rd-table__num--muted">{a.n}</span>}
            {density === 'analyst' && <span className="rd-table__num">{a.brier.toFixed(3)}</span>}
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

Object.assign(window, { ANALYST_DATA, HeroPMI, QuestionBanner, PriceDense, AnaloguesDense });
