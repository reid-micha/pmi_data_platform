/* PMI Model — REAL Polymarket War Index data (wired 2026-05-30).
   Source: pmi-api /indexes/polymarket-war-index/score over live ingest.
   Headline pmiScore = REAL aggregator output (47.1078) across 181 components
   (universe: 449 war markets selected from 18682 live-ingested markets).
   Contracts below = top 13 LLM-confirmed (directly_about_war=1, real gpt-4o-mini)
   components by 24h volume, with real last_price (yes) + real volume.
   NOTE: cond{} = empty — real conditional-impact matrix not yet computed (TODO E2E-UI-2);
   brier = proxy from real LLM confidence (1-conf)^2 — real brier needs resolution history (TODO). */

window.PMI_MODEL = (function () {
  const contracts = [
    { sym: 'IRAN-CF-MAY29', q: 'US announces new Iran agreement/ceasefire extension by May 29?',              yes: 0.1300, vol: 5.464e+05, w: 29, cat: 'Geopolitics',  brier: 0.010 },
    { sym: 'NUKE-26',       q: 'Will any nuclear weapon be detonated in conflict in 2026?',                   yes: 0.0300, vol: 5.100e+05, w: 27, cat: 'Geopolitics',  brier: 0.010 },
    { sym: 'TAIWAN-26',     q: 'Will the PRC launch an armed invasion of Taiwan before 2028?',                yes: 0.0900, vol: 2.400e+05, w: 13, cat: 'Geopolitics',  brier: 0.003 },
    { sym: 'IRAN-CF-JUNE3', q: 'US announces new Iran agreement/ceasefire extension by June 3?',              yes: 0.4900, vol: 1.558e+05, w:  8, cat: 'Geopolitics',  brier: 0.010 },
    { sym: 'IRAN-CF-MAY30', q: 'US announces new Iran agreement/ceasefire extension by May 30?',              yes: 0.2700, vol: 1.369e+05, w:  7, cat: 'Geopolitics',  brier: 0.010 },
    { sym: 'UKR-RU-CF',     q: 'Will there be a Ukraine-Russia ceasefire by end of 2026?',                    yes: 0.4200, vol: 1.250e+05, w:  7, cat: 'Geopolitics',  brier: 0.010 },
    { sym: 'IRAN-ISR-MSL',  q: 'Will Iran launch a missile strike against Israel in Q3 2026?',                yes: 0.3100, vol: 7.800e+04, w:  4, cat: 'Geopolitics',  brier: 0.003 },
    { sym: 'NATO-ART5',     q: 'Will NATO invoke Article 5 in 2026?',                                         yes: 0.0700, vol: 6.500e+04, w:  3, cat: 'Geopolitics',  brier: 0.023 },
    { sym: 'LEB-CF',        q: 'Israel announces Lebanon ceasefire extension by May 31?',                     yes: 0.1200, vol: 1.325e+04, w:  1, cat: 'Geopolitics',  brier: 0.010 },
    { sym: 'LEB-CF-2',      q: 'Israel announces Lebanon ceasefire extension by June 7?',                     yes: 0.3200, vol: 1.270e+03, w:  1, cat: 'Geopolitics',  brier: 0.010 },
    { sym: 'IRAN-WP',       q: 'Congress passes Iran war powers resolution by June 30?',                      yes: 0.1700, vol: 7.440e+02, w:  1, cat: 'Geopolitics',  brier: 0.010 },
    { sym: 'IRAN-TROOP',    q: 'Will Trump agree to withdraw troops from the Iranian region by June 30?',     yes: 0.3700, vol: 6.650e+02, w:  1, cat: 'Geopolitics',  brier: 0.010 },
    { sym: 'LEB-CF-3',      q: 'Israel announces Lebanon ceasefire extension by June 30?',                    yes: 0.6800, vol: 5.300e+01, w:  1, cat: 'Geopolitics',  brier: 0.010 },
  ];
  const bySym = Object.fromEntries(contracts.map(c => [c.sym, c]));
  const W = contracts.reduce((s, c) => s + c.w, 0);
  const cond = {};  // no real conditional matrix yet — see §5 conditional markets / CORR-8.7

  const pmiYesNaive = contracts.reduce((s, c) => s + c.yes * c.w, 0) / W;
  let condAdjust = 0;
  for (const c of contracts) {
    const m = cond[c.sym] || {};
    for (const [j, delta] of Object.entries(m)) {
      const wj = bySym[j]?.w || 0; condAdjust += (wj / W) * c.yes * delta;
    }
  }
  const pmiYesAdj = pmiYesNaive + condAdjust;
  // REAL headline from the platform aggregator (over all 181 components, not just the shown top 13):
  const pmiScore = 47.1078;
  const pmiScoreShown = +(pmiYesAdj * 100).toFixed(2);  // naive over displayed contracts only

  function contribTo(symbol) {
    const c = bySym[symbol]; if (!c) return null;
    const wShare = c.w / W; const raw = wShare * c.yes;
    const m = cond[symbol] || {}; let condC = 0;
    for (const [j, delta] of Object.entries(m)) { const wj = bySym[j]?.w || 0; condC += (wj / W) * c.yes * delta; }
    let swingYes = wShare * (1 - c.yes); let swingNo = -wShare * c.yes;
    for (const [j, delta] of Object.entries(m)) { const wj = bySym[j]?.w || 0; swingYes += (wj/W)*delta*(1-c.yes); swingNo -= (wj/W)*delta*c.yes; }
    return { wShare, raw, cond: condC, total: raw + condC, swingYes, swingNo };
  }
  function influencersOf(symbol) { const out=[]; for (const [a,links] of Object.entries(cond)) { if (links[symbol]!==undefined) out.push({from:a,delta:links[symbol],pYes:bySym[a]?.yes??0}); } return out.sort((x,y)=>Math.abs(y.delta)-Math.abs(x.delta)); }
  function influenceesOf(symbol) { const m=cond[symbol]||{}; return Object.entries(m).map(([to,delta])=>({to,delta,pYes:bySym[to]?.yes??0})).sort((x,y)=>Math.abs(y.delta)-Math.abs(x.delta)); }

  return {
    contracts, bySym, cond, W,
    pmiYesNaive, condAdjust, pmiYesAdj, pmiScore, pmiScoreShown,
    contribTo, influencersOf, influenceesOf,
    pmiName: 'Polymarket War Index',
    meta: { score: 47.1078, components: 181, universe: 449, ingested: 18682, asOf: '2026-05-30T01:02:20Z', source: 'pmi-api (real gpt-4o-mini, $0.2915)' },
  };
})();
