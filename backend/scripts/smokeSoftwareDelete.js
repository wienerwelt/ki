const db = require('../config/db');
const jwt = require('jsonwebtoken');

async function run() {
    if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production') {
        throw new Error('Der Software-Löschtest darf nicht in Produktion laufen.');
    }

    let softwareToolId = null;
    let categoryId = null;
    try {
        const subjectResult = await db.query(`
            SELECT
                u.id AS user_id,
                u.role,
                u.auth_version,
                ms.business_partner_id,
                ms.provider_id
            FROM users u
            JOIN directory_provider_mandant_settings ms
              ON ms.status = 'active'
             AND (u.role = 'admin' OR ms.business_partner_id = u.business_partner_id)
            WHERE u.is_active = true
              AND u.role IN ('admin', 'assistenz')
            ORDER BY CASE WHEN u.role = 'admin' THEN 0 ELSE 1 END, u.created_at
            LIMIT 1
        `);
        const subject = subjectResult.rows[0];
        if (!subject) throw new Error('Kein lokaler Admin/Assistenz-Testnutzer mit aktivem Verzeichnisanbieter verfügbar.');

        const inserted = await db.query(`
            INSERT INTO software_tools (
                business_partner_id, provider_id, name, product_url,
                coverage_scope, country_codes, status, is_active, is_public
            ) VALUES ($1, $2, $3, $4, 'country', ARRAY['AT'], 'draft', true, false)
            RETURNING id
        `, [
            subject.business_partner_id,
            subject.provider_id,
            `Smoke Delete ${Date.now()}`,
            'https://example.invalid/software-delete-smoke',
        ]);
        softwareToolId = inserted.rows[0].id;

        const categoryResult = await db.query('SELECT id FROM software_categories ORDER BY sort_order, name LIMIT 1');
        if (categoryResult.rows[0]) {
            categoryId = categoryResult.rows[0].id;
            await db.query(`
                INSERT INTO software_tool_categories (software_tool_id, category_id)
                VALUES ($1, $2)
            `, [softwareToolId, categoryResult.rows[0].id]);
        }

        const token = jwt.sign({
            user: {
                id: subject.user_id,
                role: subject.role,
                business_partner_id: subject.business_partner_id,
            },
            av: Number(subject.auth_version || 0),
        }, process.env.JWT_SECRET, { expiresIn: '5m' });

        if (!categoryId) throw new Error('Keine Software-Kategorie für den Preismodell-Test verfügbar.');
        const updatePayload = {
            business_partner_id: subject.business_partner_id,
            provider_id: subject.provider_id,
            name: `Smoke Delete ${Date.now()}`,
            product_url: 'https://example.invalid/software-delete-smoke',
            coverage_scope: 'country',
            country_codes: ['AT'],
            status: 'draft',
            is_active: true,
            is_public: false,
            is_featured: false,
            category_ids: [categoryId],
        };
        const invalidPricingResponse = await fetch(`http://127.0.0.1:5000/api/admin/actions/software/${softwareToolId}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...updatePayload, pricing_model: 'Unkontrollierter Freitext' }),
        });
        if (invalidPricingResponse.status !== 400) {
            throw new Error(`Ungültiges Preismodell wurde nicht abgelehnt (${invalidPricingResponse.status}).`);
        }
        const freePricingResponse = await fetch(`http://127.0.0.1:5000/api/admin/actions/software/${softwareToolId}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...updatePayload, pricing_model: 'Kostenlos' }),
        });
        const freePricingBody = await freePricingResponse.json();
        if (!freePricingResponse.ok || freePricingBody.pricing_model !== 'Kostenlos') {
            throw new Error(`Preismodell „Kostenlos“ konnte nicht gespeichert werden (${freePricingResponse.status}).`);
        }

        const response = await fetch(`http://127.0.0.1:5000/api/admin/actions/software/${softwareToolId}/permanent`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        });
        const body = await response.json();
        const remaining = await db.query('SELECT 1 FROM software_tools WHERE id = $1', [softwareToolId]);
        const remainingCategories = await db.query('SELECT 1 FROM software_tool_categories WHERE software_tool_id = $1', [softwareToolId]);

        if (!response.ok || remaining.rows.length > 0 || remainingCategories.rows.length > 0) {
            throw new Error(`Software-Löschtest fehlgeschlagen (${response.status}): ${body.message || 'unbekannt'}`);
        }

        softwareToolId = null;
        console.log(JSON.stringify({ ok: true, status: response.status, message: body.message }));
    } finally {
        if (softwareToolId) {
            await db.query('DELETE FROM software_tools WHERE id = $1', [softwareToolId]);
        }
        await db.end();
    }
}

run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
