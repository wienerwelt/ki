    // backend/controllers/adminRoleController.js
    const db = require('../config/db');

    // GET all available roles
    exports.getAllRoles = async (req, res) => {
        try {
            const result = await db.query('SELECT name, description FROM roles ORDER BY name ASC');
            res.json(result.rows);
        } catch (err) {
            console.error('Error fetching all roles:', err.message);
            res.status(500).send('Server error');
        }
    };
    