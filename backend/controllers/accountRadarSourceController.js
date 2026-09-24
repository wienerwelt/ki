const db = require('../config/db');
const { logActivity } = require('../services/auditLogService');
const { getBusinessPartnerSalesPlan } = require('../services/salesPlanService');
const {
  archiveExternalSource,
  createExternalSource,
  listExternalSources,
  runExternalSource,
  setExternalSourceEnabled,
} = require('../services/accountRadarSourceService');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getTenantId = (req) => {
  const id = String(req.user?.business_partner_id || '').trim();
  if (!UUID_PATTERN.test(id)) {
    const error = new Error('Kein gültiger Mandant zugeordnet.');
    error.statusCode = 400;
    throw error;
  }
  return id;
};

const getSourceId = (req) => {
  const id = String(req.params?.sourceId || '').trim();
  if (!UUID_PATTERN.test(id)) {
    const error = new Error('Ungültige externe Quelle.');
    error.statusCode = 400;
    throw error;
  }
  return id;
};

const handleError = (res, error, context) => {
  console.error(`[AccountRadarSources] ${context}:`, error.message);
  if (error.code === '23505') {
    return res.status(409).json({ message: 'Diese externe Quelle ist bereits angelegt.' });
  }
  return res.status(error.statusCode || 500).json({
    message: error.statusCode ? error.message : 'Beobachtete Quellen konnten nicht verarbeitet werden.',
  });
};

const audit = (req, actionType, targetId, details = {}) => logActivity({
  userId: req.user?.id || null,
  username: req.user?.email || req.user?.username || 'System',
  actionType,
  status: 'success',
  targetId,
  targetType: 'account_radar_external_source',
  details,
  ipAddress: req.ip || null,
});

exports.list = async (req, res) => {
  try {
    const businessPartnerId = getTenantId(req);
    const [sources, entitlements] = await Promise.all([
      listExternalSources(db, businessPartnerId),
      getBusinessPartnerSalesPlan(db, businessPartnerId),
    ]);
    return res.json({
      sources,
      usage: { current: sources.length, limit: entitlements.limits.externalSources },
      entitlements,
    });
  } catch (error) {
    return handleError(res, error, 'Liste');
  }
};

exports.create = async (req, res) => {
  try {
    const businessPartnerId = getTenantId(req);
    const result = await createExternalSource(
      businessPartnerId,
      req.user?.id || null,
      req.body || {}
    );
    await audit(req, 'ACCOUNT_RADAR_EXTERNAL_SOURCE_CREATED', result.source.id, {
      name: result.source.name,
      sourceType: result.source.account_radar_source_type,
      requestedUrl: result.detection.requestedUrl,
      monitoredUrl: result.detection.monitoredUrl,
      feedDetected: result.detection.feedDetected,
    });
    const message = result.detection.feedDetected
      ? 'Quelle aktiv: RSS/Atom wurde erkannt und die erste Prüfung gestartet.'
      : 'Website angelegt. Der Admin muss einmalig die HTML-Selektoren konfigurieren und die Quelle freigeben.';
    return res.status(201).json({
      ...result,
      message,
      warning: [result.detection.warning, result.queueWarning].filter(Boolean).join(' ') || null,
    });
  } catch (error) {
    return handleError(res, error, 'Anlegen');
  }
};

exports.run = async (req, res) => {
  try {
    const businessPartnerId = getTenantId(req);
    const sourceId = getSourceId(req);
    const result = await runExternalSource(db, businessPartnerId, sourceId);
    await audit(req, 'ACCOUNT_RADAR_EXTERNAL_SOURCE_RUN', sourceId, { jobId: result.jobId });
    return res.status(202).json({
      message: 'Die Quelle wird im Hintergrund geprüft. Neue Inhalte erscheinen danach unter Trigger-Treffer.',
      jobId: result.jobId,
    });
  } catch (error) {
    return handleError(res, error, 'Manuelle Prüfung');
  }
};

exports.update = async (req, res) => {
  const client = await db.connect();
  try {
    const businessPartnerId = getTenantId(req);
    const sourceId = getSourceId(req);
    if (typeof req.body?.enabled !== 'boolean') {
      const error = new Error('Bitte den Aktiv-Status eindeutig angeben.');
      error.statusCode = 400;
      throw error;
    }
    await client.query('BEGIN');
    const source = await setExternalSourceEnabled(client, businessPartnerId, sourceId, req.body.enabled);
    await client.query('COMMIT');
    await audit(req, 'ACCOUNT_RADAR_EXTERNAL_SOURCE_STATUS_CHANGED', sourceId, { enabled: source.is_active });
    return res.json({
      message: source.is_active ? 'Quelle wurde aktiviert.' : 'Quelle wurde pausiert.',
      source,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    return handleError(res, error, 'Statusänderung');
  } finally {
    client.release();
  }
};

exports.remove = async (req, res) => {
  const client = await db.connect();
  try {
    const businessPartnerId = getTenantId(req);
    const sourceId = getSourceId(req);
    await client.query('BEGIN');
    await archiveExternalSource(client, businessPartnerId, sourceId, req.user?.id || null);
    await client.query('COMMIT');
    await audit(req, 'ACCOUNT_RADAR_EXTERNAL_SOURCE_ARCHIVED', sourceId);
    return res.json({ message: 'Externe Quelle wurde entfernt. Bereits vorhandene Inhalte bleiben im Archiv erhalten.' });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    return handleError(res, error, 'Entfernen');
  } finally {
    client.release();
  }
};
