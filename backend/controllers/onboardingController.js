const db = require('../config/db');

exports.getOnboardingData = async (req, res) => {
    const { business_partner_id } = req.user;

    if (!business_partner_id) {
        return res.status(403).json({ message: "Kein Mandant zugeordnet." });
    }

    try {
        // A) Die 20 global beliebtesten Tags
        const tagsRes = await db.query(`
            SELECT t.name, COUNT(sct.tag_id) as popularity
            FROM tags t
            JOIN scraped_content_tags sct ON t.id = sct.tag_id
            GROUP BY t.id, t.name
            ORDER BY popularity DESC
            LIMIT 20
        `);

        // B) Alle Widgets, die dieser Mandant freigeschaltet hat
        // ---> HIER WURDE wt.icon_name HINZUGEFÜGT <---
        const widgetsRes = await db.query(`
            SELECT wt.id, wt.type_key, wt.name, wt.description, wt.icon_name
            FROM widget_types wt
            JOIN business_partner_widget_access bpwa ON wt.id = bpwa.widget_type_id
            WHERE bpwa.business_partner_id = $1
            ORDER BY wt.name ASC
        `, [business_partner_id]);

        // C) Die Top 3 Widgets dieses Mandanten
        const topWidgetsRes = await db.query(`
            SELECT elem->>'type' as type_key, COUNT(*) as usage_count
            FROM users u
            JOIN dashboard_configurations dc ON u.id = dc.user_id
            CROSS JOIN jsonb_array_elements(dc.config->'widgets') as elem
            WHERE u.business_partner_id = $1 AND dc.is_default = true
            GROUP BY type_key
            ORDER BY usage_count DESC
            LIMIT 3
        `, [business_partner_id]);

        const topWidgetKeys = topWidgetsRes.rows.map(r => r.type_key);

        res.json({
            topTags: tagsRes.rows.map(r => r.name),
            availableWidgets: widgetsRes.rows,
            topWidgetKeys: topWidgetKeys
        });

    } catch (err) {
        console.error('Fehler beim Laden der Onboarding-Daten:', err);
        res.status(500).json({ message: 'Serverfehler beim Laden der Onboarding-Daten' });
    }
};

exports.completeOnboarding = async (req, res) => {
    const { id: userId } = req.user;
    // NEU: organization_name aus dem Request-Body extrahieren
    const { first_name, last_name, organization_name, tags, newsletter_opt_in, selected_widget_keys } = req.body;

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // A) Profil, Organisation & Opt-In updaten
        // KORREKTUR: organization_name wurde als $5 hinzugefügt
        await client.query(`
            UPDATE users 
            SET first_name = $1, 
                last_name = $2, 
                newsletter_opt_in = FALSE,
                has_completed_onboarding = true, 
                organization_name = $3,
                updated_at = NOW()
            WHERE id = $4
        `, [first_name, last_name, organization_name, userId]);

        // B) Gewählte Themen (Tags) speichern
        if (tags && tags.length > 0) {
            // Alte Tags zur Sicherheit entfernen, falls der User den Flow neu startet
            await client.query('DELETE FROM user_saved_tags WHERE user_id = $1', [userId]);
            
            for (const tag of tags) {
                await client.query(`
                    INSERT INTO user_saved_tags (user_id, tag_name) 
                    VALUES ($1, $2) ON CONFLICT DO NOTHING
                `, [userId, tag]);
            }
        }

        // C) Persönliches Dashboard generieren
        const mandatoryKeys = ['BusinessPartnerInfo', 'user_activity'];
        const filteredKeys = (selected_widget_keys || []).filter(k => !mandatoryKeys.includes(k));

        let layout = [];
        let widgets = [];

        const bpWidgetId = 'default-bp-info';
        const profileWidgetId = 'default-user-profile';

        widgets.push({ id: bpWidgetId, type: 'BusinessPartnerInfo' });
        widgets.push({ id: profileWidgetId, type: 'user_activity' });

        layout.push({
            i: bpWidgetId, x: 0, y: 0, w: 8, h: 6, minW: 4, minH: 4
        });
        layout.push({
            i: profileWidgetId, x: 8, y: 0, w: 4, h: 6, minW: 3, minH: 5
        });

        let startY = 6; 

        if (filteredKeys.length > 0) {
            filteredKeys.forEach((typeKey, index) => {
                const widgetId = `${typeKey}-${Date.now()}-${index}`;
                widgets.push({ id: widgetId, type: typeKey });
                layout.push({
                    i: widgetId,
                    x: (index % 2) * 6,
                    y: startY + (Math.floor(index / 2) * 8),
                    w: 6,
                    h: 8,
                    minW: 3, minH: 4
                });
            });
        }

        const configJson = JSON.stringify({ layout, widgets });

        await client.query(`
            INSERT INTO dashboard_configurations (user_id, name, config, is_default)
            VALUES ($1, 'Mein Dashboard', $2, true)
            ON CONFLICT (user_id, name) DO UPDATE SET config = $2
        `, [userId, configJson]);

        await client.query('COMMIT');
        res.json({ message: 'Onboarding erfolgreich abgeschlossen.' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Fehler beim Onboarding-Speichern:', err);
        res.status(500).json({ message: 'Fehler beim Speichern.' });
    } finally {
        client.release();
    }
};
