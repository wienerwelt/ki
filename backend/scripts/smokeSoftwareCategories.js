const db = require('../config/db');
const jwt = require('jsonwebtoken');

const BASE_URL = String(process.env.SOFTWARE_CATEGORY_SMOKE_BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');

async function request(path, token, options = {}) {
    const response = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers || {}),
        },
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (_error) { body = text; }
    return { response, body };
}

async function run() {
    if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production') {
        throw new Error('Der Software-Kategorien-Smoke-Test darf nicht in Produktion laufen.');
    }

    let categoryId = null;
    let softwareToolId = null;
    try {
        const adminResult = await db.query(`
            SELECT id, role, business_partner_id, auth_version
            FROM users
            WHERE role = 'admin' AND is_active = TRUE
            ORDER BY created_at
            LIMIT 1
        `);
        const admin = adminResult.rows[0];
        if (!admin) throw new Error('Kein aktiver Admin für den Software-Kategorien-Test verfügbar.');

        const toolResult = await db.query(`
            SELECT id, business_partner_id
            FROM software_tools
            ORDER BY created_at
            LIMIT 1
        `);
        const tool = toolResult.rows[0];
        if (!tool) throw new Error('Kein Software-Eintrag für den Verwendungsschutz-Test verfügbar.');
        softwareToolId = tool.id;

        const token = jwt.sign({
            user: {
                id: admin.id,
                role: admin.role,
                business_partner_id: admin.business_partner_id,
            },
            av: Number(admin.auth_version || 0),
        }, process.env.JWT_SECRET, { expiresIn: '5m' });

        const marker = Date.now().toString(36);
        const create = await request('/api/admin/categories/software', token, {
            method: 'POST',
            body: JSON.stringify({
                name: `Smoke Kategorie ${marker}`,
                sort_order: 99990,
                is_active: true,
            }),
        });
        if (create.response.status !== 201 || !create.body?.id || create.body.slug !== `smoke-kategorie-${marker}`) {
            throw new Error(`Software-Kategorie konnte nicht angelegt werden (${create.response.status}).`);
        }
        categoryId = create.body.id;

        const duplicate = await request('/api/admin/categories/software', token, {
            method: 'POST',
            body: JSON.stringify({ name: `Andere Kategorie ${marker}`, slug: create.body.slug }),
        });
        if (duplicate.response.status !== 409) {
            throw new Error(`Doppelter Software-Kategorie-Slug wurde nicht abgewiesen (${duplicate.response.status}).`);
        }

        const update = await request(`/api/admin/categories/software/${categoryId}`, token, {
            method: 'PUT',
            body: JSON.stringify({
                name: `Smoke Kategorie bearbeitet ${marker}`,
                slug: `smoke-kategorie-${marker}`,
                sort_order: 99980,
                is_active: false,
            }),
        });
        if (!update.response.ok || update.body?.is_active !== false || Number(update.body?.sort_order) !== 99980) {
            throw new Error(`Software-Kategorie konnte nicht aktualisiert werden (${update.response.status}).`);
        }

        const options = await request(`/api/admin/actions/catalog/options?businessPartnerId=${tool.business_partner_id}`, token);
        const option = Array.isArray(options.body?.categories)
            ? options.body.categories.find((item) => item.id === categoryId)
            : null;
        if (!options.response.ok || option?.is_active !== false) {
            throw new Error('Der Aktivstatus wird nicht bis zur Software-Auswahl übertragen.');
        }

        await db.query(`
            INSERT INTO software_tool_categories (software_tool_id, category_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
        `, [softwareToolId, categoryId]);

        const list = await request('/api/admin/categories/software', token);
        const listed = Array.isArray(list.body) ? list.body.find((item) => item.id === categoryId) : null;
        if (!list.response.ok || Number(listed?.usage_count) !== 1) {
            throw new Error('Die Nutzungsanzeige der Software-Kategorie ist nicht korrekt.');
        }

        const blockedSlugChange = await request(`/api/admin/categories/software/${categoryId}`, token, {
            method: 'PUT',
            body: JSON.stringify({
                name: `Smoke Kategorie bearbeitet ${marker}`,
                slug: `geaenderter-slug-${marker}`,
                sort_order: 99980,
                is_active: false,
            }),
        });
        if (blockedSlugChange.response.status !== 409) {
            throw new Error(`Slug einer verwendeten Software-Kategorie wurde nicht geschützt (${blockedSlugChange.response.status}).`);
        }

        const blockedDelete = await request(`/api/admin/categories/software/${categoryId}`, token, { method: 'DELETE' });
        if (blockedDelete.response.status !== 409) {
            throw new Error(`Verwendete Software-Kategorie wurde nicht geschützt (${blockedDelete.response.status}).`);
        }

        await db.query(
            'DELETE FROM software_tool_categories WHERE software_tool_id = $1 AND category_id = $2',
            [softwareToolId, categoryId]
        );
        const deleted = await request(`/api/admin/categories/software/${categoryId}`, token, { method: 'DELETE' });
        if (!deleted.response.ok) {
            throw new Error(`Unbenutzte Software-Kategorie konnte nicht gelöscht werden (${deleted.response.status}).`);
        }
        categoryId = null;

        console.log(JSON.stringify({
            ok: true,
            centralAdminPage: true,
            slugUniqueness: true,
            activationState: true,
            usageCount: true,
            usedCategorySlugProtected: true,
            usedCategoryDeleteBlocked: true,
            unusedCategoryDeleteAllowed: true,
        }));
    } finally {
        if (categoryId) {
            await db.query('DELETE FROM software_tool_categories WHERE category_id = $1', [categoryId]);
            await db.query('DELETE FROM software_categories WHERE id = $1', [categoryId]);
        }
        await db.end();
    }
}

run().catch((error) => {
    console.error(`[smoke:software-categories] ${error.message}`);
    process.exitCode = 1;
});
