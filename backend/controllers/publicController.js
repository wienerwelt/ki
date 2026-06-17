// backend/controllers/publicController.js
const db = require('../config/db');
const dataController = require('./dataController');

// --- HILFSFUNKTIONEN ---
const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

async function resolvePartnerIdByCode(code) {
    if (!code || typeof code !== 'string' || code.trim() === '') return null;
    
    const cleanCode = code.trim().toLowerCase();
    // Erweitert: Erlaubt jetzt auch Binde- und Unterstriche für Slugs (z.B. "stadt-wien")
    if (!/^[a-z0-9-_]+$/i.test(cleanCode)) return null;
    
    try {
        // SUCHT JETZT NACH ID *ODER* SLUG
        const r = await db.query(
            `SELECT id, name, logo_url, dashboard_title, color_scheme_id, url_businesspartner 
             FROM business_partners 
             WHERE (LOWER(RIGHT(id::text, 8)) = $1 OR LOWER(slug) = $1) 
               AND is_active = true 
             LIMIT 1`,
            [cleanCode]
        );
        return r.rows[0] || null;
    } catch (err) {
        console.error("Datenbankfehler bei Partner-Lookup:", err.message);
        return null;
    }
}

// ==============================================================================
// 1. BRANDING & INITIAL-LADEN (Für die Landingpage)
// ==============================================================================
exports.getPublicContext = async (req, res) => {
    const { partnerCode } = req.query;

    try {
        let partnerData = null;
        let colorScheme = null;
        let allowedWidgets = []; 
        let defaultRegionCode = 'AT'; 
        let stats = { total_directory_entries: 0, community_members: 0, community_activity: 0 };

        if (partnerCode && partnerCode !== 'undefined' && partnerCode !== 'null') {
            partnerData = await resolvePartnerIdByCode(partnerCode);
            
            if (partnerData) {
                // Farbschema laden
                if (partnerData.color_scheme_id && isValidUUID(partnerData.color_scheme_id)) {
                    try {
                        const csRes = await db.query('SELECT * FROM color_schemes WHERE id = $1', [partnerData.color_scheme_id]);
                        colorScheme = csRes.rows[0];
                    } catch (e) { console.error('Farbschema-Fehler:', e.message); }
                }

                // Default Region laden
                try {
                    const regionRes = await db.query(`
                        SELECT r.code FROM business_partner_regions bpr
                        JOIN regions r ON bpr.region_id = r.id
                        WHERE bpr.business_partner_id = $1 AND bpr.is_default = true LIMIT 1
                    `, [partnerData.id]);
                    if (regionRes.rows.length > 0) defaultRegionCode = regionRes.rows[0].code;
                } catch(e) { console.error('Region-Fehler:', e.message); }

                // Widgets laden
                try {
                    const widgetRes = await db.query(`
                        SELECT wt.type_key, wt.name, wt.config, wt.component_key
                        FROM business_partner_widget_access bpwa
                        JOIN widget_types wt ON bpwa.widget_type_id = wt.id
                        WHERE bpwa.business_partner_id = $1 AND bpwa.is_public = true
                        ORDER BY bpwa.sort_order ASC
                    `, [partnerData.id]);
                    allowedWidgets = widgetRes.rows;
                } catch(e) { console.error('Widget-Fehler:', e.message); }

                // 1. Verzeichnis-Einträge zählen               
                try {
                    const dirCount = await db.query(`SELECT COUNT(*) as count FROM directory_provider_mandant_settings WHERE business_partner_id = $1 AND status = 'active'`, [partnerData.id]);
                    stats.total_directory_entries = parseInt(dirCount.rows[0].count, 10);
                } catch(e) { 
                    console.error('Fehler beim Zählen der Verzeichnis-Einträge:', e.message); 
                }

                // 2. Registrierte User zählen (jetzt für den "Für Mitglieder" Reiter)
                try {
                    const userCount = await db.query(`SELECT COUNT(*) as count FROM users WHERE business_partner_id = $1`, [partnerData.id]);
                    stats.community_members = parseInt(userCount.rows[0].count, 10);
                } catch(e) { 
                    console.error('Fehler beim Zählen der User:', e.message); 
                }

                // 3. Community-Aktivität zählen (Beiträge + Kommentare kombiniert)
                try {
                    const activityCount = await db.query(`
                        SELECT 
                            (SELECT COUNT(*) FROM community_posts WHERE business_partner_id = $1) +
                            (SELECT COUNT(cc.id) FROM community_comments cc JOIN community_posts cp ON cc.post_id = cp.id WHERE cp.business_partner_id = $1) AS count
                    `, [partnerData.id]);
                    stats.community_activity = parseInt(activityCount.rows[0].count, 10);
                } catch(e) { 
                    console.error('Fehler beim Zählen der Community-Aktivität:', e.message); 
                }
            }
        }

        res.json({
            partner: partnerData,
            theme: colorScheme,
            stats: stats,
            allowedWidgets: allowedWidgets,
            defaultRegion: defaultRegionCode,
            newsPreview: [
                { id: '1', title: 'E-Mobilitätsoffensive startet', published_date: new Date().toISOString(), relevance_score: 95 },
                { id: '2', title: 'Neue Förderrichtlinien 2026', published_date: new Date().toISOString(), relevance_score: 88 }
            ]
        });
    } catch (err) {
        console.error('Public Context Error:', err);
        res.status(500).json({ partner: null, theme: null, stats: { total_directory_entries: 0, community_members: 0 }, allowedWidgets: [], defaultRegion: 'AT' });
    }
};


