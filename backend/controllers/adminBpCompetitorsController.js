// backend/controllers/adminBpCompetitorsController.js
const db = require('../config/db');
const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);
const getTenantScope = (req) => (
    req.user?.role !== 'admin' ? req.user.business_partner_id : null
);

const accountExistsInScope = async (accountId, tenantScope) => {
    const result = await db.query(
        `SELECT id
         FROM business_partner_accounts
         WHERE id = $1
           AND ($2::uuid IS NULL OR business_partner_id = $2::uuid)`,
        [accountId, tenantScope]
    );
    return result.rowCount === 1;
};

// GET all competitors for a specific account
exports.getCompetitorsForAccount = async (req, res) => {
    const { accountId } = req.params;
    if (!isValidUUID(accountId)) return res.status(400).json({ message: 'Invalid Account ID.' });

    try {
        if (!await accountExistsInScope(accountId, getTenantScope(req))) {
            return res.status(404).json({ message: 'Account not found.' });
        }
        const result = await db.query('SELECT * FROM business_partner_competitors WHERE account_id = $1 ORDER BY name ASC', [accountId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching competitors:', err.message);
        res.status(500).send('Server error');
    }
};

// CREATE a new competitor for an account
exports.createCompetitor = async (req, res) => {
    const { accountId } = req.params;
    const { name, website_url, linkedin_url, notes } = req.body;
    if (!isValidUUID(accountId)) return res.status(400).json({ message: 'Invalid Account ID.' });
    if (!String(name || '').trim()) return res.status(400).json({ message: 'Name and Account ID are required.' });

    try {
        const result = await db.query(
            `INSERT INTO business_partner_competitors (account_id, name, website_url, linkedin_url, notes)
             SELECT account.id, $2, $3, $4, $5
             FROM business_partner_accounts account
             WHERE account.id = $1
               AND ($6::uuid IS NULL OR account.business_partner_id = $6::uuid)
             RETURNING *`,
            [accountId, String(name).trim(), website_url, linkedin_url, notes, getTenantScope(req)]
        );
        if (result.rowCount === 0) return res.status(404).json({ message: 'Account not found.' });
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating competitor:', err.message);
        res.status(500).send('Server error');
    }
};

// UPDATE a competitor
exports.updateCompetitor = async (req, res) => {
    const { competitorId } = req.params;
    const { name, website_url, linkedin_url, notes } = req.body;
    if (!isValidUUID(competitorId)) return res.status(400).json({ message: 'Invalid Competitor ID.' });

    try {
        const result = await db.query(
            `UPDATE business_partner_competitors competitor SET
                name = $1, website_url = $2, linkedin_url = $3, notes = $4, updated_at = CURRENT_TIMESTAMP 
             FROM business_partner_accounts account
             WHERE competitor.id = $5
               AND account.id = competitor.account_id
               AND ($6::uuid IS NULL OR account.business_partner_id = $6::uuid)
             RETURNING competitor.*`,
            [name, website_url, linkedin_url, notes, competitorId, getTenantScope(req)]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: 'Competitor not found.' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating competitor:', err.message);
        res.status(500).send('Server error');
    }
};

// DELETE a competitor
exports.deleteCompetitor = async (req, res) => {
    const { competitorId } = req.params;
    if (!isValidUUID(competitorId)) return res.status(400).json({ message: 'Invalid Competitor ID.' });

    try {
        const result = await db.query(
            `DELETE FROM business_partner_competitors competitor
             USING business_partner_accounts account
             WHERE competitor.id = $1
               AND account.id = competitor.account_id
               AND ($2::uuid IS NULL OR account.business_partner_id = $2::uuid)
             RETURNING competitor.id`,
            [competitorId, getTenantScope(req)]
        );
        if (result.rowCount === 0) return res.status(404).json({ message: 'Competitor not found.' });
        res.status(204).send(); // No Content
    } catch (err) {
        console.error('Error deleting competitor:', err.message);
        res.status(500).send('Server error');
    }
};
