const db = require('../config/db');
const fs = require('fs/promises'); 
const path = require('path');
const { PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner"); 
const s3Client = require('../config/s3Client.js');
const { v4: uuidv4 } = require('uuid');
const { PdfReader } = require("pdfreader"); 

// --- parsePdfLayout & processParsedItems (Unverändert) ---
// (Hier ist der Code von der vorherigen Antwort für das PDF-Parsing)
function parsePdfLayout(dataBuffer) {
    return new Promise((resolve, reject) => {
        const reader = new PdfReader();
        const items = [];
        reader.parseBuffer(dataBuffer, (err, item) => {
            if (err) {
                reject(err);
            } else if (!item) {
                resolve(items);
            } else if (item.text) {
                items.push(item);
            }
        });
    });
}
function processParsedItems(items) {
    const articles = [];
    items.sort((a, b) => {
        if (Math.abs(a.y - b.y) < 1) { return a.x - b.x; }
        return b.y - a.y; 
    });

    const CATEGORY_FONT_HEIGHT = 15; 
    const TITLE_FONT_HEIGHT = 11;    
    const MIN_FONT_HEIGHT = 8;       
    let currentCategory = null;
    let currentArticle = null;
    let isCapturingSummary = false;
    let summaryBuffer = "";
    const IGNORE_CATEGORY = "Landesgesetzblätter";
    const SUMMARY_KEYWORD = "KI Zusammenfassung:";
    const SUMMARY_KEYWORD_ALT = "KI-Zusammenfassung für die Entscheidung";

    const saveCurrentArticle = () => {
        if (currentArticle) {
            currentArticle.zusammenfassung = summaryBuffer.trim();
            articles.push(currentArticle);
            currentArticle = null;
            summaryBuffer = "";
            isCapturingSummary = false;
        }
    };

    for (const item of items) {
        const text = item.text.trim();
        if (!text || item.h < MIN_FONT_HEIGHT) continue; 
        if (item.h > CATEGORY_FONT_HEIGHT) {
            saveCurrentArticle(); 
            if (text.startsWith(IGNORE_CATEGORY)) {
                currentCategory = IGNORE_CATEGORY;
            } else {
                currentCategory = text;
            }
            continue; 
        }
        if (currentCategory === IGNORE_CATEGORY) {
            continue;
        }
        if (item.h > TITLE_FONT_HEIGHT && item.h < CATEGORY_FONT_HEIGHT) {
            saveCurrentArticle(); 
            currentArticle = {
                kategorie: currentCategory || "Unbekannt",
                ueberschrift: text,
                kennung: "",
                zusammenfassung: ""
            };
            isCapturingSummary = false;
            continue;
        }
        if (currentArticle) {
            if (text.startsWith(SUMMARY_KEYWORD) || text.startsWith(SUMMARY_KEYWORD_ALT)) {
                isCapturingSummary = true;
                let restOfLine = text.replace(SUMMARY_KEYWORD, "").replace(SUMMARY_KEYWORD_ALT, "");
                summaryBuffer += restOfLine + " ";
                continue;
            }
            if (isCapturingSummary) {
                summaryBuffer += text + " ";
            }
            else if (!isCapturingSummary && currentArticle.kennung === "") {
                currentArticle.kennung = text;
            }
        }
    }
    saveCurrentArticle(); 
    const filteredArticles = articles.filter(
        a => a.kategorie.toLowerCase().includes("bundesgesetzblätter")
    );
    console.log(`[Parser] PDF-Analyse abgeschlossen. ${articles.length} Artikel gefunden, ${filteredArticles.length} davon sind Bundesgesetzblätter.`);
    return filteredArticles;
}

// --- parseAndStorePdfArticles (Unverändert) ---
// (Verwendet die korrigierte Logik von oben)
exports.parseAndStorePdfArticles = async (req, res) => {
    // ... (Code von der vorherigen Antwort)
    const { template_id, business_partner_id } = req.body;
    const { role } = req.user;

    if (role !== 'admin') {
        return res.status(403).json({ message: 'Zugriff verweigert.' });
    }
    if (!req.file) {
        return res.status(400).json({ message: 'Keine PDF-Datei hochgeladen.' });
    }
    if (!template_id || !business_partner_id) {
        return res.status(400).json({ message: 'Template-ID oder Business-Partner-ID fehlt.' });
    }

    const client = await db.connect();
    const pdfPath = req.file.path;
    let storagePath = null;
    let parsedArticles = [];

    try {
        await client.query('BEGIN');
        const dataBuffer = await fs.readFile(pdfPath);
        
        const fileKey = `legal-monitor-sources/${business_partner_id}/${uuidv4()}-${path.basename(req.file.originalname)}`;
        const command = new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: fileKey,
            Body: dataBuffer,
            ContentType: req.file.mimetype
        });
        await s3Client.send(command);
        storagePath = fileKey;
        console.log(`[S3] PDF erfolgreich nach ${storagePath} hochgeladen.`);

        const templateRes = await client.query(
            'SELECT fields_definition FROM monitor_templates WHERE id = $1', 
            [template_id]
        );
        if (templateRes.rows.length === 0) {
            throw new Error('Das ausgewählte Template wurde nicht gefunden.');
        }
        
        const fields = templateRes.rows[0].fields_definition;
        const titleField = fields.find(f => f.name.match(/titel|title|ueberschrift/i))?.name;
        const idField = fields.find(f => f.name.match(/kennung|id|ref/i))?.name;
        const summaryField = fields.find(f => f.name.match(/summary|zusammenfassung|text/i))?.name;
        
        if (!titleField || !summaryField) {
             throw new Error('Template fehlen Felder für "Titel" oder "Zusammenfassung".');
        }

        const items = await parsePdfLayout(dataBuffer);
        parsedArticles = processParsedItems(items);

        if (parsedArticles.length === 0) {
            throw new Error('Keine "Bundesgesetzblätter"-Artikel im PDF gefunden.');
        }

        const insertQuery = `
            INSERT INTO monitor_entries 
            (template_id, business_partner_id, content_data, is_published, source_document_url)
            VALUES ($1, $2, $3, $4, $5)
        `;

        for (const article of parsedArticles) {
            const content_data = {};
            if (titleField) content_data[titleField] = article.ueberschrift;
            if (idField) content_data[idField] = article.kennung;
            if (summaryField) content_data[summaryField] = article.zusammenfassung;

            await client.query(insertQuery, [
                template_id,
                business_partner_id,
                JSON.stringify(content_data),
                true, // Automatisch veröffentlichen
                storagePath
            ]);
        }
        
        await client.query('COMMIT');
        
        res.json({ 
            message: `${parsedArticles.length} Artikel wurden erfolgreich importiert und gespeichert.` 
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Fehler beim Parsen und Speichern des Rechtsmonitors:", err.message);
        res.status(500).json({ message: err.message || 'Ein interner Serverfehler ist aufgetreten.' });
    } finally {
        client.release();
        if (pdfPath) {
            await fs.unlink(pdfPath).catch(err => console.error("Fehler beim Löschen der Temp-Datei:", err));
        }
    }
};


// in backend/controllers/adminLegalMonitorController.js

exports.getTemplates = async (req, res) => {
     const { role } = req.user;
     // Die adminAuth-Middleware hat bereits sichergestellt, dass role === 'admin' ist.
     // Wir brauchen die 'role'-Prüfung hier nicht mehr, da die Middleware 'assistenz' bereits blockiert.
     console.log('[AdminController] getTemplates: Wird von Admin aufgerufen.'); // NEUES LOG
    try {
        const query = "SELECT * FROM monitor_templates ORDER BY template_name ASC";
        const result = await db.query(query);
        
        // NEUES LOG: Zeigt, was wir senden (sollte ein Array sein)
        console.log(`[AdminController] getTemplates: Sende ${result.rows.length} Templates (als Array).`); 
        
        res.json(result.rows); //
    } catch (err) {
        console.error('[AdminController] Fehler in getTemplates:', err);
        res.status(500).json({ message: 'Serverfehler' });
    }
};

exports.getEntries = async (req, res) => {
    const { role } = req.user; // role ist 'admin'
    const { templateId, bpId, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    console.log(`[AdminController] getEntries: Wird von Admin aufgerufen (Seite ${page}, Limit ${limit}).`); // NEUES LOG

    try {
        let baseQuery = `
            FROM monitor_entries me
            JOIN monitor_templates mt ON me.template_id = mt.id
        `;
        const whereClauses = [];
        const queryParams = [];
        let paramIndex = 1;

        // Da nur Admins hierher kommen, können wir die Rollenprüfung vereinfachen
        if (bpId) {
            whereClauses.push(`me.business_partner_id = $${paramIndex++}`);
            queryParams.push(bpId);
        }
        if (templateId) {
            whereClauses.push(`me.template_id = $${paramIndex++}`);
            queryParams.push(templateId);
        }
        
        if (whereClauses.length > 0) {
            baseQuery += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        const countResult = await db.query(`SELECT COUNT(*) ${baseQuery}`, queryParams);
        const totalCount = parseInt(countResult.rows[0].count, 10);

        const dataQuery = `
            SELECT me.id, me.content_data, me.created_at, me.is_published, me.source_document_url, 
                   mt.template_name, mt.fields_definition, me.business_partner_id
            ${baseQuery}
            ORDER BY me.created_at DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex++}
        `;
        queryParams.push(limit, offset);
        const entriesResult = await db.query(dataQuery, queryParams);
        
        // NEUES LOG: Zeigt, was wir senden (ein Objekt!)
        console.log(`[AdminController] getEntries: Sende ${entriesResult.rows.length} Einträge (als Objekt).`);

        res.json({
            entries: entriesResult.rows, //
            totalCount: totalCount
        });

    } catch (err) {
        console.error('[AdminController] Fehler in getEntries:', err);
        res.status(500).json({ message: 'Serverfehler' });
    }
};

exports.getBusinessPartnersList = async (req, res) => {
    const { role } = req.user; // role ist 'admin'
    // Die Prüfung 'if (role !== 'admin')' ist nicht mehr nötig.
    console.log('[AdminController] getBusinessPartnersList: Wird von Admin aufgerufen.'); // NEUES LOG

    try {
        const result = await db.query(
            `SELECT id, name FROM business_partners ORDER BY name ASC` //
        );
        
        // NEUES LOG: Zeigt, was wir senden (sollte ein Array sein)
        console.log(`[AdminController] getBusinessPartnersList: Sende ${result.rows.length} Partner (als Array).`);
        
        res.json(result.rows); //

    } catch (err) {
        console.error('[AdminController] Fehler in getBusinessPartnersList:', err);
        res.status(500).json({ message: 'Serverfehler' });
    }
};


// === KORRIGIERTE Template-Routen ===
exports.createTemplate = async (req, res) => {
    const { business_partner_id, template_name, industry, fields_definition } = req.body;
    const { role } = req.user;

    if (role !== 'admin') {
        return res.status(403).json({ message: 'Zugriff verweigert.' });
    }
    
    // KORREKTUR: Validierung hinzugefügt, da 'business_partner_id' jetzt 'NOT NULL' ist
    if (!business_partner_id) {
         return res.status(400).json({ message: 'Business Partner ID ist erforderlich.' });
    }

    try {
        // KORREKTUR: 'created_by' entfernt und '|| null' bei bp_id entfernt
        const result = await db.query(
            `INSERT INTO monitor_templates (business_partner_id, template_name, industry, fields_definition)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [business_partner_id, template_name, industry || null, fields_definition]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Fehler beim Erstellen der Vorlage:', err);
        // Prüfen auf Unique-Constraint-Verletzung
        if (err.code === '23505') { // unique_violation
            return res.status(409).json({ message: 'Eine Vorlage mit diesem Namen existiert bereits für diesen Partner.' });
        }
        res.status(500).json({ message: 'Serverfehler' });
    }
};

// --- (Restliche Funktionen: deleteTemplate, createEntry, getEntries, etc. unverändert) ---
exports.deleteTemplate = async (req, res) => {
    // ... (unveränderter Code)
    const { id } = req.params;
    const { role } = req.user;
    if (role !== 'admin') {
        return res.status(403).json({ message: 'Zugriff verweigert.' });
    }
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM monitor_entries WHERE template_id = $1', [id]);
        await client.query('DELETE FROM monitor_templates WHERE id = $1', [id]);
        await client.query('COMMIT');
        res.status(204).send();
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Fehler beim Löschen der Vorlage:', err);
        res.status(500).json({ message: 'Serverfehler' });
    } finally {
        client.release();
    }
};

exports.createEntry = async (req, res) => {
    // ... (unveränderter Code)
    const { template_id, business_partner_id, content_data, is_published, source_document_url } = req.body;
    const { role, business_partner_id: userBpId } = req.user;

    if (role !== 'admin' && business_partner_id !== userBpId) {
        return res.status(403).json({ message: 'Zugriff verweigert.' });
    }
    try {
        const result = await db.query(
            `INSERT INTO monitor_entries (template_id, business_partner_id, content_data, is_published, source_document_url)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [template_id, business_partner_id, content_data, is_published, source_document_url || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Fehler beim Erstellen des Eintrags:', err);
        res.status(500).json({ message: 'Serverfehler' });
    }
};

exports.updateEntry = async (req, res) => {
    // ... (unveränderter Code)
    const { id } = req.params;
    const { content_data, is_published } = req.body;
    const { role, business_partner_id: userBpId } = req.user;
    
    try {
        let query;
        const queryParams = [content_data, is_published, id];

        if (role === 'admin') {
            query = `UPDATE monitor_entries SET content_data = $1, is_published = $2, updated_at = NOW() WHERE id = $3 RETURNING *`;
        } else {
            if (!userBpId) return res.status(403).json({ message: "Kein Zugriff." });
            query = `UPDATE monitor_entries SET content_data = $1, is_published = $2, updated_at = NOW() WHERE id = $3 AND business_partner_id = $4 RETURNING *`;
            queryParams.push(userBpId);
        }

        const result = await db.query(query, queryParams);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Eintrag nicht gefunden oder Zugriff verweigert.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Fehler beim Aktualisieren des Eintrags:', err);
        res.status(500).json({ message: 'Serverfehler' });
    }
};


exports.deleteEntry = async (req, res) => {
    // ... (unveränderter Code)
    const { id } = req.params;
    const { role, business_partner_id: userBpId } = req.user;

    try {
        let query;
        const queryParams = [id];

        if (role === 'admin') {
            query = `DELETE FROM monitor_entries WHERE id = $1`;
        } else {
            if (!userBpId) return res.status(403).json({ message: "Kein Zugriff." });
            query = `DELETE FROM monitor_entries WHERE id = $1 AND business_partner_id = $2`;
            queryParams.push(userBpId);
        }

        const result = await db.query(query, queryParams);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Eintrag nicht gefunden oder Zugriff verweigert.' });
        }
        res.status(204).send();
    } catch (err) {
        console.error('Fehler beim Löschen des Eintrags:', err);
        res.status(500).json({ message: 'Serverfehler' });
    }
};

exports.getSignedUrlForSourceDocument = async (req, res) => {
    // ... (unveränderter Code)
    const { id: entryId } = req.params;
    const { role, business_partner_id: userBpId } = req.user;

    try {
        let query;
        const queryParams = [entryId];

        if (role === 'admin') {
            query = `SELECT source_document_url FROM monitor_entries WHERE id = $1;`;
        } else {
            if (!userBpId) return res.status(403).json({ message: "Kein Zugriff." });
            query = `SELECT source_document_url FROM monitor_entries WHERE id = $1 AND business_partner_id = $2;`;
            queryParams.push(userBpId);
        }

        const result = await db.query(query, queryParams);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Datei nicht gefunden oder Zugriff verweigert." });
        }

        const storagePath = result.rows[0].source_document_url;
        
        if (!storagePath) {
             return res.status(404).json({ message: "Für diesen Eintrag ist keine Quelldatei hinterlegt." });
        }

        const command = new GetObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: storagePath,
        });
        
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 }); // 60s Gültigkeit
        res.json({ downloadUrl: signedUrl });

    } catch (err) {
        console.error('Fehler beim Abrufen der S3-Download-URL:', err);
        res.status(500).json({ message: 'Serverfehler' });
    }
};