// ==============================================================================
// 2. KONTAKTFORMULAR (Spam-Schutz)
// ==============================================================================
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
// 3. DER GENERIC WIDGET HUB (Türsteher & Verteiler)
// ==============================================================================
exports.getGenericWidgetData = async (req, res) => {
    const { widgetKey } = req.params;
    const { partnerId } = req.query;

    // --- 1. GAST-MODUS / SYSTEM STANDBY (Keine Partner-ID) ---
    // Wenn die PublicPortalPage ohne Partner geladen wird, senden die Widgets "undefined".
    // Wir dürfen hier keinen 400er Fehler werfen, sonst stürzt das React-Frontend ab!
    if (!partnerId || partnerId === 'undefined' || partnerId === 'null') {
        switch (widgetKey) {
            case 'business-partner-actions':
            case 'BusinessPartnerActionsWidget':
            case 'BusinessPartnerAktionen':
                return res.json({ data: [] });
            case 'funding_widget':
            case 'FundingWidget':
            case 'Funding':
                return res.json({
                    profile_incomplete: false,
                    opportunities: [
                        { id: 'mock-1', title: 'Transformations-Förderung Elektromobilität', deadline_end: '2026-12-31', match_count: 5, categories: ['E-Mobilität', 'KMU'] },
                        { id: 'mock-2', title: 'Ladeinfrastruktur für Betriebe (Klimafonds)', deadline_end: null, match_count: 3, categories: ['Infrastruktur', 'Gewerbe'] },
                        { id: 'mock-3', title: 'Flottenumstellung auf Null-Emission', deadline_end: '2026-06-30', match_count: 2, categories: ['Flotte', 'Innovation'] }
                    ]
                });
            case 'survey_widget':
                return res.json({ data: [{ id: 1, title: "Wie bewerten Sie die aktuelle Ladeinfrastruktur?", votes: 142 }] });
            default:
                return res.json({ data: [] });
        }
    }

    // --- 2. VALIDIERUNG ECHTE PARTNER-ID ---
    if (!isValidUUID(partnerId)) {
        return res.status(400).json({ message: "Ungültige oder fehlende Partner-ID." });
    }

    try {
        // --- DER TÜRSTEHER (Security Check) ---
        const accessCheck = await db.query(`
            SELECT 1 FROM business_partner_widget_access bpwa
            JOIN widget_types wt ON bpwa.widget_type_id = wt.id
            WHERE bpwa.business_partner_id = $1 
              AND wt.type_key = $2 
              AND bpwa.is_public = true
        `, [partnerId, widgetKey]);

        if (accessCheck.rows.length === 0) {
            console.warn(`[Security] Blocked public access for widget ${widgetKey} (Partner: ${partnerId})`);
            return res.status(403).json({ message: "Zugriff verweigert. Widget nicht public." });
        }

        // --- GAST-USER MOCK FÜR DEN DATACONTROLLER ---
        req.user = { 
            id: null, 
            role: 'guest', 
            business_partner_id: partnerId 
        };

        // --- DER VERTEILER (Data Fetching) ---
        switch (widgetKey) {
            
            case 'business-partner-actions':
            case 'BusinessPartnerActionsWidget':
            case 'BusinessPartnerAktionen': { // WICHTIG: Geschweifte Klammern { } eingefügt, um Node.js Scope-Fehler zu vermeiden!
                const actionsRes = await db.query(`
                    SELECT id, layout_type, title, content_text, link_url, image_url, created_at 
                    FROM business_partner_actions 
                    WHERE business_partner_id = $1 ORDER BY created_at DESC LIMIT 10
                `, [partnerId]);
                return res.json({ data: actionsRes.rows });
            }

            case 'sentiment_widget':
                return dataController.getMarketSentiment(req, res);

            case 'CommodityPrices':
                return dataController.getCommodityPrices(req, res);

            case 'daily_cockpit':
                return dataController.getDailyBriefing(req, res);

            case 'EventCalendar':
                req.query.limit = 5; 
                return dataController.getEnhancedCalendarEvents(req, res);

            case 'EVStation':
                return res.json({ data: [] });

            default:
                console.warn(`Hub aufgerufen für bekanntes Widget '${widgetKey}', aber keine Logik im Switch-Block hinterlegt.`);
                return res.json({ data: [] });
        }

    } catch (err) {
        console.error(`[Hub Error] Widget: ${widgetKey} -`, err.message);
        return res.status(500).json({ message: "Interner Server-Fehler bei der Widget-Datenabfrage." });
    }
};

