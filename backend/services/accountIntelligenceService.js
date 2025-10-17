// backend/services/accountIntelligenceService.js
const db = require('../config/db');
const { scrapeQueue } = require('./queueService');

async function triggerNewsSearchForAll() {
    console.log('[AccountIntelligence] Starte die Erstellung von News-Such-Jobs...');
    try {
        // 1. Alle Accounts mit ihren Wettbewerbern laden
        const { rows: accounts } = await db.query(`
            SELECT 
                acc.id, 
                acc.name,
                (
                    SELECT COALESCE(json_agg(json_build_object('id', comp.id, 'name', comp.name)), '[]'::json)
                    FROM business_partner_competitors comp
                    WHERE comp.account_id = acc.id
                ) as competitors
            FROM business_partner_accounts acc
            WHERE acc.is_active = TRUE;
        `);

        if (accounts.length === 0) {
            console.log('[AccountIntelligence] Keine aktiven Accounts gefunden. Beende Job-Erstellung.');
            return;
        }

        let jobCount = 0;
        // 2. Jobs für jeden Account und jeden Wettbewerber erstellen
        for (const account of accounts) {
            // Job für den Account selbst
            await scrapeQueue.add('news-keyword-search', {
                search_term: account.name,
                account_id: account.id
            });
            jobCount++;

            // Jobs für die Wettbewerber
            for (const competitor of account.competitors) {
                await scrapeQueue.add('news-keyword-search', {
                    search_term: competitor.name,
                    account_id: account.id,
                    competitor_name: competitor.name
                });
                jobCount++;
            }
        }
        console.log(`[AccountIntelligence] ${jobCount} News-Such-Jobs erfolgreich zur Warteschlange hinzugefügt.`);

    } catch (error) {
        console.error('[AccountIntelligence] Kritischer Fehler bei der Erstellung der News-Such-Jobs:', error);
    }
}

module.exports = { triggerNewsSearchForAll };