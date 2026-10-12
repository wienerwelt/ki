const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { sendEmail, getBaseUrl } = require('../services/emailService');
const { renderLayout } = require('../services/emailTemplates');

const SCENARIOS = {
  content: { name: 'Content', modules: ['content'], workspace: 'content' },
  sales: { name: 'Sales', modules: ['sales'], workspace: 'sales' },
  both: { name: 'Content & Sales', modules: ['content', 'sales'], workspace: 'sales' },
};
const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');
const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

async function createDemoTenant(client, scenario) {
  const product = SCENARIOS[scenario];
  const id = crypto.randomUUID();
  await client.query(
    `INSERT INTO business_partners
       (id, name, slug, dashboard_title, is_active, enabled_modules, default_workspace,
        sales_plan, sales_subscription_status, allow_automated_newsletter, monthly_report_enabled,
        briefing_frequency, storage_tier, storage_limit_bytes, is_demo_tenant, demo_scenario)
     VALUES ($1, $2, $3, $4, TRUE, $5, $6, 'premium', 'active', FALSE, FALSE,
             'never', 'premium', 1048576000, TRUE, $7)`,
    [id, `Mobiliti Demo – ${product.name} · ${id.slice(0, 8)}`, `demo-${scenario}-${id.slice(0, 8)}`, `Mobiliti Demo – ${product.name}`,
      product.modules, product.workspace, scenario]
  );

  if (product.modules.includes('content')) {
    await client.query(
      `INSERT INTO business_partner_widget_access (business_partner_id, widget_type_id)
       SELECT $1, id FROM widget_types
       WHERE type_key IN ('BusinessPartnerInfo', 'user_activity')
          OR (component_key = 'GenericScrape'
              AND (allowed_roles IS NULL OR cardinality(allowed_roles) = 0 OR 'demo' = ANY(allowed_roles)))
       ON CONFLICT DO NOTHING`,
      [id]
    );
  }
  if (product.modules.includes('sales')) {
    const examples = [
      ['Demo · Logistik Nord', 'Beispielsignal: Flotte elektrifizieren', 'Fiktive Testflotte für elektrische Transporter wird geprüft.'],
      ['Demo · Mobilität Alpen', 'Beispielsignal: Neue Standorte geplant', 'Fiktive Servicestandorte befinden sich in Planung.'],
      ['Demo · Fuhrpark Stadt', 'Beispielsignal: Fuhrpark wächst', 'Der fiktive regionale Fuhrpark soll im nächsten Quartal wachsen.'],
    ];
    for (let index = 0; index < examples.length; index += 1) {
      const accountId = crypto.randomUUID();
      await client.query(
        `INSERT INTO business_partner_accounts (id, business_partner_id, name, status, notes)
         VALUES ($1, $2, $3, 'prospect', 'Fiktiver Demo-Account – keine Kundendaten')`,
        [accountId, id, examples[index][0]]
      );
      await client.query(
        `INSERT INTO business_partner_tracked_articles
           (id, account_id, article_title, article_url, source_name, published_at, summary)
         VALUES ($1, $2, $3, $4, 'demo.invalid', NOW() - ($5 * INTERVAL '1 day'), $6)`,
        [crypto.randomUUID(), accountId, examples[index][1],
          `https://demo.invalid/signale/${id}/${index + 1}`, index + 1, examples[index][2]]
      );
    }
  }
  return id;
}

async function demoDashboardConfig(client) {
  const result = await client.query(
    `SELECT type_key FROM widget_types
     WHERE component_key = 'GenericScrape'
       AND (allowed_roles IS NULL OR cardinality(allowed_roles) = 0 OR 'demo' = ANY(allowed_roles))
     ORDER BY name LIMIT 2`
  );
  const types = ['BusinessPartnerInfo', 'user_activity', ...result.rows.map((row) => row.type_key)];
  const largeLayout = types.map((_type, index) => ({
    i: `demo-widget-${index}`, x: (index % 2) * 6, y: Math.floor(index / 2) * 7,
    w: 6, h: 7, minW: 3, minH: 4,
  }));
  return {
    widgets: types.map((type, index) => ({ id: `demo-widget-${index}`, type })),
    layouts: {
      lg: largeLayout,
      md: largeLayout.map((item) => ({ ...item, x: item.x ? 5 : 0, w: 5 })),
      sm: largeLayout.map((item, index) => ({ ...item, x: 0, y: index * 7, w: 6 })),
      xs: largeLayout.map((item, index) => ({ ...item, x: 0, y: index * 7, w: 1, minW: 1 })),
    },
  };
}

