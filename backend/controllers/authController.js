// backend/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { logActivity } = require('../services/auditLogService');
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


exports.googleLogin = async (req, res) => {
    const { token } = req.body;
    try {
        // 1. Google-Token verifizieren
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const { email, name } = ticket.getPayload();
        const username = email.split('@')[0];

        // 2. Prüfen, ob der Benutzer bereits existiert
        let userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        let user = userResult.rows[0];

        // 3. Wenn der Benutzer nicht existiert, neu anlegen
        if (!user) {
            console.log(`Creating new user for email: ${email}`);
            const defaultBpResult = await db.query("SELECT id FROM business_partners WHERE name = 'Global Logistics GmbH'");
            if (defaultBpResult.rows.length === 0) {
                return res.status(500).json({ message: 'Standard-Business-Partner nicht gefunden.' });
            }
            const defaultBusinessPartnerId = defaultBpResult.rows[0].id;
            
            const newUserResult = await db.query(
                `INSERT INTO users (username, email, name, password_hash, role, business_partner_id) 
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [username, email, name, 'google-authenticated', 'fleet_manager', defaultBusinessPartnerId]
            );
            user = newUserResult.rows[0];
            await logActivity({ userId: user.id, username: user.username, actionType: 'USER_REGISTER_GOOGLE', status: 'success', ipAddress: req.ip });
        }

        // 4. Benutzerdaten für den Token zusammenstellen (ähnlich wie beim normalen Login)
        const userWithDetails = await db.query(
            `SELECT u.*, bp.is_active AS business_partner_is_active, bp.name as business_partner_name, bp.dashboard_title,
             (SELECT COALESCE(json_agg(json_build_object('id', r.id, 'name', r.name, 'code', r.code, 'is_default', bpr.is_default)), '[]'::json)
              FROM business_partner_regions bpr JOIN regions r ON bpr.region_id = r.id
              WHERE bpr.business_partner_id = u.business_partner_id) as regions
             FROM users u LEFT JOIN business_partners bp ON u.business_partner_id = bp.id WHERE u.id = $1`,
            [user.id]
        );
        
        const finalUser = userWithDetails.rows[0];

        // 5. Eigenen Anwendungs-Token (JWT) erstellen und zurücksenden
        const payload = {
            user: {
                id: finalUser.id,
                username: finalUser.username,
                role: finalUser.role,
                business_partner_id: finalUser.business_partner_id,
                business_partner_name: finalUser.business_partner_name,
                dashboard_title: finalUser.dashboard_title,
                regions: finalUser.regions
            }
        };
        const appToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1h' });

        await logActivity({ userId: finalUser.id, username: finalUser.username, actionType: 'USER_LOGIN_GOOGLE', status: 'success', ipAddress: req.ip });

        res.json({ token: appToken, user: { id: finalUser.id, name: finalUser.name, email: finalUser.email, role: finalUser.role } });

    } catch (err) {
        console.error('Google Login Error:', err.message);
        res.status(500).send('Serverfehler bei der Google-Authentifizierung');
    }
};

// Die register-Funktion bleibt unverändert
exports.register = async (req, res) => {
    const { email, password, name } = req.body;
    const username = name || email.split('@')[0];
    const role = 'fleet_manager';

    if (!email || !password) {
        return res.status(400).json({ message: 'E-Mail und Passwort sind erforderlich.' });
    }

    try {
        let user = await db.query('SELECT id FROM users WHERE username = $1 OR email = $2', [username, email]);
        if (user.rows.length > 0) {
            return res.status(400).json({ message: 'Benutzer mit diesem Benutzernamen oder dieser E-Mail existiert bereits' });
        }

        const defaultBpResult = await db.query("SELECT id FROM business_partners WHERE name = 'Global Logistics GmbH'");
        if (defaultBpResult.rows.length === 0) {
            return res.status(500).json({ message: 'Standard-Business-Partner nicht gefunden.' });
        }
        const defaultBusinessPartnerId = defaultBpResult.rows[0].id;

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        const newUser = await db.query(
            'INSERT INTO users (username, email, name, password_hash, role, business_partner_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, email, role, business_partner_id',
            [username, email, name, password_hash, role, defaultBusinessPartnerId]
        );

        res.status(201).json({ message: 'Benutzer erfolgreich registriert', user: newUser.rows[0] });
    } catch (err) {
        console.error('Register error:', err.message);
        res.status(500).send('Serverfehler');
    }
};

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

        await logActivity({
            userId: user.id,
            username: user.username,
            actionType: 'USER_LOGIN',
            status: 'success',
            ipAddress: req.ip
        });

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

        // NEU: Login-Zähler erhöhen und last_login_at aktualisieren
        await db.query(
            'UPDATE users SET login_count = login_count + 1, last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
            [user.id]
        );
        
        const payload = {
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                business_partner_id: user.business_partner_id,
                business_partner_name: user.business_partner_name,
                dashboard_title: user.dashboard_title,
                regions: user.regions
            }
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1h' });

        return res.json({ token, user: { id: user.id, name: user.organization_name, email: user.email, role: user.role } });

    } catch (err) {
        await logActivity({
            username: identifier,
            actionType: 'USER_LOGIN_FAILURE',
            status: 'failure',
            details: { error: err.message },
            ipAddress: req.ip
        });
        console.error('Login error:', err.message);
        return res.status(500).send('Serverfehler');
    }
};