const crypto = require('crypto');
const db = require('../config/db');

const ALLOWED_MODULES = new Set(['content', 'sales', 'community', 'public_page', 'admin']);
const ALLOWED_STATUS = new Set(['draft', 'published']);
const ALLOWED_AUDIENCE = new Set(['all', 'selected']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);
const cleanModules = (value) => Array.from(new Set((Array.isArray(value) ? value : [])
  .map((item) => String(item || '').trim().toLowerCase())
  .filter((item) => ALLOWED_MODULES.has(item))));
const slugify = (value) => cleanText(value, 180)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 120) || 'plattform-update';

const normalizeImageUrl = (value) => {
  const imageUrl = cleanText(value, 1000);
  if (!imageUrl) return null;
  if (imageUrl.startsWith('/') || /^https:\/\//i.test(imageUrl)) return imageUrl;
  return null;
};

function validatePayload(body = {}) {
  const title = cleanText(body.title, 180);
  const summary = cleanText(body.summary, 600);
  const content = cleanText(body.body, 12000);
  const benefits = cleanText(body.benefits, 2000) || null;
  const actionText = cleanText(body.action_text, 2000) || null;
  const modules = cleanModules(body.modules);
  const status = cleanText(body.status, 20).toLowerCase();
  const audienceScope = cleanText(body.audience_scope || 'all', 20).toLowerCase();
  const audiencePartnerIds = Array.from(new Set((Array.isArray(body.audience_partner_ids) ? body.audience_partner_ids : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)));
  const imageUrl = normalizeImageUrl(body.image_url);
  if (!title || !summary || !content || modules.length === 0 || !ALLOWED_STATUS.has(status)) {
    return { error: 'Titel, Kurztext, Inhalt, mindestens ein Bereich und ein gültiger Status sind erforderlich.' };
  }
  if (body.action_required === true && !actionText) return { error: 'Bitte beschreiben Sie die erforderliche Aktion.' };
  if (body.image_url && !imageUrl) return { error: 'Das Bild muss eine interne Datei oder eine HTTPS-Adresse sein.' };
  if (!ALLOWED_AUDIENCE.has(audienceScope)) return { error: 'Bitte eine gültige Mandanten-Zielgruppe auswählen.' };
  if (audiencePartnerIds.some((id) => !UUID.test(id))) return { error: 'Mindestens eine Mandanten-ID ist ungültig.' };
  if (audienceScope === 'selected' && audiencePartnerIds.length === 0) return { error: 'Bitte mindestens einen Mandanten auswählen.' };
  if (audiencePartnerIds.length > 500) return { error: 'Es können maximal 500 Mandanten ausgewählt werden.' };
  return {
    value: {
      title, summary, body: content, benefits, modules, status, image_url: imageUrl,
      action_required: body.action_required === true,
      action_text: body.action_required === true ? actionText : null,
      audience_scope: audienceScope,
      audience_partner_ids: audienceScope === 'selected' ? audiencePartnerIds : [],
    },
  };
}

async function validateAudiencePartners(client, value) {
  if (value.audience_scope !== 'selected') return;
  const result = await client.query(
    'SELECT id FROM business_partners WHERE id = ANY($1::uuid[]) AND is_active = TRUE',
    [value.audience_partner_ids]
  );
  if (result.rowCount !== value.audience_partner_ids.length) {
    const error = new Error('Mindestens ein ausgewählter Mandant ist nicht verfügbar.');
    error.status = 400;
    throw error;
  }
}

async function replaceAudiencePartners(client, updateId, value) {
  await client.query('DELETE FROM platform_update_partners WHERE update_id = $1', [updateId]);
  if (value.audience_scope === 'selected') {
    await client.query(
      `INSERT INTO platform_update_partners(update_id, business_partner_id)
       SELECT $1, partner_id FROM unnest($2::uuid[]) AS partner_id`,
      [updateId, value.audience_partner_ids]
    );
  }
}

const audienceFields = `pu.audience_scope,
  COALESCE(ARRAY(SELECT pup.business_partner_id FROM platform_update_partners pup
    WHERE pup.update_id = pu.id ORDER BY pup.business_partner_id), ARRAY[]::uuid[]) AS audience_partner_ids,
  COALESCE(ARRAY(SELECT bp.name FROM platform_update_partners pup
    JOIN business_partners bp ON bp.id = pup.business_partner_id
    WHERE pup.update_id = pu.id ORDER BY bp.name), ARRAY[]::text[]) AS audience_partner_names`;

exports.publicList = async (req, res) => {
  try {
    const partnerId = cleanText(req.query?.partnerId, 50) || null;
    if (partnerId && !UUID.test(partnerId)) return res.status(400).json({ message: 'Ungültiger Mandant.' });
    const result = await db.query(
      `SELECT id, slug, title, summary, body, benefits, modules, image_url,
              action_required, action_text, published_at, updated_at
       FROM platform_updates pu
       WHERE status = 'published' AND published_at IS NOT NULL AND published_at <= NOW()
         AND (pu.audience_scope = 'all' OR ($1::uuid IS NOT NULL AND EXISTS (
           SELECT 1 FROM platform_update_partners pup
           WHERE pup.update_id = pu.id AND pup.business_partner_id = $1::uuid
         )))
       ORDER BY published_at DESC, created_at DESC
       LIMIT 100`,
      [partnerId]
    );
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.json(result.rows);
  } catch (error) {
    console.error('[platform-updates] public list:', error);
    return res.status(500).json({ message: 'Plattform-Updates konnten nicht geladen werden.' });
  }
};

exports.list = async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT id, slug, title, summary, body, benefits, modules, image_url,
              action_required, action_text, status, published_at, created_at, updated_at,
              ${audienceFields}
       FROM platform_updates pu
       ORDER BY COALESCE(published_at, created_at) DESC`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('[platform-updates] admin list:', error);
    return res.status(500).json({ message: 'Plattform-Updates konnten nicht geladen werden.' });
  }
};

exports.create = async (req, res) => {
  const normalized = validatePayload(req.body);
  if (normalized.error) return res.status(400).json({ message: normalized.error });
  const value = normalized.value;
  const id = crypto.randomUUID();
  const slug = `${slugify(value.title)}-${id.slice(0, 8)}`;
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    await validateAudiencePartners(client, value);
    const result = await client.query(
      `INSERT INTO platform_updates
         (id, slug, title, summary, body, benefits, modules, image_url, action_required,
          action_text, status, audience_scope, published_at, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               CASE WHEN $11 = 'published' THEN NOW() ELSE NULL END, $13, $13)
       RETURNING *`,
      [id, slug, value.title, value.summary, value.body, value.benefits, value.modules,
        value.image_url, value.action_required, value.action_text, value.status, value.audience_scope, req.user.id]
    );
    await replaceAudiencePartners(client, id, value);
    await client.query('COMMIT');
    return res.status(201).json({ ...result.rows[0], audience_partner_ids: value.audience_partner_ids });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[platform-updates] create:', error);
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'Plattform-Update konnte nicht angelegt werden.' });
  } finally { if (client) client.release(); }
};

exports.update = async (req, res) => {
  const normalized = validatePayload(req.body);
  if (normalized.error) return res.status(400).json({ message: normalized.error });
  const value = normalized.value;
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    await validateAudiencePartners(client, value);
    const result = await client.query(
      `UPDATE platform_updates SET
         title = $2, summary = $3, body = $4, benefits = $5, modules = $6,
         image_url = $7, action_required = $8, action_text = $9, status = $10,
         audience_scope = $11,
         published_at = CASE
           WHEN $10 = 'published' AND published_at IS NULL THEN NOW()
           WHEN $10 = 'draft' THEN NULL
           ELSE published_at
         END,
         updated_by = $12, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, value.title, value.summary, value.body, value.benefits, value.modules,
        value.image_url, value.action_required, value.action_text, value.status, value.audience_scope, req.user.id]
    );
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Plattform-Update nicht gefunden.' });
    }
    await replaceAudiencePartners(client, req.params.id, value);
    await client.query('COMMIT');
    return res.json({ ...result.rows[0], audience_partner_ids: value.audience_partner_ids });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[platform-updates] update:', error);
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'Plattform-Update konnte nicht gespeichert werden.' });
  } finally { if (client) client.release(); }
};

exports.remove = async (req, res) => {
  try {
    const result = await db.query('DELETE FROM platform_updates WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Plattform-Update nicht gefunden.' });
    return res.json({ message: 'Plattform-Update gelöscht.' });
  } catch (error) {
    console.error('[platform-updates] delete:', error);
    return res.status(500).json({ message: 'Plattform-Update konnte nicht gelöscht werden.' });
  }
};
