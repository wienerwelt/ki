const db = require('../config/db');
const fs = require('fs/promises'); 
const path = require('path');
const { PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner"); 
const s3Client = require('../config/s3Client.js');
const { v4: uuidv4 } = require('uuid');
const { PdfReader } = require("pdfreader"); 


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

    // ---------- 1) Items -> Zeilen (seitenweise, oben→unten, links→rechts) ----------

    const Y_TOLERANCE = 0.5;
    const pages = new Map();

    for (const it of items) {
        if (!it.text) continue;
        const page = it.page || 0;
        if (!pages.has(page)) pages.set(page, []);
        pages.get(page).push(it);
    }

    const lines = [];
    const norm = (s) => (s || '').trim().toLowerCase();

    // Seiten sortiert durchgehen
    for (const [page, pageItems] of [...pages.entries()].sort((a, b) => a[0] - b[0])) {
        // Auf der Seite: oben nach unten, links nach rechts
        pageItems.sort((a, b) => {
            if (Math.abs(a.y - b.y) < Y_TOLERANCE) {
                return a.x - b.x;
            }
            return a.y - b.y;
        });

        const rows = [];

        for (const it of pageItems) {
            let row = rows.find(r => Math.abs(r.y - it.y) < Y_TOLERANCE);
            if (!row) {
                row = { y: it.y, items: [] };
                rows.push(row);
            }
            row.items.push(it);
        }

        rows.sort((a, b) => a.y - b.y);

        for (const row of rows) {
            row.items.sort((a, b) => a.x - b.x);
            const text = row.items
                .map(i => (i.text || '').trim())
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (text) lines.push(text);
        }
    }

    // ---------- 2) Bundesgesetzblätter-Block isolieren ----------

    const startIdx = lines.findIndex(l => norm(l).startsWith("bundesgesetzblätter"));
    if (startIdx === -1) {
        console.log("[Parser] Keine 'Bundesgesetzblätter'-Sektion gefunden.");
        return [];
    }

    // Ende = nächste Kategorie "Landesgesetzblätter" (oder Ende des Dokuments)
    let endIdx = lines.findIndex((l, idx) =>
        idx > startIdx && norm(l).startsWith("landesgesetzblätter")
    );
    if (endIdx === -1) endIdx = lines.length;

    const sectionLines = lines.slice(startIdx + 1, endIdx);

    // Alle Zeilenindexe mit "KI Zusammenfassung" im Bundesgesetzblätter-Block
    const kiIndices = [];
    for (let i = 0; i < sectionLines.length; i++) {
        if (norm(sectionLines[i]).includes("ki zusammenfassung")) {
            kiIndices.push(i);
        }
    }

    if (kiIndices.length === 0) {
        console.log("[Parser] Keine 'KI Zusammenfassung' im Bundesgesetzblätter-Block gefunden.");
        return [];
    }

    // ---------- 3) Titel-Berechnung (2-Pass-Ansatz) ----------

    const titlesInfo = [];
    let prevKi = -1;
    const sentenceEndRegex = /[.!?]\s*$/;

    for (const kiIdx of kiIndices) {
        // Rückwärts nach der BGBl.-Zeile für dieses Gesetz suchen
        let bgblIdx = null;
        for (let j = kiIdx - 1; j > prevKi; j--) {
            if (norm(sectionLines[j]).includes("bgbl.")) {
                bgblIdx = j;
                break;
            }
        }
        if (bgblIdx === null) {
            // Kein BGBl. gefunden -> diesen Block überspringen
            prevKi = kiIdx;
            continue;
        }

        // Titelbeginn nach "Satzende" der vorherigen Zusammenfassung suchen
        let titleStart = bgblIdx;
        for (let j = bgblIdx - 1; j > prevKi; j--) {
            if (sentenceEndRegex.test(sectionLines[j])) {
                // Satzende -> Titel beginnt ab der nächsten Zeile
                titleStart = j + 1;
                break;
            } else {
                // Noch Teil der Überschrift
                titleStart = j;
            }
        }

        titlesInfo.push({
            kiIdx,
            titleStart,
            titleEnd: bgblIdx
        });

        prevKi = kiIdx;
    }

    // ---------- 4) Aus Titel-Infos + KI-Positionen Artikel bauen ----------

    for (let idx = 0; idx < titlesInfo.length; idx++) {
        const { kiIdx, titleStart, titleEnd } = titlesInfo[idx];

        const titleLines = sectionLines.slice(titleStart, titleEnd + 1);
        const ueberschrift = titleLines.join(" ").replace(/\s+/g, " ").trim();

        // Summary: von der KI-Zeile bis unmittelbar vor den nächsten Titelbeginn
        const summaryStart = kiIdx + 1;
        const summaryEnd =
            idx + 1 < titlesInfo.length
                ? titlesInfo[idx + 1].titleStart
                : sectionLines.length;

        const summaryLines = sectionLines.slice(summaryStart, summaryEnd);
        const zusammenfassung = summaryLines.join(" ").replace(/\s+/g, " ").trim();

        // Kennung = BGBl.-Zeile innerhalb des Titelblocks
        let kennung = "";
        for (let j = titleStart; j <= titleEnd; j++) {
            if (norm(sectionLines[j]).includes("bgbl.")) {
                kennung = sectionLines[j].trim();
                break;
            }
        }

        if (ueberschrift && zusammenfassung) {
            articles.push({
                kategorie: "Bundesgesetzblätter",
                ueberschrift,
                kennung,
                zusammenfassung
            });
        }
    }

    console.log(`[Parser] Bundesgesetzblätter: ${articles.length} Artikel gefunden.`);
    return articles;
}






