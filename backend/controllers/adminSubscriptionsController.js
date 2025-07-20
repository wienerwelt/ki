// backend/controllers/adminSubscriptionsController.js
const db = require('../config/db');
const { aiContentQueue } = require('../services/queueService');
const { setSubscriptionSchedule } = require('../services/jobManagerService');

exports.createSubscription = async (req, res) => {
    const { id: userId } = req.user;
    const { ruleId, region, keywords } = req.body;

    if (!ruleId || !region || !keywords || keywords.length === 0) {
        return res.status(400).json({ message: 'Regel, Region und Keywords sind erforderlich.' });
    }

    try {
        // Standard-Zeitplan für die wiederkehrende Ausführung (z.B. täglich um 08:00 Uhr)
        const defaultSchedule = '0 8 * * *';

        const newSubscriptionRes = await db.query(
            `INSERT INTO content_subscriptions (user_id, ai_prompt_rule_id, region, keywords, schedule)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, ai_prompt_rule_id, region) 
             DO UPDATE SET keywords = EXCLUDED.keywords, updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [userId, ruleId, region, keywords, defaultSchedule]
        );
        
        const newSubscription = newSubscriptionRes.rows[0];
        const jobData = { subscription: newSubscription };

        // 1. Job für die Zukunft planen (wiederkehrend)
        await setSubscriptionSchedule(newSubscription.id, newSubscription.schedule);

        // 2. Job für sofortige Ausführung in die Queue stellen (einmalig)
        await aiContentQueue.add('subscription-processing', jobData);
        console.log(`[API] Added immediate job for subscription ${newSubscription.id}`);

        res.status(202).json({ 
            message: 'Abonnement akzeptiert. Die erste Analyse wird sofort gestartet und zukünftige werden geplant.', 
            subscription: newSubscription 
        });

    } catch (err) {
        console.error('Error creating content subscription:', err.message);
        res.status(500).send('Server error');
    }
};
