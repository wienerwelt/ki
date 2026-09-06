const db = require('../config/db');
const { ListObjectsV2Command, PutObjectCommand } = require('@aws-sdk/client-s3');
const s3Client = require('../config/s3Client.js');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { logActivity } = require('../services/auditLogService');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_SCOPES = new Set(['country', 'europe', 'worldwide']);
const ALLOWED_STATUSES = new Set(['draft', 'published', 'archived']);
const ALLOWED_EXPERIENCE_LEVELS = new Set(['in_use', 'evaluated', 'general']);
const ALLOWED_PRICING_MODELS = new Set([
    'Kostenlos',
    'Freemium',
    'Abonnement',
    'Einmalkauf / Lizenz',
    'Nutzungsabhängig',
    'Auf Anfrage',
]);

const isValidUUID = (value) => UUID_PATTERN.test(String(value || ''));

const cleanText = (value, maxLength = 500) => {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    return normalized ? normalized.slice(0, maxLength) : null;
};

const cleanSearchText = (value, maxLength = 120) => {
    const normalized = cleanText(value, maxLength);
    if (!normalized) return null;
    return normalized.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() || null;
};

const escapeLikePattern = (value) => String(value || '').replace(/[\\%_]/g, '\\$&');

const cleanUrl = (value) => {
    const normalized = cleanText(value, 2048);
    if (!normalized) return null;

    try {
        const parsed = new URL(normalized);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
        return parsed.toString();
    } catch (_) {
        const error = new Error('URLs müssen mit http:// oder https:// beginnen.');
        error.statusCode = 400;
        throw error;
    }
};

