// backend/controllers/fileController.js
const crypto = require('crypto');
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3Client = require('../config/s3Client.js');
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { logActivity } = require('../services/auditLogService');
const { scanBufferForMalware, isMalwareScanRequired } = require('../services/malwareScanService');

const isValidUUID = (uuid) =>
  uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

const normalizeRole = (role) => String(role || '').trim().toLowerCase();

const PUBLIC_DOWNLOAD_ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'docx',
  'xlsx',
  'pptx',
  'doc',
  'xls',
  'ppt',
  'odf',
  'odt',
  'ods',
  'odp',
]);

const PUBLIC_DOWNLOAD_FILE_LABEL = 'PDF, DOCX, XLSX, PPTX, DOC, XLS, PPT, ODF, ODT, ODS und ODP';
const DEFAULT_PUBLIC_LINK_EXPIRY_DAYS = 30;
const MAX_PUBLIC_LINK_EXPIRY_DAYS = 3650;
const MAX_PUBLIC_LINK_DOWNLOADS = 1000000;

const PUBLIC_DOWNLOAD_BLOCKED_MIME_PARTS = [
  'html',
  'javascript',
  'ecmascript',
  'x-msdownload',
  'x-sh',
  'shellscript',
  'php',
];

const getFileExtension = (filename = '') => {
  const clean = String(filename || '').trim().toLowerCase();
  const lastDot = clean.lastIndexOf('.');
  if (lastDot === -1 || lastDot === clean.length - 1) return '';
  return clean.slice(lastDot + 1);
};

const isAllowedPublicDownloadFile = (filename, fileType) => {
  const ext = getFileExtension(filename);
  if (!PUBLIC_DOWNLOAD_ALLOWED_EXTENSIONS.has(ext)) return false;

  const mime = String(fileType || '').toLowerCase();
  if (PUBLIC_DOWNLOAD_BLOCKED_MIME_PARTS.some((part) => mime.includes(part))) return false;

  return true;
};

const parseTags = (tags) => {
  if (typeof tags === 'string') {
    return tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
  return Array.isArray(tags) ? tags.map((tag) => String(tag).trim()).filter(Boolean) : [];
};

const canManageFiles = (role) => {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === 'admin' || normalizedRole === 'assistenz';
};

const getRequestIp = (req) => String(
  req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || ''
).split(',')[0].trim().slice(0, 64) || null;

const parsePublicLinkPolicy = (body = {}) => {
  const rawExpiryDays = body.expiresInDays;
  let expiryDays = DEFAULT_PUBLIC_LINK_EXPIRY_DAYS;

  if (rawExpiryDays === null || rawExpiryDays === '' || rawExpiryDays === 0 || rawExpiryDays === '0') {
    expiryDays = null;
  } else if (rawExpiryDays !== undefined) {
    const parsedExpiryDays = Number(rawExpiryDays);
    if (!Number.isInteger(parsedExpiryDays) || parsedExpiryDays < 1 || parsedExpiryDays > MAX_PUBLIC_LINK_EXPIRY_DAYS) {
      return { error: `Die Gültigkeit muss zwischen 1 und ${MAX_PUBLIC_LINK_EXPIRY_DAYS} Tagen liegen oder unbegrenzt sein.` };
    }
    expiryDays = parsedExpiryDays;
  }

  const rawMaxDownloads = body.maxDownloads;
  let maxDownloads = null;
  if (rawMaxDownloads !== null && rawMaxDownloads !== '' && rawMaxDownloads !== undefined && rawMaxDownloads !== 0 && rawMaxDownloads !== '0') {
    const parsedMaxDownloads = Number(rawMaxDownloads);
    if (!Number.isInteger(parsedMaxDownloads) || parsedMaxDownloads < 1 || parsedMaxDownloads > MAX_PUBLIC_LINK_DOWNLOADS) {
      return { error: `Das Downloadlimit muss zwischen 1 und ${MAX_PUBLIC_LINK_DOWNLOADS} liegen oder leer bleiben.` };
    }
    maxDownloads = parsedMaxDownloads;
  }

  return {
    expiryDays,
    expiresAt: expiryDays ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000) : null,
    maxDownloads,
  };
};

