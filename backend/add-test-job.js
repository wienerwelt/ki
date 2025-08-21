// backend/add-test-job.js
require('dotenv').config();
const { aiContentQueue } = require('./services/queueService');

async function addJob() {
    console.log('Versuche, einen Test-Job zur Queue hinzuzufügen...');
    try {
        await aiContentQueue.add('update_commodity_prices', {
            triggeredBy: 'manual_script_test',
            timestamp: new Date().toISOString()
        });
        console.log('✅ Job erfolgreich zur Queue hinzugefügt!');
        console.log('Bitte überprüfen Sie jetzt das Terminal des Workers.');
    } catch (error) {
        console.error('❌ Fehler beim Hinzufügen des Jobs:', error);
    }
    // Die Verbindung muss geschlossen werden, damit das Skript sauber endet.
    await aiContentQueue.close();
}

addJob();