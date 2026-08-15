const LAST_PARTNER_SLUG_KEY = 'last_business_partner_slug';

const normalizePartnerSlug = (value?: string | null): string | null => {
  const slug = String(value || '').trim().replace(/^\/+|\/+$/g, '');
  if (!slug || slug.includes('/') || /[?#\s]/.test(slug)) return null;
  return slug;
};

export const rememberPartnerSlug = (value?: string | null): string | null => {
  const slug = normalizePartnerSlug(value);
  if (!slug || typeof window === 'undefined') return slug;

  try {
    window.localStorage.setItem(LAST_PARTNER_SLUG_KEY, slug);
  } catch {}

  return slug;
};

export const getRememberedPartnerSlug = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return normalizePartnerSlug(window.localStorage.getItem(LAST_PARTNER_SLUG_KEY));
  } catch {
    return null;
  }
};

export const getPartnerPublicPath = (currentSlug?: string | null): string => {
  const slug = normalizePartnerSlug(currentSlug) || getRememberedPartnerSlug();
  return slug ? `/${encodeURIComponent(slug)}` : '/';
};
