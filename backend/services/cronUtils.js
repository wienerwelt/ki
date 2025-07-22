// backend/utils/cronUtils.js

const cronParser = require('cron-parser');

// Entfernt führende Nullen aus Minuten- und Stundenfeld (nur bei klassischen 5-Felder-Cron-Strings)
function normalizeCronString(cron) {
    if (!cron || typeof cron !== 'string') return cron;
    const parts = cron.trim().split(' ');
    if (parts.length !== 5) return cron; // nur "klassische" Cron-Strings anpassen
    // Min und Std normalisieren
    parts[0] = String(Number(parts[0])); // Minute
    parts[1] = String(Number(parts[1])); // Stunde
    return parts.join(' ');
}

// Prüft, ob ein Cron-String gültig ist (nach Normalisierung)
function isValidCron(cron) {
    try {
        cronParser.parseExpression(cron, { currentDate: new Date(), tz: 'Europe/Vienna' });
        return true;
    } catch {
        return false;
    }
}

module.exports = { normalizeCronString, isValidCron };
