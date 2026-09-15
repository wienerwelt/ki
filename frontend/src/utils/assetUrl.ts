const LOOPBACK_BASE = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i;

export const resolveAssetUrl = (url?: string | null, developmentBase = 'http://localhost:5001') => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;

  const cleanPath = (url.startsWith('/') ? url : `/${url}`).replace(/^\/public\//, '/');
  const env = (import.meta as any).env || {};
  const configuredBase = String(env.VITE_API_BASE_URL || env.VITE_API_URL || '').replace(/\/+$/, '');

  // Plesk liefert das Frontend direkt aus. Laufzeit-Uploads liegen dagegen
  // im persistenten Backend-Verzeichnis und sind deshalb in Produktion nur
  // über die bereits freigegebene API-Route abrufbar. Das gilt auch, wenn
  // VITE_API_URL explizit auf die Dashboard-Domain gesetzt ist.
  if (env.PROD && cleanPath.startsWith('/directory_logos/')) {
    const productionBase = configuredBase && !LOOPBACK_BASE.test(configuredBase) ? configuredBase : '';
    const apiPrefix = productionBase.endsWith('/api') ? productionBase : `${productionBase}/api`;
    return `${apiPrefix}${cleanPath}`;
  }

  // Die Produktions-API laeuft hinter derselben Domain. Ein versehentlich
  // einkompiliertes localhost darf niemals zum Rechner des Besuchers zeigen.
  if (env.PROD && (!configuredBase || LOOPBACK_BASE.test(configuredBase))) {
    return cleanPath;
  }

  const base = configuredBase || (env.DEV ? developmentBase.replace(/\/+$/, '') : '');
  return `${base}${cleanPath}`;
};
