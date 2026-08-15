const jwt = require('jsonwebtoken');
const db = require('../config/db');

const createToken = (user) => jwt.sign({
    id: user.id,
    username: user.username,
    role: user.role,
    business_partner_id: user.business_partner_id,
}, process.env.JWT_SECRET, { expiresIn: '2m' });

const getJson = async (url, token) => {
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message || `HTTP ${response.status}`);
    return data;
};

const main = async () => {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET fehlt.');

    const { rows: assistants } = await db.query(`
        SELECT id, username, role, business_partner_id
        FROM users
        WHERE role = 'assistenz' AND business_partner_id IS NOT NULL AND is_active = TRUE
        ORDER BY created_at ASC
        LIMIT 1
    `);
    const assistant = assistants[0];
    if (!assistant) throw new Error('Keine aktive Assistenz mit Mandant fÃ¼r den Smoke-Test vorhanden.');

    const { rows: outsideUsers } = await db.query(`
        SELECT id, email
        FROM users
        WHERE business_partner_id IS DISTINCT FROM $1
          AND email IS NOT NULL
        ORDER BY created_at ASC
        LIMIT 1
    `, [assistant.business_partner_id]);
    const outsideUser = outsideUsers[0];
    if (!outsideUser) throw new Error('Kein Benutzer auÃŸerhalb des Assistenz-Mandanten fÃ¼r den Schutztest vorhanden.');

    const baseUrl = process.env.SMOKE_API_URL || 'http://127.0.0.1:5000';
    const assistantToken = createToken(assistant);
    const [firstPage, secondPage] = await Promise.all([
        getJson(`${baseUrl}/api/admin/users?page=1&limit=50`, assistantToken),
        getJson(`${baseUrl}/api/admin/users?page=2&limit=50`, assistantToken),
    ]);
    const target = secondPage.users?.[0];
    if (!target?.id || !target?.email) {
        throw new Error('Der Assistenz-Mandant benÃ¶tigt mehr als 50 Benutzer fÃ¼r diesen Suchtest.');
    }
    if (firstPage.users?.some((user) => user.id === target.id)) {
        throw new Error('Der Testbenutzer ist bereits auf der ersten Listenseite sichtbar.');
    }

    const targetResult = await getJson(
        `${baseUrl}/api/admin/users?limit=1&search=${encodeURIComponent(target.email)}`,
        assistantToken,
    );
    if (targetResult.total_count !== 1 || targetResult.users?.[0]?.id !== target.id) {
        throw new Error('Die serverseitige Suche findet den Benutzer auÃŸerhalb der geladenen Seite nicht eindeutig.');
    }

    const outsideResult = await getJson(
        `${baseUrl}/api/admin/users?limit=1&search=${encodeURIComponent(outsideUser.email)}`,
        assistantToken,
    );
    if (outsideResult.total_count !== 0 || outsideResult.users?.length !== 0) {
        throw new Error('Die Assistenz-Suche hat die Mandantengrenze Ã¼berschritten.');
    }

    console.log(JSON.stringify({
        ok: true,
        assistantId: assistant.id,
        businessPartnerId: assistant.business_partner_id,
        foundUserId: target.id,
        targetWasBeyondFirstPage: true,
        crossTenantResultCount: outsideResult.total_count,
    }, null, 2));
};

main()
    .catch((error) => {
        console.error('[smoke:admin-user-search]', error.message);
        process.exitCode = 1;
    })
    .finally(() => db.end());
