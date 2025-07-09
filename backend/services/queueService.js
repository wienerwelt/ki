// backend/services/queueService.js
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

// Stellt die Verbindung zu deinem Redis-Server her.
// Passe die Verbindungsdetails bei Bedarf an.
const connection = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null
});

// Erstellt und exportiert eine benannte Warteschlange für die KI-Inhaltsgenerierung.
const aiContentQueue = new Queue('ai-content-generation', { connection });

console.log('Job Queue Service initialized.');

module.exports = {
  aiContentQueue,
  connection // Exportiere auch die Verbindung für den Worker
};
