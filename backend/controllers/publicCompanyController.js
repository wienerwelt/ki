const db = require('../config/db');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalizeQuery = (value, max = 120) => String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
const escapeLike = (value) => String(value || '').replace(/[\\%_]/g, '\\$&');
const positiveInt = (value, fallback, max) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};

const partnerRegionClause = (articleAlias, partnerParameter = '$1') => `
    (
        NOT EXISTS (
            SELECT 1 FROM business_partner_regions company_region_scope
            WHERE company_region_scope.business_partner_id = ${partnerParameter}
        )
        OR EXISTS (
            SELECT 1
            FROM business_partner_regions company_region_scope
            JOIN regions company_region ON company_region.id = company_region_scope.region_id
            WHERE company_region_scope.business_partner_id = ${partnerParameter}
              AND (
                  company_region.code = ${articleAlias}.region
                  OR ${articleAlias}.region IN ('EU', 'GLOBAL', 'WORLD')
                  OR ${articleAlias}.region IS NULL
                  OR trim(${articleAlias}.region) = ''
              )
        )
    )
`;

async function ensurePublicPartner(partnerId) {
    if (!UUID.test(partnerId || '')) return null;
    const result = await db.query(
        `SELECT id, name, slug
         FROM business_partners
         WHERE id = $1
           AND is_active = true
           AND COALESCE(is_demo_tenant, false) = false
         LIMIT 1`,
        [partnerId]
    );
    return result.rows[0] || null;
}

exports.search = async (req, res) => {
    const partnerId = String(req.query.partnerId || '');
    const query = normalizeQuery(req.query.q);
    const limit = positiveInt(req.query.limit, 8, 20);

    try {
        const partner = await ensurePublicPartner(partnerId);
        if (!partner) return res.status(404).json({ message: 'Mandant nicht verfügbar.' });

        const totalResult = await db.query(
            `SELECT COUNT(*)::int AS count
             FROM directory_providers provider
             JOIN directory_provider_mandant_settings tenant_provider
               ON tenant_provider.provider_id = provider.id
             WHERE tenant_provider.business_partner_id = $1
               AND tenant_provider.status = 'active'
               AND provider.is_public = true`,
            [partnerId]
        );
        const availableCompanies = Number(totalResult.rows[0]?.count || 0);
        const like = `%${escapeLike(query)}%`;
        const companyResult = await db.query(
            `SELECT
                provider.id,
                provider.name,
                provider.description,
                provider.logo_url,
                provider.website_url,
                COALESCE(primary_category.name_lang, primary_category.name, 'Unternehmen') AS category,
                COALESCE(article_stats.article_count, 0)::int AS article_count,
                COALESCE(career_stats.career_count, 0)::int AS career_count,
                COALESCE(job_stats.job_count, 0)::int AS job_count
             FROM directory_providers provider
             JOIN directory_provider_mandant_settings tenant_provider
               ON tenant_provider.provider_id = provider.id
              AND tenant_provider.business_partner_id = $1
              AND tenant_provider.status = 'active'
             LEFT JOIN LATERAL (
                SELECT category.name, category.name_lang
                FROM directory_provider_categories provider_category
                JOIN categories category ON category.id = provider_category.category_id
                WHERE provider_category.provider_id = provider.id
                ORDER BY provider_category.is_primary DESC, category.name
                LIMIT 1
             ) primary_category ON true
             LEFT JOIN LATERAL (
                SELECT COUNT(*) AS article_count
                FROM directory_provider_mentions mention
                JOIN scraped_content article ON article.id = mention.scraped_content_id
                WHERE mention.provider_id = provider.id
                  AND mention.match_status <> 'rejected'
                  AND article.event_date IS NULL
                  AND ${partnerRegionClause('article')}
             ) article_stats ON true
             LEFT JOIN LATERAL (
                SELECT COUNT(*) AS career_count
                FROM career_entries entry
                WHERE entry.business_partner_id = $1
                  AND entry.organization_provider_id = provider.id
                  AND entry.status = 'approved'
                  AND entry.public_approved = true
             ) career_stats ON true
             LEFT JOIN LATERAL (
                SELECT COUNT(*) AS job_count
                FROM career_jobs job
                WHERE job.business_partner_id = $1
                  AND job.provider_id = provider.id
                  AND job.status = 'approved'
                  AND job.public_approved = true
                  AND (job.valid_until IS NULL OR job.valid_until >= CURRENT_DATE)
             ) job_stats ON true
             WHERE provider.is_public = true
               AND (
                    $2 = ''
                    OR provider.name ILIKE $3 ESCAPE '\\'
                    OR COALESCE(provider.description, '') ILIKE $3 ESCAPE '\\'
                    OR EXISTS (
                        SELECT 1
                        FROM directory_provider_aliases alias
                        WHERE alias.provider_id = provider.id
                          AND alias.is_active
                          AND alias.alias ILIKE $3 ESCAPE '\\'
                    )
               )
             ORDER BY
                CASE WHEN lower(provider.name) = lower($2) THEN 0
                     WHEN provider.name ILIKE $2 || '%' ESCAPE '\\' THEN 1
                     ELSE 2 END,
                (COALESCE(article_stats.article_count, 0)
                  + COALESCE(career_stats.career_count, 0)
                  + COALESCE(job_stats.job_count, 0)) DESC,
                provider.name
             LIMIT $4`,
            [partnerId, query, like, limit]
        );

        let fallbackArticles = [];
        if (query.length >= 2 && companyResult.rows.length === 0) {
            const fallback = await db.query(
                `SELECT article.id, article.title, left(article.summary, 260) AS summary,
                        article.original_url, article.published_date, article.source_identifier,
                        article.thumbnail_url
                 FROM scraped_content article
                 WHERE article.event_date IS NULL
                   AND ${partnerRegionClause('article')}
                   AND (
                        article.title ILIKE $2 ESCAPE '\\'
                        OR COALESCE(article.summary, '') ILIKE $2 ESCAPE '\\'
                   )
                 ORDER BY article.published_date DESC NULLS LAST, article.scraped_at DESC
                 LIMIT 6`,
                [partnerId, like]
            );
            fallbackArticles = fallback.rows;
        }

        res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=180');
        return res.json({
            query,
            companies: companyResult.rows,
            fallback_articles: fallbackArticles,
            fallback_reason: availableCompanies === 0
                ? 'no_companies_available'
                : companyResult.rows.length === 0
                    ? 'no_company_match'
                    : null,
            available_companies: availableCompanies,
        });
    } catch (error) {
        console.error('[Public company search]', error.message);
        return res.status(500).json({ message: 'Unternehmenssuche konnte nicht geladen werden.' });
    }
};