async function deliverInvitation(id, email, firstName, scenario, token, expiresAt) {
  const url = `${getBaseUrl()}/demo/accept#token=${encodeURIComponent(token)}`;
  const scenarioGuidance = scenario === 'sales'
    ? 'Achten Sie besonders auf Arbeitsliste, Trigger-Treffer, Accounts, Sales-Pipeline und Kalender.'
    : scenario === 'content'
      ? 'Achten Sie besonders auf Dashboard, Brancheninformationen, Quellen und Community-Inhalte.'
      : 'Achten Sie besonders auf das Content-Dashboard sowie Arbeitsliste, Trigger-Treffer, Accounts, Sales-Pipeline und Kalender.';
  const expiresAtLabel = new Date(expiresAt).toLocaleString('de-AT', { timeZone: 'Europe/Vienna' });
  const html = renderLayout({
    title: 'Ihr persönlicher Demo-Zugang',
    preheader: 'Mobiliti AI unverbindlich kennenlernen',
    contentHtml: `<p>Hallo ${escapeHtml(firstName)},</p>
      <p>Sie wurden zur Mobiliti-AI-Demo für <strong>${escapeHtml(SCENARIOS[scenario].name)}</strong> eingeladen.</p>
      <ul>
        <li><strong>Aktivierung:</strong> Öffnen Sie den persönlichen Link und vergeben Sie ein Passwort mit mindestens 12 Zeichen.</li>
        <li><strong>Anmeldung:</strong> Danach melden Sie sich mit dieser E-Mail-Adresse im Mobiliti Dashboard an.</li>
        <li><strong>Laufzeit:</strong> Ihr Zugang endet am ${escapeHtml(expiresAtLabel)}.</li>
        <li><strong>Daten:</strong> Sales-Beispiele sind fiktiv; Content zeigt öffentliche Brancheninformationen. Kundendaten anderer Mandanten sind nicht enthalten.</li>
        <li><strong>Demo-Schutz:</strong> Änderungen, KI-Anfragen, Exporte und Versand sind deaktiviert.</li>
      </ul>
      <p><strong>Empfohlener Rundgang:</strong> ${escapeHtml(scenarioGuidance)}</p>
      <p>Der Aktivierungslink ist persönlich und nur einmal verwendbar. Bitte leiten Sie ihn nicht weiter.</p>`,
    ctaLabel: 'Demo-Zugang aktivieren',
    ctaUrl: url,
    footerText: 'Falls Sie diese Einladung nicht erwartet haben, ignorieren Sie diese E-Mail.',
  });
  try {
    await sendEmail({ to: email, subject: 'Ihr persönlicher Mobiliti-AI-Demo-Zugang', html });
    await db.query("UPDATE demo_invitations SET delivery_status = 'sent' WHERE id = $1", [id]);
  } catch (error) {
    await db.query("UPDATE demo_invitations SET delivery_status = 'failed' WHERE id = $1", [id]);
    throw error;
  }
}

