const pool = require('../config/db');
//const fs = require('fs');   // NEU
//const path = require('path'); // NEU
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3Client = require("../config/s3Client.js");
const { v4: uuidv4 } = require('uuid');

// Ihre bestehende Funktion "getActionsForBusinessPartner"
exports.getActionsForBusinessPartner = async (req, res) => {
    const { role, business_partner_id } = req.user;
    const { search, sortBy, sortOrder } = req.query;
    try {
        let query;
        let queryParams = [];
        let paramIndex = 1;
        let baseQueryAdmin = `SELECT a.*, bp.name as business_partner_name FROM business_partner_actions a LEFT JOIN business_partners bp ON a.business_partner_id = bp.id`;
        let baseQueryAssistenz = `SELECT * FROM business_partner_actions`;
        let whereClauses = [];
        if (role === 'admin') {
            query = baseQueryAdmin;
            if (search) {
                whereClauses.push(`(a.title ILIKE $${paramIndex} OR a.content_text ILIKE $${paramIndex} OR bp.name ILIKE $${paramIndex})`);
                queryParams.push(`%${search}%`);
                paramIndex++;
            }
        } else if (role === 'assistenz' && business_partner_id) {
            query = baseQueryAssistenz;
            whereClauses.push(`business_partner_id = $${paramIndex}`);
            queryParams.push(business_partner_id);
            paramIndex++;
            if (search) {
                whereClauses.push(`(title ILIKE $${paramIndex} OR content_text ILIKE $${paramIndex})`);
                queryParams.push(`%${search}%`);
                paramIndex++;
            }
        } else {
            return res.status(403).json({ message: 'Unzureichende Berechtigungen oder keine Zuordnung zu einem Business Partner.' });
        }
        if (whereClauses.length > 0) {
            query += ' WHERE ' + whereClauses.join(' AND ');
        }
        const allowedSortBy = ['title', 'business_partner_name', 'start_date', 'end_date', 'created_at'];
        const orderBy = allowedSortBy.includes(sortBy) ? sortBy : 'created_at';
        const orderDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';
        query += ` ORDER BY ${orderBy} ${orderDirection}`;
        const result = await pool.query(query, queryParams);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfehler');
    }
};