const generatePublicToken = () => crypto.randomBytes(32).toString('base64url');
const hashPublicToken = (token) => crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');

const getRequestBaseUrl = (req) => {
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}`.replace(/\/$/, '');
};

const buildPublicFileUrl = (req, fileId, token) =>
  `${getRequestBaseUrl(req)}/api/public/files/${encodeURIComponent(fileId)}/${encodeURIComponent(token)}/download`;

const encodeDownloadFilename = (filename) => {
  const safeFallback = String(filename || 'download')
    .replace(/[\r\n"]/g, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .slice(0, 180) || 'download';
  const encoded = encodeURIComponent(String(filename || 'download'));
  return `attachment; filename="${safeFallback}"; filename*=UTF-8''${encoded}`;
};

const getFileForAuthorizedEditor = async ({ fileId, role, businessPartnerId }) => {
  if (!isValidUUID(fileId)) return null;

  const normalizedRole = normalizeRole(role);
  const params = [fileId];
  let sql = `
    SELECT id, filename, storage_path, file_type, file_size, business_partner_id,
           public_link_enabled, public_token_preview, public_download_count,
           public_link_download_count, public_link_expires_at, public_max_downloads,
           malware_scan_status
    FROM public.business_partner_files
    WHERE id = $1
  `;

  if (normalizedRole !== 'admin') {
    if (!businessPartnerId) return null;
    sql += ' AND business_partner_id = $2';
    params.push(businessPartnerId);
  }

  const { rows } = await db.query(sql, params);
  return rows[0] || null;
};

// === Upload ===
exports.uploadFile = async (req, res) => {
  const { id: userId, role: rawRole, business_partner_id: userBusinessPartnerId } = req.user || {};
  const role = normalizeRole(rawRole);
  const file = req.file;
  const { description, tags } = req.body;

  if (!canManageFiles(role)) {
    return res.status(403).json({ message: 'Nur Administratoren und Assistenten dürfen Dateien hochladen.' });
  }

  let targetBusinessPartnerId;
  if (role === 'admin') {
    targetBusinessPartnerId = req.body.businessPartnerId;
    if (!targetBusinessPartnerId) {
      return res.status(400).json({ message: 'Für den Admin-Upload muss ein Business Partner ausgewählt werden.' });
    }
  } else {
    targetBusinessPartnerId = userBusinessPartnerId;
  }

  if (!file) return res.status(400).json({ message: 'Keine Datei hochgeladen.' });
  if (!targetBusinessPartnerId) return res.status(403).json({ message: 'Der Zieldatenpartner konnte nicht bestimmt werden.' });

  const malwareScan = await scanBufferForMalware(file.buffer);
  if (malwareScan.status === 'infected') {
    return res.status(422).json({ message: 'Die Datei wurde als potenziell schädlich erkannt und nicht gespeichert.' });
  }
  if (isMalwareScanRequired() && malwareScan.status !== 'clean') {
    return res.status(503).json({ message: 'Die vorgeschriebene Sicherheitsprüfung ist derzeit nicht verfügbar. Bitte später erneut versuchen.' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const quotaQuery = 'SELECT storage_limit_bytes, storage_usage_bytes FROM business_partners WHERE id = $1 FOR UPDATE;';
    const quotaResult = await client.query(quotaQuery, [targetBusinessPartnerId]);
    if (quotaResult.rows.length === 0) throw new Error('Business Partner nicht gefunden.');

    const { storage_limit_bytes, storage_usage_bytes } = quotaResult.rows[0];
    if (parseInt(storage_limit_bytes, 10) === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Ihr aktuelles Paket erlaubt keine Datei-Uploads.' });
    }
    if (parseInt(storage_usage_bytes, 10) + file.size > parseInt(storage_limit_bytes, 10)) {
      await client.query('ROLLBACK');
      return res.status(413).json({ message: 'Speicherlimit überschritten. Upload nicht möglich.' });
    }

    const fileExtension = file.originalname.includes('.') ? file.originalname.split('.').pop() : '';
    const uniqueFileName = fileExtension ? `${uuidv4()}.${fileExtension}` : uuidv4();
    const storagePath = `files/${targetBusinessPartnerId}/${uniqueFileName}`;

    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: storagePath,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));

    const dbQuery = `
      INSERT INTO business_partner_files
        (filename, storage_path, file_type, file_size, uploader_id, business_partner_id,
         description, tags, malware_scan_status, malware_scanned_at, malware_scan_details)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
              CASE WHEN $9 = 'not_scanned' THEN NULL ELSE NOW() END, $10)
      RETURNING *;
    `;
    const dbValues = [
      file.originalname,
      storagePath,
      file.mimetype,
      file.size,
      userId,
      targetBusinessPartnerId,
      description || null,
      parseTags(tags),
      malwareScan.status,
      malwareScan.details || null,
    ];
    const result = await client.query(dbQuery, dbValues);

    await client.query(
      'UPDATE business_partners SET storage_usage_bytes = storage_usage_bytes + $1 WHERE id = $2;',
      [file.size, targetBusinessPartnerId]
    );

    await client.query('COMMIT');
    return res.status(201).json({ message: 'Datei erfolgreich hochgeladen.', file: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Fehler beim Datei-Upload:', error);
    return res.status(500).json({ message: 'Fehler beim Server während des Uploads.' });
  } finally {
    client.release();
  }
};

// === Liste ===
exports.listFiles = async (req, res) => {
  const { role: rawRole, business_partner_id: userBpId } = req.user || {};
  const role = normalizeRole(rawRole);
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const offset = (page - 1) * limit;

    let sql;
    const params = [];

    const selectedColumns = `
      bpf.id,
      bpf.filename,
      bpf.file_type,
      bpf.file_size,
      bpf.created_at,
      bpf.description,
      bpf.tags,
      bpf.download_count,
      COALESCE(bpf.public_link_enabled, false) AS public_link_enabled,
      bpf.public_token_preview,
      COALESCE(bpf.public_download_count, 0) AS public_download_count,
      COALESCE(bpf.public_link_download_count, 0) AS public_link_download_count,
      bpf.public_link_created_at,
      bpf.public_link_expires_at,
      bpf.public_max_downloads,
      bpf.public_last_downloaded_at,
      bpf.malware_scan_status,
      bpf.malware_scanned_at
    `;

    if (role === 'admin') {
      const filterBpId = req.query.businessPartnerId ? String(req.query.businessPartnerId) : null;
      if (filterBpId) {
        sql = `
          SELECT ${selectedColumns}, bp.name AS business_partner_name
          FROM business_partner_files bpf
          JOIN business_partners bp ON bp.id = bpf.business_partner_id
          WHERE bpf.business_partner_id = $1
          ORDER BY bpf.created_at DESC
          LIMIT $2 OFFSET $3;
        `;
        params.push(filterBpId, limit, offset);
      } else {
        sql = `
          SELECT ${selectedColumns}, bp.name AS business_partner_name
          FROM business_partner_files bpf
          JOIN business_partners bp ON bp.id = bpf.business_partner_id
          ORDER BY bpf.created_at DESC
          LIMIT $1 OFFSET $2;
        `;
        params.push(limit, offset);
      }
    } else {
      if (!userBpId) return res.json([]);
      sql = `
        SELECT ${selectedColumns}
        FROM business_partner_files bpf
        WHERE bpf.business_partner_id = $1
        ORDER BY bpf.created_at DESC
        LIMIT $2 OFFSET $3;
      `;
      params.push(userBpId, limit, offset);
    }

    const { rows } = await db.query(sql, params);
    return res.status(200).json(rows);
  } catch (error) {
    console.error('Fehler beim Auflisten der Dateien:', error);
    return res.status(500).json({ message: 'Fehler beim Abrufen der Dateiliste.' });
  }
};

// === Interne Download-URL ===
exports.getDownloadUrl = async (req, res) => {
  const { id: fileId } = req.params;
  const { role: rawRole, business_partner_id: requestingUserBpId } = req.user || {};
  const role = normalizeRole(rawRole);

  try {
    let query;
    const queryParams = [fileId];

    if (role === 'admin') {
      query = 'SELECT storage_path, filename, file_type FROM business_partner_files WHERE id = $1;';
    } else {
      if (!requestingUserBpId) return res.status(403).json({ message: 'Kein Zugriff.' });
      query = 'SELECT storage_path, filename, file_type FROM business_partner_files WHERE id = $1 AND business_partner_id = $2;';
      queryParams.push(requestingUserBpId);
    }

    const result = await db.query(query, queryParams);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Datei nicht gefunden oder Zugriff verweigert.' });
    }

    const { storage_path: storagePath, filename, file_type: fileType } = result.rows[0];
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: storagePath,
      ResponseContentDisposition: encodeDownloadFilename(filename),
      ResponseContentType: fileType || undefined,
    });
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });
    return res.status(200).json({ url: signedUrl });
  } catch (error) {
    console.error('Fehler beim Erstellen der Download-URL:', error);
    return res.status(500).json({ message: 'Fehler beim Erstellen der Download-URL.' });
  }
};

// === Geheimen öffentlichen Direktlink erzeugen/rotieren ===
exports.createPublicLink = async (req, res) => {
  const { id: fileId } = req.params;
  const { id: userId, username, role: rawRole, business_partner_id: businessPartnerId } = req.user || {};
  const role = normalizeRole(rawRole);

  if (!canManageFiles(role)) {
    return res.status(403).json({ message: 'Keine Berechtigung zum Erstellen öffentlicher Direktlinks.' });
  }

  const policy = parsePublicLinkPolicy(req.body || {});
  if (policy.error) return res.status(400).json({ message: policy.error });

  try {
    const file = await getFileForAuthorizedEditor({ fileId, role, businessPartnerId });
    if (!file) return res.status(404).json({ message: 'Datei nicht gefunden oder Zugriff verweigert.' });

    if (!isAllowedPublicDownloadFile(file.filename, file.file_type)) {
      return res.status(400).json({
        message: `Für externe Direktlinks sind nur ${PUBLIC_DOWNLOAD_FILE_LABEL} erlaubt.`,
      });
    }
    if (file.malware_scan_status === 'infected') {
      return res.status(422).json({ message: 'Diese Datei ist aufgrund der Sicherheitsprüfung für externe Freigaben gesperrt.' });
    }
    if (isMalwareScanRequired() && file.malware_scan_status !== 'clean') {
      return res.status(409).json({ message: 'Diese Datei wurde noch nicht erfolgreich auf Schadsoftware geprüft.' });
    }

    const token = generatePublicToken();
    const tokenHash = hashPublicToken(token);
    const tokenPreview = token.slice(0, 8);

    const params = [tokenHash, tokenPreview, policy.expiresAt, policy.maxDownloads, userId || null, file.id];
    let sql = `
      UPDATE public.business_partner_files
      SET public_link_enabled = true,
          public_token_hash = $1,
          public_token_preview = $2,
          public_link_expires_at = $3,
          public_max_downloads = $4,
          public_link_download_count = 0,
          public_link_created_at = NOW(),
          public_link_created_by = $5,
          updated_at = NOW()
      WHERE id = $6
    `;
    if (role !== 'admin') {
      sql += ' AND business_partner_id = $7';
      params.push(businessPartnerId);
    }
    sql += ` RETURNING id, filename, business_partner_id, public_token_preview,
      public_link_enabled, public_download_count, public_link_download_count,
      public_link_created_at, public_link_expires_at, public_max_downloads;`;

    const { rows } = await db.query(sql, params);
    if (rows.length === 0) return res.status(404).json({ message: 'Datei nicht gefunden oder Zugriff verweigert.' });

    const updatedFile = rows[0];
    await logActivity({
      userId: userId || null,
      username: username || 'Unbekannt',
      actionType: 'FILE_PUBLIC_LINK_CREATED',
      status: 'success',
      targetId: file.id,
      targetType: 'file',
      details: {
        filename: file.filename,
        businessPartnerId: file.business_partner_id,
        expiresAt: updatedFile.public_link_expires_at,
        maxDownloads: updatedFile.public_max_downloads,
      },
      ipAddress: getRequestIp(req),
    });

    return res.status(200).json({
      message: 'Geheimer Direktlink wurde erstellt. Der Link wird aus Sicherheitsgründen nur jetzt vollständig angezeigt.',
      file: updatedFile,
      url: buildPublicFileUrl(req, file.id, token),
    });
  } catch (error) {
    console.error('Fehler beim Erstellen des öffentlichen Direktlinks:', error);
    return res.status(500).json({ message: 'Öffentlicher Direktlink konnte nicht erstellt werden.' });
  }
};

// === Geheimen öffentlichen Direktlink deaktivieren ===
exports.disablePublicLink = async (req, res) => {
  const { id: fileId } = req.params;
  const { id: userId, username, role: rawRole, business_partner_id: businessPartnerId } = req.user || {};
  const role = normalizeRole(rawRole);

  if (!canManageFiles(role)) {
    return res.status(403).json({ message: 'Keine Berechtigung zum Deaktivieren öffentlicher Direktlinks.' });
  }

  try {
    const params = [fileId];
    let sql = `
      UPDATE public.business_partner_files
      SET public_link_enabled = false,
          public_token_hash = NULL,
          public_token_preview = NULL,
          public_link_created_at = NULL,
          public_link_created_by = NULL,
          public_link_expires_at = NULL,
          public_max_downloads = NULL,
          public_link_download_count = 0,
          updated_at = NOW()
      WHERE id = $1
    `;
    if (role !== 'admin') {
      if (!businessPartnerId) return res.status(403).json({ message: 'Kein Zugriff.' });
      sql += ' AND business_partner_id = $2';
      params.push(businessPartnerId);
    }
    sql += ` RETURNING id, filename, business_partner_id, public_link_enabled,
      public_token_preview, public_download_count, public_link_download_count,
      public_link_created_at, public_link_expires_at, public_max_downloads;`;

    const { rows } = await db.query(sql, params);
    if (rows.length === 0) return res.status(404).json({ message: 'Datei nicht gefunden oder Zugriff verweigert.' });

    await logActivity({
      userId: userId || null,
      username: username || 'Unbekannt',
      actionType: 'FILE_PUBLIC_LINK_DISABLED',
      status: 'success',
      targetId: fileId,
      targetType: 'file',
      details: {
        filename: rows[0].filename,
        businessPartnerId: rows[0].business_partner_id,
      },
      ipAddress: getRequestIp(req),
    });

    return res.status(200).json({ message: 'Öffentlicher Direktlink wurde deaktiviert.', file: rows[0] });
  } catch (error) {
    console.error('Fehler beim Deaktivieren des öffentlichen Direktlinks:', error);
    return res.status(500).json({ message: 'Öffentlicher Direktlink konnte nicht deaktiviert werden.' });
  }
};

// === Öffentlicher Download über geheimen Token ===
exports.getPublicDownloadUrl = async (req, res) => {
  const { id: fileId, token } = req.params;

  if (!isValidUUID(fileId) || !token || String(token).length < 32 || String(token).length > 256) {
    return res.status(404).type('text/plain').send('Datei nicht gefunden.');
  }

  try {
    const tokenHash = hashPublicToken(token);
    const { rows: linkRows } = await db.query(
      `SELECT id, filename, storage_path, file_type, business_partner_id,
              public_link_enabled, public_link_expires_at, public_max_downloads,
              COALESCE(public_link_download_count, 0) AS public_link_download_count
       FROM public.business_partner_files
       WHERE id = $1
         AND public_token_hash = $2
       LIMIT 1`,
      [fileId, tokenHash]
    );

    const link = linkRows[0];
    if (!link || !link.public_link_enabled || !isAllowedPublicDownloadFile(link.filename, link.file_type)) {
      return res.status(404).type('text/plain').send('Datei nicht gefunden.');
    }

    if (link.public_link_expires_at && new Date(link.public_link_expires_at).getTime() <= Date.now()) {
      return res.status(410).type('text/plain').send('Dieser Download-Link ist abgelaufen.');
    }
    if (link.public_max_downloads && link.public_link_download_count >= link.public_max_downloads) {
      return res.status(410).type('text/plain').send('Das Downloadlimit dieses Links ist erreicht.');
    }

    const { rows } = await db.query(
      `UPDATE public.business_partner_files
       SET public_download_count = COALESCE(public_download_count, 0) + 1,
           public_link_download_count = COALESCE(public_link_download_count, 0) + 1,
           public_last_downloaded_at = NOW(),
           download_count = COALESCE(download_count, 0) + 1
       WHERE id = $1
         AND public_link_enabled = true
         AND public_token_hash = $2
         AND (public_link_expires_at IS NULL OR public_link_expires_at > NOW())
         AND (public_max_downloads IS NULL OR COALESCE(public_link_download_count, 0) < public_max_downloads)
       RETURNING id, filename, storage_path, file_type, business_partner_id,
                 public_link_download_count, public_max_downloads`,
      [link.id, tokenHash]
    );

    const file = rows[0];
    if (!file) {
      return res.status(410).type('text/plain').send('Dieser Download-Link ist nicht mehr verfügbar.');
    }

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: file.storage_path,
      ResponseContentDisposition: encodeDownloadFilename(file.filename),
      ResponseContentType: file.file_type || undefined,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });
    await logActivity({
      userId: null,
      username: 'Externer Link',
      actionType: 'FILE_PUBLIC_DOWNLOAD',
      status: 'success',
      targetId: file.id,
      targetType: 'file',
      details: {
        filename: file.filename,
        businessPartnerId: file.business_partner_id,
        linkDownloadCount: file.public_link_download_count,
        maxDownloads: file.public_max_downloads,
      },
      ipAddress: getRequestIp(req),
    });
    res.set('Cache-Control', 'no-store');
    return res.redirect(302, signedUrl);
  } catch (error) {
    console.error('Fehler beim öffentlichen Datei-Download:', error);
    return res.status(500).type('text/plain').send('Datei konnte nicht geladen werden.');
  }
};

// === Löschen ===
exports.deleteFile = async (req, res) => {
  const { id: fileId } = req.params;
  const { role: rawRole, business_partner_id: businessPartnerId } = req.user || {};
  const role = normalizeRole(rawRole);

  if (role !== 'admin' && role !== 'assistenz') {
    return res.status(403).json({ message: 'Keine Berechtigung zum Löschen von Dateien.' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    let query;
    const queryParams = [fileId];

    if (role === 'admin') {
      query = 'SELECT storage_path, file_size, business_partner_id FROM business_partner_files WHERE id = $1;';
    } else {
      query = 'SELECT storage_path, file_size, business_partner_id FROM business_partner_files WHERE id = $1 AND business_partner_id = $2;';
      queryParams.push(businessPartnerId);
    }

    const result = await client.query(query, queryParams);
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Datei nicht gefunden oder Zugriff verweigert.' });
    }

    const { storage_path, file_size, business_partner_id: fileBpId } = result.rows[0];

    await s3Client.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: storage_path }));

    await client.query('DELETE FROM business_partner_files WHERE id = $1', [fileId]);
    await client.query(
      'UPDATE business_partners SET storage_usage_bytes = GREATEST(COALESCE(storage_usage_bytes, 0) - $1, 0) WHERE id = $2;',
      [file_size, fileBpId]
    );

    await client.query('COMMIT');
    return res.status(200).json({ message: 'Datei erfolgreich gelöscht.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Fehler beim Löschen der Datei:', error);
    return res.status(500).json({ message: 'Fehler beim Löschen der Datei.' });
  } finally {
    client.release();
  }
};

// === Download zählen & im Activity Log speichern ===
exports.trackDownload = async (req, res) => {
  const { id: fileId } = req.params;
  const { id: userId, username, role: rawRole, business_partner_id: requestingUserBpId } = req.user || {};
  const role = normalizeRole(rawRole);
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;

  try {
    let query;
    const queryParams = [fileId];

    if (role !== 'admin') {
      if (!requestingUserBpId) return res.status(403).json({ message: 'Kein Zugriff.' });
      query = 'UPDATE business_partner_files SET download_count = download_count + 1 WHERE id = $1 AND business_partner_id = $2 RETURNING filename;';
      queryParams.push(requestingUserBpId);
    } else {
      query = 'UPDATE business_partner_files SET download_count = download_count + 1 WHERE id = $1 RETURNING filename;';
    }

    const result = await db.query(query, queryParams);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Datei nicht gefunden oder Zugriff verweigert.' });
    }

    const fileName = result.rows[0].filename;

    if (userId) {
      await db.query(
        `INSERT INTO activity_log
          (user_id, username, action_type, target_id, target_type, status, ip_address, details)
         VALUES ($1, $2, 'FILE_DOWNLOAD', $3, 'file', 'success', $4, $5)`,
        [userId, username || 'Unbekannt', fileId, ipAddress || null, JSON.stringify({ filename: fileName })]
      );
    }

    return res.status(200).json({ message: 'Download erfasst.' });
  } catch (error) {
    console.error('Fehler beim Erfassen des Downloads:', error);
    return res.status(500).json({ message: 'Fehler beim Server während der Download-Erfassung.' });
  }
};

// === Bearbeiten ===
exports.updateFile = async (req, res) => {
  const { id: fileId } = req.params;
  const { role: rawRole, business_partner_id: businessPartnerId } = req.user || {};
  const role = normalizeRole(rawRole);
  const { filename, description, tags } = req.body;

  if (role !== 'admin' && role !== 'assistenz') {
    return res.status(403).json({ message: 'Keine Berechtigung zum Bearbeiten von Dateien.' });
  }

  if (!filename || filename.trim() === '') {
    return res.status(400).json({ message: 'Der Dateiname darf nicht leer sein.' });
  }

  try {
    const tagsArray = parseTags(tags);
    const normalizedFilename = filename.trim();
    const publicExtensionStillAllowed = PUBLIC_DOWNLOAD_ALLOWED_EXTENSIONS.has(getFileExtension(normalizedFilename));
    const queryParams = [normalizedFilename, description || null, tagsArray, fileId, publicExtensionStillAllowed];

    const publicLinkSafetyUpdate = `
      public_link_enabled = CASE WHEN $5 THEN public_link_enabled ELSE false END,
      public_token_hash = CASE WHEN $5 THEN public_token_hash ELSE NULL END,
      public_token_preview = CASE WHEN $5 THEN public_token_preview ELSE NULL END,
      public_link_expires_at = CASE WHEN $5 THEN public_link_expires_at ELSE NULL END,
      public_max_downloads = CASE WHEN $5 THEN public_max_downloads ELSE NULL END,
      public_link_created_at = CASE WHEN $5 THEN public_link_created_at ELSE NULL END,
      public_link_created_by = CASE WHEN $5 THEN public_link_created_by ELSE NULL END
    `;

    let query;
    if (role === 'admin') {
      query = `UPDATE business_partner_files
        SET filename = $1, description = $2, tags = $3,
            ${publicLinkSafetyUpdate}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4 RETURNING *;`;
    } else {
      query = `UPDATE business_partner_files
        SET filename = $1, description = $2, tags = $3,
            ${publicLinkSafetyUpdate}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4 AND business_partner_id = $6 RETURNING *;`;
      queryParams.push(businessPartnerId);
    }

    const result = await db.query(query, queryParams);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Datei nicht gefunden oder Zugriff verweigert.' });
    }

    return res.status(200).json({ message: 'Datei erfolgreich aktualisiert.', file: result.rows[0] });
  } catch (error) {
    console.error('Fehler beim Aktualisieren der Datei:', error);
    return res.status(500).json({ message: 'Fehler beim Aktualisieren der Datei.' });
  }
};
