// backend/controllers/adminMonitorController.js
const db = require('../config/db');

// ==========================================================
// === Funktionen für Activity Logs
// ==========================================================

/**
 * Ruft Aktivitätsprotokolle mit Paginierung und Filterung ab.
 */
exports.getActivityLogs = async (req, res) => {
    const { page = 1, limit = 20, actionType, username, startDate, endDate, sortBy = 'timestamp', sortOrder = 'desc' } = req.query;
    const offset = (page - 1) * limit;
    const allowedSortColumns = ['timestamp', 'username', 'action_type', 'status', 'ip_address'];
    const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'timestamp';
    const safeSortOrder = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';    

    try {
        let countQuery = 'SELECT COUNT(*) FROM activity_log';
        let dataQuery = 'SELECT * FROM activity_log';
        
        const whereClauses = [];
        const queryParams = [];
        let paramIndex = 1;

        if (actionType) {
            whereClauses.push(`action_type ILIKE $${paramIndex++}`);
            queryParams.push(`%${actionType}%`);
        }
        if (username) {
            whereClauses.push(`username ILIKE $${paramIndex++}`);
            queryParams.push(`%${username}%`);
        }
        if (startDate) {
            whereClauses.push(`timestamp >= $${paramIndex++}`);
            queryParams.push(startDate);
        }
        if (endDate) {
            whereClauses.push(`timestamp <= $${paramIndex++}`);
            queryParams.push(`${endDate}T23:59:59.999Z`);
        }

        if (whereClauses.length > 0) {
            const whereString = ` WHERE ${whereClauses.join(' AND ')}`;
            countQuery += whereString;
            dataQuery += whereString;
        }

        dataQuery += ` ORDER BY ${safeSortBy} ${safeSortOrder} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        const dataParams = [...queryParams, limit, offset];

        const totalResult = await db.query(countQuery, queryParams);
        const totalItems = parseInt(totalResult.rows[0].count, 10);

        const logsResult = await db.query(dataQuery, dataParams);

        res.json({
            logs: logsResult.rows,
            totalPages: Math.ceil(totalItems / limit),
            currentPage: parseInt(page, 10),
            totalItems
        });
    } catch (err) {
        console.error('Error fetching activity logs:', err.message);
        res.status(500).send('Server error');
    }
};

/**
 * Löscht Protokolleinträge, die vor einem bestimmten Datum liegen.
 */
exports.deleteLogs = async (req, res) => {
    const { beforeDate } = req.query;

    if (!beforeDate || !/^\d{4}-\d{2}-\d{2}$/.test(beforeDate)) {
        return res.status(400).json({ message: 'Bitte geben Sie ein gültiges Datum im Format YYYY-MM-DD an.' });
    }

    try {
        const deletionDate = new Date(beforeDate);
        const deleteQuery = 'DELETE FROM activity_log WHERE timestamp < $1';
        const result = await db.query(deleteQuery, [deletionDate]);
        const deletedCount = result.rowCount || 0;

        res.status(200).json({
            message: `${deletedCount} Protokolleinträge wurden erfolgreich gelöscht.`,
            deletedCount: deletedCount,
        });

    } catch (error) {
        console.error('Fehler beim Löschen der Protokolle:', error);
        res.status(500).json({ message: 'Serverfehler beim Löschen der Protokolle.' });
    }
};

// --- ENTFERNT ---
// Alle Funktionen für /templates und /entries wurden in adminLegalMonitorController.js verschoben.