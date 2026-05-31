/* US Map + Time Chart — D3 powered, React rendered */

const { useEffect: _useEffect, useRef: _useRef, useState: _useState, useMemo: _useMemo } = React;

// ---------- USA Map ----------
function UsaMap({ width = 720, height = 460, onSelect, focusedState,
                  dataByCode = null, dimMissing = false, tipFormatter = null }) {
  const [topo, setTopo] = _useState(null);
  const [hover, setHover] = _useState(null);
  const M = window.MICAH;

  _useEffect(() => {
    // Load atlas only once
    if (window.__usAtlas) { setTopo(window.__usAtlas); return; }
    fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json')
      .then(r => r.json())
      .then(data => { window.__usAtlas = data; setTopo(data); })
      .catch(e => console.error('atlas load', e));
  }, []);

  const projData = _useMemo(() => {
    if (!topo || !window.topojson || !window.d3) return null;
    const features = window.topojson.feature(topo, topo.objects.states).features;
    const projection = window.d3.geoAlbersUsa().fitSize([width, height], { type: 'FeatureCollection', features });
    const pathGen = window.d3.geoPath(projection);
    // Manual label-position offsets for states whose geometric centroid
    // falls outside the land (concave shapes / panhandles / island states).
    // Values are pixel offsets applied AFTER centroid projection.
    const offsets = {
      FL: [22, 22],   // shift label SE into the peninsula
      MI: [12, 22],   // lower peninsula
      LA: [-8, -4],   // pull west of the delta
      MD: [10, 4],    // skinny eastern arm — nudge right
      ID: [0, 8],     // top tapers — nudge down
      OK: [10, 4],    // panhandle pulls centroid west
      WV: [-4, 4],
      AK: [0, 0],
      HI: [0, 0],
    };
    return features.map(f => {
      const name = f.properties.name;
      const code = stateNameToCode(name);
      const s = M.states[code];
      let c = pathGen.centroid(f);
      const off = offsets[code];
      if (off && c && !isNaN(c[0])) c = [c[0] + off[0], c[1] + off[1]];
      const baseVal = s ? s.value : 50;
      const overrideVal = dataByCode ? dataByCode[code] : undefined;
      const value = overrideVal !== undefined ? overrideVal : baseVal;
      const hasData = dataByCode ? (overrideVal !== undefined) : true;
      return { id: f.id, code, name, d: pathGen(f), centroid: c, value, hasData };
    });
  }, [topo, width, height, dataByCode]);

  if (!projData) {
    return (
      <div className="map-skel" style={{ width, height }}>
        <span className="t-label">Loading map…</span>
      </div>
    );
  }

  return (
    <div className="usa-map" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${width} ${height}`} className="usa-map__svg" preserveAspectRatio="xMidYMid meet">
        {projData.map(p => {
          const focused = focusedState && focusedState === p.code;
          const dim = dimMissing && !p.hasData;
          const fill = dim ? '#E1DCD0' : window.heatColor(p.value);
          let op = 1;
          if (focusedState && !focused) op = 0.45;
          else if (dim) op = 0.55;
          return (
            <path
              key={p.id}
              d={p.d}
              fill={fill}
              stroke={focused ? '#11192C' : '#FBFAF6'}
              strokeWidth={focused ? 2 : 0.8}
              opacity={op}
              onMouseEnter={() => setHover(p)}
              onMouseLeave={() => setHover(null)}
              onClick={() => !dim && onSelect && onSelect(p.code)}
              style={{ cursor: dim ? 'default' : 'pointer', transition: 'opacity .2s' }}
            />
          );
        })}
        {/* state abbreviations on hover-friendly states */}
        {projData.map(p => {
          if (!p.centroid || isNaN(p.centroid[0])) return null;
          // hide labels for tiny states to avoid clutter
          const tiny = ['RI','CT','NJ','DE','MD','MA','NH','VT','DC'];
          if (tiny.includes(p.code)) return null;
          return (
            <text key={p.id+'_t'} x={p.centroid[0]} y={p.centroid[1]+3}
              textAnchor="middle"
              fontSize={p.code === 'CA' || p.code === 'TX' ? 11 : 9}
              fill={p.value > 65 || p.value < 25 ? '#FBFAF6' : '#11192C'}
              style={{ fontWeight: 600, fontFamily: 'Inter, sans-serif', pointerEvents: 'none' }}>
              {p.code}
            </text>
          );
        })}
      </svg>
      {hover && (
        <div className="map-tip" style={{ position:'absolute', left: 8, bottom: 8 }}>
          <div className="map-tip__name">{hover.name}</div>
          <div className="map-tip__val">
            {tipFormatter ? tipFormatter(hover) :
             (dimMissing && !hover.hasData ? 'Not on 2026 ballot' : `PMI ${hover.value}`)}
          </div>
        </div>
      )}
    </div>
  );
}

function stateNameToCode(name) {
  const map = {
    'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
    'Colorado':'CO','Connecticut':'CT','Delaware':'DE','District of Columbia':'DC',
    'Florida':'FL','Georgia':'GA','Hawaii':'HI','Idaho':'ID','Illinois':'IL',
    'Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY','Louisiana':'LA',
    'Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN',
    'Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV',
    'New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY',
    'North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR',
    'Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD',
    'Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA',
    'Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
  };
  return map[name] || name.slice(0,2).toUpperCase();
}

// ---------- Time Chart (14-day PMI line) ----------
function TimeChart({ data = [], width = 720, height = 460, color = '#3A4C6A', yLabel = 'PMI Score', noData = false, plain = false }) {
  const padding = { top: 30, right: 40, bottom: 50, left: 60 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const maxY = 100;
  const minY = 0;

  const xStep = data.length > 1 ? innerW / (data.length - 1) : 0;
  const points = data.map((v, i) => [padding.left + i * xStep, padding.top + innerH - (v - minY) / (maxY - minY) * innerH]);

  const linePath = points.length ? `M ${points.map(p => p.join(',')).join(' L ')}` : '';

  const yTicks = [0, 20, 40, 60, 80, 100];

  return (
    <div className="time-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {/* Y-axis ticks + horizontal grid */}
        {yTicks.map(t => {
          const y = padding.top + innerH - (t / maxY) * innerH;
          return (
            <g key={t}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y}
                stroke="#E1DCD0" strokeWidth="1" />
              <text x={padding.left - 12} y={y + 4} textAnchor="end"
                fontSize="11" fill="#6B7180" fontFamily="Inter, sans-serif">
                {t}
              </text>
            </g>
          );
        })}
        {/* Y axis label */}
        {!plain && (
          <text x={-(padding.top + innerH/2)} y={20} transform={`rotate(-90)`} textAnchor="middle"
            fontSize="12" fill="#6B7180" fontFamily="Inter, sans-serif">
            {yLabel}
          </text>
        )}
        {/* X labels (Mar 1 / Mar 7 / Mar 14) */}
        {!noData && data.length > 0 && (
          <>
            <text x={padding.left} y={height - 18} fontSize="12" fill="#6B7180" fontFamily="Inter, sans-serif">Mar 1</text>
            <text x={padding.left + innerW/2} y={height - 18} fontSize="12" fill="#6B7180" textAnchor="middle" fontFamily="Inter, sans-serif">Mar 7</text>
            <text x={width - padding.right} y={height - 18} fontSize="12" fill="#6B7180" textAnchor="end" fontFamily="Inter, sans-serif">Mar 14</text>
          </>
        )}
        {/* Line */}
        {!noData && (
          <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        )}
        {/* No data state — concentric rings */}
        {noData && (
          <g>
            {[40, 70, 110, 150].map(r => (
              <circle key={r} cx={padding.left + innerW/2} cy={padding.top + innerH/2} r={r}
                fill="none" stroke="#E1DCD0" strokeWidth="1" />
            ))}
            <g transform={`translate(${padding.left + innerW/2 - 14}, ${padding.top + innerH/2 - 14})`}>
              <rect width="28" height="28" rx="6" fill="#F8F6F1" stroke="#E1DCD0" />
              <path d="M9 19 L13 13 L16 16 L20 10" stroke="#6B7180" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" transform="translate(0,0)"/>
            </g>
            <text x={padding.left + innerW/2} y={padding.top + innerH/2 + 50}
              textAnchor="middle" fontSize="14" fill="#11192C" fontWeight="600" fontFamily="Inter, sans-serif">
              No data available
            </text>
            <text x={padding.left + innerW/2} y={padding.top + innerH/2 + 70}
              textAnchor="middle" fontSize="12" fill="#6B7180" fontFamily="Inter, sans-serif">
              Data will appear once activity is recorded.
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

// Northeast Corridor right-rail column (small horizontal cells)
function NortheastRail({ states }) {
  const M = window.MICAH;
  return (
    <div className="ne-rail">
      <div className="ne-rail__title t-label">NORTHEAST CORRIDOR</div>
      <div className="ne-rail__list">
        {states.map(code => {
          const s = M.states[code];
          const v = s ? s.value : 50;
          const c = window.heatColor(v);
          const dark = v > 65 || v < 25;
          return (
            <div key={code} className="ne-rail__cell" style={{ background: c, color: dark ? '#FBFAF6' : '#11192C' }}>
              {code}
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { UsaMap, TimeChart, NortheastRail, stateNameToCode });
