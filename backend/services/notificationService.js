const db = require('../config/db');
const { sendNewOpportunitiesNotification } = require('./emailService');
const { ACTIVE_MEMBERSHIP_SQL } = require('../utils/membershipExpiry');

const findNewOpportunitiesForSearch = async (search) => {
    const { search_criteria } = search;
    // Hier verwenden wir eine vereinfachte Version der searchFunding-Logik
    const queryParams = [search.last_notified_at || new Date('1970-01-01')];
    let whereClauses = ["f.created_at > $1"];

    if (search_criteria.q) {
        queryParams.push(`%${search_criteria.q}%`);
        whereClauses.push(`(f.title ILIKE $${queryParams.length})`);
    }
    // Fügen Sie hier weitere Filter aus search_criteria hinzu...

    const query = `
        SELECT id, title FROM funding_opportunities f
        WHERE ${whereClauses.join(' AND ')}
    `;

    const { rows } = await db.query(query, queryParams);
    return rows;
};

const processSavedSearchNotifications = async () => {
    console.log('[NOTIFY] Starte Benachrichtigungs-Job für gespeicherte Suchen...');
    
    const { rows: searches } = await db.query(
        `SELECT usfs.*, u.email, u.username 
         FROM user_saved_funding_searches usfs
         JOIN users u ON usfs.user_id = u.id
         WHERE usfs.notifications_enabled = true
           AND u.is_active = TRUE
           AND ${ACTIVE_MEMBERSHIP_SQL}`
    );

    for (const search of searches) {
        const newOpportunities = await findNewOpportunitiesForSearch(search);

        if (newOpportunities.length > 0) {
            console.log(`[NOTIFY] ${newOpportunities.length} neue Treffer für Suche "${search.search_name}" für ${search.email}`);
            
            await sendNewOpportunitiesNotification({
                to: search.email,
                username: search.username,
                searchName: search.search_name,
                newOpportunities,
                searchCriteria: search.search_criteria
            });
            
            await db.query(
                'UPDATE user_saved_funding_searches SET last_notified_at = NOW() WHERE id = $1',
                [search.id]
            );
        }
    }
    console.log('[NOTIFY] Benachrichtigungs-Job beendet.');
};

module.exports = { processSavedSearchNotifications };
