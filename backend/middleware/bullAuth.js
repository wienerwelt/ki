// backend/middleware/bullAuth.js
const jwt = require('jsonwebtoken');

const bullAuth = (req, res, next) => {
  // Suche nach dem speziellen Cookie
  const token = req.cookies['bull-auth-token'];

  if (!token) {
    // Wenn kein Cookie da ist, leite zum Startpunkt um.
    // So kann man die URL auch direkt aufrufen und wird authentifiziert.
    return res.redirect('/api/admin/monitor/jobs-auth');
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET nicht konfiguriert');
    
    // Verifiziere den Token aus dem Cookie
    const decoded = jwt.verify(token, secret);
    
    // Prüfe, ob die Rolle ausreicht
    const role = decoded?.role?.toLowerCase();
    if (role !== 'admin' && role !== 'assistenz') {
      return res.status(403).send('Zugriff verweigert. Admin- oder Assistenz-Rolle erforderlich.');
    }

    // Alles in Ordnung, erlaube den Zugriff auf das Dashboard
    next();

  } catch (err) {
    // Bei ungültigem Token erneut zum Login leiten
    console.warn('Ungültiges bull-auth-token:', err.message);
    return res.redirect('/api/admin/monitor/jobs-auth');
  }
};

module.exports = bullAuth;