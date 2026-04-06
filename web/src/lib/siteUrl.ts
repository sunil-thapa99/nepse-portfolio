/**
 * Canonical public origin for Supabase auth redirects (email confirmation, etc.).
 * Set VITE_SITE_URL in production (e.g. Vercel) to your live URL so links are not
 * tied to localhost or a wrong build-time assumption. Falls back to window.location.origin.
 */
export function getPublicSiteOrigin(): string {
  const fromEnv = import.meta.env.VITE_SITE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}
