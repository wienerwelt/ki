const { Queue } = require('bullmq');
const IORedis = require('ioredis');

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
        const delay = Math.min(times * 500, 5000);
        console.log(`[${clientName}] retry #${times} in ${delay}ms`);
        return delay;
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
      const delay = Math.min(times * 500, 5000);
      console.log(`[${clientName}] retry #${times} in ${delay}ms`);
      return delay;
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

async function connectRedisClients() {
  try {
    if (connection.status === 'wait') {
      await connection.connect();
    }
  } catch (err) {
    console.error('[redis-main] Verbindung fehlgeschlagen:', err.message);
    throw err;
  }

  try {
    if (heartbeatRedisClient.status === 'wait') {
      await heartbeatRedisClient.connect();
    }
  } catch (err) {
    console.error('[redis-heartbeat] Verbindung fehlgeschlagen:', err.message);
    throw err;
  }

  try {
    const pong = await connection.ping();
    console.log('[redis-main] ping =>', pong);
  } catch (err) {
    console.error('[redis-main] ping fehlgeschlagen:', err.message);
    throw err;
  }

  try {
    const pong = await heartbeatRedisClient.ping();
    console.log('[redis-heartbeat] ping =>', pong);
  } catch (err) {
    console.error('[redis-heartbeat] ping fehlgeschlagen:', err.message);
    throw err;
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