/* Views — WorldView, StateView, QuestionView, WarIndexView */

const { useState: vState } = React;

// ---------- WORLD VIEW (National MAGA Index) ----------
function WorldView({ onNavigate, brand }) {
  const [mode, setMode] = vState('map');         // 'map' | 'chart'
  const [filter, setFilter] = vState('all');     // all / state / governor / senate / house
  const M = window.MICAH;

  return (
    <div className="view">
      <CropFrame>
        <PageTitle
          caps={brand === 'caps'}
          title="National MAGA Index"
          body="Micah aggregates contracts from multiple prediction market exchanges to structure and power the MAGA Index—a prediction market index (PMI) tracking sentiment and probabilities around political outcomes, policy direction, and narratives associated with the MAGA movement. As more data is incorporated, the index gains stronger predictive power."
        />

        <div className="row-between" style={{ marginTop: 'var(--s-6)' }}>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'state', label: 'By State' },
              { value: 'governor', label: 'By Governor' },
              { value: 'senate', label: 'By Senate' },
              { value: 'house', label: 'By House' },
            ]}
          />
        </div>

        <div className="row-between" style={{ marginTop: 'var(--s-6)' }}>
          <span className="t-eyebrow">LIVE · 50 STATES + DC · UPDATED MAY 04</span>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[{ value: 'map', label: 'Map' }, { value: 'chart', label: '14-Day Graph' }]}
          />
        </div>

        <div className="world-grid" style={{ marginTop: 'var(--s-5)' }}>
          <div className="world-grid__stats">
            <ScoreTile value="93" label="PMI Score" tone="red" size="lg" />
            <StatCard value="32K" label="Live Contracts" live />
            <StatCard value="11" label="Prediction Market Exchanges">
              <ExchangeStack ids={['kalshi','polymarket','robinhood','coinbase']} extras={7} size={22} />
            </StatCard>
            <StatCard value="88" label="PMI Holdings" info />
          </div>

          <div className="world-grid__viz">
            {mode === 'map' ? (
              <>
                <div className="world-grid__map">
                  <UsaMap width={760} height={500} onSelect={(code) => onNavigate({ view: 'state', state: code })} />
                </div>
                <div className="world-grid__rail">
                  <NortheastRail states={M.northeast} />
                </div>
              </>
            ) : (
              <div className="world-grid__map">
                <TimeChart data={M.series14} width={900} height={500} color="#3A4C6A" yLabel="PMI Score" />
              </div>
            )}
          </div>
        </div>

        {mode === 'map' && (
          <div style={{ marginTop: 'var(--s-6)', paddingLeft: 'calc(220px + var(--s-8))' }}>
            <HeatScale />
          </div>
        )}

        {/* PMI LIST */}
        <div className="section" style={{ marginTop: 'var(--s-12)' }}>
          <h2 className={brand === 'caps' ? 't-display-caps' : 't-display'} style={{ fontSize: 36 }}>
            Prediction Markets Indexes (PMIs)
          </h2>
          <p className="t-body" style={{ marginTop: 'var(--s-2)', maxWidth: 820 }}>
            PMIs aggregate &amp; structure related prediction market contracts into one index. PMIs are powered by more data, resulting in stronger predictive power. Micah PMIs' account for many variables, such as volume and relevancy.
          </p>
          <div style={{ marginTop: 'var(--s-5)' }}>
            <Segmented
              value="all"
              onChange={() => {}}
              options={[
                { value: 'all', label: 'All' },
                { value: 'state', label: 'By State' },
                { value: 'governor', label: 'By Governor' },
                { value: 'senate', label: 'By Senate' },
                { value: 'house', label: 'By House' },
              ]}
            />
          </div>
          <div className="pmi-list" style={{ marginTop: 'var(--s-5)' }}>
            {M.indexes.map(r => (
              <PMIRow
                key={r.id}
                row={r}
                onClick={() => onNavigate(r.kind === 'state'
                  ? { view: 'state', state: r.state }
                  : { view: 'question', id: r.id })}
              />
            ))}
          </div>
        </div>
      </CropFrame>
    </div>
  );
}

