const db = require('../config/db');

// Hilfsfunktion: Partner ID auflösen
async function resolvePartnerIdByCode(code) {
    // FIX: Sofort abbrechen, wenn Code leer oder undefined ist
    if (!code || typeof code !== 'string' || code.trim() === '') {
        return null;
    }
    
    const cleanCode = code.trim().toLowerCase();
    
    // Sicherheit: Nur alphanumerische Codes zulassen, um SQL-Injection Risiken zu minimieren
    if (!/^[a-z0-9]+$/i.test(cleanCode)) {
        return null;
    }

    try {
        const r = await db.query(
            'SELECT id, name, logo_url, dashboard_title, color_scheme_id FROM business_partners WHERE LOWER(RIGHT(id::text, 8)) = $1 LIMIT 1',
            [cleanCode]
        );
        return r.rows[0] || null;
    } catch (err) {
        console.error("Datenbankfehler bei Partner-Lookup:", err.message);
        return null;
    }
}

exports.getPublicContext = async (req, res) => {
    const { partnerCode } = req.query;

    try {
        let partnerData = null;
        let colorScheme = null;

        // 1. Partner laden (falls Code vorhanden)
        if (partnerCode && partnerCode !== 'undefined' && partnerCode !== 'null') {
            partnerData = await resolvePartnerIdByCode(partnerCode);
            
            if (partnerData && partnerData.color_scheme_id) {
                const csRes = await db.query('SELECT * FROM color_schemes WHERE id = $1', [partnerData.color_scheme_id]);
                colorScheme = csRes.rows[0];
            }
        }

        // 2. Pulse Statistiken (Fehler in SQL abfangen)
        let pulseStats = { active_users: 0 };
        try {
            // Wir zählen Logins der letzten 24h als "active_users"
            const statsRes = await db.query(`
                SELECT count(*) as count 
                FROM users 
                WHERE last_login_at > NOW() - INTERVAL '24 hours'
            `);
            pulseStats.active_users = parseInt(statsRes.rows[0]?.count || 0, 10);
        } catch (e) {
            console.warn("Konnte Pulse-Stats nicht laden:", e.message);
        }

        res.json({
            partner: partnerData,
            theme: colorScheme,
            pulse: pulseStats,
            // Mock News für Ghost Widgets
            newsPreview: [
                { id: '1', title: 'E-Mobilitätsoffensive startet', published_date: new Date().toISOString(), relevance_score: 95 },
                { id: '2', title: 'Neue Förderrichtlinien 2025', published_date: new Date().toISOString(), relevance_score: 88 }
            ]
        });
    } catch (err) {
        console.error('Public Context Error:', err);
        // WICHTIG: Kein 500er werfen, sondern Fallback senden, damit Login trotzdem geht
        res.json({ partner: null, theme: null, pulse: { active_users: 0 } });
    }
};

exports.getPublicWidgetData = async (req, res) => {
    res.json({ message: "Mock Data" });
};