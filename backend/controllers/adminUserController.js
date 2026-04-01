// backend/controllers/adminUserController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const Papa = require('papaparse');
const { Readable } = require('stream');
const { logActivity } = require('../services/auditLogService');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

const sanitizeFilename = (name) => {
    if (!name) return '';
    // Ersetzt alle ungültigen Zeichen (alles außer A-Z, 0-9) durch einen Unterstrich
    return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
};

// Helper function to get BP name
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
exports.getAllUsers = async (req, res) => {
    const { business_partner_id } = req.query;
    const { role: requesterRole, business_partner_id: requesterBpId } = req.user;

    try {
        let query = `
            SELECT
                u.id, u.username, u.first_name, u.last_name, u.organization_name, u.email, 
                u.linkedin_url, u.login_count, u.membership_level,
                u.role, u.is_active, u.created_at, u.updated_at, u.last_login_at,
                u.profile_image_url, u.newsletter_opt_in,  -- <--- HIER EINGEFÜGT
                bp.name AS business_partner_name, bp.id AS business_partner_id
            FROM users u
            LEFT JOIN business_partners bp ON u.business_partner_id = bp.id
        `;
        const queryParams = [];
        let whereClauses = [];

        if (requesterRole === 'assistenz') {
            whereClauses.push(`u.business_partner_id = $1`);
            queryParams.push(requesterBpId);
            whereClauses.push(`u.role != 'admin'`);
        } else if (requesterRole === 'admin' && business_partner_id) {
            if (!isValidUUID(business_partner_id)) {
                return res.status(400).json({ message: 'Invalid business_partner_id format.' });
            }
            whereClauses.push(`u.business_partner_id = $1`);
            queryParams.push(business_partner_id);
        }

        if (whereClauses.length > 0) {
            query += ` WHERE ${whereClauses.join(' AND ')}`;
        }
        query += ` ORDER BY u.last_name ASC, u.first_name ASC`;

        const result = await db.query(query, queryParams);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching all users:', err.message);
        res.status(500).send('Server error');
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
                u.linkedin_url, u.login_count, u.membership_level,
                u.role, u.is_active, u.created_at, u.updated_at, u.last_login_at,
                u.profile_image_url, u.newsletter_opt_in,  -- <--- HIER EINGEFÜGT
                bp.name AS business_partner_name, bp.id AS business_partner_id
             FROM users u
             LEFT JOIN business_partners bp ON u.business_partner_id = bp.id
             WHERE u.id = $1`,
            [id]
        );
        if (result.rows.length === 0) {
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
        business_partner_id, is_active = true 
    } = req.body;
    const { user: requester } = req;

    try {
        // 1. Rechteprüfung für Assistenten
        if (requester.role === 'assistenz' && role === 'admin') {
            await logActivity({ userId: requester.id, username: requester.username, actionType: 'USER_CREATE_DENIED', status: 'failure', details: { reason: 'Assistant tried to create admin', attemptedRole: role }, ipAddress: req.ip });
            return res.status(403).json({ message: 'Permission denied: Assistants cannot create admin users.' });
        }
        
        const finalBpId = requester.role === 'assistenz' ? requester.business_partner_id : business_partner_id;

        if (!username || !email || !password) {
            return res.status(400).json({ message: 'Username, email, and password are required.' });
        }
        if (finalBpId && !isValidUUID(finalBpId)) {
            return res.status(400).json({ message: 'Invalid Business Partner ID format.' });
        }

        // 2. Passwort hashen
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        // 3. User erstellen
        const newUserResult = await db.query(
            `INSERT INTO users (username, email, password_hash, first_name, last_name, organization_name, linkedin_url, profile_image_url, membership_level, role, business_partner_id, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
            [username, email, password_hash, first_name, last_name, organization_name, linkedin_url, profile_image_url || null, membership_level, role, finalBpId || null, is_active]
        );
        const newUserId = newUserResult.rows[0].id;

        // --- 4. NEU: DEFAULT DASHBOARD ERSTELLEN ---
        try {
            const defaultConfig = {
                name: 'Mein Dashboard',
                widgets: [
                    { id: 'default-bp-info', type: 'BusinessPartnerInfo' },
                    { id: 'default-user-profile', type: 'user_activity' } // 'user_activity' ist der DB-Type-Key für das Profil-Widget
                ],
                layouts: {
                    lg: [
                        { i: 'default-bp-info', x: 0, y: 0, w: 8, h: 8 },
                        { i: 'default-user-profile', x: 8, y: 0, w: 4, h: 8 }
                    ],
                    md: [
                        { i: 'default-bp-info', x: 0, y: 0, w: 6, h: 8 },
                        { i: 'default-user-profile', x: 6, y: 0, w: 4, h: 8 }
                    ],
                    sm: [
                        { i: 'default-bp-info', x: 0, y: 0, w: 6, h: 8 },
                        { i: 'default-user-profile', x: 0, y: 8, w: 6, h: 8 }
                    ]
                }
            };

            await db.query(
                `INSERT INTO dashboard_configurations (user_id, name, config, is_default) 
                 VALUES ($1, $2, $3, $4)`,
                [newUserId, 'Mein Dashboard', JSON.stringify(defaultConfig), true]
            );
        } catch (dashErr) {
            console.error('Konnte Standard-Dashboard für neuen User nicht anlegen:', dashErr.message);
        }
        // ---------------------------------------------------

        // 5. Logging & Response
        const businessPartnerName = await getBusinessPartnerName(finalBpId);

        await logActivity({
            userId: requester.id,
            username: requester.username,
            actionType: 'USER_CREATE',
            status: 'success',
            targetId: newUserId,
            targetType: 'user',
            details: { 
                createdUsername: username, 
                role: role,
                businessPartnerName: businessPartnerName 
            },
            ipAddress: req.ip
        });

        res.status(201).json({ id: newUserId });
    } catch (err) {
        await logActivity({ userId: requester.id, username: requester.username, actionType: 'USER_CREATE', status: 'failure', details: { error: err.message, username: username }, ipAddress: req.ip });
        console.error('Error creating user:', err.message);
        if (err.code === '23505') {
            return res.status(409).json({ message: 'User with this username or email already exists.' });
        }
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

        if (requester.role === 'assistenz') {
            if (beforeUpdate.role === 'admin' || updateData.role === 'admin') {
                return res.status(403).json({ message: 'Permission denied to edit admin users or assign admin role.' });
            }
            if (beforeUpdate.business_partner_id !== requester.business_partner_id) {
                return res.status(403).json({ message: 'Permission denied: You can only edit users within your own business partner.' });
            }
        }

        let password_hash = beforeUpdate.password_hash;
        if (updateData.password && updateData.password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            password_hash = await bcrypt.hash(updateData.password, salt);
        }

        const finalBpId = requester.role === 'assistenz' ? requester.business_partner_id : updateData.business_partner_id;

        await db.query(
            `UPDATE users SET
                username = $1, 
                email = $2, 
                password_hash = $3, 
                first_name = $4, 
                last_name = $5,
                organization_name = $6, 
                linkedin_url = $7, 
                membership_level = $8, 
                role = $9, 
                business_partner_id = $10, 
                is_active = $11, 
                profile_image_url = $12,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $13`,
            [
                updateData.username,
                updateData.email,
                password_hash,
                updateData.first_name,
                updateData.last_name,
                updateData.organization_name,
                updateData.linkedin_url,
                updateData.membership_level,
                updateData.role,
                finalBpId || null,
                updateData.is_active,
                updateData.profile_image_url || null,
                targetUserId
            ]
        );

        const changes = {};
        const fieldsToCheck = ['username', 'email', 'first_name', 'last_name', 'organization_name', 'linkedin_url', 'membership_level', 'role', 'business_partner_id', 'is_active', 'profile_image_url'];
        
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
                userId: requester.id,
                username: requester.username,
                actionType: 'USER_UPDATE',
                status: 'success',
                targetId: targetUserId,
                targetType: 'user',
                details: { 
                    changes,
                    businessPartnerName: businessPartnerName
                },
                ipAddress: req.ip
            });
        }

        res.json({ message: 'User updated successfully' });

    } catch (err) {
        await logActivity({ 
            userId: requester.id, 
            username: requester.username, 
            actionType: 'USER_UPDATE', 
            status: 'failure', 
            targetId: targetUserId, 
            details: { error: err.message }, 
            ipAddress: req.ip 
        });
        console.error('Error updating user:', err.message);
        
        if (err.code === '23505') {
            return res.status(409).json({ message: 'Benutzername oder E-Mail wird bereits verwendet.' });
        }

        res.status(500).send('Server error');
    }
};