exports.list = async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT i.id, i.scenario, i.organization_name, i.created_at, i.expires_at,
              i.accepted_at, i.revoked_at, i.delivery_status,
              u.email, u.first_name, u.last_name, u.is_active, u.last_login_at, u.active_until
       FROM demo_invitations i JOIN users u ON u.id = i.user_id
       ORDER BY i.created_at DESC LIMIT 200`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('[demo-invitations] list:', error);
    res.status(500).json({ message: 'Demo-Einladungen konnten nicht geladen werden.' });
  }
};

exports.create = async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const firstName = String(req.body?.first_name || '').trim().slice(0, 100);
  const lastName = String(req.body?.last_name || '').trim().slice(0, 100);
  const organization = String(req.body?.organization_name || '').trim().slice(0, 160);
  const scenario = String(req.body?.scenario || '').toLowerCase();
  const days = Number(req.body?.days);
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !firstName || !organization ||
      !SCENARIOS[scenario] || ![7, 14].includes(days)) {
    return res.status(400).json({ message: 'Name, Organisation, gültige E-Mail, Szenario und 7 oder 14 Tage sind erforderlich.' });
  }
  const client = await db.connect();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + days * 86_400_000);
  let invitationId;
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT u.id, u.role, u.business_partner_id, u.email, bp.name AS business_partner_name,
              bp.is_demo_tenant, bp.demo_scenario,
              (SELECT i.id FROM demo_invitations i WHERE i.user_id = u.id
               ORDER BY i.created_at DESC LIMIT 1) AS demo_invitation_id
       FROM users u LEFT JOIN business_partners bp ON bp.id = u.business_partner_id
       WHERE LOWER(u.email) = $1 OR LOWER(u.username) = $1 FOR UPDATE OF u`, [email]
    );
    let userId;
    if (existing.rows[0]) {
      const previous = existing.rows[0];
      if (previous.role !== 'demo' || previous.is_demo_tenant !== true || previous.demo_scenario !== scenario) {
        await client.query('ROLLBACK');
        const existingDemo = previous.role === 'demo' && previous.is_demo_tenant === true;
        const scenarioName = SCENARIOS[previous.demo_scenario]?.name || previous.demo_scenario || 'unbekannt';
        const managementPath = existingDemo && previous.demo_invitation_id
          ? `/admin/demo-access?focus=${encodeURIComponent(previous.demo_invitation_id)}`
          : `/admin/users?search=${encodeURIComponent(email)}`;
        return res.status(409).json({
          message: existingDemo
            ? `Diese E-Mail gehört bereits zu einem Demo-Zugang „${scenarioName}“. Verwalten oder löschen Sie zuerst den vorhandenen Demo-Zugang.`
            : `Diese E-Mail gehört bereits zu einem Benutzer${previous.business_partner_name ? ` im Mandanten „${previous.business_partner_name}“` : ''} (Rolle: ${previous.role}). Verwalten Sie den vorhandenen Benutzer oder verwenden Sie eine andere E-Mail-Adresse.`,
          management: {
            path: managementPath,
            label: existingDemo ? 'Vorhandenen Demo-Zugang öffnen' : 'Benutzerverwaltung öffnen',
          },
        });
      }
      userId = previous.id;
      await client.query(
        `UPDATE users SET first_name = $2, last_name = $3, organization_name = $4,
          is_active = FALSE, active_until = $5, auth_version = COALESCE(auth_version, 0) + 1,
          newsletter_email_enabled = FALSE, monthly_report_email_enabled = FALSE,
          newsletter_opt_in = FALSE WHERE id = $1`,
        [userId, firstName, lastName, organization, expiresAt]
      );
      await client.query('UPDATE demo_invitations SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    } else {
      userId = crypto.randomUUID();
      const partnerId = await createDemoTenant(client, scenario);
      const unusableHash = await bcrypt.hash(crypto.randomBytes(48).toString('hex'), 10);
      await client.query(
        `INSERT INTO users (id, username, email, password_hash, first_name, last_name,
          organization_name, role, business_partner_id, is_active, is_email_verified,
          active_until, preferred_workspace, has_completed_onboarding, newsletter_email_enabled,
          monthly_report_email_enabled, newsletter_opt_in)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'demo', $8, FALSE, FALSE,
                 $9, $10, TRUE, FALSE, FALSE, FALSE)`,
        [userId, `demo-${userId.slice(0, 12)}`, email, unusableHash,
          firstName, lastName, organization, partnerId, expiresAt, SCENARIOS[scenario].workspace]
      );
      if (SCENARIOS[scenario].modules.includes('content')) {
        await client.query(
          `INSERT INTO dashboard_configurations (user_id, name, config, is_default)
           VALUES ($1, 'Demo-Dashboard', $2, TRUE)`, [userId, await demoDashboardConfig(client)]
        );
      }
    }
    invitationId = crypto.randomUUID();
    await client.query(
      `INSERT INTO demo_invitations
         (id, user_id, created_by, token_hash, scenario, organization_name, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [invitationId, userId, req.user.id, tokenHash(token), scenario, organization, expiresAt]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[demo-invitations] create:', error);
    return res.status(500).json({ message: 'Demo-Einladung konnte nicht angelegt werden.' });
  } finally {
    client.release();
  }
  try {
    await deliverInvitation(invitationId, email, firstName, scenario, token, expiresAt);
    return res.status(201).json({ message: 'Persönliche Einladung wurde versendet.', id: invitationId });
  } catch (error) {
    console.error('[demo-invitations] delivery:', error);
    return res.status(502).json({ message: 'Zugang angelegt, aber die E-Mail konnte nicht versendet werden. Bitte den Versand erneut versuchen.', id: invitationId });
  }
};

exports.resend = async (req, res) => {
  const client = await db.connect();
  const token = crypto.randomBytes(32).toString('hex');
  let invite;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT i.id, i.scenario, i.expires_at, i.accepted_at, i.revoked_at,
              u.email, u.first_name, u.role
       FROM demo_invitations i JOIN users u ON u.id = i.user_id
       WHERE i.id = $1 FOR UPDATE OF i`, [req.params.id]
    );
    invite = result.rows[0];
    if (!invite || invite.role !== 'demo' || invite.accepted_at || invite.revoked_at ||
        new Date(invite.expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Diese Einladung kann nicht mehr erneut versendet werden.' });
    }
    await client.query(
      "UPDATE demo_invitations SET token_hash = $2, delivery_status = 'pending' WHERE id = $1",
      [invite.id, tokenHash(token)]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[demo-invitations] resend:', error);
    return res.status(500).json({ message: 'Erneuter Versand fehlgeschlagen.' });
  } finally {
    client.release();
  }
  try {
    await deliverInvitation(invite.id, invite.email, invite.first_name, invite.scenario, token, invite.expires_at);
    return res.json({ message: 'Einladung erneut versendet.' });
  } catch (error) {
    console.error('[demo-invitations] resend delivery:', error);
    return res.status(502).json({ message: 'E-Mail-Versand fehlgeschlagen. Bitte später erneut versuchen.' });
  }
};

exports.revoke = async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT i.user_id FROM demo_invitations i JOIN users u ON u.id = i.user_id
       JOIN business_partners bp ON bp.id = u.business_partner_id
       WHERE i.id = $1 AND u.role = 'demo' AND bp.is_demo_tenant = TRUE
       FOR UPDATE OF i, u`, [req.params.id]
    );
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Demo-Einladung nicht gefunden.' });
    }
    await client.query('UPDATE demo_invitations SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [result.rows[0].user_id]);
    await client.query('UPDATE users SET is_active = FALSE, auth_version = COALESCE(auth_version, 0) + 1 WHERE id = $1', [result.rows[0].user_id]);
    await client.query('COMMIT');
    return res.json({ message: 'Demo-Zugang widerrufen.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[demo-invitations] revoke:', error);
    return res.status(500).json({ message: 'Widerruf fehlgeschlagen.' });
  } finally {
    client.release();
  }
};

exports.remove = async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT i.user_id, u.business_partner_id
       FROM demo_invitations i JOIN users u ON u.id = i.user_id
       JOIN business_partners bp ON bp.id = u.business_partner_id
       WHERE i.id = $1 AND u.role = 'demo' AND bp.is_demo_tenant = TRUE
       FOR UPDATE OF i, u, bp`, [req.params.id]
    );
    const demo = result.rows[0];
    if (!demo) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Demo-Einladung nicht gefunden.' });
    }

    // Ein Listen-Eintrag repraesentiert einen vollstaendigen, isolierten Demo-Zugang.
    // Deshalb werden Benutzer und Demo-Mandant gemeinsam entfernt, damit kein
    // aktiver oder verwaister Zugang ausserhalb der Admin-Uebersicht bestehen bleibt.
    await client.query('DELETE FROM activity_log WHERE user_id = $1', [demo.user_id]);
    await client.query('DELETE FROM dashboard_configurations WHERE user_id = $1', [demo.user_id]);
    await client.query("DELETE FROM users WHERE id = $1 AND role = 'demo'", [demo.user_id]);
    await client.query(
      'DELETE FROM business_partners WHERE id = $1 AND is_demo_tenant = TRUE',
      [demo.business_partner_id]
    );
    await client.query('COMMIT');
    return res.json({ message: 'Demo-Zugang und zugehöriger Demo-Mandant wurden gelöscht.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[demo-invitations] delete:', error);
    return res.status(500).json({ message: 'Demo-Zugang konnte nicht gelöscht werden.' });
  } finally {
    client.release();
  }
};

