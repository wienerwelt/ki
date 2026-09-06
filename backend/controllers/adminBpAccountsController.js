// backend/controllers/adminBpAccountsController.js
const db = require('../config/db');
const { enrichAccountsWithLogos } = require('../services/accountLogoService');
const { assertAccountCapacity, hasSalesFeature } = require('../services/salesPlanService');
const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);
const ALLOWED_ACCOUNT_STATUSES = new Set(['prospect', 'active_customer', 'churned']);
const ACCOUNT_OWNER_ROLES = ['admin', 'assistenz', 'sales_manager', 'sales_user'];

const cleanText = (value, maxLength) => {
    const normalized = String(value || '').trim().replace(/\s+/g, ' ');
    return normalized ? normalized.slice(0, maxLength) : null;
};

const cleanUrl = (value, label, allowLocalAsset = false) => {
    const normalized = cleanText(value, 2048);
    if (!normalized) return null;
    if (allowLocalAsset && /^\/(?:directory_logos|images|logos|static)\/[a-zA-Z0-9._~!$&'()+,;=@%/-]+$/.test(normalized)
        && !normalized.includes('..') && !normalized.includes('\\')) return normalized;

    const withProtocol = /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
    try {
        const parsed = new URL(withProtocol);
        if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) throw new Error('invalid');
        return parsed.toString();
    } catch (_) {
        const error = new Error(`${label} muss eine gültige HTTP-/HTTPS-Adresse sein.`);
        error.statusCode = 400;
        throw error;
    }
};

const cleanEmail = (value) => {
    const normalized = cleanText(value, 320)?.toLowerCase() || null;
    if (normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        const error = new Error('Die E-Mail-Adresse ist ungültig.');
        error.statusCode = 400;
        throw error;
    }
    return normalized;
};

const normalizeIds = (value, maxItems = 100) => Array.from(new Set(
    (Array.isArray(value) ? value : []).map(String).filter(isValidUUID)
)).slice(0, maxItems);

const normalizeOptionalUuid = (value) => {
    const normalized = String(value ?? '').trim();
    return normalized || null;
};

const normalizeAccountPayload = (body = {}) => ({
    name: cleanText(body.name, 200),
    website_url: cleanUrl(body.website_url, 'Die Website-URL'),
    linkedin_url: cleanUrl(body.linkedin_url, 'Die LinkedIn-URL'),
    logo_url: cleanUrl(body.logo_url, 'Die Logo-URL', true),
    address: cleanText(body.address, 500),
    contact_email: cleanEmail(body.contact_email),
    contact_phone: cleanText(body.contact_phone, 80),
    owner_user_id: normalizeOptionalUuid(body.owner_user_id),
    status: ALLOWED_ACCOUNT_STATUSES.has(body.status) ? body.status : 'prospect',
    notes: cleanText(body.notes, 4000),
    region_ids: normalizeIds(body.region_ids),
    category_ids: normalizeIds(body.category_ids),
});

const validateAccountOwner = async (queryable, businessPartnerId, ownerUserId) => {
    if (!ownerUserId) return null;
    if (!isValidUUID(ownerUserId)) {
        const error = new Error('Bitte eine gültige Account-Verantwortung auswählen.');
        error.statusCode = 400;
        throw error;
    }
    const result = await queryable.query(
        `SELECT id FROM users
         WHERE id = $1 AND business_partner_id = $2 AND is_active = TRUE
           AND LOWER(role) = ANY($3::text[])
         LIMIT 1`,
        [ownerUserId, businessPartnerId, ACCOUNT_OWNER_ROLES]
    );
    if (!result.rows[0]) {
        const error = new Error('Die Account-Verantwortung gehört nicht zum aktiven Sales-Team dieses Mandanten.');
        error.statusCode = 400;
        throw error;
    }
    return ownerUserId;
};

const normalizeContactPayload = (body = {}) => ({
    name: cleanText(body.name, 200),
    job_title: cleanText(body.job_title, 200),
    email: cleanEmail(body.email),
    phone: cleanText(body.phone, 80),
    linkedin_url: cleanUrl(body.linkedin_url, 'Die LinkedIn-URL'),
    notes: cleanText(body.notes, 2000),
    is_primary: body.is_primary === true,
});

