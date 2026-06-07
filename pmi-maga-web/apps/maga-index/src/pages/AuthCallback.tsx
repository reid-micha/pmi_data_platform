import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { clearWarIndexAuthTokenCookie, setWarIndexAuthTokenCookie } from '../utils/authCookie';

function homeWithError(error: string): string {
  return `/?${new URLSearchParams({ error }).toString()}`;
}

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = (searchParams.get('token') ?? '').trim();
    const error = (searchParams.get('error') ?? '').trim();

    clearWarIndexAuthTokenCookie();
    if (error !== '') {
      navigate(homeWithError(error), { replace: true });
      return;
    }

    if (token !== '') {
      setWarIndexAuthTokenCookie(token);
      navigate('/', { replace: true });
      return;
    }

    navigate(homeWithError('invalid_callback'), { replace: true });
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen bg-bg-dark-primary flex items-center justify-center p-4">
      <p className="text-text-tertiary text-sm">Signing in…</p>
    </div>
  );
}
