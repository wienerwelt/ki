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

    // --- NEU: 4. S3 Speicherplatz-Check über die eigene Datenbank ---
    const s3Promise = (async () => {
        try {
            const s3StatsResult = await db.query(`
                SELECT 
                    COUNT(*) as file_count, 
                    COALESCE(SUM(file_size), 0) as total_size_bytes 
                FROM business_partner_files
            `);
            
            const count = parseInt(s3StatsResult.rows[0].file_count, 10);
            const totalSizeBytes = parseInt(s3StatsResult.rows[0].total_size_bytes, 10);
            const sizeMb = totalSizeBytes / (1024 * 1024); // Umrechnung in MB
            
            return { count, sizeMb };
        } catch (err) {
            console.error('[StatusCheck] Fehler beim Abrufen der S3 Statistiken:', err.message);
            // Fallback, damit das Dashboard nicht abstürzt, wenn die DB-Tabelle fehlt
            return { count: 0, sizeMb: 0 }; 
        }
    })();
    
    // Alle 4 Checks parallel ausführen (maximale Performance)
    const [dbResult, redisResult, workerResult, s3Result] = await Promise.all([dbPromise, redisPromise, workerPromise, s3Promise]);
    
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
            version: packageJson.version || '1.0.0',
            // --- NEU: Das Objekt für das Frontend einfügen ---
            s3Storage: {
                sizeMb: s3Result.sizeMb,
                count: s3Result.count
            }
        }
    });
};