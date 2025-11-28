// backend/controllers/adminMonitorController.js
const db = require('../config/db');
// NEU: Import für Geolocation
const geoip = require('geoip-lite');

/**
 * Ruft Aktivitätsprotokolle ab und fügt Geodaten hinzu.
 */
exports.getActivityLogs = async (req, res) => {
    const { page = 1, limit = 20, actionType, username, startDate, endDate, sortBy = 'timestamp', sortOrder = 'desc' } = req.query;
    const offset = (page - 1) * limit;
    
    // Whitelist für Sortierung um SQL-Injection zu verhindern
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
        const logsResult = await db.query(dataQuery, dataParams);

        // --- NEU: IP-Adressen auflösen ---
        const enrichedLogs = logsResult.rows.map(log => {
            let location = 'Unbekannt';
            
            // Lokale IPs abfangen
            if (log.ip_address === '127.0.0.1' || log.ip_address === '::1') {
                location = 'Lokales Netzwerk';
            } else if (log.ip_address) {
                // GeoIP Lookup
                const geo = geoip.lookup(log.ip_address);
                if (geo) {
                    location = `${geo.city || ''} ${geo.country || ''}`.trim();
                }
            }

            return {
                ...log,
                // Wir hängen den Ort direkt an die IP-Adresse im Frontend, 
                // damit du die Tabelle nicht umbauen musst: "1.2.3.4 (Wien, AT)"
                ip_address: location !== 'Unbekannt' ? `${log.ip_address} (${location})` : log.ip_address
            };
        });

        res.json({
            logs: enrichedLogs, // Sende die angereicherten Logs
            totalPages: Math.ceil(parseInt(totalResult.rows[0].count, 10) / limit),
            currentPage: parseInt(page, 10),
            totalItems: parseInt(totalResult.rows[0].count, 10)
        });
    } catch (err) {
        console.error('Error fetching activity logs:', err.message);
        res.status(500).send('Server error');
    }
};

exports.deleteLogs = async (req, res) => {
    // ... (Dieser Teil bleibt unverändert wie in deinem Upload)
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