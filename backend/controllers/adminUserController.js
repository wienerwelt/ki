// backend/controllers/adminUserController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const Papa = require('papaparse');
const { Readable } = require('stream');
const { logActivity } = require('../services/auditLogService');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);
const ASSISTANT_ALLOWED_TARGET_ROLES = new Set(['user', 'demo', 'sales_user']);

const normalizeUserEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeUsername = (value) => String(value || '').trim();
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || ''));

const findUserIdentityConflict = async ({ email, username, excludeUserId = null }) => {
    const params = [normalizeUserEmail(email), normalizeUsername(username)];
    let exclusion = '';
    if (excludeUserId) {
        params.push(excludeUserId);
        exclusion = 'AND id <> $3';
    }

    const result = await db.query(`
        SELECT id,
               lower(btrim(email)) = lower(btrim($1)) AS email_conflict,
               lower(btrim(username)) = lower(btrim($2)) AS username_conflict
        FROM users
        WHERE (lower(btrim(email)) = lower(btrim($1))
           OR lower(btrim(username)) = lower(btrim($2)))
          ${exclusion}
        LIMIT 1
    `, params);
    return result.rows[0] || null;
};

const assistantCanManageUser = (requester, user) =>
    requester.role !== 'assistenz' || (
        String(user.business_partner_id || '') === String(requester.business_partner_id || '')
        && ASSISTANT_ALLOWED_TARGET_ROLES.has(String(user.role || '').toLowerCase())
    );

const sanitizeFilename = (name) => {
    if (!name) return '';
    return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
};

const getBusinessPartnerName = async (bpId) => {
    if (!bpId) return null;
    try {
        const bpResult = await db.query('SELECT name FROM business_partners WHERE id = $1', [bpId]);
        return bpResult.rows.length > 0 ? bpResult.rows[0].name : null;
    } catch (error) {
        console.error(`Error fetching business partner name for ID ${bpId}:`, error);
        return null;
    }
};

const getMembershipLevelsForPartner = async (bpId) => {
    if (!isValidUUID(bpId)) return [];
    const result = await db.query(
        'SELECT level_1_name, level_2_name, level_3_name FROM business_partners WHERE id = $1',
        [bpId]
    );
    if (!result.rows.length) return null;
    return Array.from(new Set(Object.values(result.rows[0]).map((level) => String(level || '').trim()).filter(Boolean)));
};

const validateMembershipLevel = async (bpId, membershipLevel) => {
    const normalized = String(membershipLevel || '').trim();
    if (!normalized) return null;
    const levels = await getMembershipLevelsForPartner(bpId);
    if (levels === null) {
        const error = new Error('Mandant nicht gefunden.');
        error.statusCode = 404;
        throw error;
    }
    if (!levels.includes(normalized)) {
        const error = new Error('Bitte ein vorhandenes Mitgliedslevel dieses Mandanten auswählen.');
        error.statusCode = 400;
        throw error;
    }
    return normalized;
};

exports.getManagedMembershipLevels = async (req, res) => {
    try {
        const requestedId = String(req.query.businessPartnerId || '');
        const businessPartnerId = req.user.role === 'assistenz'
            ? req.user.business_partner_id
            : requestedId;
        if (!isValidUUID(businessPartnerId)) {
            return res.status(400).json({ message: 'Bitte einen gültigen Mandanten auswählen.' });
        }
        const levels = await getMembershipLevelsForPartner(businessPartnerId);
        if (levels === null) return res.status(404).json({ message: 'Mandant nicht gefunden.' });
        return res.json({ business_partner_id: businessPartnerId, levels });
    } catch (error) {
        console.error('Mitgliedslevel konnten nicht geladen werden:', error.message);
        return res.status(500).json({ message: 'Mitgliedslevel konnten nicht geladen werden.' });
    }
};

// Helper to format timestamp for filenames
const getFormattedTimestamp = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
};


