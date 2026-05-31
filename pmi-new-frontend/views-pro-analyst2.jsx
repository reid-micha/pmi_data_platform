/* Option A — part 2 — PMI-model edition.
   Conditional-impact panel replaces Correlations.
   ContractPickerPMI pulls from PMI_MODEL.contracts.
   ProViewAnalyst shell stitches everything together. */

// ============================================================
// ContractPickerPMI — uses PMI_MODEL
// ============================================================
function ContractPickerPMI({ value, onChange }) {
  const [open, setOpen] = React.useState(false);
  const M = window.PMI_MODEL;
  const sel = M.bySym[value];
  if (!sel) return null;
  return (
    <div className={`rd2-picker ${open ? 'is-open' : ''}`}>
      <button className="rd2-picker__btn" onClick={() => setOpen(!open)}>
        <span className="t-label" style={{color:'var(--ink-3)'}}>VIEWING</span>
        <span className="rd2-picker__cur">{sel.sym}<span style={{opacity:.5,margin:'0 6px'}}>·</span>{(sel.yes*100).toFixed(0)}% Yes</span>
        <span className="rd2-picker__caret">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="rd2-picker__menu">
          {M.contracts.map(u => (
            <button key={u.sym}
              className={`rd2-picker__item ${u.sym === value ? 'is-active' : ''}`}
              onClick={() => { onChange(u.sym); setOpen(false); }}>
              <span style={{minWidth:0}}>
                <span className="rd2-picker__sym">{u.sym} · {u.w}% PMI</span>
                <span className="rd2-picker__desc">{u.q}</span>
              </span>
              <span className="rd2-picker__edge rd2-picker__edge--yes">
                {(u.yes * 100).toFixed(0)}% Yes
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// CondImpactPane — replaces Correlations
// Shows: (1) outward — when THIS resolves Yes, how it shifts every other component
//        (2) inward  — when other components resolve Yes, how they shift THIS
// ============================================================
function CondImpactPane({ sym, density }) {
  const M = window.PMI_MODEL;
  const out = M.influenceesOf(sym);
  const inn = M.influencersOf(sym);
  const maxAbs = Math.max(0.01, ...out.map(x => Math.abs(x.delta)), ...inn.map(x => Math.abs(x.delta)));

  function Row({ kind, sym: s, delta, pYes, target }) {
    const tgt = M.bySym[target || s];
    const wShare = tgt ? tgt.w / M.W : 0;
    const expected = delta * pYes;          // expected P-shift on this row's target
    const pos = delta >= 0;
    return (
      <div className="rd-cond__row">
        <span className="rd-cond__sym">
          <span className="t-body-sm" style={{fontWeight:600}}>{s}</span>
          <span className="t-label" style={{color:'var(--ink-3)'}}>
            {tgt ? tgt.q : ''}
          </span>
        </span>
        <span className="rd-cond__bar">
          <span className="rd-cond__bar-mid" />
          <span className={`rd-cond__bar-fill ${pos ? 'rd-cond__bar-fill--pos' : 'rd-cond__bar-fill--neg'}`}
                style={{width: (Math.abs(delta) / maxAbs * 50) + '%', [pos ? 'left' : 'right']: '50%'}} />
        </span>
        <span className={`rd-cond__delta ${pos ? 'rd-num--pos' : 'rd-num--neg'}`}>
          {pos ? '+' : ''}{(delta * 100).toFixed(1)}pp
        </span>
        {density === 'analyst' && (
          <span className="rd-cond__meta">
            <span style={{color:'var(--ink-3)'}}>P(trigger=Yes)</span> {(pYes * 100).toFixed(0)}%
          </span>
        )}
        {density === 'analyst' && (
          <span className="rd-cond__meta">
            <span style={{color:'var(--ink-3)'}}>PMI weight</span> {tgt ? tgt.w : 0}%
          </span>
        )}
        {density === 'analyst' && (
          <span className={`rd-cond__exp ${expected >= 0 ? 'rd-num--pos' : 'rd-num--neg'}`}>
            {expected >= 0 ? '+' : ''}{(expected * wShare * 100).toFixed(2)}pp
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="rd2-pane">
      <p className="t-body" style={{color:'var(--ink-2)', maxWidth:840, margin:'0 0 var(--s-3)'}}>
        How <strong>{sym}</strong> connects to the rest of the PMI. <strong>Outward</strong>: if{' '}
        <strong>{sym}</strong> resolves Yes, every other component's Yes-probability shifts by Δpp.
        {density === 'analyst' && ' Expected contribution = Δ × P(trigger=Yes) × weight share — the PMI-score swing already priced in.'}
      </p>

      <div className="rd-cond__group">
        <div className="rd-cond__h">
          <span className="t-eyebrow">OUTWARD · {sym} → others</span>
          <span className="t-label" style={{color:'var(--ink-3)'}}>{out.length} links</span>
        </div>
        {density === 'analyst' && (
          <div className="rd-cond__row rd-cond__row--head">
            <span className="t-label">TARGET CONTRACT</span>
            <span className="t-label">SHIFT</span>
            <span className="t-label" style={{textAlign:'right'}}>Δ</span>
            <span className="t-label">P(yes)</span>
            <span className="t-label">w</span>
            <span className="t-label" style={{textAlign:'right'}}>EXP. PMI Δ</span>
          </div>
        )}
        {out.length === 0
          ? <div className="rd-cond__empty">No outward links recorded for this contract.</div>
          : out.map(x => <Row key={x.to} kind="out" sym={x.to} delta={x.delta} pYes={M.bySym[sym].yes} target={x.to} />)
        }
      </div>

      <div className="rd-cond__group">
        <div className="rd-cond__h">
          <span className="t-eyebrow">INWARD · others → {sym}</span>
          <span className="t-label" style={{color:'var(--ink-3)'}}>{inn.length} links</span>
        </div>
        {density === 'analyst' && (
          <div className="rd-cond__row rd-cond__row--head">
            <span className="t-label">TRIGGER CONTRACT</span>
            <span className="t-label">SHIFT TO {sym}</span>
            <span className="t-label" style={{textAlign:'right'}}>Δ</span>
            <span className="t-label">P(yes)</span>
            <span className="t-label">w</span>
            <span className="t-label" style={{textAlign:'right'}}>EXP. Δ ON {sym}</span>
          </div>
        )}
        {inn.length === 0
          ? <div className="rd-cond__empty">No inward links recorded for this contract.</div>
          : inn.map(x => <Row key={x.from} kind="in" sym={x.from} delta={x.delta} pYes={x.pYes} target={sym} />)
        }
      </div>
    </div>
  );
}

// ============================================================
// CalibDense — keep Brier-by-venue but headline reframed
// ============================================================
function CalibDense({ density }) {
  const { calCategories: cats, calExchanges: exs, calibration: m } = window.RESEARCH_DATA;
  const rel = window.ANALYST_DATA.reliability;
  return (
    <div className="rd2-pane">
      <p className="t-body" style={{color:'var(--ink-2)', maxWidth:820, margin:'0 0 var(--s-3)'}}>
        Brier score by venue × category — lower = better. The aggregate score across all components feeds
        Micah's confidence weight when blending Yes-probabilities into the PMI.
      </p>
      <div className="rd-cal-grid">
        <div className="rd-heatmap">
          <div className="rd-heatmap__row rd-heatmap__row--head">
            <span></span>
            {cats.map(c => <span key={c} className="rd-heatmap__hcell t-label">{c}</span>)}
            {density === 'analyst' && <span className="rd-heatmap__hcell t-label">n</span>}
            {density === 'analyst' && <span className="rd-heatmap__hcell t-label">LogLoss</span>}
          </div>
          {exs.map((e, ei) => (
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
              {density === 'analyst' && <span className="rd-heatmap__cell rd-heatmap__cell--num">{Math.round(180 + ei * 41 + Math.sin(ei) * 30)}</span>}
              {density === 'analyst' && <span className="rd-heatmap__cell rd-heatmap__cell--num">{(0.31 + Math.cos(ei) * 0.05).toFixed(2)}</span>}
            </div>
          ))}
        </div>
        {density === 'analyst' && (
          <div className="rd-reliability">
            <div className="t-label" style={{marginBottom:8}}>RELIABILITY DIAGRAM · ALL POLITICS</div>
            <svg viewBox="0 0 320 320" className="rd-reliability__svg">
              <line x1={20} y1={300} x2={300} y2={20} stroke="#11192C" strokeDasharray="4 3" opacity=".4" />
              {[0, 0.25, 0.5, 0.75, 1].map(t => (
                <g key={t}>
                  <line x1={20 + t * 280} x2={20 + t * 280} y1={20} y2={300} stroke="#E1DCD0" />
                  <line x1={20} x2={300} y1={300 - t * 280} y2={300 - t * 280} stroke="#E1DCD0" />
                </g>
              ))}
              {rel.map((p, i) => (
                <circle key={i} cx={20 + p.bin * 280} cy={300 - p.observed * 280}
                        r={Math.sqrt(p.n) * 0.6} fill="#1A3FA8" fillOpacity=".5" stroke="#1A3FA8" strokeWidth="1.2" />
              ))}
              <text x={160} y={316} fontSize="10" fill="#6B7180" textAnchor="middle" fontFamily="Inter">predicted P(Yes)</text>
              <text x={8} y={160} fontSize="10" fill="#6B7180" textAnchor="middle" fontFamily="Inter" transform="rotate(-90 8 160)">observed frequency</text>
            </svg>
            <p className="t-body-sm" style={{color:'var(--ink-3)', marginTop:8}}>
              Bubble = n contracts in bin. Diagonal = perfect calibration.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// VenuesDense — same decomposition, now Yes-side prices
// ============================================================
function VenuesDense({ sym, density }) {
  const c = window.PMI_MODEL.bySym[sym];
  const base = c.yes;
  const rows = [
    { exc: 'polymarket', price: base + 0.003, weight: 38, vol: '$4.2M', confidence: 'high' },
    { exc: 'kalshi',     price: base - 0.001, weight: 26, vol: '$2.8M', confidence: 'high' },
    { exc: 'robinhood',  price: base + 0.001, weight: 14, vol: '$870K', confidence: 'med'  },
    { exc: 'manifold',   price: base - 0.005, weight:  9, vol: '$220K', confidence: 'low'  },
    { exc: 'metaculus',  price: base + 0.007, weight:  8, vol: '$110K', confidence: 'med'  },
    { exc: 'predictit',  price: base - 0.008, weight:  5, vol:  '$95K', confidence: 'low'  },
  ];
  const weighted = rows.reduce((s, r) => s + r.price * r.weight, 0) / 100;
  const depth = window.ANALYST_DATA.depth;
  const slipMax = Math.max(...depth.flatMap(d => d.curve));
  const sizes = [0, 5, 10, 25, 50, 100, 250];
  return (
    <div className="rd2-pane">
      <div className="rd2-venues-grid">
        <div>
          <h4 className="t-h3" style={{margin:'0 0 var(--s-3)', fontSize:18}}>Yes-side venue decomposition</h4>
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
                <span className="rd-decomp__price">{(r.price * 100).toFixed(1)}¢</span>
              </div>
            ))}
          </div>
          <div className="rd2-venues__foot">
            <span className="t-label">Weighted Yes composite</span>
            <span className="rd2-venues__total">{(weighted * 100).toFixed(2)}¢</span>
          </div>
        </div>
        <div>
          <h4 className="t-h3" style={{margin:'0 0 var(--s-3)', fontSize:18}}>
            {density === 'analyst' ? 'Slippage on Yes-side' : 'Cross-venue board · Yes side'}
          </h4>
          {density === 'analyst' ? (
            <div className="rd-slip">
              <svg viewBox="0 0 540 320" className="rd-slip__svg">
                {[0, 0.25, 0.5, 0.75, 1].map(t => (
                  <g key={t}>
                    <line x1={60} x2={520} y1={20 + t * 260} y2={20 + t * 260} stroke="#E1DCD0" />
                    <text x={54} y={24 + t * 260} fontSize="10" textAnchor="end" fill="#6B7180" fontFamily="Inter">
                      {Math.round(slipMax * (1 - t))}bp
                    </text>
                  </g>
                ))}
                {sizes.map((s, i) => (
                  <text key={s} x={60 + (i / (sizes.length - 1)) * 460} y={296}
                        fontSize="10" textAnchor="middle" fill="#6B7180" fontFamily="Inter">${s}k</text>
                ))}
                {depth.map((d, di) => {
                  const colors = ['#11192C', '#1A3FA8', '#6B7180', '#8B1E2D'];
                  const path = 'M ' + d.curve.map((v, i) =>
                    (60 + (i / (sizes.length - 1)) * 460) + ',' + (20 + (1 - v / slipMax) * 260)
                  ).join(' L ');
                  return (
                    <g key={d.exc}>
                      <path d={path} fill="none" stroke={colors[di]} strokeWidth="2" />
                      <text x={524} y={20 + (1 - d.curve[d.curve.length - 1] / slipMax) * 260 + 4}
                            fontSize="10" fill={colors[di]} fontFamily="Inter" fontWeight="600">
                        {window.MICAH.exchanges[d.exc].name}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          ) : (
            <div className="rd-table">
              <div className="rd-table__row rd-table__row--head rd-table__row--venues">
                <span>Venue</span><span>Bid</span><span>Ask</span><span>Last</span><span>Vol 24h</span><span>Conf.</span>
              </div>
              {rows.map(r => (
                <div key={r.exc} className="rd-table__row rd-table__row--venues">
                  <span className="rd-venue__name">
                    <ExchangeChip id={r.exc} size={20} />
                    <span>{window.MICAH.exchanges[r.exc].name}</span>
                  </span>
                  <span className="rd-table__num">{((r.price - 0.002) * 100).toFixed(1)}¢</span>
                  <span className="rd-table__num">{((r.price + 0.002) * 100).toFixed(1)}¢</span>
                  <span className="rd-table__num">{(r.price * 100).toFixed(1)}¢</span>
                  <span className="rd-table__num rd-table__num--muted">{r.vol}</span>
                  <span><Tag tone={r.confidence === 'high' ? 'direct' : 'neutral'}>{r.confidence}</Tag></span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Tabs — same identifiers but Correlations replaced by Cond. impact
// ============================================================
const TABS_PMI = [
  { id: 'price',     label: 'Yes/No history',  hint: '60-day Yes/No probability with Micah Fair' },
  { id: 'analogues', label: 'Analogues',       hint: 'Prior cycles where this Yes/No question resolved' },
  { id: 'calib',     label: 'Calibration',     hint: 'Brier by venue × category' },
  { id: 'venues',    label: 'Venue decomp',    hint: 'Where the Yes-price comes from' },
  { id: 'cond',      label: 'Conditional impact', hint: 'How resolving Yes/No shifts other PMI components' },
  { id: 'notes',     label: 'Notes',           hint: 'Hypothesis log for this contract' },
];

function TabBarPMI({ active, onChange }) {
  return (
    <div className="rd2-tabs" role="tablist">
      {TABS_PMI.map(t => (
        <button key={t.id} role="tab" aria-selected={t.id === active}
          className={`rd2-tab ${t.id === active ? 'is-active' : ''}`}
          onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// ProViewAnalyst shell
// ============================================================
function ProViewAnalyst({ brand }) {
  const [sym, setSym]   = React.useState('TX-GOV-26');
  const [tab, setTab]   = React.useState('price');
  const [range, setRange] = React.useState('30D');
  const [density, setDensity] = React.useState('analyst');
  const c = window.PMI_MODEL.bySym[sym];
  if (!c) return null;

  React.useEffect(() => { setTab('price'); }, [sym]);

  return (
    <div className={`rd2-view rd2-view--${density}`}>
      <CropFrame>
        <div className="rd2-topbar">
          <span className="t-eyebrow">RESEARCH DESK · {c.cat.toUpperCase()} · ANALYST MODE · {window.PMI_MODEL.pmiName.toUpperCase()}</span>
          <div className="rd2-topbar__right">
            <div className="rd-density">
              <span className="t-label" style={{color:'var(--ink-3)', marginRight:8}}>DENSITY</span>
              {['editorial','analyst'].map(d => (
                <button key={d}
                  className={`rd-density__btn ${density === d ? 'is-active' : ''}`}
                  onClick={() => setDensity(d)}>{d}</button>
              ))}
            </div>
            <div className="rd-range">
              {['7D','30D','90D','1Y','ALL'].map(r => (
                <button key={r} className={`rd-range__btn ${r === range ? 'is-active' : ''}`} onClick={() => setRange(r)}>{r}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="rd2-header">
          <div className="rd2-header__title">
            <h1 className={brand === 'caps' ? 't-display-caps' : 't-display'} style={{fontSize:'clamp(28px, 3vw, 44px)'}}>{c.q}</h1>
            <p className="t-body" style={{marginTop:'var(--s-2)', fontSize:14, color:'var(--ink-3)', letterSpacing:'.04em'}}>
              {c.sym} · WEIGHT {c.w}% IN {window.PMI_MODEL.pmiName.toUpperCase()} · COMPOSITE SCORE {window.PMI_MODEL.pmiScore.toFixed(1)}
            </p>
          </div>
          <ContractPickerPMI value={sym} onChange={setSym} />
        </div>

        <HeroPMI sym={sym} density={density} />

        <div className="rd2-dim">
          <TabBarPMI active={tab} onChange={setTab} />
          <span className="t-label rd2-dim__hint">{TABS_PMI.find(t => t.id === tab).hint}</span>
        </div>

        <div className="rd2-content">
          {tab === 'price'     && <div className="rd2-pane"><PriceDense sym={sym} density={density} /></div>}
          {tab === 'analogues' && <AnaloguesDense sym={sym} density={density} />}
          {tab === 'calib'     && <CalibDense density={density} />}
          {tab === 'venues'    && <VenuesDense sym={sym} density={density} />}
          {tab === 'cond'      && <CondImpactPane sym={sym} density={density} />}
          {tab === 'notes'     && <TabNotes sym={sym} />}
        </div>
      </CropFrame>
    </div>
  );
}

Object.assign(window, { ProViewAnalyst, ContractPickerPMI, CondImpactPane, CalibDense, VenuesDense, TABS_PMI, TabBarPMI });
