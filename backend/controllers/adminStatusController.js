// backend/controllers/adminStatusController.js
const db = require('../config/db');
// KORREKTUR: Importiere beide Redis-Clients, um den Heartbeat-Client zu nutzen
const { connection: redisClient, heartbeatRedisClient } = require('../services/queueService'); 
// HINZUGEFÜGT: Für die Server-Version
const packageJson = require('../package.json'); 

/**
 * Überprüft den Zustand der Kerndienste sowie der einzelnen Worker-Prozesse.
 */
exports.getSystemHealth = async (req, res) => {
    // Promise für den Datenbank-Status (Ihre Logik wurde beibehalten, sie ist gut)
    const dbPromise = db.connect()
        .then(client => {
            return client.query('SELECT version()')
                .then(result => {
                    client.release();
                    // Kleines Detail: Nehmen Sie nur den Teil vor dem ersten Komma für die Übersicht
                    const version = result.rows[0].version.split(',')[0];
                    return { status: 'online', version };
                })
                .catch(err => {
                    client.release();
                    throw err;
                });
        })
        .catch(err => ({ status: 'offline', error: err.message }));

    // Promise für den Redis-Status
    const redisPromise = redisClient.ping()
        .then(pong => (pong === 'PONG' ? { status: 'online' } : { status: 'offline', error: 'Invalid PING response' }))
        .catch(err => ({ status: 'offline', error: err.message }));

    // ERWEITERT: 'fundingWorker' zur Liste der zu prüfenden Worker hinzugefügt
    const workersToCheck = ['aiContentWorker', 'scrapeWorker', 'emailWorker', 'dataUpdateWorker', 'fundingWorker'];
    const workerPromise = (async () => {
        try {
            const heartbeatKeys = workersToCheck.map(name => `worker_heartbeat:${name}`);
            // KORREKTUR: Nutze den dedizierten Heartbeat-Client
            const heartbeats = await heartbeatRedisClient.mGet(heartbeatKeys); 
            
            const workerStatus = {};
            const now = new Date();

            heartbeats.forEach((heartbeat, index) => {
                const name = workersToCheck[index];
                if (!heartbeat) {
                    workerStatus[name] = { status: 'offline', error: 'Kein Heartbeat gefunden.' };
                } else {
                    const lastBeat = new Date(heartbeat);
                    // 90 Sekunden Toleranz
                    const diffSeconds = (now - lastBeat) / 1000;
                    if (diffSeconds > 90) { 
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
    const d = Math.floor(uptimeInSeconds / (3600*24));
    const h = Math.floor(uptimeInSeconds % (3600*24) / 3600);
    const m = Math.floor(uptimeInSeconds % 3600 / 60);

    res.status(200).json({
        postgres: dbResult,
        redis: redisResult,
        workers: workerResult,
        server: {
            uptime: `${d}d ${h}h ${m}m`,
            memoryUsage: process.memoryUsage(),
            currentTime: new Date().toISOString(),
            version: packageJson.version || 'N/A'
        }
    });
};