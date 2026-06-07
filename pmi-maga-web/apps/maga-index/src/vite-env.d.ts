/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin for OAuth redirects; falls back to VITE_API_URL in getApiBase() */
  readonly VITE_API_BASE?: string;
  readonly VITE_API_URL: string;
  readonly VITE_GA_MEASUREMENT_ID?: string;
  readonly VITE_IS_STAGING?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
