// backend/controllers/authController.js 
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { logActivity } = require('../services/auditLogService');
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// === Register ===
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
                has_seen_welcome_widget: user.has_seen_welcome_widget
            }
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1h' });

        return res.json({ token, user: payload.user });

    } catch (err) {
        console.error('Login error:', err.message);
        return res.status(500).send('Serverfehler');
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
            const defaultBpResult = await db.query("SELECT id FROM business_partners WHERE name = 'Global Logistics GmbH'");
            if (defaultBpResult.rows.length === 0) {
                return res.status(500).json({ message: 'Standard-Business-Partner nicht gefunden.' });
            }
            const defaultBusinessPartnerId = defaultBpResult.rows[0].id;

            const insertQuery = `
                INSERT INTO users (username, email, name, password_hash, role, business_partner_id)
                VALUES ($1, $2, $3, NULL, 'user', $4)
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
                // Fügen Sie hier bei Bedarf weitere Felder hinzu
                regions: user.regions,
                contribution_score: user.contribution_score,
                membership_level: user.membership_level
            }
        };
        
        const jwtToken = jwt.sign(jwtPayload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1h' });

        await logActivity({
            userId: user.id,
            username: user.username,
            actionType: 'GOOGLE_LOGIN',
            status: 'success',
            ipAddress: req.ip
        });

        res.status(200).json({ token: jwtToken, user: jwtPayload.user });
    } catch (error) {
        console.error('Google-Login fehlgeschlagen:', error.message);
        res.status(500).json({ message: 'Google login error', error: error.message });
    }
};
