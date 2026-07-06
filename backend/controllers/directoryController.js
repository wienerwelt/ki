const db = require('../config/db');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

// @desc    Alle verfügbaren Dienstleister für den aktuellen Mandanten abrufen
// @route   GET /api/directory/internal
// @access  Private (Auth)
exports.getInternalDirectory = async (req, res) => { 
    const bpId = req.user.business_partner_id;

    try {
        const query = `
            SELECT 
                p.id,
                p.name,
                p.description,
                p.logo_url,
                p.website_url,
                p.contact_email,
                p.contact_phone,
                COALESCE(ms.is_recommended, false) as is_recommended,
                ROUND(COALESCE(r.avg_rating, 0), 1) as average_rating,
                COALESCE(r.rev_count, 0) as review_count,
                COALESCE((SELECT json_agg(category_id) FROM directory_provider_categories WHERE provider_id = p.id), '[]'::json) as categories,
                COALESCE((SELECT json_agg(tag_id) FROM directory_provider_tags WHERE provider_id = p.id), '[]'::json) as tags,
                COALESCE((
                    SELECT json_agg(
                        json_build_object(
                            'id', l.id,
                            'address', l.address,
                            'zip_code', l.zip_code,
                            'city', l.city,
                            'country', l.country,
                            'latitude', l.latitude,
                            'longitude', l.longitude,
                            'is_headquarter', l.is_headquarter
                        )
                        ORDER BY l.is_headquarter DESC, l.city ASC, l.address ASC
                    )
                    FROM directory_provider_locations l
                    WHERE l.provider_id = p.id
                ), '[]'::json) as locations
            FROM directory_providers p
            -- INNER JOIN erzwingt, dass ein Eintrag für diesen Mandanten existieren MUSS
            INNER JOIN directory_provider_mandant_settings ms 
                ON p.id = ms.provider_id 
            LEFT JOIN (
                SELECT provider_id, AVG(rating) as avg_rating, COUNT(id) as rev_count 
                FROM directory_provider_reviews 
                GROUP BY provider_id
            ) r ON p.id = r.provider_id
            -- Nur aktive Zuweisungen für genau diesen Mandanten erlauben:
            WHERE ms.business_partner_id = $1 
              AND ms.status = 'active'
            ORDER BY ms.is_recommended DESC, p.name ASC
        `;
        
        const result = await db.query(query, [bpId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching internal directory:', err.message);
        res.status(500).send('Server error');
    }
};

// @desc    Erwähnungen aus Trusted Sources abrufen
// @route   GET /api/directory/internal/:id/mentions
// @access  Private (Auth)
exports.getProviderMentions = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    try {
        const query = `
            SELECT m.scraped_content_id as id, s.title, s.original_url, s.published_date, s.source_identifier
            FROM directory_provider_mentions m
            JOIN scraped_content s ON m.scraped_content_id = s.id
            WHERE m.provider_id = $1
            ORDER BY s.published_date DESC
        `;
        const result = await db.query(query, [id]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching mentions:', err.message);
        res.status(500).send('Server error');
    }
};

// @desc    Community Reviews abrufen
// @route   GET /api/directory/internal/:id/reviews
// @access  Private (Auth)
exports.getProviderReviews = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    try {
        const query = `
            SELECT r.id, r.rating, r.comment, r.created_at, 
                   COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.username, 'Mitglied') as user_name, 
                   u.profile_image_url as user_avatar
            FROM directory_provider_reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.provider_id = $1
            ORDER BY r.created_at DESC
        `;
        const result = await db.query(query, [id]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching reviews:', err.message);
        res.status(500).send('Server error');
    }
};

// @desc    Neue Bewertung abgeben
// @route   POST /api/directory/internal/:id/reviews
// @access  Private (Auth)
exports.addProviderReview = async (req, res) => {
    if (req.user.role === 'demo') return res.status(403).json({ message: 'Demo-Benutzer dürfen keine Bewertungen abgeben.' });

    const { id } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id;

    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ message: 'Gültiges Rating (1-5) erforderlich.' });

    try {
        const query = `
            INSERT INTO directory_provider_reviews (provider_id, user_id, rating, comment) 
            VALUES ($1, $2, $3, $4) RETURNING *
        `;
        const result = await db.query(query, [id, userId, rating, comment || null]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error adding review:', err.message);
        if (err.code === '23505') {
            return res.status(409).json({ message: 'Sie haben diesen Dienstleister bereits bewertet.' });
        }
        res.status(500).send('Server error');
    }
};

// @desc    Interne Mandanten-Notizen abrufen
// @route   GET /api/directory/internal/:id/notes
// @access  Private (Auth)
exports.getProviderNotes = async (req, res) => {
    const { id } = req.params;
    const bpId = req.user.business_partner_id;

    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    try {
        const query = `
            SELECT n.id, n.note_text, n.created_at, 
                   COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.username, 'Mitglied') as user_name
            FROM directory_provider_notes n
            JOIN users u ON n.user_id = u.id
            WHERE n.provider_id = $1 AND n.business_partner_id = $2
            ORDER BY n.created_at DESC
        `;
        const result = await db.query(query, [id, bpId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching notes:', err.message);
        res.status(500).send('Server error');
    }
};

// @desc    Interne Mandanten-Notiz hinzufügen
// @route   POST /api/directory/internal/:id/notes
// @access  Private (Auth)
exports.addProviderNote = async (req, res) => {
    if (req.user.role === 'demo') return res.status(403).json({ message: 'Demo-Benutzer dürfen keine Notizen erstellen.' });

    const { id } = req.params;
    const { note_text } = req.body;
    const userId = req.user.id;
    const bpId = req.user.business_partner_id;

    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    if (!note_text) return res.status(400).json({ message: 'Notiztext darf nicht leer sein.' });

    try {
        const query = `
            INSERT INTO directory_provider_notes (provider_id, business_partner_id, user_id, note_text) 
            VALUES ($1, $2, $3, $4) RETURNING *
        `;
        const result = await db.query(query, [id, bpId, userId, note_text]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error adding note:', err.message);
        res.status(500).send('Server error');
    }
};