// backend/controllers/publicController.js
const db = require('../config/db');
const crypto = require('crypto');
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
            `SELECT
                bp.id,
                bp.name,
                bp.logo_url,
                bp.dashboard_title,
                bp.color_scheme_id,
                bp.url_businesspartner,
                COALESCE((
                    SELECT json_agg(
                        jsonb_build_object(
                            'id', c.id,
                            'name', c.name,
                            'name_lang', c.name_lang,
                            'category_type', c.category_type
                        )
                        ORDER BY c.name ASC
                    )
                    FROM business_partner_categories bpc
                    JOIN categories c ON bpc.category_id = c.id
                    WHERE bpc.business_partner_id = bp.id
                      AND c.category_type = 'industry'
                ), '[]'::json) AS industries
             FROM business_partners bp
             WHERE (LOWER(RIGHT(bp.id::text, 8)) = $1 OR LOWER(bp.slug) = $1)
               AND bp.is_active = true
             LIMIT 1`,
            [cleanCode]
        );
        return r.rows[0] || null;
    } catch (err) {
        console.error("Datenbankfehler bei Partner-Lookup:", err.message);
        return null;
    }
}


const PUBLIC_ACTION_WIDGET_KEYS = [
    'BusinessPartnerAktionen',
    'BusinessPartnerActionsWidget',
    'business-partner-actions',
];

const normalizePublicWidgetKey = (widgetKey) => {
    if (PUBLIC_ACTION_WIDGET_KEYS.includes(widgetKey)) {
        // In deiner widget_types Tabelle heißt der echte Key aktuell exakt so:
        return 'BusinessPartnerAktionen';
    }
    return widgetKey;
};

const getWidgetAccessKeys = (widgetKey) => {
    const normalizedWidgetKey = normalizePublicWidgetKey(widgetKey);
    if (normalizedWidgetKey === 'BusinessPartnerAktionen') {
        return PUBLIC_ACTION_WIDGET_KEYS;
    }
    return [normalizedWidgetKey];
};

const toPositiveInt = (value, fallback, max) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, max);
};

const hasPublicWidgetAccess = async (partnerId, widgetKey) => {
    const accessKeys = getWidgetAccessKeys(widgetKey);

    const accessCheck = await db.query(`
        SELECT 1
        FROM business_partner_widget_access bpwa
        JOIN widget_types wt ON bpwa.widget_type_id = wt.id
        WHERE bpwa.business_partner_id = $1
          AND wt.type_key = ANY($2::text[])
          AND bpwa.is_public = true
        LIMIT 1
    `, [partnerId, accessKeys]);

    return accessCheck.rows.length > 0;
};