// GET all users
// GET /api/admin/users (Erweiterte Feinsuche)
exports.getAllUsers = async (req, res) => {
    // Extrahieren der spezifischen Suchfelder aus der Query
    const { 
        business_partner_id, 
        first_name, 
        last_name, 
        email, 
        organization_name,
        search,
        limit = 50, 
        page = 1 
    } = req.query;
    
    const { role: requesterRole, business_partner_id: requesterBpId } = req.user;

    try {
        let baseQuery = `
            FROM users u
            LEFT JOIN business_partners bp ON u.business_partner_id = bp.id
        `;
        const queryParams = [];
        let whereClauses = [];
        let paramIndex = 1;

        // --- 1. MANDANTENSPEZIFISCHER SCHUTZ (Mandantenabhängigkeit) ---
        if (requesterRole === 'assistenz') {
            // Eine Assistenz darf NIEMALS die Mandantengrenze überschreiten
            whereClauses.push(`u.business_partner_id = $${paramIndex}`);
            queryParams.push(requesterBpId);
            paramIndex++;
            whereClauses.push(`u.role NOT IN ('admin', 'assistenz')`);
        } else if (requesterRole === 'admin') {
            // Admins können nach einem bestimmten Mandanten filtern oder 'all' wählen
            if (business_partner_id && business_partner_id !== 'all') {
                if (!isValidUUID(business_partner_id)) {
                    return res.status(400).json({ message: 'Ungültiges Mandanten-ID-Format.' });
                }
                whereClauses.push(`u.business_partner_id = $${paramIndex}`);
                queryParams.push(business_partner_id);
                paramIndex++;
            }
        }

        // --- 2. ERWEITERTE FEINSUCHE (Feld-spezifisch) ---
        if (first_name && first_name.trim() !== '') {
            whereClauses.push(`u.first_name ILIKE $${paramIndex}`);
            queryParams.push(`%${first_name.trim()}%`);
            paramIndex++;
        }
        if (last_name && last_name.trim() !== '') {
            whereClauses.push(`u.last_name ILIKE $${paramIndex}`);
            queryParams.push(`%${last_name.trim()}%`);
            paramIndex++;
        }
        if (email && email.trim() !== '') {
            whereClauses.push(`u.email ILIKE $${paramIndex}`);
            queryParams.push(`%${email.trim()}%`);
            paramIndex++;
        }
        if (organization_name && organization_name.trim() !== '') {
            whereClauses.push(`u.organization_name ILIKE $${paramIndex}`);
            queryParams.push(`%${organization_name.trim()}%`);
            paramIndex++;
        }
        if (search && search.trim() !== '') {
            const normalizedSearch = search.trim().slice(0, 200);
            whereClauses.push(`(
                u.username ILIKE $${paramIndex}
                OR u.first_name ILIKE $${paramIndex}
                OR u.last_name ILIKE $${paramIndex}
                OR CONCAT_WS(' ', u.first_name, u.last_name) ILIKE $${paramIndex}
                OR u.email ILIKE $${paramIndex}
                OR u.organization_name ILIKE $${paramIndex}
                OR bp.name ILIKE $${paramIndex}
            )`);
            queryParams.push(`%${normalizedSearch}%`);
            paramIndex++;
        }

        // Klauseln zusammenführen
        if (whereClauses.length > 0) {
            baseQuery += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        // Trefferanzahl für die Klammer berechnen
        const countQuery = `SELECT COUNT(*)::int AS total_count ${baseQuery}`;
        const countResult = await db.query(countQuery, queryParams);
        const totalCount = countResult.rows[0].total_count;

        // Daten-Query mit Paginierung aufbauen
        let dataQuery = `
            SELECT
                u.id, u.username, u.first_name, u.last_name, u.organization_name, u.email, 
                u.linkedin_url, u.login_count, u.membership_level,
                u.role, u.is_active, u.active_until, u.created_at, u.updated_at, u.last_login_at,
                u.profile_image_url, u.newsletter_opt_in,
                bp.name AS business_partner_name, bp.id AS business_partner_id
            ${baseQuery}
            ORDER BY u.last_name ASC, u.first_name ASC
        `;

        const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
        const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
        const offset = (parsedPage - 1) * parsedLimit;

        dataQuery += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        queryParams.push(parsedLimit, offset);

        const result = await db.query(dataQuery, queryParams);
        
        res.json({
            users: result.rows,
            total_count: totalCount
        });

    } catch (err) {
        console.error('Fehler bei der Feinsuche:', err.message);
        res.status(500).send('Serverfehler');
    }
};

// GET a single user by ID
exports.getUserById = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid User ID format.' });

    try {
        const result = await db.query(
            `SELECT
                u.id, u.username, u.first_name, u.last_name, u.organization_name, u.email, 
                u.phone, u.linkedin_url, u.login_count, u.contribution_score, u.membership_level,
                u.role, u.is_active, u.active_until, u.created_at, u.updated_at, u.last_login_at,
                u.profile_image_url, u.newsletter_opt_in,
                ARRAY(
                    SELECT ust.tag_name
                    FROM user_saved_tags ust
                    WHERE ust.user_id = u.id
                    ORDER BY ust.tag_name ASC
                ) AS tags,
                bp.name AS business_partner_name, bp.id AS business_partner_id
             FROM users u
             LEFT JOIN business_partners bp ON u.business_partner_id = bp.id
             WHERE u.id = $1`,
            [id]
        );
        if (result.rows.length === 0 || !assistantCanManageUser(req.user, result.rows[0])) {
            return res.status(404).json({ message: 'User not found.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching user by ID:', err.message);
        res.status(500).send('Server error');
    }
};

// CREATE new user
exports.createUser = async (req, res) => {
    const { 
        username, email, password, first_name, last_name, organization_name, 
        linkedin_url, profile_image_url, membership_level, role = 'user', 
        business_partner_id, is_active = true, active_until = null
    } = req.body;
    const { user: requester } = req;
    const normalizedEmail = normalizeUserEmail(email);
    const normalizedUsername = normalizeUsername(username);

    try {
        if (requester.role === 'assistenz' && !ASSISTANT_ALLOWED_TARGET_ROLES.has(String(role).toLowerCase())) {
            await logActivity({ userId: requester.id, username: requester.username, actionType: 'USER_CREATE_DENIED', status: 'failure', details: { reason: 'Assistant tried to create admin', attemptedRole: role }, ipAddress: req.ip });
            return res.status(403).json({ message: 'Mandantenassistenzen dürfen keine privilegierten Benutzerrollen vergeben.' });
        }
        
        const finalBpId = requester.role === 'assistenz' ? requester.business_partner_id : business_partner_id;

        if (!normalizedUsername || !normalizedEmail || !password) {
            return res.status(400).json({ message: 'Username, email, and password are required.' });
        }
        if (!isValidEmail(normalizedEmail)) {
            return res.status(400).json({ message: 'Bitte eine gültige E-Mail-Adresse eingeben.' });
        }
        if (finalBpId && !isValidUUID(finalBpId)) {
            return res.status(400).json({ message: 'Invalid Business Partner ID format.' });
        }
        const validatedMembershipLevel = await validateMembershipLevel(finalBpId, membership_level);

        const identityConflict = await findUserIdentityConflict({ email: normalizedEmail, username: normalizedUsername });
        if (identityConflict) {
            return res.status(409).json({
                message: identityConflict.email_conflict
                    ? 'Diese E-Mail-Adresse wird bereits verwendet.'
                    : 'Dieser Benutzername wird bereits verwendet.',
            });
        }

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        const newUserResult = await db.query(
            `INSERT INTO users (username, email, password_hash, first_name, last_name, organization_name, linkedin_url, profile_image_url, membership_level, role, business_partner_id, is_active, active_until)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
            [normalizedUsername, normalizedEmail, password_hash, first_name, last_name, organization_name, linkedin_url, profile_image_url || null, validatedMembershipLevel, role, finalBpId || null, is_active, active_until || null]
        );
        const newUserId = newUserResult.rows[0].id;

        // Default Dashboard (Gekürzt für Übersichtlichkeit, bleibt identisch)
        try {
            const defaultConfig = {
                name: 'Mein Dashboard',
                widgets: [
                    { id: 'default-bp-info', type: 'BusinessPartnerInfo' },
                    { id: 'default-user-profile', type: 'user_activity' }
                ],
                layouts: {
                    lg: [{ i: 'default-bp-info', x: 0, y: 0, w: 8, h: 8 }, { i: 'default-user-profile', x: 8, y: 0, w: 4, h: 8 }],
                    md: [{ i: 'default-bp-info', x: 0, y: 0, w: 6, h: 8 }, { i: 'default-user-profile', x: 6, y: 0, w: 4, h: 8 }],
                    sm: [{ i: 'default-bp-info', x: 0, y: 0, w: 6, h: 8 }, { i: 'default-user-profile', x: 0, y: 8, w: 6, h: 8 }]
                }
            };
            await db.query(
                `INSERT INTO dashboard_configurations (user_id, name, config, is_default) VALUES ($1, $2, $3, $4)`,
                [newUserId, 'Mein Dashboard', JSON.stringify(defaultConfig), true]
            );
        } catch (dashErr) {
            console.error('Konnte Standard-Dashboard für neuen User nicht anlegen:', dashErr.message);
        }

        const businessPartnerName = await getBusinessPartnerName(finalBpId);

        await logActivity({
            userId: requester.id, username: requester.username, actionType: 'USER_CREATE', status: 'success',
            targetId: newUserId, targetType: 'user',
            details: { createdUsername: normalizedUsername, role: role, businessPartnerName: businessPartnerName },
            ipAddress: req.ip
        });

        res.status(201).json({ id: newUserId });
    } catch (err) {
        await logActivity({ userId: requester.id, username: requester.username, actionType: 'USER_CREATE', status: 'failure', details: { error: err.message, username: username }, ipAddress: req.ip });
        console.error('Error creating user:', err.message);
        if (err.code === '23505') {
            return res.status(409).json({ message: 'User with this username or email already exists.' });
        }
        if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
        res.status(500).send('Server error');
    }
};

// UPDATE existing user
exports.updateUser = async (req, res) => {
    const { id: targetUserId } = req.params;
    const { user: requester } = req;
    const updateData = req.body;

    try {
        const targetUserResult = await db.query('SELECT * FROM users WHERE id = $1', [targetUserId]);
        if (targetUserResult.rows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const beforeUpdate = targetUserResult.rows[0];

        if (!assistantCanManageUser(requester, beforeUpdate)) {
            return res.status(403).json({ message: 'Sie dürfen diesen Benutzer nicht bearbeiten.' });
        }
        if (requester.role === 'assistenz' && !ASSISTANT_ALLOWED_TARGET_ROLES.has(String(updateData.role || '').toLowerCase())) {
            return res.status(403).json({ message: 'Mandantenassistenzen dürfen keine privilegierten Benutzerrollen vergeben.' });
        }

        updateData.email = normalizeUserEmail(updateData.email);
        updateData.username = normalizeUsername(updateData.username);
        if (!updateData.username || !isValidEmail(updateData.email)) {
            return res.status(400).json({ message: 'Bitte einen Benutzernamen und eine gültige E-Mail-Adresse eingeben.' });
        }
        const identityConflict = await findUserIdentityConflict({
            email: updateData.email,
            username: updateData.username,
            excludeUserId: targetUserId,
        });
        if (identityConflict) {
            return res.status(409).json({
                message: identityConflict.email_conflict
                    ? 'Diese E-Mail-Adresse wird bereits verwendet.'
                    : 'Dieser Benutzername wird bereits verwendet.',
            });
        }

        let password_hash = beforeUpdate.password_hash;
        if (updateData.password && updateData.password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            password_hash = await bcrypt.hash(updateData.password, salt);
        }

        const finalBpId = requester.role === 'assistenz' ? requester.business_partner_id : updateData.business_partner_id;
        const validatedMembershipLevel = await validateMembershipLevel(finalBpId, updateData.membership_level);

        await db.query(
            `UPDATE users SET
                username = $1, email = $2, password_hash = $3, first_name = $4, last_name = $5,
                organization_name = $6, linkedin_url = $7, membership_level = $8, role = $9, 
                business_partner_id = $10, is_active = $11, active_until = $12, profile_image_url = $13,
                auth_version = auth_version + CASE WHEN $15::boolean THEN 1 ELSE 0 END,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $14`,
            [
                updateData.username, updateData.email, password_hash, updateData.first_name,
                updateData.last_name, updateData.organization_name, updateData.linkedin_url,
                validatedMembershipLevel, updateData.role, finalBpId || null,
                updateData.is_active, updateData.active_until || null, updateData.profile_image_url || null,
                targetUserId,
                Boolean(updateData.password && updateData.password.trim() !== '')
            ]
        );

        const changes = {};
        const fieldsToCheck = ['username', 'email', 'first_name', 'last_name', 'organization_name', 'linkedin_url', 'membership_level', 'role', 'business_partner_id', 'is_active', 'active_until', 'profile_image_url'];
        
        for (const key of fieldsToCheck) {
            if (String(beforeUpdate[key]) !== String(updateData[key])) {
                const oldVal = beforeUpdate[key] === null ? '' : beforeUpdate[key];
                const newVal = updateData[key] === null || updateData[key] === undefined ? '' : updateData[key];
                if (String(oldVal) !== String(newVal)) {
                    changes[key] = { from: oldVal, to: newVal };
                }
            }
        }
        if (updateData.password && updateData.password.trim() !== '') {
            changes['password'] = 'updated';
        }

        if (Object.keys(changes).length > 0) {
            const businessPartnerName = await getBusinessPartnerName(finalBpId);
            await logActivity({
                userId: requester.id, username: requester.username, actionType: 'USER_UPDATE', status: 'success',
                targetId: targetUserId, targetType: 'user',
                details: { changes, businessPartnerName: businessPartnerName },
                ipAddress: req.ip
            });
        }
        res.json({ message: 'User updated successfully' });

    } catch (err) {
        await logActivity({ userId: requester.id, username: requester.username, actionType: 'USER_UPDATE', status: 'failure', targetId: targetUserId, details: { error: err.message }, ipAddress: req.ip });
        console.error('Error updating user:', err.message);
        if (err.code === '23505') {
            return res.status(409).json({ message: 'Benutzername oder E-Mail wird bereits verwendet.' });
        }
        if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
        res.status(500).send('Server error');
    }
};

// DELETE a user
exports.deleteUser = async (req, res) => {
    // Bleibt identisch (wurde hier aus Platzgründen übersprungen, füge deine aktuelle deleteUser hier ein)
    const { id: targetUserId } = req.params;
    const { user: requester } = req;
    try {
        const targetUserResult = await db.query('SELECT * FROM users WHERE id = $1', [targetUserId]);
        if (targetUserResult.rows.length === 0) return res.status(404).json({ message: 'User not found.' });
        const targetUser = targetUserResult.rows[0];
        if (!assistantCanManageUser(requester, targetUser)) return res.status(403).json({ message: 'Sie dürfen diesen Benutzer nicht löschen.' });
        const businessPartnerName = await getBusinessPartnerName(targetUser.business_partner_id);
        await db.query('DELETE FROM users WHERE id = $1', [targetUserId]);
        await logActivity({
            userId: requester.id, username: requester.username, actionType: 'USER_DELETE', status: 'success', targetId: targetUserId, targetType: 'user',
            details: { deletedUsername: targetUser.username, businessPartnerName: businessPartnerName }, ipAddress: req.ip
        });
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error('Error deleting user:', err.message);
        res.status(500).send('Server error');
    }
};


// IMPORT Users from CSV
exports.importUsersFromCSV = async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Keine Datei hochgeladen.' });
    const { user: requester } = req;
    const report = { successCount: 0, errorCount: 0, errors: [] };
    
    let fileBuffer = req.file.buffer.toString('utf-8');
    if (fileBuffer.includes('')) {
        fileBuffer = new TextDecoder('windows-1252').decode(req.file.buffer);
    }

    try {
        const readableStream = Readable.from(fileBuffer);
        const salt = await bcrypt.genSalt(10);

        Papa.parse(readableStream, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                for (const [index, rawRow] of results.data.entries()) {
                    const row = Object.fromEntries(
                        Object.entries(rawRow).map(([key, val]) => [key, typeof val === 'string' ? val.trim() : val])
                    );

                    const {
                        username, email, password, role, first_name, last_name,
                        organization_name, linkedin_url, membership_level, business_partner_name,
                        is_active, active_until
                    } = row;

                    const normalizedEmail = normalizeUserEmail(email);
                    const normalizedUsername = normalizeUsername(username);

                    if (!normalizedEmail || !isValidEmail(normalizedEmail) || !role) {
                        report.errorCount++;
                        report.errors.push(`Zeile ${index + 2}: Fehlende oder ungültige Pflichtfelder (email, role).`);
                        continue;
                    }

                    if (requester.role === 'assistenz' && !ASSISTANT_ALLOWED_TARGET_ROLES.has(String(role).toLowerCase())) {
                        report.errorCount++;
                        report.errors.push(`Zeile ${index + 2} (${email}): Mandantenassistenzen dürfen keine privilegierten Rollen vergeben.`);
                        continue;
                    }

                    let business_partner_id = null;
                    try {
                        if (requester.role === 'assistenz') {
                            business_partner_id = requester.business_partner_id;
                        } else if (requester.role === 'admin' && business_partner_name) {
                            const bpResult = await db.query('SELECT id FROM business_partners WHERE TRIM(LOWER(name)) = TRIM(LOWER($1))', [business_partner_name]);
                            if (bpResult.rows.length > 0) {
                                business_partner_id = bpResult.rows[0].id;
                            } else {
                                report.errorCount++;
                                report.errors.push(`Zeile ${index + 2} (${email}): Business Partner "${business_partner_name}" nicht gefunden.`);
                                continue;
                            }
                        }
                    } catch (bpErr) {
                        report.errorCount++;
                        report.errors.push(`Zeile ${index + 2} (${email}): DB-Fehler beim Suchen des Business Partners.`);
                        continue;
                    }

                    let validatedMembershipLevel = null;
                    try {
                        validatedMembershipLevel = await validateMembershipLevel(business_partner_id, membership_level);
                    } catch (levelError) {
                        report.errorCount++;
                        report.errors.push(`Zeile ${index + 2} (${email}): ${levelError.message}`);
                        continue;
                    }
                    
                    // Parse is_active & active_until
                    let parsedIsActive = true;
                    if (is_active !== undefined && is_active !== '') {
                        parsedIsActive = ['true', '1', 'ja', 'yes'].includes(String(is_active).toLowerCase());
                    }
                    let parsedActiveUntil = active_until ? new Date(active_until) : null;
                    if (parsedActiveUntil && isNaN(parsedActiveUntil.getTime())) parsedActiveUntil = null; // Basic Validation

                    try {
                        const userCheck = await db.query('SELECT id, password_hash, role, business_partner_id FROM users WHERE lower(btrim(email)) = $1', [normalizedEmail]);
                        
                        if (userCheck.rows.length > 0) {
                            const existingUser = userCheck.rows[0];
                            if (!assistantCanManageUser(requester, existingUser)) {
                                report.errorCount++;
                                report.errors.push(`Zeile ${index + 2} (${email}): Fremder oder privilegierter Benutzer darf nicht geändert werden.`);
                                continue;
                            }
                            let newPasswordHash = existingUser.password_hash;
                            if (password && password.trim() !== '') {
                                newPasswordHash = await bcrypt.hash(password, salt);
                            }

                            await db.query(
                                `UPDATE users SET 
                                    first_name = COALESCE(NULLIF($1, ''), first_name), 
                                    last_name = COALESCE(NULLIF($2, ''), last_name),
                                    organization_name = COALESCE(NULLIF($3, ''), organization_name),
                                    linkedin_url = COALESCE(NULLIF($4, ''), linkedin_url),
                                    membership_level = COALESCE(NULLIF($5, ''), membership_level),
                                    role = $6,
                                    business_partner_id = $7,
                                    password_hash = $8,
                                    is_active = $9,
                                    active_until = $10,
                                    auth_version = auth_version + CASE WHEN $12::boolean THEN 1 ELSE 0 END,
                                    updated_at = CURRENT_TIMESTAMP
                                 WHERE id = $11`,
                                [first_name, last_name, organization_name, linkedin_url, validatedMembershipLevel, role, business_partner_id, newPasswordHash, parsedIsActive, parsedActiveUntil, existingUser.id, Boolean(password && password.trim() !== '')]
                            );
                            report.successCount++;
                            continue;
                        }

                        if (!password || password.trim() === '') {
                            report.errorCount++;
                            report.errors.push(`Zeile ${index + 2} (${email}): Passwort ist für neue Benutzer erforderlich.`);
                            continue;
                        }

                        let finalUsername = null;
                        let isUnique = false;
                        let attempt = 0;
                        if (normalizedUsername) {
                            const check = await db.query('SELECT 1 FROM users WHERE lower(btrim(username)) = lower(btrim($1))', [normalizedUsername]);
                            if (check.rows.length === 0) { finalUsername = normalizedUsername; isUnique = true; }
                        }

                        let generatedUsernameBase = normalizedEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
                        if (generatedUsernameBase.length < 3) generatedUsernameBase = 'user';
                        let currentAttemptUsername = generatedUsernameBase;
                        
                        while (!isUnique && attempt < 10) {
                            const check = await db.query('SELECT 1 FROM users WHERE lower(btrim(username)) = lower(btrim($1))', [currentAttemptUsername]);
                            if (check.rows.length === 0) {
                                finalUsername = currentAttemptUsername;
                                isUnique = true;
                            } else {
                                attempt++;
                                currentAttemptUsername = `${generatedUsernameBase}_${Math.floor(100 + Math.random() * 900)}`;
                            }
                        }

                        if (!isUnique) {
                            report.errorCount++;
                            report.errors.push(`Zeile ${index + 2} (${email}): Konnte keinen eindeutigen Benutzernamen generieren.`);
                            continue;
                        }

                        const password_hash = await bcrypt.hash(password, salt);

                        const newUserResult = await db.query(
                            `INSERT INTO users (username, email, password_hash, first_name, last_name, organization_name, linkedin_url, membership_level, role, business_partner_id, is_active, active_until)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
                            [finalUsername, normalizedEmail, password_hash, first_name || null, last_name || null, organization_name || null, linkedin_url || null, validatedMembershipLevel, role, business_partner_id, parsedIsActive, parsedActiveUntil]
                        );
                        report.successCount++;
                    } catch (dbErr) {
                        report.errorCount++;
                        report.errors.push(`Zeile ${index + 2} (${email}): ${dbErr.message}`);
                    }
                }
                res.status(200).json(report);
            },
            error: (err) => {
                res.status(500).json({ message: 'Fehler beim Parsen der CSV.', error: err.message });
            }
        });
    } catch (err) {
        console.error('Fehler beim Importieren:', err.message);
        res.status(500).send('Serverfehler');
    }
};

