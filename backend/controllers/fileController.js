// backend/controllers/fileController.js
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const s3Client = require("../config/s3Client.js");
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// uploadFile-Funktion bleibt unverändert
exports.uploadFile = async (req, res) => {
    const { id: userId, business_partner_id: businessPartnerId } = req.user;
    const file = req.file;
    // NEU: Zusätzliche Daten aus dem Formular-Body auslesen
    const { description, tags } = req.body; 

    if (!file) return res.status(400).json({ message: "Keine Datei hochgeladen." });
    if (!businessPartnerId) return res.status(403).json({ message: "Benutzer ist keinem Business Partner zugewiesen." });

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // ... (Quota-Prüfung bleibt unverändert) ...
        const quotaQuery = 'SELECT storage_limit_bytes, storage_usage_bytes FROM business_partners WHERE id = $1 FOR UPDATE;';
        const quotaResult = await client.query(quotaQuery, [businessPartnerId]);
        if (quotaResult.rows.length === 0) throw new Error("Business Partner nicht gefunden.");
        const { storage_limit_bytes, storage_usage_bytes } = quotaResult.rows[0];
        if (storage_limit_bytes === 0) return res.status(403).json({ message: "Ihr aktuelles Paket erlaubt keine Datei-Uploads." });
        if (parseInt(storage_usage_bytes, 10) + file.size > parseInt(storage_limit_bytes, 10)) {
            return res.status(413).json({ message: "Speicherlimit überschritten. Upload nicht möglich." });
        }
        
        const fileExtension = file.originalname.split('.').pop();
        const uniqueFileName = `${uuidv4()}.${fileExtension}`;
        const storagePath = `files/${businessPartnerId}/${uniqueFileName}`;

        const params = { Bucket: process.env.AWS_S_BUCKET_NAME, Key: storagePath, Body: file.buffer, ContentType: file.mimetype };

        await s3Client.send(new PutObjectCommand(params));
        
        // NEU: Query um description und tags erweitert
        const dbQuery = `
            INSERT INTO business_partner_files 
            (filename, storage_path, file_type, file_size, uploader_id, business_partner_id, description, tags)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *;
        `;
        // Tags als Array formatieren, falls sie als String kommen
        const tagsArray = typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : (tags || []);
        
        const dbValues = [file.originalname, storagePath, file.mimetype, file.size, userId, businessPartnerId, description || null, tagsArray];
        const result = await client.query(dbQuery, dbValues);
        
        const updateUsageQuery = 'UPDATE business_partners SET storage_usage_bytes = storage_usage_bytes + $1 WHERE id = $2;';
        await client.query(updateUsageQuery, [file.size, businessPartnerId]);

        await client.query('COMMIT');
        res.status(201).json({ message: "Datei erfolgreich hochgeladen.", file: result.rows[0] });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Fehler beim Datei-Upload:", error);
        res.status(500).json({ message: "Fehler beim Server während des Uploads." });
    } finally {
        client.release();
    }
};

/**
 * Listet Dateien auf. Admins sehen alle Dateien, andere Benutzer nur die ihres Business Partners.
 */
exports.listFiles = async (req, res) => {
    const { role, business_partner_id: businessPartnerId } = req.user;


    try {
        let query;
        const queryParams = [];


        if (role === 'admin') {
            query = `
                SELECT
                    bpf.id, bpf.filename, bpf.file_type, bpf.file_size, bpf.created_at,
                    bpf.description, bpf.tags, bpf.download_count,
                    bp.name as business_partner_name
                FROM business_partner_files bpf
                JOIN business_partners bp ON bpf.business_partner_id = bp.id
                ORDER BY bpf.created_at DESC;
            `;
        } else {
            if (!businessPartnerId) return res.status(403).json({ message: "Benutzer ist keinem Business Partner zugewiesen." });
            query = `
                SELECT id, filename, file_type, file_size, created_at, description, tags, download_count
                FROM business_partner_files
                WHERE business_partner_id = $1
                ORDER BY created_at DESC;
            `;
            queryParams.push(businessPartnerId);
        }


        const result = await db.query(query, queryParams);
        res.status(200).json(result.rows);


    } catch (error) {
        console.error("Fehler beim Auflisten der Dateien:", error);
        res.status(500).json({ message: "Fehler beim Abrufen der Dateiliste." });
    }
};

