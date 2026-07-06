const pool = require('../config/db');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const s3Client = require('../config/s3Client.js');
const { v4: uuidv4 } = require('uuid');

// UUID-Helper: akzeptiert alle RFC4122 UUID-Versionen, nicht nur v4.
const isValidUUID = (uuid) =>
    !!uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

const optionalUrlFields = ['link_url', 'image_url', 'secondary_link_url', 'secondary_image_url'];

const normalizeOptionalText = (value) => {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : null;
};

const normalizeOptionalInteger = (value, fallback = 0) => {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeInfo = (info) => {
    if (!info || typeof info !== 'object' || Array.isArray(info)) return {};

    const contact = info.contact && typeof info.contact === 'object' && !Array.isArray(info.contact)
        ? {
            name: normalizeOptionalText(info.contact.name),
            role: normalizeOptionalText(info.contact.role),
            email: normalizeOptionalText(info.contact.email),
            phone: normalizeOptionalText(info.contact.phone),
        }
        : {};

    Object.keys(contact).forEach((key) => {
        if (!contact[key]) delete contact[key];
    });

    const highlights = Array.isArray(info.highlights)
        ? info.highlights.map((item) => normalizeOptionalText(item)).filter(Boolean).slice(0, 6)
        : [];

    const normalized = {};
    if (Object.keys(contact).length > 0) normalized.contact = contact;
    if (highlights.length > 0) normalized.highlights = highlights;

    const legalNote = normalizeOptionalText(info.legalNote);
    if (legalNote) normalized.legalNote = legalNote;

    return normalized;
};

const isAllowedOptionalUrl = (value) => {
    if (!value) return true;

    // Externe Links und S3/YouTube
    if (/^https?:\/\//i.test(value)) return true;

    // Interne Assets/Routen, falls du später wieder lokale Dateien wie /actions/... nutzt.
    if (value.startsWith('/')) return true;

    // Relative Assetpfade, z. B. actions/... oder logos/...
    if (/^(actions|logos|images|static)\//i.test(value)) return true;

    return false;
};

const validateUrls = (payload) => {
    for (const field of optionalUrlFields) {
        const value = normalizeOptionalText(payload[field]);
        if (!value) continue;
        if (!isAllowedOptionalUrl(value)) {
            return `${field} muss mit http://, https:// oder einem internen Pfad wie /actions/... beginnen.`;
        }
    }
    return null;
};

const parseDateOrNull = (value) => {
    const normalized = normalizeOptionalText(value);
    if (!normalized) return null;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : normalized;
};

const normalizeActionPayload = (body, fallbackBusinessPartnerId) => {
    const payload = { ...body };
    const startDate = parseDateOrNull(payload.start_date);
    const endDate = parseDateOrNull(payload.end_date);

    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
        const error = new Error('Das End-Datum darf nicht vor dem Start-Datum liegen.');
        error.statusCode = 400;
        throw error;
    }

    const urlError = validateUrls(payload);
    if (urlError) {
        const error = new Error(urlError);
        error.statusCode = 400;
        throw error;
    }

    const requestedIsActive = payload.is_active === undefined ? true : !!payload.is_active;
    const endDateIsPast = endDate ? new Date(endDate) < new Date() : false;

    return {
        business_partner_id: fallbackBusinessPartnerId,
        layout_type: normalizeOptionalText(payload.layout_type) || 'layout_1',
        title: normalizeOptionalText(payload.title),
        content_text: normalizeOptionalText(payload.content_text),
        link_url: normalizeOptionalText(payload.link_url),
        image_url: normalizeOptionalText(payload.image_url),
        is_active: endDateIsPast ? false : requestedIsActive,
        start_date: startDate,
        end_date: endDate,
        target_widget_category: normalizeOptionalText(payload.target_widget_category),
        target_region: normalizeOptionalText(payload.target_region) || 'all',
        is_click_tracking_enabled: !!payload.is_click_tracking_enabled,
        promotion_label: normalizeOptionalText(payload.promotion_label),
        promotion_type: normalizeOptionalText(payload.promotion_type),
        cta_label: normalizeOptionalText(payload.cta_label) || 'Mehr erfahren',
        secondary_image_url: normalizeOptionalText(payload.secondary_image_url),
        secondary_link_url: normalizeOptionalText(payload.secondary_link_url),
        secondary_cta_label: normalizeOptionalText(payload.secondary_cta_label),
        priority: normalizeOptionalInteger(payload.priority, 0),
        info: normalizeInfo(payload.info),
    };
};

const deactivateExpiredActions = async () => {
    await pool.query(`
        UPDATE business_partner_actions
        SET is_active = false,
            updated_at = NOW()
        WHERE is_active = true
          AND end_date IS NOT NULL
          AND end_date < NOW()
    `);
};

const assertBusinessPartnerExists = async (businessPartnerId) => {
    const result = await pool.query(
        'SELECT id, name, is_active FROM business_partners WHERE id = $1 LIMIT 1',
        [businessPartnerId]
    );

    if (result.rows.length === 0) {
        const error = new Error('Business Partner wurde in business_partners nicht gefunden.');
        error.statusCode = 400;
        throw error;
    }

    return result.rows[0];
};


const buildInsertValues = (payload) => [
    payload.business_partner_id,
    payload.layout_type,
    payload.title,
    payload.content_text,
    payload.link_url,
    payload.image_url,
    payload.is_active,
    payload.start_date,
    payload.end_date,
    payload.target_widget_category,
    payload.target_region,
    payload.is_click_tracking_enabled,
    payload.promotion_label,
    payload.promotion_type,
    payload.cta_label,
    payload.secondary_image_url,
    payload.secondary_link_url,
    payload.secondary_cta_label,
    payload.priority,
    JSON.stringify(payload.info || {}),
];

// GET alle Aktionen mit Filterung, Suche und Sortierung
exports.getActionsForBusinessPartner = async (req, res) => {
    const { role, business_partner_id } = req.user;
    const { search, sortBy, sortOrder, businessPartnerId } = req.query;

    try {
        await deactivateExpiredActions();

        let query;
        const queryParams = [];
        let paramIndex = 1;
        const whereClauses = [];

        if (role === 'admin') {
            query = `
                SELECT a.*, bp.name as business_partner_name
                FROM business_partner_actions a
                LEFT JOIN business_partners bp ON a.business_partner_id = bp.id
            `;

            if (businessPartnerId) {
                if (!isValidUUID(businessPartnerId)) {
                    return res.status(400).json({ message: 'Ungültige Business Partner ID.' });
                }
                whereClauses.push(`a.business_partner_id = $${paramIndex}`);
                queryParams.push(businessPartnerId);
                paramIndex++;
            }

            if (search) {
                whereClauses.push(`(
                    a.title ILIKE $${paramIndex}
                    OR a.content_text ILIKE $${paramIndex}
                    OR a.promotion_label ILIKE $${paramIndex}
                    OR bp.name ILIKE $${paramIndex}
                )`);
                queryParams.push(`%${search}%`);
                paramIndex++;
            }
        } else if (role === 'assistenz' && business_partner_id) {
            query = `SELECT a.* FROM business_partner_actions a`;
            whereClauses.push(`a.business_partner_id = $${paramIndex}`);
            queryParams.push(business_partner_id);
            paramIndex++;

            if (search) {
                whereClauses.push(`(
                    a.title ILIKE $${paramIndex}
                    OR a.content_text ILIKE $${paramIndex}
                    OR a.promotion_label ILIKE $${paramIndex}
                )`);
                queryParams.push(`%${search}%`);
                paramIndex++;
            }
        } else {
            return res.status(403).json({ message: 'Unzureichende Berechtigungen oder keine Zuordnung zu einem Business Partner.' });
        }

        if (whereClauses.length > 0) {
            query += ' WHERE ' + whereClauses.join(' AND ');
        }

        const sortMap = {
            title: 'a.title',
            business_partner_name: role === 'admin' ? 'bp.name' : 'a.created_at',
            start_date: 'a.start_date',
            end_date: 'a.end_date',
            created_at: 'a.created_at',
            priority: 'a.priority',
            promotion_label: 'a.promotion_label',
        };
        const orderBy = sortMap[sortBy] || 'a.created_at';
        const orderDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';
        query += ` ORDER BY ${orderBy} ${orderDirection} NULLS LAST, a.created_at DESC`;

        const result = await pool.query(query, queryParams);
        res.json(result.rows);
    } catch (err) {
        console.error('Fehler beim Abrufen der BP-Actions:', err.message);
        res.status(500).send('Serverfehler');
    }
};

// Neue Aktion erstellen
exports.createAction = async (req, res) => {
    const { role, business_partner_id: user_bp_id } = req.user;
    const { business_partner_id: form_bp_id } = req.body;

    const target_bp_id = role === 'admin' ? form_bp_id : user_bp_id;
    if (!target_bp_id || !isValidUUID(target_bp_id)) {
        return res.status(400).json({ message: 'Business Partner ID fehlt oder ist ungültig.' });
    }

    try {
        const payload = normalizeActionPayload(req.body, target_bp_id);
        if (!payload.title) {
            return res.status(400).json({ message: 'Titel der Aktion fehlt.' });
        }

        const partner = await assertBusinessPartnerExists(target_bp_id);
        console.info('[BP-Actions] createAction', {
            role,
            business_partner_id: target_bp_id,
            business_partner_name: partner.name,
            title: payload.title,
            is_active: payload.is_active,
        });

        const newAction = await pool.query(
            `INSERT INTO business_partner_actions (
                business_partner_id, layout_type, title, content_text, link_url, image_url,
                is_active, start_date, end_date,
                target_widget_category, target_region, is_click_tracking_enabled,
                promotion_label, promotion_type, cta_label, secondary_image_url, secondary_link_url,
                secondary_cta_label, priority, info
             ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9,
                $10, $11, $12,
                $13, $14, $15, $16, $17,
                $18, $19, $20::jsonb
             ) RETURNING *`,
            buildInsertValues(payload)
        );
        res.status(201).json(newAction.rows[0]);
    } catch (err) {
        console.error('Fehler beim Erstellen der BP-Action:', { message: err.message, detail: err.detail, code: err.code, stack: err.stack });
        res.status(err.statusCode || 500).json({ message: err.statusCode ? err.message : 'Serverfehler' });
    }
};

// Bestehende Aktion bearbeiten
exports.updateAction = async (req, res) => {
    const { role, business_partner_id: user_bp_id } = req.user;
    const { id } = req.params;
    const { business_partner_id: form_bp_id } = req.body;

    try {
        const actionCheck = await pool.query('SELECT business_partner_id FROM business_partner_actions WHERE id = $1', [id]);
        if (actionCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Aktion nicht gefunden.' });
        }

        if (role === 'assistenz' && actionCheck.rows[0].business_partner_id !== user_bp_id) {
            return res.status(403).json({ message: 'Zugriff verweigert. Sie können nur Aktionen Ihres eigenen Mandanten bearbeiten.' });
        }

        const target_bp_id = role === 'admin' ? form_bp_id : user_bp_id;
        if (!target_bp_id || !isValidUUID(target_bp_id)) {
            return res.status(400).json({ message: 'Business Partner ID fehlt oder ist ungültig.' });
        }

        const payload = normalizeActionPayload(req.body, target_bp_id);
        if (!payload.title) {
            return res.status(400).json({ message: 'Titel der Aktion fehlt.' });
        }

        await assertBusinessPartnerExists(target_bp_id);

        const updatedAction = await pool.query(
            `UPDATE business_partner_actions SET
                business_partner_id = $1,
                layout_type = $2,
                title = $3,
                content_text = $4,
                link_url = $5,
                image_url = $6,
                is_active = $7,
                start_date = $8,
                end_date = $9,
                target_widget_category = $10,
                target_region = $11,
                is_click_tracking_enabled = $12,
                promotion_label = $13,
                promotion_type = $14,
                cta_label = $15,
                secondary_image_url = $16,
                secondary_link_url = $17,
                secondary_cta_label = $18,
                priority = $19,
                info = $20::jsonb,
                updated_at = NOW()
             WHERE id = $21 RETURNING *`,
            [...buildInsertValues(payload), id]
        );
        res.json(updatedAction.rows[0]);
    } catch (err) {
        console.error('Fehler beim Aktualisieren der BP-Action:', { message: err.message, detail: err.detail, code: err.code, stack: err.stack });
        res.status(err.statusCode || 500).json({ message: err.statusCode ? err.message : 'Serverfehler' });
    }
};

// Aktion löschen
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
        console.error('Fehler beim Löschen der BP-Action:', err.message);
        res.status(500).send('Serverfehler');
    }
};

