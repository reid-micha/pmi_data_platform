import { useEffect, useState } from 'react';
import { Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import AlertToast from './components/shared/AlertToast';
import { StagingGoogleSsoAuth } from './components/staging/StagingGoogleSsoAuth';
import AdminPrompts from './pages/AdminPrompts';
import AuthCallback from './pages/AuthCallback';
import Country from './pages/Country';
import Home from './pages/Home';
import MagaQuestionDetail from './pages/MagaQuestionDetail';
import MagaChamberState from './pages/MagaChamberState';
import MagaState from './pages/MagaState';
import Question from './pages/Question';
import RegionPage from './pages/RegionPage';
import SearchResult from './pages/SearchResult';
import { initAnalytics, trackPageView } from './utils/analytics';
import { hasWarIndexAuthTokenCookie } from './utils/authCookie';
import { isStagingEnvEnabled } from './utils/env';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function AnalyticsTracker() {
  const { pathname, search, hash } = useLocation();
  const isStaging = isStagingEnvEnabled();

  useEffect(() => {
    if (isStaging) return;
    initAnalytics();
  }, [isStaging]);

  useEffect(() => {
    if (isStaging) return;
    trackPageView(`${pathname}${search}${hash}`);
  }, [isStaging, pathname, search, hash]);

  return null;
}

function App() {
  const location = useLocation();
  const isAuthCallbackRoute = location.pathname === '/auth/callback';

  const [toast, setToast] = useState('');
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      setToast(error);
    }
  }, [searchParams]);

  // Staging gate: Google SSO (see StagingGoogleSsoAuth); skip on OAuth callback route.
  if (isStagingEnvEnabled() && !hasWarIndexAuthTokenCookie() && !isAuthCallbackRoute) {
    return (
      <div className="min-h-screen bg-bg-dark-primary flex items-center justify-center p-4">
      {toast && (
        <AlertToast
          message={toast}
          variant="danger"
          closeLabel="Close"
          autoCloseMs={5000}
          onClose={() => setToast('')}
        />
      )}
        <div className="bg-bg-secondary p-8 rounded-xl shadow-xl w-full max-w-sm text-center border border-border-tertiary">
          <StagingGoogleSsoAuth />
        </div>
      </div>
    );
  }

  return (
    <>
      <ScrollToTop />
      <AnalyticsTracker />
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/" element={<Home />} />
        <Route path="/region/:regionSlug" element={<RegionPage />} />
        <Route path="/country/:countrySlug" element={<Country />} />
        <Route path="/state/:stateId" element={<MagaState />} />
        <Route path="/governor/states/:stateId" element={<MagaChamberState />} />
        <Route path="/senate/states/:stateId" element={<MagaChamberState />} />
        <Route path="/house/states/:stateId" element={<MagaChamberState />} />
        <Route path="/question/:questionId" element={<MagaQuestionDetail />} />
        <Route path="/question/:questionSlug" element={<Question />} />
        <Route path="/search" element={<SearchResult />} />
        <Route path="/admin/prompts-editor" element={<AdminPrompts />} />
      </Routes>
    </>
  );
}

export default App;