async function findValidInvitation(token) {
  if (!/^[a-f0-9]{64}$/i.test(String(token || ''))) return null;
  const result = await db.query(
    `SELECT i.id, i.user_id, i.scenario, i.expires_at, i.accepted_at, i.revoked_at,
            u.first_name, u.email, u.role, bp.is_demo_tenant
     FROM demo_invitations i JOIN users u ON u.id = i.user_id
     JOIN business_partners bp ON bp.id = u.business_partner_id
     WHERE i.token_hash = $1 LIMIT 1`, [tokenHash(token)]
  );
  const row = result.rows[0];
  return row && row.role === 'demo' && row.is_demo_tenant === true && !row.accepted_at &&
    !row.revoked_at && new Date(row.expires_at).getTime() > Date.now() ? row : null;
}

exports.inspect = async (req, res) => {
  try {
    const invitation = await findValidInvitation(req.body?.token);
    if (!invitation) return res.status(410).json({ message: 'Dieser Link ist ungültig oder abgelaufen.' });
    return res.json({ first_name: invitation.first_name, scenario: invitation.scenario, expires_at: invitation.expires_at });
  } catch (error) {
    console.error('[demo-invitations] inspect:', error);
    return res.status(500).json({ message: 'Einladung konnte nicht geprüft werden.' });
  }
};