// ---------- STATE VIEW (Maryland MAGA Index / Texas Gov...) ----------
function StateView({ stateCode = 'MD', onNavigate, brand, showTooltips = false }) {
  const M = window.MICAH;
  const s = M.states[stateCode];
  const [tab, setTab] = vState('elections');  // 'elections' | 'holdings'
  const heat = s ? s.value : 50;
  const tileTone =
    heat >= 75 ? 'red' :
    heat >= 55 ? 'soft-red' :
    heat >= 45 ? 'lavender' :
    heat >= 25 ? 'soft-blue' : 'blue';
  const series = M.makeSeries(stateCode.charCodeAt(0) + stateCode.charCodeAt(1), Math.round(heat) + 5, Math.max(15, heat - 30));

  return (
    <div className="view">
      <CropFrame>
        <div className="breadcrumb">
          <button className="breadcrumb__link" onClick={() => onNavigate({ view: 'world' })}>World</button>
          <span className="breadcrumb__sep">›</span>
          <span>By State</span>
        </div>

        <PageTitle
          caps={brand === 'caps'}
          title={`${s ? s.name : stateCode} MAGA Index`}
          body="An aggregated, data-driven estimate of market-implied probabilities across major political outcomes and themes tied to the MAGA movement, derived from active prediction market contracts and exchange signals."
        />

        <div className="state-grid" style={{ marginTop: 'var(--s-6)', position:'relative' }}>
          <div className="state-grid__stats">
            <ScoreTile value={Math.round(heat)} label="PMI Score" tone={tileTone} />
            <StatCard value="32K" label="Live Contracts" live />
            <StatCard value="11" label="Prediction Market Exchanges">
              <ExchangeStack ids={['kalshi','polymarket','robinhood','coinbase']} extras={7} size={22} />
            </StatCard>
            <StatCard value="88" label="PMI Holdings" info />
          </div>
          <div className="state-grid__chart">
            <TimeChart data={series} width={760} height={460} color="#3A4C6A" yLabel="PMI Probability (%)" />
          </div>

          {showTooltips && (
            <>
              <Tooltip title="PMI Score" style={{ position:'absolute', top: 100, left: 200, width: 280 }}>
                The Prediction Market Index (PMI) Score is calculated by aggregating and structuring related prediction market contracts (PMI Holdings). A higher PMI Score reflects a greater likelihood of MAGA-aligned political outcomes and narratives materializing.
              </Tooltip>
              <Tooltip title="PMI Holdings" style={{ position:'absolute', top: 410, left: 200, width: 320 }}>
                PMI Holdings are the component prediction market contracts that make up a PMI. A PMI's holdings are structured using Micah's proprietary software and algorithms to create a PMI Score for multi-factor indexes, and a PMI Probability (%) for single-factor indexes.
              </Tooltip>
            </>
          )}
        </div>

        <div style={{ marginTop: 'var(--s-8)' }}>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[{ value: 'elections', label: 'By Election Type' }, { value: 'holdings', label: 'PMI Holdings' }]}
          />
        </div>

        {tab === 'elections' ? (
          <div className="pmi-list" style={{ marginTop: 'var(--s-5)' }}>
            {M.indexes.filter(i => i.kind === 'question').slice(0, 3).map(r => {
              const title = r.title.replace('<State>', s ? s.name : stateCode);
              return (
                <PMIRow
                  key={r.id}
                  row={{ ...r, title }}
                  onClick={() => onNavigate({ view: 'question', id: r.id, state: stateCode })}
                />
              );
            })}
          </div>
        ) : (
          <HoldingsTable rows={M.componentContracts} replaceState={s ? s.name : stateCode} />
        )}
      </CropFrame>
    </div>
  );
}

