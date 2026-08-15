const jwt = require('jsonwebtoken');
const db = require('../config/db');

const main = async () => {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET fehlt.');

    const { rows } = await db.query(`
        SELECT id, role, business_partner_id
        FROM users
        WHERE business_partner_id IS NOT NULL AND is_active = TRUE
        ORDER BY created_at ASC
        LIMIT 1
    `);
    const user = rows[0];
    if (!user) throw new Error('Kein aktiver Community-Benutzer für den Smoke-Test vorhanden.');

    const token = jwt.sign({
        id: user.id,
        role: user.role,
        business_partner_id: user.business_partner_id,
    }, process.env.JWT_SECRET, { expiresIn: '2m' });
    const headers = { Authorization: `Bearer ${token}` };
    const baseUrl = process.env.SMOKE_API_URL || 'http://127.0.0.1:5000';

    const [profileResponse, membersResponse, commentsResponse] = await Promise.all([
        fetch(`${baseUrl}/api/community/members/${user.id}/profile`, { headers }),
        fetch(`${baseUrl}/api/community/members`, { headers }),
        fetch(`${baseUrl}/api/community/recent-comments`, { headers }),
    ]);
    const [profile, members, comments] = await Promise.all([
        profileResponse.json(), membersResponse.json(), commentsResponse.json(),
    ]);

    if (!profileResponse.ok) throw new Error(profile?.message || `Profil: HTTP ${profileResponse.status}`);
    if (!membersResponse.ok) throw new Error(members?.message || `Mitglieder: HTTP ${membersResponse.status}`);
    if (!commentsResponse.ok) throw new Error(comments?.message || `Kommentare: HTTP ${commentsResponse.status}`);
    if (profile.id !== user.id || !profile.organization_name || !profile.member_since || !Array.isArray(profile.tags)) {
        throw new Error('Das Community-Profil enthält nicht alle harmonisierten Pflichtdaten.');
    }
    if (members.some((member) => !member.organization_name || !member.member_since || !Array.isArray(member.tags))) {
        throw new Error('Die Mitgliederliste enthält unvollständige Profildaten.');
    }
    if (comments.some((comment) => !comment.author_id)) {
        throw new Error('Bei aktuellen Kommentaren fehlt die Benutzer-ID.');
    }

    console.log(JSON.stringify({
        ok: true,
        profileId: profile.id,
        organization: profile.organization_name,
        memberSince: profile.member_since,
        expertiseCount: profile.tags.length,
        memberCount: members.length,
        recentCommentCount: comments.length,
    }, null, 2));
};

main()
    .catch((error) => {
        console.error('[smoke:community-profile]', error.message);
        process.exitCode = 1;
    })
    .finally(() => db.end());
