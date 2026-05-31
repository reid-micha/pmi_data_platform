/* Shared UI primitives — Header, Footer, StatCard, etc. */

const { useState, useEffect, useRef, useMemo } = React;

// Color stop interpolation for the heat scale 0-100
function heatColor(v) {
  // Anchor stops drawn from CSS vars (kept in JS for SVG fills)
  const stops = [
    [0,   [22, 52, 138]],   // #16348A deep dem
    [15,  [45, 91, 204]],   // #2D5BCC
    [30,  [111, 143, 219]], // #6F8FDB
    [45,  [184, 197, 227]], // #B8C5E3
    [50,  [233, 226, 220]], // #E9E2DC neutral
    [55,  [236, 201, 207]], // #ECC9CF
    [70,  [220, 139, 149]], // #DC8B95
    [85,  [181, 55, 71]],   // #B53747
    [100, [139, 30, 45]],   // #8B1E2D deep rep
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (v >= stops[i][0] && v <= stops[i+1][0]) { lo = stops[i]; hi = stops[i+1]; break; }
  }
  const t = (v - lo[0]) / (hi[0] - lo[0] || 1);
  const c = lo[1].map((x, i) => Math.round(x + (hi[1][i] - x) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ---------- Site Header ----------
function Header({ title = 'MAGA Index', onNavigate }) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <button className="brand-mark" onClick={() => onNavigate && onNavigate({ view: 'world' })}>
          <span className="brand-mark__title">{title}</span>
        </button>
        <div className="site-header__center">
          <label className="search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input type="text" placeholder="Search" />
          </label>
        </div>
        <div className="site-header__right">
          <span className="powered-by">Powered by</span>
          <img src="assets/micah-logo.svg" alt="Micah" className="powered-logo" />
        </div>
      </div>
    </header>
  );
}

// ---------- Footer ----------
function Footer({ title = 'MAGA Index' }) {
  return (
    <footer className="site-footer">
      <div className="site-footer__left">
        <span className="powered-by">Powered by</span>
        <img src="assets/micah-logo.svg" alt="Micah" className="powered-logo" />
      </div>
      <div className="site-footer__right t-display-caps" style={{fontSize: '22px'}}>{title}</div>
    </footer>
  );
}

// ---------- Crop marks frame (the dotted square in mocks) ----------
function CropFrame({ children }) {
  return (
    <div className="crop-frame">
      <span className="crop crop-tl">+</span>
      <span className="crop crop-tr">+</span>
      <span className="crop crop-bl">+</span>
      <span className="crop crop-br">+</span>
      {children}
    </div>
  );
}

// ---------- Score Tile (the large colored stat) ----------
function ScoreTile({ value, label = 'PMI Score', tone = 'red', size = 'lg', info = true }) {
  // tone: 'red' | 'blue' | 'lavender' | 'soft-red' | 'soft-blue' | 'neutral'
  const tones = {
    'red':         { bg: 'var(--red-strong)',  fg: 'var(--ink-inverse)' },
    'blue':        { bg: 'var(--blue-strong)', fg: 'var(--ink-inverse)' },
    'soft-red':    { bg: 'var(--red-soft)',    fg: 'var(--ink-1)' },
    'soft-blue':   { bg: 'var(--blue-soft)',   fg: 'var(--ink-1)' },
    'lavender':    { bg: 'var(--lavender)',    fg: 'var(--ink-1)' },
    'neutral':     { bg: 'var(--surface-tint)', fg: 'var(--ink-1)' },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <div className={`score-tile score-tile--${size}`} style={{ background: t.bg, color: t.fg }}>
      <div className="score-tile__value">{value}</div>
      <div className="score-tile__label">
        {label}
        {info && <InfoCircle />}
      </div>
    </div>
  );
}

// ---------- Stat Card (32K Contracts, 88 PMI Holdings, etc.) ----------
function StatCard({ value, label, live, info, children }) {
  return (
    <div className="stat-card">
      <div className="stat-card__value">
        <span>{value}</span>
        {children}
      </div>
      <div className="stat-card__label">
        {live && <span className="live-dot" />}
        {label}
        {info && <InfoCircle />}
      </div>
    </div>
  );
}

function InfoCircle() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{verticalAlign:'-2px', marginLeft:4, opacity:.55}}>
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 11v6"/><circle cx="12" cy="7.5" r="0.7" fill="currentColor"/>
    </svg>
  );
}

// ---------- Exchange Chip (small colored circle with glyph) ----------
function ExchangeChip({ id, size = 22 }) {
  const ex = window.MICAH.exchanges[id];
  if (!ex) return null;
  return (
    <span className="ex-chip" style={{ width: size, height: size, background: ex.color, color: ex.dark ? '#11192C' : '#fff' }} title={ex.name}>
      {ex.glyph}
    </span>
  );
}

