/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Optional API origin (no trailing slash). Empty uses same origin / Vite proxy `/api`. */
  readonly VITE_API_BASE_URL?: string;
  /** Optional public SPA origin for Supabase email confirmation redirects (production). */
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
