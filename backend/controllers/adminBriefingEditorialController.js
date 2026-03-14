const db = require('../config/db');

const { generateBriefingsForAllPartners } = require('../services/marketBriefingService');

exports.getAllPartners = async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, name, dashboard_title FROM business_partners WHERE is_active = TRUE ORDER BY name ASC`
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
        // A. Partner Name (UUID Cast hinzugefügt)
        const configRes = await db.query(
            `SELECT name FROM business_partners WHERE id = $1::uuid`, [bpId]);
        
        // B. Kategorien (UUID Cast hinzugefügt)
        const catRes = await db.query(
            `SELECT c.name FROM categories c 
             JOIN business_partner_categories bpc ON c.id = bpc.category_id
             WHERE bpc.business_partner_id = $1::uuid AND c.category_type = 'industry'`, [bpId]);

        // C. News Status (Optimiertes Subquery)
        const newsRes = await db.query(
            `SELECT COUNT(*) as count_3d, MAX(sc.created_at) as last_news_at
             FROM scraped_content sc
             WHERE sc.category_id IN (
                SELECT category_id FROM business_partner_categories WHERE business_partner_id = $1::uuid
             )
             AND sc.published_date >= NOW() - INTERVAL '3 days'`, [bpId]);

        // D. Historie
        const historyRes = await db.query(
            `SELECT created_at, headline, briefing_type FROM business_partner_intelligence_briefings
             WHERE business_partner_id = $1::uuid ORDER BY created_at DESC LIMIT 10`, [bpId]);

        // E. Empfänger
        const recRes = await db.query(
            `SELECT COUNT(*) FROM users WHERE business_partner_id = $1::uuid AND newsletter_opt_in = TRUE`, [bpId]);

        res.json({
            bpName: configRes.rows[0]?.name || 'Unbekannt',
            categories: catRes.rows.map(r => r.name),
            newsCount3d: parseInt(newsRes.rows[0]?.count_3d || 0),
            lastNewsAt: newsRes.rows[0]?.last_news_at,
            potentialRecipients: parseInt(recRes.rows[0]?.count || 0),
            history: historyRes.rows
        });
    } catch (err) {
        logSqlError("getDebugStatus", err);
        res.status(500).json({ error: "Fehler in der Diagnose-Abfrage", details: err.message });
    }
};

exports.triggerManualGeneration = async (req, res) => {
    try {
        await generateBriefingsForAllPartners();
        res.json({ message: "KI-Generierung wurde manuell gestartet und abgeschlossen." });
    } catch (err) {
        res.status(500).json({ message: "Fehler bei der manuellen Generierung: " + err.message });
    }
};

const logSqlError = (context, err) => {
    console.error(`[SQL Error in ${context}]:`, err.message);
    if (err.detail) console.error(`Detail: ${err.detail}`);
    if (err.hint) console.error(`Hint: ${err.hint}`);
};

exports.getBriefingDraft = async (req, res) => {
    const bpId = req.query.bpId || req.user.business_partner_id;
    try {
        const result = await db.query(
            `SELECT id, headline, analysis_summary, prognosis, talking_point, briefing_type, created_at
             FROM business_partner_intelligence_briefings 
             WHERE business_partner_id = $1::uuid 
             AND created_at::date = CURRENT_DATE
             ORDER BY created_at DESC`, [bpId]
        );
        res.json(result.rows || []);
    } catch (err) {
        logSqlError("getBriefingDraft", err);
        res.status(500).json({ error: "Datenbankfehler beim Laden der Entwürfe" });
    }
};

exports.updateBriefingDraft = async (req, res) => {
    const { id } = req.params;
    const { headline, analysis_summary, prognosis, talking_point } = req.body;

    try {
        await db.query(
            `UPDATE business_partner_intelligence_briefings 
             SET headline = $1, analysis_summary = $2, prognosis = $3, talking_point = $4
             WHERE id = $5`,
            [headline, analysis_summary, prognosis, talking_point, id]
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
    // Timeout für diese spezifische Anfrage erhöhen (auf 2 Minuten)
    req.setTimeout(120000); 

    try {
        console.log(`[KI-Lauf] Manuelle Generierung gestartet für Partner: ${req.body.bpId || 'Alle'}`);
        
        // WICHTIG: Prüfe ob der Service korrekt importiert wurde
        if (typeof generateBriefingsForAllPartners !== 'function') {
            throw new Error("Service-Funktion 'generateBriefingsForAllPartners' nicht gefunden.");
        }

        await generateBriefingsForAllPartners();
        
        console.log("[KI-Lauf] Erfolgreich abgeschlossen.");
        res.json({ message: "Generierung abgeschlossen" });
    } catch (err) {
        // HIER loggen wir den echten Fehler in die Konsole!
        console.error("[KI-Lauf] KRITISCHER FEHLER:", err.message);
        console.error(err.stack);

        res.status(500).json({ 
            message: "KI-Fehler: " + err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined 
        });
    }
};


exports.publishBulkBriefing = async (req, res) => {
    const { bpId, itemIds } = req.body;

    try {
        // 1. Hole die Daten der Briefings
        const briefingRes = await db.query(
            `SELECT * FROM business_partner_intelligence_briefings WHERE id = ANY($1)`,
            [itemIds]
        );
        const items = briefingRes.rows;

        if (items.length === 0) return res.status(404).json({ message: "Keine Inhalte zum Versenden gefunden." });

        // 2. Hole Partner-Name
        const partnerRes = await db.query(`SELECT name FROM business_partners WHERE id = $1`, [bpId]);
        const partnerName = partnerRes.rows[0].name;

        // 3. Hole alle berechtigten Empfänger (Opt-In gesetzt)
        const userRes = await db.query(
            `SELECT email, first_name FROM users 
             WHERE business_partner_id = $1 AND newsletter_opt_in = TRUE AND is_active = TRUE`,
            [bpId]
        );
        const recipients = userRes.rows;

        // 4. Status auf 'published' setzen
        await db.query(
            `UPDATE business_partner_intelligence_briefings SET status = 'published' WHERE id = ANY($1)`,
            [itemIds]
        );

        // 5. Versand starten (Asynchron im Hintergrund)
        // Hinweis: Bei sehr vielen Usern (>500) sollte hier eine Queue (wie BullMQ) genutzt werden
        recipients.forEach(user => {
            sendBriefingEmail(user, partnerName, items).catch(err => 
                console.error(`Fehler beim Senden an ${user.email}:`, err)
            );
        });

        res.json({ 
            message: "Versandvorgang gestartet.", 
            recipientCount: recipients.length 
        });

    } catch (err) {
        console.error("Fehler beim Bulk-Publish:", err);
        res.status(500).json({ message: "Interner Fehler beim Versand." });
    }
};