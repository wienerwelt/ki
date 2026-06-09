// backend/controllers/adminBriefingEditorialController.js
const db = require('../config/db');
const { Queue } = require('bullmq');
const { connection } = require('../services/queueService');
const aiQueue = new Queue('ai-content-generation', { connection });

const { sendDailyBriefing } = require('../services/emailService');

// Hilfsfunktion: Wandelt String/Array sicher in ein Array um
function extractSources(related_articles) {
    if (!related_articles) return [];
    if (Array.isArray(related_articles)) return related_articles;
    if (typeof related_articles === 'string') {
        try {
            const parsed = JSON.parse(related_articles);
            if (Array.isArray(parsed)) return parsed;
        } catch (e) {
            if (related_articles.trim().startsWith('http')) return [related_articles.trim()];
        }
    }
    return [];
}

exports.getAllPartners = async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, name, dashboard_title, is_active, allow_automated_newsletter FROM business_partners ORDER BY name ASC`
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: "Fehler beim Laden der Partner" });
    }
};

exports.getDebugStatus = async (req, res) => {
    const bpId = (req.query.bpId && req.query.bpId !== 'undefined') ? req.query.bpId : req.user.business_partner_id;
    if (!bpId) return res.status(400).json({ message: "Keine BP-ID übergeben" });

    try {
        const configRes = await db.query(`SELECT name, briefing_frequency, newsletter_frequency, auto_approve_briefings FROM business_partners WHERE id = $1::uuid`, [bpId]);
        const freq = configRes.rows[0]?.briefing_frequency || 'daily';
        
        let interval = '3 days';
        if (freq === 'weekly') interval = '7 days';
        else if (freq === 'biweekly') interval = '14 days';
        else if (freq === 'monthly') interval = '30 days';

        const catRes = await db.query(
            `SELECT c.name FROM categories c 
             JOIN business_partner_categories bpc ON c.id = bpc.category_id
             WHERE bpc.business_partner_id = $1::uuid AND c.category_type = 'industry'`, [bpId]);

        const newsRes = await db.query(
            `SELECT COUNT(*) as count_period
             FROM scraped_content sc
             WHERE (sc.source_identifier = $1 OR sc.source_identifier = $2 OR sc.source_identifier !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}_(news|events)$')
             AND (COALESCE(sc.published_date, DATE(sc.created_at)) >= NOW() - INTERVAL '${interval}' OR sc.event_date >= CURRENT_DATE)`, 
             [`${bpId}_news`, `${bpId}_events`]
        );

        const historyRes = await db.query(`SELECT created_at, headline, briefing_type FROM business_partner_intelligence_briefings WHERE business_partner_id = $1::uuid ORDER BY created_at DESC LIMIT 10`, [bpId]);
        const recRes = await db.query(`SELECT COUNT(*) as count FROM users WHERE business_partner_id = $1::uuid AND newsletter_opt_in = TRUE AND is_active = TRUE`, [bpId]);
        const jobRes = await db.query(`SELECT COUNT(*) as count FROM ai_jobs WHERE status = 'running' AND updated_at >= NOW() - INTERVAL '15 minutes'`);

        res.json({
            bpName: configRes.rows[0]?.name || 'Unbekannt',
            briefing_frequency: freq,
            newsletter_frequency: configRes.rows[0]?.newsletter_frequency || 'never', // NEU
            auto_approve_briefings: configRes.rows[0]?.auto_approve_briefings || false,
            categories: catRes.rows.map(r => r.name),
            newsCount3d: parseInt(newsRes.rows[0]?.count_period || 0),
            potentialRecipients: parseInt(recRes.rows[0]?.count || 0),
            history: historyRes.rows,
            is_generating: parseInt(jobRes.rows[0].count) > 0
        });

    } catch (err) {
        console.error("Fehler in getDebugStatus:", err.message);
        res.status(500).json({ error: "Diagnose fehlgeschlagen" });
    }
};

exports.updateBriefingSettings = async (req, res) => {
    const { bpId, frequency, newsletterFrequency, autoApprove } = req.body;
    const targetBpId = req.user.role === 'admin' ? bpId : req.user.business_partner_id;

    try {
        await db.query(
            `UPDATE business_partners 
             SET briefing_frequency = $1, 
                 newsletter_frequency = $2, 
                 auto_approve_briefings = $3 
             WHERE id = $4::uuid`,
            [frequency, newsletterFrequency, autoApprove, targetBpId]
        );
        res.json({ message: "Einstellungen gespeichert." });
    } catch (err) {
        console.error("updateBriefingSettings", err);
        res.status(500).json({ message: "Fehler beim Speichern der Einstellungen." });
    }
};

exports.getBriefingDraft = async (req, res) => {
    const bpId = req.query.bpId || req.user.business_partner_id;
    try {
        const result = await db.query(
            `SELECT id, headline, analysis_summary, prognosis, talking_point, briefing_type, related_articles, created_at
             FROM business_partner_intelligence_briefings 
             WHERE business_partner_id = $1::uuid 
             AND status = 'draft'
             ORDER BY created_at ASC`, [bpId]
        );
        res.json(result.rows || []);
    } catch (err) {
        res.status(500).json({ error: "Datenbankfehler beim Laden der Entwürfe" });
    }
};

exports.updateBriefingDraft = async (req, res) => {
    const { id } = req.params;
    const { headline, analysis_summary, prognosis, talking_point, related_articles } = req.body;

    try {
        await db.query(
            `UPDATE business_partner_intelligence_briefings 
             SET headline = $1, analysis_summary = $2, prognosis = $3, talking_point = $4, related_articles = $5
             WHERE id = $6`,
            [headline, analysis_summary, prognosis, talking_point, related_articles, id]
        );
        res.json({ message: "Erfolgreich aktualisiert." });
    } catch (err) {
        res.status(500).json({ message: "Fehler beim Speichern." });
    }
};

exports.publishBriefing = async (req, res) => {
    const { id } = req.params;
    try {
        await db.query(`UPDATE business_partner_intelligence_briefings SET status = 'published' WHERE id = $1`, [id]);
        res.json({ message: "Briefing veröffentlicht." });
    } catch (err) {
        res.status(500).json({ message: "Fehler beim Veröffentlichen." });
    }
};

exports.triggerManualGeneration = async (req, res) => {
    try {
        const targetBpId = req.body.bpId || null;
        await aiQueue.add('generate-editorial-briefings', { bpId: targetBpId });
        res.json({ message: "KI-Generierung wurde im Hintergrund gestartet." });
    } catch (err) {
        console.error("Fehler beim Starten der KI:", err.message);
        res.status(500).json({ message: "Fehler beim Starten der KI." });
    }
};

exports.publishBulkBriefing = async (req, res) => {
    const { bpId, itemIds } = req.body;

    try {
        const briefingRes = await db.query(`SELECT * FROM business_partner_intelligence_briefings WHERE id = ANY($1)`, [itemIds]);
        const items = briefingRes.rows;

        if (items.length === 0) return res.status(404).json({ message: "Keine Inhalte zum Versenden gefunden." });

        const partnerRes = await db.query(`
            SELECT bp.*, row_to_json(cs.*) as color_scheme 
            FROM business_partners bp LEFT JOIN color_schemes cs ON bp.color_scheme_id = cs.id 
            WHERE bp.id = $1`, [bpId]);
        const partner = partnerRes.rows[0];

        const userRes = await db.query(
            `SELECT email, first_name, last_name FROM users WHERE business_partner_id = $1 AND newsletter_opt_in = TRUE AND is_active = TRUE`,
            [bpId]
        );
        const recipients = userRes.rows;

        await db.query(`UPDATE business_partner_intelligence_briefings SET status = 'published', created_at = NOW() WHERE id = ANY($1)`, [itemIds]);

        const briefingForEmail = {
            top_insights: items.filter(i => i.briefing_type === 'top_insight').map(i => ({ 
                title: i.headline, what_changed: i.analysis_summary, so_what: i.prognosis, action: i.talking_point, sources: extractSources(i.related_articles)
            })),
            regulation_and_funding: items.filter(i => i.briefing_type === 'regulation').map(i => {
                const parsedSources = extractSources(i.related_articles);
                return { title: i.headline, summary: i.analysis_summary, action: i.talking_point, source: parsedSources[0] || null };
            }),
            recommended_actions: items.filter(i => i.briefing_type === 'action_plan').map(i => i.headline)
        };

        const eventRes = await db.query(`
            SELECT title, event_date, original_url, summary
            FROM scraped_content sc
            WHERE sc.event_date >= CURRENT_DATE
            AND (
                sc.source_identifier = $1 
                OR sc.source_identifier !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}_(news|events)$'
            )
            ORDER BY sc.event_date ASC LIMIT 1
        `, [`${bpId}_events`]);
        const nextEvent = eventRes.rows[0] || null;

        recipients.forEach(user => {
            sendDailyBriefing({ to: user.email, user, partner, briefing: briefingForEmail, nextEvent }).catch(e => console.error(e));
        });

        res.json({ message: "Versandvorgang gestartet.", recipientCount: recipients.length });
    } catch (err) {
        console.error("Fehler beim Bulk-Publish:", err);
        res.status(500).json({ message: "Interner Fehler beim Versand." });
    }
};

exports.sendTestEmail = async (req, res) => {
    const { bpId, email, items } = req.body;
    try {
        const partnerRes = await db.query(`
            SELECT bp.*, row_to_json(cs.*) as color_scheme 
            FROM business_partners bp LEFT JOIN color_schemes cs ON bp.color_scheme_id = cs.id 
            WHERE bp.id = $1`, [bpId]);
        const partner = partnerRes.rows[0];

        const briefing = {
            top_insights: items.filter(i => i.briefing_type === 'top_insight').map(i => ({ 
                title: i.headline, what_changed: i.analysis_summary, so_what: i.prognosis, action: i.talking_point, sources: extractSources(i.related_articles)
            })),
            regulation_and_funding: items.filter(i => i.briefing_type === 'regulation').map(i => {
                const parsedSources = extractSources(i.related_articles);
                return { title: i.headline, summary: i.analysis_summary, action: i.talking_point, source: parsedSources[0] || null };
            }),
            recommended_actions: items.filter(i => i.briefing_type === 'action_plan').map(i => i.headline)
        };

        const eventRes = await db.query(`
            SELECT title, event_date, original_url, summary
            FROM scraped_content sc
            WHERE sc.event_date >= CURRENT_DATE
            AND (
                sc.source_identifier = $1 
                OR sc.source_identifier !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}_(news|events)$'
            )
            ORDER BY sc.event_date ASC LIMIT 1
        `, [`${bpId}_events`]);
        const nextEvent = eventRes.rows[0] || null;

        await sendDailyBriefing({ to: email, user: { email, first_name: 'Test', last_name: 'Empfänger' }, partner, briefing, nextEvent });
        res.json({ message: "Test E-Mail wurde versendet." });
    } catch (err) {
        console.error("Test-Mail Fehler:", err);
        res.status(500).json({ message: "Fehler beim Test-Versand." });
    }
};

exports.deleteBriefingItem = async (req, res) => {
    try {
        await db.query(`DELETE FROM business_partner_intelligence_briefings WHERE id = $1`, [req.params.id]);
        res.json({ message: "Erfolgreich gelöscht." });
    } catch (err) {
        res.status(500).json({ message: "Fehler beim Löschen." });
    }
};

// OFFENER REGEX-TÜRSTEHER FÜR DAS MODAL
exports.getRawData = async (req, res) => {
    const bpId = req.query.bpId || req.user.business_partner_id;
    try {
        const partnerRes = await db.query(`SELECT briefing_frequency FROM business_partners WHERE id = $1`, [bpId]);
        const freq = partnerRes.rows[0]?.briefing_frequency || 'daily';
        
        let interval = '3 days';
        if (freq === 'weekly') interval = '7 days';
        else if (freq === 'biweekly') interval = '14 days';
        else if (freq === 'monthly') interval = '30 days';

        const result = await db.query(
            `SELECT title, summary, original_url, published_date, event_date 
             FROM scraped_content sc
             WHERE (
                 sc.source_identifier = $1
                 OR sc.source_identifier = $2
                 OR sc.source_identifier !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}_(news|events)$'
             )
             AND (
                 COALESCE(sc.published_date, DATE(sc.created_at)) >= NOW() - INTERVAL '${interval}' 
                 OR sc.event_date >= CURRENT_DATE
             )
             ORDER BY COALESCE(sc.published_date, sc.event_date) DESC`, 
             [`${bpId}_news`, `${bpId}_events`]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("Fehler beim Laden der Rohdaten:", err);
        res.status(500).json({ error: "Fehler beim Laden der Rohdaten" });
    }
};

exports.getRecipients = async (req, res) => {
    const bpId = req.query.bpId || req.user.business_partner_id;
    if (!bpId) return res.status(400).json({ message: "Keine BP-ID übergeben" });

    try {
        const result = await db.query(
            `SELECT first_name, last_name, email 
             FROM users 
             WHERE business_partner_id = $1::uuid 
               AND newsletter_opt_in = TRUE 
               AND is_active = TRUE
             ORDER BY last_name ASC, first_name ASC`,
            [bpId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("Fehler beim Laden der Empfängerliste:", err);
        res.status(500).json({ error: "Fehler beim Laden der Empfänger" });
    }
};