// backend/controllers/sessionController.js
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { ensureCsrfCookie, setSessionCookies } = require('../services/sessionSecurity');

exports.status = async (req, res) => {
    // Bestehende Sitzungen aus Releases vor der CSRF-Absicherung erhalten
    // beim ersten Statusabruf automatisch das Double-Submit-Cookie.
    ensureCsrfCookie(req, res);
    return res.json({
        authenticated: true,
        expiresAt: req.auth?.expiresAt ? req.auth.expiresAt.toISOString() : null,
    });
};

exports.renew = async (req, res) => {
    // Die User-ID wird aus dem bestehenden (aber bald ablaufenden) Token entnommen,
    // das vom authMiddleware validiert wurde.
    const userId = req.user.id;

    if (!userId) {
        return res.status(401).json({ message: 'Authentifizierung fehlgeschlagen.' });
    }

    try {
        // KORREKTUR: Anstatt die alten Daten aus dem Token wiederzuverwenden,
        // holen wir den aktuellsten Benutzerdatensatz aus der Datenbank.
        // Diese Abfrage ist identisch zur Abfrage im authController, um Konsistenz zu gewährleisten.
        const userResult = await db.query(
            `SELECT 
                u.*, 
                bp.is_active AS business_partner_is_active, 
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
             WHERE u.id = $1`,
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
        }
        const user = userResult.rows[0];

        // Erstellen der neuen Token-Payload mit den frischen Daten
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
                preferred_workspace: user.preferred_workspace || null,
                tenant_modules: user.tenant_modules || ['content'],
                tenant_default_workspace: user.tenant_default_workspace || 'content',
                tenant_sales_plan: user.tenant_sales_plan || 'basic',
                tenant_sales_subscription_status: user.tenant_sales_subscription_status || 'active',
                tenant_sales_trial_ends_on: user.tenant_sales_trial_ends_on || null,
                tenant_sales_trial_days_remaining: user.tenant_sales_trial_days_remaining === null ? null : Number(user.tenant_sales_trial_days_remaining),
                tenant_sales_access_active: user.tenant_sales_access_active !== false
            },
            av: Number(user.auth_version || 0)
        };

        // Ein neues Token mit einer neuen Ablaufzeit signieren
        if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET ist nicht konfiguriert.');
        const newToken = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '8h',
            algorithm: 'HS256',
        });
        const session = setSessionCookies(res, newToken);

        res.json({ expiresAt: session.expiresAt });

    } catch (err) {
        console.error('Fehler bei der Sitzungserneuerung:', err.message);
        res.status(500).send('Serverfehler');
    }
};