// ---------- Holdings Table (Component Contracts) ----------
function HoldingsTable({ rows, replaceState }) {
  return (
    <div className="holdings-table" style={{ marginTop: 'var(--s-5)' }}>
      <div className="holdings-table__head t-label">
        <span>Component Contracts</span>
        <span>Relationship</span>
        <span>Prediction Market Exchange</span>
        <span style={{textAlign:'right'}}>Volume</span>
        <span style={{textAlign:'right'}}>Probability of Yes</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="holdings-table__row">
          <a className="holdings-table__title" href="#" onClick={e => e.preventDefault()}>
            {r.title.replace('<State>', replaceState)}
          </a>
          <span><Tag tone={r.rel === 'Direct' ? 'direct' : 'indirect'}>{r.rel}</Tag></span>
          <span className="holdings-table__exc">
            <ExchangeChip id={r.exc} size={26} />
            <span>{window.MICAH.exchanges[r.exc].name}</span>
          </span>
          <span style={{textAlign:'right', fontWeight:600}}>${r.volume.toLocaleString()}</span>
          <span style={{textAlign:'right', fontWeight:600}}>{r.prob.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

// ---------- QUESTION VIEW (single contract) ----------
function QuestionView({ id, onNavigate, brand, noData = false }) {
  const M = window.MICAH;
  const idx = M.indexes.find(x => x.id === id) || M.indexes[1];
  const title = idx.title.replace('<State>', 'Michigan');
  const heat = idx.heat;
  const tone = heat >= 60 ? 'red' : (heat >= 40 ? 'lavender' : 'blue');
  const score = `${idx.score}%`;
  const [view, setView] = vState('grid'); // list | grid

  return (
    <div className="view">
      <CropFrame>
        <PageTitle caps={brand === 'caps'} title={title} />

        <div className="state-grid" style={{ marginTop: 'var(--s-6)' }}>
          <div className="state-grid__stats">
            <ScoreTile value={score} label="PMI Probability" tone={tone} />
            <StatCard value="32K" label="Live Contracts" live />
            <StatCard value="11" label="Prediction Market Exchanges">
              <ExchangeStack ids={['kalshi','polymarket','robinhood','coinbase']} extras={7} size={22} />
            </StatCard>
            <StatCard value="88" label="PMI Holdings" info />
          </div>
          <div className="state-grid__chart">
            <TimeChart
              data={noData ? [] : M.series14}
              width={760}
              height={460}
              color="#3A4C6A"
              yLabel="PMI Probability (%)"
              noData={noData}
              plain={noData}
            />
          </div>
        </div>

        <div className="section" style={{ marginTop: 'var(--s-10)' }}>
          <div className="row-between">
            <h3 className="t-h3">PMI Holdings</h3>
            <div className="view-toggle">
              <button className={`view-toggle__btn ${view === 'list' ? 'is-active' : ''}`} onClick={() => setView('list')} aria-label="List">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1.2" fill="currentColor"/><circle cx="4" cy="12" r="1.2" fill="currentColor"/><circle cx="4" cy="18" r="1.2" fill="currentColor"/></svg>
              </button>
              <button className={`view-toggle__btn ${view === 'grid' ? 'is-active' : ''}`} onClick={() => setView('grid')} aria-label="Grid">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              </button>
            </div>
          </div>
          {view === 'list' ? (
            <HoldingsTable rows={M.componentContracts} replaceState="Michigan" />
          ) : (
            <HoldingsGrid rows={M.componentContracts} />
          )}
        </div>
      </CropFrame>
    </div>
  );
}

function HoldingsGrid({ rows }) {
  return (
    <div className="holdings-grid">
      {rows.map((r, i) => (
        <div key={i} className="holdings-card">
          <div className="holdings-card__head">
            <ExchangeChip id={r.exc} size={26} />
            <a href="#" onClick={e=>e.preventDefault()} className="holdings-card__title">
              {r.title.replace('<State>', 'Michigan')}
            </a>
          </div>
          <div className="holdings-card__row">
            <Tag tone={r.rel === 'Direct' ? 'direct' : 'indirect'}>{r.rel}</Tag>
          </div>
          <div className="holdings-card__row holdings-card__row--foot">
            <span className="t-label">Volume: <strong style={{color:'var(--ink-1)'}}>${r.volume.toLocaleString()}</strong></span>
            <span className="holdings-card__yes">Yes: <strong>{r.prob.toFixed(1)}%</strong></span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- WAR INDEX VIEW ----------
function WarIndexView({ onNavigate }) {
  const M = window.MICAH;
  return (
    <div className="view">
      <CropFrame>
        <div className="breadcrumb">
          <button className="breadcrumb__link" onClick={() => onNavigate({ view: 'world' })}>World</button>
          <span className="breadcrumb__sep">›</span>
          <span>By State</span>
        </div>
        <PageTitle
          title="Maryland MAGA Index"
          body="An aggregated, data-driven estimate of market-implied probabilities across major political outcomes and themes tied to the MAGA movement, derived from active prediction market contracts and exchange signals."
        />
        <div className="state-grid" style={{ marginTop: 'var(--s-6)' }}>
          <div className="state-grid__stats">
            <ScoreTile value="93" label="PMI Score" tone="blue" />
            <StatCard value="897" label="Contracts" />
            <StatCard value="11" label="Prediction Market Exchanges">
              <ExchangeStack ids={['kalshi','polymarket','robinhood','coinbase']} extras={7} size={22} />
            </StatCard>
            <StatCard value="88" label="PMI Holdings" info />
          </div>
          <div className="state-grid__chart">
            <TimeChart data={M.series14} width={760} height={460} color="#3A4C6A" yLabel="PMI Score" />
          </div>
        </div>

        <h3 className="t-h3" style={{ marginTop: 'var(--s-10)' }}>PMI Holdings</h3>
        <div className="war-grid" style={{ marginTop: 'var(--s-5)' }}>
          {M.warHoldings.map((h, i) => (
            <div key={i} className="holdings-card">
              <div className="holdings-card__head">
                <ExchangeChip id={h.exc} size={26} />
                <a href="#" onClick={e=>e.preventDefault()} className="holdings-card__title">{h.title}</a>
              </div>
              <div className="holdings-card__row"><Tag tone="indirect">{h.rel}</Tag></div>
              <div className="holdings-card__row holdings-card__row--foot">
                <span className="t-label">Volume: <strong style={{color:'var(--ink-1)'}}>{h.volume}</strong></span>
                <span className="holdings-card__yes">Yes: <strong>{h.yes}.0%</strong></span>
              </div>
            </div>
          ))}
        </div>
      </CropFrame>
    </div>
  );
}

Object.assign(window, { WorldView, StateView, QuestionView, WarIndexView });