exports.exportUsersToCSV = async (req, res) => {
    const { role: requesterRole, business_partner_id: requesterBpId } = req.user;
    const { business_partner_id: adminFilterBpId } = req.query;

    try {
        const query = `
            SELECT 
                u.username, u.email, '' as password, u.role, u.first_name, u.last_name, 
                u.organization_name, u.linkedin_url, u.membership_level,
                bp.name as business_partner_name, u.is_active, u.active_until
            FROM users u
            LEFT JOIN business_partners bp ON u.business_partner_id = bp.id
        `;
        
        let finalQuery = query;
        const queryParams = [];
        let businessPartnerIdForFilename = null;
        
        if (requesterRole === 'assistenz') {
            finalQuery += ` WHERE u.business_partner_id = $1 AND u.role NOT IN ('admin', 'assistenz')`;
            queryParams.push(requesterBpId);
            businessPartnerIdForFilename = requesterBpId;
        } else if (requesterRole === 'admin' && adminFilterBpId && isValidUUID(adminFilterBpId)) {
            finalQuery += ` WHERE u.business_partner_id = $1`;
            queryParams.push(adminFilterBpId);
            businessPartnerIdForFilename = adminFilterBpId;
        }
        finalQuery += ` ORDER BY u.last_name ASC, u.first_name ASC`;

        const { rows } = await db.query(finalQuery, queryParams);
        if (rows.length === 0) return res.status(404).json({ message: 'Keine Benutzer gefunden.' });
        
        const timestamp = getFormattedTimestamp();
        let partnerNameForFile = '';
        if (businessPartnerIdForFilename) {
            const bpName = await getBusinessPartnerName(businessPartnerIdForFilename);
            if (bpName) partnerNameForFile = `${sanitizeFilename(bpName)}-`;
        }
        
        const filename = `Export-Benutzer-${partnerNameForFile}${timestamp}.csv`;
        const csv = Papa.unparse(rows, {
            columns: [
                "username", "email", "password", "role", "first_name", 
                "last_name", "organization_name", "linkedin_url", 
                "membership_level", "business_partner_name", "is_active", "active_until"
            ]
        });

        res.header('Content-Type', 'text/csv');
        res.attachment(filename);
        res.send(csv);
    } catch (err) {
        console.error('Fehler Export:', err.message);
        res.status(500).send('Serverfehler');
    }
};

