// backend/controllers/adminStatusController.js
const db = require('../config/db');
const { connection: redisConnection } = require('../services/queueService');

/**
 * Überprüft den Zustand der Kerndienste sowie der einzelnen Worker-Prozesse.
 */
exports.getSystemHealth = async (req, res) => {
    // Promise für den Datenbank-Status
    const dbPromise = db.connect()
        .then(client => {
            return client.query('SELECT version()')
                .then(result => {
                    client.release();
                    return { status: 'online', version: result.rows[0].version };
                })
                .catch(err => {
                    client.release();
                    throw err;
                });
        })
        .catch(err => ({ status: 'offline', error: err.message }));

    // Promise für den Redis-Status
    const redisPromise = redisConnection.ping()
        .then(pong => (pong === 'PONG' ? { status: 'online' } : { status: 'offline', error: 'Invalid PING response' }))
        .catch(err => ({ status: 'offline', error: err.message }));


    const workersToCheck = ['api', 'aiWorker', 'scrapeWorker', 'emailWorker', 'dataUpdateWorker'];
    const workerPromise = (async () => {
        try {
            // Der API-Service setzt seinen eigenen Heartbeat genau jetzt.
            await redisConnection.set('worker_heartbeat:api', new Date().toISOString(), { EX: 60 });

            const heartbeatKeys = workersToCheck.map(name => `worker_heartbeat:${name}`);
            const heartbeats = await redisConnection.mGet(heartbeatKeys);
            
            const workerStatus = {};
            const now = new Date();

            heartbeats.forEach((heartbeat, index) => {
                const name = workersToCheck[index];
                if (!heartbeat) {
                    workerStatus[name] = { status: 'offline', error: 'Kein Heartbeat gefunden.' };
                } else {
                    const lastBeat = new Date(heartbeat);
                    const diffSeconds = (now - lastBeat) / 1000;
                    if (diffSeconds > 60) {
                        workerStatus[name] = { status: 'offline', error: `Letzter Heartbeat ist ${Math.round(diffSeconds)}s alt.` };
                    } else {
                        workerStatus[name] = { status: 'online' };
                    }
                }
            });
            return workerStatus;
        } catch (err) {
            const errorResult = {};
            workersToCheck.forEach(name => {
                errorResult[name] = { status: 'offline', error: 'Redis-Fehler beim Abrufen der Heartbeats.' };
            });
            return errorResult;
        }
    })();
    
    // Alle Prüfungen parallel ausführen
    const [dbResult, redisResult, workerResult] = await Promise.all([dbPromise, redisPromise, workerPromise]);
    
    // Server-Informationen
    const uptimeInSeconds = process.uptime();
    const hours = Math.floor(uptimeInSeconds / 3600);
    const minutes = Math.floor((uptimeInSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeInSeconds % 60);

    res.status(200).json({
        postgres: dbResult,
        redis: redisResult,
        workers: workerResult, // NEU
        server: {
            uptime: `${hours}h ${minutes}m ${seconds}s`,
            memoryUsage: process.memoryUsage()
        }
    });
};