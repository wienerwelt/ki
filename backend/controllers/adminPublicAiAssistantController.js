const crypto = require('crypto');
const db = require('../config/db');
const {
  expandOriginVariants,
  validateSourceUrl,
  ensureSettings,
  getManagedSettings,
  crawlBusinessPartnerHomepage,
} = require('../services/publicAiAssistantService');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_AVATAR_KEYS = new Set(['female', 'male']);

function resolveManagedPartnerId(req) {
  if (req.user?.role === 'assistenz') return req.user.business_partner_id || null;
  const requested = req.query.businessPartnerId || req.body?.businessPartnerId || req.params.businessPartnerId;
  return UUID_PATTERN.test(String(requested || '')) ? String(requested) : null;
}

function toBoundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(parsed, max)) : fallback;
}

function buildEmbedCode(settings) {
  const frontendUrl = String(process.env.FRONTEND_URL || 'https://dashboard.mobiliti.at').replace(/\/$/, '');
  const color = /^#[0-9a-f]{6}$/i.test(String(settings.primary_color || '')) ? settings.primary_color : '#e30613';
  return `<script async src="${frontendUrl}/assistant-embed.js" data-site-key="${settings.site_key}" data-color="${color}"></script>`;
}

function toRoleScopedSettings(req, settings) {
  if (req.user?.role !== 'admin') {
    const { site_key: _siteKey, allowed_origins: _allowedOrigins, ...assistantSettings } = settings;
    return assistantSettings;
  }
  return { ...settings, embed_code: buildEmbedCode(settings) };
}

async function loadPartner(partnerId) {
  const result = await db.query('SELECT id, name, url_businesspartner FROM business_partners WHERE id = $1 LIMIT 1', [partnerId]);
  return result.rows[0] || null;
}

exports.getSettings = async (req, res) => {
  try {
    const partnerId = resolveManagedPartnerId(req);
    if (!partnerId) return res.status(400).json({ message: 'Bitte einen Mandanten auswählen.' });
    const settings = await ensureSettings(partnerId);
    if (!settings) return res.status(404).json({ message: 'Mandant nicht gefunden.' });
    return res.json(toRoleScopedSettings(req, settings));
  } catch (error) {
    console.error('[Admin Public AI] Einstellungen:', error.message);
    return res.status(500).json({ message: 'Einstellungen konnten nicht geladen werden.' });
  }
};

