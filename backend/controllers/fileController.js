// backend/controllers/fileController.js
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const s3Client = require("../config/s3Client.js");
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// === Upload ===
exports.uploadFile = async (req, res) => {
  const { id: userId, role, business_partner_id: userBusinessPartnerId } = req.user;
  const file = req.file;
  const { description, tags } = req.body;

  // Rollen: demo darf nicht hochladen
  if (role === 'demo') {
    return res.status(403).json({ message: "Demo-Benutzer dürfen keine Dateien hochladen." });
  }

  let targetBusinessPartnerId;
  if (role === 'admin') {
    targetBusinessPartnerId = req.body.businessPartnerId;
    if (!targetBusinessPartnerId) {
      return res.status(400).json({ message: "Für den Admin-Upload muss ein Business Partner ausgewählt werden." });
    }
  } else {
    targetBusinessPartnerId = userBusinessPartnerId;
  }

  if (!file) return res.status(400).json({ message: "Keine Datei hochgeladen." });
  if (!targetBusinessPartnerId) return res.status(403).json({ message: "Der Zieldatenpartner konnte nicht bestimmt werden." });

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Quota prüfen
    const quotaQuery = 'SELECT storage_limit_bytes, storage_usage_bytes FROM business_partners WHERE id = $1 FOR UPDATE;';
    const quotaResult = await client.query(quotaQuery, [targetBusinessPartnerId]);
    if (quotaResult.rows.length === 0) throw new Error("Business Partner nicht gefunden.");

    const { storage_limit_bytes, storage_usage_bytes } = quotaResult.rows[0];
    if (parseInt(storage_limit_bytes, 10) === 0) {
      return res.status(403).json({ message: "Ihr aktuelles Paket erlaubt keine Datei-Uploads." });
    }
    if (parseInt(storage_usage_bytes, 10) + file.size > parseInt(storage_limit_bytes, 10)) {
      return res.status(413).json({ message: "Speicherlimit überschritten. Upload nicht möglich." });
    }

    const fileExtension = file.originalname.includes('.') ? file.originalname.split('.').pop() : '';
    const uniqueFileName = fileExtension ? `${uuidv4()}.${fileExtension}` : uuidv4();
    const storagePath = `files/${targetBusinessPartnerId}/${uniqueFileName}`;

    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: storagePath,
      Body: file.buffer,
      ContentType: file.mimetype
    };
    await s3Client.send(new PutObjectCommand(params));

    const dbQuery = `
      INSERT INTO business_partner_files
        (filename, storage_path, file_type, file_size, uploader_id, business_partner_id, description, tags)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const tagsArray = typeof tags === 'string'
      ? tags.split(',').map(t => t.trim()).filter(Boolean)
      : (Array.isArray(tags) ? tags : []);
    const dbValues = [
      file.originalname,
      storagePath,
      file.mimetype,
      file.size,
      userId,
      targetBusinessPartnerId,
      description || null,
      tagsArray
    ];
    const result = await client.query(dbQuery, dbValues);

    await client.query(
      'UPDATE business_partners SET storage_usage_bytes = storage_usage_bytes + $1 WHERE id = $2;',
      [file.size, targetBusinessPartnerId]
    );

    await client.query('COMMIT');
    return res.status(201).json({ message: "Datei erfolgreich hochgeladen.", file: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Fehler beim Datei-Upload:", error);
    return res.status(500).json({ message: "Fehler beim Server während des Uploads." });
  } finally {
    client.release();
  }
};

// === Liste ===
/**
 * Admin: alle Dateien (optional Filter ?businessPartnerId=...); sonst Pagination über alle.
 * Andere Rollen: Dateien des eigenen Business Partners; ohne BP → leere Liste (kein 403).
 */
exports.listFiles = async (req, res) => {
  const { role, business_partner_id: userBpId } = req.user || {};
  try {
    // Pagination
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const offset = (page - 1) * limit;

    let sql;
    const params = [];

    if (role === 'admin') {
      // Admin kann optional nach Partner filtern
      const filterBpId = req.query.businessPartnerId ? String(req.query.businessPartnerId) : null;
      if (filterBpId) {
        sql = `
          SELECT
            bpf.id, bpf.filename, bpf.file_type, bpf.file_size, bpf.created_at,
            bpf.description, bpf.tags, bpf.download_count,
            bp.name AS business_partner_name
          FROM business_partner_files bpf
          JOIN business_partners bp ON bp.id = bpf.business_partner_id
          WHERE bpf.business_partner_id = $1
          ORDER BY bpf.created_at DESC
          LIMIT $2 OFFSET $3;
        `;
        params.push(filterBpId, limit, offset);
      } else {
        sql = `
          SELECT
            bpf.id, bpf.filename, bpf.file_type, bpf.file_size, bpf.created_at,
            bpf.description, bpf.tags, bpf.download_count,
            bp.name AS business_partner_name
          FROM business_partner_files bpf
          JOIN business_partners bp ON bp.id = bpf.business_partner_id
          ORDER BY bpf.created_at DESC
          LIMIT $1 OFFSET $2;
        `;
        params.push(limit, offset);
      }
    } else {
      // Nicht-Admins (inkl. demo): nur eigene BP-Dateien
      if (!userBpId) {
        // Kein BP zugeordnet → leere Liste statt 403, damit UI nicht „kaputt“ wirkt
        return res.json([]);
      }
      sql = `
        SELECT
          id, filename, file_type, file_size, created_at, description, tags, download_count
        FROM business_partner_files
        WHERE business_partner_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3;
      `;
      params.push(userBpId, limit, offset);
    }

    const { rows } = await db.query(sql, params);
    return res.status(200).json(rows);
  } catch (error) {
    console.error("Fehler beim Auflisten der Dateien:", error);
    return res.status(500).json({ message: "Fehler beim Abrufen der Dateiliste." });
  }
};

// === Download-URL ===
exports.getDownloadUrl = async (req, res) => {
  const { id: fileId } = req.params;
  const { role, business_partner_id: requestingUserBpId } = req.user || {};

  try {
    let query;
    const queryParams = [fileId];

    if (role === 'admin') {
      query = `SELECT storage_path FROM business_partner_files WHERE id = $1;`;
    } else {
      if (!requestingUserBpId) {
        return res.status(403).json({ message: "Kein Zugriff." });
      }
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
    return res.status(200).json({ url: signedUrl });
  } catch (error) {
    console.error("Fehler beim Erstellen der Download-URL:", error);
    return res.status(500).json({ message: "Fehler beim Erstellen der Download-URL." });
  }
};

// === Löschen ===
exports.deleteFile = async (req, res) => {
  const { id: fileId } = req.params;
  const { role, business_partner_id: businessPartnerId } = req.user || {};

  if (role !== 'admin' && role !== 'assistenz') {
    return res.status(403).json({ message: "Keine Berechtigung zum Löschen von Dateien." });
  }

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
    await client.query(
      'UPDATE business_partners SET storage_usage_bytes = storage_usage_bytes - $1 WHERE id = $2;',
      [file_size, fileBpId]
    );

    await client.query('COMMIT');
    return res.status(200).json({ message: "Datei erfolgreich gelöscht." });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Fehler beim Löschen der Datei:", error);
    return res.status(500).json({ message: "Fehler beim Löschen der Datei." });
  } finally {
    client.release();
  }
};

// === Download zählen (optional) ===
// === Download zählen & im Activity Log speichern ===
exports.trackDownload = async (req, res) => {
  const { id: fileId } = req.params;
  const { id: userId, username, role, business_partner_id: requestingUserBpId } = req.user || {};
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;

  try {
    let query;
    const queryParams = [fileId];

    if (role !== 'admin') {
      if (!requestingUserBpId) {
        return res.status(403).json({ message: "Kein Zugriff." });
      }
      query = `UPDATE business_partner_files SET download_count = download_count + 1 WHERE id = $1 AND business_partner_id = $2 RETURNING filename;`;
      queryParams.push(requestingUserBpId);
    } else {
      query = `UPDATE business_partner_files SET download_count = download_count + 1 WHERE id = $1 RETURNING filename;`;
    }

    const result = await db.query(query, queryParams);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Datei nicht gefunden oder Zugriff verweigert." });
    }

    const fileName = result.rows[0].filename;

    // HIER NEU: Den Download zusätzlich mit Zeitstempel im Activity Log festhalten
    if (userId) {
        await db.query(`
            INSERT INTO activity_log 
            (user_id, username, action_type, target_id, target_type, status, ip_address, details)
            VALUES ($1, $2, 'FILE_DOWNLOAD', $3, 'file', 'success', $4, $5)
        `, [
            userId, 
            username || 'Unbekannt', 
            fileId, 
            ipAddress || null, 
            JSON.stringify({ filename: fileName })
        ]);
    }

    return res.status(200).json({ message: "Download erfasst." });
  } catch (error) {
    console.error("Fehler beim Erfassen des Downloads:", error);
    return res.status(500).json({ message: "Fehler beim Server während der Download-Erfassung." });
  }
};

// === Bearbeiten (NEU) ===
exports.updateFile = async (req, res) => {
  const { id: fileId } = req.params;
  const { role, business_partner_id: businessPartnerId } = req.user || {};
  const { filename, description, tags } = req.body;

  // Nur Admins und Assistenten dürfen bearbeiten
  if (role !== 'admin' && role !== 'assistenz') {
    return res.status(403).json({ message: "Keine Berechtigung zum Bearbeiten von Dateien." });
  }

  if (!filename || filename.trim() === '') {
    return res.status(400).json({ message: "Der Dateiname darf nicht leer sein." });
  }

  try {
    let query;
    const tagsArray = typeof tags === 'string'
      ? tags.split(',').map(t => t.trim()).filter(Boolean)
      : (Array.isArray(tags) ? tags : []);
      
    const queryParams = [filename.trim(), description || null, tagsArray, fileId];

    if (role === 'admin') {
      query = `UPDATE business_partner_files SET filename = $1, description = $2, tags = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *;`;
    } else {
      query = `UPDATE business_partner_files SET filename = $1, description = $2, tags = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 AND business_partner_id = $5 RETURNING *;`;
      queryParams.push(businessPartnerId);
    }

    const result = await db.query(query, queryParams);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Datei nicht gefunden oder Zugriff verweigert." });
    }

    return res.status(200).json({ message: "Datei erfolgreich aktualisiert.", file: result.rows[0] });
  } catch (error) {
    console.error("Fehler beim Aktualisieren der Datei:", error);
    return res.status(500).json({ message: "Fehler beim Aktualisieren der Datei." });
  }
};