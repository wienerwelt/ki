// backend/controllers/fileController.js
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const s3Client = require("../config/s3Client.js");
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

/**
 * Lädt eine Datei auf S3 hoch und speichert die Metadaten in der DB.
 */
exports.uploadFile = async (req, res) => {
    const { id: userId, business_partner_id: businessPartnerId } = req.user;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ message: "Keine Datei hochgeladen." });
    }
    if (!businessPartnerId) {
        return res.status(403).json({ message: "Benutzer ist keinem Business Partner zugewiesen." });
    }

    const fileExtension = file.originalname.split('.').pop();
    const uniqueFileName = `${uuidv4()}.${fileExtension}`;
    const storagePath = `uploads/${businessPartnerId}/${uniqueFileName}`;

    const params = {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: storagePath,
        Body: file.buffer,
        ContentType: file.mimetype,
    };

    try {
        await s3Client.send(new PutObjectCommand(params));
        console.log(`Datei erfolgreich nach S3 hochgeladen: ${storagePath}`);

        const dbQuery = `
            INSERT INTO business_partner_files 
            (filename, storage_path, file_type, file_size, uploader_id, business_partner_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `;
        const dbValues = [file.originalname, storagePath, file.mimetype, file.size, userId, businessPartnerId];
        const result = await db.query(dbQuery, dbValues);
        
        res.status(201).json({ message: "Datei erfolgreich hochgeladen.", file: result.rows[0] });
    } catch (error) {
        console.error("Fehler beim Datei-Upload:", error);
        res.status(500).json({ message: "Fehler beim Server während des Uploads." });
    }
};

/**
 * Listet alle Dateien für den Business Partner des eingeloggten Benutzers auf.
 */
exports.listFiles = async (req, res) => {
    const { business_partner_id: businessPartnerId } = req.user;

    if (!businessPartnerId) {
        return res.status(403).json({ message: "Benutzer ist keinem Business Partner zugewiesen." });
    }

    try {
        const query = `
            SELECT id, filename, file_type, file_size, created_at 
            FROM business_partner_files 
            WHERE business_partner_id = $1
            ORDER BY created_at DESC;
        `;
        const result = await db.query(query, [businessPartnerId]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Fehler beim Auflisten der Dateien:", error);
        res.status(500).json({ message: "Fehler beim Abrufen der Dateiliste." });
    }
};

/**
 * Generiert eine sichere, zeitlich begrenzte URL zum Herunterladen einer Datei.
 */
exports.getDownloadUrl = async (req, res) => {
    const { id: fileId } = req.params;
    const { business_partner_id: businessPartnerId } = req.user;

    try {
        const query = `SELECT storage_path FROM business_partner_files WHERE id = $1 AND business_partner_id = $2;`;
        const result = await db.query(query, [fileId, businessPartnerId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Datei nicht gefunden oder Zugriff verweigert." });
        }

        const storagePath = result.rows[0].storage_path;
        const command = new GetObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: storagePath,
        });

        // Erstellt eine URL, die für 60 Sekunden gültig ist.
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });

        res.status(200).json({ url: signedUrl });
    } catch (error) {
        console.error("Fehler beim Erstellen der Download-URL:", error);
        res.status(500).json({ message: "Fehler beim Erstellen der Download-URL." });
    }
};

/**
 * Löscht eine Datei aus S3 und der Datenbank. Nur für Admins/Assistenten.
 */
exports.deleteFile = async (req, res) => {
    const { id: fileId } = req.params;
    const { role, business_partner_id: businessPartnerId } = req.user;

    if (role !== 'admin' && role !== 'assistenz') {
        return res.status(403).json({ message: "Keine Berechtigung zum Löschen von Dateien." });
    }

    try {
        const query = `SELECT storage_path FROM business_partner_files WHERE id = $1 AND business_partner_id = $2;`;
        const result = await db.query(query, [fileId, businessPartnerId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Datei nicht gefunden oder Zugriff verweigert." });
        }

        const storagePath = result.rows[0].storage_path;
        const command = new DeleteObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: storagePath,
        });

        // 1. Datei aus S3 löschen
        await s3Client.send(command);
        console.log(`Datei erfolgreich aus S3 gelöscht: ${storagePath}`);

        // 2. Eintrag aus der Datenbank löschen
        await db.query(`DELETE FROM business_partner_files WHERE id = $1`, [fileId]);
        console.log(`Metadaten erfolgreich aus der Datenbank gelöscht.`);

        res.status(200).json({ message: "Datei erfolgreich gelöscht." });
    } catch (error) {
        console.error("Fehler beim Löschen der Datei:", error);
        res.status(500).json({ message: "Fehler beim Löschen der Datei." });
    }
};