exports.updateSettings = async (req, res) => {
  const partnerId = resolveManagedPartnerId(req);
  if (!partnerId) return res.status(400).json({ message: 'Bitte einen Mandanten auswählen.' });
  try {
    const partner = await loadPartner(partnerId);
    if (!partner) return res.status(404).json({ message: 'Mandant nicht gefunden.' });

    const sourceUrl = String(req.body?.sourceUrl || partner.url_businesspartner || '').trim();
    if (!sourceUrl || !partner.url_businesspartner) {
      return res.status(400).json({ message: 'Beim Mandanten muss zuerst eine Homepage-URL hinterlegt sein.' });
    }
    const normalizedSource = await validateSourceUrl(sourceUrl, partner.url_businesspartner);

    const previous = await ensureSettings(partnerId);
    const rawOrigins = req.user?.role === 'admin' && Array.isArray(req.body?.allowedOrigins)
      ? req.body.allowedOrigins
      : (previous?.allowed_origins || []);
    if (rawOrigins.length > 10) return res.status(400).json({ message: 'Maximal zehn Einbettungs-Domains sind erlaubt.' });
    const allowedOrigins = Array.from(new Set(rawOrigins.filter(Boolean).flatMap((origin) => expandOriginVariants(origin, partner.url_businesspartner))));
    if (process.env.NODE_ENV === 'production' && allowedOrigins.some((origin) => !origin.startsWith('https://'))) {
      return res.status(400).json({ message: 'In Produktion sind nur HTTPS-Domains für die Einbettung erlaubt.' });
    }

    const assistantName = String(req.body?.assistantName || 'Digitaler Branchenassistent').trim().slice(0, 120);
    const welcomeMessage = String(req.body?.welcomeMessage || 'Hallo! Wie kann ich Ihnen weiterhelfen?')
      .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!assistantName || !welcomeMessage) return res.status(400).json({ message: 'Name und Begrüßung dürfen nicht leer sein.' });
    const avatarKey = String(req.body?.avatarKey || previous?.avatar_key || 'female').trim().toLowerCase();
    if (!ALLOWED_AVATAR_KEYS.has(avatarKey)) {
      return res.status(400).json({ message: 'Bitte einen gültigen Assistenten-Avatar auswählen.' });
    }

    const sourceChanged = String(previous?.source_url || '') !== normalizedSource.toString();
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO public_ai_assistant_settings
          (business_partner_id, is_enabled, source_url, allowed_origins, assistant_name, welcome_message,
           avatar_key, max_pages, daily_question_limit, monthly_token_limit, updated_at)
        VALUES ($1, $2, $3, $4::text[], $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (business_partner_id)
        DO UPDATE SET
          is_enabled = EXCLUDED.is_enabled,
          source_url = EXCLUDED.source_url,
          allowed_origins = EXCLUDED.allowed_origins,
          assistant_name = EXCLUDED.assistant_name,
          welcome_message = EXCLUDED.welcome_message,
          avatar_key = EXCLUDED.avatar_key,
          max_pages = EXCLUDED.max_pages,
          daily_question_limit = EXCLUDED.daily_question_limit,
          monthly_token_limit = EXCLUDED.monthly_token_limit,
          last_crawl_status = CASE WHEN public_ai_assistant_settings.source_url IS DISTINCT FROM EXCLUDED.source_url THEN 'not_started' ELSE public_ai_assistant_settings.last_crawl_status END,
          last_crawl_error = CASE WHEN public_ai_assistant_settings.source_url IS DISTINCT FROM EXCLUDED.source_url THEN NULL ELSE public_ai_assistant_settings.last_crawl_error END,
          updated_at = NOW()
      `, [
        partnerId,
        Boolean(req.body?.isEnabled),
        normalizedSource.toString(),
        allowedOrigins,
        assistantName,
        welcomeMessage,
        avatarKey,
        toBoundedInt(req.body?.maxPages, 30, 1, 100),
        toBoundedInt(req.body?.dailyQuestionLimit, 300, 1, 100000),
        toBoundedInt(req.body?.monthlyTokenLimit, 1000000, 1000, 1000000000),
      ]);
      if (sourceChanged) {
        await client.query('UPDATE public_ai_documents SET is_active = false, updated_at = NOW() WHERE business_partner_id = $1', [partnerId]);
        await client.query('DELETE FROM public_ai_response_cache WHERE business_partner_id = $1', [partnerId]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const settings = await getManagedSettings(partnerId);
    return res.json(toRoleScopedSettings(req, settings));
  } catch (error) {
    console.error('[Admin Public AI] Speichern:', error.message);
    return res.status(400).json({ message: error.message || 'Einstellungen konnten nicht gespeichert werden.' });
  }
};

exports.syncSources = async (req, res) => {
  try {
    const partnerId = resolveManagedPartnerId(req);
    if (!partnerId) return res.status(400).json({ message: 'Bitte einen Mandanten auswählen.' });
    const settings = await ensureSettings(partnerId);
    if (!settings) return res.status(404).json({ message: 'Mandant nicht gefunden.' });
    const claimed = await db.query(`
      UPDATE public_ai_assistant_settings
      SET last_crawl_status = 'running', last_crawl_error = NULL, updated_at = NOW()
      WHERE business_partner_id = $1
        AND (last_crawl_status <> 'running' OR updated_at < NOW() - INTERVAL '30 minutes')
      RETURNING business_partner_id
    `, [partnerId]);
    if (!claimed.rowCount) {
      return res.status(409).json({ message: 'Die Homepage-Synchronisierung läuft bereits.' });
    }
    setImmediate(() => {
      crawlBusinessPartnerHomepage(partnerId)
        .catch((error) => console.error(`[Admin Public AI] Hintergrund-Synchronisierung ${partnerId}:`, error.message));
    });
    return res.status(202).json({ message: 'Homepage-Synchronisierung wurde gestartet.' });
  } catch (error) {
    console.error('[Admin Public AI] Synchronisierung:', error.message);
    return res.status(400).json({ message: error.message || 'Homepage konnte nicht synchronisiert werden.' });
  }
};

exports.rotateSiteKey = async (req, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Der Einbettungscode ist ausschließlich für Systemadministratoren verfügbar.' });
    }
    const partnerId = resolveManagedPartnerId(req);
    if (!partnerId) return res.status(400).json({ message: 'Bitte einen Mandanten auswählen.' });
    const result = await db.query(`
      UPDATE public_ai_assistant_settings
      SET site_key = $2, updated_at = NOW()
      WHERE business_partner_id = $1
      RETURNING site_key
    `, [partnerId, crypto.randomUUID()]);
    if (!result.rowCount) return res.status(404).json({ message: 'Assistent nicht gefunden.' });
    const settings = await getManagedSettings(partnerId);
    return res.json(toRoleScopedSettings(req, settings));
  } catch (error) {
    console.error('[Admin Public AI] Site-Key:', error.message);
    return res.status(500).json({ message: 'Einbettungsschlüssel konnte nicht erneuert werden.' });
  }
};

exports.getIndexedPages = async (req, res) => {
  try {
    const partnerId = resolveManagedPartnerId(req);
    if (!partnerId) return res.status(400).json({ message: 'Bitte einen Mandanten auswählen.' });
    const result = await db.query(`
      SELECT canonical_url, MAX(title) AS title, COUNT(*)::int AS chunks, MAX(fetched_at) AS fetched_at
      FROM public_ai_documents
      WHERE business_partner_id = $1 AND is_active = true
      GROUP BY canonical_url
      ORDER BY canonical_url
      LIMIT 100
    `, [partnerId]);
    return res.json(result.rows);
  } catch (error) {
    console.error('[Admin Public AI] Seiten:', error.message);
    return res.status(500).json({ message: 'Indexierte Seiten konnten nicht geladen werden.' });
  }
};
