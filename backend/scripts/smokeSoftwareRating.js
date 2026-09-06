const db = require('../config/db');
const jwt = require('jsonwebtoken');

async function run() {
    if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production') {
        throw new Error('Der Rating-Smoke-Test darf nicht in Produktion laufen.');
    }

    let testSubject;
    let directorySubject;
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
        const missingContextResponse = await fetch(`http://127.0.0.1:5000/api/software/${testSubject.software_tool_id}/rating`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ rating: 4 }),
        });
        if (missingContextResponse.status !== 400) {
            throw new Error(`Bewertung ohne Erfahrungskontext wurde nicht abgewiesen (${missingContextResponse.status}).`);
        }

        const ratingResponse = await fetch(`http://127.0.0.1:5000/api/software/${testSubject.software_tool_id}/rating`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ rating: 4, experienceLevel: 'evaluated' }),
        });
        const ratingBody = await ratingResponse.json();
        const catalogResponse = await fetch('http://127.0.0.1:5000/api/software', { headers });
        const catalogBody = await catalogResponse.json();
        const catalogEntry = (catalogBody.data || []).find((entry) => entry.id === testSubject.software_tool_id);

        if (!ratingResponse.ok || !catalogResponse.ok || ratingBody.my_rating !== 4
            || ratingBody.my_experience_level !== 'evaluated'
            || catalogEntry?.my_rating !== 4 || catalogEntry?.my_experience_level !== 'evaluated') {
            throw new Error(`Rating-Smoke-Test fehlgeschlagen (${ratingResponse.status}/${catalogResponse.status}).`);
        }

        const directorySubjectResult = await db.query(`
            SELECT
                u.id,
                u.role,
                u.business_partner_id,
                ms.provider_id
            FROM directory_provider_mandant_settings ms
            JOIN users u ON u.business_partner_id = ms.business_partner_id
            LEFT JOIN directory_provider_reviews review
              ON review.provider_id = ms.provider_id
             AND review.user_id = u.id
            WHERE ms.status = 'active'
              AND u.role <> 'demo'
              AND review.id IS NULL
            LIMIT 1
        `);
        directorySubject = directorySubjectResult.rows[0];
        if (!directorySubject) throw new Error('Kein unbewerteter Anbieter für den Verzeichnis-Smoke-Test verfügbar.');

        const directoryToken = jwt.sign({
            user: {
                id: directorySubject.id,
                role: directorySubject.role,
                business_partner_id: directorySubject.business_partner_id,
            },
        }, process.env.JWT_SECRET, { expiresIn: '5m' });
        const directoryHeaders = { Authorization: `Bearer ${directoryToken}`, 'Content-Type': 'application/json' };
        const invalidDirectoryResponse = await fetch(`http://127.0.0.1:5000/api/directory/internal/${directorySubject.provider_id}/reviews`, {
            method: 'POST',
            headers: directoryHeaders,
            body: JSON.stringify({ rating: 4, comment: 'Smoke-Test' }),
        });
        if (invalidDirectoryResponse.status !== 400) {
            throw new Error(`Anbieterbewertung ohne Erfahrungskontext wurde nicht abgewiesen (${invalidDirectoryResponse.status}).`);
        }

        const directoryRatingResponse = await fetch(`http://127.0.0.1:5000/api/directory/internal/${directorySubject.provider_id}/reviews`, {
            method: 'POST',
            headers: directoryHeaders,
            body: JSON.stringify({ rating: 4, comment: 'Smoke-Test', experienceLevel: 'in_use' }),
        });
        const directoryReviewResponse = await fetch(`http://127.0.0.1:5000/api/directory/internal/${directorySubject.provider_id}/reviews`, {
            headers: directoryHeaders,
        });
        const directoryReviews = await directoryReviewResponse.json();
        const directoryReview = Array.isArray(directoryReviews)
            ? directoryReviews.find((review) => review.user_id === directorySubject.id)
            : null;
        if (!directoryRatingResponse.ok || !directoryReviewResponse.ok || directoryReview?.experience_level !== 'in_use') {
            throw new Error(`Verzeichnis-Smoke-Test fehlgeschlagen (${directoryRatingResponse.status}/${directoryReviewResponse.status}).`);
        }

        console.log(JSON.stringify({
            ratingStatus: ratingResponse.status,
            catalogStatus: catalogResponse.status,
            myRating: catalogEntry.my_rating,
            experienceLevel: catalogEntry.my_experience_level,
            averageRating: catalogEntry.average_rating,
            directoryRatingStatus: directoryRatingResponse.status,
            directoryExperienceLevel: directoryReview.experience_level,
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
        if (directorySubject) {
            await db.query(`
                DELETE FROM directory_provider_reviews
                WHERE provider_id = $1 AND user_id = $2
            `, [directorySubject.provider_id, directorySubject.id]);
        }
        await db.end();
    }
}

run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