// ==============================================================================
// 4. RÜCKWÄRTSKOMPATIBILITÄT (Legacy Wrapper für bestehende Frontend-Widgets)
// ==============================================================================

const dummyGuestUser = { id: null, role: 'guest', business_partner_id: null };

exports.getPublicEconomicStatistics = async (req, res) => {
    req.user = dummyGuestUser; // Simuliert einen Gast-Nutzer
    return dataController.getEconomicStatistics(req, res);
};

exports.getPublicEconomicStatCountries = async (req, res) => {
    req.user = dummyGuestUser; // Simuliert einen Gast-Nutzer
    return dataController.getUniqueStatCountries(req, res);
};

exports.getPublicRegions = async (req, res) => {
    req.user = dummyGuestUser;
    return dataController.getAllRegions(req, res);
};

exports.getPublicEvents = async (req, res) => {
    req.user = dummyGuestUser;
    // Kalender-Events für Public (Frontend schickt aktuell limit=50)
    return dataController.getEnhancedCalendarEvents(req, res);
};

exports.getPublicHolidays = async (req, res) => {
    req.user = dummyGuestUser;
    return dataController.getPublicHolidays(req, res);
};

exports.getPublicCommodities = async (req, res) => {
    req.user = dummyGuestUser;
    return dataController.getCommodityPrices(req, res);
};

exports.getPublicSentiment = async (req, res) => {
    req.user = dummyGuestUser;
    return dataController.getMarketSentiment(req, res);
};

exports.getPublicDailyBriefing = async (req, res) => {
    // Hier ist die Partner-ID wichtig für das KI Briefing
    req.user = { id: null, role: 'guest', business_partner_id: req.query.partnerId || null };
    return dataController.getDailyBriefing(req, res);
};

