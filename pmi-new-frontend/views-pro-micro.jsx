/* Option B — Research Desk · PMI SIMULATOR
   Drag any contract's P(Yes) and watch the PMI score recompute,
   with the conditional cascade propagating through dependent components. */

const { useState: sState, useMemo: sMemo } = React;

// ============================================================
// Scenario math
// ============================================================

/* Effective weight ε_i = (w_i + Σ_j w_j × cond[i][j]) / W.
   When P(yesᵢ) shifts by Δp, PMI score shifts by ε_i × Δp. */
function effectiveWeights() {
  const M = window.PMI_MODEL;
  const out = {};
  for (const c of M.contracts) {
    let extra = 0;
    const links = M.cond[c.sym] || {};
    for (const [j, d] of Object.entries(links)) {
      const wj = M.bySym[j]?.w || 0;
      extra += wj * d;
    }
    out[c.sym] = (c.w + extra) / M.W;
  }
  return out;
}

function pmiFromBeliefs(beliefs) {
  const M = window.PMI_MODEL;
  // PMI = Σ_i (w_i/W) × p_i + Σ_i Σ_j (w_j/W) × p_i × cond[i][j]
  let naive = 0;
  let condAdj = 0;
  for (const c of M.contracts) {
    const p = beliefs[c.sym];
    naive += (c.w / M.W) * p;
    const links = M.cond[c.sym] || {};
    for (const [j, d] of Object.entries(links)) {
      const wj = M.bySym[j]?.w || 0;
      condAdj += (wj / M.W) * p * d;
    }
  }
  return { naive, condAdj, total: naive + condAdj };
}

/* Linearised cascade — induced P(j) given user's beliefs about everyone else.
   induced_j = belief_j + Σ_{a≠j} (belief_a - base_a) × cond[a][j]. */
function inducedProb(sym, beliefs) {
  const M = window.PMI_MODEL;
  const base = M.bySym[sym].yes;
  let bump = 0;
  for (const [a, links] of Object.entries(M.cond)) {
    if (a === sym) continue;
    const d = links[sym];
    if (d === undefined) continue;
    bump += d * ((beliefs[a] ?? M.bySym[a].yes) - M.bySym[a].yes);
  }
  return Math.max(0, Math.min(1, (beliefs[sym] ?? base) + bump));
}

