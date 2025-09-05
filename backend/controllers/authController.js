// backend/controllers/authController.js 
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');
const { logActivity } = require('../services/auditLogService');
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Helper: Cookie-Optionen zentral
function jwtCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 Tage
    // domain: '.deinedomain.tld', // nur setzen, wenn Frontend/Backend auf Subdomains laufen
  };
}

// === Register ===
exports.register = async (req, res) => {
  const { email, password, name, voucher, consentGiven } = req.body;
  const username = name || email.split('@')[0];

  if (!consentGiven) {
    return res.status(400).json({ message: 'Den DSGVO-Bestimmungen muss zugestimmt werden.' });
  }    
  if (!email || !password) {
    return res.status(400).json({ message: 'E-Mail und Passwort sind erforderlich.' });
  }

  try {
    let businessPartnerId = null;
    if (voucher) {
      const bpResult = await db.query("SELECT id FROM business_partners WHERE id::text LIKE $1", [`${voucher}%`]);
      if (bpResult.rows.length > 0) {
        businessPartnerId = bpResult.rows[0].id;
      }
    }
    if (!businessPartnerId) {
      // KORREKTUR: Wählt den ersten BP aus der Tabelle, sortiert nach Erstellungsdatum.
      const defaultBpResult = await db.query("SELECT id FROM business_partners ORDER BY created_at ASC LIMIT 1");
      if (defaultBpResult.rows.length === 0) {
        return res.status(500).json({ message: 'Kein Business Partner in der Datenbank gefunden, um ihn als Standard zuzuweisen.' });
      }
      businessPartnerId = defaultBpResult.rows[0].id;
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const emailToken = crypto.randomBytes(32).toString('hex');
    
    const newUserQuery = `
      INSERT INTO users (username, email, first_name, password_hash, role, business_partner_id, consent_timestamp, email_verification_token)
      VALUES ($1, $2, $3, $4, 'user', $5, NOW(), $6) RETURNING id, email
    `;
    await db.query(newUserQuery, [username, email, name, password_hash, businessPartnerId, emailToken]);

    // E-Mail-Bestätigungslink senden (auskommentiert)
    // ...

    res.status(201).json({ message: 'Registrierung erfolgreich! Bitte prüfen Sie Ihr E-Mail-Postfach, um Ihre Adresse zu bestätigen.' });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).send('Serverfehler');
  }
};

// === Google Login ===
exports.googleLogin = async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: 'Kein Google-Token erhalten.' });
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) throw new Error('Ungültiges Google-Token: Kein Payload');

    const { email, name } = payload;
    const username = email.split('@')[0];

    const query = 'SELECT * FROM users WHERE email = $1';
    const userResult = await db.query(query, [email]);

    let user;
    if (userResult.rows.length === 0) {
      // KORREKTUR: Wählt den ersten BP aus der Tabelle, sortiert nach Erstellungsdatum.
      const defaultBpResult = await db.query("SELECT id FROM business_partners ORDER BY created_at ASC LIMIT 1");
      if (defaultBpResult.rows.length === 0) {
        return res.status(500).json({ message: 'Kein Business Partner in der Datenbank gefunden, um ihn als Standard zuzuweisen.' });
      }
      const defaultBusinessPartnerId = defaultBpResult.rows[0].id;

      const insertQuery = `
        INSERT INTO users (username, email, first_name, password_hash, role, business_partner_id, is_email_verified, consent_timestamp)
        VALUES ($1, $2, $3, NULL, 'user', $4, TRUE, NOW())
        RETURNING *;
      `;
      const newUser = await db.query(insertQuery, [username, email, name, defaultBusinessPartnerId]);
      user = newUser.rows[0];
    } else {
      user = userResult.rows[0];
    }

    const jwtPayload = {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        business_partner_id: user.business_partner_id,
        has_seen_welcome_widget: user.has_seen_welcome_widget,
        regions: user.regions,
        contribution_score: user.contribution_score,
        membership_level: user.membership_level,
        first_name: user.first_name,
        last_name: user.last_name,
        organization_name: user.organization_name,
        linkedin_url: user.linkedin_url,
        article_score_min: user.article_score_min,
        article_score_max: user.article_score_max,
        preferred_theme: user.preferred_theme,
        preferred_language: user.preferred_language,
      }
    };
    
    const jwtToken = jwt.sign(jwtPayload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    await logActivity({
      userId: user.id,
      username: user.username,
      actionType: 'GOOGLE_LOGIN',
      status: 'success',
      ipAddress: req.ip
    });

    // ✅ Cookie setzen
    res.cookie('token', jwtToken, jwtCookieOptions());

    res.status(200).json({ token: jwtToken, user: jwtPayload.user });
  } catch (error) {
    console.error('Google-Login fehlgeschlagen:', error.message);
    res.status(500).json({ message: 'Google login error', error: error.message });
  }
};

