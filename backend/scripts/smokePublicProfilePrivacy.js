const db = require('../config/db');
const jwt = require('jsonwebtoken');

const BASE_URL = String(process.env.SMOKE_API_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const PRIVACY_COLUMNS = [
  'public_profile_enabled',
  'show_email_publicly',
  'show_phone_publicly',
  'show_organization_publicly',
  'show_linkedin_publicly',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function requestProfile(userId) {
  const response = await fetch(`${BASE_URL}/api/users/public/${encodeURIComponent(userId)}`);
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function updateProfile(token, body) {
  const response = await fetch(`${BASE_URL}/api/users/me`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const responseBody = await response.json().catch(() => null);
  return { response, body: responseBody };
}

async function run() {
  if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production') {
    throw new Error('Der Profil-Datenschutz-Smoke-Test darf nicht in Produktion laufen.');
  }

  const columnsResult = await db.query(`
    SELECT column_name, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = ANY($1::text[])
  `, [PRIVACY_COLUMNS]);
  const columns = new Map(columnsResult.rows.map((row) => [row.column_name, row.column_default]));
  const missing = PRIVACY_COLUMNS.filter((column) => !columns.has(column));
  assert(missing.length === 0, `Fehlende Datenschutzspalten: ${missing.join(', ')}`);
  for (const column of PRIVACY_COLUMNS) {
    assert(/false/i.test(String(columns.get(column) || '')), `${column} ist nicht datenschutzfreundlich mit FALSE vorbelegt.`);
  }

  const userResult = await db.query(`
    SELECT u.id, u.email, u.phone, u.organization_name, u.linkedin_url,
           u.role, u.business_partner_id, u.auth_version,
           u.public_profile_enabled, u.show_email_publicly, u.show_phone_publicly,
           u.show_organization_publicly, u.show_linkedin_publicly
    FROM users u
    LEFT JOIN business_partners bp ON bp.id = u.business_partner_id
    WHERE u.is_active = TRUE
      AND (u.active_until IS NULL OR (u.active_until AT TIME ZONE 'Europe/Vienna')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Vienna')::date)
      AND COALESCE(bp.is_active, TRUE) = TRUE
      AND (bp.subscription_end_date IS NULL OR bp.subscription_end_date >= CURRENT_DATE)
    ORDER BY u.created_at ASC
    LIMIT 1
  `);
  const original = userResult.rows[0];
  assert(original, 'Für den Profil-Datenschutztest fehlt ein aktiver Benutzer.');
  assert(process.env.JWT_SECRET, 'JWT_SECRET fehlt.');
  const token = jwt.sign({
    sub: original.id,
    role: original.role,
    business_partner_id: original.business_partner_id,
    av: Number(original.auth_version || 0),
  }, process.env.JWT_SECRET, { expiresIn: '5m', algorithm: 'HS256' });

  const testValues = {
    email: `privacy-smoke-${original.id}@example.invalid`,
    phone: '+43 1 555 0100',
    organization_name: 'Privacy Smoke Organisation',
    linkedin_url: 'https://www.linkedin.com/company/privacy-smoke',
  };

  try {
    await db.query(`
      UPDATE users SET
        email = $2, phone = $3, organization_name = $4, linkedin_url = $5,
        public_profile_enabled = FALSE,
        show_email_publicly = TRUE,
        show_phone_publicly = TRUE,
        show_organization_publicly = TRUE,
        show_linkedin_publicly = TRUE
      WHERE id = $1
    `, [original.id, testValues.email, testValues.phone, testValues.organization_name, testValues.linkedin_url]);

    const disabled = await requestProfile(original.id);
    assert(disabled.response.status === 404, `Deaktiviertes öffentliches Profil liefert HTTP ${disabled.response.status} statt 404.`);

    const invalidUpdate = await updateProfile(token, { public_profile_enabled: 'true' });
    assert(invalidUpdate.response.status === 400, `Ungültiger Boolean-Wert liefert HTTP ${invalidUpdate.response.status} statt 400.`);

    const privateUpdate = await updateProfile(token, {
      public_profile_enabled: true,
      show_email_publicly: false,
      show_phone_publicly: false,
      show_organization_publicly: false,
      show_linkedin_publicly: false,
    });
    assert(privateUpdate.response.status === 200, `Gültige Profilfreigabe liefert HTTP ${privateUpdate.response.status}.`);
    assert(privateUpdate.body?.public_profile_enabled === true, 'Gesamtfreigabe wurde nicht gespeichert.');

    const hidden = await requestProfile(original.id);
    assert(hidden.response.status === 200, `Freigegebenes Profil liefert HTTP ${hidden.response.status}.`);
    assert(hidden.body?.email === null, 'Nicht freigegebene E-Mail wird öffentlich ausgeliefert.');
    assert(hidden.body?.phone === null, 'Nicht freigegebene Telefonnummer wird öffentlich ausgeliefert.');
    assert(hidden.body?.organization_name === null, 'Nicht freigegebene Organisation wird öffentlich ausgeliefert.');
    assert(hidden.body?.linkedin_url === null, 'Nicht freigegebenes LinkedIn-Profil wird öffentlich ausgeliefert.');

    const publicUpdate = await updateProfile(token, {
      show_email_publicly: true,
      show_phone_publicly: true,
      show_organization_publicly: true,
      show_linkedin_publicly: true,
    });
    assert(publicUpdate.response.status === 200, `Gültige Feldfreigaben liefern HTTP ${publicUpdate.response.status}.`);

    const visible = await requestProfile(original.id);
    assert(visible.response.status === 200, `Profil mit Feldfreigaben liefert HTTP ${visible.response.status}.`);
    assert(visible.body?.email === testValues.email, 'Freigegebene E-Mail fehlt.');
    assert(visible.body?.phone === testValues.phone, 'Freigegebene Telefonnummer fehlt.');
    assert(visible.body?.organization_name === testValues.organization_name, 'Freigegebene Organisation fehlt.');
    assert(visible.body?.linkedin_url === testValues.linkedin_url, 'Freigegebenes LinkedIn-Profil fehlt.');
    assert(/no-store/i.test(String(visible.response.headers.get('cache-control') || '')), 'Öffentliche Kontaktdaten dürfen nicht geteilt gecacht werden.');
    assert(/noindex/i.test(String(visible.response.headers.get('x-robots-tag') || '')), 'Öffentliches Profil ist nicht gegen Suchmaschinenindexierung markiert.');

    console.log(JSON.stringify({
      ok: true,
      privacyDefaultsChecked: true,
      disabledProfileBlocked: true,
      profileUpdateValidationChecked: true,
      fieldVisibilityChecked: true,
      cacheAndIndexProtectionChecked: true,
    }, null, 2));
  } finally {
    await db.query(`
      UPDATE users SET
        email = $2,
        phone = $3,
        organization_name = $4,
        linkedin_url = $5,
        public_profile_enabled = $6,
        show_email_publicly = $7,
        show_phone_publicly = $8,
        show_organization_publicly = $9,
        show_linkedin_publicly = $10
      WHERE id = $1
    `, [
      original.id,
      original.email,
      original.phone,
      original.organization_name,
      original.linkedin_url,
      original.public_profile_enabled,
      original.show_email_publicly,
      original.show_phone_publicly,
      original.show_organization_publicly,
      original.show_linkedin_publicly,
    ]);
  }
}

run()
  .catch((error) => {
    console.error('[smoke:public-profile-privacy]', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