exports.getImportTemplate = async (req, res) => {
    const { role: requesterRole, business_partner_id: requesterBpId } = req.user;
    try {
        const headers = [
            "username", "email", "password", "role", "first_name", "last_name", 
            "organization_name", "linkedin_url", "membership_level", "business_partner_name", 
            "is_active", "active_until"
        ];
        
        let filename = 'Vorlage-Benutzerimport.csv';
        if (requesterRole === 'assistenz') {
            const bpName = await getBusinessPartnerName(requesterBpId);
            if (bpName) {
                filename = `Vorlage-Benutzerimport-${sanitizeFilename(bpName)}.csv`;
            }
        }
        
        const csv = Papa.unparse([headers]);
        res.header('Content-Type', 'text/csv');
        res.attachment(filename);
        res.send(csv);
    } catch (err) {
        res.status(500).send('Serverfehler');
    }
};


exports.removeWidgetFromUserDashboard = async (req, res) => {
    const { userId, widgetTypeKey } = req.params;

    if (!isValidUUID(userId) || !widgetTypeKey) {
        return res.status(400).json({ message: 'Invalid user ID or missing widgetTypeKey.' });
    }

    try {
        // 1. Hole ALLE Dashboards des Nutzers (KEIN "LIMIT 1" mehr!)
        const configResult = await db.query(
            'SELECT id, config FROM dashboard_configurations WHERE user_id = $1',
            [userId]
        );

        if (configResult.rows.length === 0) {
            return res.status(404).json({ message: 'Keine Dashboard-Konfiguration für diesen Nutzer gefunden.' });
        }

        let removedCount = 0;

        // 2. Gehe durch JEDES Dashboard des Nutzers
        for (const row of configResult.rows) {
            let dashboardConfig = row.config;

            // Überspringen, falls das JSON defekt ist oder keine Widgets hat
            if (!dashboardConfig || !Array.isArray(dashboardConfig.widgets)) continue;

            // Finde die IDs des zu löschenden Widget-Typs in diesem spezifischen Dashboard
            const widgetsToRemove = dashboardConfig.widgets
                .filter(w => w.type === widgetTypeKey)
                .map(w => w.id);

            // Wenn das Widget in diesem Dashboard gar nicht existiert -> nächstes Dashboard prüfen
            if (widgetsToRemove.length === 0) continue;

            // 3. Entferne das Widget aus dem "widgets" Array
            dashboardConfig.widgets = dashboardConfig.widgets.filter(w => w.type !== widgetTypeKey);

            // 4. Entferne das Widget aus allen Responsive-Layouts
            if (dashboardConfig.layouts) {
                Object.keys(dashboardConfig.layouts).forEach(breakpoint => {
                    dashboardConfig.layouts[breakpoint] = dashboardConfig.layouts[breakpoint].filter(
                        l => !widgetsToRemove.includes(l.i)
                    );
                });
            }
            
            // 4b. Fallback für ältere Configs (die nur "layout" statt "layouts" nutzen)
            if (dashboardConfig.layout) {
                 dashboardConfig.layout = dashboardConfig.layout.filter(
                     l => !widgetsToRemove.includes(l.i)
                 );
            }

            // 5. Aktualisierte Config wieder in die DB speichern
            await db.query(
                'UPDATE dashboard_configurations SET config = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [JSON.stringify(dashboardConfig), row.id]
            );
            
            removedCount++;
        }

        if (removedCount === 0) {
            return res.status(400).json({ message: 'Dieses Widget war auf keinem Dashboard des Nutzers installiert.' });
        }

        // Optionales Logging
        const { logActivity } = require('../services/auditLogService');
        await logActivity({
            userId: req.user.id,
            username: req.user.username,
            actionType: 'WIDGET_REMOVED_FROM_USER',
            status: 'success',
            targetId: userId,
            targetType: 'user',
            details: { removedWidgetType: widgetTypeKey, removedFromDashboardsCount: removedCount },
            ipAddress: req.ip
        });

        res.json({ message: `Widget erfolgreich aus ${removedCount} Dashboards des Nutzers entfernt.` });

    } catch (err) {
        console.error('Error removing widget from user dashboard:', err.message);
        res.status(500).send('Serverfehler beim Entfernen des Widgets.');
    }
};