// === E-Mail verifizieren ===
exports.verifyEmail = async (req, res) => {
  const { token } = req.params;
  try {
    const userResult = await db.query('SELECT id FROM users WHERE email_verification_token = $1', [token]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ message: 'Ungültiger oder abgelaufener Bestätigungslink.' });
    }
    const user = userResult.rows[0];
    await db.query(
      'UPDATE users SET is_email_verified = TRUE, email_verification_token = NULL WHERE id = $1',
      [user.id]
    );
    res.json({ message: 'E-Mail erfolgreich bestätigt. Sie können sich nun einloggen.' });
  } catch (err) {
    console.error('Email verification error:', err.message);
    res.status(500).send('Serverfehler');
  }
};

// === Passwort vergessen ===
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const userResult = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      // Aus Sicherheitsgründen dieselbe Nachricht senden, auch wenn der User nicht existiert
      return res.json({ message: 'Wenn ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen gesendet.' });
    }
    const user = userResult.rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 Stunde gültig

    await db.query(
      'UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
      [resetToken, resetExpires, user.id]
    );

    // Link zum Zurücksetzen senden
    // const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    // await sendEmail({ to: email, subject: 'Passwort zurücksetzen', text: `Sie haben eine Anfrage zum Zurücksetzen Ihres Passworts gestellt. Klicken Sie hier: ${resetUrl}` });
    
    res.json({ message: 'Wenn ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen gesendet.' });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).send('Serverfehler');
  }
};

// === Passwort zurücksetzen ===
exports.resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  try {
    const userResult = await db.query(
      'SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()',
      [token]
    );
    if (userResult.rows.length === 0) {
      return res.status(400).json({ message: 'Link zum Zurücksetzen des Passworts ist ungültig oder abgelaufen.' });
    }
    const user = userResult.rows[0];
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    await db.query(
      'UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL WHERE id = $2',
      [password_hash, user.id]
    );
    res.json({ message: 'Passwort erfolgreich zurückgesetzt.' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).send('Serverfehler');
  }
};


// === Login ===
exports.login = async (req, res) => {
  const { identifier, password } = req.body;
  try {
    const userResult = await db.query(
      `SELECT 
          u.*, 
          bp.is_active AS business_partner_is_active, 
          bp.name as business_partner_name, 
          bp.dashboard_title,
          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'id', r.id,
                  'name', r.name,
                  'code', r.code,
                  'is_default', bpr.is_default
                )
                ORDER BY r.name
              ), '[]'::json
            )
            FROM business_partner_regions bpr
            JOIN regions r ON bpr.region_id = r.id
            WHERE bpr.business_partner_id = u.business_partner_id
          ) as regions
        FROM users u 
        LEFT JOIN business_partners bp ON u.business_partner_id = bp.id 
        WHERE u.email = $1 OR u.username = $1`,
      [identifier]
    );

    if (userResult.rows.length === 0) return res.status(400).json({ message: 'Ungültige Anmeldedaten.' });
    const user = userResult.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ message: 'Ihr Benutzerkonto ist deaktiviert.' });
    }
    if (user.business_partner_id && user.business_partner_is_active === false) {
      return res.status(403).json({ message: 'Der zugehörige Business Partner ist deaktiviert.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Ungültige Anmeldedaten.' });
    }

    // Debug-Ausgabe (kann später entfernt werden)
    console.log("========================================");
    console.log("LOGIN ERFOLGREICH - GEFUNDENER BENUTZER:");
    console.log(user);
    console.log("========================================");

    await db.query(
      'UPDATE users SET login_count = login_count + 1, last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );
    
    const payload = {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        business_partner_id: user.business_partner_id,
        business_partner_name: user.business_partner_name,
        dashboard_title: user.dashboard_title,
        regions: user.regions,
        contribution_score: user.contribution_score,
        membership_level: user.membership_level,
        has_seen_welcome_widget: user.has_seen_welcome_widget,
        first_name: user.first_name,
        last_name: user.last_name,
        organization_name: user.organization_name,
        linkedin_url: user.linkedin_url,
        article_score_min: user.article_score_min,
        article_score_max: user.article_score_max,
        preferred_theme: user.preferred_theme,
        preferred_language: user.preferred_language,
      }
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    // ✅ Cookie setzen
    res.cookie('token', token, jwtCookieOptions());

    // Optional zusätzlich im Body zurückgeben
    return res.json({ token, user: payload.user });

  } catch (err) {
    console.error('Login error:', err);

    return res.status(500).json({
      message: err.message || 'Ein unbekannter Fehler ist aufgetreten.',
      stack: err.stack || 'Kein Stack Trace verfügbar.'
    });
  }
};

// === Logout ===
exports.logout = async (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    // domain: '.deinedomain.tld', // falls gesetzt, hier auch setzen
  });
  res.json({ message: 'logged out' });
};
