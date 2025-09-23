// backend/services/queueService.js
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

function buildRedisConnection() {
  if (process.env.REDIS_URL && process.env.REDIS_URL.trim() !== '') {
    return new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null, enableOfflineQueue: false, lazyConnect: true });
  }
  const opts = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    lazyConnect: true,
  };
  if (process.env.REDIS_USERNAME && process.env.REDIS_USERNAME.trim() !== '') {
    opts.username = process.env.REDIS_USERNAME.trim();
  }
  if (process.env.REDIS_PASSWORD && process.env.REDIS_PASSWORD.trim() !== '') {
    opts.password = process.env.REDIS_PASSWORD;
  }
  return new IORedis(opts);
}

const connection = buildRedisConnection();
// --- NEU: Eine dedizierte Verbindung nur für Heartbeats ---
const heartbeatRedisClient = buildRedisConnection();
heartbeatRedisClient.connect().catch(err => console.error('[redis-heartbeat] Verbindung fehlgeschlagen:', err));
// --- ENDE ---

// nützliche Logs
connection.on('connect', () => console.log('[redis-main] connected'));
connection.on('ready',   () => console.log('[redis-main] ready'));
connection.on('error',   (err) => console.error('[redis-main] error:', err.message));
connection.on('end',     () => console.warn('[redis-main] connection closed'));

// zentrale Queue-Instanzen
const aiContentQueue = new Queue('ai-content-generation', { connection });
const scrapeQueue = new Queue('scrape-content-generation', { connection });
const emailQueue = new Queue('emails', { connection });
const dataUpdatesQueue = new Queue('data-updates', { connection });
const fundingQueue = new Queue('funding-extraction', { connection });

module.exports = {
  connection,
  heartbeatRedisClient,
  buildRedisConnection,
  aiContentQueue,
  scrapeQueue,
  emailQueue,
  dataUpdatesQueue,
  fundingQueue,
};