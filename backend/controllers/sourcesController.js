// backend/controllers/sourcesController.js
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);
const sanitizeHtml = require('sanitize-html');
const dns = require('dns'); // Node.js DNS-Modul importieren
const util = require('util'); // Node.js Utility-Modul importieren

// dns.lookup in eine Promise-basierte Funktion umwandeln für async/await
const dnsLookup = util.promisify(dns.lookup);

// @desc    Alle genehmigten Quellen abrufen
// @route   GET /api/sources
// @access  Public
exports.getAllApprovedSources = async (req, res) => {
    const { category, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    try {
        let query = `
            SELECT 
                s.id, s.url, s.description, s.average_rating, s.vote_count, s.created_at, 
                c.name as category_name, 
                c.name_lang as category_name_lang 
            FROM sources s
            LEFT JOIN categories c ON s.category_id = c.id
            WHERE s.status = 'approved'
        `;
        const queryParams = [];

        if (category && isValidUUID(category)) {
            queryParams.push(category);
            query += ` AND s.category_id = $${queryParams.length}`;
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
                s.id, s.url, s.description, s.created_at, 
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


// @desc    Eine neue Quelle vorschlagen
// @route   POST /api/sources
// @access  Private (auth)
exports.createSource = async (req, res) => {
    let { url, description, category_id } = req.body;
    const userId = req.user.id;

    if (!url) {
        return res.status(400).json({ message: 'URL ist ein Pflichtfeld.' });
    }

    // --- ERWEITERTE VALIDIERUNG ---

    let validatedUrl;
    // 1. Syntaktische URL-Prüfung
    try {
        validatedUrl = new URL(url);
        if (!['http:', 'https:'].includes(validatedUrl.protocol)) {
            return res.status(400).json({ message: 'URL muss mit http:// oder https:// beginnen.' });
        }
    } catch (error) {
        return res.status(400).json({ message: 'Ungültiges URL-Format.' });
    }

    // 2. DNS-Prüfung auf Existenz der Domain
    try {
        await dnsLookup(validatedUrl.hostname);
    } catch (error) {
        // Dieser Fehler (ENOTFOUND) tritt auf, wenn die Domain nicht existiert
        if (error.code === 'ENOTFOUND') {
            return res.status(400).json({ message: 'Die Domain der angegebenen URL konnte nicht gefunden werden.' });
        }
        // Fallback für andere DNS- oder Netzwerkfehler
        return res.status(500).json({ message: 'Die URL konnte nicht verifiziert werden.' });
    }
    
    // 3. Beschreibung bereinigen (Sanitization)
    if (description) {
        description = sanitizeHtml(description, {
            allowedTags: [],
            allowedAttributes: {}
        });
    }

    // --- Ende der Validierung ---

    try {
        const newSource = await db.query(
            'INSERT INTO sources (id, url, description, category_id, suggested_by_user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [uuidv4(), url, description || null, category_id || null, userId]
        );
        res.status(201).json(newSource.rows[0]);
    } catch (err) {
        console.error('Error creating source:', err.message);
        if (err.code === '23505') {
            return res.status(409).json({ message: 'Diese URL wurde bereits vorgeschlagen.' });
        }
        res.status(500).send('Server error');
    }
};

// @desc    Für eine Quelle abstimmen
// @route   POST /api/sources/:id/vote
// @access  Private (auth)
exports.voteOnSource = async (req, res) => {
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

        // 1. Stimme einfügen (Constraint verhindert doppelte Stimmen)
        await client.query(
            'INSERT INTO source_votes (id, source_id, user_id, rating, comment) VALUES ($1, $2, $3, $4, $5)',
            [uuidv4(), sourceId, userId, rating, comment || null]
        );

        // 2. Dem abstimmenden Nutzer +1 Punkt geben
        await client.query('UPDATE users SET contribution_score = contribution_score + 1 WHERE id = $1', [userId]);

        // 3. average_rating (gewichtet) und vote_count in der 'sources' Tabelle aktualisieren
        await client.query(
            `UPDATE sources s
             SET
                vote_count = (SELECT COUNT(*) FROM source_votes WHERE source_id = s.id),
                average_rating = (
                    SELECT
                        -- Berechne die Summe von (Bewertung * Gewicht)
                        SUM(sv.rating * (1 + u.contribution_score / 100.0))
                        /
                        -- Teile sie durch die Summe der Gewichte
                        SUM(1 + u.contribution_score / 100.0)
                    FROM
                        source_votes sv
                    JOIN
                        users u ON sv.user_id = u.id
                    WHERE
                        sv.source_id = s.id
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
        if (err.code === '23505') { // unique_user_vote_per_source
            return res.status(409).json({ message: 'You have already voted on this source.' });
        }
         if (err.code === '23503') { // source_id not found
            return res.status(404).json({ message: 'Source not found.' });
        }
        res.status(500).send('Server error');
    } finally {
        client.release();
    }
};


// @desc    Eine Quelle melden
// @route   POST /api/sources/:id/report
// @access  Private (auth)
exports.reportSource = async (req, res) => {
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