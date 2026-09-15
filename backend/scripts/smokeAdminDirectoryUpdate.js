const db = require('../config/db');
const jwt = require('jsonwebtoken');

const BASE_URL = String(process.env.DIRECTORY_SMOKE_BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function buildProviderForm(name, mandantSettings) {
    const form = new FormData();
    form.append('name', name);
    form.append('description', 'Automatischer Test der transaktionssicheren Mandanten-Zuordnung.');
    form.append('website_url', 'https://example.invalid/directory-update-smoke');
    form.append('contact_email', 'directory-update-smoke@example.invalid');
    form.append('contact_phone', '+43123456789');
    form.append('is_public', 'false');
    form.append('subscription_tier', 'free');
    form.append('locations', '[]');
    form.append('categories', '[]');
    form.append('tags', '[]');
    form.append('mandant_settings', JSON.stringify(mandantSettings));
    return form;
}

async function updateProvider(providerId, token, name, mandantSettings) {
    const response = await fetch(`${BASE_URL}/api/admin/directory/${providerId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: buildProviderForm(name, mandantSettings),
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (_error) { body = { message: text }; }
    return { response, body };
}

async function run() {
    if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production') {
        throw new Error('Der Branchenverzeichnis-Update-Test darf nicht in Produktion laufen.');
    }

    let providerId = null;
    let softwareId = null;
    try {
        const subjectResult = await db.query(`
            SELECT u.id, u.auth_version, bp.id AS business_partner_id
            FROM users u
            JOIN business_partners bp ON bp.is_active = TRUE
            WHERE LOWER(u.role) = 'admin'
              AND u.is_active = TRUE
              AND (u.active_until IS NULL OR u.active_until > NOW())
            ORDER BY u.created_at, bp.created_at
            LIMIT 1
        `);
        const subject = subjectResult.rows[0];
        assert(subject, 'Für den Branchenverzeichnis-Test fehlt ein aktiver Admin oder Mandant.');

        const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        const providerName = `Directory Update Smoke ${suffix}`;
        const providerResult = await db.query(`
            INSERT INTO directory_providers (name, is_public, subscription_tier)
            VALUES ($1, FALSE, 'free')
            RETURNING id
        `, [providerName]);
        providerId = providerResult.rows[0].id;

        await db.query(`
            INSERT INTO directory_provider_mandant_settings (
                provider_id, business_partner_id, status, is_recommended, is_tenant_entry
            ) VALUES ($1, $2, 'active', FALSE, FALSE)
        `, [providerId, subject.business_partner_id]);

        const softwareResult = await db.query(`
            INSERT INTO software_tools (
                business_partner_id, provider_id, name, product_url,
                coverage_scope, country_codes, status, is_active, is_public
            ) VALUES ($1, $2, $3, $4, 'country', ARRAY['AT'], 'draft', TRUE, FALSE)
            RETURNING id
        `, [
            subject.business_partner_id,
            providerId,
            `Directory Update Software ${suffix}`,
            'https://example.invalid/directory-update-software',
        ]);
        softwareId = softwareResult.rows[0].id;

        const token = jwt.sign({
            sub: subject.id,
            role: 'admin',
            business_partner_id: subject.business_partner_id,
            av: Number(subject.auth_version || 0),
        }, process.env.JWT_SECRET, { expiresIn: '5m', algorithm: 'HS256' });

        const retainedSetting = [{
            business_partner_id: subject.business_partner_id,
            status: 'active',
            is_recommended: true,
            is_tenant_entry: false,
        }];
        const updateResult = await updateProvider(providerId, token, providerName, retainedSetting);
        assert(updateResult.response.status === 200, `Verknüpfter Anbieter konnte nicht aktualisiert werden (${updateResult.response.status}): ${updateResult.body?.message || 'unbekannt'}`);

        const updatedRelation = await db.query(`
            SELECT status, is_recommended
            FROM directory_provider_mandant_settings
            WHERE provider_id = $1 AND business_partner_id = $2
        `, [providerId, subject.business_partner_id]);
        assert(updatedRelation.rowCount === 1, 'Die verwendete Mandanten-Zuordnung wurde beim Update entfernt.');
        assert(updatedRelation.rows[0].is_recommended === true, 'Die bestehende Mandanten-Zuordnung wurde nicht aktualisiert.');

        const blockedRemoval = await updateProvider(providerId, token, providerName, []);
        assert(blockedRemoval.response.status === 409, `Das Entfernen einer verwendeten Zuordnung wurde nicht mit 409 blockiert (${blockedRemoval.response.status}).`);
        assert(String(blockedRemoval.body?.message || '').includes('noch verwendet'), 'Die Konfliktmeldung für eine verwendete Zuordnung ist nicht verständlich.');

        const relationAfterConflict = await db.query(`
            SELECT 1
            FROM directory_provider_mandant_settings
            WHERE provider_id = $1 AND business_partner_id = $2
        `, [providerId, subject.business_partner_id]);
        assert(relationAfterConflict.rowCount === 1, 'Die verwendete Zuordnung ging trotz Konflikt verloren.');

        await db.query('DELETE FROM software_tools WHERE id = $1', [softwareId]);
        softwareId = null;

        const allowedRemoval = await updateProvider(providerId, token, providerName, []);
        assert(allowedRemoval.response.status === 200, `Eine unbenutzte Zuordnung konnte nicht entfernt werden (${allowedRemoval.response.status}).`);

        const relationAfterRemoval = await db.query(`
            SELECT 1
            FROM directory_provider_mandant_settings
            WHERE provider_id = $1 AND business_partner_id = $2
        `, [providerId, subject.business_partner_id]);
        assert(relationAfterRemoval.rowCount === 0, 'Die unbenutzte Mandanten-Zuordnung wurde nicht entfernt.');

        console.log(JSON.stringify({
            ok: true,
            linkedProviderUpdate: 200,
            usedRelationRemoval: 409,
            unusedRelationRemoval: 200,
            rollbackPreservedRelation: true,
        }));
    } finally {
        if (softwareId) await db.query('DELETE FROM software_tools WHERE id = $1', [softwareId]);
        if (providerId) await db.query('DELETE FROM directory_providers WHERE id = $1', [providerId]);
        await db.end();
    }
}

run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
