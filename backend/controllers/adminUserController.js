// backend/controllers/adminUserController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const Papa = require('papaparse');
const { Readable } = require('stream');
const { logActivity } = require('../services/auditLogService');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

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
        linkedin_url, membership_level, role = 'fleet_manager', 
        business_partner_id, is_active = true 
    } = req.body;
    const { user: requester } = req;

    try {
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

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        const newUserResult = await db.query(
            `INSERT INTO users (username, email, password_hash, first_name, last_name, organization_name, linkedin_url, membership_level, role, business_partner_id, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
            [username, email, password_hash, first_name, last_name, organization_name, linkedin_url, membership_level, role, finalBpId || null, is_active]
        );
        const newUserId = newUserResult.rows[0].id;
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

        if (requester.role === 'assistenz' && (beforeUpdate.role === 'admin' || updateData.role === 'admin')) {
            return res.status(403).json({ message: 'Permission denied to edit admin users or assign admin role.' });
        }
        if (requester.role === 'assistenz' && beforeUpdate.business_partner_id !== requester.business_partner_id) {
            return res.status(403).json({ message: 'Permission denied: You can only edit users within your own business partner.' });
        }

        let password_hash = beforeUpdate.password_hash;
        if (updateData.password) {
            const salt = await bcrypt.genSalt(10);
            password_hash = await bcrypt.hash(updateData.password, salt);
        }

        const finalBpId = requester.role === 'assistenz' ? requester.business_partner_id : updateData.business_partner_id;

        await db.query(
            `UPDATE users SET
                username = $1, email = $2, password_hash = $3, first_name = $4, last_name = $5,
                organization_name = $6, linkedin_url = $7, membership_level = $8, role = $9, 
                business_partner_id = $10, is_active = $11, updated_at = CURRENT_TIMESTAMP
             WHERE id = $12`,
            [
                updateData.username, updateData.email, password_hash, updateData.first_name, updateData.last_name,
                updateData.organization_name, updateData.linkedin_url, updateData.membership_level, updateData.role,
                finalBpId || null, updateData.is_active, targetUserId
            ]
        );

        const changes = {};
        for (const key in updateData) {
            if (key !== 'password' && String(beforeUpdate[key]) !== String(updateData[key])) {
                changes[key] = { from: beforeUpdate[key], to: updateData[key] };
            }
        }
        if (updateData.password) {
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
        await logActivity({ userId: requester.id, username: requester.username, actionType: 'USER_UPDATE', status: 'failure', targetId: targetUserId, details: { error: err.message }, ipAddress: req.ip });
        console.error('Error updating user:', err.message);
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

// IMPORT Users from CSV
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
                        username, email, password, role, first_name, last_name, 
                        organization_name, linkedin_url, membership_level, business_partner_name 
                    } = row;

                    if (!username || !email || !password || !role) {
                        report.errorCount++;
                        report.errors.push(`Zeile ${index + 2}: Fehlende Pflichtfelder (username, email, password, role).`);
                        continue;
                    }

                    if (requester.role === 'assistenz' && role === 'admin') {
                        report.errorCount++;
                        report.errors.push(`Zeile ${index + 2}: Assistenten dürfen keine Admin-Benutzer erstellen.`);
                        await logActivity({ userId: requester.id, username: requester.username, actionType: 'USER_IMPORT_DENIED', status: 'failure', details: { reason: 'Assistant tried to import admin', attemptedUsername: username }, ipAddress: req.ip });
                        continue;
                    }

                    try {
                        let business_partner_id = null;
                        if (requester.role === 'assistenz') {
                            business_partner_id = requester.business_partner_id;
                        } else if (requester.role === 'admin' && business_partner_name) {
                            const bpResult = await db.query('SELECT id FROM business_partners WHERE name = $1', [business_partner_name]);
                            if (bpResult.rows.length > 0) {
                                business_partner_id = bpResult.rows[0].id;
                            } else {
                                report.errorCount++;
                                report.errors.push(`Zeile ${index + 2}: Business Partner "${business_partner_name}" nicht gefunden.`);
                                continue;
                            }
                        }

                        const password_hash = await bcrypt.hash(password, salt);

                        const newUserResult = await db.query(
                            `INSERT INTO users (username, email, password_hash, first_name, last_name, organization_name, linkedin_url, membership_level, role, business_partner_id, is_active)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
                            [username, email, password_hash, first_name || null, last_name || null, organization_name || null, linkedin_url || null, membership_level || null, role, business_partner_id, true]
                        );
                        const newUserId = newUserResult.rows[0].id;
                        
                        report.successCount++;
                        const bpNameForLog = await getBusinessPartnerName(business_partner_id);
                        await logActivity({ 
                            userId: requester.id, 
                            username: requester.username, 
                            actionType: 'USER_IMPORT', 
                            status: 'success', 
                            targetId: newUserId, 
                            targetType: 'user', 
                            details: { importedUsername: username, source: 'csv', businessPartnerName: bpNameForLog }, 
                            ipAddress: req.ip 
                        });

                    } catch (dbErr) {
                        report.errorCount++;
                        const errorMessage = dbErr.code === '23505' ? 'Benutzername oder E-Mail existiert bereits.' : dbErr.message;
                        report.errors.push(`Zeile ${index + 2} (${username}): ${errorMessage}`);
                        await logActivity({ userId: requester.id, username: requester.username, actionType: 'USER_IMPORT', status: 'failure', details: { error: errorMessage, username: username, source: 'csv' }, ipAddress: req.ip });
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

// EXPORT Users to CSV
exports.exportUsersToCSV = async (req, res) => {
    const { role: requesterRole, business_partner_id: requesterBpId } = req.user;

    try {
        let query = `
            SELECT u.username, u.first_name, u.last_name, u.organization_name, u.email, u.linkedin_url, u.membership_level, u.role, u.is_active, bp.name as business_partner_name
            FROM users u
            LEFT JOIN business_partners bp ON u.business_partner_id = bp.id
        `;
        const queryParams = [];
        let whereClauses = [];

        if (requesterRole === 'assistenz') {
            whereClauses.push(`u.business_partner_id = $1`);
            queryParams.push(requesterBpId);
            whereClauses.push(`u.role != 'admin'`);
        }

        if (whereClauses.length > 0) {
            query += ` WHERE ${whereClauses.join(' AND ')}`;
        }
        query += ` ORDER BY u.last_name ASC, u.first_name ASC`;

        const { rows } = await db.query(query, queryParams);
        
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Keine Benutzer zum Exportieren gefunden.' });
        }

        const csv = Papa.unparse(rows);
        res.header('Content-Type', 'text/csv');
        res.attachment('benutzer-export.csv');
        res.send(csv);

    } catch (err) {
        console.error('Fehler beim Exportieren der Benutzer:', err.message);
        res.status(500).send('Serverfehler');
    }
};
