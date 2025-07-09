// backend/controllers/adminSubscriptionsController.js
const db = require('../config/db');
const { processSubscription } = require('../services/intelligentContentService');

exports.createSubscription = async (req, res) => {
    const { id: userId } = req.user; // Holt die ID des eingeloggten Nutzers
    const { ruleId, region, keywords } = req.body;

    if (!ruleId || !region || !keywords || keywords.length === 0) {
        return res.status(400).json({ message: 'Regel, Region und Keywords sind erforderlich.' });
    }

    try {
        // Speichert das Abo in der Datenbank oder aktualisiert es
        const newSubscription = await db.query(
            `INSERT INTO content_subscriptions (user_id, ai_prompt_rule_id, region, keywords)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, ai_prompt_rule_id, region) DO UPDATE SET keywords = $4, updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [userId, ruleId, region, keywords]
        );
        
        // Startet den intelligenten Verarbeitungs-Prozess im Hintergrund
        processSubscription({
            ruleId,
            region,
            keywords,
            subscriptionId: newSubscription.rows[0].id,
            userId: userId // KORREKTUR: Stellt sicher, dass die user_id übergeben wird
        });

        res.status(202).json({ message: 'Abonnement akzeptiert und wird verarbeitet.', subscription: newSubscription.rows[0] });

    } catch (err) {
        console.error('Error creating content subscription:', err.message);
        res.status(500).send('Server error');
    }
};