const getTenantScope = (req) => (
    req.user?.role !== 'admin' ? req.user.business_partner_id : null
);

const resolveBusinessPartnerId = (req, res, requestedId) => {
    if (!isValidUUID(requestedId)) {
        res.status(400).json({ message: 'Invalid Business Partner ID.' });
        return null;
    }

    const tenantScope = getTenantScope(req);
    if (tenantScope && String(tenantScope) !== String(requestedId)) {
        res.status(403).json({ message: 'Kein Zugriff auf Accounts eines anderen Mandanten.' });
        return null;
    }
    return tenantScope || requestedId;
};

const applySalesPlanVisibility = (account) => {
    if (hasSalesFeature(account?.tenant_sales_plan, 'competitorMonitoring')) return account;
    return { ...account, competitors: [], competitor_count: 0 };
};

// --- ACCOUNTS ---

// GET a single account by its ID (NEU: Wird für die Wettbewerber-Seite benötigt)
exports.getAccountById = async (req, res) => {
    const { accountId } = req.params;
    if (!isValidUUID(accountId)) return res.status(400).json({ message: 'Invalid Account ID.' });

    try {
        const result = await db.query(
             `SELECT account.*, partner.sales_plan AS tenant_sales_plan,
                    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', owner.first_name, owner.last_name)), ''), owner.username) AS owner_user_name,
                    owner.email AS owner_user_email,
                    owner.profile_image_url AS owner_profile_image_url,
                    (SELECT COUNT(*)::int
                     FROM business_partner_competitors competitor
                     WHERE competitor.account_id = account.id) AS competitor_count,
                    (SELECT COUNT(*)::int
                     FROM business_partner_account_contacts contact
                     WHERE contact.account_id = account.id) AS contact_count,
                    (SELECT COALESCE(json_agg(json_build_object('id', region.id, 'name', region.name) ORDER BY region.name), '[]'::json)
                     FROM business_partner_account_regions relation
                     JOIN regions region ON region.id = relation.region_id
                     WHERE relation.account_id = account.id) AS regions,
                    (SELECT COALESCE(json_agg(json_build_object('id', category.id, 'name', category.name) ORDER BY category.name), '[]'::json)
                     FROM business_partner_account_categories relation
                     JOIN categories category ON category.id = relation.category_id
                     WHERE relation.account_id = account.id) AS categories,
                    (SELECT COALESCE(json_agg(row_to_json(competitor) ORDER BY competitor.name), '[]'::json)
                     FROM business_partner_competitors competitor
                     WHERE competitor.account_id = account.id) AS competitors,
                    (SELECT COALESCE(json_agg(row_to_json(contact) ORDER BY contact.is_primary DESC, contact.name), '[]'::json)
                     FROM business_partner_account_contacts contact
                     WHERE contact.account_id = account.id) AS contacts
             FROM business_partner_accounts account
             JOIN business_partners partner ON partner.id = account.business_partner_id
             LEFT JOIN users owner ON owner.id = account.owner_user_id
             WHERE account.id = $1
               AND ($2::uuid IS NULL OR account.business_partner_id = $2::uuid)`,
            [accountId, getTenantScope(req)]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Account not found.' });
        }
        const [account] = await enrichAccountsWithLogos(result.rows, result.rows[0].business_partner_id);
        res.json(applySalesPlanVisibility(account));
    } catch (err) {
        console.error('Error fetching account by ID:', err.message);
        res.status(500).send('Server error');
    }
};

