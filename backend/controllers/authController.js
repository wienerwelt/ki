// backend/controllers/authController.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const zxcvbn = require('zxcvbn');

const db = require('../config/db');
const { logActivity } = require('../services/auditLogService');
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
  // solide, pragmatische E-Mail-Prüfung
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
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
  // generiert 10 einfache Vorschläge
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
  if (!voucher || typeof voucher !== 'string' || voucher.trim() === '') return null;
  
  const cleanVoucher = voucher.trim().toLowerCase();
  
  try {
    // Wir suchen einen Partner, dessen ID (als Text) mit dem Voucher endet
    // RIGHT(id::text, 8) extrahiert die letzten 8 Zeichen
    const r = await db.query(
      'SELECT id FROM business_partners WHERE LOWER(RIGHT(id::text, 8)) = $1 LIMIT 1',
      [cleanVoucher]
    );
    return r.rows[0]?.id || null;
  } catch (err) {
    console.error("Fehler bei der Voucher-Auflösung:", err);
    return null;
  }
}

function issueJwt(user) {
  const secret = process.env.JWT_SECRET || 'dev-secret';
  const payload = {
    sub: user.id,
    username: user.username,
    email: user.email,
    role: user.role || 'user',
    business_partner_id: user.business_partner_id || null,
    contribution_score: user.contribution_score ?? 0,
  };

  return jwt.sign(payload, secret, { expiresIn: '7d' });
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

// === Register ===
// === Register ===
exports.register = async (req, res) => {
  const { email, password, username, firstName, voucher, consentGiven, newsletterOptIn } = req.body || {};

  // 1. Validierungen
  if (!consentGiven) {
    return res.status(400).json({ message: 'Den DSGVO-Bestimmungen muss zugestimmt werden.' });
  }
  if (!email || !password) {
    return res.status(400).json({ message: 'E-Mail und Passwort sind erforderlich.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Bitte geben Sie eine gültige E-Mail-Adresse an.' });
  }

  const chosenUsername = (username && username.trim()) ? username.trim() : email.split('@')[0];
  if (!USERNAME_REGEX.test(chosenUsername)) {
    return res.status(400).json({
      message: 'Ungültiger Benutzername. Erlaubt sind Buchstaben, Zahlen und Unterstriche, 3–30 Zeichen.',
    });
  }

  // Passwort-Policy
  const strength = zxcvbn(password);
  if (strength.score < 3) {
    return res.status(400).json({
      message: 'Das Passwort ist zu schwach. Bitte wählen Sie ein stärkeres Passwort.',
      suggestions: strength.feedback?.suggestions || [],
    });
  }

  try {
    // 2. Duplikate prüfen (Email & Username)
    const emailCheck = await db.query(
      'SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
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

    // 3. Business Partner & Hashes
    const businessPartnerId = await resolveBusinessPartnerId(voucher);

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const emailToken = crypto.randomBytes(32).toString('hex');

    let optInToken = null;
    let optInExpires = null;
    if (newsletterOptIn) {
      optInToken = crypto.randomBytes(32).toString('hex');
      optInExpires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 Tage
    }

    // 4. Benutzer erstellen
    const columns = [
      'username',
      'email',
      'first_name',
      'password_hash',
      'role',
      'business_partner_id',
      'consent_timestamp',
      'email_verification_token',
      'is_email_verified',
      'newsletter_opt_in',
      'newsletter_opt_in_token',
      'newsletter_opt_in_expires',
    ];
    const values = [
      chosenUsername,
      email,
      firstName || null,
      password_hash,
      'user',
      businessPartnerId,
      new Date(),
      emailToken,
      false,
      false,
      optInToken,
      optInExpires,
    ];
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const insertSql =
      `INSERT INTO users (${columns.join(', ')})
       VALUES (${placeholders})
       RETURNING id, email, username`;

    const created = await db.query(insertSql, values);
    const user = created.rows[0];

    // --- 5. NEU: STANDARD-DASHBOARD ERSTELLEN ---
    // Wir legen sofort einen Eintrag an, damit der User nicht mit leerem Screen startet.
    try {
        const defaultConfig = {
            name: 'Mein Dashboard',
            widgets: [
                { id: 'default-bp-info', type: 'BusinessPartnerInfo' },
                { id: 'default-user-profile', type: 'user_activity' } // 'user_activity' ist der DB-Type-Key für das Profil-Widget
            ],
            layouts: {
                lg: [
                    { i: 'default-bp-info', x: 0, y: 0, w: 8, h: 8 },
                    { i: 'default-user-profile', x: 8, y: 0, w: 4, h: 8 }
                ],
                md: [
                    { i: 'default-bp-info', x: 0, y: 0, w: 6, h: 8 },
                    { i: 'default-user-profile', x: 6, y: 0, w: 4, h: 8 }
                ],
                sm: [
                    { i: 'default-bp-info', x: 0, y: 0, w: 6, h: 8 },
                    { i: 'default-user-profile', x: 0, y: 8, w: 6, h: 8 }
                ]
            }
        };

        await db.query(
            `INSERT INTO dashboard_configurations (user_id, name, config, is_default) 
             VALUES ($1, $2, $3, $4)`,
            [user.id, 'Mein Dashboard', JSON.stringify(defaultConfig), true]
        );
        // Keine Fehlermeldung an User senden, falls das schiefgeht (Frontend hat Fallback)
    } catch (dashErr) {
        console.error('Fehler beim Erstellen des Default-Dashboards für User:', user.id, dashErr.message);
    }
    // ---------------------------------------------

    // 6. E-Mails senden
    const verifyUrl = buildVerifyUrl(emailToken);
    try {
      await sendVerificationEmail({
        to: email,
        username: chosenUsername,
        verifyUrl,
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
          to: email,
          username: chosenUsername,
          confirmUrl,
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
    // 1. Benutzer suchen
    const r = await db.query(
      `SELECT
          u.id, u.username, u.email, u.role, u.password_hash,
          u.is_email_verified, u.contribution_score, u.profile_image_url,
          u.business_partner_id,
          bp.name as business_partner_name, bp.dashboard_title
        FROM users u
        LEFT JOIN business_partners bp ON u.business_partner_id = bp.id
        WHERE LOWER(u.email) = LOWER($1) OR LOWER(u.username) = LOWER($1)
        LIMIT 1`,
      [identifier]
    );

    if (r.rows.length === 0) {
      await logActivity({
        actionType: 'LOGIN_FAILURE',
        status: 'failure',
        details: { reason: 'User not found', identifier },
        ipAddress: req.ip
      });
      return res.status(401).json({ message: 'Ungültige Anmeldedaten.' });
    }

    const user = r.rows[0];

    // 2. Passwort prüfen
    const ok = await bcrypt.compare(password, user.password_hash || '');
    if (!ok) {
      await logActivity({
        userId: user.id,
        username: user.username,
        actionType: 'LOGIN_FAILURE',
        status: 'failure',
        details: { reason: 'Invalid password' },
        ipAddress: req.ip
      });
      return res.status(401).json({ message: 'Ungültige Anmeldedaten.' });
    }

// 3. E-Mail Verifizierung prüfen (optional per ENV)
    if (process.env.REQUIRE_EMAIL_VERIFIED === 'true' && !user.is_email_verified) {
      return res.status(403).json({ message: 'Bitte verifizieren Sie Ihre E-Mail-Adresse, bevor Sie sich anmelden.' });
    }

    // --- 4. NEU: Login-Zeitstempel, Zähler UND PUNKTE aktualisieren ---
    
    // a) User-Tabelle updaten (+1 Punkt)
    const pointsForLogin = 1;
    await db.query(
        `UPDATE users 
         SET last_login_at = CURRENT_TIMESTAMP, 
             login_count = login_count + 1,
             contribution_score = contribution_score + $2
         WHERE id = $1`,
        [user.id, pointsForLogin]
    );

    // b) Log-Eintrag für die Punkte erstellen
    // Da reference_id NOT NULL ist, generieren wir eine zufällige ID für dieses "Login-Event"
    const loginEventId = crypto.randomUUID(); 
    
    await db.query(
        `INSERT INTO user_score_logs (id, reference_id, user_id, points_change, action_type, description) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
            crypto.randomUUID(), // ID des Log-Eintrags
            loginEventId,        // reference_id (Dummy-ID für den Login-Vorgang)
            user.id,             // user_id
            pointsForLogin,      // points_change
            'LOGIN_REWARD',      // action_type
            'Täglicher Login-Bonus' // description
        ]
    );
    // ----------------------------------------------------------

    // 5. Token ausstellen
    // WICHTIG: Den Score im User-Objekt für das Token/Response auch aktualisieren!
    user.contribution_score = (user.contribution_score || 0) + pointsForLogin;

    const token = issueJwt(user);

    await logActivity({
        userId: user.id,
        username: user.username,
        actionType: 'LOGIN_SUCCESS',
        status: 'success',
        ipAddress: req.ip
    });

    // 6. Cookie setzen
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 Tage
    });

    // 7. Antwort senden
  return res.status(200).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role || 'user',
        business_partner_id: user.business_partner_id || null,
        business_partner_name: user.business_partner_name || null,
        dashboard_title: user.dashboard_title || null,
        contribution_score: user.contribution_score ?? 0,
        profile_image_url: user.profile_image_url || null,
        last_login_at: new Date() // ✅ NEU: Da wir gerade eingeloggt haben, ist es "Jetzt"
      },
    });

  } catch (err) {
    console.error('Login error:', err);
    await logActivity({
        actionType: 'LOGIN_FAILURE',
        status: 'failure',
        details: { error: err.message },
        ipAddress: req.ip
    });
    return res.status(500).json({ message: 'Serverfehler' });
  }
};

// === Logout ===
exports.logout = async (req, res) => {
  return res.json({ message: 'Abgemeldet.' });
};

// === E-Mail verifizieren ===
exports.verifyEmail = async (req, res) => {
  const { token } = req.params || {};
  if (!token || typeof token !== 'string' || token.length < 8) {
    return safeFrontendRedirect(res, '/login', { verified: 0 });
  }

  try {
    const r = await db.query(
      `SELECT id FROM users WHERE email_verification_token = $1 LIMIT 1`,
      [token]
    );
    if (r.rows.length === 0) {
      return safeFrontendRedirect(res, '/login', { verified: 0 });
    }

    await db.query(
      `UPDATE users
          SET is_email_verified = TRUE,
              email_verification_token = NULL
        WHERE id = $1`,
      [r.rows[0].id]
    );

    return safeFrontendRedirect(res, '/login', { verified: 1 });
  } catch (err) {
    console.error('Verify email error:', err);
    return res.status(500).send('Serverfehler bei der Verifizierung.');
  }
};

// === Resend Verification ===
exports.resendVerification = async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ message: 'E-Mail-Adresse ist erforderlich.' });
  }

  try {
    const r = await db.query(
      'SELECT id, username, is_email_verified FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );
    if (r.rows.length === 0) {
      return res.json({ message: 'Wenn ein Konto mit dieser E-Mail existiert, wurde eine neue Bestätigungsmail gesendet.' });
    }

    const user = r.rows[0];
    if (user.is_email_verified) {
      return res.json({ message: 'Ihre E-Mail-Adresse wurde bereits bestätigt. Sie können sich anmelden.' });
    }

    const newToken = crypto.randomBytes(32).toString('hex');
    await db.query(
      'UPDATE users SET email_verification_token = $1 WHERE id = $2',
      [newToken, user.id]
    );

    const verifyUrl = buildVerifyUrl(newToken);
    await sendVerificationEmail({
      to: email,
      username: user.username,
      verifyUrl,
    });

    return res.json({
      message: 'Wenn ein Konto mit dieser E-Mail existiert, wurde eine neue Bestätigungsmail gesendet.',
    });
  } catch (err) {
    console.error('Resend verification error:', err);
    return res.status(500).json({ message: 'Serverfehler beim erneuten Versand der Bestätigungsmail.' });
  }
};

// === Passwort vergessen ===
exports.forgotPassword = async (req, res) => {
  const { email } = req.body || {};
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ message: 'Bitte eine gültige E-Mail-Adresse angeben.' });
  }

  try {
    const r = await db.query(
      'SELECT id, username FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );
    if (r.rows.length === 0) {
      return res.json({ message: 'Wenn ein Konto existiert, wurde eine E-Mail gesendet.' });
    }

    const user = r.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1h

    await db.query(
      `UPDATE users
          SET password_reset_token = $1,
              password_reset_expires = $2
        WHERE id = $3`,
      [token, expires, user.id]
    );

    const resetUrl = buildResetUrl(token);
    try {
      await sendPasswordResetEmail({
        to: email,
        username: user.username,
        resetUrl,
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

// === Passwort zurücksetzen ===
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
  if (strength.score < 3) {
    return res.status(400).json({
      message: 'Das neue Passwort ist zu schwach. Bitte wählen Sie ein stärkeres Passwort.',
      suggestions: strength.feedback?.suggestions || [],
    });
  }

  try {
    const now = new Date();
    const r = await db.query(
      `SELECT id FROM users
        WHERE password_reset_token = $1 AND (password_reset_expires IS NULL OR password_reset_expires > $2)
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
              password_reset_expires = NULL
        WHERE id = $2`,
      [password_hash, r.rows[0].id]
    );

    return res.json({ message: 'Passwort erfolgreich gesetzt.' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ message: 'Serverfehler beim Setzen des Passworts.' });
  }
};

// === Newsletter: Confirm Double-Opt-In ===
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

// === Newsletter: Start Double-Opt-In (optional API) ===
exports.startNewsletterOptIn = async (req, res) => {
  const { email } = req.body || {};
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ message: 'Bitte eine gültige E-Mail-Adresse angeben.' });
  }

  try {
    const r = await db.query(
      'SELECT id, username, newsletter_opt_in FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );
    if (r.rows.length === 0) {
      return res.json({ message: 'Wenn ein Konto existiert, wurde eine E-Mail gesendet.' });
    }

    const user = r.rows[0];
    if (user.newsletter_opt_in) {
      return res.json({ message: 'Sie sind bereits für den Newsletter angemeldet.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    await db.query(
      `UPDATE users
          SET newsletter_opt_in_token = $1,
              newsletter_opt_in_expires = $2
        WHERE id = $3`,
      [token, expires, user.id]
    );

    const confirmUrl = buildNewsletterConfirmUrl(token);
    try {
      await sendNewsletterOptInEmail({
        to: email,
        username: user.username,
        confirmUrl,
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

// === Google Login (Platzhalter, falls Route aktiv ist) ===
exports.googleLogin = async (req, res) => {
  return res.status(501).json({ message: 'Google Login ist (noch) nicht implementiert.' });
};