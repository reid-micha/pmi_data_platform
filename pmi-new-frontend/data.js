/* Micah sample data — states, exchanges, contracts, time series */

window.MICAH = (() => {
  // ---------- Exchanges (the prediction markets) ----------
  const exchanges = {
    kalshi:      { name: 'Kalshi',      color: '#00D08C', glyph: 'K', label: 'Kalshi' },
    polymarket:  { name: 'Polymarket',  color: '#1652F0', glyph: 'P', label: 'Polymarket' },
    robinhood:   { name: 'Robinhood',   color: '#CCFF00', glyph: 'R', label: 'Robinhood', dark: true },
    metaculus:   { name: 'Metaculus',   color: '#111111', glyph: 'M', label: 'Metaculus' },
    coinbase:    { name: 'Coinbase',    color: '#1652F0', glyph: 'C', label: 'Coinbase' },
    manifold:    { name: 'Manifold',    color: '#4E2DE0', glyph: 'M', label: 'Manifold' },
    predictit:   { name: 'PredictIt',   color: '#E66A2C', glyph: 'P', label: 'PredictIt' },
    pinata:      { name: 'Pinata',      color: '#111111', glyph: 'P', label: 'Pinata' },
    crowncoin:   { name: 'CrownCoin',   color: '#4E2DE0', glyph: '♛', label: 'CrownCoin' },
    insightpred: { name: 'InsightPred', color: '#FFD500', glyph: 'i', label: 'Insight', dark: true },
    forecast:    { name: 'Forecast',    color: '#111111', glyph: 'F', label: 'Forecast' },
  };

  // ---------- US states with sample PMI heat values (0=Dem, 100=Rep) ----------
  // value 0..100 — heat scale, mirroring the screenshot's distribution
  const states = {
    AL: { name: 'Alabama',        value: 78, contracts: 280 },
    AK: { name: 'Alaska',         value: 82, contracts: 90  },
    AZ: { name: 'Arizona',        value: 72, contracts: 540 },
    AR: { name: 'Arkansas',       value: 18, contracts: 110 },
    CA: { name: 'California',     value: 5,  contracts: 1820 },
    CO: { name: 'Colorado',       value: 48, contracts: 410 },
    CT: { name: 'Connecticut',    value: 62, contracts: 220 },
    DE: { name: 'Delaware',       value: 64, contracts: 100 },
    FL: { name: 'Florida',        value: 6,  contracts: 1310 },
    GA: { name: 'Georgia',        value: 60, contracts: 720 },
    HI: { name: 'Hawaii',         value: 12, contracts: 80 },
    ID: { name: 'Idaho',          value: 22, contracts: 120 },
    IL: { name: 'Illinois',       value: 52, contracts: 640 },
    IN: { name: 'Indiana',        value: 80, contracts: 270 },
    IA: { name: 'Iowa',           value: 26, contracts: 240 },
    KS: { name: 'Kansas',         value: 82, contracts: 180 },
    KY: { name: 'Kentucky',       value: 20, contracts: 200 },
    LA: { name: 'Louisiana',      value: 88, contracts: 230 },
    ME: { name: 'Maine',          value: 58, contracts: 130 },
    MD: { name: 'Maryland',       value: 33, contracts: 320 },
    MA: { name: 'Massachusetts',  value: 42, contracts: 380 },
    MI: { name: 'Michigan',       value: 70, contracts: 620 },
    MN: { name: 'Minnesota',      value: 64, contracts: 360 },
    MS: { name: 'Mississippi',    value: 20, contracts: 140 },
    MO: { name: 'Missouri',       value: 24, contracts: 290 },
    MT: { name: 'Montana',        value: 14, contracts: 120 },
    NE: { name: 'Nebraska',       value: 20, contracts: 150 },
    NV: { name: 'Nevada',         value: 76, contracts: 380 },
    NH: { name: 'New Hampshire',  value: 65, contracts: 160 },
    NJ: { name: 'New Jersey',     value: 60, contracts: 410 },
    NM: { name: 'New Mexico',     value: 78, contracts: 180 },
    NY: { name: 'New York',       value: 48, contracts: 920 },
    NC: { name: 'North Carolina', value: 86, contracts: 670 },
    ND: { name: 'North Dakota',   value: 22, contracts: 100 },
    OH: { name: 'Ohio',           value: 78, contracts: 540 },
    OK: { name: 'Oklahoma',       value: 22, contracts: 200 },
    OR: { name: 'Oregon',         value: 42, contracts: 290 },
    PA: { name: 'Pennsylvania',   value: 80, contracts: 760 },
    RI: { name: 'Rhode Island',   value: 44, contracts: 100 },
    SC: { name: 'South Carolina', value: 76, contracts: 250 },
    SD: { name: 'South Dakota',   value: 18, contracts: 100 },
    TN: { name: 'Tennessee',      value: 22, contracts: 280 },
    TX: { name: 'Texas',          value: 92, contracts: 1450 },
    UT: { name: 'Utah',           value: 84, contracts: 200 },
    VT: { name: 'Vermont',        value: 38, contracts: 90 },
    VA: { name: 'Virginia',       value: 16, contracts: 510 },
    WA: { name: 'Washington',     value: 36, contracts: 480 },
    WV: { name: 'West Virginia',  value: 14, contracts: 130 },
    WI: { name: 'Wisconsin',      value: 70, contracts: 480 },
    WY: { name: 'Wyoming',        value: 18, contracts: 80 },
    DC: { name: 'D.C.',           value: 2,  contracts: 60 },
  };

  // ---------- PMI Indexes (rows in the list) ----------
  const indexes = [
    {
      id: 'md-maga', title: 'Maryland MAGA Index', kind: 'state', state: 'MD',
      score: 32.8, scoreType: 'score', heat: 33, contracts: 1150,
      tags: ['Maryland'], excs: ['coinbase','polymarket','metaculus','kalshi'], extras: 5,
    },
    {
      id: 'mi-question', title: 'Will the Democratic candidate win the 2026 Michigan gubernatorial race?',
      kind: 'question', state: 'MI', score: 58, scoreType: 'prob', heat: 70, contracts: 620,
      tags: ['Michigan','Governor'], excs: ['robinhood','metaculus','kalshi','manifold'], extras: 5,
    },
    {
      id: 'fl-maga', title: 'Florida MAGA Index', kind: 'state', state: 'FL',
      score: 72.8, scoreType: 'score', heat: 88, contracts: 440,
      tags: ['Florida'], excs: ['coinbase','predictit','metaculus','manifold'], extras: 5,
    },
    {
      id: 'ga-3p', title: "Will a third-party candidate receive more than 5% in the 2026 Georgia governor's race?",
      kind: 'question', state: 'GA', score: 88, scoreType: 'prob', heat: 5, contracts: 720,
      tags: ['Michigan','Governor'], excs: ['kalshi','polymarket','pinata','manifold'], extras: 5,
    },
    {
      id: 'md-hogan', title: 'Will incumbent Larry Hogan win re-election as governor of Maryland?',
      kind: 'question', state: 'MD', score: 42, scoreType: 'prob', heat: 65, contracts: 650,
      tags: ['Governor'], excs: ['kalshi','predictit','polymarket','robinhood'], extras: 5,
    },
    {
      id: 'pa-maga', title: 'Pennsylvania MAGA Index', kind: 'state', state: 'PA',
      score: 80, scoreType: 'score', heat: 80, contracts: 760,
      tags: ['Pennsylvania'], excs: ['kalshi','polymarket','metaculus','coinbase'], extras: 5,
    },
    {
      id: 'tx-gov', title: 'Texas Governor MAGA Index', kind: 'state', state: 'TX',
      score: 90, scoreType: 'score', heat: 92, contracts: 980,
      tags: ['Texas','Governor'], excs: ['polymarket','metaculus','coinbase','manifold'], extras: 5,
    },
  ];

  // ---------- Component contracts for a single PMI ----------
  const componentContracts = [
    { title: 'Will the Democratic candidate lead in <State> gubernatorial polling average in October 2026?', rel: 'Direct', exc: 'metaculus', volume: 28098, prob: 10.0 },
    { title: 'Will the Democratic candidate win Wayne County by ≥10% margin in the 2026 <State> gubernatorial election?', rel: 'Direct', exc: 'polymarket', volume: 22102, prob: 20.0 },
    { title: 'Will the Democratic Party have a lead in the generic <State> congressional ballot in October 2026?', rel: 'Indirect', exc: 'robinhood', volume: 1230, prob: 20.0 },
    { title: 'Will U.S. unemployment be below 5% in October 2026?', rel: 'Indirect', exc: 'kalshi', volume: 1125, prob: 20.0 },
  ];

  // ---------- 14-day time series (Mar 1 -> Mar 14) ----------
  // Generate a slightly noisy upward curve, end ≈ 93
  function makeSeries(seed = 1, end = 93, start = 40) {
    const out = [];
    let v = start;
    for (let i = 0; i < 28; i++) {
      const trend = (end - start) * (i / 27);
      // pseudo-noise
      const n = Math.sin(seed * (i + 1) * 1.7) * 6 + Math.cos(seed * (i + 1) * 0.9) * 3;
      out.push(Math.max(0, Math.min(100, start + trend + n)));
    }
    out[out.length - 1] = end;  // anchor end
    return out;
  }
  const series14 = makeSeries(1, 93, 40);

  // ---------- War Index holdings (Israel offensive question cards) ----------
  const warHoldings = [
    { exc: 'polymarket', title: 'Will Israel launch a major ground offensive in Lebanon by March 31?', rel: 'Indirect', volume: '$47.7M', yes: 100 },
    { exc: 'kalshi',     title: 'Will Israel launch a major ground offensive in Lebanon by March 31?', rel: 'Indirect', volume: '$47.7M', yes: 100 },
    { exc: 'robinhood',  title: 'Will Israel launch a major ground offensive in Lebanon by March 31?', rel: 'Indirect', volume: '$47.7M', yes: 100 },
    { exc: 'coinbase',   title: 'Will Israel launch a major ground offensive in Lebanon by March 31?', rel: 'Indirect', volume: '$47.7M', yes: 100 },
  ];

  // ---------- Northeast Corridor (right rail of map) ----------
  const northeast = ['VT','NH','MA','RI','CT','NJ','DE','MD','DC'];

  return { exchanges, states, indexes, componentContracts, series14, makeSeries, warHoldings, northeast };
})();
