const pool = require('../config/db');

// @route   GET /api/admin/actions
// @desc    Alle Aktionen abrufen (Admin: alle, Assistenz: nur für eigenen BP) mit Suche und Sortierung
// @access  Private (Admin, Assistenz)
exports.getActionsForBusinessPartner = async (req, res) => {
    const { role, business_partner_id } = req.user;
    const { search, sortBy, sortOrder } = req.query;

    try {
        let query;
        let queryParams = [];
        let paramIndex = 1;

        // Basis-Query für Admins
        let baseQueryAdmin = `
            SELECT a.*, bp.name as business_partner_name 
            FROM business_partner_actions a
            LEFT JOIN business_partners bp ON a.business_partner_id = bp.id
        `;
        // Basis-Query für Assistenten
        let baseQueryAssistenz = `SELECT * FROM business_partner_actions`;

        let whereClauses = [];

        if (role === 'admin') {
            query = baseQueryAdmin;
            if (search) {
                whereClauses.push(`(a.title ILIKE $${paramIndex} OR a.content_text ILIKE $${paramIndex} OR bp.name ILIKE $${paramIndex})`);
                queryParams.push(`%${search}%`);
                paramIndex++;
            }
        } else if (role === 'assistenz' && business_partner_id) {
            query = baseQueryAssistenz;
            whereClauses.push(`business_partner_id = $${paramIndex}`);
            queryParams.push(business_partner_id);
            paramIndex++;
            if (search) {
                whereClauses.push(`(title ILIKE $${paramIndex} OR content_text ILIKE $${paramIndex})`);
                queryParams.push(`%${search}%`);
                paramIndex++;
            }
        } else {
            return res.status(403).json({ message: 'Unzureichende Berechtigungen oder keine Zuordnung zu einem Business Partner.' });
        }

        if (whereClauses.length > 0) {
            query += ' WHERE ' + whereClauses.join(' AND ');
        }

        // Sortierung hinzufügen
        const allowedSortBy = ['title', 'business_partner_name', 'start_date', 'end_date', 'created_at'];
        const orderBy = allowedSortBy.includes(sortBy) ? sortBy : 'created_at';
        const orderDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';
        query += ` ORDER BY ${orderBy} ${orderDirection}`;

        const result = await pool.query(query, queryParams);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfehler');
    }
};

// @route   POST /api/admin/actions
// @desc    Eine neue Aktion erstellen
// @access  Private (Admin, Assistenz)
exports.createAction = async (req, res) => {
    const { role, business_partner_id: user_bp_id } = req.user;
    const { layout_type, title, content_text, link_url, image_url, is_active, start_date, end_date, business_partner_id: form_bp_id } = req.body;

    // Bestimme die zu verwendende Business Partner ID basierend auf der Rolle
    const target_bp_id = (role === 'admin') ? form_bp_id : user_bp_id;

    if (!target_bp_id) {
        return res.status(400).json({ message: 'Business Partner ID fehlt.' });
    }

    try {
        const newAction = await pool.query(
            `INSERT INTO business_partner_actions 
             (business_partner_id, layout_type, title, content_text, link_url, image_url, is_active, start_date, end_date) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [target_bp_id, layout_type, title, content_text, link_url, image_url, is_active, start_date, end_date]
        );
        res.status(201).json(newAction.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfehler');
    }
};

// @route   PUT /api/admin/actions/:id
// @desc    Eine bestehende Aktion aktualisieren
// @access  Private (Admin, Assistenz)
exports.updateAction = async (req, res) => {
    const { role, business_partner_id: user_bp_id } = req.user;
    const { id } = req.params;
    const { layout_type, title, content_text, link_url, image_url, is_active, start_date, end_date, business_partner_id: form_bp_id } = req.body;

    try {
        // Überprüfen, ob die Aktion existiert und wer sie bearbeiten darf
        const actionResult = await pool.query('SELECT business_partner_id FROM business_partner_actions WHERE id = $1', [id]);
        if (actionResult.rows.length === 0) {
            return res.status(404).json({ message: 'Aktion nicht gefunden.' });
        }

        const action_bp_id = actionResult.rows[0].business_partner_id;

        // Assistenz darf nur Aktionen des eigenen BPs bearbeiten
        if (role === 'assistenz' && action_bp_id !== user_bp_id) {
            return res.status(403).json({ message: 'Zugriff verweigert.' });
        }

        // Admin kann den Business Partner ändern, Assistenz nicht.
        const target_bp_id = (role === 'admin') ? form_bp_id : action_bp_id;

        const updatedAction = await pool.query(
            `UPDATE business_partner_actions SET 
             business_partner_id = $1, layout_type = $2, title = $3, content_text = $4, link_url = $5, 
             image_url = $6, is_active = $7, start_date = $8, end_date = $9, updated_at = NOW() 
             WHERE id = $10 RETURNING *`,
            [target_bp_id, layout_type, title, content_text, link_url, image_url, is_active, start_date, end_date, id]
        );

        res.json(updatedAction.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfehler');
    }
};

// @route   DELETE /api/admin/actions/:id
// @desc    Eine Aktion löschen
// @access  Private (Admin, Assistenz)
exports.deleteAction = async (req, res) => {
    const { role, business_partner_id } = req.user;
    const { id } = req.params;

    try {
        const actionResult = await pool.query('SELECT business_partner_id FROM business_partner_actions WHERE id = $1', [id]);
        if (actionResult.rows.length === 0) {
            return res.status(404).json({ message: 'Aktion nicht gefunden.' });
        }
        
        if (role === 'assistenz' && actionResult.rows[0].business_partner_id !== business_partner_id) {
            return res.status(403).json({ message: 'Zugriff verweigert.' });
        }

        await pool.query('DELETE FROM business_partner_actions WHERE id = $1', [id]);
        res.json({ message: 'Aktion erfolgreich gelöscht.' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfehler');
    }
};
