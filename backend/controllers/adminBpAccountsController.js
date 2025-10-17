// backend/controllers/adminBpAccountsController.js
const db = require('../config/db');
const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

// --- ACCOUNTS ---

// GET a single account by its ID (NEU: Wird für die Wettbewerber-Seite benötigt)
exports.getAccountById = async (req, res) => {
    const { accountId } = req.params;
    if (!isValidUUID(accountId)) return res.status(400).json({ message: 'Invalid Account ID.' });

    try {
        const result = await db.query('SELECT * FROM business_partner_accounts WHERE id = $1', [accountId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Account not found.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching account by ID:', err.message);
        res.status(500).send('Server error');
    }
};

// GET all accounts for a specific business partner
exports.getAccountsForBusinessPartner = async (req, res) => {
    const { bpId } = req.params;
    if (!isValidUUID(bpId)) return res.status(400).json({ message: 'Invalid Business Partner ID.' });

    try {
        const result = await db.query(
            `SELECT 
                a.*, 
                (SELECT COUNT(*) FROM business_partner_competitors c WHERE c.account_id = a.id) as competitor_count,
                (SELECT COALESCE(json_agg(json_build_object('id', r.id, 'name', r.name)), '[]'::json)
                 FROM business_partner_account_regions bar JOIN regions r ON bar.region_id = r.id
                 WHERE bar.account_id = a.id) as regions,
                (SELECT COALESCE(json_agg(json_build_object('id', c.id, 'name', c.name)), '[]'::json)
                 FROM business_partner_account_categories bac JOIN categories c ON bac.category_id = c.id
                 WHERE bac.account_id = a.id) as categories
             FROM business_partner_accounts a
             WHERE a.business_partner_id = $1 
             ORDER BY a.name ASC`,
            [bpId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching accounts for business partner:', err.message);
        res.status(500).send('Server error');
    }
};

// CREATE a new account for a business partner
exports.createAccount = async (req, res) => {
    const { bpId } = req.params;
    const { name, website_url, linkedin_url = null, status, notes, region_ids = [], category_ids = [] } = req.body;

    if (!name || !bpId) return res.status(400).json({ message: 'Name and Business Partner ID are required.' });

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        
        const accountResult = await client.query(
            'INSERT INTO business_partner_accounts (business_partner_id, name, website_url, linkedin_url, status, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [bpId, name, website_url, linkedin_url, status, notes]
        );
        const newAccount = accountResult.rows[0];

        if (region_ids.length > 0) {
            const regionQueries = region_ids.map(region_id => 
                client.query('INSERT INTO business_partner_account_regions (account_id, region_id) VALUES ($1, $2)', [newAccount.id, region_id])
            );
            await Promise.all(regionQueries);
        }

        if (category_ids.length > 0) {
            const categoryQueries = category_ids.map(category_id => 
                client.query('INSERT INTO business_partner_account_categories (account_id, category_id) VALUES ($1, $2)', [newAccount.id, category_id])
            );
            await Promise.all(categoryQueries);
        }

        await client.query('COMMIT');
        res.status(201).json(newAccount);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating account:', err.message);
        res.status(500).send('Server error');
    } finally {
        client.release();
    }
};

// UPDATE an account
exports.updateAccount = async (req, res) => {
    const { accountId } = req.params;
    const { name, website_url, linkedin_url = null, status, notes, region_ids = [], category_ids = [] } = req.body;

    if (!isValidUUID(accountId)) return res.status(400).json({ message: 'Invalid Account ID.' });

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        
        // KORREKTUR: Falsches INSERT durch korrektes UPDATE ersetzt
        const accountResult = await client.query(
            `UPDATE business_partner_accounts SET
                name = $1, website_url = $2, linkedin_url = $3, status = $4, notes = $5, updated_at = CURRENT_TIMESTAMP
             WHERE id = $6 RETURNING *`,
            [name, website_url, linkedin_url, status, notes, accountId]
        );

        if (accountResult.rows.length === 0) {
             throw new Error('Account not found');
        }

        await client.query('DELETE FROM business_partner_account_regions WHERE account_id = $1', [accountId]);
        if (region_ids.length > 0) {
            const regionQueries = region_ids.map(region_id => 
                client.query('INSERT INTO business_partner_account_regions (account_id, region_id) VALUES ($1, $2)', [accountId, region_id])
            );
            await Promise.all(regionQueries);
        }

        await client.query('DELETE FROM business_partner_account_categories WHERE account_id = $1', [accountId]);
        if (category_ids.length > 0) {
            const categoryQueries = category_ids.map(category_id => 
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
        res.status(500).send('Server error');
    } finally {
        client.release();
    }
};

// DELETE an account
exports.deleteAccount = async (req, res) => {
    const { accountId } = req.params;
    if (!isValidUUID(accountId)) return res.status(400).json({ message: 'Invalid Account ID.' });

    try {
        const result = await db.query('DELETE FROM business_partner_accounts WHERE id = $1 RETURNING id', [accountId]);
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