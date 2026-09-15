const fs = require('fs');
const path = require('path');

// Reuse existing manufacturer library files; never infer a brand from a publisher.
function enrichArticleTags(tags, logoDirectory = path.join(__dirname, '..', 'public', 'logos'), fileExists = fs.existsSync) {
    return (tags || []).map((tag) => {
        if (tag.category_name !== 'vehicle-product_news' || tag.logo_url?.trim()) return tag;
        const slug = String(tag.name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (!slug) return tag;
        const legacySlugs = { citroen: 'citron' };
        for (const candidate of [slug, legacySlugs[slug]].filter(Boolean)) {
            for (const extension of ['png', 'svg', 'webp', 'jpg', 'jpeg']) {
                const filename = `${candidate}.${extension}`;
                if (fileExists(path.join(logoDirectory, filename))) return { ...tag, logo_url: `/api/logos/${filename}` };
            }
        }
        return tag;
    });
}

module.exports = { enrichArticleTags };