exports.parseAndStorePdfArticles = async (req, res) => {
    const { template_id, business_partner_id } = req.body;
    // const { role } = req.user; // Nicht mehr nötig, adminAuth prüft bereits

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



exports.getTemplates = async (req, res) => {
    // const { role } = req.user; // Nicht mehr nötig
    console.log('[AdminController] getTemplates: Wird von Admin aufgerufen.'); 
    try {
        const query = "SELECT * FROM monitor_templates ORDER BY template_name ASC";
        const result = await db.query(query);
        
        console.log(`[AdminController] getTemplates: Sende ${result.rows.length} Templates (als Array).`); 
        
        res.json({ data: result.rows });
    } catch (err) {
        console.error('[AdminController] Fehler in getTemplates:', err);
        res.status(500).json({ message: 'Serverfehler' });
    }
};



exports.getEntries = async (req, res) => {
    // const { role } = req.user; // Nicht mehr nötig
    const { templateId, bpId, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    console.log(`[AdminController] getEntries: Wird von Admin aufgerufen (Seite ${page}, Limit ${limit}).`);

    try {
        let baseQuery = `
            FROM monitor_entries me
            JOIN monitor_templates mt ON me.template_id = mt.id
        `;
        const whereClauses = [];
        const queryParams = [];
        let paramIndex = 1;

        // Da nur Admins hierher kommen, ist keine Rollenprüfung nötig
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
        
        console.log(`[AdminController] getEntries: Sende ${entriesResult.rows.length} Einträge (als Objekt).`);

        res.json({
            entries: entriesResult.rows,
            totalCount: totalCount
        });

    } catch (err) {
        console.error('[AdminController] Fehler in getEntries:', err);
        res.status(500).json({ message: 'Serverfehler' });
    }
};


exports.getBusinessPartnersList = async (req, res) => {
    // const { role } = req.user; // Nicht mehr nötig
    console.log(`[AdminController] getBusinessPartnersList: Wird von Admin aufgerufen.`);

    try {
        // Da nur Admins hierher kommen, immer ALLE Partner abfragen
        const query = `SELECT id, name FROM business_partners ORDER BY name ASC`;
        const result = await db.query(query);
        
        console.log(`[AdminController] getBusinessPartnersList: Sende ${result.rows.length} Partner.`);
        
        res.json({ data: result.rows });

    } catch (err) {
        console.error('[AdminController] Fehler in getBusinessPartnersList:', err);
        res.status(500).json({ message: 'Serverfehler' });
    }
};



exports.createTemplate = async (req, res) => {
    const { business_partner_id, template_name, industry, fields_definition } = req.body;
    // const { role } = req.user; // Nicht mehr nötig

    if (!business_partner_id) {
         return res.status(400).json({ message: 'Business Partner ID ist erforderlich.' });
    }

    try {
        const result = await db.query(
            `INSERT INTO monitor_templates (business_partner_id, template_name, industry, fields_definition)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [business_partner_id, template_name, industry || null, fields_definition]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Fehler beim Erstellen der Vorlage:', err);
        if (err.code === '23505') { 
            return res.status(409).json({ message: 'Eine Vorlage mit diesem Namen existiert bereits für diesen Partner.' });
        }
        res.status(500).json({ message: 'Serverfehler' });
    }
};



exports.updateTemplate = async (req, res) => {
    const { id } = req.params;
    const { business_partner_id, template_name, industry, fields_definition } = req.body;
    // const { role } = req.user; // Nicht mehr nötig, adminAuth prüft bereits

    if (!business_partner_id || !template_name || !fields_definition) {
         return res.status(400).json({ message: 'Business Partner ID, Name und Felddefinition sind erforderlich.' });
    }

    try {
        const result = await db.query(
            `UPDATE monitor_templates 
             SET 
                business_partner_id = $1, 
                template_name = $2, 
                industry = $3, 
                fields_definition = $4,
                updated_at = NOW()
             WHERE id = $5 
             RETURNING *`,
            [business_partner_id, template_name, industry || null, fields_definition, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Vorlage nicht gefunden.' });
        }
        
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Fehler beim Aktualisieren der Vorlage:', err);
        if (err.code === '23505') { // unique_violation
            return res.status(409).json({ message: 'Eine andere Vorlage mit diesem Namen existiert bereits für diesen Partner.' });
        }
        res.status(500).json({ message: 'Serverfehler' });
    }
};


exports.deleteTemplate = async (req, res) => {
    const { id } = req.params;
    // const { role } = req.user; // Nicht mehr nötig
    
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

// --- createEntry (Bereinigt) ---
exports.createEntry = async (req, res) => {
    const { template_id, business_partner_id, content_data, is_published, source_document_url } = req.body;
    // const { role } = req.user; // Nicht mehr nötig

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

// --- updateEntry (Bereinigt) ---
exports.updateEntry = async (req, res) => {
    const { id } = req.params;
    const { content_data, is_published } = req.body;
    // const { role } = req.user; // Nicht mehr nötig
    
    try {
        // Nur Admin-Logik ist übrig
        const query = `UPDATE monitor_entries SET content_data = $1, is_published = $2, updated_at = NOW() WHERE id = $3 RETURNING *`;
        const queryParams = [content_data, is_published, id];

        const result = await db.query(query, queryParams);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Eintrag nicht gefunden.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Fehler beim Aktualisieren des Eintrags:', err);
        res.status(500).json({ message: 'Serverfehler' });
    }
};

// --- deleteEntry (Bereinigt) ---
exports.deleteEntry = async (req, res) => {
    const { id } = req.params;
    // const { role } = req.user; // Nicht mehr nötig

    try {
        // Nur Admin-Logik ist übrig
        const query = `DELETE FROM monitor_entries WHERE id = $1`;
        const queryParams = [id];

        const result = await db.query(query, queryParams);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Eintrag nicht gefunden.' });
        }
        res.status(204).send();
    } catch (err) {
        console.error('Fehler beim Löschen des Eintrags:', err);
        res.status(500).json({ message: 'Serverfehler' });
    }
};

// --- getSignedUrlForSourceDocument (Bereinigt) ---
exports.getSignedUrlForSourceDocument = async (req, res) => {
    const { id: entryId } = req.params;
    // const { role } = req.user; // Nicht mehr nötig

    try {
        // Nur Admin-Logik ist übrig
        const query = `SELECT source_document_url FROM monitor_entries WHERE id = $1;`;
        const queryParams = [entryId];

        const result = await db.query(query, queryParams);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Datei nicht gefunden." });
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