// backend/controllers/adminMonitorController.js
const db = require('../config/db');

/**
 * Ruft Aktivitätsprotokolle mit Paginierung und Filterung ab.
 */
exports.getActivityLogs = async (req, res) => {
    const { page = 1, limit = 20, actionType, username, startDate, endDate } = req.query;
    const offset = (page - 1) * limit;

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
            // Fügt den Beginn des Tages hinzu, um den ganzen Tag einzuschließen
            whereClauses.push(`timestamp >= $${paramIndex++}`);
            queryParams.push(startDate);
        }
        if (endDate) {
            // Fügt das Ende des Tages hinzu, um den ganzen Tag einzuschließen
            whereClauses.push(`timestamp <= $${paramIndex++}`);
            queryParams.push(`${endDate}T23:59:59.999Z`);
        }

        if (whereClauses.length > 0) {
            const whereString = ` WHERE ${whereClauses.join(' AND ')}`;
            countQuery += whereString;
            dataQuery += whereString;
        }

        dataQuery += ` ORDER BY timestamp DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
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

    // Validierung des Datumsformats
    if (!beforeDate || !/^\d{4}-\d{2}-\d{2}$/.test(beforeDate)) {
        return res.status(400).json({ message: 'Bitte geben Sie ein gültiges Datum im Format YYYY-MM-DD an.' });
    }

    try {
        // Das Datum wird als Endpunkt für die Löschung verwendet (exklusiv).
        const deletionDate = new Date(beforeDate);

        // SQL-Abfrage zum Löschen von Einträgen in der Tabelle 'activity_log'
        const deleteQuery = 'DELETE FROM activity_log WHERE timestamp < $1';
        
        // Ausführen der Abfrage mit dem Datum als Parameter
        const result = await db.query(deleteQuery, [deletionDate]);

        // `rowCount` gibt die Anzahl der gelöschten Zeilen zurück
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