// Ihre bestehende Funktion "createAction"
exports.createAction = async (req, res) => {
    const { role, business_partner_id: user_bp_id } = req.user;
    const { 
        layout_type, title, content_text, link_url, image_url, is_active, start_date, end_date, 
        business_partner_id: form_bp_id,
        // NEUE FELDER
        target_widget_category, target_region, is_click_tracking_enabled 
    } = req.body;

    const target_bp_id = (role === 'admin') ? form_bp_id : user_bp_id;
    if (!target_bp_id) {
        return res.status(400).json({ message: 'Business Partner ID fehlt.' });
    }
    try {
        const newAction = await pool.query(
            `INSERT INTO business_partner_actions (
                business_partner_id, layout_type, title, content_text, link_url, image_url, 
                is_active, start_date, end_date, 
                target_widget_category, target_region, is_click_tracking_enabled
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [
                target_bp_id, layout_type, title, content_text, link_url, image_url, 
                is_active, start_date, end_date,
                target_widget_category, target_region, is_click_tracking_enabled
            ]
        );
        res.status(201).json(newAction.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfehler');
    }
};

// Ihre bestehende Funktion "updateAction"
exports.updateAction = async (req, res) => {
    const { role, business_partner_id: user_bp_id } = req.user;
    const { id } = req.params;
    const { 
        layout_type, title, content_text, link_url, image_url, is_active, start_date, end_date, 
        business_partner_id: form_bp_id,
        // NEUE FELDER
        target_widget_category, target_region, is_click_tracking_enabled 
    } = req.body;

    try {
        // ... (Berechtigungsprüfung bleibt unverändert) ...

        // ==================================================================
        // HIER IST DIE FEHLENDE LOGIK:
        const target_bp_id = (role === 'admin') ? form_bp_id : user_bp_id;
        // ==================================================================
        
        // Diese Prüfung sollte auch hier stattfinden (wie in createAction)
        if (!target_bp_id) {
             return res.status(400).json({ message: 'Business Partner ID fehlt.' });
        }

        const updatedAction = await pool.query(
            `UPDATE business_partner_actions SET 
                business_partner_id = $1, layout_type = $2, title = $3, content_text = $4, 
                link_url = $5, image_url = $6, is_active = $7, start_date = $8, end_date = $9, 
                target_widget_category = $10, target_region = $11, is_click_tracking_enabled = $12, 
                updated_at = NOW() 
             WHERE id = $13 RETURNING *`,
            [
                // ... (bestehende Parameter)
                target_bp_id, // Dieser Wert ist jetzt definiert
                layout_type, title, content_text, link_url, image_url, is_active, start_date, end_date,
                // NEUE PARAMETER
                target_widget_category, target_region, is_click_tracking_enabled, 
                id
            ]
        );
        res.json(updatedAction.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfehler');
    }
};

// Ihre bestehende Funktion "deleteAction"
exports.deleteAction = async (req, res) => {
    const { role, business_partner_id } = req.user;
    const { id } = req.params;
    try {
        const actionResult = await pool.query('SELECT business_partner_id FROM business_partner_actions WHERE id = $1', [id]);
        if (actionResult.rows.length === 0) {
            return res.status(404).json({ message: 'Aktion nicht gefunden.' });
        }
        if (role === 'assistenz' && actionResult.rows[0].business_partner_id !== business_partner_id) {
            return res.status(403).json({ message: 'Zugriff verweigert.' });
        }
        await pool.query('DELETE FROM business_partner_actions WHERE id = $1', [id]);
        res.json({ message: 'Aktion erfolgreich gelöscht.' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfehler');
    }
};

// Ersetzen Sie die gesamte 'exports.uploadActionImage'-Funktion hiermit:
exports.uploadActionImage = async (req, res) => {
    if (!req.file) {
        return res.status(400).send({ message: 'Bitte wählen Sie eine Datei aus.' });
    }

    const file = req.file;

    try {
        // Eindeutigen Dateinamen generieren
        const fileExtension = file.originalname.split('.').pop() || '';
        const uniqueFileName = `${uuidv4()}${fileExtension ? '.' + fileExtension : ''}`;
        
        // Ihr Zielordner '/actions' wird hier als S3-Key-Präfix verwendet
        const storagePath = `actions/${uniqueFileName}`; 

        const params = {
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: storagePath,
            Body: file.buffer,
            ContentType: file.mimetype
        };

        await s3Client.send(new PutObjectCommand(params));

        // Die öffentliche URL der Datei konstruieren (wie in adminBusinessPartnerController.js)
        const publicUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${storagePath}`;

        res.status(200).json({ 
            message: 'Datei erfolgreich hochgeladen', 
            // Das Frontend erhält jetzt die volle S3-URL
            filePath: publicUrl 
        });

    } catch (err) {
        console.error("Fehler bei der S3-Dateiverarbeitung:", err);
        // Sicherstellen, dass keine temporären Dateien zurückbleiben (nicht mehr nötig mit memoryStorage)
        res.status(500).json({ message: 'Fehler bei der Dateiverarbeitung.' });
    }
};

exports.copyAction = async (req, res) => {
    const { id } = req.params;
    try {
        const originalActionRes = await pool.query('SELECT * FROM business_partner_actions WHERE id = $1', [id]);
        if (originalActionRes.rows.length === 0) {
            return res.status(404).json({ message: 'Originalaktion nicht gefunden.' });
        }
        const original = originalActionRes.rows[0];
        const newTitle = `Kopie von: ${original.title}`;
        const newAction = await pool.query(
            `INSERT INTO business_partner_actions (business_partner_id, layout_type, title, content_text, link_url, image_url, is_active, start_date, end_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [original.business_partner_id, original.layout_type, newTitle, original.content_text, original.link_url, original.image_url, false, original.start_date, original.end_date]
        );
        res.status(201).json(newAction.rows[0]);
    } catch (err) {
        console.error('Fehler beim Kopieren der Aktion:', err.message);
        res.status(500).send('Serverfehler');
    }
};
