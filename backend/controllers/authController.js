// backend/controllers/authController.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const zxcvbn = require('zxcvbn');
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');

const db = require('../config/db');
const { logActivity } = require('../services/auditLogService');
const { setSessionCookies, clearSessionCookies } = require('../services/sessionSecurity');
const { getMembershipExpiry, isMembershipExpired } = require('../utils/membershipExpiry');
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendNewsletterOptInEmail,
  buildVerifyUrl,
  buildResetUrl,
  buildNewsletterConfirmUrl,
  getBaseUrl,
} = require('../services/emailService');

// ============================
// Utilities & Helpers
// ============================

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

async function usernameExists(username) {
  const r = await db.query(
    'SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1',
    [username]
  );
  return r.rows.length > 0;
}

function suggestUsernames(base) {
  const clean = (base || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 25) || 'user';
  const rand = () => Math.floor(100 + Math.random() * 900);
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);

  return [
    `${clean}${yy}`,
    `${clean}_${yy}`,
    `${clean}_${rand()}`,
    `${clean}${rand()}`,
    `${clean}_1`,
    `${clean}_01`,
    `${clean}_dev`,
    `${clean}_ai`,
    `${clean}__${rand()}`,
    `${clean}_${now.getMonth() + 1}`,
  ];
}

async function resolveBusinessPartnerId(voucher) {
  if (!voucher || typeof voucher !== 'string' || voucher.trim() === '') {
    return { partner: null, error: null };
  }

  const cleanVoucher = voucher.trim().toLowerCase();

  try {
    const r = await db.query(
      `SELECT bp.id, bp.name, bp.logo_url, bp.dashboard_title, bp.address, bp.email,
              bp.url_businesspartner, bp.is_active, bp.subscription_end_date,
              cs.primary_color, cs.primary_text_color
       FROM business_partners bp
       LEFT JOIN color_schemes cs ON cs.id = bp.color_scheme_id
       WHERE LOWER(RIGHT(bp.id::text, 8)) = $1
       LIMIT 1`,
      [cleanVoucher]
    );

    if (r.rows.length === 0) {
      return { partner: null, error: 'Der eingegebene Einladungscode ist ungültig.' };
    }

    const partner = r.rows[0];

    if (partner.is_active === false) {
      return { partner: null, error: 'Dieser Einladungscode gehört zu einem deaktivierten Partner-Konto.' };
    }

    if (partner.subscription_end_date) {
      const endDate = new Date(partner.subscription_end_date);
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      if (endDate < now) {
        return { partner: null, error: 'Das Abonnement für diesen Einladungscode ist abgelaufen.' };
      }
    }

    return {
      partner: {
        ...partner,
        color_scheme: {
          primary_color: partner.primary_color,
          primary_text_color: partner.primary_text_color,
        },
      },
      error: null,
    };
  } catch (err) {
    console.error('Fehler bei der Voucher-Auflösung:', err);
    return { partner: null, error: 'Technischer Fehler bei der Überprüfung des Codes.' };
  }
}

function issueJwt(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET ist nicht konfiguriert.');
  const payload = {
    sub: user.id,
    username: user.username,
    email: user.email,
    role: user.role || 'user',
    business_partner_id: user.business_partner_id || null,
    business_partner_category: user.business_partner_category || null,
    contribution_score: user.contribution_score ?? 0,
    has_completed_onboarding: user.has_completed_onboarding,
    av: Number(user.auth_version || 0),
    // Der geladene Benutzerwert entspricht hier dem Login vor der gerade
    // ausgefuehrten Aktualisierung. Im JWT bleibt er waehrend der Sitzung stabil.
    last_login_at: user.last_login_at || null
  };

  return jwt.sign(payload, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    algorithm: 'HS256',
  });
}

const oauthCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/auth',
  maxAge: 10 * 60 * 1000,
});

function createOAuthState(res, partnerCode) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET ist nicht konfiguriert.');
  const nonce = crypto.randomBytes(32).toString('base64url');
  const state = jwt.sign({ nonce, partner: String(partnerCode || '').slice(0, 120) }, secret, {
    expiresIn: '10m',
    algorithm: 'HS256',
  });
  res.cookie('oauth_state', nonce, oauthCookieOptions());
  return state;
}

function consumeOAuthState(req, res) {
  const secret = process.env.JWT_SECRET;
  const state = String(req.query?.state || '');
  const cookieNonce = String(req.cookies?.oauth_state || '');
  const { maxAge: _maxAge, ...clearOptions } = oauthCookieOptions();
  res.clearCookie('oauth_state', clearOptions);
  if (!secret || !state || !cookieNonce) throw new Error('OAuth-Status fehlt.');
  const decoded = jwt.verify(state, secret, { algorithms: ['HS256'] });
  const stateNonce = String(decoded?.nonce || '');
  const left = Buffer.from(stateNonce, 'utf8');
  const right = Buffer.from(cookieNonce, 'utf8');
  if (!left.length || left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new Error('OAuth-Status ist ungültig.');
  }
  return String(decoded?.partner || '');
}

