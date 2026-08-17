// backend/controllers/adminBriefingEditorialController.js
const db = require('../config/db');
const { Queue } = require('bullmq');
const { connection } = require('../services/queueService');
const aiQueue = new Queue('ai-content-generation', { connection });

const { sendDailyBriefing } = require('../services/emailService');
const { dispatchBriefing } = require('../services/newsletterDeliveryService');

function authorizedBpId(req, res, requestedBpId) {
    const ownBpId = req.user.business_partner_id;
    if (req.user.role === 'admin') return requestedBpId || ownBpId || null;
    if (!ownBpId) {
        res.status(403).json({ message: 'Kein Mandant zugeordnet.' });
        return null;
    }
    if (requestedBpId && String(requestedBpId) !== String(ownBpId)) {
        res.status(403).json({ message: 'Zugriff auf einen fremden Mandanten verweigert.' });
        return null;
    }
    return ownBpId;
}

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
        const result = req.user.role === 'admin'
            ? await db.query(`SELECT id, name, dashboard_title, is_active, allow_automated_newsletter, newsletter_delivery_mode FROM business_partners ORDER BY name ASC`)
            : await db.query(`SELECT id, name, dashboard_title, is_active, allow_automated_newsletter, newsletter_delivery_mode FROM business_partners WHERE id = $1 ORDER BY name ASC`, [req.user.business_partner_id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: "Fehler beim Laden der Partner" });
    }
};

