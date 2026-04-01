// backend/controllers/sourcesController.js
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);
const sanitizeHtml = require('sanitize-html');
const dns = require('dns');
const util = require('util');
const dnsLookup = util.promisify(dns.lookup);


exports.getAllApprovedSources = async (req, res) => {
    const { category, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    try {
        let query = `
            SELECT 
                s.id, s.url, s.description, s.average_rating, s.vote_count, s.created_at, s.logo_url,
                c.name as category_name, 
                c.name_lang as category_name_lang 
            FROM sources s
            LEFT JOIN categories c ON s.category_id = c.id
            WHERE s.status = 'approved'
        `;
        const queryParams = [];

        // --- KORREKTUR: UUID oder Name Support ---
        if (category) {
            if (isValidUUID(category)) {
                queryParams.push(category);
                query += ` AND s.category_id = $${queryParams.length}`;
            } else {
                queryParams.push(category);
                query += ` AND c.name ILIKE $${queryParams.length}`;
            }
        }

        query += ` ORDER BY s.average_rating DESC, s.vote_count DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
        queryParams.push(limit, offset);

        const result = await db.query(query, queryParams);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching approved sources:', err.message);
        res.status(500).send('Server error');
    }
};

// @desc    Quellen abrufen, die zur Abstimmung anstehen
// @route   GET /api/sources/pending
// @access  Public
exports.getPendingSourcesForVote = async (req, res) => {
    try {
        const query = `
            SELECT 
                s.id, s.url, s.description, s.created_at, s.logo_url,
                c.name as category_name, 
                c.name_lang as category_name_lang
            FROM sources s
            LEFT JOIN categories c ON s.category_id = c.id
            WHERE s.status = 'pending_review'
            ORDER BY s.created_at ASC
        `;
        const result = await db.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching pending sources:', err.message);
        res.status(500).send('Server error');
    }
};


exports.getSourceCategories = async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT 
                c.id, c.name, c.name_lang
            FROM categories c
            JOIN sources s ON c.id = s.category_id
            WHERE s.status = 'approved'
            ORDER BY c.name_lang ASC, c.name ASC;
        `;
        const result = await db.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching source categories:', err.message);
        res.status(500).send('Server error');
    }
};


// @desc    Eine einzelne Quelle anhand der ID abrufen
// @route   GET /api/sources/:id
// @access  Public
exports.getSourceById = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    try {
        const sourceResult = await db.query('SELECT * FROM sources WHERE id = $1', [id]);
        if (sourceResult.rows.length === 0) {
            return res.status(404).json({ message: 'Source not found.' });
        }
        const source = sourceResult.rows[0];

        const votesResult = await db.query(
            'SELECT sv.rating, sv.comment, sv.created_at, u.username FROM source_votes sv JOIN users u ON sv.user_id = u.id WHERE sv.source_id = $1 ORDER BY sv.created_at DESC',
            [id]
        );
        source.votes = votesResult.rows;

        res.json(source);
    } catch (err) {
        console.error('Error fetching source by ID:', err.message);
        res.status(500).send('Server error');
    }
};


exports.createSource = async (req, res) => {
    // --- NEU: Demo-Check ---
    if (req.user.role === 'demo') {
        return res.status(403).json({ message: 'Demo-Benutzer dürfen keine Quellen vorschlagen.' });
    }

    let { url, description, category_id } = req.body;
    const userId = req.user.id;

    if (!url) {
        return res.status(400).json({ message: 'URL ist ein Pflichtfeld.' });
    }

    // --- ERWEITERTE VALIDIERUNG (bleibt unverändert) ---
    let validatedUrl;
    try {
        validatedUrl = new URL(url);
        if (!['http:', 'https:'].includes(validatedUrl.protocol)) {
            return res.status(400).json({ message: 'URL muss mit http:// oder https:// beginnen.' });
        }
    } catch (error) {
        return res.status(400).json({ message: 'Ungültiges URL-Format.' });
    }

    try {
        await dnsLookup(validatedUrl.hostname);
    } catch (error) {
        if (error.code === 'ENOTFOUND') {
            return res.status(400).json({ message: 'Die Domain der angegebenen URL konnte nicht gefunden werden.' });
        }
        return res.status(500).json({ message: 'Die URL konnte nicht verifiziert werden.' });
    }
    
    if (description) {
        description = sanitizeHtml(description, { allowedTags: [], allowedAttributes: {} });
    }

    // --- NEU: Transaktion starten ---
    const client = await db.connect();
    const newSourceId = uuidv4(); // ID vorab generieren
    const pointsChange = 5; // +5 Punkte für einen Vorschlag

    try {
        await client.query('BEGIN');

        // 1. Quelle eintragen
        const newSource = await client.query(
            'INSERT INTO sources (id, url, description, category_id, suggested_by_user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [newSourceId, url, description || null, category_id || null, userId]
        );

        // 2. Benutzer-Score aktualisieren
        await client.query(
            'UPDATE users SET contribution_score = contribution_score + $1 WHERE id = $2',
            [pointsChange, userId]
        );

        // 3. Log-Eintrag für Gamification erstellen
        const descriptionLog = `Punkte für Quellenvorschlag erhalten: "${url}"`;
        await client.query(
            `INSERT INTO user_score_logs (reference_id, user_id, points_change, action_type, description) 
             VALUES ($1, $2, $3, $4, $5)`,
            [newSourceId, userId, pointsChange, 'SOURCE_SUGGESTION', descriptionLog]
        );

        await client.query('COMMIT');
        res.status(201).json(newSource.rows[0]);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating source with transaction:', err.message);
        if (err.code === '23505') {
            return res.status(409).json({ message: 'Diese URL wurde bereits vorgeschlagen.' });
        }
        res.status(500).send('Server error');
    } finally {
        client.release();
    }
    // --- ENDE: Transaktion ---
};



