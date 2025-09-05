// backend/services/queueService.js
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

function buildRedisConnection() {
  // 1) Falls eine vollständige URL gesetzt ist, diese bevorzugen
  //    Beispiele:
  //    - redis://127.0.0.1:6379/0
  //    - redis://:PASSWORT@127.0.0.1:32770/0
  //    - redis://USER:PASSWORT@127.0.0.1:32770/0
  if (process.env.REDIS_URL && process.env.REDIS_URL.trim() !== '') {
    return new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
  }

  // 2) Host/Port-Konfiguration + optionales Passwort
  const opts = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379, // Dev default = 6379
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    lazyConnect: true,
  };

  if (process.env.REDIS_USERNAME && process.env.REDIS_USERNAME.trim() !== '') {
    opts.username = process.env.REDIS_USERNAME.trim();
  }

  // Fallback: Passwort NUR setzen, wenn vorhanden (sonst kein AUTH)
  if (process.env.REDIS_PASSWORD && process.env.REDIS_PASSWORD.trim() !== '') {
    opts.password = process.env.REDIS_PASSWORD;
  }

  return new IORedis(opts);
}

const connection = buildRedisConnection();

// nützliche Logs
connection.on('connect', () => console.log('[redis] connected'));
connection.on('ready',   () => console.log('[redis] ready'));
connection.on('error',   (err) => console.error('[redis] error:', err.message));
connection.on('end',     () => console.warn('[redis] connection closed'));

// zentrale Queue-Instanzen
const aiContentQueue = new Queue('ai-content-generation', { connection });
const scrapeQueue = new Queue('scrape-content-generation', { connection });
const emailQueue = new Queue('emails', { connection });

module.exports = {
  connection,
  aiContentQueue,
  scrapeQueue,
  emailQueue,
};
