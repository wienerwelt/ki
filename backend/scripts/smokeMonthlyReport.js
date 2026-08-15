const db = require('../config/db');
const { generateAndSendMonthlyReport } = require('../services/reportingService');
const queueService = require('../services/queueService');

async function closeResources() {
    await Promise.allSettled([
        queueService.aiContentQueue.close(),
        queueService.scrapeQueue.close(),
        queueService.emailQueue.close(),
        queueService.dataUpdatesQueue.close(),
        queueService.fundingQueue.close(),
    ]);
    queueService.connection.disconnect();
    queueService.heartbeatRedisClient.disconnect();
    await db.end();
}

generateAndSendMonthlyReport({ dryRun: true, includeUnsubscribedRecipients: true })
    .then((result) => {
        console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
        console.error('[smoke:monthly-report] fehlgeschlagen:', error.message);
        process.exitCode = 1;
    })
    .finally(closeResources);
