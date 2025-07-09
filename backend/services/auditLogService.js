// backend/services/auditLogService.js
const db = require('../config/db');

/**
 * Protokolliert eine Aktivität in der Datenbank.
 * @param {object} logData - Die zu protokollierenden Daten.
 * @param {string|null} logData.userId - ID des Benutzers.
 * @param {string|null} logData.username - Name des Benutzers.
 * @param {string} logData.actionType - Art der Aktion (z.B. 'USER_LOGIN').
 * @param {string} logData.status - 'success' oder 'failure'.
 * @param {string|null} [logData.targetId] - ID des betroffenen Objekts.
 * @param {string|null} [logData.targetType] - Typ des betroffenen Objekts.
 * @param {object|null} [logData.details] - Zusätzliche JSON-Details.
 * @param {string|null} [logData.ipAddress] - IP-Adresse.
 */
const logActivity = async (logData) => {
    const {
        userId = null,
        username = 'System',
        actionType,
        status,
        targetId = null,
        targetType = null,
        details = {},
        ipAddress = null,
    } = logData;

    try {
        const query = `
            INSERT INTO activity_log (user_id, username, action_type, status, target_id, target_type, details, ip_address)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        await db.query(query, [userId, username, actionType, status, targetId, targetType, details, ipAddress]);
    } catch (error) {
        console.error('Failed to log activity:', error);
    }
};

module.exports = { logActivity };
