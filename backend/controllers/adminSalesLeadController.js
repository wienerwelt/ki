const db = require('../config/db');

const VALID_STATUSES = new Set(['new', 'in_review', 'planned', 'done', 'rejected']);
const isValidUUID = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

const leadWhere = `
  type IN ('demo_request', 'callback_request')
  AND COALESCE(audience, '') ILIKE 'Account-Radar%'
`;

exports.listSalesLeads = async (req, res) => {
  const search = String(req.query.search || '').trim().slice(0, 160);
  const requestedStatus = String(req.query.status || 'all').trim().toLowerCase();
  const status = requestedStatus === 'all' || VALID_STATUSES.has(requestedStatus) ? requestedStatus : 'all';
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(10, Number.parseInt(req.query.limit, 10) || 25));
  const offset = (page - 1) * limit;

  try {
    const [itemsResult, totalResult, summaryResult] = await Promise.all([
      db.query(
        `SELECT id, type, title, description, name, organization, email, audience,
                status, created_at, updated_at
         FROM feedback_items
         WHERE ${leadWhere}
           AND ($1 = 'all' OR status = $1)
           AND (
             $2 = '' OR name ILIKE '%' || $2 || '%'
             OR organization ILIKE '%' || $2 || '%'
             OR email ILIKE '%' || $2 || '%'
             OR description ILIKE '%' || $2 || '%'
             OR audience ILIKE '%' || $2 || '%'
           )
         ORDER BY CASE WHEN status = 'new' THEN 0 ELSE 1 END, created_at DESC
         LIMIT $3 OFFSET $4`,
        [status, search, limit, offset]
      ),
      db.query(
        `SELECT COUNT(*)::int AS count
         FROM feedback_items
         WHERE ${leadWhere}
           AND ($1 = 'all' OR status = $1)
           AND (
             $2 = '' OR name ILIKE '%' || $2 || '%'
             OR organization ILIKE '%' || $2 || '%'
             OR email ILIKE '%' || $2 || '%'
             OR description ILIKE '%' || $2 || '%'
             OR audience ILIKE '%' || $2 || '%'
           )`,
        [status, search]
      ),
      db.query(
        `SELECT status, COUNT(*)::int AS count
         FROM feedback_items
         WHERE ${leadWhere}
         GROUP BY status`
      ),
    ]);

    const summary = { all: 0, new: 0, in_review: 0, planned: 0, done: 0, rejected: 0 };
    summaryResult.rows.forEach((row) => {
      const count = Number(row.count || 0);
      summary.all += count;
      if (Object.prototype.hasOwnProperty.call(summary, row.status)) summary[row.status] = count;
    });

    return res.json({
      items: itemsResult.rows,
      pagination: { page, limit, total: Number(totalResult.rows[0]?.count || 0) },
      summary,
    });
  } catch (error) {
    console.error('[Sales-Leads] Fehler beim Laden:', error.message);
    return res.status(500).json({ message: 'Sales-Anfragen konnten nicht geladen werden.' });
  }
};
exports.updateSalesLeadStatus = async (req, res) => {
  const { id } = req.params;
  const status = String(req.body?.status || '').trim().toLowerCase();
  if (!isValidUUID(id)) return res.status(400).json({ message: 'Ungültige Anfrage-ID.' });
  if (!VALID_STATUSES.has(status)) return res.status(400).json({ message: 'Ungültiger Bearbeitungsstatus.' });

  try {
    const result = await db.query(
      `UPDATE feedback_items
       SET status = $1, updated_at = NOW()
       WHERE id = $2
         AND ${leadWhere}
       RETURNING id, type, title, description, name, organization, email, audience,
                 status, created_at, updated_at`,
      [status, id]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Sales-Anfrage wurde nicht gefunden.' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('[Sales-Leads] Fehler beim Aktualisieren:', error.message);
    return res.status(500).json({ message: 'Status konnte nicht aktualisiert werden.' });
  }
};
