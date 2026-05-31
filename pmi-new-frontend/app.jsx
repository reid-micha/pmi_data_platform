/* App router — switches between views */

const { useState: aState } = React;

function App() {
  const [route, setRoute] = aState({ view: 'world' });

  // Top-level navigation chrome (so user can jump views)
  const screens = [
    { view: 'ask',                  label: '✦ Ask Micah (AI-native)', accent: 'ai' },
    { view: 'pro',                  label: '◰ Research Desk',         accent: 'pro' },
    { view: 'pro-analyst',          label: 'A · Analyst density',     accent: 'pro2' },
    { view: 'pro-micro',            label: 'B · PMI Simulator',       accent: 'pro2' },
    { view: 'world',                label: 'World · MAGA' },
    { view: 'world-caps',           label: 'World · serif caps' },
    { view: 'world-chart',          label: 'World · 14-Day' },
    { view: 'senate',               label: '2026 Senate', accent: 'pro3' },
    { view: 'state', state: 'MD',   label: 'State · MD' },
    { view: 'state', state: 'TX',   label: 'State · TX Gov' },
    { view: 'question', id: 'mi-question', label: 'Question · MI' },
    { view: 'question-empty', id: 'mi-question', label: 'Question · No Data' },
    { view: 'war',                  label: 'War Index' },
  ];

  const v = route.view;
  const brand = v.endsWith('caps') ? 'caps' : 'normal';

  return (
    <div className="app">
      <Header
        title={v === 'war' ? 'The War Index' : 'MAGA Index'}
        onNavigate={setRoute}
      />

      {/* In-prototype screen switcher (above the content) */}
      <nav className="screen-nav">
        <div className="screen-nav__inner">
          <span className="t-label">VIEW:</span>
          {screens.map(s => {
            const key = s.view + (s.state || '') + (s.id || '');
            const active = key === (route.view + (route.state || '') + (route.id || ''));
            return (
              <button
                key={key}
                className={`screen-nav__btn ${active ? 'is-active' : ''} ${s.accent === 'ai' ? 'screen-nav__btn--ai' : ''} ${s.accent === 'pro' ? 'screen-nav__btn--pro' : ''} ${s.accent === 'pro2' ? 'screen-nav__btn--pro2' : ''} ${s.accent === 'pro3' ? 'screen-nav__btn--pro3' : ''}`}
                onClick={() => setRoute({ view: s.view, state: s.state, id: s.id })}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="app__main">
        {v === 'ask' &&
          <AskView onNavigate={setRoute} />}
        {v === 'pro' &&
          <ProView />}
        {v === 'pro-analyst' &&
          <ProViewAnalyst brand={brand} />}
        {v === 'pro-micro' &&
          <ProViewMicro brand={brand} />}
        {(v === 'world' || v === 'world-caps') &&
          <WorldView brand={brand} onNavigate={setRoute} />}
        {v === 'world-chart' &&
          <WorldView brand={brand} onNavigate={setRoute} _forceChart />}
        {v === 'state' &&
          <StateView stateCode={route.state || 'MD'} brand={brand} onNavigate={setRoute} showTooltips={false} />}
        {v === 'question' &&
          <QuestionView id={route.id} brand={brand} onNavigate={setRoute} />}
        {v === 'question-empty' &&
          <QuestionView id={route.id} brand={brand} onNavigate={setRoute} noData />}
        {v === 'war' &&
          <WarIndexView onNavigate={setRoute} />}
        {v === 'senate' &&
          <SenateView onNavigate={setRoute} brand={brand} />}
      </main>

      <Footer title={v === 'war' ? 'The War Index' : 'MAGA Index'} />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