// --- NEU: Detaillierte Statistiken für das Admin-Profil-Modal ---
exports.getUserStatistics = async (req, res) => {
    // KORREKTUR: Muss "id" heißen, da die Route '/:id/statistics' lautet!
    const { id } = req.params; 

    if (!isValidUUID(id)) {
        return res.status(400).json({ message: 'Ungültige User-ID.' });
    }

    try {
        // 1. Basis-User-Daten holen (Punkte, Datum, etc.)
        const userResult = await db.query(`
            SELECT created_at, last_login_at, contribution_score, linkedin_url, role, business_partner_id
            FROM users WHERE id = $1
        `, [id]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'User nicht gefunden.' });
        }
        const userData = userResult.rows[0];
        if (!assistantCanManageUser(req.user, userData)) {
            return res.status(404).json({ message: 'User nicht gefunden.' });
        }

        // 2. Installierte Widgets aus ALLEN Dashboards des Nutzers extrahieren
        const widgetQuery = `
            SELECT 
                wt.name AS widget_name,
                wt.type_key,
                COUNT(*) AS count
            FROM dashboard_configurations dc,
            LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(dc.config -> 'widgets') = 'array' THEN dc.config -> 'widgets' ELSE '[]'::jsonb END
            ) AS w
            JOIN widget_types wt ON (w ->> 'type') = wt.type_key
            WHERE dc.user_id = $1
            GROUP BY wt.name, wt.type_key
            ORDER BY count DESC, wt.name ASC;
        `;
        const widgetResult = await db.query(widgetQuery, [id]);

        const installedWidgets = widgetResult.rows;
        const totalWidgetsCount = installedWidgets.reduce((sum, w) => sum + Number(w.count), 0);

        res.json({
            registered_at: userData.created_at,
            last_login_at: userData.last_login_at,
            contribution_score: userData.contribution_score,
            linkedin_url: userData.linkedin_url,
            total_widgets: totalWidgetsCount,
            installed_widgets: installedWidgets
        });

    } catch (err) {
        console.error('Fehler beim Abrufen der Nutzer-Statistiken:', err.message);
        res.status(500).send('Serverfehler beim Laden der Statistiken.');
    }
};

