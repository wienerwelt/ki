const db = require('../config/db');
const jwt = require('jsonwebtoken');

async function run() {
    if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production') {
        throw new Error('Der Rating-Smoke-Test darf nicht in Produktion laufen.');
    }

    let testSubject;
    try {
        const subjectResult = await db.query(`
            SELECT
                u.id,
                u.role,
                u.business_partner_id,
                st.id AS software_tool_id
            FROM software_tools st
            JOIN users u ON u.business_partner_id = st.business_partner_id
            LEFT JOIN software_ratings sr
              ON sr.software_tool_id = st.id
             AND sr.business_partner_id = st.business_partner_id
             AND sr.user_id = u.id
            WHERE st.status = 'published'
              AND st.is_active = true
              AND u.role <> 'demo'
              AND sr.id IS NULL
            LIMIT 1
        `);
        testSubject = subjectResult.rows[0];
        if (!testSubject) throw new Error('Kein unbewerteter lokaler Testnutzer verfügbar.');

        const token = jwt.sign({
            user: {
                id: testSubject.id,
                role: testSubject.role,
                business_partner_id: testSubject.business_partner_id,
            },
        }, process.env.JWT_SECRET, { expiresIn: '5m' });

        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
        const ratingResponse = await fetch(`http://127.0.0.1:5000/api/software/${testSubject.software_tool_id}/rating`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ rating: 4 }),
        });
        const ratingBody = await ratingResponse.json();
        const catalogResponse = await fetch('http://127.0.0.1:5000/api/software', { headers });
        const catalogBody = await catalogResponse.json();
        const catalogEntry = (catalogBody.data || []).find((entry) => entry.id === testSubject.software_tool_id);

        if (!ratingResponse.ok || !catalogResponse.ok || ratingBody.my_rating !== 4 || catalogEntry?.my_rating !== 4) {
            throw new Error(`Rating-Smoke-Test fehlgeschlagen (${ratingResponse.status}/${catalogResponse.status}).`);
        }

        console.log(JSON.stringify({
            ratingStatus: ratingResponse.status,
            catalogStatus: catalogResponse.status,
            myRating: catalogEntry.my_rating,
            averageRating: catalogEntry.average_rating,
        }));
    } finally {
        if (testSubject) {
            await db.query(`
                DELETE FROM software_ratings
                WHERE software_tool_id = $1
                  AND business_partner_id = $2
                  AND user_id = $3
            `, [testSubject.software_tool_id, testSubject.business_partner_id, testSubject.id]);
        }
        await db.end();
    }
}

run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