exports.voteOnSource = async (req, res) => {
    // --- NEU: Demo-Check ---
    if (req.user.role === 'demo') {
        return res.status(403).json({ message: 'Demo-Benutzer dürfen nicht abstimmen.' });
    }

    const { id: sourceId } = req.params;
    if (!isValidUUID(sourceId)) return res.status(400).json({ message: 'Invalid source ID format.' });
    
    const { rating, comment } = req.body;
    const userId = req.user.id;

    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: 'Rating must be a number between 1 and 5.' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // NEU: Den Namen (URL) der Quelle für die Beschreibung abrufen
        const sourceRes = await client.query('SELECT url FROM sources WHERE id = $1', [sourceId]);
        if (sourceRes.rows.length === 0) {
            return res.status(404).json({ message: 'Source not found.' });
        }
        const sourceName = sourceRes.rows[0].url;
        const description = `Punkte für Abstimmung über "${sourceName}" erhalten`;

        // Log-Eintrag in die neue Tabelle einfügen
        await client.query(
            `INSERT INTO user_score_logs (id, reference_id, user_id, rating, comment, points_change, action_type, description) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [uuidv4(), sourceId, userId, rating, comment || null, 1, 'SOURCE_VOTE', description] // NEU: Dynamische Beschreibung
        );

        // Dem abstimmenden Nutzer +1 Punkt geben
        await client.query('UPDATE users SET contribution_score = contribution_score + 1 WHERE id = $1', [userId]);

        // average_rating und vote_count in der 'sources' Tabelle aktualisieren
        await client.query(
            `UPDATE sources s
             SET
                vote_count = (SELECT COUNT(*) FROM user_score_logs WHERE reference_id = s.id),
                average_rating = (
                    SELECT
                        SUM(usl.rating * (1 + u.contribution_score / 100.0))
                        /
                        SUM(1 + u.contribution_score / 100.0)
                    FROM
                        user_score_logs usl
                    JOIN
                        users u ON usl.user_id = u.id
                    WHERE
                        usl.reference_id = s.id
                )
             WHERE
                s.id = $1`,
            [sourceId]
        );

        await client.query('COMMIT');
        res.status(201).json({ message: 'Vote submitted successfully.' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error voting on source:', err.message);
        if (err.code === '23505') { 
            return res.status(409).json({ message: 'You have already voted on this source.' });
        }
         if (err.code === '23503') { 
            return res.status(404).json({ message: 'Source not found.' });
        }
        res.status(500).send('Server error');
    } finally {
        client.release();
    }
};


exports.reportSource = async (req, res) => {
    // --- NEU: Demo-Check ---
    if (req.user.role === 'demo') {
        return res.status(403).json({ message: 'Demo-Benutzer dürfen keine Quellen melden.' });
    }

    const { id: sourceId } = req.params;
    if (!isValidUUID(sourceId)) return res.status(400).json({ message: 'Invalid source ID format.' });
    
    const { reason, details } = req.body;
    const userId = req.user.id;

    if (!reason) {
        return res.status(400).json({ message: 'A reason for the report is required.' });
    }

    try {
        await db.query(
            'INSERT INTO source_reports (id, source_id, reported_by_user_id, reason, details) VALUES ($1, $2, $3, $4, $5)',
            [uuidv4(), sourceId, userId, reason, details || null]
        );
        res.status(201).json({ message: 'Report submitted successfully.' });
    } catch (err) {
        console.error('Error reporting source:', err.message);
        if (err.code === '23503') { // source_id not found
            return res.status(404).json({ message: 'Source not found.' });
        }
        res.status(500).send('Server error');
    }
};