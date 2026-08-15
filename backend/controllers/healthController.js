const db = require('../config/db');

exports.getHealth = async (req, res) => {
    const responseBody = {
        service: 'mobiliti-dashboard-api',
        timestamp: new Date().toISOString()
    };

    try {
        await db.query('SELECT 1');

        return res.status(200).json({
            status: 'ok',
            ...responseBody
        });
    } catch (err) {
        console.error('[HEALTH] Datenbank nicht erreichbar:', err.message);

        return res.status(503).json({
            status: 'unavailable',
            ...responseBody
        });
    }
};
