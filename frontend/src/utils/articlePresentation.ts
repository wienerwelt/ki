export interface ArticleTag {
    name: string;
    logo_url: string | null;
    category_name?: string | null;
}

// Repair presentation of old scraped texts too, without rewriting source data.
// Preserve ordinary paragraphs and intentional 2–3 spaces; remove indentation
// from author lines, excessive gaps and runs of empty lines.
export const normalizeArticleWhitespace = (text?: string | null): string => String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/^[\t ]+|[\t ]+$/gm, '')
    .replace(/[\t ]{4,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// These are manufacturer tags, not the publisher/source logo.
export const getArticleOemTags = (tags?: ArticleTag[] | null): ArticleTag[] => {
    const seen = new Set<string>();
    return (tags || []).filter((tag) => {
        const key = tag.name.toLocaleLowerCase('de-AT');
        if (tag.category_name !== 'vehicle-product_news' || !tag.logo_url?.trim() || seen.has(key)) return false;
        seen.add(key);
        return true;
    }).sort((a, b) => a.name.localeCompare(b.name, 'de-AT'));
};

export const getArticleOemLogoUrl = (url: string, resolveUrl: (url: string) => string): string => {
    const rawUrl = url.trim();
    const resolved = resolveUrl(rawUrl);
    // Keep remote/S3 URLs unchanged. Local uploaded OEM logos must go through
    // the API, also if the configured base URL already ends with /api.
    return /^\/?(?:public\/)?(?:api\/)?logos\//.test(rawUrl)
        ? resolved.replace(/\/(?:api\/)*logos\//, '/api/logos/')
        : resolved;
};
