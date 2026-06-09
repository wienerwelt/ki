// backend/controllers/adminMonitorController.js
const db = require('../config/db');
const geoip = require('geoip-lite');
const { ListObjectsV2Command, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const s3Client = require("../config/s3Client.js");

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
        let statsQuery = 'SELECT status, COUNT(*) as count FROM activity_log'; // NEU: Statistik-Query
        
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
            statsQuery += whereString; // Filter auch auf Statistiken anwenden
        }

        statsQuery += ' GROUP BY status'; // Nach Erfolg/Fehler gruppieren

        dataQuery += ` ORDER BY ${safeSortBy} ${safeSortOrder} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        const dataParams = [...queryParams, limit, offset];

        // Alle drei Abfragen parallel ausführen für maximale Geschwindigkeit
        const [totalResult, logsResult, statsResult] = await Promise.all([
            db.query(countQuery, queryParams),
            db.query(dataQuery, dataParams),
            db.query(statsQuery, queryParams)
        ]);

        // Statistiken auswerten
        let successCount = 0;
        let failCount = 0;
        statsResult.rows.forEach(row => {
            // Wandelt z.B. "SUCCESS", "Success", "success" immer in "success" um
            const stat = String(row.status || '').toLowerCase();
            
            if (stat === 'success') {
                successCount += parseInt(row.count, 10);
            } else {
                failCount += parseInt(row.count, 10);
            }
        });

        // IP-Adressen auflösen
        const enrichedLogs = logsResult.rows.map(log => {
            let location = 'Unbekannt';
            if (log.ip_address === '127.0.0.1' || log.ip_address === '::1') {
                location = 'Lokales Netzwerk';
            } else if (log.ip_address) {
                const geo = geoip.lookup(log.ip_address);
                if (geo) {
                    location = `${geo.city || ''} ${geo.country || ''}`.trim();
                }
            }
            return {
                ...log,
                ip_address: location !== 'Unbekannt' ? `${log.ip_address} (${location})` : log.ip_address
            };
        });

        res.json({
            logs: enrichedLogs,
            totalPages: Math.ceil(parseInt(totalResult.rows[0].count, 10) / limit),
            currentPage: parseInt(page, 10),
            totalItems: parseInt(totalResult.rows[0].count, 10),
            globalStats: { success: successCount, failed: failCount } // NEU: Globale Stats mitsenden
        });
    } catch (err) {
        console.error('Error fetching activity logs:', err.message);
        res.status(500).send('Server error');
    }
};

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


exports.getArchiveFiles = async (req, res) => {
    try {
        const bucketName = process.env.AWS_S3_BUCKET_NAME;
        if (!bucketName) {
            return res.status(500).json({ message: "S3 Bucket Name ist nicht konfiguriert." });
        }

        const command = new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: 'system-archive/'
        });

        const s3Response = await s3Client.send(command);
        
        // Map auf ein sauberes JSON-Array für das Frontend
        const files = (s3Response.Contents || []).map(file => ({
            key: file.Key,
            filename: file.Key.split('/').pop(),
            sizeMb: (file.Size / 1024 / 1024).toFixed(2),
            lastModified: file.LastModified
        }));

        // Neueste zuerst sortieren
        files.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

        res.status(200).json({ files });
    } catch (error) {
        console.error("Fehler beim Abrufen der S3 Archivdateien:", error);
        res.status(500).json({ message: "Fehler beim Laden der Archivdateien." });
    }
};

// --- NEU: Download-URL für EINE bestimmte S3 Datei generieren ---
exports.getArchiveDownloadUrl = async (req, res) => {
    try {
        const { key } = req.query; // Der S3 Path, z.B. "system-archive/..."
        if (!key) return res.status(400).json({ message: "Kein Dateischlüssel angegeben." });

        const command = new GetObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: key,
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });
        res.status(200).json({ url: signedUrl });
    } catch (error) {
        console.error("Fehler beim Generieren der S3 Download-URL:", error);
        res.status(500).json({ message: "Download-Link konnte nicht generiert werden." });
    }
};