const cleanLogoUrl = (value) => {
    const normalized = cleanText(value, 2048);
    if (!normalized) return null;

    if (normalized.startsWith('/')) {
        const isSafeLocalAsset = /^\/(?:directory_logos|images|logos|static)\/[a-zA-Z0-9._~!$&'()+,;=@%/-]+$/.test(normalized);
        if (!isSafeLocalAsset || normalized.includes('..') || normalized.includes('\\')) {
            const error = new Error('Der lokale Logo-Pfad ist ungültig.');
            error.statusCode = 400;
            throw error;
        }
        return normalized;
    }

    return cleanUrl(normalized);
};

const normalizeCountries = (value) => {
    const source = Array.isArray(value) ? value : String(value || '').split(',');
    return Array.from(new Set(
        source
            .map((item) => String(item).trim().toUpperCase())
            .filter((item) => /^[A-Z]{2}$/.test(item))
    )).slice(0, 50);
};

const normalizeCategoryIds = (value) => {
    const source = Array.isArray(value) ? value : [];
    return Array.from(new Set(source.map(String).filter(isValidUUID))).slice(0, 12);
};

const normalizePricingModel = (value) => {
    const pricingModel = cleanText(value, 100);
    if (!pricingModel) return null;
    if (!ALLOWED_PRICING_MODELS.has(pricingModel)) {
        const error = new Error('Bitte ein gültiges Preismodell aus der vorgegebenen Liste auswählen.');
        error.statusCode = 400;
        throw error;
    }
    return pricingModel;
};

const normalizeSoftwarePayload = (body, businessPartnerId) => {
    const coverageScope = ALLOWED_SCOPES.has(body.coverage_scope) ? body.coverage_scope : 'country';
    const countries = normalizeCountries(body.country_codes);
    const status = ALLOWED_STATUSES.has(body.status) ? body.status : 'draft';

    if (coverageScope === 'country' && countries.length === 0) {
        const error = new Error('Bei landesspezifischer Abdeckung ist mindestens ein ISO-Ländercode erforderlich (z. B. AT oder DE).');
        error.statusCode = 400;
        throw error;
    }

    return {
        business_partner_id: businessPartnerId,
        provider_id: cleanText(body.provider_id, 36),
        name: cleanText(body.name, 255),
        short_description: cleanText(body.short_description, 500),
        description: cleanText(body.description, 10000),
        product_url: cleanUrl(body.product_url),
        logo_url: cleanLogoUrl(body.logo_url),
        coverage_scope: coverageScope,
        country_codes: countries,
        deployment_model: cleanText(body.deployment_model, 100),
        pricing_model: normalizePricingModel(body.pricing_model),
        target_group: cleanText(body.target_group, 255),
        status,
        is_active: body.is_active === undefined ? true : !!body.is_active,
        is_public: status === 'published' && !!body.is_public,
        is_featured: !!body.is_featured,
        category_ids: normalizeCategoryIds(body.category_ids),
    };
};

const resolveManagedBusinessPartnerId = (req, requestedId, required = true) => {
    if (req.user.role === 'assistenz') {
        if (!isValidUUID(req.user.business_partner_id)) {
            const error = new Error('Der Assistenz ist kein gültiger Mandant zugeordnet.');
            error.statusCode = 403;
            throw error;
        }
        return req.user.business_partner_id;
    }

    if (req.user.role !== 'admin') {
        const error = new Error('Zugriff verweigert.');
        error.statusCode = 403;
        throw error;
    }

    if (!requestedId && !required) return null;
    if (!isValidUUID(requestedId)) {
        const error = new Error('Business Partner ID fehlt oder ist ungültig.');
        error.statusCode = 400;
        throw error;
    }
    return requestedId;
};

const assertProviderForTenant = async (client, providerId, businessPartnerId) => {
    if (!isValidUUID(providerId)) {
        const error = new Error('Bitte zuerst einen Anbieter aus dem Branchenverzeichnis auswählen.');
        error.statusCode = 400;
        throw error;
    }

    const result = await client.query(`
        SELECT p.id, p.name
        FROM directory_providers p
        JOIN directory_provider_mandant_settings ms
          ON ms.provider_id = p.id
         AND ms.business_partner_id = $2
        WHERE p.id = $1
          AND ms.status = 'active'
        LIMIT 1
    `, [providerId, businessPartnerId]);

    if (result.rows.length === 0) {
        const error = new Error('Der Anbieter ist diesem Mandanten nicht aktiv im Branchenverzeichnis zugeordnet.');
        error.statusCode = 400;
        throw error;
    }

    return result.rows[0];
};

const assertCategoriesExist = async (client, categoryIds) => {
    if (categoryIds.length === 0) {
        const error = new Error('Bitte mindestens eine Software-Kategorie auswählen.');
        error.statusCode = 400;
        throw error;
    }

    const result = await client.query(
        'SELECT id FROM software_categories WHERE id = ANY($1::uuid[])',
        [categoryIds]
    );
    if (result.rows.length !== categoryIds.length) {
        const error = new Error('Mindestens eine Software-Kategorie ist ungültig.');
        error.statusCode = 400;
        throw error;
    }
};

const assertCountriesExist = async (client, countryCodes) => {
    if (countryCodes.length === 0) return;

    const result = await client.query(
        'SELECT UPPER(code) AS code FROM regions WHERE UPPER(code) = ANY($1::text[])',
        [countryCodes]
    );
    if (result.rows.length !== countryCodes.length) {
        const error = new Error('Mindestens ein ausgewählter ISO-Ländercode ist ungültig.');
        error.statusCode = 400;
        throw error;
    }
};

const softwareSelect = `
    SELECT
        st.*,
        p.name AS provider_name,
        p.logo_url AS provider_logo_url,
        COALESCE(categories.items, '[]'::json) AS categories,
        COALESCE(experiences.experience_count, 0)::int AS experience_count,
        COALESCE(experiences.rating_count, 0)::int AS rating_count,
        ROUND(COALESCE(experiences.average_rating, 0)::numeric, 1) AS average_rating
    FROM software_tools st
    JOIN directory_providers p ON p.id = st.provider_id
    LEFT JOIN LATERAL (
        SELECT json_agg(
            json_build_object('id', sc.id, 'slug', sc.slug, 'name', sc.name)
            ORDER BY sc.sort_order, sc.name
        ) AS items
        FROM software_tool_categories stc
        JOIN software_categories sc ON sc.id = stc.category_id
        WHERE stc.software_tool_id = st.id
    ) categories ON true
    LEFT JOIN LATERAL (
        SELECT
            (SELECT COUNT(*) FROM community_posts cp_all
             WHERE cp_all.software_tool_id = st.id
               AND cp_all.business_partner_id = st.business_partner_id) AS experience_count,
            (SELECT COUNT(*) FROM software_ratings sr_count
             WHERE sr_count.software_tool_id = st.id
               AND sr_count.business_partner_id = st.business_partner_id) AS rating_count,
            (SELECT AVG(sr_avg.rating) FROM software_ratings sr_avg
             WHERE sr_avg.software_tool_id = st.id
               AND sr_avg.business_partner_id = st.business_partner_id) AS average_rating,
            (SELECT COUNT(*) FROM software_ratings sr_use
             WHERE sr_use.software_tool_id = st.id
               AND sr_use.business_partner_id = st.business_partner_id
               AND sr_use.experience_level = 'in_use') AS in_use_count,
            (SELECT COUNT(*) FROM software_ratings sr_eval
             WHERE sr_eval.software_tool_id = st.id
               AND sr_eval.business_partner_id = st.business_partner_id
               AND sr_eval.experience_level = 'evaluated') AS evaluated_count,
            (SELECT COUNT(*) FROM software_ratings sr_general
             WHERE sr_general.software_tool_id = st.id
               AND sr_general.business_partner_id = st.business_partner_id
               AND sr_general.experience_level = 'general') AS general_count
    ) experiences ON true
`;

const replaceCategories = async (client, softwareToolId, categoryIds) => {
    await client.query('DELETE FROM software_tool_categories WHERE software_tool_id = $1', [softwareToolId]);
    await client.query(`
        INSERT INTO software_tool_categories (software_tool_id, category_id)
        SELECT $1, unnest($2::uuid[])
    `, [softwareToolId, categoryIds]);
};

const toCatalogEntry = (row) => {
    const { created_by_user_id, updated_by_user_id, ...safeRow } = row;
    return safeRow;
};

exports.getManagedOptions = async (req, res) => {
    try {
        const businessPartnerId = resolveManagedBusinessPartnerId(req, req.query.businessPartnerId);
        const [providers, tools, categories, regions] = await Promise.all([
            db.query(`
                SELECT p.id, p.name, p.logo_url
                FROM directory_providers p
                JOIN directory_provider_mandant_settings ms ON ms.provider_id = p.id
                WHERE ms.business_partner_id = $1 AND ms.status = 'active'
                ORDER BY p.name
            `, [businessPartnerId]),
            db.query(`
                SELECT id, provider_id, name, status
                FROM software_tools
                WHERE business_partner_id = $1 AND status <> 'archived'
                ORDER BY name
            `, [businessPartnerId]),
            db.query('SELECT id, slug, name FROM software_categories ORDER BY sort_order, name'),
            db.query('SELECT id, name, UPPER(code) AS code FROM regions WHERE code IS NOT NULL ORDER BY name'),
        ]);

        return res.json({
            business_partner_id: businessPartnerId,
            providers: providers.rows,
            software: tools.rows,
            categories: categories.rows,
            regions: regions.rows,
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Optionen konnten nicht geladen werden.' });
    }
};

exports.getManagedSoftware = async (req, res) => {
    try {
        const businessPartnerId = resolveManagedBusinessPartnerId(req, req.query.businessPartnerId, false);
        const values = [];
        const where = [];
        let index = 1;

        if (businessPartnerId) {
            where.push(`st.business_partner_id = $${index++}`);
            values.push(businessPartnerId);
        }

        const search = cleanSearchText(req.query.search, 120);
        if (search) {
            where.push(`(st.name ILIKE $${index} ESCAPE '\\' OR p.name ILIKE $${index} ESCAPE '\\' OR COALESCE(st.short_description, '') ILIKE $${index} ESCAPE '\\')`);
            values.push(`%${escapeLikePattern(search)}%`);
        }

        const result = await db.query(`
            ${softwareSelect}
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY st.is_featured DESC, st.updated_at DESC, st.name
        `, values);
        return res.json(result.rows);
    } catch (error) {
        console.error('[Software] managed list:', error.message);
        return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Software konnte nicht geladen werden.' });
    }
};

exports.getManagedLogoLibrary = async (req, res) => {
    try {
        const businessPartnerId = resolveManagedBusinessPartnerId(req, req.query.businessPartnerId);
        const search = cleanSearchText(req.query.search, 120)?.toLowerCase() || '';

        const knownLogos = await db.query(`
            SELECT DISTINCT ON (logo_url)
                logo_url AS url,
                label,
                source_type
            FROM (
                SELECT st.logo_url, st.name AS label, 'Software'::text AS source_type
                FROM software_tools st
                WHERE st.business_partner_id = $1 AND st.logo_url IS NOT NULL

                UNION ALL

                SELECT p.logo_url, p.name AS label, 'Branchenverzeichnis'::text AS source_type
                FROM directory_providers p
                JOIN directory_provider_mandant_settings ms
                  ON ms.provider_id = p.id
                 AND ms.business_partner_id = $1
                WHERE ms.status = 'active' AND p.logo_url IS NOT NULL

                UNION ALL

                SELECT bp.logo_url, bp.name AS label, 'Mandantenlogo'::text AS source_type
                FROM business_partners bp
                WHERE bp.id = $1 AND bp.logo_url IS NOT NULL

                UNION ALL

                SELECT s.logo_url, COALESCE(NULLIF(s.description, ''), s.url) AS label, 'Quelle'::text AS source_type
                FROM sources s
                WHERE s.logo_url IS NOT NULL

                UNION ALL

                SELECT t.logo_url, t.name AS label, 'Logo-Bibliothek'::text AS source_type
                FROM tags t
                WHERE t.logo_url IS NOT NULL
            ) logo_candidates
            WHERE NULLIF(TRIM(logo_url), '') IS NOT NULL
            ORDER BY logo_url, source_type, label
        `, [businessPartnerId]);

        const library = knownLogos.rows.map((item) => ({
            url: item.url,
            label: item.label || 'Bestehendes Logo',
            source: item.source_type,
        }));

        // Frühere Branchenverzeichnis-Uploads liegen im persistenten Volume,
        // auch wenn eine alte DB-Zuordnung später entfernt oder neu importiert
        // wurde. Sie bleiben bewusst nur auswählbar und werden keinem Anbieter
        // automatisch zugeordnet.
        const directoryLogoPath = path.join(__dirname, '..', 'public', 'directory_logos');
        try {
            const files = await fs.promises.readdir(directoryLogoPath, { withFileTypes: true });
            files
                .filter((entry) => entry.isFile() && /^[a-zA-Z0-9._-]+\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(entry.name))
                .slice(0, 600)
                .forEach((entry) => {
                    const label = entry.name
                        .replace(/\.[^.]+$/, '')
                        .replace(/-\d{4}$/, '')
                        .replace(/[-_]+/g, ' ')
                        .replace(/\b\w/g, (letter) => letter.toUpperCase());
                    library.push({
                        url: `/directory_logos/${encodeURIComponent(entry.name)}`,
                        label: label || 'Branchenverzeichnis-Logo',
                        source: 'Branchenverzeichnis-Logoarchiv',
                    });
                });
        } catch (fileError) {
            if (fileError.code !== 'ENOENT') console.warn('[Software] directory logo archive unavailable:', fileError.message);
        }

        const bucket = String(process.env.AWS_S3_BUCKET_NAME || '').trim();
        const region = String(process.env.AWS_S3_REGION || '').trim();
        if (bucket && region) {
            try {
                let continuationToken;
                let pageCount = 0;
                do {
                    const page = await s3Client.send(new ListObjectsV2Command({
                        Bucket: bucket,
                        Prefix: `software-logos/${businessPartnerId}/`,
                        MaxKeys: 200,
                        ContinuationToken: continuationToken,
                    }));

                    (page.Contents || [])
                        .filter((object) => /\.(?:avif|gif|jpe?g|png|webp)$/i.test(String(object.Key || '')))
                        .forEach((object) => {
                            const key = String(object.Key);
                            const encodedKey = key.split('/').map(encodeURIComponent).join('/');
                            library.push({
                                url: `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`,
                                label: object.LastModified
                                    ? `Software-Upload vom ${new Date(object.LastModified).toLocaleDateString('de-DE')}`
                                    : 'Software-Upload',
                                source: 'Eigenes AWS-Upload-Archiv',
                            });
                        });

                    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
                    pageCount += 1;
                } while (continuationToken && pageCount < 3);
            } catch (s3Error) {
                console.warn('[Software] AWS logo archive unavailable:', s3Error.message);
            }
        }

        const uniqueByUrl = new Map();
        library.forEach((item) => {
            if (!uniqueByUrl.has(item.url)) uniqueByUrl.set(item.url, item);
        });
        const unique = Array.from(uniqueByUrl.values())
            .filter((item) => !search || `${item.label} ${item.source} ${item.url}`.toLowerCase().includes(search))
            .sort((a, b) => a.source.localeCompare(b.source, 'de') || a.label.localeCompare(b.label, 'de'))
            .slice(0, 600);

        return res.json({ items: unique });
    } catch (error) {
        console.error('[Software] logo library:', error.message);
        return res.status(error.statusCode || 500).json({
            message: error.statusCode ? error.message : 'Bestehende Logos konnten nicht geladen werden.',
        });
    }
};

exports.createSoftware = async (req, res) => {
    let client;
    try {
        const businessPartnerId = resolveManagedBusinessPartnerId(req, req.body.business_partner_id);
        const payload = normalizeSoftwarePayload(req.body, businessPartnerId);
        if (!payload.name) return res.status(400).json({ message: 'Der Software-Name fehlt.' });
        if (!payload.product_url) return res.status(400).json({ message: 'Die Produkt-URL fehlt.' });

        client = await db.connect();
        await client.query('BEGIN');
        await assertProviderForTenant(client, payload.provider_id, businessPartnerId);
        await assertCategoriesExist(client, payload.category_ids);
        await assertCountriesExist(client, payload.country_codes);

        const inserted = await client.query(`
            INSERT INTO software_tools (
                business_partner_id, provider_id, name, short_description, description,
                product_url, logo_url, coverage_scope, country_codes, deployment_model,
                pricing_model, target_group, status, is_active, is_public, is_featured,
                created_by_user_id, updated_by_user_id
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10,
                $11, $12, $13, $14, $15, $16, $17, $17
            ) RETURNING id
        `, [
            businessPartnerId, payload.provider_id, payload.name, payload.short_description,
            payload.description, payload.product_url, payload.logo_url, payload.coverage_scope,
            payload.country_codes, payload.deployment_model, payload.pricing_model,
            payload.target_group, payload.status, payload.is_active, payload.is_public,
            payload.is_featured, req.user.id,
        ]);
        await replaceCategories(client, inserted.rows[0].id, payload.category_ids);
        await client.query('COMMIT');

        const created = await db.query(`${softwareSelect} WHERE st.id = $1`, [inserted.rows[0].id]);
        return res.status(201).json(created.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('[Software] create:', error.message);
        const duplicate = error.code === '23505';
        return res.status(error.statusCode || (duplicate ? 409 : 500)).json({
            message: error.statusCode ? error.message : duplicate ? 'Diese Software ist für den Anbieter bereits vorhanden.' : 'Software konnte nicht erstellt werden.',
        });
    } finally {
        if (client) client.release();
    }
};

exports.updateSoftware = async (req, res) => {
    let client;
    try {
        if (!isValidUUID(req.params.id)) return res.status(400).json({ message: 'Ungültige Software-ID.' });
        client = await db.connect();
        await client.query('BEGIN');

        const existing = await client.query('SELECT * FROM software_tools WHERE id = $1 FOR UPDATE', [req.params.id]);
        if (existing.rows.length === 0) {
            const error = new Error('Software nicht gefunden.');
            error.statusCode = 404;
            throw error;
        }

        const current = existing.rows[0];
        const businessPartnerId = resolveManagedBusinessPartnerId(
            req,
            req.user.role === 'admin' ? req.body.business_partner_id : current.business_partner_id
        );
        if (req.user.role === 'assistenz' && current.business_partner_id !== businessPartnerId) {
            const error = new Error('Zugriff verweigert.');
            error.statusCode = 403;
            throw error;
        }

        const payload = normalizeSoftwarePayload(req.body, businessPartnerId);
        if (!payload.name) {
            const error = new Error('Der Software-Name fehlt.');
            error.statusCode = 400;
            throw error;
        }
        if (!payload.product_url) {
            const error = new Error('Die Produkt-URL fehlt.');
            error.statusCode = 400;
            throw error;
        }
        await assertProviderForTenant(client, payload.provider_id, businessPartnerId);
        await assertCategoriesExist(client, payload.category_ids);
        await assertCountriesExist(client, payload.country_codes);

        await client.query(`
            UPDATE software_tools SET
                business_partner_id = $1,
                provider_id = $2,
                name = $3,
                short_description = $4,
                description = $5,
                product_url = $6,
                logo_url = $7,
                coverage_scope = $8,
                country_codes = $9::text[],
                deployment_model = $10,
                pricing_model = $11,
                target_group = $12,
                status = $13,
                is_active = $14,
                is_public = $15,
                is_featured = $16,
                updated_by_user_id = $17,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $18
        `, [
            businessPartnerId, payload.provider_id, payload.name, payload.short_description,
            payload.description, payload.product_url, payload.logo_url, payload.coverage_scope,
            payload.country_codes, payload.deployment_model, payload.pricing_model,
            payload.target_group, payload.status, payload.is_active, payload.is_public,
            payload.is_featured, req.user.id, req.params.id,
        ]);
        await replaceCategories(client, req.params.id, payload.category_ids);
        await client.query('COMMIT');

        const updated = await db.query(`${softwareSelect} WHERE st.id = $1`, [req.params.id]);
        return res.json(updated.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('[Software] update:', error.message);
        const duplicate = error.code === '23505';
        return res.status(error.statusCode || (duplicate ? 409 : 500)).json({
            message: error.statusCode ? error.message : duplicate ? 'Diese Software ist für den Anbieter bereits vorhanden.' : 'Software konnte nicht gespeichert werden.',
        });
    } finally {
        if (client) client.release();
    }
};

exports.archiveSoftware = async (req, res) => {
    try {
        if (!isValidUUID(req.params.id)) return res.status(400).json({ message: 'Ungültige Software-ID.' });
        const existing = await db.query('SELECT business_partner_id FROM software_tools WHERE id = $1', [req.params.id]);
        if (existing.rows.length === 0) return res.status(404).json({ message: 'Software nicht gefunden.' });
        const businessPartnerId = resolveManagedBusinessPartnerId(req, existing.rows[0].business_partner_id);
        if (req.user.role === 'assistenz' && businessPartnerId !== existing.rows[0].business_partner_id) {
            return res.status(403).json({ message: 'Zugriff verweigert.' });
        }

        await db.query(`
            UPDATE software_tools
            SET status = 'archived', is_active = false, is_public = false,
                updated_by_user_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `, [req.user.id, req.params.id]);
        return res.json({ message: 'Software wurde archiviert.' });
    } catch (error) {
        return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Software konnte nicht archiviert werden.' });
    }
};

exports.deleteSoftware = async (req, res) => {
    let client;
    try {
        if (!isValidUUID(req.params.id)) return res.status(400).json({ message: 'Ungültige Software-ID.' });

        client = await db.connect();
        await client.query('BEGIN');
        const existing = await client.query(`
            SELECT id, business_partner_id, name
            FROM software_tools
            WHERE id = $1
            FOR UPDATE
        `, [req.params.id]);
        if (existing.rows.length === 0) {
            const error = new Error('Software nicht gefunden.');
            error.statusCode = 404;
            throw error;
        }

        const software = existing.rows[0];
        const businessPartnerId = resolveManagedBusinessPartnerId(req, software.business_partner_id);
        if (businessPartnerId !== software.business_partner_id) {
            const error = new Error('Zugriff verweigert.');
            error.statusCode = 403;
            throw error;
        }

        // Inhalte bleiben erhalten: Actions und Community-Beiträge verlieren nur
        // ihre Software-Verknüpfung. Kategorien und Bewertungen werden über die
        // vorhandenen ON-DELETE-CASCADE-Regeln entfernt.
        const detachedActions = await client.query(`
            UPDATE business_partner_actions
            SET software_tool_id = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE software_tool_id = $1 AND business_partner_id = $2
        `, [software.id, businessPartnerId]);
        const detachedPosts = await client.query(`
            UPDATE community_posts
            SET software_tool_id = NULL, software_rating = NULL
            WHERE software_tool_id = $1 AND business_partner_id = $2
        `, [software.id, businessPartnerId]);
        await client.query('DELETE FROM software_tools WHERE id = $1', [software.id]);
        await client.query('COMMIT');

        logActivity({
            userId: req.user.id,
            username: req.user.username,
            actionType: 'SOFTWARE_DELETE',
            status: 'success',
            targetId: software.id,
            targetType: 'software',
            details: {
                name: software.name,
                businessPartnerId,
                detachedActions: detachedActions.rowCount,
                detachedCommunityPosts: detachedPosts.rowCount,
            },
            ipAddress: req.ip,
        }).catch((auditError) => console.error('[Software] delete audit:', auditError.message));

        return res.json({
            message: 'Software wurde endgültig gelöscht.',
            detachedActions: detachedActions.rowCount,
            detachedCommunityPosts: detachedPosts.rowCount,
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('[Software] delete:', error.message);
        return res.status(error.statusCode || 500).json({
            message: error.statusCode ? error.message : 'Software konnte nicht gelöscht werden.',
        });
    } finally {
        if (client) client.release();
    }
};

exports.getInternalCatalog = async (req, res) => {
    const businessPartnerId = req.user.business_partner_id;
    if (!isValidUUID(businessPartnerId)) return res.status(403).json({ message: 'Kein Mandant zugeordnet.' });

    try {
        const [result, myRatings] = await Promise.all([
            db.query(`
                ${softwareSelect}
                WHERE st.business_partner_id = $1
                  AND st.status = 'published'
                  AND st.is_active = true
                ORDER BY st.is_featured DESC, st.name
            `, [businessPartnerId]),
            db.query(`
                SELECT software_tool_id, rating, experience_level
                FROM software_ratings
                WHERE business_partner_id = $1 AND user_id = $2
            `, [businessPartnerId, req.user.id]),
        ]);
        const ratingByTool = new Map(myRatings.rows.map((row) => [row.software_tool_id, row]));
        return res.json({
            data: result.rows.map((row) => ({
                ...toCatalogEntry(row),
                my_rating: ratingByTool.has(row.id) ? Number(ratingByTool.get(row.id).rating) : null,
                my_experience_level: ratingByTool.get(row.id)?.experience_level || null,
            })),
        });
    } catch (error) {
        console.error('[Software] internal catalog:', error.message);
        return res.status(500).json({ message: 'Software-Katalog konnte nicht geladen werden.' });
    }
};

exports.rateSoftware = async (req, res) => {
    if (req.user.role === 'demo') {
        return res.status(403).json({ message: 'Demo-Benutzer dürfen keine Software bewerten.' });
    }

    const businessPartnerId = req.user.business_partner_id;
    const softwareToolId = req.params.id;
    const rating = Number.parseInt(req.body?.rating, 10);
    const experienceLevel = String(req.body?.experienceLevel || '');
    if (!isValidUUID(businessPartnerId) || !isValidUUID(softwareToolId)) {
        return res.status(400).json({ message: 'Ungültige Software-Auswahl.' });
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ message: 'Die Bewertung muss zwischen 1 und 5 liegen.' });
    }
    if (!ALLOWED_EXPERIENCE_LEVELS.has(experienceLevel)) {
        return res.status(400).json({ message: 'Bitte den Erfahrungskontext auswählen.' });
    }

    try {
        const software = await db.query(`
            SELECT id
            FROM software_tools
            WHERE id = $1
              AND business_partner_id = $2
              AND status = 'published'
              AND is_active = true
            LIMIT 1
        `, [softwareToolId, businessPartnerId]);
        if (software.rows.length === 0) {
            return res.status(404).json({ message: 'Software ist für diesen Mandanten nicht verfügbar.' });
        }

        await db.query(`
            INSERT INTO software_ratings (
                software_tool_id, business_partner_id, user_id, rating, experience_level
            ) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (software_tool_id, business_partner_id, user_id) DO UPDATE
            SET rating = EXCLUDED.rating,
                experience_level = EXCLUDED.experience_level,
                updated_at = CURRENT_TIMESTAMP
        `, [softwareToolId, businessPartnerId, req.user.id, rating, experienceLevel]);

        const aggregate = await db.query(`
            SELECT COUNT(*)::int AS rating_count,
                   ROUND(AVG(rating)::numeric, 1) AS average_rating,
                   COUNT(*) FILTER (WHERE experience_level = 'in_use')::int AS in_use_count,
                   COUNT(*) FILTER (WHERE experience_level = 'evaluated')::int AS evaluated_count,
                   COUNT(*) FILTER (WHERE experience_level = 'general')::int AS general_count
            FROM software_ratings
            WHERE software_tool_id = $1 AND business_partner_id = $2
        `, [softwareToolId, businessPartnerId]);

        return res.json({
            software_tool_id: softwareToolId,
            my_rating: rating,
            my_experience_level: experienceLevel,
            rating_count: aggregate.rows[0]?.rating_count || 0,
            average_rating: aggregate.rows[0]?.average_rating || 0,
            in_use_count: aggregate.rows[0]?.in_use_count || 0,
            evaluated_count: aggregate.rows[0]?.evaluated_count || 0,
            general_count: aggregate.rows[0]?.general_count || 0,
        });
    } catch (error) {
        console.error('[Software] rating:', error.message);
        return res.status(500).json({ message: 'Bewertung konnte nicht gespeichert werden.' });
    }
};

exports.uploadSoftwareLogo = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Bitte eine Logo-Datei auswählen.' });
    }

    try {
        const businessPartnerId = resolveManagedBusinessPartnerId(req, req.body.businessPartnerId);
        const { data, info } = await sharp(req.file.buffer, { limitInputPixels: 20_000_000 })
            .rotate()
            .resize(320, 320, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 74, alphaQuality: 86, effort: 5 })
            .toBuffer({ resolveWithObject: true });

        const storagePath = `software-logos/${businessPartnerId}/${uuidv4()}.webp`;
        await s3Client.send(new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: storagePath,
            Body: data,
            ContentType: 'image/webp',
            CacheControl: 'public, max-age=31536000, immutable',
        }));

        const filePath = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${storagePath}`;
        return res.json({
            message: 'Logo wurde optimiert und hochgeladen.',
            filePath,
            width: info.width,
            height: info.height,
            bytes: data.length,
        });
    } catch (error) {
        console.error('[Software] logo upload:', error.message);
        return res.status(error.statusCode || 500).json({
            message: error.statusCode ? error.message : 'Logo konnte nicht verarbeitet werden.',
        });
    }
};

exports.getInternalOptions = async (req, res) => {
    const businessPartnerId = req.user.business_partner_id;
    if (!isValidUUID(businessPartnerId)) return res.status(403).json({ message: 'Kein Mandant zugeordnet.' });

    try {
        const result = await db.query(`
            SELECT st.id, st.name, st.logo_url, p.name AS provider_name
            FROM software_tools st
            JOIN directory_providers p ON p.id = st.provider_id
            WHERE st.business_partner_id = $1
              AND st.status = 'published'
              AND st.is_active = true
            ORDER BY p.name, st.name
        `, [businessPartnerId]);
        return res.json(result.rows);
    } catch (error) {
        return res.status(500).json({ message: 'Software-Auswahl konnte nicht geladen werden.' });
    }
};

exports.getPublicCatalog = async (req, res) => {
    const businessPartnerId = req.query.partnerId;
    if (!isValidUUID(businessPartnerId)) return res.status(400).json({ message: 'Ungültige oder fehlende Partner-ID.' });

    const safeLimit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 24, 1), 100);
    const safePage = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const values = [businessPartnerId];
    const where = [
        'st.business_partner_id = $1',
        "st.status = 'published'",
        'st.is_active = true',
        'st.is_public = true',
        "ms.status = 'active'",
        'p.is_public = true',
    ];
    let index = 2;

    const search = cleanSearchText(req.query.search, 120);
    if (search) {
        where.push(`(st.name ILIKE $${index} ESCAPE '\\' OR p.name ILIKE $${index} ESCAPE '\\' OR COALESCE(st.short_description, '') ILIKE $${index} ESCAPE '\\')`);
        values.push(`%${escapeLikePattern(search)}%`);
        index++;
    }

    const category = cleanText(req.query.category, 100);
    if (category && category !== 'all') {
        where.push(`EXISTS (
            SELECT 1 FROM software_tool_categories filter_stc
            JOIN software_categories filter_sc ON filter_sc.id = filter_stc.category_id
            WHERE filter_stc.software_tool_id = st.id
              AND (filter_sc.id::text = $${index} OR filter_sc.slug = $${index})
        )`);
        values.push(category);
        index++;
    }

    const coverage = cleanText(req.query.coverage, 20);
    if (coverage && ALLOWED_SCOPES.has(coverage)) {
        where.push(`st.coverage_scope = $${index++}`);
        values.push(coverage);
    }

    try {
        const fromSql = `
            FROM software_tools st
            JOIN directory_providers p ON p.id = st.provider_id
            JOIN directory_provider_mandant_settings ms
              ON ms.provider_id = st.provider_id
             AND ms.business_partner_id = st.business_partner_id
        `;
        const whereSql = `WHERE ${where.join(' AND ')}`;
        const offset = (safePage - 1) * safeLimit;
        const [result, totalResult, filtersResult] = await Promise.all([
            db.query(`
                ${softwareSelect}
                JOIN directory_provider_mandant_settings ms
                  ON ms.provider_id = st.provider_id
                 AND ms.business_partner_id = st.business_partner_id
                ${whereSql}
                ORDER BY st.is_featured DESC, experiences.experience_count DESC, st.name
                LIMIT $${index} OFFSET $${index + 1}
            `, [...values, safeLimit, offset]),
            db.query(`SELECT COUNT(*)::int AS total ${fromSql} ${whereSql}`, values),
            db.query(`
                SELECT sc.id, sc.slug, sc.name, COUNT(DISTINCT st.id)::int AS count
                ${fromSql}
                JOIN software_tool_categories stc ON stc.software_tool_id = st.id
                JOIN software_categories sc ON sc.id = stc.category_id
                WHERE st.business_partner_id = $1
                  AND st.status = 'published' AND st.is_active = true AND st.is_public = true
                  AND ms.status = 'active' AND p.is_public = true
                GROUP BY sc.id, sc.slug, sc.name, sc.sort_order
                ORDER BY sc.sort_order, sc.name
            `, [businessPartnerId]),
        ]);
        const total = totalResult.rows[0]?.total || 0;
        return res.json({
            data: result.rows.map(toCatalogEntry),
            page: safePage,
            limit: safeLimit,
            total,
            hasMore: offset + result.rows.length < total,
            filters: { categories: filtersResult.rows },
        });
    } catch (error) {
        console.error('[Software] public catalog:', error.message);
        return res.status(500).json({ message: 'Software-Katalog konnte nicht geladen werden.' });
    }
};

exports.assertActionLinks = async (client, { businessPartnerId, providerId, softwareToolId }) => {
    await assertProviderForTenant(client, providerId, businessPartnerId);
    if (!softwareToolId) return;
    if (!isValidUUID(softwareToolId)) {
        const error = new Error('Ungültige Software-Auswahl.');
        error.statusCode = 400;
        throw error;
    }

    const result = await client.query(`
        SELECT id
        FROM software_tools
        WHERE id = $1
          AND provider_id = $2
          AND business_partner_id = $3
          AND status <> 'archived'
        LIMIT 1
    `, [softwareToolId, providerId, businessPartnerId]);
    if (result.rows.length === 0) {
        const error = new Error('Die Software gehört nicht zum ausgewählten Anbieter und Mandanten.');
        error.statusCode = 400;
        throw error;
    }
};