exports.detail = async (req, res) => {
    const partnerId = String(req.query.partnerId || '');
    const companyId = String(req.params.id || '');
    if (!UUID.test(companyId)) return res.status(400).json({ message: 'Ungültiges Unternehmen.' });

    let queryStage = 'partner';
    try {
        const partner = await ensurePublicPartner(partnerId);
        if (!partner) return res.status(404).json({ message: 'Mandant nicht verfügbar.' });

        queryStage = 'company';
        const companyResult = await db.query(
            `SELECT provider.id, provider.name, provider.description, provider.logo_url,
                    provider.website_url, provider.contact_email, provider.contact_phone,
                    COALESCE(categories.items, '[]'::json) AS categories,
                    COALESCE(locations.items, '[]'::json) AS locations,
                    COALESCE(software.software_count, 0)::int AS software_count
             FROM directory_providers provider
             JOIN directory_provider_mandant_settings tenant_provider
               ON tenant_provider.provider_id = provider.id
              AND tenant_provider.business_partner_id = $1
              AND tenant_provider.status = 'active'
             LEFT JOIN LATERAL (
                SELECT json_agg(json_build_object('id', category.id, 'name', COALESCE(category.name_lang, category.name)) ORDER BY provider_category.is_primary DESC, category.name) AS items
                FROM directory_provider_categories provider_category
                JOIN categories category ON category.id = provider_category.category_id
                WHERE provider_category.provider_id = provider.id
             ) categories ON true
             LEFT JOIN LATERAL (
                SELECT json_agg(json_build_object('city', location.city, 'country', location.country, 'is_headquarter', location.is_headquarter) ORDER BY location.is_headquarter DESC, location.city) AS items
                FROM directory_provider_locations location
                WHERE location.provider_id = provider.id
             ) locations ON true
             LEFT JOIN LATERAL (
                SELECT COUNT(*) AS software_count
                FROM software_tools tool
                WHERE tool.provider_id = provider.id
                  AND tool.business_partner_id = $1
                  AND tool.status = 'published'
                  AND tool.is_active = true
                  AND tool.is_public = true
             ) software ON true
             WHERE provider.id = $2 AND provider.is_public = true
             LIMIT 1`,
            [partnerId, companyId]
        );
        if (!companyResult.rowCount) return res.status(404).json({ message: 'Unternehmen ist in diesem Branchennetzwerk nicht verfügbar.' });

        const company = companyResult.rows[0];
        queryStage = 'linked_articles';
        let articles = (await db.query(
            `SELECT article.id, article.title, left(article.summary, 360) AS summary,
                    article.original_url, article.published_date, article.source_identifier,
                    article.thumbnail_url, mention.mention_confidence,
                    mention.match_type, mention.matched_term
             FROM directory_provider_mentions mention
             JOIN scraped_content article ON article.id = mention.scraped_content_id
             WHERE mention.provider_id = $2
               AND mention.match_status <> 'rejected'
               AND article.event_date IS NULL
               AND ${partnerRegionClause('article')}
             ORDER BY article.published_date DESC NULLS LAST, article.scraped_at DESC
             LIMIT 20`,
            [partnerId, companyId]
        )).rows;

        let articleMode = 'linked';
        if (articles.length === 0) {
            articleMode = 'name_fallback';
            queryStage = 'fallback_articles';
            articles = (await db.query(
                `SELECT article.id, article.title, left(article.summary, 360) AS summary,
                        article.original_url, article.published_date, article.source_identifier,
                        article.thumbnail_url, 60::int AS mention_confidence,
                        'fallback'::text AS match_type, $2::text AS matched_term
                 FROM scraped_content article
                 WHERE article.event_date IS NULL
                   AND ${partnerRegionClause('article')}
                   AND (
                        article.title ILIKE $2 ESCAPE '\\'
                        OR COALESCE(article.summary, '') ILIKE $2 ESCAPE '\\'
                   )
                 ORDER BY article.published_date DESC NULLS LAST, article.scraped_at DESC
                 LIMIT 12`,
                [partnerId, `%${escapeLike(company.name)}%`]
            )).rows;
        }
        if (articles.length === 0) articleMode = 'empty';

        queryStage = 'career';
        const career = await db.query(
            `SELECT entry.id, entry.person_name, entry.organization, entry.role_title,
                    entry.kind, entry.effective_date, entry.published_date,
                    left(entry.summary, 280) AS summary, entry.source_url,
                    CASE WHEN entry.portrait_key IS NOT NULL AND entry.photo_consent
                         THEN '/api/public/career/' || entry.business_partner_id::text || '/' || entry.id::text || '/photo'
                    END AS photo_url
             FROM career_entries entry
             WHERE entry.business_partner_id = $1
               AND entry.status = 'approved'
               AND entry.public_approved = true
               AND (
                    entry.organization_provider_id = $2
                    OR (entry.organization_provider_id IS NULL AND lower(entry.organization) = lower($3))
               )
             ORDER BY COALESCE(entry.effective_date, entry.published_date, entry.created_at::date) DESC
             LIMIT 8`,
            [partnerId, companyId, company.name]
        );

        queryStage = 'jobs';
        const jobs = await db.query(
            `SELECT job.id, job.title, job.organization, job.location, job.employment_type,
                    left(job.summary, 420) AS summary, job.application_url, job.source_url,
                    job.published_date, job.valid_until
             FROM career_jobs job
             WHERE job.business_partner_id = $1
               AND job.status = 'approved'
               AND job.public_approved = true
               AND (job.valid_until IS NULL OR job.valid_until >= CURRENT_DATE)
               AND (
                    job.provider_id = $2
                    OR (job.provider_id IS NULL AND lower(job.organization) = lower($3))
               )
             ORDER BY job.published_date DESC NULLS LAST, job.created_at DESC
             LIMIT 12`,
            [partnerId, companyId, company.name]
        );

        res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=180');
        return res.json({ company, articles, article_mode: articleMode, career: career.rows, jobs: jobs.rows });
    } catch (error) {
        console.error(`[Public company detail:${queryStage}]`, error.message);
        return res.status(500).json({ message: 'Unternehmensprofil konnte nicht geladen werden.' });
    }
};