// DELETE a user
exports.deleteUser = async (req, res) => {
    const { id: targetUserId } = req.params;
    const { user: requester } = req;

    try {
        const targetUserResult = await db.query('SELECT * FROM users WHERE id = $1', [targetUserId]);
        if (targetUserResult.rows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const targetUser = targetUserResult.rows[0];

        if (requester.role === 'assistenz' && targetUser.role === 'admin') {
            return res.status(403).json({ message: 'Permission denied to delete admin users.' });
        }
        if (requester.role === 'assistenz' && targetUser.business_partner_id !== requester.business_partner_id) {
            return res.status(403).json({ message: 'Permission denied: You can only delete users within your own business partner.' });
        }

        const businessPartnerName = await getBusinessPartnerName(targetUser.business_partner_id);
        await db.query('DELETE FROM users WHERE id = $1', [targetUserId]);

        await logActivity({
            userId: requester.id,
            username: requester.username,
            actionType: 'USER_DELETE',
            status: 'success',
            targetId: targetUserId,
            targetType: 'user',
            details: { 
                deletedUsername: targetUser.username,
                businessPartnerName: businessPartnerName
            },
            ipAddress: req.ip
        });

        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        await logActivity({ userId: requester.id, username: requester.username, actionType: 'USER_DELETE', status: 'failure', targetId: targetUserId, details: { error: err.message }, ipAddress: req.ip });
        console.error('Error deleting user:', err.message);
        res.status(500).send('Server error');
    }
};


// IMPORT Users from CSV (VERSION MIT "INSERT ONLY", KEIN UPDATE)
exports.importUsersFromCSV = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Keine Datei hochgeladen.' });
    }

    const { user: requester } = req;
    const report = { successCount: 0, errorCount: 0, errors: [] };
    const fileBuffer = req.file.buffer.toString('utf-8');

    try {
        const readableStream = Readable.from(fileBuffer);
        const salt = await bcrypt.genSalt(10);

        Papa.parse(readableStream, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                for (const [index, row] of results.data.entries()) {
                    const {
                        username,
                        email, password, role, first_name, last_name,
                        organization_name, linkedin_url, membership_level, business_partner_name
                    } = row;

                    // E-Mail und Rolle sind immer erforderlich
                    if (!email || !role) {
                        report.errorCount++;
                        report.errors.push(`Zeile ${index + 2}: Fehlende Pflichtfelder (email, role).`);
                        continue;
                    }

                    // --- START: Rechteprüfung (unverändert) ---
                    if (requester.role === 'assistenz' && role === 'admin') {
                        report.errorCount++;
                        report.errors.push(`Zeile ${index + 2} (${email}): Assistenten dürfen keine Admin-Benutzer erstellen.`);
                        await logActivity({ userId: requester.id, username: requester.username, actionType: 'USER_IMPORT_DENIED', status: 'failure', details: { reason: 'Assistant tried to import admin', attemptedEmail: email }, ipAddress: req.ip });
                        continue;
                    }
                    // --- ENDE: Rechteprüfung ---

                    // --- START: Business Partner ID auflösen (unverändert) ---
                    let business_partner_id = null;
                    try {
                        if (requester.role === 'assistenz') {
                            business_partner_id = requester.business_partner_id;
                        } else if (requester.role === 'admin' && business_partner_name) {
                            const bpResult = await db.query('SELECT id FROM business_partners WHERE name = $1', [business_partner_name]);
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
                        report.errors.push(`Zeile ${index + 2} (${email}): DB-Fehler beim Suchen des Business Partners. ${bpErr.message}`);
                        continue;
                    }
                    // --- ENDE: Business Partner ID auflösen ---

                    // --- START: "INSERT"-LOGIK (KEIN UPDATE) ---
                    try {
                        // ===== PRÜFUNG: BENUTZER EXISTIERT BEREITS (SKIP) =====
                        const userCheck = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
                        if (userCheck.rows.length > 0) {
                            report.errorCount++;
                            report.errors.push(`Zeile ${index + 2} (${email}): E-Mail existiert bereits. Übersprungen.`);
                            continue; // Nächste Zeile
                        }

                        // ===== FALL: NEUER BENUTZER (INSERT) =====
                        
                        // Passwort ist für NEUE Benutzer ein Pflichtfeld
                        if (!password || password.trim() === '') {
                            report.errorCount++;
                            report.errors.push(`Zeile ${index + 2} (${email}): Passwort ist für neue Benutzer erforderlich.`);
                            continue;
                        }

                        // --- Hybride Benutzernamen-Logik (unverändert) ---
                        let finalUsername = null;
                        let isUnique = false;
                        let attempt = 0;
                        let usernameCheckError = null;

                        // 1. Prüfe, ob ein gültiger, freier Username in der CSV-Datei steht
                        if (username && typeof username === 'string' && username.trim() !== '') {
                            const cleanUsername = username.trim();
                            try {
                                const userCheck = await db.query('SELECT 1 FROM users WHERE username = $1', [cleanUsername]);
                                if (userCheck.rows.length === 0) {
                                    finalUsername = cleanUsername;
                                    isUnique = true;
                                }
                            } catch (dbErr) {
                                usernameCheckError = dbErr.message;
                            }
                        }

                        // 2. Fallback: Generiere Username aus E-Mail
                        let generatedUsernameBase = '';
                        if (!isUnique && !usernameCheckError) {
                            generatedUsernameBase = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
                            if (generatedUsernameBase.length < 3) generatedUsernameBase = 'user';
                            
                            let currentAttemptUsername = generatedUsernameBase;

                            while (!isUnique && attempt < 10) {
                                try {
                                    const userCheck = await db.query('SELECT 1 FROM users WHERE username = $1', [currentAttemptUsername]);
                                    if (userCheck.rows.length === 0) {
                                        finalUsername = currentAttemptUsername;
                                        isUnique = true;
                                    } else {
                                        attempt++;
                                        currentAttemptUsername = `${generatedUsernameBase}_${Math.floor(100 + Math.random() * 900)}`;
                                    }
                                } catch (dbErr) {
                                    usernameCheckError = dbErr.message;
                                    break;
                                }
                            }
                        }

                        // 3. Finale Prüfung (unverändert)
                        if (!isUnique) {
                            report.errorCount++;
                            let reason = `Konnte keinen eindeutigen Benutzernamen finden.`;
                            if (usernameCheckError) {
                                reason = `DB-Fehler (${usernameCheckError}).`;
                            } else if (username && username.trim() !== '') {
                                reason = `Der angegebene Username "${username.trim()}" ist bereits vergeben und es konnte kein Fallback generiert werden.`;
                            } else {
                                reason = `Konnte keinen eindeutigen Benutzernamen aus der E-Mail generieren (Basis: ${generatedUsernameBase}).`;
                            }
                            report.errors.push(`Zeile ${index + 2} (${email}): ${reason}`);
                            continue;
                        }
                        // --- ENDE: Hybride Benutzernamen-Logik ---

                        const password_hash = await bcrypt.hash(password, salt);

                        const newUserResult = await db.query(
                            `INSERT INTO users (username, email, password_hash, first_name, last_name, organization_name, linkedin_url, membership_level, role, business_partner_id, is_active)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
                            [finalUsername, email, password_hash, first_name || null, last_name || null, organization_name || null, linkedin_url || null, membership_level || null, role, business_partner_id, true]
                        );
                        
                        // --- NEU: Standard-Dashboard auch beim Import anlegen ---
                        try {
                            const newUserId = newUserResult.rows[0].id;
                            const defaultConfig = {
                                name: 'Mein Dashboard',
                                widgets: [
                                    { id: 'default-bp-info', type: 'BusinessPartnerInfo' },
                                    { id: 'default-user-profile', type: 'user_activity' }
                                ],
                                layouts: {
                                    lg: [
                                        { i: 'default-bp-info', x: 0, y: 0, w: 8, h: 8 },
                                        { i: 'default-user-profile', x: 8, y: 0, w: 4, h: 8 }
                                    ],
                                    md: [
                                        { i: 'default-bp-info', x: 0, y: 0, w: 6, h: 8 },
                                        { i: 'default-user-profile', x: 6, y: 0, w: 4, h: 8 }
                                    ],
                                    sm: [
                                        { i: 'default-bp-info', x: 0, y: 0, w: 6, h: 8 },
                                        { i: 'default-user-profile', x: 0, y: 8, w: 6, h: 8 }
                                    ]
                                }
                            };

                            await db.query(
                                `INSERT INTO dashboard_configurations (user_id, name, config, is_default) 
                                 VALUES ($1, $2, $3, $4)`,
                                [newUserId, 'Mein Dashboard', JSON.stringify(defaultConfig), true]
                            );
                        } catch (dashErr) {
                            // Fehler beim Dashboard soll den User-Import nicht als "Fehlgeschlagen" markieren
                            console.error(`Konnte Standard-Dashboard für importierten User (${email}) nicht anlegen:`, dashErr.message);
                        }
                        // -----------------------------------------------------

                        report.successCount++;
                        const bpNameForLog = await getBusinessPartnerName(business_partner_id);
                        await logActivity({
                            userId: requester.id, username: requester.username,
                            actionType: 'USER_IMPORT', status: 'success',
                            targetId: newUserResult.rows[0].id, targetType: 'user',
                            details: { importedUsername: finalUsername, source: 'csv', businessPartnerName: bpNameForLog },
                            ipAddress: req.ip
                        });

                    // --- ENDE: "INSERT"-LOGIK ---

                    } catch (dbErr) {
                        report.errorCount++;
                        // HINWEIS: Dieser Fehler fängt jetzt nur noch den INSERT-Fehler ab (z.B. falls der (seltene) Fall eintritt, dass der Username *genau* zwischen Check und Insert erstellt wurde)
                        const errorMessage = dbErr.code === '23505' ? 'E-Mail (oder Benutzername) existiert bereits (Timing-Fehler).' : dbErr.message;
                        report.errors.push(`Zeile ${index + 2} (${email}): ${errorMessage}`);
                        await logActivity({ userId: requester.id, username: requester.username, actionType: 'USER_IMPORT', status: 'failure', details: { error: errorMessage, email: email, source: 'csv' }, ipAddress: req.ip });
                    }
                }
                res.status(200).json(report);
            },
            error: (err) => {
                res.status(500).json({ message: 'Fehler beim Parsen der CSV-Datei.', error: err.message });
            }
        });
    } catch (err) {
        console.error('Fehler beim Importieren der Benutzer:', err.message);
        res.status(500).send('Serverfehler');
    }
};


exports.exportUsersToCSV = async (req, res) => {
    const { role: requesterRole, business_partner_id: requesterBpId } = req.user;
    
    // WICHTIG: Wir müssen auch den Query-Parameter prüfen,
    // falls ein Admin nach einem Partner filtert.
    const { business_partner_id: adminFilterBpId } = req.query;

    try {
        const query = `
            SELECT 
                u.username, 
                u.email,
                '' as password, -- Empty password for security
                u.role, 
                u.first_name, 
                u.last_name, 
                u.organization_name, 
                u.linkedin_url, 
                u.membership_level,
                bp.name as business_partner_name
            FROM users u
            LEFT JOIN business_partners bp ON u.business_partner_id = bp.id
        `;
        
        let finalQuery = query;
        const queryParams = [];
        let businessPartnerIdForFilename = null;
        
        if (requesterRole === 'assistenz') {
            // REGEL 3: Assistent ist immer auf eigenen BP gefiltert
            finalQuery += ` WHERE u.business_partner_id = $1 AND u.role != 'admin'`;
            queryParams.push(requesterBpId);
            businessPartnerIdForFilename = requesterBpId; // Für Dateinamen verwenden

        } else if (requesterRole === 'admin' && adminFilterBpId && isValidUUID(adminFilterBpId)) {
            // REGEL 2: Admin filtert nach einem bestimmten BP
            finalQuery += ` WHERE u.business_partner_id = $1`;
            queryParams.push(adminFilterBpId);
            businessPartnerIdForFilename = adminFilterBpId; // Für Dateinamen verwenden
        }
        // REGEL 1: Admin exportiert alle (keine WHERE-Klausel, businessPartnerIdForFilename bleibt null)
        
        finalQuery += ` ORDER BY u.last_name ASC, u.first_name ASC`;

        const { rows } = await db.query(finalQuery, queryParams);
        
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Keine Benutzer zum Exportieren gefunden.' });
        }
        
        const timestamp = getFormattedTimestamp(); // Holt 'YYYY-MM-DD_HH-mm-ss'
        let partnerNameForFile = '';

        // Wenn eine ID (Regel 2 oder 3) gesetzt ist, holen wir den Namen
        if (businessPartnerIdForFilename) {
            try {
                const bpName = await getBusinessPartnerName(businessPartnerIdForFilename);
                if (bpName) {
                    partnerNameForFile = `${sanitizeFilename(bpName)}-`; // z.B. "mein_partner-"
                }
            } catch (e) {
                console.warn("Konnte BP-Namen für Export-Dateinamen nicht abrufen:", e.message);
            }
        }
        
        // Dateinamen dynamisch zusammensetzen
        const filename = `Export-Benutzer-${partnerNameForFile}${timestamp}.csv`;

        const csv = Papa.unparse(rows, {
            // Ensure header order matches the template
            columns: [
                "username", "email", "password", "role", "first_name", 
                "last_name", "organization_name", "linkedin_url", 
                "membership_level", "business_partner_name"
            ]
        });

        res.header('Content-Type', 'text/csv');
        res.attachment(filename);
        res.send(csv);

    } catch (err) {
        console.error('Fehler beim Exportieren der Benutzer:', err.message);
        res.status(500).send('Serverfehler');
    }
};


exports.getImportTemplate = async (req, res) => {
    const { role: requesterRole, business_partner_id: requesterBpId } = req.user;
    
    try {
        const headers = [
            "username", // <-- WIEDER HINZUGEFÜGT (optional, wird aber beim Export befüllt)
            "email", 
            "password", 
            "role", 
            "first_name", 
            "last_name", 
            "organization_name", 
            "linkedin_url", 
            "membership_level", 
            "business_partner_name"
        ];
        
        
        let filename = 'Vorlage-Benutzerimport.csv';
        if (requesterRole === 'assistenz') {
            const bpName = await getBusinessPartnerName(requesterBpId);
            if (bpName) {
                const sanitizedName = bpName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                filename = `Vorlage-Benutzerimport-${sanitizedName}.csv`;
            }
        }
        
        const csv = Papa.unparse([headers]);
        
        res.header('Content-Type', 'text/csv');
        res.attachment(filename);
        res.send(csv);

    } catch (err) {
        console.error('Fehler beim Erstellen der Import-Vorlage:', err.message);
        res.status(500).send('Serverfehler');
    }
};


// --- NEU: Widget aus der Dashboard Config eines Nutzers entfernen ---
// --- NEU: Widget aus ALLEN Dashboards eines Nutzers entfernen ---
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
    const { userId } = req.params;

    if (!isValidUUID(userId)) {
        return res.status(400).json({ message: 'Ungültige User-ID.' });
    }

    try {
        // 1. Basis-User-Daten holen (Punkte, Datum, etc.)
        const userResult = await db.query(`
            SELECT created_at, last_login_at, contribution_score, linkedin_url
            FROM users WHERE id = $1
        `, [userId]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'User nicht gefunden.' });
        }
        const userData = userResult.rows[0];

        // 2. Installierte Widgets aus ALLEN Dashboards des Nutzers extrahieren und gruppieren
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
        const widgetResult = await db.query(widgetQuery, [userId]);

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