// GET all accounts for a specific business partner
exports.getAccountsForBusinessPartner = async (req, res) => {
    const bpId = resolveBusinessPartnerId(req, res, req.params.bpId);
    if (!bpId) return;

    try {
        const result = await db.query(
             `SELECT
                a.*, partner.sales_plan AS tenant_sales_plan,
                COALESCE(NULLIF(TRIM(CONCAT_WS(' ', owner.first_name, owner.last_name)), ''), owner.username) AS owner_user_name,
                owner.email AS owner_user_email,
                owner.profile_image_url AS owner_profile_image_url,
                (SELECT COUNT(*)::int FROM business_partner_competitors c WHERE c.account_id = a.id) as competitor_count,
                (SELECT COUNT(*)::int FROM business_partner_account_contacts contact WHERE contact.account_id = a.id) as contact_count,
                (SELECT COALESCE(json_agg(json_build_object(
                    'id', competitor.id,
                    'name', competitor.name,
                    'website_url', competitor.website_url,
                    'linkedin_url', competitor.linkedin_url,
                    'notes', competitor.notes
                ) ORDER BY competitor.name), '[]'::json)
                 FROM business_partner_competitors competitor
                 WHERE competitor.account_id = a.id) as competitors,
                (SELECT COALESCE(json_agg(json_build_object('id', r.id, 'name', r.name)), '[]'::json)
                 FROM business_partner_account_regions bar JOIN regions r ON bar.region_id = r.id
                 WHERE bar.account_id = a.id) as regions,
                (SELECT COALESCE(json_agg(json_build_object('id', c.id, 'name', c.name)), '[]'::json)
                 FROM business_partner_account_categories bac JOIN categories c ON bac.category_id = c.id
                 WHERE bac.account_id = a.id) as categories
             FROM business_partner_accounts a
             JOIN business_partners partner ON partner.id = a.business_partner_id
             LEFT JOIN users owner ON owner.id = a.owner_user_id
             WHERE a.business_partner_id = $1 
             ORDER BY a.name ASC`,
            [bpId]
        );
        const enrichedAccounts = await enrichAccountsWithLogos(result.rows, bpId);
        res.json(enrichedAccounts.map((account) => applySalesPlanVisibility(account)));
    } catch (err) {
        console.error('Error fetching accounts for business partner:', err.message);
        res.status(500).send('Server error');
    }
};

// CREATE a new account for a business partner
exports.createAccount = async (req, res) => {
    const bpId = resolveBusinessPartnerId(req, res, req.params.bpId);
    if (!bpId) return;
    let payload;
    try {
        payload = normalizeAccountPayload(req.body);
    } catch (error) {
        return res.status(error.statusCode || 400).json({ message: error.message });
    }
    if (!payload.name) return res.status(400).json({ message: 'Name and Business Partner ID are required.' });

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        await assertAccountCapacity(client, bpId, 1);
        await validateAccountOwner(client, bpId, payload.owner_user_id);
        
        const accountResult = await client.query(
            `INSERT INTO business_partner_accounts (
                business_partner_id, name, website_url, linkedin_url, logo_url,
                address, contact_email, contact_phone, owner_user_id, status, notes
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING *`,
            [bpId, payload.name, payload.website_url, payload.linkedin_url, payload.logo_url,
                payload.address, payload.contact_email, payload.contact_phone, payload.owner_user_id,
                payload.status, payload.notes]
        );
        const newAccount = accountResult.rows[0];

        if (payload.region_ids.length > 0) {
            const regionQueries = payload.region_ids.map(region_id =>
                client.query('INSERT INTO business_partner_account_regions (account_id, region_id) VALUES ($1, $2)', [newAccount.id, region_id])
            );
            await Promise.all(regionQueries);
        }

        if (payload.category_ids.length > 0) {
            const categoryQueries = payload.category_ids.map(category_id =>
                client.query('INSERT INTO business_partner_account_categories (account_id, category_id) VALUES ($1, $2)', [newAccount.id, category_id])
            );
            await Promise.all(categoryQueries);
        }

        await client.query('COMMIT');
        res.status(201).json(newAccount);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating account:', err.message);
        if (err.code === 'SALES_ACCOUNT_LIMIT_REACHED') {
            return res.status(err.statusCode || 409).json({ message: err.message, code: err.code });
        }
        res.status(err.statusCode || 500).send(err.statusCode ? err.message : 'Server error');
    } finally {
        client.release();
    }
};

