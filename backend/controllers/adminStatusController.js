// backend/controllers/adminStatusController.js
const db = require('../config/db');
// KORRIGIERTER IMPORT:
// Wir importieren die Eigenschaft "connection" und benennen sie in "redisConnection" um.
const { connection: redisConnection } = require('../services/queueService');

/**
 * Überprüft den Zustand der Kerndienste (Datenbank, Redis)
 */
exports.getSystemHealth = async (req, res) => {
    // Promise für den Datenbank-Status
    const dbPromise = db.query('SELECT 1')
        .then(() => ({ status: 'online' }))
        .catch(err => ({ status: 'offline', error: err.message }));

    // Promise für den Redis-Status
    const redisPromise = redisConnection.ping()
        .then(pong => (pong === 'PONG' ? { status: 'online' } : { status: 'offline', error: 'Invalid PING response' }))
        .catch(err => ({ status: 'offline', error: err.message }));
        
    // Alle Prüfungen parallel ausführen
    const [dbResult, redisResult] = await Promise.all([dbPromise, redisPromise]);

    res.status(200).json({
        database: dbResult,
        redis: redisResult
    });
};