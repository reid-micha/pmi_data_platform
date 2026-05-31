/* Micah — 2026 US Senate sample data.
 *
 * Each race carries:
 *   state        — 2-letter code (lookup into MICAH.states)
 *   inc          — incumbent party 'R' | 'D'
 *   incName      — short label (incumbent, "(ret.)" if retiring, "(special)" if appointed)
 *   matchup      — short candidate matchup string for the row body
 *   probR        — market-implied probability the seat goes Republican (0-100)
 *   d14          — 14-day Δ in probR (signed)
 *   volume       — $ traded in the past day across the holding contracts
 *   contracts    — count of component contracts
 *   excs         — list of exchange ids with live markets (subset)
 *
 * These are illustrative for the design — not a live forecast.
 */
window.MICAH_SENATE = (() => {
  const races = [
    // ---- Safe R (probR >= 90) ----
    { state: 'AL', inc: 'R', incName: 'Tuberville',         matchup: 'Tuberville (R) — open seat (gov run)', probR: 96, d14: +0.4, volume: 38000,  contracts: 22, excs: ['kalshi','polymarket','metaculus'] },
    { state: 'AR', inc: 'R', incName: 'Cotton',             matchup: 'Cotton (R) — no major challenger',     probR: 96, d14: -0.1, volume: 11000,  contracts: 9,  excs: ['kalshi','polymarket'] },
    { state: 'ID', inc: 'R', incName: 'Risch',              matchup: 'Risch (R) — no major challenger',      probR: 97, d14:  0.0, volume:  7000,  contracts: 5,  excs: ['kalshi','metaculus'] },
    { state: 'KS', inc: 'R', incName: 'Marshall',           matchup: 'Marshall (R) — no major challenger',   probR: 92, d14: -0.3, volume:  8000,  contracts: 7,  excs: ['kalshi','polymarket'] },
    { state: 'LA', inc: 'R', incName: 'Cassidy',            matchup: 'Cassidy (R) vs. Kennedy (R) primary',  probR: 90, d14: +1.2, volume: 14000,  contracts: 10, excs: ['kalshi','polymarket','predictit'] },
    { state: 'MS', inc: 'R', incName: 'Hyde-Smith',         matchup: 'Hyde-Smith (R) — no major challenger', probR: 90, d14: +0.2, volume:  9000,  contracts: 7,  excs: ['kalshi'] },
    { state: 'OK', inc: 'R', incName: 'Mullin',             matchup: 'Mullin (R) — no major challenger',     probR: 96, d14: -0.1, volume:  8000,  contracts: 6,  excs: ['kalshi','metaculus'] },
    { state: 'SD', inc: 'R', incName: 'Rounds',             matchup: 'Rounds (R) — no major challenger',     probR: 95, d14:  0.0, volume:  7000,  contracts: 5,  excs: ['kalshi'] },
    { state: 'TN', inc: 'R', incName: 'Hagerty',            matchup: 'Hagerty (R) — no major challenger',    probR: 92, d14: -0.2, volume: 11000,  contracts: 8,  excs: ['kalshi','polymarket'] },
    { state: 'WV', inc: 'R', incName: 'Capito',             matchup: 'Capito (R) — no major challenger',     probR: 94, d14: +0.1, volume:  9000,  contracts: 7,  excs: ['kalshi'] },
    { state: 'WY', inc: 'R', incName: 'Lummis',             matchup: 'Lummis (R) — no major challenger',     probR: 97, d14:  0.0, volume:  5000,  contracts: 4,  excs: ['kalshi'] },

    // ---- Likely R (75-89) ----
    { state: 'AK', inc: 'R', incName: 'Sullivan',           matchup: 'Sullivan (R) vs. Galvin (D)',          probR: 88, d14: -1.1, volume: 22000,  contracts: 14, excs: ['kalshi','polymarket','metaculus'] },
    { state: 'KY', inc: 'R', incName: 'McConnell (ret.)',   matchup: 'Cameron (R) vs. Beshear (D)',          probR: 78, d14: -2.4, volume: 41000,  contracts: 22, excs: ['kalshi','polymarket','predictit','metaculus'] },
    { state: 'MT', inc: 'R', incName: 'Daines',             matchup: 'Daines (R) vs. Bullock (D)',           probR: 84, d14: -0.8, volume: 28000,  contracts: 16, excs: ['kalshi','polymarket'] },
    { state: 'NE', inc: 'R', incName: 'Ricketts',           matchup: 'Ricketts (R) vs. Domina (D)',          probR: 88, d14: +0.3, volume: 11000,  contracts: 8,  excs: ['kalshi','polymarket'] },
    { state: 'SC', inc: 'R', incName: 'Graham',             matchup: 'Graham (R) vs. Cunningham (D)',        probR: 86, d14: -0.5, volume: 23000,  contracts: 15, excs: ['kalshi','polymarket','predictit'] },
    { state: 'TX', inc: 'R', incName: 'Cornyn',             matchup: 'Cornyn (R) vs. Paxton (R) primary',    probR: 78, d14: -3.7, volume:184000,  contracts: 72, excs: ['kalshi','polymarket','metaculus','manifold','predictit'], marquee: true },

    // ---- Toss-ups (41-59) — the headline races ----
    { state: 'NC', inc: 'R', incName: 'Tillis',             matchup: 'Tillis (R) vs. Cooper (D)',            probR: 53, d14: +1.8, volume:298000,  contracts:112, excs: ['kalshi','polymarket','metaculus','manifold','predictit','robinhood'], marquee: true },
    { state: 'IA', inc: 'R', incName: 'Ernst',              matchup: 'Ernst (R) vs. Franken (D)',            probR: 58, d14: -1.2, volume:112000,  contracts: 54, excs: ['kalshi','polymarket','metaculus','manifold'], marquee: true },
    { state: 'GA', inc: 'D', incName: 'Ossoff',             matchup: 'Ossoff (D) vs. Carter (R)',            probR: 52, d14: +2.1, volume:284000,  contracts: 98, excs: ['kalshi','polymarket','metaculus','manifold','coinbase'], marquee: true },
    { state: 'MI', inc: 'D', incName: 'Peters (ret.)',      matchup: 'Stevens (D) vs. Rogers (R)',           probR: 49, d14: +0.6, volume:262000,  contracts:104, excs: ['kalshi','polymarket','metaculus','robinhood'], marquee: true },
    { state: 'NH', inc: 'D', incName: 'Shaheen (ret.)',     matchup: 'Pappas (D) vs. Brown (R)',             probR: 47, d14: -0.4, volume:114000,  contracts: 52, excs: ['kalshi','polymarket','metaculus'], marquee: true },
    { state: 'OH', inc: 'R', incName: 'Husted (special)',   matchup: 'Husted (R) vs. Brown (D)',             probR: 46, d14: -2.6, volume:231000,  contracts: 94, excs: ['kalshi','polymarket','metaculus','manifold','coinbase'], marquee: true, special: true },
    { state: 'ME', inc: 'R', incName: 'Collins',            matchup: 'Collins (R) vs. Mills (D)',            probR: 46, d14: -1.0, volume:221000,  contracts: 87, excs: ['kalshi','polymarket','metaculus','manifold','predictit'], marquee: true },

    // ---- Lean D (26-40) ----
    { state: 'MN', inc: 'D', incName: 'Smith (ret.)',       matchup: 'Flanagan (D) vs. Schultz (R)',         probR: 36, d14: +0.9, volume: 64000,  contracts: 38, excs: ['kalshi','polymarket','metaculus'] },
    { state: 'VA', inc: 'D', incName: 'Warner',             matchup: 'Warner (D) vs. Youngkin (R)',          probR: 28, d14: +3.1, volume: 92000,  contracts: 42, excs: ['kalshi','polymarket','metaculus','manifold'] },

    // ---- Likely D (11-25) ----
    { state: 'CO', inc: 'D', incName: 'Hickenlooper',       matchup: 'Hickenlooper (D) vs. Ganahl (R)',      probR: 18, d14: +0.4, volume: 51000,  contracts: 28, excs: ['kalshi','polymarket'] },
    { state: 'NJ', inc: 'D', incName: 'Booker',             matchup: 'Booker (D) — no major challenger',     probR: 14, d14: -0.2, volume: 22000,  contracts: 16, excs: ['kalshi','polymarket'] },
    { state: 'NM', inc: 'D', incName: 'Luján',              matchup: 'Luján (D) — no major challenger',      probR: 22, d14: +0.1, volume: 14000,  contracts: 11, excs: ['kalshi'] },

    // ---- Safe D (<= 10) ----
    { state: 'DE', inc: 'D', incName: 'Coons',              matchup: 'Coons (D) — no major challenger',      probR:  6, d14:  0.0, volume:  9000,  contracts: 6,  excs: ['kalshi'] },
    { state: 'IL', inc: 'D', incName: 'Durbin (ret.)',      matchup: 'Krishnamoorthi (D) vs. open R',        probR: 10, d14: -0.4, volume: 38000,  contracts: 23, excs: ['kalshi','polymarket','manifold'] },
    { state: 'MA', inc: 'D', incName: 'Markey',             matchup: 'Markey (D) — no major challenger',     probR:  5, d14:  0.0, volume: 12000,  contracts: 9,  excs: ['kalshi'] },
    { state: 'OR', inc: 'D', incName: 'Merkley',            matchup: 'Merkley (D) — no major challenger',    probR: 14, d14: +0.2, volume: 13000,  contracts: 10, excs: ['kalshi'] },
    { state: 'RI', inc: 'D', incName: 'Reed',               matchup: 'Reed (D) — no major challenger',       probR:  8, d14:  0.0, volume:  7000,  contracts: 5,  excs: ['kalshi'] },
  ];

  // -------- categorize --------
  // probR thresholds (mirrors PMI heat scale bands)
  function bandOf(p) {
    if (p <= 10) return 'safe-d';
    if (p <= 25) return 'likely-d';
    if (p <= 40) return 'lean-d';
    if (p <  60) return 'tossup';
    if (p <  75) return 'lean-r';
    if (p <  90) return 'likely-r';
    return 'safe-r';
  }
  races.forEach(r => r.band = bandOf(r.probR));

  // -------- pre-2026 holdover seats (NOT on the ballot this cycle) --------
  // Senate 2024 → R 53, D 47.  Of those, our races include 21 R and 13 D up for re-election.
  // Therefore holdover R = 53 - 21 = 32, holdover D = 47 - 13 = 34.
  const holdover = { R: 32, D: 34 };

  // -------- seat balance counts (all 100 seats, including holdover) --------
  const counts = { 'safe-d':0, 'likely-d':0, 'lean-d':0, 'tossup':0, 'lean-r':0, 'likely-r':0, 'safe-r':0 };
  races.forEach(r => { counts[r.band] += 1; });
  counts['safe-d'] += holdover.D;
  counts['safe-r'] += holdover.R;

  // Bookkeeping: "in the bag" totals (everything except tossup, attributed to expected winner)
  const dSecured =
    counts['safe-d'] + counts['likely-d'] + counts['lean-d'];
  const rSecured =
    counts['safe-r'] + counts['likely-r'] + counts['lean-r'];
  const tossups = counts['tossup'];

  // -------- top-line PMI for the Senate index --------
  // Aggregate prob of R holding 51+ seats — derived in pmi-model from individual race probs
  // (we hard-code an illustrative number here so the design works standalone).
  const pmiGOPMajority = 84.2;
  const pmiDemMajority = 15.8;

  // 14-day series of P(R ≥ 51) — climbs slightly over the window
  const series14 = (window.MICAH && window.MICAH.makeSeries)
    ? window.MICAH.makeSeries(7, 84, 73)
    : Array.from({length:28}, (_,i) => 73 + (84-73) * (i/27));

  // Top toss-up rail (sorted by closest-to-50)
  const tossupRail = races
    .filter(r => r.band === 'tossup')
    .slice()
    .sort((a,b) => Math.abs(a.probR - 50) - Math.abs(b.probR - 50));

  // Marquee table-rows (rendered as PMIRows beneath the chart)
  const marquee = races.filter(r => r.marquee).slice().sort((a,b) => Math.abs(a.probR - 50) - Math.abs(b.probR - 50));

  // Map of state -> probR for the choropleth (states without a 2026 race omitted)
  const raceByState = Object.fromEntries(races.map(r => [r.state, r]));
  const probByState = Object.fromEntries(races.map(r => [r.state, r.probR]));

  return {
    races,
    raceByState,
    probByState,
    counts,
    holdover,
    dSecured,
    rSecured,
    tossups,
    pmiGOPMajority,
    pmiDemMajority,
    series14,
    tossupRail,
    marquee,
    bandOf,
  };
})();
