const db = require('../config/db');

const updateLastActive = async (req, res, next) => {
    // Nur für eingeloggte User
    if (req.user && req.user.id) {
        // Fire & Forget (wir warten nicht auf das DB-Update, um den Request nicht zu bremsen)
        db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [req.user.id])
          .catch(err => console.error('Fehler beim Aktualisieren von last_login_at:', err.message));
    }
    next();
};

module.exports = updateLastActive;