// Datei-Upload direkt in den AWS S3 Bucket
exports.uploadActionImage = async (req, res) => {
    if (!req.file) {
        return res.status(400).send({ message: 'Bitte wählen Sie eine Datei aus.' });
    }
    const file = req.file;

    try {
        const fileExtension = file.originalname.split('.').pop() || '';
        const uniqueFileName = `${uuidv4()}${fileExtension ? '.' + fileExtension : ''}`;
        const rawPartnerId = req.body.businessPartnerId;
        const safePartnerSegment = isValidUUID(rawPartnerId) ? rawPartnerId : 'global';
        const storagePath = `actions/${safePartnerSegment}/${uniqueFileName}`;

        const params = {
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: storagePath,
            Body: file.buffer,
            ContentType: file.mimetype,
        };

        await s3Client.send(new PutObjectCommand(params));
        const publicUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${storagePath}`;

        res.status(200).json({
            message: 'Datei erfolgreich hochgeladen',
            filePath: publicUrl,
        });
    } catch (err) {
        console.error('Fehler bei der S3-Dateiverarbeitung:', err);
        res.status(500).json({ message: 'Fehler bei der Dateiverarbeitung.' });
    }
};

// Dupliziert eine Aktion und übernimmt alle Kampagnenfelder sauber mit.
exports.copyAction = async (req, res) => {
    const { role, business_partner_id } = req.user;
    const { id } = req.params;

    try {
        const originalActionRes = await pool.query('SELECT * FROM business_partner_actions WHERE id = $1', [id]);
        if (originalActionRes.rows.length === 0) {
            return res.status(404).json({ message: 'Originalaktion nicht gefunden.' });
        }

        const original = originalActionRes.rows[0];
        if (role === 'assistenz' && original.business_partner_id !== business_partner_id) {
            return res.status(403).json({ message: 'Zugriff verweigert.' });
        }

        const newAction = await pool.query(
            `INSERT INTO business_partner_actions (
                business_partner_id, layout_type, title, content_text, link_url, image_url,
                is_active, start_date, end_date,
                target_widget_category, target_region, is_click_tracking_enabled,
                promotion_label, promotion_type, cta_label, secondary_image_url, secondary_link_url,
                secondary_cta_label, priority, info
             ) VALUES (
                $1, $2, $3, $4, $5, $6,
                false, $7, $8,
                $9, $10, $11,
                $12, $13, $14, $15, $16,
                $17, $18, $19::jsonb
             ) RETURNING *`,
            [
                original.business_partner_id,
                original.layout_type,
                `Kopie von: ${original.title}`,
                original.content_text,
                original.link_url,
                original.image_url,
                original.start_date,
                original.end_date,
                original.target_widget_category,
                original.target_region,
                original.is_click_tracking_enabled,
                original.promotion_label,
                original.promotion_type,
                original.cta_label || 'Mehr erfahren',
                original.secondary_image_url,
                original.secondary_link_url,
                original.secondary_cta_label,
                original.priority || 0,
                JSON.stringify(original.info || {}),
            ]
        );
        res.status(201).json(newAction.rows[0]);
    } catch (err) {
        console.error('Fehler beim Kopieren der Aktion:', err.message);
        res.status(500).send('Serverfehler');
    }
};
