// backend/controllers/adminSubscriptionsController.js
const db = require('../config/db');
const { aiContentQueue } = require('../services/queueService');
// Der jobManagerService wird hier bewusst NICHT verwendet, da Nutzer keine Zeitpläne setzen.

exports.createSubscription = async (req, res) => {
    // Wichtig: Holt die ID des aktuell eingeloggten Nutzers, egal welche Rolle er hat.
    const { id: userId } = req.user; 
    const { ruleId, region, keywords } = req.body;

    if (!ruleId || !region || !keywords || keywords.length === 0) {
        return res.status(400).json({ message: 'Regel, Region und Keywords sind erforderlich.' });
    }

    try {
        // Es wird kein 'schedule' gesetzt. Die Spalte bleibt NULL, was korrekt ist.
        const newSubscriptionRes = await db.query(
            `INSERT INTO user_ai_content_subscriptions (user_id, ai_prompt_rule_id, region, keywords)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, ai_prompt_rule_id, region) 
             DO UPDATE SET keywords = EXCLUDED.keywords, updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [userId, ruleId, region, keywords]
        );
        
        const newSubscription = newSubscriptionRes.rows[0];
        const jobData = { subscription: newSubscription };

        // Der Job wird einmalig und mit sofortiger Wirkung in die Warteschlange gestellt.
        await aiContentQueue.add('subscription-processing', jobData);
        console.log(`[API] Added immediate one-off job for user subscription ${newSubscription.id}`);

        res.status(202).json({ 
            message: 'Abonnement akzeptiert. Die Analyse wird sofort gestartet.', 
            subscription: newSubscription 
        });

    } catch (err) {
        console.error('Error creating content subscription:', err.message);
        res.status(500).send('Server error');
    }
};