/**
 * Generiert eine Download-URL. Admins können jede Datei herunterladen.
 */
exports.getDownloadUrl = async (req, res) => {
    const { id: fileId } = req.params;
    const { role, business_partner_id: requestingUserBpId } = req.user;

    try {
        let query;
        const queryParams = [fileId];

        // Admins dürfen jede Datei herunterladen, wir brauchen keine BP-ID-Prüfung.
        // Andere Benutzer werden auf ihre eigene BP-ID beschränkt.
        if (role === 'admin') {
            query = `SELECT storage_path FROM business_partner_files WHERE id = $1;`;
        } else {
            query = `SELECT storage_path FROM business_partner_files WHERE id = $1 AND business_partner_id = $2;`;
            queryParams.push(requestingUserBpId);
        }
        
        const result = await db.query(query, queryParams);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Datei nicht gefunden oder Zugriff verweigert." });
        }

        const storagePath = result.rows[0].storage_path;
        const command = new GetObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: storagePath,
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });
        res.status(200).json({ url: signedUrl });

    } catch (error) {
        console.error("Fehler beim Erstellen der Download-URL:", error);
        res.status(500).json({ message: "Fehler beim Erstellen der Download-URL." });
    }
};

/**
 * Löscht eine Datei. Admins können jede Datei löschen.
 */
exports.deleteFile = async (req, res) => {
    const { id: fileId } = req.params;
    const { role, business_partner_id: businessPartnerId } = req.user;

    // Nur Admins und Assistenten dürfen löschen, aber die Logik unten prüft zusätzlich,
    // ob der Assistent nur seine eigenen Dateien löscht.
    if (role !== 'admin' && role !== 'assistenz') {
        return res.status(403).json({ message: "Keine Berechtigung zum Löschen von Dateien." });
    }
    
    // ... (Logik zum Löschen bleibt fast gleich, aber die Abfrage muss angepasst werden)
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        
        let query;
        const queryParams = [fileId];

        if (role === 'admin') {
            query = `SELECT storage_path, file_size, business_partner_id FROM business_partner_files WHERE id = $1;`;
        } else {
            query = `SELECT storage_path, file_size, business_partner_id FROM business_partner_files WHERE id = $1 AND business_partner_id = $2;`;
            queryParams.push(businessPartnerId);
        }

        const result = await client.query(query, queryParams);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Datei nicht gefunden oder Zugriff verweigert." });
        }
        
        const { storage_path, file_size, business_partner_id: fileBpId } = result.rows[0];
        
        const command = new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: storage_path });
        await s3Client.send(command);
        
        await client.query(`DELETE FROM business_partner_files WHERE id = $1`, [fileId]);
        
        const updateUsageQuery = 'UPDATE business_partners SET storage_usage_bytes = storage_usage_bytes - $1 WHERE id = $2;';
        await client.query(updateUsageQuery, [file_size, fileBpId]);

        await client.query('COMMIT');
        res.status(200).json({ message: "Datei erfolgreich gelöscht." });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Fehler beim Löschen der Datei:", error);
        res.status(500).json({ message: "Fehler beim Löschen der Datei." });
    } finally {
        client.release();
    }
};


exports.trackDownload = async (req, res) => {
    const { id: fileId } = req.params;
    const { role, business_partner_id: requestingUserBpId } = req.user;


    try {
        let query;
        const queryParams = [fileId];


        // Stellen Sie sicher, dass der Benutzer Zugriff auf die Datei hat (optional, je nach Sicherheitsanforderungen)
        if (role !== 'admin') {
            query = `UPDATE business_partner_files SET download_count = download_count + 1 WHERE id = $1 AND business_partner_id = $2;`;
            queryParams.push(requestingUserBpId);
        } else {
            query = `UPDATE business_partner_files SET download_count = download_count + 1 WHERE id = $1;`;
        }


        const result = await db.query(query, queryParams);


        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Datei nicht gefunden oder Zugriff verweigert." });
        }


        res.status(200).json({ message: "Download erfasst." });


    } catch (error) {
        console.error("Fehler beim Erfassen des Downloads:", error);
        res.status(500).json({ message: "Fehler beim Server während der Download-Erfassung." });
    }
};