// NEU: Entfernt ein einzelnes Widget aus der Dashboard-Config eines Users
exports.removeWidgetFromUserDashboard = async (req, res) => {
    const { id, widgetKey } = req.params;

    try {
        const targetResult = await db.query('SELECT role, business_partner_id FROM users WHERE id = $1', [id]);
        if (targetResult.rows.length === 0 || !assistantCanManageUser(req.user, targetResult.rows[0])) {
            return res.status(404).json({ message: 'Benutzer nicht gefunden oder Zugriff verweigert.' });
        }
        // 1. Hole die aktuelle Konfiguration
        const configRes = await db.query('SELECT config FROM dashboard_configurations WHERE user_id = $1', [id]);
        if (configRes.rows.length === 0) {
            return res.status(404).json({ message: 'Keine Dashboard-Konfiguration gefunden.' });
        }

        let config = configRes.rows[0].config || {};
        
        // 2. Filtere das Widget aus dem JSON-Array heraus
        if (config.widgets && Array.isArray(config.widgets)) {
            const originalLength = config.widgets.length;
            config.widgets = config.widgets.filter(w => w.type !== widgetKey);
            
            // Nur in der DB speichern, wenn sich wirklich etwas geändert hat
            if (config.widgets.length !== originalLength) {
                await db.query(
                    'UPDATE dashboard_configurations SET config = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2', 
                    [config, id]
                );
            }
        }
        
        res.json({ message: 'Widget erfolgreich aus dem Nutzer-Dashboard entfernt.' });
    } catch (err) {
        console.error('Fehler beim Entfernen des Widgets vom User-Dashboard:', err.message);
        res.status(500).json({ message: 'Interner Server-Fehler' });
    }
};