function getAuthCallbackOrigin(req) {
  const configured = String(process.env.AUTH_CALLBACK_BASE_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
  if (configured) return configured;
  return `${req.protocol}://${req.get('host')}`;
}

function safeFrontendRedirect(res, path, qs = {}) {
  const base = (getBaseUrl() || 'http://localhost:5173').replace(/\/$/, '');
  const url = new URL(`${base}${path}`);
  Object.entries(qs).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  return res.redirect(url.toString());
}

// ============================
// Auth Controller
// ============================

exports.register = async (req, res) => {
  const {
    email,
    password,
    username,
    firstName,
    voucher,
    consentGiven,
    newsletterOptIn,
    legalMeta,
  } = req.body || {};

  const normalizedEmail = normalizeEmail(email);

  if (!consentGiven) {
    return res.status(400).json({
      message: 'Bitte akzeptieren Sie die Nutzungsbedingungen und bestätigen Sie Datenschutz sowie Disclaimer.',
    });
  }

  if (!normalizedEmail || !password) {
    return res.status(400).json({ message: 'E-Mail und Passwort sind erforderlich.' });
  }

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ message: 'Bitte geben Sie eine gültige E-Mail-Adresse an.' });
  }

  const chosenUsername =
    username && username.trim() ? username.trim() : normalizedEmail.split('@')[0];

  if (!USERNAME_REGEX.test(chosenUsername)) {
    return res.status(400).json({
      message: 'Ungültiger Benutzername. Erlaubt sind Buchstaben, Zahlen und Unterstriche, 3–30 Zeichen.',
    });
  }

  const strength = zxcvbn(password);
  if (strength.score < 2) {
    return res.status(400).json({
      message: 'Das Passwort ist zu schwach. Bitte wählen Sie ein stärkeres Passwort.',
      suggestions: strength.feedback?.suggestions || [],
    });
  }

  try {
    const emailCheck = await db.query(
      'SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [normalizedEmail]
    );

    if (emailCheck.rows.length > 0) {
      return res.status(409).json({ message: 'Diese E-Mail-Adresse wird bereits verwendet.' });
    }

    if (await usernameExists(chosenUsername)) {
      const initial = suggestUsernames(chosenUsername);
      const available = [];

      for (const candidate of initial) {
        if (await usernameExists(candidate)) continue;
        available.push(candidate);
        if (available.length >= 5) break;
      }

      while (available.length < 3) {
        const candidate = `${chosenUsername}${Math.floor(100 + Math.random() * 900)}`;
        if (!(await usernameExists(candidate))) available.push(candidate);
      }

      return res.status(409).json({
        message: 'Dieser Benutzername ist bereits vergeben. Bitte wählen Sie eine Alternative.',
        suggestions: available,
      });
    }

    const { partner, error: voucherError } = await resolveBusinessPartnerId(voucher);
    if (voucherError) {
      return res.status(400).json({ message: voucherError });
    }

    const businessPartnerId = partner ? partner.id : null;

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const emailToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpires = new Date(Date.now() + 72 * 60 * 60 * 1000);

    let optInToken = null;
    let optInExpires = null;
    if (newsletterOptIn) {
      optInToken = crypto.randomBytes(32).toString('hex');
      optInExpires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    }

    const columns = [
      'username',
      'email',
      'first_name',
      'password_hash',
      'role',
      'business_partner_id',
      'consent_timestamp',
      'email_verification_token',
      'email_verification_expires',
      'is_email_verified',
      'newsletter_opt_in',
      'newsletter_opt_in_token',
      'newsletter_opt_in_expires',
    ];

    const values = [
      chosenUsername,
      normalizedEmail,
      firstName || null,
      password_hash,
      'user',
      businessPartnerId,
      new Date(),
      emailToken,
      emailVerificationExpires,
      false,
      false,
      optInToken,
      optInExpires,
    ];

    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const insertSql = `
      INSERT INTO users (${columns.join(', ')})
      VALUES (${placeholders})
      RETURNING id, email, username
    `;

    const created = await db.query(insertSql, values);
    const user = created.rows[0];

    await logActivity({
      userId: user.id,
      username: user.username,
      actionType: 'REGISTER_LEGAL_ACCEPTED',
      status: 'success',
      ipAddress: req.ip,
      details: {
        consent_timestamp: new Date().toISOString(),
        legal_meta: legalMeta || null,
        business_partner_id: businessPartnerId || null,
      },
    });

    try {
      const defaultConfig = {
        name: 'Mein Dashboard',
        widgets: [
          { id: 'default-bp-info', type: 'BusinessPartnerInfo' },
          { id: 'default-user-profile', type: 'user_activity' },
        ],
        layouts: {
          lg: [
            { i: 'default-bp-info', x: 0, y: 0, w: 8, h: 8 },
            { i: 'default-user-profile', x: 8, y: 0, w: 4, h: 8 },
          ],
          md: [
            { i: 'default-bp-info', x: 0, y: 0, w: 6, h: 8 },
            { i: 'default-user-profile', x: 6, y: 0, w: 4, h: 8 },
          ],
          sm: [
            { i: 'default-bp-info', x: 0, y: 0, w: 6, h: 8 },
            { i: 'default-user-profile', x: 0, y: 8, w: 6, h: 8 },
          ],
        },
      };

      await db.query(
        `INSERT INTO dashboard_configurations (user_id, name, config, is_default)
         VALUES ($1, $2, $3, $4)`,
        [user.id, 'Mein Dashboard', JSON.stringify(defaultConfig), true]
      );
    } catch (dashErr) {
      console.error('Fehler beim Erstellen des Default-Dashboards für User:', user.id, dashErr.message);
    }

    const verifyUrl = buildVerifyUrl(emailToken);
    try {
      await sendVerificationEmail({
        to: normalizedEmail,
        username: user.username,
        verifyUrl,
        partner: partner || null,
      });
    } catch (mailErr) {
      console.error('E-Mail-Versand (Verify) fehlgeschlagen:', mailErr);
      return res.status(201).json({
        message:
          'Registrierung erfolgreich. Der Versand der Bestätigungs-E-Mail ist fehlgeschlagen – bitte später erneut versuchen oder Support kontaktieren.',
      });
    }

    if (newsletterOptIn && optInToken) {
      try {
        const confirmUrl = buildNewsletterConfirmUrl(optInToken);
        await sendNewsletterOptInEmail({
          to: normalizedEmail,
          username: chosenUsername,
          confirmUrl,
          partner: partner || null,
        });
      } catch (e) {
        console.error('Newsletter-Opt-In-Email fehlgeschlagen:', e);
      }
    }

    return res.status(201).json({
      message: 'Registrierung erfolgreich! Bitte prüfen Sie Ihr E-Mail-Postfach, um Ihre Adresse zu bestätigen.',
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ message: 'Serverfehler' });
  }
};