// Stack of exchange chips with "+N" overflow
function ExchangeStack({ ids, extras = 0, size = 22 }) {
  return (
    <span className="ex-stack">
      {ids.map((id, i) => (
        <span key={id+i} className="ex-stack__slot" style={{ width: size, height: size }}>
          <ExchangeChip id={id} size={size} />
        </span>
      ))}
      {extras > 0 && (
        <span className="ex-stack__more" style={{ height: size, lineHeight: size + 'px' }}>+{extras}</span>
      )}
    </span>
  );
}

// ---------- Tag (chip with rounded outline) ----------
function Tag({ children, tone = 'neutral' }) {
  return <span className={`tag tag--${tone}`}>{children}</span>;
}

// ---------- Segmented control ----------
function Segmented({ options, value, onChange, size = 'md' }) {
  return (
    <div className={`segmented segmented--${size}`}>
      {options.map(o => (
        <button
          key={o.value}
          className={`segmented__btn ${o.value === value ? 'is-active' : ''}`}
          onClick={() => onChange && onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Share button ----------
function ShareBtn() {
  return (
    <button className="icon-btn" aria-label="Share">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12V19 a2 2 0 0 0 2 2 h10 a2 2 0 0 0 2-2 v-7"/>
        <path d="M16 6 L12 2 L8 6"/><path d="M12 2 V15"/>
      </svg>
    </button>
  );
}

// ---------- Page Title block ----------
function PageTitle({ caps = false, title, body, breadcrumb, onShare }) {
  return (
    <div className="page-title">
      {breadcrumb && <div className="breadcrumb">{breadcrumb}</div>}
      <div className="page-title__row">
        <h1 className={caps ? 't-display-caps' : 't-display'}>{title}</h1>
        <ShareBtn />
      </div>
      {body && <p className="page-title__body t-body">{body}</p>}
    </div>
  );
}

// ---------- PMI list row ----------
function PMIRow({ row, onClick }) {
  const M = window.MICAH;
  const { score, scoreType, heat, title, tags, excs, extras, contracts } = row;
  const dotted = heat >= 50 ? 'dotted-red' : 'dotted-blue';
  const tone =
    heat >= 85 ? 'red' :
    heat >= 60 ? 'soft-red' :
    heat >= 40 ? 'lavender' :
    heat >= 20 ? 'soft-blue' : 'blue';
  return (
    <div className="pmi-row" onClick={onClick} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick && onClick(); }}>
      <span className={`pmi-row__dots ${dotted}`} aria-hidden></span>
      <span className="pmi-row__score">
        <ScoreTile
          value={scoreType === 'prob' ? `${score}%` : score}
          label={scoreType === 'prob' ? 'PMI Probability' : 'PMI Score'}
          tone={tone}
          size="sm"
          info={false}
        />
      </span>
      <span className="pmi-row__body">
        <span className="pmi-row__title">{title}</span>
        <span className="pmi-row__tags">
          {tags.map(t => <Tag key={t}>{t}</Tag>)}
        </span>
      </span>
      <span className="pmi-row__right">
        <ExchangeStack ids={excs} extras={extras} size={26} />
        <span className="pmi-row__contracts">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          {contracts.toLocaleString()} Contracts
        </span>
      </span>
      <ShareBtn />
    </div>
  );
}

// ---------- Heat scale legend ----------
function HeatScale() {
  return (
    <div className="heat-scale">
      <div className="heat-scale__head">
        <span className="t-body-sm" style={{color:'var(--ink-1)', fontWeight:600}}>PMI Heat Scale · 0 → 100</span>
      </div>
      <div className="heat-scale__row">
        <span className="t-label">Leaning Democrat</span>
        <span className="t-label" style={{textAlign:'right'}}>Leaning Republican</span>
      </div>
      <div className="heat-scale__bar" />
      <div className="heat-scale__ticks">
        {[0,25,50,75,100].map(n => <span key={n} className="t-label">{n}</span>)}
      </div>
    </div>
  );
}

// ---------- Tooltip (small info popover, persistent) ----------
function Tooltip({ title, children, style }) {
  return (
    <div className="tooltip" style={style}>
      <div className="tooltip__title">{title}</div>
      <div className="tooltip__body">{children}</div>
    </div>
  );
}

// Export
Object.assign(window, {
  Header, Footer, CropFrame, ScoreTile, StatCard, InfoCircle,
  ExchangeChip, ExchangeStack, Tag, Segmented, ShareBtn,
  PageTitle, PMIRow, HeatScale, Tooltip, heatColor,
});