exports.accept = async (req, res) => {
  const token = String(req.body?.token || '');
  const password = String(req.body?.password || '');
  if (!/^[a-f0-9]{64}$/i.test(token) || password.length < 12 || password.length > 128) {
    return res.status(400).json({ message: 'Ein gültiger Link und ein Passwort mit mindestens 12 Zeichen sind erforderlich.' });
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT i.id, i.user_id, i.expires_at, i.accepted_at, i.revoked_at
       FROM demo_invitations i JOIN users u ON u.id = i.user_id
       JOIN business_partners bp ON bp.id = u.business_partner_id
       WHERE i.token_hash = $1 AND u.role = 'demo' AND bp.is_demo_tenant = TRUE
       FOR UPDATE OF i, u`, [tokenHash(token)]
    );
    const invite = result.rows[0];
    if (!invite || invite.accepted_at || invite.revoked_at || new Date(invite.expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return res.status(410).json({ message: 'Dieser Link ist ungültig oder abgelaufen.' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await client.query(
      `UPDATE users SET password_hash = $2, is_active = TRUE, is_email_verified = TRUE,
              active_until = $3, auth_version = COALESCE(auth_version, 0) + 1 WHERE id = $1`,
      [invite.user_id, passwordHash, invite.expires_at]
    );
    await client.query('UPDATE demo_invitations SET accepted_at = NOW() WHERE id = $1', [invite.id]);
    await client.query('COMMIT');
    return res.json({ message: 'Demo-Zugang aktiviert. Sie können sich jetzt anmelden.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[demo-invitations] accept:', error);
    return res.status(500).json({ message: 'Demo-Zugang konnte nicht aktiviert werden.' });
  } finally {
    client.release();
  }
};
