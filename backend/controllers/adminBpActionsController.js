const pool = require('../config/db');
const fs = require('fs');   // NEU
const path = require('path'); // NEU

// Ihre bestehende Funktion "getActionsForBusinessPartner"
exports.getActionsForBusinessPartner = async (req, res) => {
    const { role, business_partner_id } = req.user;
    const { search, sortBy, sortOrder } = req.query;
    try {
        let query;
        let queryParams = [];
        let paramIndex = 1;
        let baseQueryAdmin = `SELECT a.*, bp.name as business_partner_name FROM business_partner_actions a LEFT JOIN business_partners bp ON a.business_partner_id = bp.id`;
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

// Ihre bestehende Funktion "createAction"
exports.createAction = async (req, res) => {
    const { role, business_partner_id: user_bp_id } = req.user;
    const { layout_type, title, content_text, link_url, image_url, is_active, start_date, end_date, business_partner_id: form_bp_id } = req.body;
    const target_bp_id = (role === 'admin') ? form_bp_id : user_bp_id;
    if (!target_bp_id) {
        return res.status(400).json({ message: 'Business Partner ID fehlt.' });
    }
    try {
        const newAction = await pool.query(
            `INSERT INTO business_partner_actions (business_partner_id, layout_type, title, content_text, link_url, image_url, is_active, start_date, end_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [target_bp_id, layout_type, title, content_text, link_url, image_url, is_active, start_date, end_date]
        );
        res.status(201).json(newAction.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfehler');
    }
};

// Ihre bestehende Funktion "updateAction"
exports.updateAction = async (req, res) => {
    const { role, business_partner_id: user_bp_id } = req.user;
    const { id } = req.params;
    const { layout_type, title, content_text, link_url, image_url, is_active, start_date, end_date, business_partner_id: form_bp_id } = req.body;
    try {
        const actionResult = await pool.query('SELECT business_partner_id FROM business_partner_actions WHERE id = $1', [id]);
        if (actionResult.rows.length === 0) {
            return res.status(404).json({ message: 'Aktion nicht gefunden.' });
        }
        const action_bp_id = actionResult.rows[0].business_partner_id;
        if (role === 'assistenz' && action_bp_id !== user_bp_id) {
            return res.status(403).json({ message: 'Zugriff verweigert.' });
        }
        const target_bp_id = (role === 'admin') ? form_bp_id : action_bp_id;
        const updatedAction = await pool.query(
            `UPDATE business_partner_actions SET business_partner_id = $1, layout_type = $2, title = $3, content_text = $4, link_url = $5, image_url = $6, is_active = $7, start_date = $8, end_date = $9, updated_at = NOW() WHERE id = $10 RETURNING *`,
            [target_bp_id, layout_type, title, content_text, link_url, image_url, is_active, start_date, end_date, id]
        );
        res.json(updatedAction.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfehler');
    }
};

// Ihre bestehende Funktion "deleteAction"
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

// --- NEU: Funktionen für Upload, Bild-Liste und Kopieren ---

exports.uploadActionImage = (req, res) => {
    if (!req.file) {
        return res.status(400).send({ message: 'Bitte wählen Sie eine Datei aus.' });
    }

    try {
        const tempPath = req.file.path;

        // Eindeutigen Dateinamen aus den Body-Daten erstellen, die hier zuverlässig verfügbar sind.
        const bpName = (req.body.businessPartnerName || 'global').replace(/\s+/g, '-').toLowerCase();
        const startDate = req.body.startDate ? new Date(req.body.startDate).toISOString().split('T')[0] : 'anytime';
        const originalName = path.parse(req.file.originalname).name.replace(/\s+/g, '-');
        const uniqueSuffix = Date.now();
        const newFilename = `${bpName}_${startDate}_${originalName}_${uniqueSuffix}${path.extname(req.file.originalname)}`;
        
        const newPath = path.join(path.dirname(tempPath), newFilename);

        // Datei umbenennen
        fs.renameSync(tempPath, newPath);

        const publicFilePath = `/public/actions/${newFilename}`;

        res.status(200).json({ message: 'Datei erfolgreich hochgeladen', filePath: publicFilePath });

    } catch (err) {
        console.error("Fehler bei der Dateiverarbeitung:", err);
        // Aufräumen: Wenn die Umbenennung fehlschlägt, die temporäre Datei löschen
        if (req.file && req.file.path) {
            fs.unlink(req.file.path, (unlinkErr) => {
                if(unlinkErr) console.error("Fehler beim Löschen der temporären Datei:", unlinkErr);
            });
        }
        res.status(500).json({ message: 'Fehler bei der Dateiverarbeitung.' });
    }
};

// KORRIGIERT: Die Funktion zum Auflisten der Bilder verwendet jetzt den korrekten Pfad.
exports.getUploadedImages = (req, res) => {
    const directoryPath = path.join(__dirname, '..', '..', 'frontend', 'public', 'actions');
    fs.readdir(directoryPath, function (err, files) {
        if (err) {
            // Wenn das Verzeichnis nicht existiert, eine leere Liste zurückgeben, anstatt einen Fehler zu werfen.
            if (err.code === 'ENOENT') {
                return res.json([]);
            }
            console.error("Fehler beim Lesen des Bilderverzeichnisses:", err);
            return res.status(500).send('Bilder konnten nicht geladen werden.');
        }
        const imageFiles = files
            .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
            .map(file => `/public/actions/${file}`)
            .reverse();
        res.json(imageFiles);
    });
};

exports.copyAction = async (req, res) => {
    const { id } = req.params;
    try {
        const originalActionRes = await pool.query('SELECT * FROM business_partner_actions WHERE id = $1', [id]);
        if (originalActionRes.rows.length === 0) {
            return res.status(404).json({ message: 'Originalaktion nicht gefunden.' });
        }
        const original = originalActionRes.rows[0];
        const newTitle = `Kopie von: ${original.title}`;
        const newAction = await pool.query(
            `INSERT INTO business_partner_actions (business_partner_id, layout_type, title, content_text, link_url, image_url, is_active, start_date, end_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [original.business_partner_id, original.layout_type, newTitle, original.content_text, original.link_url, original.image_url, false, original.start_date, original.end_date]
        );
        res.status(201).json(newAction.rows[0]);
    } catch (err) {
        console.error('Fehler beim Kopieren der Aktion:', err.message);
        res.status(500).send('Serverfehler');
    }
};
