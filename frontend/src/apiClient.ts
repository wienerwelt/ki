// frontend/src/apiClient.ts
import { getPartnerPublicPath } from './utils/partnerNavigation';

// Im Dev-Modus laufen API-Aufrufe immer ueber den Vite-Proxy. Dadurch bleiben
// Frontend und Session-Cookies auf demselben Host (localhost bzw. 127.0.0.1).
// Ein direkter Wechsel zwischen beiden Hosts wuerde SameSite=Strict-Cookies
// blockieren und einen erfolgreichen Login sofort wieder abmelden.
const CONFIGURED_API_BASE: string =
  (import.meta as any).env?.VITE_API_BASE_URL ??
  (import.meta as any).env?.VITE_API_URL ??
  '';
const API_BASE: string = (import.meta as any).env?.DEV ? '' : CONFIGURED_API_BASE;

export interface ApiResult<T = any> {
  res: Response;
  data: T | null;
}

// ---------- lockere Header-/Init-Typen ----------
export type LooseHeaders = Record<string, string | null | undefined>;
export type QueryParams = Record<string, string | number | boolean | (string | number | boolean)[] | null | undefined>;
export type LooseInit = Omit<RequestInit, 'headers'> & {
  headers?: HeadersInit | LooseHeaders;
  /** Optional: Query-Parameter, werden automatisch an die URL angehängt */
  params?: QueryParams;
};

// ---------- Utilities ----------
function isFormData(value: any): value is FormData {
  return typeof FormData !== 'undefined' && value instanceof FormData;
}

function buildBase(urlPath: string): string {
  // Verhindere doppelte Slashes am Anfang, die DNS-Fehler verursachen!
  let cleanPath = urlPath.replace(/^\/+/, '/'); 
  
  if (API_BASE) {
     // Falls eine API Base in Prod gesetzt ist (z.B. https://api.mobiliti.at)
     // Verhindere doppelte Slashes beim Zusammenbauen
     return `${API_BASE.replace(/\/+$/, '')}${cleanPath}`;
  }
  
  // Im Dev-Modus: Stelle sicher, dass die Route mit einem EINZELNEN Slash beginnt
  return cleanPath;
}

function toQueryString(params?: QueryParams): string {
  if (!params) return '';
  const parts: string[] = [];
  const push = (k: string, v: string | number | boolean) =>
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);

  for (const [key, raw] of Object.entries(params)) {
    if (raw === null || raw === undefined) continue;
    if (Array.isArray(raw)) {
      for (const v of raw) {
        if (v === null || v === undefined) continue;
        push(key, v);
      }
    } else {
      push(key, raw as any);
    }
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * Normalisiert Header:
 * - akzeptiert { key: string | null | undefined }
 * - entfernt null/undefined
 * - mappt x-auth-token -> Authorization: Bearer <token>
 * - nutzt für Browser-Sitzungen ausschließlich das HttpOnly-Cookie
 * - setzt bei Nicht-FormData „Content-Type: application/json“, falls nicht überschrieben
 */
function normalizeHeaders(init?: LooseInit): HeadersInit {
  const given = init?.headers;

  const out: Record<string, string> = {};

  if (given instanceof Headers) {
    given.forEach((v, k) => { if (v != null) out[k] = v; });
  } else if (Array.isArray(given)) {
    for (const [k, v] of given) if (v != null) out[k] = v as string;
  } else if (given && typeof given === 'object') {
    for (const [k, v] of Object.entries(given as Record<string, any>)) {
      if (v != null) out[k] = String(v);
    }
  }

  // Legacy-Mapping: x-auth-token -> Authorization
  const xAuth = out['x-auth-token'] ?? out['X-Auth-Token'] ?? out['X-auth-token'];
  if (xAuth && xAuth !== 'cookie-session') {
    out['Authorization'] = `Bearer ${xAuth}`;
  }
  delete out['x-auth-token'];
  delete out['X-Auth-Token'];
  delete out['X-auth-token'];

  const method = String(init?.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && typeof document !== 'undefined') {
    const csrfCookie = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('csrf_token='));
    if (csrfCookie) out['X-CSRF-Token'] = decodeURIComponent(csrfCookie.slice('csrf_token='.length));
  }

  // Content-Type nur setzen, wenn NICHT FormData
  const isFD = isFormData(init?.body as any);
  if (!isFD && !Object.keys(out).some(k => k.toLowerCase() === 'content-type')) {
    out['Content-Type'] = 'application/json';
  }

  return out;
}

