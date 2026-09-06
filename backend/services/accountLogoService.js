const db = require('../config/db');

const getDomainFromUrl = (url) => {
    if (!url) return null;
    try {
        return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch (_) {
        return String(url).replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./, '').toLowerCase() || null;
    }
};

const normalizeName = (value) => String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('de')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const findReusableAccountLogo = (account, candidates) => {
    if (account.logo_url) {
        return { logo_url: account.logo_url, logo_source: 'Account-Logo' };
    }

    const accountDomain = getDomainFromUrl(account.website_url);
    const accountName = normalizeName(account.name);
    const domainMatch = accountDomain
        ? candidates.find((candidate) => getDomainFromUrl(candidate.website_url) === accountDomain)
        : null;
    const nameMatch = accountName
        ? candidates.find((candidate) => normalizeName(candidate.label) === accountName)
        : null;
    const match = domainMatch || nameMatch;

    return match
        ? { logo_url: match.logo_url, logo_source: match.source_type }
        : { logo_url: null, logo_source: null };
};

const loadLogoCandidates = async (businessPartnerId) => {
    const result = await db.query(`
        SELECT label, logo_url, website_url, source_type
        FROM (
            SELECT
                provider.name AS label,
                provider.logo_url,
                provider.website_url,
                1 AS source_priority,
                'Branchenverzeichnis'::text AS source_type
            FROM directory_providers provider
            JOIN directory_provider_mandant_settings settings
              ON settings.provider_id = provider.id
             AND settings.business_partner_id = $1
            WHERE settings.status = 'active'
              AND NULLIF(TRIM(provider.logo_url), '') IS NOT NULL

            UNION ALL

            SELECT
                tool.name AS label,
                tool.logo_url,
                tool.product_url AS website_url,
                2 AS source_priority,
                'Software-Katalog'::text AS source_type
            FROM software_tools tool
            WHERE tool.business_partner_id = $1
              AND tool.status <> 'archived'
              AND tool.is_active = TRUE
              AND NULLIF(TRIM(tool.logo_url), '') IS NOT NULL

            UNION ALL

            SELECT
                partner.name AS label,
                partner.logo_url,
                partner.url_businesspartner AS website_url,
                3 AS source_priority,
                'Mandantenprofil'::text AS source_type
            FROM business_partners partner
            WHERE partner.id = $1
              AND NULLIF(TRIM(partner.logo_url), '') IS NOT NULL

            UNION ALL

            SELECT
                COALESCE(NULLIF(TRIM(source.description), ''), source.url) AS label,
                source.logo_url,
                source.url AS website_url,
                4 AS source_priority,
                'Vertrauenswürdige Quelle'::text AS source_type
            FROM sources source
            WHERE NULLIF(TRIM(source.logo_url), '') IS NOT NULL
        ) logo_candidates
        ORDER BY source_priority, label
    `, [businessPartnerId]);
    return result.rows;
};

const enrichAccountsWithLogos = async (accounts, businessPartnerId) => {
    if (!Array.isArray(accounts) || accounts.length === 0 || !businessPartnerId) return accounts || [];
    const candidates = await loadLogoCandidates(businessPartnerId);
    return accounts.map((account) => ({
        ...account,
        ...findReusableAccountLogo(account, candidates),
    }));
};

module.exports = {
    enrichAccountsWithLogos,
    findReusableAccountLogo,
    getDomainFromUrl,
    loadLogoCandidates,
};
