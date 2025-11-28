// backend/controllers/adminStatusController.js
const db = require('../config/db');
const { connection: redisClient, heartbeatRedisClient } = require('../services/queueService');
const packageJson = require('../package.json'); 

exports.getSystemHealth = async (req, res) => {
    // 1. DB Check
    const dbPromise = db.connect()
        .then(client => {
            return client.query('SELECT version()')
                .then(result => {
                    client.release();
                    const version = result.rows[0].version.split(',')[0];
                    return { status: 'online', version };
                })
                .catch(err => {
                    client.release();
                    throw err;
                });
        })
        .catch(err => ({ status: 'offline', error: err.message }));

    // 2. Redis Check
    const redisPromise = redisClient.ping()
        .then(pong => (pong === 'PONG' ? { status: 'online' } : { status: 'offline', error: 'Invalid PING' }))
        .catch(err => ({ status: 'offline', error: err.message }));

    // 3. Worker Check (mit DEBUGGING)
    // HIER BITTE PRÜFEN: Heißen deine Worker-Dateien/Variablen exakt so?
    const workersToCheck = ['aiWorker', 'scrapeWorker', 'emailWorker', 'dataUpdateWorker', 'fundingWorker'];
    
    const workerPromise = (async () => {
        try {
            const heartbeatKeys = workersToCheck.map(name => `worker_heartbeat:${name}`);
            
            // Debugging: Zeige an, welche Keys wir suchen
            console.log('[StatusCheck] Suche nach Redis-Keys:', heartbeatKeys);

            const heartbeats = await heartbeatRedisClient.mget(heartbeatKeys); 
            
            // Debugging: Zeige an, was Redis zurückgegeben hat
            console.log('[StatusCheck] Redis Antwort:', heartbeats);

            const workerStatus = {};
            const now = new Date();

            heartbeats.forEach((heartbeat, index) => {
                const name = workersToCheck[index];
                if (!heartbeat) {
                    // Kein Eintrag in Redis gefunden (oder abgelaufen)
                    workerStatus[name] = { status: 'offline', error: 'Kein Heartbeat in Redis gefunden.' };
                } else {
                    const lastBeat = new Date(heartbeat);
                    const diffSeconds = (now - lastBeat) / 1000;
                    
                    console.log(`[StatusCheck] ${name}: Letzter Beat vor ${diffSeconds}s`);

                    if (diffSeconds > 120) { // Toleranz auf 120s erhöht
                        workerStatus[name] = { status: 'offline', error: `Inaktiv seit ${Math.round(diffSeconds)}s` };
                    } else {
                        workerStatus[name] = { status: 'online' };
                    }
                }
            });
            return workerStatus;
        } catch (err) {
            console.error('[StatusCheck] Redis Fehler:', err);
            const errorResult = {};
            workersToCheck.forEach(name => {
                errorResult[name] = { status: 'offline', error: 'Fehler beim Lesen der Heartbeats' };
            });
            return errorResult;
        }
    })();
    
    const [dbResult, redisResult, workerResult] = await Promise.all([dbPromise, redisPromise, workerPromise]);
    
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
            version: packageJson.version || '1.0.0'
        }
    });
};