// UPDATE an account
exports.updateAccount = async (req, res) => {
    const { accountId } = req.params;
    if (!isValidUUID(accountId)) return res.status(400).json({ message: 'Invalid Account ID.' });
    let payload;
    try {
        payload = normalizeAccountPayload(req.body);
    } catch (error) {
        return res.status(error.statusCode || 400).json({ message: error.message });
    }
    if (!payload.name) return res.status(400).json({ message: 'Der Account-Name fehlt.' });

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const ownership = await client.query(
            `SELECT business_partner_id FROM business_partner_accounts
             WHERE id = $1 AND ($2::uuid IS NULL OR business_partner_id = $2::uuid)
             FOR UPDATE`,
            [accountId, getTenantScope(req)]
        );
        if (!ownership.rows[0]) throw new Error('Account not found');
        await validateAccountOwner(client, ownership.rows[0].business_partner_id, payload.owner_user_id);

        const accountResult = await client.query(
            `UPDATE business_partner_accounts SET
                name = $1, website_url = $2, linkedin_url = $3, logo_url = $4,
                address = $5, contact_email = $6, contact_phone = $7,
                owner_user_id = $8, status = $9, notes = $10, updated_at = CURRENT_TIMESTAMP
             WHERE id = $11
               AND ($12::uuid IS NULL OR business_partner_id = $12::uuid)
             RETURNING *`,
            [payload.name, payload.website_url, payload.linkedin_url, payload.logo_url,
                payload.address, payload.contact_email, payload.contact_phone, payload.owner_user_id,
                payload.status, payload.notes, accountId, getTenantScope(req)]
        );

        if (accountResult.rows.length === 0) {
             throw new Error('Account not found');
        }

        await client.query('DELETE FROM business_partner_account_regions WHERE account_id = $1', [accountId]);
        if (payload.region_ids.length > 0) {
            const regionQueries = payload.region_ids.map(region_id =>
                client.query('INSERT INTO business_partner_account_regions (account_id, region_id) VALUES ($1, $2)', [accountId, region_id])
            );
            await Promise.all(regionQueries);
        }

        await client.query('DELETE FROM business_partner_account_categories WHERE account_id = $1', [accountId]);
        if (payload.category_ids.length > 0) {
            const categoryQueries = payload.category_ids.map(category_id =>
                client.query('INSERT INTO business_partner_account_categories (account_id, category_id) VALUES ($1, $2)', [accountId, category_id])
            );
            await Promise.all(categoryQueries);
        }

        await client.query('COMMIT');
        res.json(accountResult.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating account:', err.message);
        if (err.message === 'Account not found') {
            return res.status(404).json({ message: 'Account not found.' });
        }
        res.status(err.statusCode || 500).json({ message: err.statusCode ? err.message : 'Server error' });
    } finally {
        client.release();
    }
};

// DELETE an account
exports.deleteAccount = async (req, res) => {
    const { accountId } = req.params;
    if (!isValidUUID(accountId)) return res.status(400).json({ message: 'Invalid Account ID.' });

    try {
        const result = await db.query(
            `DELETE FROM business_partner_accounts
             WHERE id = $1
               AND ($2::uuid IS NULL OR business_partner_id = $2::uuid)
             RETURNING id`,
            [accountId, getTenantScope(req)]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Account not found.' });
        }
        res.status(204).send();
    } catch (err) {
        console.error('Error deleting account:', err.message);
        res.status(500).send('Server error');
    }
};

// GET all available categories
exports.getAllCategories = async (req, res) => {
    try {
        const result = await db.query('SELECT id, name FROM categories ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching all categories:', err.message);
        res.status(500).send('Server error');
    }
};

exports.getAccountTeamForBusinessPartner = async (req, res) => {
    const bpId = resolveBusinessPartnerId(req, res, req.params.bpId);
    if (!bpId) return;
    try {
        const { rows } = await db.query(
            `SELECT app_user.id::text,
                    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', app_user.first_name, app_user.last_name)), ''), app_user.username) AS name,
                    app_user.email,
                    app_user.role,
                    app_user.profile_image_url
             FROM users app_user
             WHERE app_user.business_partner_id = $1
               AND app_user.is_active = TRUE
               AND LOWER(app_user.role) = ANY($2::text[])
             ORDER BY app_user.last_name NULLS LAST, app_user.first_name NULLS LAST, app_user.username`,
            [bpId, ACCOUNT_OWNER_ROLES]
        );
        return res.json(rows);
    } catch (error) {
        console.error('Error fetching account team:', error.message);
        return res.status(500).json({ message: 'Das Sales-Team konnte nicht geladen werden.' });
    }
};

// --- ACCOUNT CONTACTS ---

