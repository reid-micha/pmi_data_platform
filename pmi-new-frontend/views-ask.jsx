/* AskView — the AI-native counter-design.
   Keeps Micah brand DNA (serif, warm paper, heat scale, exchange chips)
   but rebuilds interaction around natural-language Q&A, AI-synthesized
   narratives, citation chips, and AI-surfaced spotlights. */

const { useState: askState, useEffect: askEffect, useRef: askRef } = React;

// ---------- AI helper — wraps window.claude.complete with safe fallback ---
async function askClaude(prompt, fallback) {
  try {
    if (!window.claude || !window.claude.complete) return fallback;
    const out = await window.claude.complete(prompt);
    return (out || '').trim() || fallback;
  } catch (e) {
    console.warn('claude failed', e);
    return fallback;
  }
}

// ---------- Streaming-text effect (reveals tokens word by word) ----------
function useStreamingText(text, speedMs = 18) {
  const [out, setOut] = askState('');
  askEffect(() => {
    setOut('');
    if (!text) return;
    const words = text.split(/(\s+)/);  // keep whitespace
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setOut(words.slice(0, i).join(''));
      if (i >= words.length) clearInterval(id);
    }, speedMs);
    return () => clearInterval(id);
  }, [text]);
  return out;
}

// ---------- Sparkle icon (the "AI" mark — used very sparingly) ----------
function Sparkle({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3 L13.6 9.2 L20 11 L13.6 12.8 L12 19 L10.4 12.8 L4 11 L10.4 9.2 Z" fill={color}/>
      <path d="M19 3 L19.8 5.4 L22 6 L19.8 6.6 L19 9 L18.2 6.6 L16 6 L18.2 5.4 Z" fill={color} opacity=".55"/>
    </svg>
  );
}

// ---------- Live thinking dots ----------
function ThinkingDots() {
  return (
    <span className="thinking-dots" aria-label="thinking">
      <span></span><span></span><span></span>
    </span>
  );
}

// ---------- Cited contract chip (small footnote-style citation) ----------
function CiteChip({ n, exc, label, onClick }) {
  return (
    <button className="cite-chip" onClick={onClick} title={label}>
      <sup className="cite-chip__n">[{n}]</sup>
      <ExchangeChip id={exc} size={18} />
      <span className="cite-chip__label">{label}</span>
    </button>
  );
}

// ---------- Probability dial — heat-scaled radial gauge ----------
function ProbDial({ value = 50, size = 140, label = 'Composite probability' }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  const color = window.heatColor(value);
  const sw = 14;
  return (
    <div className="prob-dial" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} stroke="var(--surface-rule)" strokeWidth={sw} fill="none" />
        <circle cx={size/2} cy={size/2} r={r}
          stroke={color} strokeWidth={sw} fill="none"
          strokeDasharray={c} strokeDashoffset={off}
          strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(.2,.7,.2,1), stroke .8s' }} />
      </svg>
      <div className="prob-dial__center">
        <div className="prob-dial__value">{Math.round(value)}<small>%</small></div>
        <div className="prob-dial__label">{label}</div>
      </div>
    </div>
  );
}

// ---------- Confidence bar ----------
function ConfidenceBar({ low, mid, high }) {
  const minV = Math.max(0, Math.min(low, high) - 6);
  const maxV = Math.min(100, Math.max(low, high) + 6);
  const span = maxV - minV;
  const lp = ((low - minV) / span) * 100;
  const hp = ((high - minV) / span) * 100;
  const mp = ((mid - minV) / span) * 100;
  return (
    <div className="conf-bar">
      <div className="conf-bar__head t-label">
        <span>{low}%</span>
        <span style={{ fontWeight: 600, color: 'var(--ink-1)' }}>{mid}% est.</span>
        <span>{high}%</span>
      </div>
      <div className="conf-bar__track">
        <div className="conf-bar__band" style={{ left: lp + '%', width: (hp - lp) + '%' }} />
        <div className="conf-bar__mark" style={{ left: mp + '%' }} />
      </div>
      <div className="conf-bar__foot t-label">90% confidence interval · derived from 4 sources</div>
    </div>
  );
}