// ---------- Low-level: apiRequest ----------
export async function apiRequest<T = any>(path: string, init: LooseInit = {}): Promise<ApiResult<T>> {
  const qs = toQueryString(init.params);
  const url = buildBase(`${path}${qs}`);
  
  // Tracking-ID für die Konsole
  const reqId = Math.random().toString(36).substring(2, 6).toUpperCase();
  const method = init.method || 'GET';
  
  console.log(`🚀 [API START] [${reqId}] ${method} ${url}`);
  const startTime = performance.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => {
      console.warn(`⏳ [API TIMEOUT 20s] [${reqId}] Das Backend antwortet nicht auf: ${url}`);
      controller.abort();
  }, 20_000);

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      credentials: 'include',
      headers: normalizeHeaders(init),
    });

    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);
    
    // ==========================================
    // 🚨 401 UNAUTHORIZED INTERCEPTOR (NEU)
    // ==========================================
    const isAuthenticationRequest = /^\/api\/auth\/(?:login|register|forgot-password|resend-verification|reset-password(?:\/|$))/.test(path);
    if (res.status === 401 && !isAuthenticationRequest) {
      console.warn(`🔒 [API 401] [${reqId}] Token abgelaufen oder ungültig. Führe Logout durch.`);
      if (typeof window !== 'undefined') {
        // Abgelaufene Sitzungen bleiben im zuletzt verwendeten Mandantenkontext.
        const publicPath = getPartnerPublicPath();
        if (window.location.pathname !== publicPath) {
          window.location.href = publicPath;
        }
      }
      // Wir werfen hier einen Fehler, damit die aufrufende Komponente abbricht
      throw new Error('Unauthorized');
    }
    // ==========================================

    if (res.ok) {
        console.log(`✅ [API SUCCESS] [${reqId}] ${res.status} ${url} (${duration}ms)`);
    } else {
        console.error(`❌ [API ERROR] [${reqId}] ${res.status} ${url} (${duration}ms)`);
    }

    let data: any = null;
    const ct = (res.headers.get('content-type') ?? '').toLowerCase();

    if (ct.includes('application/json')) {
      try { data = await res.json(); } catch { /* ignore */ }
    } else {
      try {
        const text = await res.text();
        if (text) data = { message: text };
      } catch { /* ignore */ }
    }

    return { res, data };
  } catch (error: any) {
    const endTime = performance.now();
    console.error(`💥 [API CRASH] [${reqId}] ${url} nach ${Math.round(endTime - startTime)}ms. Grund:`, error.name, error.message);
    throw error; // Fehler weiterwerfen, damit das Frontend darauf reagieren kann
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- Axios-ähnliche Helpers ----------
type JsonBody = Record<string, any> | any[] | string | number | boolean | null;
type BodyLike = BodyInit | FormData | JsonBody | undefined;

async function request<T = any>(path: string, init?: LooseInit) {
  return apiRequest<T>(path, init ?? {});
}

async function get<T = any>(path: string, init?: LooseInit) {
  return apiRequest<T>(path, { method: 'GET', ...(init ?? {}) });
}

async function del<T = any>(path: string, init?: LooseInit) {
  return apiRequest<T>(path, { method: 'DELETE', ...(init ?? {}) });
}

async function post<T = any>(path: string, body?: BodyLike, init?: LooseInit) {
  const prepared: LooseInit = { method: 'POST', ...(init ?? {}) };

  if (body !== undefined) {
    prepared.body = isFormData(body)
      ? (body as BodyInit)
      : (typeof body === 'string' ? body : JSON.stringify(body));
  }

  return apiRequest<T>(path, prepared);
}

async function put<T = any>(path: string, body?: BodyLike, init?: LooseInit) {
  const prepared: LooseInit = { method: 'PUT', ...(init ?? {}) };

  if (body !== undefined) {
    prepared.body = isFormData(body)
      ? (body as BodyInit)
      : (typeof body === 'string' ? body : JSON.stringify(body));
  }

  return apiRequest<T>(path, prepared);
}

// ---------- Default-Export (axios-like) ----------
const apiClient = {
  request,
  get,
  delete: del,
  post,
  put,
};

export default apiClient;