exports.getDebugStatus = async (req, res) => {
    const requestedBpId = (req.query.bpId && req.query.bpId !== 'undefined') ? req.query.bpId : null;
    const bpId = authorizedBpId(req, res, requestedBpId);
    if (!bpId) return res.headersSent ? undefined : res.status(400).json({ message: "Keine BP-ID übergeben" });

    try {
        const configRes = await db.query(`
            SELECT name, briefing_frequency, newsletter_frequency, auto_approve_briefings,
                   newsletter_delivery_mode, newsletter_export_email,
                   newsletter_external_signup_url, newsletter_recipient_limit
            FROM business_partners WHERE id = $1::uuid
        `, [bpId]);
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
        const recRes = await db.query(`SELECT COUNT(*) as count FROM users WHERE business_partner_id = $1::uuid AND newsletter_opt_in = TRUE AND briefing_email_enabled = TRUE AND is_active = TRUE`, [bpId]);
        const jobRes = await db.query(`SELECT COUNT(*) as count FROM ai_jobs WHERE status = 'running' AND updated_at >= NOW() - INTERVAL '15 minutes'`);

        res.json({
            bpName: configRes.rows[0]?.name || 'Unbekannt',
            briefing_frequency: freq,
            newsletter_frequency: configRes.rows[0]?.newsletter_frequency || 'never', // NEU
            auto_approve_briefings: configRes.rows[0]?.auto_approve_briefings || false,
            newsletter_delivery_mode: configRes.rows[0]?.newsletter_delivery_mode || 'mobiliti',
            newsletter_export_email: configRes.rows[0]?.newsletter_export_email || '',
            newsletter_external_signup_url: configRes.rows[0]?.newsletter_external_signup_url || '',
            newsletter_recipient_limit: configRes.rows[0]?.newsletter_recipient_limit || 250,
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
    const {
        bpId, frequency, newsletterFrequency, autoApprove,
        newsletterDeliveryMode, newsletterExportEmail,
        newsletterExternalSignupUrl, newsletterRecipientLimit
    } = req.body;
    const targetBpId = authorizedBpId(req, res, bpId);
    if (!targetBpId) return;

    try {
        const currentResult = await db.query('SELECT email FROM business_partners WHERE id = $1::uuid', [targetBpId]);
        if (currentResult.rowCount === 0) return res.status(404).json({ message: 'Mandant nicht gefunden.' });

        if (newsletterDeliveryMode !== undefined && !['mobiliti', 'export', 'external'].includes(newsletterDeliveryMode)) {
            return res.status(400).json({ message: 'Ungültiger Newsletter-Versandmodus.' });
        }
        const parsedLimit = newsletterRecipientLimit === undefined ? null : Number(newsletterRecipientLimit);
        if (parsedLimit !== null && (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100000)) {
            return res.status(400).json({ message: 'Das direkte Empfängerlimit muss zwischen 1 und 100.000 liegen.' });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (newsletterExportEmail && !emailRegex.test(String(newsletterExportEmail).trim())) {
            return res.status(400).json({ message: 'Die zentrale Newsletter-Adresse ist ungültig.' });
        }
        if (newsletterDeliveryMode === 'export' && !newsletterExportEmail && !currentResult.rows[0].email) {
            return res.status(400).json({ message: 'Für den Export ist eine zentrale Mandantenadresse erforderlich.' });
        }
        if (newsletterExternalSignupUrl) {
            try {
                const url = new URL(newsletterExternalSignupUrl);
                if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
            } catch (_) {
                return res.status(400).json({ message: 'Die externe Newsletter-Anmelde-URL ist ungültig.' });
            }
        }
        if (newsletterDeliveryMode === 'external' && !newsletterExternalSignupUrl) {
            return res.status(400).json({ message: 'Für den externen Modus ist eine Anmelde-URL erforderlich.' });
        }

        await db.query(
            `UPDATE business_partners 
             SET briefing_frequency = $1, 
                 newsletter_frequency = $2, 
                 auto_approve_briefings = $3,
                 newsletter_delivery_mode = COALESCE($4, newsletter_delivery_mode),
                 newsletter_export_email = CASE WHEN $4 IS NULL THEN newsletter_export_email ELSE $5 END,
                 newsletter_external_signup_url = CASE WHEN $4 IS NULL THEN newsletter_external_signup_url ELSE $6 END,
                 newsletter_recipient_limit = COALESCE($7, newsletter_recipient_limit),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $8::uuid`,
            [
                frequency, newsletterFrequency, autoApprove,
                newsletterDeliveryMode || null,
                newsletterExportEmail ? String(newsletterExportEmail).trim() : null,
                newsletterExternalSignupUrl ? String(newsletterExternalSignupUrl).trim() : null,
                parsedLimit,
                targetBpId
            ]
        );
        res.json({ message: "Einstellungen gespeichert." });
    } catch (err) {
        console.error("updateBriefingSettings", err);
        res.status(500).json({ message: "Fehler beim Speichern der Einstellungen." });
    }
};

exports.getBriefingDraft = async (req, res) => {
    const bpId = authorizedBpId(req, res, req.query.bpId);
    if (!bpId) return;
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
        const scopedBpId = req.user.role === 'admin' ? null : req.user.business_partner_id;
        const result = await db.query(
            `UPDATE business_partner_intelligence_briefings 
             SET headline = $1, analysis_summary = $2, prognosis = $3, talking_point = $4, related_articles = $5
             WHERE id = $6 AND ($7::uuid IS NULL OR business_partner_id = $7::uuid) RETURNING id`,
            [headline, analysis_summary, prognosis, talking_point, related_articles, id, scopedBpId]
        );
        if (result.rowCount === 0) return res.status(404).json({ message: 'Eintrag nicht gefunden.' });
        res.json({ message: "Erfolgreich aktualisiert." });
    } catch (err) {
        res.status(500).json({ message: "Fehler beim Speichern." });
    }
};

exports.publishBriefing = async (req, res) => {
    const { id } = req.params;
    try {
        const scopedBpId = req.user.role === 'admin' ? null : req.user.business_partner_id;
        const result = await db.query(`UPDATE business_partner_intelligence_briefings SET status = 'published' WHERE id = $1 AND ($2::uuid IS NULL OR business_partner_id = $2::uuid) RETURNING id`, [id, scopedBpId]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Eintrag nicht gefunden.' });
        res.json({ message: "Briefing veröffentlicht." });
    } catch (err) {
        res.status(500).json({ message: "Fehler beim Veröffentlichen." });
    }
};

exports.triggerManualGeneration = async (req, res) => {
    try {
        const targetBpId = authorizedBpId(req, res, req.body.bpId);
        if (!targetBpId) return;
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
        const targetBpId = authorizedBpId(req, res, bpId);
        if (!targetBpId) return;
        if (!Array.isArray(itemIds) || itemIds.length === 0) return res.status(400).json({ message: 'Keine Inhalte ausgewählt.' });
        const briefingRes = await db.query(`SELECT * FROM business_partner_intelligence_briefings WHERE id = ANY($1) AND business_partner_id = $2`, [itemIds, targetBpId]);
        const items = briefingRes.rows;

        if (items.length === 0) return res.status(404).json({ message: "Keine Inhalte zum Versenden gefunden." });

        const partnerRes = await db.query(`
            SELECT bp.*, row_to_json(cs.*) as color_scheme 
            FROM business_partners bp LEFT JOIN color_schemes cs ON bp.color_scheme_id = cs.id 
            WHERE bp.id = $1`, [targetBpId]);
        const partner = partnerRes.rows[0];

        await db.query(`UPDATE business_partner_intelligence_briefings SET status = 'published', created_at = NOW() WHERE id = ANY($1) AND business_partner_id = $2`, [itemIds, targetBpId]);

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
        `, [`${targetBpId}_events`]);
        const nextEvent = eventRes.rows[0] || null;

        const delivery = await dispatchBriefing({
            partner,
            items,
            briefing: briefingForEmail,
            nextEvent,
            frequency: partner.newsletter_frequency || 'manual'
        });

        res.json({ message: 'Veröffentlichung und Versand abgeschlossen.', ...delivery });
    } catch (err) {
        console.error("Fehler beim Bulk-Publish:", err);
        res.status(500).json({ message: "Interner Fehler beim Versand." });
    }
};

exports.sendTestEmail = async (req, res) => {
    const { bpId, email, items } = req.body;
    try {
        const targetBpId = authorizedBpId(req, res, bpId);
        if (!targetBpId) return;
        if (req.user.role !== 'admin' && String(email).toLowerCase() !== String(req.user.email).toLowerCase()) {
            return res.status(403).json({ message: 'Mandantenassistenten dürfen Testmails nur an die eigene Adresse senden.' });
        }
        const partnerRes = await db.query(`
            SELECT bp.*, row_to_json(cs.*) as color_scheme 
            FROM business_partners bp LEFT JOIN color_schemes cs ON bp.color_scheme_id = cs.id 
            WHERE bp.id = $1`, [targetBpId]);
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
        `, [`${targetBpId}_events`]);
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
        const scopedBpId = req.user.role === 'admin' ? null : req.user.business_partner_id;
        const result = await db.query(`DELETE FROM business_partner_intelligence_briefings WHERE id = $1 AND ($2::uuid IS NULL OR business_partner_id = $2::uuid) RETURNING id`, [req.params.id, scopedBpId]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Eintrag nicht gefunden.' });
        res.json({ message: "Erfolgreich gelöscht." });
    } catch (err) {
        res.status(500).json({ message: "Fehler beim Löschen." });
    }
};

// OFFENER REGEX-TÜRSTEHER FÜR DAS MODAL
exports.getRawData = async (req, res) => {
    const bpId = authorizedBpId(req, res, req.query.bpId);
    if (!bpId) return;
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
    const bpId = authorizedBpId(req, res, req.query.bpId);
    if (!bpId) return res.headersSent ? undefined : res.status(400).json({ message: "Keine BP-ID übergeben" });

    try {
        const result = await db.query(
            `SELECT first_name, last_name, email 
             FROM users 
             WHERE business_partner_id = $1::uuid 
               AND newsletter_opt_in = TRUE 
               AND briefing_email_enabled = TRUE
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
