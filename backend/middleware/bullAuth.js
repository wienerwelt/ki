const jwt = require('jsonwebtoken');

const bullAuth = (req, res, next) => {
  // 1. Suche nach dem speziellen Cookie ODER den häufigsten Standard-Cookies
  // Falls dein normales Login-Cookie "token", "jwt" oder "accessToken" heißt, greift das hier sofort!
  const token = req.cookies['bull-auth-token'] || req.cookies['token'] || req.cookies['accessToken'] || req.cookies['jwt'];

  if (!token) {
    // 2. Kein Token gefunden -> Umleitung zur Auth-Route
    console.warn('[bullAuth] Kein Token gefunden, leite um zu /jobs-auth');
    return res.redirect('/api/admin/monitor/jobs-auth');
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET nicht konfiguriert');
    
    // 3. Verifiziere den Token
    const decoded = jwt.verify(token, secret);
    
    // 4. Prüfe die Berechtigungen (Admin oder Assistenz)
    const role = decoded?.role?.toLowerCase();
    if (role !== 'admin' && role !== 'assistenz') {
      console.warn(`[bullAuth] Zugriff verweigert für Rolle: ${role}`);
      return res.status(403).send('Zugriff verweigert. Admin- oder Assistenz-Rolle erforderlich.');
    }

    // 5. Alles in Ordnung, lass den User ins Bull Board!
    next();

  } catch (err) {
    // Token abgelaufen oder manipuliert
    console.error('[bullAuth] Ungültiges Token:', err.message);
    return res.redirect('/api/admin/monitor/jobs-auth');
  }
};

module.exports = bullAuth;