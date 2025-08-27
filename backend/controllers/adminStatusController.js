// backend/controllers/adminStatusController.js
const db = require('../config/db');
const { connection: redisConnection } = require('../services/queueService');

/**
 * Überprüft den Zustand der Kerndienste (PostgreSQL, Redis) sowie grundlegende Server-Metriken.
 */
exports.getSystemHealth = async (req, res) => {
    // KORREKTUR: Robusterer Check für PostgreSQL
    // Wir holen uns aktiv einen Client aus dem Pool, führen eine Abfrage aus und geben ihn wieder frei.
    // Dies verhindert falsche "offline"-Meldungen durch veraltete Verbindungen im Pool.
    // Zusätzlich fragen wir die Version ab, um eine nützlichere Information zu erhalten.
    const dbPromise = db.connect()
        .then(client => {
            return client.query('SELECT version()')
                .then(result => {
                    client.release(); // Wichtig: Client nach Erfolg freigeben
                    return { status: 'online', version: result.rows[0].version };
                })
                .catch(err => {
                    client.release(); // Wichtig: Client auch im Fehlerfall freigeben
                    // Fehler weiterwerfen, damit er vom äußeren .catch() gefangen wird
                    throw err;
                });
        })
        .catch(err => ({ status: 'offline', error: err.message }));

    // Promise für den Redis-Status (unverändert, aber solide)
    const redisPromise = redisConnection.ping()
        .then(pong => (pong === 'PONG' ? { status: 'online' } : { status: 'offline', error: 'Invalid PING response' }))
        .catch(err => ({ status: 'offline', error: err.message }));

    // Alle Prüfungen parallel ausführen
    const [dbResult, redisResult] = await Promise.all([dbPromise, redisPromise]);
    
    // NEU: Server-Informationen hinzufügen
    const uptimeInSeconds = process.uptime();
    const hours = Math.floor(uptimeInSeconds / 3600);
    const minutes = Math.floor((uptimeInSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeInSeconds % 60);

    res.status(200).json({
        postgres: dbResult,
        redis: redisResult,
        server: {
            uptime: `${hours}h ${minutes}m ${seconds}s`,
            memoryUsage: process.memoryUsage()
        }
    });
};