// ============================================================
// PMI Simulator
// ============================================================
function TabSimulator() {
  const M = window.PMI_MODEL;
  const base = sMemo(() => Object.fromEntries(M.contracts.map(c => [c.sym, c.yes])), []);
  const [beliefs, setBeliefs] = sState(base);
  const [activePreset, setActivePreset] = sState('reset');

  const eff = sMemo(effectiveWeights, []);
  const basePMI = sMemo(() => pmiFromBeliefs(base), [base]);
  const scenPMI = sMemo(() => pmiFromBeliefs(beliefs), [beliefs]);
  const deltaPMI = scenPMI.total - basePMI.total;

  // Sort contracts by absolute deviation for the diff chart
  const sortedDiff = M.contracts
    .map(c => {
      const p = beliefs[c.sym];
      const dp = p - c.yes;
      return { sym: c.sym, q: c.q, w: c.w, base: c.yes, p, dp, contrib: dp * eff[c.sym] };
    })
    .sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib));

  function setOne(sym, val) {
    setBeliefs({ ...beliefs, [sym]: val });
    setActivePreset('custom');
  }
  function applyPreset(name) {
    setActivePreset(name);
    const next = { ...base };
    if (name === 'reset') {
      // no change
    } else if (name === 'gop-sweep') {
      next['TX-GOV-26']  = 0.95;
      next['FL-GOV-26']  = 0.95;
      next['GOP-HOUSE']  = 0.93;
      next['MAGA-EO']    = 0.88;
      next['MI-GOV-26']  = 0.20;
    } else if (name === 'recession') {
      next['REC-Q4-26']  = 0.85;
      next['FED-50-OCT'] = 0.78;
      next['BTC-100K']   = 0.35;
      next['WTI-90']     = 0.18;
      next['GOP-HOUSE']  = 0.42;
    } else if (name === 'dem-comeback') {
      next['TX-GOV-26']  = 0.55;
      next['FL-GOV-26']  = 0.50;
      next['MI-GOV-26']  = 0.82;
      next['GOP-HOUSE']  = 0.28;
      next['GA-3P-26']   = 0.40;
    }
    setBeliefs(next);
  }

  const dirty = JSON.stringify(beliefs) !== JSON.stringify(base);
  const presets = [
    { id: 'reset',        label: 'Status quo' },
    { id: 'gop-sweep',    label: 'GOP sweep' },
    { id: 'recession',    label: 'Recession arrives' },
    { id: 'dem-comeback', label: 'Democratic comeback' },
  ];

  return (
    <div className="rd2-pane">
      {/* ===== PMI summary band ===== */}
      <div className="sim-summary">
        <div className="sim-summary__cell">
          <div className="t-label">Base PMI</div>
          <div className="sim-summary__v">{(basePMI.total * 100).toFixed(2)}</div>
          <div className="t-label" style={{color:'var(--ink-3)'}}>
            naive {(basePMI.naive * 100).toFixed(2)} · cond {basePMI.condAdj >= 0 ? '+' : ''}{(basePMI.condAdj * 100).toFixed(2)}
          </div>
        </div>
        <div className="sim-summary__cell sim-summary__cell--scen">
          <div className="t-label">Scenario PMI</div>
          <div className="sim-summary__v">{(scenPMI.total * 100).toFixed(2)}</div>
          <div className="t-label" style={{color:'var(--ink-3)'}}>
            naive {(scenPMI.naive * 100).toFixed(2)} · cond {scenPMI.condAdj >= 0 ? '+' : ''}{(scenPMI.condAdj * 100).toFixed(2)}
          </div>
        </div>
        <div className={`sim-summary__cell sim-summary__cell--delta sim-summary__cell--${deltaPMI >= 0 ? 'pos' : 'neg'}`}>
          <div className="t-label">Δ PMI</div>
          <div className="sim-summary__v">
            {deltaPMI >= 0 ? '+' : ''}{(deltaPMI * 100).toFixed(2)}<span style={{fontSize:14, fontWeight:500, marginLeft:4}}>pp</span>
          </div>
          <div className="t-label" style={{color:'var(--ink-3)'}}>vs base · {dirty ? 'scenario active' : 'no change'}</div>
        </div>
        <div className="sim-summary__cell">
          <div className="t-label">Scenario</div>
          <div className="sim-summary__v sim-summary__v--small">
            {presets.find(p => p.id === activePreset)?.label || 'Custom'}
          </div>
          <div className="t-label" style={{color:'var(--ink-3)'}}>
            {sortedDiff.filter(d => Math.abs(d.dp) > 0.001).length} contracts shifted
          </div>
        </div>
      </div>

      {/* ===== Presets row ===== */}
      <div className="sim-presets">
        <span className="t-label" style={{color:'var(--ink-3)'}}>PRESETS</span>
        {presets.map(p => (
          <button key={p.id}
            className={`sim-preset ${activePreset === p.id ? 'is-active' : ''}`}
            onClick={() => applyPreset(p.id)}>
            {p.label}
          </button>
        ))}
        <button className="sim-preset sim-preset--ghost" onClick={() => { setBeliefs(base); setActivePreset('reset'); }}>
          ↺ Reset
        </button>
      </div>

      {/* ===== Body: sliders + cascade ===== */}
      <div className="sim-body">
        {/* ===== Sliders ===== */}
        <div className="sim-sliders">
          <div className="sim-sliders__head">
            <span></span>
            <span className="t-label">SCENARIO P(Yes)</span>
            <span className="t-label" style={{textAlign:'right'}}>ε</span>
            <span className="t-label" style={{textAlign:'right'}}>Δ to PMI</span>
          </div>
          {M.contracts.map(c => {
            const p = beliefs[c.sym];
            const induced = inducedProb(c.sym, beliefs);
            const dp = p - c.yes;
            const contribOwn = dp * eff[c.sym];
            const cascadeIn = induced - p;  // shift coming FROM other components
            const links = M.cond[c.sym] || {};
            const linkSyms = Object.keys(links);

            return (
              <div key={c.sym} className={`sim-row ${Math.abs(dp) > 0.001 ? 'is-dirty' : ''}`}>
                <div className="sim-row__head">
                  <div className="sim-row__sym">
                    <span style={{fontWeight:700}}>{c.sym}</span>
                    <span style={{color:'var(--ink-3)', marginLeft:8}}>w {c.w}%</span>
                  </div>
                  <div className="sim-row__q">{c.q}</div>
                </div>

                <div className="sim-row__slider">
                  <span className="sim-row__yesno-l">No</span>
                  <span className="sim-row__track">
                    {/* Base marker */}
                    <span className="sim-row__base" style={{left: (c.yes * 100) + '%'}} title={`base ${(c.yes * 100).toFixed(0)}%`} />
                    {/* Induced marker (shows where cascade pushed it) */}
                    {Math.abs(cascadeIn) > 0.005 && (
                      <span className="sim-row__induced" style={{left: (induced * 100) + '%'}}
                            title={`cascade-induced ${(induced * 100).toFixed(1)}%`} />
                    )}
                    <input type="range" min={0} max={1} step={0.005}
                           value={p}
                           onChange={e => setOne(c.sym, parseFloat(e.target.value))} />
                    <span className="sim-row__fill" style={{width: (p * 100) + '%'}} />
                  </span>
                  <span className="sim-row__yesno-r">Yes</span>
                </div>

                <div className="sim-row__readout">
                  <span className="sim-row__p">
                    <strong>{(p * 100).toFixed(0)}%</strong>
                    <span style={{color:'var(--ink-3)', fontSize:11, marginLeft:6}}>
                      vs base {(c.yes * 100).toFixed(0)}%
                      {Math.abs(dp) > 0.001 && (
                        <span className={dp > 0 ? 'rd-num--pos' : 'rd-num--neg'} style={{marginLeft:4, fontWeight:600}}>
                          {dp > 0 ? '+' : ''}{(dp * 100).toFixed(0)}pp
                        </span>
                      )}
                    </span>
                  </span>
                </div>

                <div className="sim-row__eps">{(eff[c.sym] * 100).toFixed(1)}%</div>

                <div className={`sim-row__contrib ${contribOwn >= 0 ? 'rd-num--pos' : 'rd-num--neg'}`}>
                  {Math.abs(contribOwn) < 0.0001 ? '—' :
                    (contribOwn >= 0 ? '+' : '') + (contribOwn * 100).toFixed(2) + 'pp'}
                </div>

                {/* Cascade reveal — only show when this contract is moved OR when others are pushing it */}
                {(Math.abs(dp) > 0.001 || Math.abs(cascadeIn) > 0.005) && linkSyms.length > 0 && (
                  <div className="sim-row__cascade">
                    <span className="t-label" style={{color:'var(--ink-3)'}}>CASCADE FROM {c.sym} →</span>
                    {linkSyms.map(j => {
                      const delta = links[j];
                      const induceJ = delta * dp;
                      return (
                        <span key={j} className="sim-cascade-pill">
                          {j}
                          <span className={induceJ >= 0 ? 'rd-num--pos' : 'rd-num--neg'} style={{marginLeft:6, fontWeight:600}}>
                            {induceJ >= 0 ? '+' : ''}{(induceJ * 100).toFixed(1)}pp
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}

                {Math.abs(cascadeIn) > 0.005 && (
                  <div className="sim-row__cascade sim-row__cascade--in">
                    <span className="t-label" style={{color:'var(--ink-3)'}}>INDUCED ON {c.sym} BY OTHERS</span>
                    <span className={`sim-cascade-induced ${cascadeIn >= 0 ? 'rd-num--pos' : 'rd-num--neg'}`}>
                      {cascadeIn >= 0 ? '+' : ''}{(cascadeIn * 100).toFixed(1)}pp → induced {(induced * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ===== Waterfall of contributions to ΔPMI ===== */}
        <div className="sim-waterfall">
          <div className="t-label" style={{marginBottom:12}}>WATERFALL · ΔPMI BY CONTRACT</div>
          <p className="t-body-sm" style={{color:'var(--ink-3)', marginTop:0, marginBottom:'var(--s-4)'}}>
            Each bar = Δp(yes) × effective weight ε. Bars sum to total ΔPMI.
            ε already absorbs the conditional propagation, so moving one slider gives you the full cascade-aware impact.
          </p>
          {sortedDiff.map(d => {
            const maxAbs = Math.max(0.001, ...sortedDiff.map(x => Math.abs(x.contrib)));
            const pct = Math.abs(d.contrib) / maxAbs * 50;
            const pos = d.contrib >= 0;
            return (
              <div key={d.sym} className="sim-wf__row">
                <span className="sim-wf__sym">{d.sym}</span>
                <span className="sim-wf__bar">
                  <span className="sim-wf__mid" />
                  {Math.abs(d.contrib) > 0.0001 && (
                    <span className={`sim-wf__fill ${pos ? 'sim-wf__fill--pos' : 'sim-wf__fill--neg'}`}
                          style={{width: pct + '%', [pos ? 'left' : 'right']: '50%'}} />
                  )}
                </span>
                <span className={`sim-wf__v ${pos ? 'rd-num--pos' : 'rd-num--neg'}`}>
                  {Math.abs(d.contrib) < 0.00005 ? '—' :
                    (pos ? '+' : '') + (d.contrib * 100).toFixed(2)}
                </span>
              </div>
            );
          })}
          <div className="sim-wf__total">
            <span>TOTAL Δ PMI</span>
            <span className={`sim-wf__v ${deltaPMI >= 0 ? 'rd-num--pos' : 'rd-num--neg'}`}>
              {deltaPMI >= 0 ? '+' : ''}{(deltaPMI * 100).toFixed(2)}pp
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ProViewMicro — same shell, with TabSimulator wired in
// ============================================================
function ProViewMicro({ brand }) {
  const [sym, setSym]   = React.useState('TX-GOV-26');
  const [tab, setTab]   = React.useState('sim');
  const [range, setRange] = React.useState('30D');
  const c = window.PMI_MODEL.bySym[sym];

  const microTabs = [
    { id: 'price',     label: 'Yes/No history',  hint: '60-day Yes/No probability with Micah Fair' },
    { id: 'sim',       label: 'PMI Simulator',   hint: 'Drag P(Yes) — watch PMI recompute with conditional cascade' },
    { id: 'analogues', label: 'Analogues',       hint: 'Prior cycles where this Yes/No question resolved' },
    { id: 'cond',      label: 'Conditional impact', hint: 'How this contract shifts other PMI components' },
    { id: 'venues',    label: 'Venue decomp',    hint: 'Where the Yes-price comes from' },
    { id: 'notes',     label: 'Notes',           hint: 'Hypothesis log for this contract' },
  ];

  return (
    <div className="rd2-view">
      <CropFrame>
        <div className="rd2-topbar">
          <span className="t-eyebrow">RESEARCH DESK · {c.cat.toUpperCase()} · + PMI SIMULATOR · {window.PMI_MODEL.pmiName.toUpperCase()}</span>
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
            <h1 className={brand === 'caps' ? 't-display-caps' : 't-display'} style={{fontSize:'clamp(28px, 3vw, 44px)'}}>{c.q}</h1>
            <p className="t-body" style={{marginTop:'var(--s-2)', fontSize:14, color:'var(--ink-3)', letterSpacing:'.04em'}}>
              {c.sym} · WEIGHT {c.w}% IN {window.PMI_MODEL.pmiName.toUpperCase()} · COMPOSITE SCORE {window.PMI_MODEL.pmiScore.toFixed(1)}
            </p>
          </div>
          <ContractPickerPMI value={sym} onChange={setSym} />
        </div>

        <HeroPMI sym={sym} density="editorial" />

        <div className="rd2-dim">
          <div className="rd2-tabs" role="tablist">
            {microTabs.map(t => (
              <button key={t.id} role="tab" aria-selected={t.id === tab}
                className={`rd2-tab ${t.id === tab ? 'is-active' : ''}`}
                onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <span className="t-label rd2-dim__hint">{microTabs.find(t => t.id === tab).hint}</span>
        </div>

        <div className="rd2-content">
          {tab === 'price'     && <div className="rd2-pane"><PriceDense sym={sym} density="editorial" /></div>}
          {tab === 'sim'       && <TabSimulator />}
          {tab === 'analogues' && <AnaloguesDense sym={sym} density="editorial" />}
          {tab === 'cond'      && <CondImpactPane sym={sym} density="editorial" />}
          {tab === 'venues'    && <VenuesDense sym={sym} density="editorial" />}
          {tab === 'notes'     && <TabNotes sym={sym} />}
        </div>
      </CropFrame>
    </div>
  );
}

Object.assign(window, { ProViewMicro, TabSimulator, effectiveWeights, pmiFromBeliefs, inducedProb });