// ---------- Today brief block (the editorial opener) ----------
function TodayBrief() {
  const [headline, setHeadline] = askState('Markets pull right as gubernatorial bets concentrate in three Sun-Belt races.');
  const [lead, setLead] = askState(
    'The National MAGA Index closed at 93 yesterday — its highest reading in 14 days — pushed up by a surge in Texas and Florida governor contracts. Contrarian volume is consolidating around a single Georgia third-party question. Recession contracts on Kalshi remain flat.'
  );
  const [loading, setLoading] = askState(false);

  async function regen() {
    setLoading(true);
    const h = await askClaude(
      'In one short editorial sentence (under 18 words, no quotes), write the lead headline for a prediction-market dashboard on May 28, 2026. The MAGA Index is 93, near its 14-day high, with Texas and Florida governor contracts driving the rise.',
      headline
    );
    const l = await askClaude(
      'In 2-3 short editorial sentences, summarize today on a prediction-market aggregator: MAGA Index 93 (14d high), driven by TX & FL governor contracts; volume consolidating in a Georgia third-party question; Kalshi recession contracts flat. Neutral analytical tone. Plain text, no markdown.',
      lead
    );
    setHeadline(h); setLead(l); setLoading(false);
  }

  const streamedH = useStreamingText(headline, 14);
  const streamedL = useStreamingText(lead, 10);

  return (
    <div className="brief">
      <div className="brief__head">
        <span className="t-eyebrow">TODAY · MAY 28 · LIVE</span>
        <button className="text-btn" onClick={regen} disabled={loading}>
          <Sparkle size={12} /> {loading ? 'Regenerating…' : 'Regenerate'}
        </button>
      </div>
      <h1 className="brief__head-line t-display">{streamedH}</h1>
      <p className="brief__lead t-body">{streamedL}</p>
      <div className="brief__sources">
        <span className="t-label" style={{ marginRight: 8 }}>Synthesized from</span>
        <ExchangeStack ids={['polymarket','kalshi','robinhood','metaculus','coinbase']} extras={6} size={20} />
      </div>
    </div>
  );
}

// ---------- The Composer (the AI prompt input) ----------
function Composer({ onSubmit, busy }) {
  const [val, setVal] = askState('');
  const examples = [
    'How likely is a recession before Q4 2026?',
    'Will Trump pardon any Jan 6 defendants this year?',
    'Build a Sun-Belt governors index',
    'What moved the MAGA Index in the last week?',
  ];
  function go(q) {
    if (busy) return;
    const t = (q ?? val).trim();
    if (!t) return;
    setVal(t);
    onSubmit(t);
  }
  return (
    <div className="composer">
      <div className="composer__row">
        <span className="composer__icon"><Sparkle size={18} color="var(--ink-2)" /></span>
        <input
          className="composer__input"
          value={val}
          onChange={e => setVal(e.target.value)}
          placeholder="Ask Micah anything — type a question or describe an index…"
          onKeyDown={e => { if (e.key === 'Enter') go(); }}
        />
        <button className="composer__send" onClick={() => go()} disabled={busy}>
          {busy ? <ThinkingDots /> : <>Ask <span style={{opacity:.6}}>↵</span></>}
        </button>
      </div>
      <div className="composer__examples">
        {examples.map(e => (
          <button key={e} className="example-pill" onClick={() => go(e)} disabled={busy}>{e}</button>
        ))}
      </div>
    </div>
  );
}

