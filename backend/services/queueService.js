const { Queue } = require('bullmq');
const IORedis = require('ioredis');

// Hilfsfunktion zum Warten (NEU)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function maskRedisUrl(url) {
  if (!url) return null;
  return url.replace(/:\/\/(.*?):(.*?)@/, '://$1:***@');
}

function getRedisConfigSummary() {
  return {
    redisUrlSet: process.env.REDIS_URL ? 'ja' : 'nein',
    redisUrlMasked: process.env.REDIS_URL ? maskRedisUrl(process.env.REDIS_URL) : null,
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    usernameSet: process.env.REDIS_USERNAME ? 'ja' : 'nein',
    passwordSet: process.env.REDIS_PASSWORD ? 'ja' : 'nein',
  };
}

function buildRedisConnection(clientName = 'redis') {
  const summary = getRedisConfigSummary();

  console.log(`[${clientName}] Redis-Konfiguration:`, summary);

  if (process.env.REDIS_URL && process.env.REDIS_URL.trim() !== '') {
    return new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy(times) {
        const retryDelay = Math.min(times * 500, 5000);
        console.log(`[${clientName}] retry #${times} in ${retryDelay}ms`);
        return retryDelay;
      },
    });
  }

  const opts = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy(times) {
      const retryDelay = Math.min(times * 500, 5000);
      console.log(`[${clientName}] retry #${times} in ${retryDelay}ms`);
      return retryDelay;
    },
  };

  if (process.env.REDIS_USERNAME && process.env.REDIS_USERNAME.trim() !== '') {
    opts.username = process.env.REDIS_USERNAME.trim();
  }

  if (process.env.REDIS_PASSWORD && process.env.REDIS_PASSWORD.trim() !== '') {
    opts.password = process.env.REDIS_PASSWORD;
  }

  return new IORedis(opts);
}

function attachRedisLogs(client, name) {
  client.on('connect', () => console.log(`[${name}] connect`));
  client.on('ready', () => console.log(`[${name}] ready`));
  client.on('error', (err) => console.error(`[${name}] error:`, err.message));
  client.on('close', () => console.warn(`[${name}] close`));
  client.on('reconnecting', () => console.warn(`[${name}] reconnecting...`));
  client.on('end', () => console.warn(`[${name}] end`));
}

const connection = buildRedisConnection('redis-main');
attachRedisLogs(connection, 'redis-main');

const heartbeatRedisClient = buildRedisConnection('redis-heartbeat');
attachRedisLogs(heartbeatRedisClient, 'redis-heartbeat');

// --- GEÄNDERT: Robuste Verbindungs-Schleife für Docker-Start ---
async function connectRedisClients() {
  let retries = 6; // Versucht es 6 mal (insgesamt ca. 15-20 Sekunden Wartezeit)

  while (retries > 0) {
    try {
      if (connection.status === 'wait') {
        await connection.connect();
      }
      if (heartbeatRedisClient.status === 'wait') {
        await heartbeatRedisClient.connect();
      }

      // Wenn Ping fehlschlägt, landen wir im Catch-Block und versuchen es erneut
      const pongMain = await connection.ping();
      console.log('[redis-main] ping =>', pongMain);

      const pongHb = await heartbeatRedisClient.ping();
      console.log('[redis-heartbeat] ping =>', pongHb);

      console.log('[queue] Alle Redis-Verbindungen erfolgreich initialisiert.');
      return; // Alles hat geklappt, Schleife verlassen!

    } catch (err) {
      console.warn(`[queue] Redis ist noch nicht bereit (${err.message}). Versuche es in 3 Sekunden erneut... (Verbleibend: ${retries - 1})`);
      retries--;
      
      if (retries === 0) {
        console.error('[queue] Kritischer Fehler: Konnte keine finale Verbindung zu Redis herstellen.');
        throw err; // Jetzt erst lassen wir den Worker abstürzen
      }
      
      await delay(3000); // 3 Sekunden warten
    }
  }
}

const aiContentQueue = new Queue('ai-content-generation', { connection });
const scrapeQueue = new Queue('scrape-content-generation', { connection });
const emailQueue = new Queue('emails', { connection });
const dataUpdatesQueue = new Queue('data-updates', { connection });
const fundingQueue = new Queue('funding-extraction', { connection });

console.log('[queue] Initialisierte Queues:');
console.log('[queue] - ai-content-generation');
console.log('[queue] - scrape-content-generation');
console.log('[queue] - emails');
console.log('[queue] - data-updates');
console.log('[queue] - funding-extraction');

module.exports = {
  connection,
  heartbeatRedisClient,
  buildRedisConnection,
  connectRedisClients,
  aiContentQueue,
  scrapeQueue,
  emailQueue,
  dataUpdatesQueue,
  fundingQueue,
};