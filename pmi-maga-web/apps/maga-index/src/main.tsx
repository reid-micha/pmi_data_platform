import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { DeviceFrame, getDeviceFromUrl } from './components/shared/DeviceFrame'

// Dev bypass: if VITE_DEV_AUTH_TOKEN is set, inject it into cookies before the app loads.
// Get the token from someone with admin access or from the staging backend owner.
const devToken = import.meta.env.VITE_DEV_AUTH_TOKEN;
if (devToken) {
  import('@micah/api').then(({ setAuthToken }) => setAuthToken(devToken));
  import('./utils/authCookie').then(({ setWarIndexAuthTokenCookie }) => setWarIndexAuthTokenCookie(devToken));
}

const device = getDeviceFromUrl(window.location.search);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {device ? (
      <DeviceFrame />
    ) : (
      <BrowserRouter>
        <App />
      </BrowserRouter>
    )}
  </StrictMode>,
)
