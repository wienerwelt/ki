const LOOPBACK_BASE = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i;

export const resolveAssetUrl = (url?: string | null, developmentBase = 'http://localhost:5001') => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;

  const cleanPath = (url.startsWith('/') ? url : `/${url}`).replace(/^\/public\//, '/');
  const env = (import.meta as any).env || {};
  const configuredBase = String(env.VITE_API_BASE_URL || env.VITE_API_URL || '').replace(/\/+$/, '');

  // Die Produktions-API laeuft hinter derselben Domain. Ein versehentlich
  // einkompiliertes localhost darf niemals zum Rechner des Besuchers zeigen.
  if (env.PROD && (!configuredBase || LOOPBACK_BASE.test(configuredBase))) {
    return cleanPath;
  }

  const base = configuredBase || (env.DEV ? developmentBase.replace(/\/+$/, '') : '');
  return `${base}${cleanPath}`;
};
