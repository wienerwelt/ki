const db = require('../config/db');
const dataController = require('./dataController'); // WICHTIG: Import deines zentralen Controllers

// --- HILFSFUNKTION: Partner ID auflösen ---
async function resolvePartnerIdByCode(code) {
    if (!code || typeof code !== 'string' || code.trim() === '') {
        return null;
    }
    
    const cleanCode = code.trim().toLowerCase();
    
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

// --- STANDARD PUBLIC ROUTEN ---
exports.getPublicContext = async (req, res) => {
    const { partnerCode } = req.query;

    try {
        let partnerData = null;
        let colorScheme = null;

        if (partnerCode && partnerCode !== 'undefined' && partnerCode !== 'null') {
            partnerData = await resolvePartnerIdByCode(partnerCode);
            
            if (partnerData && partnerData.color_scheme_id) {
                const csRes = await db.query('SELECT * FROM color_schemes WHERE id = $1', [partnerData.color_scheme_id]);
                colorScheme = csRes.rows[0];
            }
        }

        let pulseStats = { active_users: 0 };
        try {
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
            newsPreview: [
                { id: '1', title: 'E-Mobilitätsoffensive startet', published_date: new Date().toISOString(), relevance_score: 95 },
                { id: '2', title: 'Neue Förderrichtlinien 2025', published_date: new Date().toISOString(), relevance_score: 88 }
            ]
        });
    } catch (err) {
        console.error('Public Context Error:', err);
        res.json({ partner: null, theme: null, pulse: { active_users: 0 } });
    }
};

exports.getPublicWidgetData = async (req, res) => {
    res.json({ message: "Mock Data" });
};

// --- KONTAKTFORMULAR DER LANDINGPAGE ---
exports.submitContactForm = async (req, res) => {
    const { name, org, email, audience, message, website, type = 'demo_request' } = req.body;

    // HONEYPOT: Wenn ein Bot das versteckte "website" Feld ausfüllt -> Ignorieren!
    if (website) {
        console.warn(`[Spam-Schutz] Bot geblockt. IP: ${req.ip}`);
        return res.status(200).json({ message: 'Erfolgreich gesendet.' });
    }

    if (!name || !email || !message) {
        return res.status(400).json({ message: 'Bitte füllen Sie alle Pflichtfelder aus.' });
    }

    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    const userAgent = req.headers['user-agent'];
    const title = `Landingpage Anfrage (${type})`;

    try {
        const query = `
            INSERT INTO feedback_items 
            (type, title, description, name, organization, email, audience, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `;
        const values = [type, title, message, name, org, email, audience, ipAddress, userAgent];
        
        await db.query(query, values);

        res.status(200).json({ message: 'Anfrage erfolgreich gesendet.' });
    } catch (err) {
        console.error('Fehler beim Speichern der Kontaktanfrage:', err);
        res.status(500).json({ message: 'Ein interner Fehler ist aufgetreten.' });
    }
};

// ==============================================================================
// PUBLIC WRAPPER FÜR LIVE-DATEN AUF DER LANDINGPAGE
// WICHTIG: Setzt ein DUMMY-OBJEKT für req.user, damit Destructuring im 
// dataController nicht zu einem "Fatal Error" (502 Bad Gateway) führt!
// ==============================================================================

// Hilfsobjekt für Standard-Gast-Anfragen
const dummyGuestUser = { id: null, role: 'guest', business_partner_id: null };

exports.getPublicSentiment = async (req, res) => {
    req.user = dummyGuestUser;
    return dataController.getMarketSentiment(req, res);
};

exports.getPublicEvents = async (req, res) => {
    req.user = dummyGuestUser;
    // Begrenze Public-Events sicherheitshalber auf 5 (damit Konkurrenten nicht alles scrapen)
    req.query.limit = 5; 
    return dataController.getEnhancedCalendarEvents(req, res);
};

exports.getPublicHolidays = async (req, res) => {
    req.user = dummyGuestUser;
    return dataController.getPublicHolidays(req, res);
};

exports.getPublicRegions = async (req, res) => {
    req.user = dummyGuestUser;
    return dataController.getAllRegions(req, res);
};

exports.getPublicCommodities = async (req, res) => {
    req.user = dummyGuestUser;
    return dataController.getCommodityPrices(req, res);
};

// NEU: Daily Briefing für die Public Page
exports.getPublicDailyBriefing = async (req, res) => {
    // Hier MÜSSEN wir die business_partner_id aus den Parametern in den Mock-User packen,
    // da getDailyBriefing diese zwingend voraussetzt.
    req.user = { 
        id: null, 
        role: 'guest', 
        business_partner_id: req.query.partnerId || null 
    };
    return dataController.getDailyBriefing(req, res);
};