exports.createContact = async (req, res) => {
    const { accountId } = req.params;
    if (!isValidUUID(accountId)) return res.status(400).json({ message: 'Invalid Account ID.' });
    let payload;
    try {
        payload = normalizeContactPayload(req.body);
    } catch (error) {
        return res.status(error.statusCode || 400).json({ message: error.message });
    }
    if (!payload.name) return res.status(400).json({ message: 'Der Name des Ansprechpartners fehlt.' });

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const account = await client.query(
            `SELECT id FROM business_partner_accounts
             WHERE id = $1 AND ($2::uuid IS NULL OR business_partner_id = $2::uuid)
             FOR UPDATE`,
            [accountId, getTenantScope(req)]
        );
        if (account.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Account not found.' });
        }
        if (payload.is_primary) {
            await client.query('UPDATE business_partner_account_contacts SET is_primary = FALSE WHERE account_id = $1', [accountId]);
        }
        const result = await client.query(
            `INSERT INTO business_partner_account_contacts (
                account_id, name, job_title, email, phone, linkedin_url, notes,
                is_primary, created_by_user_id, updated_by_user_id
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
             RETURNING *`,
            [accountId, payload.name, payload.job_title, payload.email, payload.phone,
                payload.linkedin_url, payload.notes, payload.is_primary, req.user.id]
        );
        await client.query('COMMIT');
        return res.status(201).json(result.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating account contact:', error.message);
        return res.status(500).json({ message: 'Ansprechpartner konnte nicht gespeichert werden.' });
    } finally {
        client.release();
    }
};

exports.updateContact = async (req, res) => {
    const { contactId } = req.params;
    if (!isValidUUID(contactId)) return res.status(400).json({ message: 'Invalid Contact ID.' });
    let payload;
    try {
        payload = normalizeContactPayload(req.body);
    } catch (error) {
        return res.status(error.statusCode || 400).json({ message: error.message });
    }
    if (!payload.name) return res.status(400).json({ message: 'Der Name des Ansprechpartners fehlt.' });

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const ownership = await client.query(
            `SELECT contact.account_id
             FROM business_partner_account_contacts contact
             JOIN business_partner_accounts account ON account.id = contact.account_id
             WHERE contact.id = $1
               AND ($2::uuid IS NULL OR account.business_partner_id = $2::uuid)
             FOR UPDATE OF account, contact`,
            [contactId, getTenantScope(req)]
        );
        if (ownership.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Ansprechpartner nicht gefunden.' });
        }
        const accountId = ownership.rows[0].account_id;
        if (payload.is_primary) {
            await client.query(
                'UPDATE business_partner_account_contacts SET is_primary = FALSE WHERE account_id = $1 AND id <> $2',
                [accountId, contactId]
            );
        }
        const result = await client.query(
            `UPDATE business_partner_account_contacts SET
                name = $1, job_title = $2, email = $3, phone = $4,
                linkedin_url = $5, notes = $6, is_primary = $7,
                updated_by_user_id = $8, updated_at = CURRENT_TIMESTAMP
             WHERE id = $9
             RETURNING *`,
            [payload.name, payload.job_title, payload.email, payload.phone, payload.linkedin_url,
                payload.notes, payload.is_primary, req.user.id, contactId]
        );
        await client.query('COMMIT');
        return res.json(result.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating account contact:', error.message);
        return res.status(500).json({ message: 'Ansprechpartner konnte nicht aktualisiert werden.' });
    } finally {
        client.release();
    }
};

exports.deleteContact = async (req, res) => {
    const { contactId } = req.params;
    if (!isValidUUID(contactId)) return res.status(400).json({ message: 'Invalid Contact ID.' });
    try {
        const result = await db.query(
            `DELETE FROM business_partner_account_contacts contact
             USING business_partner_accounts account
             WHERE contact.id = $1
               AND account.id = contact.account_id
               AND ($2::uuid IS NULL OR account.business_partner_id = $2::uuid)
             RETURNING contact.id`,
            [contactId, getTenantScope(req)]
        );
        if (result.rowCount === 0) return res.status(404).json({ message: 'Ansprechpartner nicht gefunden.' });
        return res.status(204).send();
    } catch (error) {
        console.error('Error deleting account contact:', error.message);
        return res.status(500).json({ message: 'Ansprechpartner konnte nicht gelöscht werden.' });
    }
};