const loadPublicBusinessPartnerActions = async ({ partnerId, page = 1, limit = 10 }) => {
    const safePage = toPositiveInt(page, 1, 1000);
    const safeLimit = toPositiveInt(limit, 10, 24);
    const offset = (safePage - 1) * safeLimit;

    const result = await db.query(`
        SELECT
            a.id,
            a.layout_type,
            a.title,
            a.content_text,
            a.link_url,
            a.image_url,
            a.created_at,
            a.start_date,
            a.end_date,
            a.promotion_label,
            a.promotion_type,
            a.cta_label,
            a.secondary_image_url,
            a.secondary_link_url,
            a.secondary_cta_label,
            a.priority,
            COALESCE(a.info, '{}'::jsonb) AS info
        FROM business_partner_actions a
        INNER JOIN business_partners bp ON bp.id = a.business_partner_id
        WHERE a.business_partner_id = $1
          AND bp.is_active = true
          AND a.is_active = true
          AND (a.start_date IS NULL OR a.start_date <= NOW())
          AND (a.end_date IS NULL OR a.end_date >= NOW())
        ORDER BY a.priority DESC, a.start_date DESC NULLS LAST, a.created_at DESC
        LIMIT $2 OFFSET $3
    `, [partnerId, safeLimit, offset]);

    return {
        data: result.rows,
        page: safePage,
        limit: safeLimit
    };
};

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
    const normalizedWidgetKey = normalizePublicWidgetKey(widgetKey);

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
        const hasAccess = await hasPublicWidgetAccess(partnerId, normalizedWidgetKey);

        if (!hasAccess) {
            console.warn(`[Security] Blocked public access for widget ${normalizedWidgetKey} (Partner: ${partnerId})`);
            return res.status(403).json({ message: "Zugriff verweigert. Widget nicht public." });
        }

        // --- GAST-USER MOCK FÜR DEN DATACONTROLLER ---
        req.user = { 
            id: null, 
            role: 'guest', 
            business_partner_id: partnerId 
        };

        // --- DER VERTEILER (Data Fetching) ---
        switch (normalizedWidgetKey) {
            
            case 'BusinessPartnerAktionen': {
                const payload = await loadPublicBusinessPartnerActions({
                    partnerId,
                    page: req.query.page,
                    limit: req.query.limit || 10
                });
                return res.json(payload);
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
    const partnerId = isValidUUID(req.query.partnerId) ? req.query.partnerId : null;

    req.user = {
        ...dummyGuestUser,
        business_partner_id: partnerId
    };

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
    const { partnerId } = req.query;

    // KORREKTUR: Wir prüfen explizit auf den String 'undefined' und 'null', da axios diese oft als String URL-codiert
    if (!partnerId || partnerId === 'undefined' || partnerId === 'null' || partnerId.trim() === '') {
        // Leeres Array zurückgeben, anstatt abzubrechen, um Frontend-Crashes zu vermeiden
        return res.json({ data: [] });
    }

    if (!isValidUUID(partnerId)) {
        return res.status(400).json({ message: 'Ungültige oder fehlende Partner-ID.' });
    }

    try {
        const hasAccess = await hasPublicWidgetAccess(partnerId, 'BusinessPartnerAktionen');

        if (!hasAccess) {
            console.warn(`[Security] Blocked public access for BusinessPartnerAktionen/business-partner-actions (Partner: ${partnerId})`);
            // Wir senden auch hier leere Daten, damit die UI nicht kaputt geht
            return res.status(200).json({ data: [] });
        }

        const payload = await loadPublicBusinessPartnerActions({
            partnerId,
            page: req.query.page,
            limit: req.query.limit || 10
        });

        return res.json(payload);
    } catch (err) {
        console.error('Fehler beim Laden öffentlicher Business-Partner-Aktionen:', err.message);
        return res.status(500).json({ message: 'Aktionen konnten nicht geladen werden.' });
    }
};


// ==============================================================================
// PUBLIC EVENT FEED (RSS + JSON) - read-only token based
// ==============================================================================
const hashFeedToken = (token) => crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');

const xmlEscape = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const normalizeFeedArray = (value, fallback = []) => {
    if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
    if (typeof value === 'string') {
        return value
            .replace(/[{}]/g, '')
            .split(',')
            .map(v => v.trim().replace(/^"|"$/g, ''))
            .filter(Boolean);
    }
    return fallback;
};

const getRequestBaseUrl = (req) => {
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    const host = req.get('x-forwarded-host') || req.get('host');
    return `${proto}://${host}`.replace(/\/$/, '');
};

const absoluteUrl = (req, url) => {
    if (!url) return '';
    const clean = String(url).trim();
    if (!clean) return '';
    if (/^https?:\/\//i.test(clean)) return clean;
    const base = getRequestBaseUrl(req);
    return `${base}${clean.startsWith('/') ? clean : `/${clean}`}`;
};

const getEventDateOnly = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
};

const loadFeedByPlainToken = async (token) => {
    if (!token || typeof token !== 'string' || token.length < 24 || token.length > 256) return null;

    const tokenHash = hashFeedToken(token);
    const { rows } = await db.query(
        `SELECT
            id,
            name,
            feed_title,
            token_preview,
            categories,
            regions,
            include_global_events,
            is_active
         FROM public.event_feed_tokens
         WHERE token_hash = $1
           AND is_active = true
           AND revoked_at IS NULL
         LIMIT 1`,
        [tokenHash]
    );

    return rows[0] || null;
};

const touchFeedAccess = async (feedId, req) => {
    try {
        await db.query(
            `UPDATE public.event_feed_tokens
             SET last_used_at = NOW(),
                 last_used_ip = $2,
                 access_count = COALESCE(access_count, 0) + 1
             WHERE id = $1`,
            [feedId, req.ip || req.get('x-forwarded-for') || null]
        );
    } catch (err) {
        console.warn('[EventFeed] Zugriff konnte nicht protokolliert werden:', err.message);
    }
};

const loadPublicFeedEvents = async (feed) => {
    const categories = normalizeFeedArray(feed.categories, ['businesspartner_events', 'fleet_events']);
    const regions = normalizeFeedArray(feed.regions, ['AT', 'CH', 'DE']).map(r => r.toUpperCase());
    const includeGlobalEvents = feed.include_global_events !== false;
    const limit = 100;

    const { rows } = await db.query(
        `SELECT
            sc.id,
            sc.title,
            sc.summary,
            sc.original_url,
            sc.event_date,
            sc.published_date,
            sc.updated_at,
            sc.created_at,
            sc.region,
            sc.category,
            sc.thumbnail_url,
            COALESCE(c.name, sc.category) AS category_name,
            r.code AS region_code,
            COALESCE(r.name, sc.region) AS region_name
         FROM public.scraped_content sc
         LEFT JOIN public.categories c ON sc.category_id = c.id
         LEFT JOIN public.regions r
           ON LOWER(r.code) = LOWER(sc.region)
           OR LOWER(r.name) = LOWER(sc.region)
         WHERE sc.event_date IS NOT NULL
           AND sc.event_date::date >= CURRENT_DATE
           AND COALESCE(NULLIF(sc.category, ''), c.name) = ANY($1::text[])
           AND (
                COALESCE(r.code, UPPER(sc.region)) = ANY($2::text[])
                OR ($3::boolean = true AND (sc.region IS NULL OR TRIM(sc.region) = ''))
           )
         ORDER BY sc.event_date ASC, sc.created_at DESC
         LIMIT $4`,
        [categories, regions, includeGlobalEvents, limit]
    );

    return rows;
};

const buildRssFeed = (req, feed, events) => {
    const baseUrl = getRequestBaseUrl(req);
    const title = feed.feed_title || feed.name || 'Mobiliti Event Feed';
    const now = new Date().toUTCString();

    const items = events.map((event) => {
        const link = absoluteUrl(req, event.original_url) || baseUrl;
        const imageUrl = absoluteUrl(req, event.thumbnail_url);
        const eventDate = getEventDateOnly(event.event_date);
        const pubDate = new Date(event.updated_at || event.created_at || event.published_date || event.event_date || Date.now()).toUTCString();
        const region = event.region_code || event.region_name || event.region || '';
        const category = event.category_name || event.category || '';
        const descriptionParts = [
            eventDate ? `Datum: ${eventDate}` : '',
            region ? `Region: ${region}` : '',
            category ? `Kategorie: ${category}` : '',
            event.summary || ''
        ].filter(Boolean);

        return `
    <item>
      <title>${xmlEscape(event.title)}</title>
      <link>${xmlEscape(link)}</link>
      <guid isPermaLink="false">mobiliti-event-${xmlEscape(event.id)}</guid>
      <pubDate>${xmlEscape(pubDate)}</pubDate>
      <category>${xmlEscape(category)}</category>
      <description>${xmlEscape(descriptionParts.join('\n\n'))}</description>
      <mobiliti:eventDate>${xmlEscape(eventDate || '')}</mobiliti:eventDate>
      <mobiliti:region>${xmlEscape(region)}</mobiliti:region>${imageUrl ? `
      <enclosure url="${xmlEscape(imageUrl)}" type="image/jpeg" />` : ''}
    </item>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:mobiliti="https://mobiliti.at/rss/event-feed">
  <channel>
    <title>${xmlEscape(title)}</title>
    <link>${xmlEscape(baseUrl)}</link>
    <description>${xmlEscape('Zukünftige freigegebene Mobiliti Event-Termine.')}</description>
    <language>de-AT</language>
    <lastBuildDate>${xmlEscape(now)}</lastBuildDate>
    <ttl>15</ttl>${items}
  </channel>
</rss>`;
};

exports.getPublicEventFeedRss = async (req, res) => {
    try {
        const feed = await loadFeedByPlainToken(req.params.token);
        if (!feed) {
            return res.status(404).type('text/plain').send('Feed nicht gefunden oder deaktiviert.');
        }

        const events = await loadPublicFeedEvents(feed);
        await touchFeedAccess(feed.id, req);

        res.set('Content-Type', 'application/rss+xml; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
        return res.status(200).send(buildRssFeed(req, feed, events));
    } catch (err) {
        console.error('[EventFeed RSS] Fehler:', err.message);
        return res.status(500).type('text/plain').send('Feed konnte nicht geladen werden.');
    }
};

exports.getPublicEventFeedJson = async (req, res) => {
    try {
        const feed = await loadFeedByPlainToken(req.params.token);
        if (!feed) {
            return res.status(404).json({ message: 'Feed nicht gefunden oder deaktiviert.' });
        }

        const events = await loadPublicFeedEvents(feed);
        await touchFeedAccess(feed.id, req);

        res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
        return res.json({
            feed: {
                name: feed.name,
                title: feed.feed_title || feed.name,
                categories: normalizeFeedArray(feed.categories),
                regions: normalizeFeedArray(feed.regions),
            },
            generated_at: new Date().toISOString(),
            events: events.map(event => ({
                id: event.id,
                title: event.title,
                date: getEventDateOnly(event.event_date),
                region: event.region_code || event.region_name || event.region || null,
                category: event.category_name || event.category || null,
                summary: event.summary || null,
                url: event.original_url || null,
                image_url: event.thumbnail_url || null,
                updated_at: event.updated_at || event.created_at || null,
            }))
        });
    } catch (err) {
        console.error('[EventFeed JSON] Fehler:', err.message);
        return res.status(500).json({ message: 'Feed konnte nicht geladen werden.' });
    }
};


// ==============================================================================
// 5. PUBLIC DIRECTORY (Für das Schaufenster / Landingpage)
// ==============================================================================
exports.getPublicDirectory = async (req, res) => {
    const { partnerId, search, category, region, page = 1, limit = 12 } = req.query;

    if (!isValidUUID(partnerId)) {
        return res.status(400).json({ message: 'Ungültige oder fehlende Partner-ID.' });
    }

    const safePage = toPositiveInt(page, 1, 1000);
    const safeLimit = toPositiveInt(limit, 12, 24);
    const offset = (safePage - 1) * safeLimit;

    const buildWhereClause = () => {
        const values = [partnerId];
        let paramIndex = 2;
        let whereSql = `
            WHERE ms.business_partner_id = $1
              AND ms.status = 'active'
              AND p.is_public = true
        `;

        const searchTerm = String(search || '').trim();
        if (searchTerm) {
            whereSql += `
              AND (
                p.name ILIKE $${paramIndex}
                OR COALESCE(p.description, '') ILIKE $${paramIndex}
                OR EXISTS (
                    SELECT 1
                    FROM directory_provider_categories dpc_search
                    JOIN categories c_search ON c_search.id = dpc_search.category_id
                    WHERE dpc_search.provider_id = p.id
                      AND (
                        c_search.name ILIKE $${paramIndex}
                        OR COALESCE(c_search.name_lang, '') ILIKE $${paramIndex}
                      )
                )
                OR EXISTS (
                    SELECT 1
                    FROM directory_provider_locations l_search
                    WHERE l_search.provider_id = p.id
                      AND (
                        COALESCE(l_search.city, '') ILIKE $${paramIndex}
                        OR COALESCE(l_search.zip_code, '') ILIKE $${paramIndex}
                        OR COALESCE(l_search.country, '') ILIKE $${paramIndex}
                        OR COALESCE(l_search.address, '') ILIKE $${paramIndex}
                      )
                )
              )
            `;
            values.push(`%${searchTerm}%`);
            paramIndex++;
        }

        const categoryValue = String(category || '').trim();
        if (categoryValue && categoryValue !== 'all') {
            whereSql += `
              AND EXISTS (
                SELECT 1
                FROM directory_provider_categories dpc_filter
                JOIN categories c_filter ON c_filter.id = dpc_filter.category_id
                WHERE dpc_filter.provider_id = p.id
                  AND (
                    c_filter.id::text = $${paramIndex}
                    OR c_filter.name = $${paramIndex}
                    OR COALESCE(c_filter.name_lang, '') = $${paramIndex}
                  )
              )
            `;
            values.push(categoryValue);
            paramIndex++;
        }

        const regionValue = String(region || '').trim();
        if (regionValue && regionValue !== 'all') {
            whereSql += `
              AND EXISTS (
                SELECT 1
                FROM directory_provider_locations l_filter
                WHERE l_filter.provider_id = p.id
                  AND COALESCE(
                        NULLIF(TRIM(l_filter.city), ''),
                        NULLIF(TRIM(l_filter.zip_code), ''),
                        NULLIF(TRIM(l_filter.country), '')
                      ) = $${paramIndex}
              )
            `;
            values.push(regionValue);
            paramIndex++;
        }

        return { whereSql, values, paramIndex };
    };

    try {
        const { whereSql, values, paramIndex } = buildWhereClause();

        const dataQuery = `
            SELECT
                p.id,
                p.name,
                p.logo_url,
                p.description,
                p.website_url,
                p.contact_email,
                p.contact_phone,
                primary_category.name AS category,
                COALESCE(all_categories.categories, '[]'::json) AS categories,
                ROUND(COALESCE(r.avg_rating, 0), 1) AS average_rating,
                COALESCE(r.rev_count, 0) AS review_count,
                COALESCE(ms.is_recommended, false) AS is_recommended,
                COALESCE(locations.locations, '[]'::json) AS locations
            FROM directory_providers p
            INNER JOIN directory_provider_mandant_settings ms ON p.id = ms.provider_id
            LEFT JOIN (
                SELECT provider_id, AVG(rating) AS avg_rating, COUNT(id) AS rev_count
                FROM directory_provider_reviews
                GROUP BY provider_id
            ) r ON p.id = r.provider_id
            LEFT JOIN LATERAL (
                SELECT c.name
                FROM directory_provider_categories dpc
                JOIN categories c ON dpc.category_id = c.id
                WHERE dpc.provider_id = p.id
                ORDER BY dpc.is_primary DESC, c.name ASC
                LIMIT 1
            ) primary_category ON true
            LEFT JOIN LATERAL (
                SELECT json_agg(
                    json_build_object(
                        'id', c.id,
                        'name', c.name,
                        'name_lang', c.name_lang,
                        'is_primary', dpc.is_primary
                    )
                    ORDER BY dpc.is_primary DESC, c.name ASC
                ) AS categories
                FROM directory_provider_categories dpc
                JOIN categories c ON dpc.category_id = c.id
                WHERE dpc.provider_id = p.id
            ) all_categories ON true
            LEFT JOIN LATERAL (
                SELECT json_agg(
                    json_build_object(
                        'address', l.address,
                        'zip_code', l.zip_code,
                        'city', l.city,
                        'country', l.country,
                        'latitude', l.latitude,
                        'longitude', l.longitude,
                        'is_headquarter', l.is_headquarter
                    )
                    ORDER BY l.is_headquarter DESC, l.city ASC, l.address ASC
                ) AS locations
                FROM directory_provider_locations l
                WHERE l.provider_id = p.id
            ) locations ON true
            ${whereSql}
            ORDER BY ms.is_recommended DESC, p.name ASC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        const countQuery = `
            SELECT COUNT(DISTINCT p.id)::int AS total
            FROM directory_providers p
            INNER JOIN directory_provider_mandant_settings ms ON p.id = ms.provider_id
            ${whereSql}
        `;

        const categoryOptionsQuery = `
            SELECT
                c.id::text AS id,
                c.name,
                c.name_lang,
                COUNT(DISTINCT p.id)::int AS count
            FROM directory_providers p
            INNER JOIN directory_provider_mandant_settings ms ON p.id = ms.provider_id
            INNER JOIN directory_provider_categories dpc ON dpc.provider_id = p.id
            INNER JOIN categories c ON c.id = dpc.category_id
            WHERE ms.business_partner_id = $1
              AND ms.status = 'active'
              AND p.is_public = true
            GROUP BY c.id, c.name, c.name_lang
            ORDER BY c.name ASC
        `;

        const regionOptionsQuery = `
            SELECT region_value AS value, region_value AS label, COUNT(DISTINCT provider_id)::int AS count
            FROM (
                SELECT
                    p.id AS provider_id,
                    COALESCE(
                        NULLIF(TRIM(l.city), ''),
                        NULLIF(TRIM(l.zip_code), ''),
                        NULLIF(TRIM(l.country), '')
                    ) AS region_value
                FROM directory_providers p
                INNER JOIN directory_provider_mandant_settings ms ON p.id = ms.provider_id
                INNER JOIN directory_provider_locations l ON l.provider_id = p.id
                WHERE ms.business_partner_id = $1
                  AND ms.status = 'active'
                  AND p.is_public = true
            ) region_source
            WHERE region_value IS NOT NULL
            GROUP BY region_value
            ORDER BY region_value ASC
        `;

        const [result, countResult, categoryOptionsResult, regionOptionsResult] = await Promise.all([
            db.query(dataQuery, [...values, safeLimit, offset]),
            db.query(countQuery, values),
            db.query(categoryOptionsQuery, [partnerId]),
            db.query(regionOptionsQuery, [partnerId]),
        ]);

        const total = countResult.rows[0]?.total || 0;

        return res.json({
            data: result.rows,
            page: safePage,
            limit: safeLimit,
            total,
            hasMore: offset + result.rows.length < total,
            filters: {
                categories: categoryOptionsResult.rows,
                regions: regionOptionsResult.rows,
            },
        });
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