// ---------- The Answer card (after the user asks) ----------
function AnswerCard({ question, onClose }) {
  const [phase, setPhase] = askState('thinking');  // thinking | ready | error
  const [data, setData] = askState(null);
  const [followups, setFollowups] = askState([]);

  askEffect(() => {
    let alive = true;
    setPhase('thinking'); setData(null); setFollowups([]);

    (async () => {
      // Ask Claude for a structured JSON answer
      const prompt = `You are Micah, a prediction-markets aggregator. The user asked: "${question}".
Respond ONLY with strict JSON (no prose, no markdown fences). The schema is:
{
  "title": "<a short rephrased headline-form version of the question, max 14 words>",
  "probability": <integer 0-100, the composite likelihood>,
  "low": <integer 0-100>, "high": <integer 0-100>,  // a 90% CI band
  "summary": "<one-paragraph 60-90 word neutral analytical summary in plain prose>",
  "drivers": [ "<short driver 1 (under 14 words)>", "<driver 2>", "<driver 3>" ],
  "citations": [
    { "n": 1, "exc": "polymarket", "title": "<short contract title>" },
    { "n": 2, "exc": "kalshi", "title": "<short contract title>" },
    { "n": 3, "exc": "metaculus", "title": "<short contract title>" }
  ],
  "followups": [ "<followup q 1>", "<followup q 2>", "<followup q 3>" ]
}
The "exc" field must be one of: polymarket, kalshi, robinhood, metaculus, coinbase, manifold, predictit.
Be analytical and neutral. Do not invent specific real-person quotes.`;

      const fallback = JSON.stringify({
        title: 'Composite likelihood for the user question',
        probability: 38, low: 28, high: 49,
        summary: 'Aggregated market signal suggests modest probability. Direct contracts on Polymarket and Kalshi are trading in the high-30s, while indirect contracts on Metaculus skew slightly lower. Volume is concentrated in a small number of high-conviction contracts, so the composite reading is somewhat sensitive to single-source moves.',
        drivers: [
          'Polymarket direct contract trading at 41% with $2.1M open interest',
          'Kalshi short-dated proxy at 35%, mild upward drift over 7 days',
          'Metaculus community forecast diverging downward (28%)'
        ],
        citations: [
          { n: 1, exc: 'polymarket', title: 'Direct outcome contract — May resolution' },
          { n: 2, exc: 'kalshi',     title: 'Short-dated proxy market'                },
          { n: 3, exc: 'metaculus',  title: 'Community forecast (1y horizon)'         },
          { n: 4, exc: 'robinhood',  title: 'Adjacent macro question'                 },
        ],
        followups: [
          'How has the probability moved over the last 14 days?',
          'Which contract has the highest single-source weight?',
          'What would need to happen for this to cross 50%?'
        ]
      });

      const raw = await askClaude(prompt, fallback);
      if (!alive) return;
      let parsed = null;
      try { parsed = JSON.parse(raw); }
      catch { try { parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]); } catch { parsed = JSON.parse(fallback); } }
      // ensure ints
      parsed.probability = Math.max(0, Math.min(100, Math.round(parsed.probability || 50)));
      parsed.low  = Math.max(0, Math.min(100, Math.round(parsed.low  ?? parsed.probability - 10)));
      parsed.high = Math.max(0, Math.min(100, Math.round(parsed.high ?? parsed.probability + 10)));
      setData(parsed);
      setFollowups(parsed.followups || []);
      setPhase('ready');
    })();

    return () => { alive = false; };
  }, [question]);

  const summary = useStreamingText(data?.summary || '', 8);

  return (
    <div className="answer">
      <div className="answer__head">
        <div className="answer__q">
          <Sparkle size={14} color="var(--ink-3)" />
          <span className="t-label" style={{ marginLeft: 6 }}>YOU ASKED</span>
        </div>
        <button className="text-btn" onClick={onClose}>Close ✕</button>
      </div>
      <div className="answer__qtext t-h3">{question}</div>

      {phase === 'thinking' && (
        <div className="answer__loading">
          <ThinkingDots />
          <span className="t-label" style={{marginLeft:10}}>Pulling contracts across 11 exchanges…</span>
        </div>
      )}

      {phase === 'ready' && data && (
        <div className="answer__body">
          <div className="answer__left">
            <div className="t-label" style={{textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8}}>
              COMPOSITE PMI
            </div>
            <ProbDial value={data.probability} label="probability" />
            <div style={{ marginTop: 14 }}>
              <ConfidenceBar low={data.low} mid={data.probability} high={data.high} />
            </div>
          </div>
          <div className="answer__right">
            <div className="answer__rephrased t-h3">{data.title}</div>
            <p className="answer__summary t-body">{summary || data.summary}</p>

            <div className="answer__drivers">
              <div className="t-label" style={{textTransform:'uppercase',letterSpacing:'.08em',marginBottom:6}}>WHAT'S DRIVING IT</div>
              <ul>
                {(data.drivers || []).map((d, i) => (
                  <li key={i}><span className="bullet">→</span> {d}</li>
                ))}
              </ul>
            </div>

            <div className="answer__cites">
              <div className="t-label" style={{textTransform:'uppercase',letterSpacing:'.08em',marginBottom:6}}>SOURCES</div>
              <div className="cite-chip-row">
                {(data.citations || []).map(c => (
                  <CiteChip key={c.n} n={c.n} exc={c.exc} label={c.title} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {phase === 'ready' && followups.length > 0 && (
        <div className="answer__followups">
          <span className="t-label" style={{textTransform:'uppercase',letterSpacing:'.08em',marginRight:8}}>FOLLOW UP</span>
          {followups.map(f => (
            <button key={f} className="example-pill" onClick={() => { setData(null); setPhase('thinking'); window.dispatchEvent(new CustomEvent('askMicah', { detail: f })); }}>
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Spotlights — AI-surfaced anomalies & insights ----------
function Spotlights() {
  const items = [
    {
      kind: 'Anomaly',
      icon: '↑',
      tone: 'red',
      headline: 'Florida MAGA Index +5.4 in 24h',
      body: 'Driven by a single Polymarket contract on the 2026 gubernatorial primary that added $1.8M of open interest overnight.',
      excs: ['polymarket','kalshi'],
      heat: 86,
    },
    {
      kind: 'Correlation',
      icon: '⇄',
      tone: 'neutral',
      headline: 'TX & FL Gov moving together',
      body: 'Correlation between Texas and Florida governor contracts has tightened to r=0.81 over the last week, the highest since Feb.',
      excs: ['polymarket','metaculus','robinhood'],
      heat: 50,
    },
    {
      kind: 'Volume',
      icon: '⇡',
      tone: 'blue',
      headline: 'Surge in GA third-party question',
      body: '720 new contracts in 48h on the Georgia third-party threshold question. PMI Probability ticked from 81% to 88%.',
      excs: ['kalshi','manifold'],
      heat: 12,
    },
  ];
  return (
    <section className="spotlights">
      <div className="row-between">
        <h2 className="t-h2" style={{ fontSize: 28 }}>
          <Sparkle size={18} color="var(--ink-1)" /> &nbsp; Surfaced for you
        </h2>
        <span className="t-label">Auto-curated · refreshes every 6 h</span>
      </div>
      <div className="spotlights__grid">
        {items.map((s, i) => (
          <div key={i} className={`spot spot--${s.tone}`}>
            <div className="spot__head">
              <span className="spot__kind">{s.icon} &nbsp;{s.kind}</span>
              <span className="spot__heat" style={{ background: window.heatColor(s.heat) }} />
            </div>
            <h3 className="spot__h">{s.headline}</h3>
            <p className="spot__body t-body-sm">{s.body}</p>
            <div className="spot__foot">
              <ExchangeStack ids={s.excs} extras={2} size={20} />
              <button className="text-btn">Explain →</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- Build-your-own PMI (NL composer) ----------
function CustomPMI() {
  const [theme, setTheme] = askState('');
  const [busy, setBusy]   = askState(false);
  const [out, setOut]     = askState(null);

  async function build() {
    if (!theme.trim() || busy) return;
    setBusy(true);
    const prompt = `You compose Micah prediction-market indexes from a theme. The theme is: "${theme}".
Output ONLY strict JSON (no markdown):
{
  "name": "<3-5 word index name>",
  "tagline": "<one sentence 12-20 words explaining what it tracks>",
  "components": [
    {"exc":"polymarket","weight":<int 0-100>,"title":"<short contract title>"},
    {"exc":"kalshi",    "weight":<int 0-100>,"title":"<short contract title>"},
    {"exc":"metaculus", "weight":<int 0-100>,"title":"<short contract title>"},
    {"exc":"robinhood", "weight":<int 0-100>,"title":"<short contract title>"}
  ],
  "score": <int 0-100>
}
Weights sum to 100. exc values: polymarket, kalshi, robinhood, metaculus, coinbase, manifold, predictit.`;
    const fb = JSON.stringify({
      name: 'Themed Composite',
      tagline: 'Aggregates relevant contracts into a single tracked probability for the requested theme.',
      components: [
        { exc:'polymarket', weight:35, title:'Direct outcome contract'      },
        { exc:'kalshi',     weight:25, title:'Short-dated proxy market'     },
        { exc:'metaculus',  weight:20, title:'Long-horizon community forecast' },
        { exc:'robinhood',  weight:20, title:'Adjacent macro question'      },
      ],
      score: 42,
    });
    const raw = await askClaude(prompt, fb);
    let parsed; try { parsed = JSON.parse(raw); } catch { try { parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]); } catch { parsed = JSON.parse(fb); } }
    setOut(parsed);
    setBusy(false);
  }

  return (
    <section className="custom-pmi">
      <div className="row-between">
        <h2 className="t-h2" style={{ fontSize: 28 }}>
          <Sparkle size={18} color="var(--ink-1)" /> &nbsp; Compose your own index
        </h2>
      </div>
      <p className="t-body" style={{ maxWidth: 700, marginTop: 6 }}>
        Describe a theme. Micah picks the contracts, weights them by relevance and volume, and gives you a single tracked probability.
      </p>

      <div className="composer" style={{ marginTop: 16 }}>
        <div className="composer__row">
          <input
            className="composer__input"
            placeholder="e.g. AI regulation by 2027 · Sun-Belt governorships · Fed cuts to 3.5%"
            value={theme}
            onChange={e => setTheme(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') build(); }}
          />
          <button className="composer__send" onClick={build} disabled={busy || !theme.trim()}>
            {busy ? <ThinkingDots /> : <>Compose</>}
          </button>
        </div>
      </div>

      {out && (
        <div className="custom-pmi__out">
          <div className="custom-pmi__head">
            <div>
              <div className="t-eyebrow">YOUR INDEX</div>
              <h3 className="t-h2" style={{ fontSize: 32, marginTop: 4 }}>{out.name}</h3>
              <p className="t-body" style={{ maxWidth: 600 }}>{out.tagline}</p>
            </div>
            <ProbDial value={out.score} size={120} label="composite" />
          </div>
          <div className="custom-pmi__components">
            {out.components.map((c, i) => (
              <div key={i} className="cpmi-row">
                <ExchangeChip id={c.exc} size={26} />
                <span className="cpmi-row__title">{c.title}</span>
                <span className="cpmi-row__weight-bar">
                  <span style={{ width: c.weight + '%', background: 'var(--ink-1)' }} />
                </span>
                <span className="cpmi-row__weight t-label">{c.weight}%</span>
              </div>
            ))}
          </div>
          <div className="custom-pmi__cta">
            <button className="text-btn">Save as PMI</button>
            <button className="text-btn">Add alerts</button>
            <button className="text-btn">Share</button>
          </div>
        </div>
      )}
    </section>
  );
}

// ============================================================
// AskView — main composition
// ============================================================
function AskView({ onNavigate }) {
  const [question, setQuestion] = askState(null);
  const [busy, setBusy] = askState(false);

  // listen for follow-up triggers from the AnswerCard
  askEffect(() => {
    const h = (ev) => setQuestion(ev.detail);
    window.addEventListener('askMicah', h);
    return () => window.removeEventListener('askMicah', h);
  }, []);

  function handleAsk(q) {
    setQuestion(q);
    // scroll to answer
    setTimeout(() => {
      const el = document.querySelector('.answer');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  return (
    <div className="view ask-view">
      <CropFrame>
        <TodayBrief />

        <div className="ask-block">
          <Composer onSubmit={handleAsk} busy={busy} />
          {question && (
            <AnswerCard question={question} onClose={() => setQuestion(null)} />
          )}
        </div>

        <Spotlights />

        <CustomPMI />
      </CropFrame>
    </div>
  );
}

Object.assign(window, { AskView });