exports.getPublicActions = async (req, res) => {
    // Leitet den alten /actions Aufruf einfach an unseren neuen Hub weiter!
    req.params.widgetKey = 'business-partner-actions';
    return exports.getGenericWidgetData(req, res);
};


// ==============================================================================
// 5. PUBLIC DIRECTORY (Für das Schaufenster / Landingpage)
// ==============================================================================
// backend/controllers/publicController.js (Auszug für getPublicDirectory)
exports.getPublicDirectory = async (req, res) => {
    const { partnerId, search, category, region, page = 1, limit = 12 } = req.query;
    const offset = (page - 1) * limit;

    try {
        let baseQuery = `
            SELECT 
                p.id, p.name, p.logo_url, p.description, p.website_url, p.contact_email, p.contact_phone,
                c.name AS category,
                ROUND(COALESCE(r.avg_rating, 0), 1) as average_rating,
                COALESCE(r.rev_count, 0) as review_count,
                COALESCE(ms.is_recommended, false) as is_recommended,
                COALESCE((
                    SELECT json_agg(json_build_object('address', l.address, 'zip_code', l.zip_code, 'city', l.city)) 
                    FROM directory_provider_locations l WHERE l.provider_id = p.id
                ), '[]'::json) as locations
            FROM directory_providers p
            INNER JOIN directory_provider_mandant_settings ms ON p.id = ms.provider_id 
            LEFT JOIN (
                SELECT provider_id, AVG(rating) as avg_rating, COUNT(id) as rev_count 
                FROM directory_provider_reviews GROUP BY provider_id
            ) r ON p.id = r.provider_id
            LEFT JOIN directory_provider_categories dpc ON p.id = dpc.provider_id AND dpc.is_primary = true
            LEFT JOIN categories c ON dpc.category_id = c.id
            WHERE ms.business_partner_id = $1 AND ms.status = 'active'
        `;

        const values = [partnerId];
        let paramIndex = 2;

        // Dynamische Filter
        if (search) {
            baseQuery += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
            values.push(`%${search}%`);
            paramIndex++;
        }

        if (category && category !== 'all') {
            baseQuery += ` AND c.name = $${paramIndex}`;
            values.push(category);
            paramIndex++;
        }

        // Hinweis: Region-Filter erfordert einen JOIN oder Subselect auf die Locations. 
        // Für Performance idealerweise über PostGIS oder einfache ILIKE auf die City.

        baseQuery += ` ORDER BY ms.is_recommended DESC, p.name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await db.query(baseQuery, values);
        
        // Optional: Count-Query für Pagination mitsenden
        res.json({ data: result.rows, page: Number(page), limit: Number(limit) });
    } catch (err) {
        console.error('Fehler beim Laden des Public Directory:', err.message);
        res.status(500).json({ message: "Fehler beim Laden des Netzwerks." });
    }
};

// ==============================================================================
// 6. PUBLIC PARTNER CARD
// ==============================================================================
exports.getPublicPartnerCard = async (req, res) => {
    const { id } = req.params;

    if (!id || !/^[0-9a-fA-F-]{36}$/.test(id)) {
        return res.status(400).json({ message: 'Ungültige ID.' });
    }

    try {
        const query = `
            SELECT 
                bp.id, 
                bp.name, 
                bp.slug,
                bp.logo_url, 
                bp.dashboard_title,
                cs.primary_color, 
                RIGHT(bp.id::text, 8) as voucher_code
            FROM business_partners bp
            LEFT JOIN color_schemes cs ON bp.color_scheme_id = cs.id
            WHERE bp.id = $1 AND bp.is_active = TRUE
        `;
        
        const { rows } = await db.query(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Partner nicht gefunden oder inaktiv.' });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error('Fehler beim Laden der Public BP Card:', err.message);
        res.status(500).json({ message: 'Serverfehler' });
    }
};