// === Login ===
exports.login = async (req, res) => {
  const { identifier, password } = req.body || {};
  if (!identifier || !password) {
    return res.status(400).json({ message: 'Bitte Benutzername/E-Mail und Passwort angeben.' });
  }

  try {
    const normalizedIdentifier = String(identifier).trim().toLowerCase();

    // 1. NEU: u.is_active und u.active_until in den SELECT aufnehmen
    const r = await db.query(
      `SELECT
          u.id, u.username, u.email, u.role, u.password_hash,
          u.is_email_verified, u.contribution_score, u.profile_image_url,
          u.first_name, u.last_name, u.organization_name, u.linkedin_url, u.phone, u.membership_level,
          u.newsletter_opt_in, u.briefing_email_enabled, u.member_newsletter_enabled,
          u.public_profile_enabled, u.show_email_publicly, u.show_phone_publicly,
          u.show_organization_publicly, u.show_linkedin_publicly,
          u.business_partner_id, u.has_completed_onboarding, u.preferred_workspace,
          u.is_active, u.active_until, u.auth_version,
          bp.name as business_partner_name,
          bp.dashboard_title,
          bp.enabled_modules AS tenant_modules,
          bp.default_workspace AS tenant_default_workspace,
          bp.sales_plan AS tenant_sales_plan,
          bp.sales_subscription_status AS tenant_sales_subscription_status,
          bp.sales_trial_ends_on AS tenant_sales_trial_ends_on,
          CASE WHEN bp.sales_subscription_status = 'trial'
              THEN GREATEST(bp.sales_trial_ends_on - CURRENT_DATE, 0)
              ELSE NULL END AS tenant_sales_trial_days_remaining,
          CASE WHEN bp.sales_subscription_status = 'active'
              OR (bp.sales_subscription_status = 'trial' AND bp.sales_trial_ends_on >= CURRENT_DATE)
              THEN TRUE ELSE FALSE END AS tenant_sales_access_active,
          bp.is_active as business_partner_is_active,
          bp.subscription_end_date as business_partner_subscription_end_date,
          (
             SELECT c.name 
             FROM business_partner_categories bpc
             JOIN categories c ON bpc.category_id = c.id
             WHERE bpc.business_partner_id = u.business_partner_id
             ORDER BY c.name ASC LIMIT 1
          ) as business_partner_category
        FROM users u
        LEFT JOIN business_partners bp ON u.business_partner_id = bp.id
        WHERE LOWER(u.email) = LOWER($1) OR LOWER(u.username) = LOWER($1)
        LIMIT 1`,
      [normalizedIdentifier]
    );

    if (r.rows.length === 0) {
      await logActivity({
        actionType: 'LOGIN_FAILURE',
        status: 'failure',
        details: { reason: 'User not found', identifier: normalizedIdentifier },
        ipAddress: req.ip,
      });
      return res.status(401).json({ message: 'Ungültige Anmeldedaten.' });
    }

    const user = r.rows[0];

    const ok = await bcrypt.compare(password, user.password_hash || '');
    if (!ok) {
      await logActivity({
        userId: user.id,
        username: user.username,
        actionType: 'LOGIN_FAILURE',
        status: 'failure',
        details: { reason: 'Invalid password' },
        ipAddress: req.ip,
      });
      return res.status(401).json({ message: 'Ungültige Anmeldedaten.' });
    }

    if (user.is_active === false) {
      return res.status(403).json({ message: 'Account gesperrt.' });
    }

    if (isMembershipExpired(user.active_until)) {
      return res.status(403).json({ message: 'Account abgelaufen.' });
    }

    if (user.business_partner_id) {
      if (user.business_partner_is_active === false) {
        return res.status(403).json({
          message: 'Ihr Mandantenkonto ist derzeit deaktiviert. Bitte wenden Sie sich an den Administrator.',
        });
      }

      if (user.business_partner_subscription_end_date) {
        const endDate = new Date(user.business_partner_subscription_end_date);
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        if (endDate < now) {
          return res.status(403).json({
            message: 'Das Mandantenabonnement ist abgelaufen. Bitte wenden Sie sich an den Administrator.',
          });
        }
      }
    }

    if (process.env.REQUIRE_EMAIL_VERIFIED === 'true' && !user.is_email_verified) {
      return res.status(403).json({
        message: 'Bitte verifizieren Sie Ihre E-Mail-Adresse, bevor Sie sich anmelden.',
      });
    }

    const pointsForLogin = 1;
    await db.query(
      `UPDATE users
       SET last_login_at = CURRENT_TIMESTAMP,
           login_count = login_count + 1,
           contribution_score = contribution_score + $2
       WHERE id = $1`,
      [user.id, pointsForLogin]
    );

    const loginEventId = crypto.randomUUID();
    await db.query(
      `INSERT INTO user_score_logs (id, reference_id, user_id, points_change, action_type, description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        crypto.randomUUID(),
        loginEventId,
        user.id,
        pointsForLogin,
        'LOGIN_REWARD',
        'Täglicher Login-Bonus',
      ]
    );

    user.contribution_score = (user.contribution_score || 0) + pointsForLogin;

    const token = issueJwt(user);

    await logActivity({
      userId: user.id,
      username: user.username,
      actionType: 'LOGIN_SUCCESS',
      status: 'success',
      ipAddress: req.ip,
    });

    const session = setSessionCookies(res, token);

    const membershipExpiry = getMembershipExpiry(user.active_until);
    return res.status(200).json({
      session_expires_at: session.expiresAt,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role || 'user',
        business_partner_id: user.business_partner_id || null,
        business_partner_name: user.business_partner_name || null,
        business_partner_category: user.business_partner_category || null, // NEU HINZUGEFÜGT
        dashboard_title: user.dashboard_title || null,
        contribution_score: user.contribution_score ?? 0,
        first_name: user.first_name || null,
        last_name: user.last_name || null,
        organization_name: user.organization_name || null,
        linkedin_url: user.linkedin_url || null,
        phone: user.phone || null,
        membership_level: user.membership_level || null,
        preferred_workspace: user.preferred_workspace || null,
        tenant_modules: user.tenant_modules || ['content'],
        tenant_default_workspace: user.tenant_default_workspace || 'content',
        tenant_sales_plan: user.tenant_sales_plan || 'basic',
        tenant_sales_subscription_status: user.tenant_sales_subscription_status || 'active',
        tenant_sales_trial_ends_on: user.tenant_sales_trial_ends_on || null,
        tenant_sales_trial_days_remaining: user.tenant_sales_trial_days_remaining === null ? null : Number(user.tenant_sales_trial_days_remaining),
        tenant_sales_access_active: user.tenant_sales_access_active !== false,
        newsletter_opt_in: user.newsletter_opt_in === true,
        briefing_email_enabled: user.briefing_email_enabled === true,
        member_newsletter_enabled: user.member_newsletter_enabled === true,
        public_profile_enabled: user.public_profile_enabled === true,
        show_email_publicly: user.show_email_publicly === true,
        show_phone_publicly: user.show_phone_publicly === true,
        show_organization_publicly: user.show_organization_publicly === true,
        show_linkedin_publicly: user.show_linkedin_publicly === true,
        profile_image_url: user.profile_image_url || null,
        active_until: user.active_until || null,
        membership_expires_on: membershipExpiry.expiresOn,
        membership_days_remaining: membershipExpiry.daysRemaining,
        last_login_at: new Date(),
        has_completed_onboarding: user.has_completed_onboarding
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    await logActivity({
      actionType: 'LOGIN_FAILURE',
      status: 'failure',
      details: { error: err.message },
      ipAddress: req.ip,
    });
    return res.status(500).json({ message: 'Serverfehler' });
  }
};

exports.logout = async (req, res) => {
  clearSessionCookies(res);
  return res.json({ message: 'Abgemeldet.' });
};

exports.verifyEmail = async (req, res) => {
  const { token } = req.params || {};
  if (!token || typeof token !== 'string' || token.length < 8) {
    return safeFrontendRedirect(res, '/login', { verified: 0 });
  }

  try {
    const r = await db.query(
      `SELECT id, business_partner_id
       FROM users
       WHERE email_verification_token = $1
         AND (email_verification_expires IS NULL OR email_verification_expires > NOW())
       LIMIT 1`,
      [token]
    );

    if (r.rows.length === 0) {
      return safeFrontendRedirect(res, '/login', { verified: 0 });
    }

    const user = r.rows[0];

    await db.query(
      `UPDATE users
          SET is_email_verified = TRUE,
              email_verification_token = NULL,
              email_verification_expires = NULL
        WHERE id = $1`,
      [user.id]
    );

    const redirectParams = { verified: 1 };

    if (user.business_partner_id) {
      const bpRes = await db.query(
        'SELECT RIGHT(id::text, 8) as code FROM business_partners WHERE id = $1',
        [user.business_partner_id]
      );
      if (bpRes.rows.length > 0) {
        redirectParams.partner = bpRes.rows[0].code;
      }
    }

    return safeFrontendRedirect(res, '/login', redirectParams);
  } catch (err) {
    console.error('Verify email error:', err);
    return res.status(500).send('Serverfehler bei der Verifizierung.');
  }
};

exports.resendVerification = async (req, res) => {
  const normalizedEmail = normalizeEmail(req.body?.email);
  if (!normalizedEmail) {
    return res.status(400).json({ message: 'E-Mail-Adresse ist erforderlich.' });
  }

  try {
    const r = await db.query(
      'SELECT id, username, is_email_verified FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [normalizedEmail]
    );

    if (r.rows.length === 0) {
      return res.json({
        message: 'Wenn ein Konto mit dieser E-Mail existiert, wurde eine neue Bestätigungsmail gesendet.',
      });
    }

    const user = r.rows[0];
    if (user.is_email_verified) {
      return res.json({
        message: 'Ihre E-Mail-Adresse wurde bereits bestätigt. Sie können sich anmelden.',
      });
    }

    const newToken = crypto.randomBytes(32).toString('hex');
    const newExpires = new Date(Date.now() + 72 * 60 * 60 * 1000);

    await db.query(
      'UPDATE users SET email_verification_token = $1, email_verification_expires = $2 WHERE id = $3',
      [newToken, newExpires, user.id]
    );

    const verifyUrl = buildVerifyUrl(newToken);

    await sendVerificationEmail({
      to: normalizedEmail,
      username: user.username,
      verifyUrl,
      partner: null,
    });

    return res.json({
      message: 'Wenn ein Konto mit dieser E-Mail existiert, wurde eine neue Bestätigungsmail gesendet.',
    });
  } catch (err) {
    console.error('Resend verification error:', err);
    return res.status(500).json({ message: 'Serverfehler beim erneuten Versand der Bestätigungsmail.' });
  }
};

exports.forgotPassword = async (req, res) => {
  const normalizedEmail = normalizeEmail(req.body?.email);

  if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
    return res.status(400).json({ message: 'Bitte eine gültige E-Mail-Adresse angeben.' });
  }

  try {
    // KORREKTUR: Wir holen jetzt zusätzlich die Business-Partner-Daten und Farben mit einem JOIN!
    const r = await db.query(
      `SELECT 
          u.id, u.username, u.business_partner_id,
          bp.name as partner_name, bp.logo_url, bp.dashboard_title, bp.email as partner_email, bp.url_businesspartner,
          cs.primary_color, cs.primary_text_color
       FROM users u
       LEFT JOIN business_partners bp ON u.business_partner_id = bp.id
       LEFT JOIN color_schemes cs ON bp.color_scheme_id = cs.id
       WHERE LOWER(u.email) = LOWER($1) LIMIT 1`,
      [normalizedEmail]
    );

    if (r.rows.length === 0) {
      return res.json({ message: 'Wenn ein Konto existiert, wurde eine E-Mail gesendet.' });
    }

    const user = r.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await db.query(
      `UPDATE users
          SET password_reset_token = $1,
              password_reset_expires = $2
        WHERE id = $3`,
      [token, expires, user.id]
    );

    // KORREKTUR: Wir bauen das Partner-Objekt exakt so zusammen, wie das E-Mail-Template es erwartet
    let partnerObj = null;
    if (user.business_partner_id) {
        partnerObj = {
            id: user.business_partner_id,
            name: user.partner_name,
            logo_url: user.logo_url,
            dashboard_title: user.dashboard_title,
            email: user.partner_email,
            url_businesspartner: user.url_businesspartner,
            color_scheme: {
                primary_color: user.primary_color,
                primary_text_color: user.primary_text_color
            }
        };
    }

    const resetUrl = buildResetUrl(token);
    try {
      await sendPasswordResetEmail({
        to: normalizedEmail,
        username: user.username,
        resetUrl,
        partner: partnerObj // <-- HIER ÜBERGEBEN WIR DAS KORREKTE BRANDING
      });
    } catch (e) {
      console.error('Passwort-Reset-Mail Fehler:', e);
    }

    return res.json({ message: 'Wenn ein Konto existiert, wurde eine E-Mail gesendet.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ message: 'Serverfehler beim Passwort-Reset.' });
  }
};

exports.resetPassword = async (req, res) => {
  const { token } = req.params || {};
  const { password } = req.body || {};

  if (!token || typeof token !== 'string' || token.length < 8) {
    return res.status(400).json({ message: 'Ungültiger oder fehlender Token.' });
  }

  if (!password) {
    return res.status(400).json({ message: 'Neues Passwort ist erforderlich.' });
  }

  const strength = zxcvbn(password);
  if (strength.score < 2) {
    return res.status(400).json({
      message: 'Das neue Passwort ist zu schwach. Bitte wählen Sie ein stärkeres Passwort.',
      suggestions: strength.feedback?.suggestions || [],
    });
  }

  try {
    const now = new Date();
    const r = await db.query(
      `SELECT id
       FROM users
       WHERE password_reset_token = $1
         AND (password_reset_expires IS NULL OR password_reset_expires > $2)
       LIMIT 1`,
      [token, now]
    );

    if (r.rows.length === 0) {
      return res.status(400).json({ message: 'Ungültiger oder abgelaufener Token.' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    await db.query(
      `UPDATE users
          SET password_hash = $1,
              password_reset_token = NULL,
              password_reset_expires = NULL,
              auth_version = auth_version + 1
        WHERE id = $2`,
      [password_hash, r.rows[0].id]
    );

    return res.json({ message: 'Passwort erfolgreich gesetzt.' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ message: 'Serverfehler beim Setzen des Passworts.' });
  }
};

exports.confirmNewsletterOptIn = async (req, res) => {
  const { token } = req.params || {};
  if (!token || typeof token !== 'string' || token.length < 8) {
    return safeFrontendRedirect(res, '/newsletter/confirmed', { ok: 0, reason: 'invalid' });
  }

  try {
    const now = new Date();
    const result = await db.query(
      `SELECT id, newsletter_opt_in_expires
         FROM users
        WHERE newsletter_opt_in_token = $1
        LIMIT 1`,
      [token]
    );

    if (result.rows.length === 0) {
      return safeFrontendRedirect(res, '/newsletter/confirmed', { ok: 0, reason: 'invalid' });
    }

    const user = result.rows[0];
    if (user.newsletter_opt_in_expires && new Date(user.newsletter_opt_in_expires) < now) {
      await db.query(
        `UPDATE users
            SET newsletter_opt_in_token = NULL,
                newsletter_opt_in_expires = NULL
          WHERE id = $1`,
        [user.id]
      );
      return safeFrontendRedirect(res, '/newsletter/confirmed', { ok: 0, reason: 'expired' });
    }

    await db.query(
      `UPDATE users
          SET newsletter_opt_in = TRUE,
              briefing_email_enabled = TRUE,
              member_newsletter_enabled = TRUE,
              newsletter_opt_in_confirmed_at = CURRENT_TIMESTAMP,
              newsletter_consent_version = COALESCE(newsletter_consent_version, '2026-08'),
              newsletter_unsubscribed_at = NULL,
              newsletter_opt_in_token = NULL,
              newsletter_opt_in_expires = NULL
        WHERE id = $1`,
      [user.id]
    );

    return safeFrontendRedirect(res, '/newsletter/confirmed', { ok: 1 });
  } catch (err) {
    console.error('Confirm newsletter opt-in error:', err);
    return res.status(500).send('Serverfehler beim Bestätigen der Newsletter-Anmeldung.');
  }
};

exports.startNewsletterOptIn = async (req, res) => {
  const normalizedEmail = normalizeEmail(req.user?.email);
  const requestedSource = String(req.body?.source || 'profile').trim().toLowerCase();
  const allowedSources = new Set(['profile', 'daily_cockpit', 'onboarding', 'registration']);
  const source = allowedSources.has(requestedSource) ? requestedSource : 'profile';

  if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
    return res.status(400).json({ message: 'Im Benutzerkonto ist keine gültige E-Mail-Adresse hinterlegt.' });
  }
  if (req.body?.email && normalizeEmail(req.body.email) !== normalizedEmail) {
    return res.status(403).json({ message: 'Die Newsletter-Anmeldung ist nur für das eigene Konto möglich.' });
  }

  try {
    const r = await db.query(
      `SELECT u.id, u.username, u.newsletter_opt_in, u.business_partner_id,
              bp.name AS partner_name, bp.logo_url, bp.dashboard_title,
              bp.address AS partner_address, bp.email AS partner_email, bp.url_businesspartner,
              cs.primary_color, cs.primary_text_color
       FROM users u
       LEFT JOIN business_partners bp ON bp.id = u.business_partner_id
       LEFT JOIN color_schemes cs ON cs.id = bp.color_scheme_id
       WHERE u.id = $1
       LIMIT 1`,
      [req.user.id]
    );

    if (r.rows.length === 0) {
      return res.json({ message: 'Wenn ein Konto existiert, wurde eine E-Mail gesendet.' });
    }

    const user = r.rows[0];
    const partner = user.business_partner_id ? {
      id: user.business_partner_id,
      name: user.partner_name,
      logo_url: user.logo_url,
      dashboard_title: user.dashboard_title,
      address: user.partner_address,
      email: user.partner_email,
      url_businesspartner: user.url_businesspartner,
      color_scheme: {
        primary_color: user.primary_color,
        primary_text_color: user.primary_text_color,
      },
    } : null;
    if (user.newsletter_opt_in) {
      await db.query(
        `UPDATE users
         SET briefing_email_enabled = TRUE,
             member_newsletter_enabled = TRUE,
             newsletter_opt_in_source = COALESCE(newsletter_opt_in_source, $1),
             newsletter_opt_in_confirmed_at = COALESCE(newsletter_opt_in_confirmed_at, CURRENT_TIMESTAMP),
             newsletter_consent_version = COALESCE(newsletter_consent_version, '2026-08')
         WHERE id = $2`,
        [source, user.id]
      );
      return res.json({ message: 'Sie sind bereits angemeldet.', alreadyConfirmed: true });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    await db.query(
      `UPDATE users
          SET newsletter_opt_in_token = $1,
              newsletter_opt_in_expires = $2,
              newsletter_opt_in_source = $3,
              newsletter_consent_version = '2026-08'
        WHERE id = $4`,
      [token, expires, source, user.id]
    );

    const confirmUrl = buildNewsletterConfirmUrl(token);
    try {
      await sendNewsletterOptInEmail({
        to: normalizedEmail,
        username: user.username,
        confirmUrl,
        partner,
      });
    } catch (e) {
      console.error('Opt-In E-Mail Fehler:', e);
    }

    return res.json({ message: 'Wenn ein Konto existiert, wurde eine E-Mail gesendet.' });
  } catch (err) {
    console.error('Start newsletter opt-in error:', err);
    return res.status(500).json({ message: 'Serverfehler beim Start des Newsletter-Opt-In.' });
  }
};

async function handleSSOLoginOrRegister(res, profile, partnerCode) {
    try {
        const normalizedEmail = normalizeEmail(profile.email);
        
        // Da du hier "SELECT u.*" nutzt, sind is_active und active_until bereits im Objekt
        const r = await db.query(
            `SELECT u.*, bp.name as business_partner_name, bp.dashboard_title,
             bp.enabled_modules AS tenant_modules, bp.default_workspace AS tenant_default_workspace,
             bp.sales_plan AS tenant_sales_plan,
             bp.sales_subscription_status AS tenant_sales_subscription_status,
             bp.sales_trial_ends_on AS tenant_sales_trial_ends_on,
             CASE WHEN bp.sales_subscription_status = 'trial'
                 THEN GREATEST(bp.sales_trial_ends_on - CURRENT_DATE, 0)
                 ELSE NULL END AS tenant_sales_trial_days_remaining,
             CASE WHEN bp.sales_subscription_status = 'active'
                 OR (bp.sales_subscription_status = 'trial' AND bp.sales_trial_ends_on >= CURRENT_DATE)
                 THEN TRUE ELSE FALSE END AS tenant_sales_access_active,
             bp.is_active as business_partner_is_active,
             (
                 SELECT c.name 
                 FROM business_partner_categories bpc
                 JOIN categories c ON bpc.category_id = c.id
                 WHERE bpc.business_partner_id = u.business_partner_id
                 ORDER BY c.name ASC LIMIT 1
             ) as business_partner_category
             FROM users u 
             LEFT JOIN business_partners bp ON u.business_partner_id = bp.id 
             WHERE LOWER(u.email) = $1 LIMIT 1`,
            [normalizedEmail]
        );

        let user;
        let isNewUser = false;

        if (r.rows.length > 0) {
            // ---> LOGIN
            user = r.rows[0];
            
            // --- NEU: Status- und Ablauf-Prüfung für SSO ---
            if (user.is_active === false) {
                return safeFrontendRedirect(res, '/login', { error: 'account_locked' });
            }

            if (isMembershipExpired(user.active_until)) {
                return safeFrontendRedirect(res, '/login', { error: 'account_expired' });
            }
            // ------------------------------------------------

            if (user.business_partner_id && user.business_partner_is_active === false) {
                return safeFrontendRedirect(res, '/login', { error: 'account_disabled' });
            }

            await db.query(
                `UPDATE users SET last_login_at = CURRENT_TIMESTAMP, login_count = login_count + 1 WHERE id = $1`,
                [user.id]
            );

        } else {
            // ---> REGISTRIERUNG
            isNewUser = true;
            let businessPartnerId = process.env.DEMO_BUSINESS_PARTNER_ID || null;

            if (partnerCode && partnerCode !== 'null' && partnerCode !== '') {
                const { partner } = await resolveBusinessPartnerId(partnerCode);
                if (partner && partner.is_active !== false) {
                    businessPartnerId = partner.id;
                }
            }

            const randomPassword = crypto.randomBytes(32).toString('hex');
            const salt = await bcrypt.genSalt(10);
            const password_hash = await bcrypt.hash(randomPassword, salt);

            let chosenUsername = profile.given_name ? `${profile.given_name.toLowerCase()}${Math.floor(100+Math.random()*900)}` : normalizedEmail.split('@')[0];
            if (await usernameExists(chosenUsername)) {
                chosenUsername = `${chosenUsername}_${Date.now().toString().slice(-4)}`;
            }

            const insertSql = `
                INSERT INTO users (
                    username, email, first_name, last_name, profile_image_url, 
                    password_hash, role, business_partner_id, is_email_verified, consent_timestamp
                ) VALUES ($1, $2, $3, $4, $5, $6, 'user', $7, true, NOW())
                RETURNING *
            `;
            const created = await db.query(insertSql, [
                chosenUsername, normalizedEmail, profile.given_name || null, profile.family_name || null, 
                profile.picture || null, password_hash, businessPartnerId
            ]);
            user = created.rows[0];

            const defaultConfig = { name: 'Mein Dashboard', widgets: [], layouts: { lg: [], md: [], sm: [] } };
            await db.query(
                `INSERT INTO dashboard_configurations (user_id, name, config, is_default) VALUES ($1, $2, $3, true)`,
                [user.id, 'Mein Dashboard', JSON.stringify(defaultConfig)]
            );
        }

        const token = issueJwt(user);

        setSessionCookies(res, token);

        if (isNewUser) {
            return safeFrontendRedirect(res, '/home');
        } else {
            return safeFrontendRedirect(res, '/home');
        }

    } catch (err) {
        console.error('SSO Fehler:', err);
        return safeFrontendRedirect(res, '/login', { error: 'sso_failed' });
    }
}

// 1. Hilfsfunktion: Baut den Client dynamisch für jeden Request
const getDynamicGoogleClient = (req) => {
    const dynamicRedirectUri = `${getAuthCallbackOrigin(req)}/api/auth/google/callback`;
    
    // Wichtig: 'OAuth2Client' muss natürlich oben in deiner Datei require/importiert sein
    return new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        dynamicRedirectUri
    );
};

exports.googleAuth = (req, res) => {
    const partnerCode = req.query.partner || '';
    
    // 2. Dynamischen Client holen
    const googleClient = getDynamicGoogleClient(req);

    const authorizeUrl = googleClient.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
        state: createOAuthState(res, partnerCode)
    });
    res.redirect(authorizeUrl);
};

exports.googleCallback = async (req, res) => {
    const { code } = req.query;
    
    // 3. Auch hier den dynamischen Client nutzen, damit der Token-Exchange die gleiche URL benutzt
    const googleClient = getDynamicGoogleClient(req);

    try {
        const partnerCode = consumeOAuthState(req, res);
        const { tokens } = await googleClient.getToken(code);
        const ticket = await googleClient.verifyIdToken({
            idToken: tokens.id_token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload(); 
        
        await handleSSOLoginOrRegister(res, payload, partnerCode);
    } catch (err) {
        console.error('Google Callback Fehler:', err);
        safeFrontendRedirect(res, '/login', { error: 'google_auth_failed' });
    }
};

// === LINKEDIN ===
exports.linkedinAuth = (req, res) => {
    const partnerCode = req.query.partner || '';
    
    // 1. Dynamische URL aus dem Request zusammenbauen
    const dynamicRedirectUri = `${getAuthCallbackOrigin(req)}/api/auth/linkedin/callback`;
    const redirectUri = encodeURIComponent(dynamicRedirectUri);
    
    const scope = encodeURIComponent('openid profile email');
    const state = encodeURIComponent(createOAuthState(res, partnerCode));
    const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${process.env.LINKEDIN_CLIENT_ID}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}`;
    res.redirect(url);
};

exports.linkedinCallback = async (req, res) => {
    const { code } = req.query;
    
    // 2. Auch hier die dynamische URL für den Token-Austausch generieren
    // (Muss für LinkedIn zwingend mit der URL aus Schritt 1 übereinstimmen)
    const dynamicRedirectUri = `${getAuthCallbackOrigin(req)}/api/auth/linkedin/callback`;

    try {
        const partnerCode = consumeOAuthState(req, res);
        const tokenRes = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
            params: {
                grant_type: 'authorization_code',
                code,
                client_id: process.env.LINKEDIN_CLIENT_ID,
                client_secret: process.env.LINKEDIN_CLIENT_SECRET,
                redirect_uri: dynamicRedirectUri // <--- HIER dynamisch übergeben
            },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        
        const accessToken = tokenRes.data.access_token;

        const profileRes = await axios.get('https://api.linkedin.com/v2/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const profile = {
            email: profileRes.data.email,
            given_name: profileRes.data.given_name,
            family_name: profileRes.data.family_name,
            picture: profileRes.data.picture
        };

        await handleSSOLoginOrRegister(res, profile, partnerCode);
    } catch (err) {
        console.error('LinkedIn Callback Fehler:', err.response?.data || err.message);
        safeFrontendRedirect(res, '/login', { error: 'linkedin_auth_failed' });
    }
};
