// backend/controllers/fundingController.js
const db = require('../config/db');

const { v4: uuidv4 } = require('uuid');
const { generateAIContent } = require('../services/aiExecutionService');

exports.getTopOpportunities = async (req, res) => {
    const { id: userId } = req.user;
    try {
        const userCategoriesRes = await db.query('SELECT category_id FROM user_funding_categories WHERE user_id = $1', [userId]);
        const userCategoryIds = userCategoriesRes.rows.map(r => r.category_id);

        if (userCategoryIds.length === 0) {
            return res.json({ profile_incomplete: true, opportunities: [] });
        }

        const query = `
            SELECT 
                f.id, 
                f.title, 
                f.deadline_end,
                (
                    SELECT COUNT(*) FROM funding_opportunities_categories foc
                    WHERE foc.opportunity_id = f.id AND foc.category_id = ANY($1::int[])
                ) as match_count,
                -- NEU: Kategorienamen als Array hinzufügen
                (
                    SELECT array_agg(fc.name) 
                    FROM funding_categories fc
                    JOIN funding_opportunities_categories foc ON fc.id = foc.category_id
                    WHERE foc.opportunity_id = f.id
                ) as categories
            FROM funding_opportunities f
            WHERE f.status = 'active' AND f.deadline_end >= NOW()
            ORDER BY match_count DESC, f.deadline_end ASC
            LIMIT 5;
        `;
        const { rows } = await db.query(query, [userCategoryIds]);
        res.json({ profile_incomplete: false, opportunities: rows });
    } catch (err) {
        console.error('Error fetching top opportunities:', err.message);
        res.status(500).send('Server error');
    }
};


exports.searchFunding = async (req, res) => {
  const { id: userId } = req.user;

  // 1) Profil-Check wie bei dir
  try {
    const r = await db.query(
      'SELECT 1 FROM user_funding_categories WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    if (r.rows.length === 0) {
      return res.json({ results: [], aggregations: {}, profile_incomplete: true });
    }
  } catch (err) {
    console.error('Error checking user categories:', err.message);
    return res.status(500).send('Server error');
  }

  // 2) Query-Params
  const {
    q,
    categories,
    regions,
    deadlineBefore,
    status = 'active',         // 'active' | 'all' | ...
    sortBy = 'deadline_end',   // UI kennt: deadline_end, funding_amount_max :contentReference[oaicite:1]{index=1}
    order = 'asc',
    userStatus,                // 'hidden' | 'favorited' | 'applied' | undefined
    includeHidden              // 'true' um hidden NICHT auszublenden
  } = req.query;

  try {
    const params = [];
    const filters = [];

    // --- User für ufs-Join
    params.push(userId); // $1

    // --- Volltext
    if (q) {
      params.push(`%${q}%`);
      const p = `$${params.length}`;
      filters.push(`(f.title ILIKE ${p} OR f.summary_ai ILIKE ${p})`);
    }

    // --- Regionen (ein Wert oder Liste)
    if (regions) {
      const regionList = Array.isArray(regions)
        ? regions
        : String(regions).split(',').map(s => s.trim()).filter(Boolean);
      if (regionList.length === 1) {
        params.push(regionList[0]);
        filters.push(`f.region = $${params.length}`);
      } else if (regionList.length > 1) {
        params.push(regionList);
        filters.push(`f.region = ANY($${params.length}::text[])`);
      }
    }

    // --- Deadline
    if (deadlineBefore) {
      params.push(deadlineBefore);
      filters.push(`f.deadline_end <= $${params.length}::date`);
    }

    // --- Kategorien
    if (categories) {
      const categoryIds = String(categories)
        .split(',')
        .map(id => parseInt(id.trim(), 10))
        .filter(Number.isInteger);
      if (categoryIds.length > 0) {
        params.push(categoryIds);
        filters.push(`
          EXISTS (
            SELECT 1
            FROM funding_opportunities_categories foc
            WHERE foc.opportunity_id = f.id
              AND foc.category_id = ANY($${params.length}::int[])
          )
        `);
      }
    }

    // --- Status (Opportunity)
    if (status && status !== 'all') {
      params.push(status);
      filters.push(`f.status = $${params.length}`);
    }
    const baseWhere = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    // --- Sortierung (UI: nur diese beiden) :contentReference[oaicite:2]{index=2}
    const allowedSortBy = {
      deadline_end: 'fr.deadline_end',
      funding_amount_max: 'fr.funding_amount_max'
      // match_score kannst du später ergänzen, wenn du es nutzt
    };
    const sortColumn = allowedSortBy[sortBy] || 'fr.deadline_end';
    const sortOrder = String(order).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // --- userStatus / includeHidden flags parametrisiert
    const onlyHidden = userStatus === 'hidden';
    const specificStatuses = ['favorited', 'applied'];
    const hasSpecific = !!userStatus && specificStatuses.includes(userStatus);

    params.push(onlyHidden);              // $N
    const pOnlyHidden = `$${params.length}`;
    params.push(hasSpecific);             // $N+1
    const pHasSpecific = `$${params.length}`;
    if (hasSpecific) {
      params.push(userStatus);            // $N+2
    }
    const pSpecific = hasSpecific ? `$${params.length}` : null;

    // Standard: hidden ausblenden, außer includeHidden === 'true'
    const hideHiddenByDefault = includeHidden !== 'true';

    const sql = `
      WITH BaseQuery AS (
        SELECT
          f.*,
          ufs.status AS user_status,
          0::int AS match_score
        FROM funding_opportunities f
        LEFT JOIN user_funding_status ufs
          ON ufs.opportunity_id = f.id AND ufs.user_id = $1
        ${baseWhere}
      ),
      Aggregations AS (
        SELECT
          (
            SELECT json_object_agg(COALESCE(region, 'Sonstige'), cnt)
            FROM (
              SELECT region, COUNT(*) AS cnt
              FROM BaseQuery
              ${hideHiddenByDefault ? `WHERE (user_status IS NULL OR user_status <> 'hidden')` : ``}
              GROUP BY region
            ) t
          ) AS "byRegion",
          (
            -- Achtung: user_status zählen, nicht f.status
            SELECT json_object_agg(COALESCE(user_status, 'none'), cnt)
            FROM (
              SELECT user_status, COUNT(*) AS cnt
              FROM BaseQuery
              GROUP BY user_status
            ) t
          ) AS "byUserStatus",
          (
            SELECT json_object_agg(COALESCE(cat.id::text, 'Sonstige'), cat.cnt)
            FROM (
              SELECT fc.id, COUNT(bq.id) AS cnt
              FROM BaseQuery bq
              LEFT JOIN funding_opportunities_categories foc ON bq.id = foc.opportunity_id
              LEFT JOIN funding_categories fc ON foc.category_id = fc.id
              ${hideHiddenByDefault ? `WHERE (bq.user_status IS NULL OR bq.user_status <> 'hidden')` : ``}
              GROUP BY fc.id
            ) cat
          ) AS "byCategory"
      ),
      FinalResults AS (
        SELECT *
        FROM BaseQuery
        WHERE
          (
            ${pOnlyHidden}::bool AND user_status = 'hidden'
          ) OR (
            ${pHasSpecific}::bool AND user_status = ${pSpecific || 'NULL'}
          ) OR (
            NOT ${pOnlyHidden}::bool
            AND NOT ${pHasSpecific}::bool
            ${hideHiddenByDefault ? `AND (user_status IS NULL OR user_status <> 'hidden')` : ``}
          )
      )
      SELECT
        (SELECT json_agg(fr.*) FROM (
          SELECT
            fr.*,
            r.latitude,
            r.longitude,
            (
              SELECT ARRAY_AGG(fc2.name)
              FROM funding_opportunities_categories foc2
              JOIN funding_categories fc2 ON foc2.category_id = fc2.id
              WHERE foc2.opportunity_id = fr.id
            ) AS categories
          FROM FinalResults fr
          LEFT JOIN regions r
            ON (fr.region = r.code OR fr.region = r.name)
          ORDER BY ${sortColumn} ${sortOrder} NULLS LAST
          LIMIT 100
        ) fr) AS results,
        (SELECT to_json(ag) FROM Aggregations ag) AS aggregations
    `;

    const { rows } = await db.query(sql, params);

    res.json({
      results: rows?.[0]?.results || [],
      aggregations: rows?.[0]?.aggregations || {}
    });
  } catch (err) {
    console.error('Error searching funding:', err.message, err.stack);
    res.status(500).send('Server error');
  }
};






exports.getFundingCategories = async (req, res) => {
    try {
        const { rows } = await db.query('SELECT id, name FROM funding_categories ORDER BY name ASC');
        res.json(rows);
    } catch (err) { res.status(500).send('Server error'); }
};

exports.getUserFundingCategories = async (req, res) => {
    try {
        const { rows } = await db.query('SELECT category_id FROM user_funding_categories WHERE user_id = $1', [req.user.id]);
        res.json(rows.map(r => r.category_id));
    } catch (err) { res.status(500).send('Server error'); }
};

exports.updateUserFundingCategories = async (req, res) => {
    const { categoryIds } = req.body;
    const { id: userId } = req.user;
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM user_funding_categories WHERE user_id = $1', [userId]);
        if (categoryIds && categoryIds.length > 0) {
            for (const catId of categoryIds) {
                await client.query('INSERT INTO user_funding_categories (user_id, category_id) VALUES ($1, $2)', [userId, catId]);
            }
        }
        await client.query('COMMIT');
        res.status(200).json({ message: 'Interessen aktualisiert.' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).send('Server error');
    } finally {
        client.release();
    }
};

exports.saveSearch = async (req, res) => {
    // searchName wird später aus dem Modal kommen
    const { searchName, searchCriteria } = req.body; 
    const { id: userId } = req.user;

    if (!searchName || !searchCriteria) {
        return res.status(400).json({ message: "Name und Kriterien für die Suche sind erforderlich." });
    }

    try {
        await db.query(
            'INSERT INTO user_saved_funding_searches (user_id, search_name, search_criteria) VALUES ($1, $2, $3)',
            [userId, searchName, searchCriteria]
        );
        res.status(201).json({ message: 'Suche erfolgreich gespeichert!' });
    } catch (err) {
        console.error("Fehler beim Speichern der Suche:", err);
        res.status(500).send('Server error');
    }
};


exports.getUsedRegions = async (req, res) => {
    try {
        const { rows } = await db.query(
            "SELECT DISTINCT region FROM funding_opportunities WHERE region IS NOT NULL AND region <> '' ORDER BY region ASC"
        );
        res.json(rows.map(r => r.region));
    } catch (err) {
        console.error('Error fetching used regions:', err.message);
        res.status(500).send('Server error');
    }
};

exports.setFundingStatus = async (req, res) => {
    const { opportunityId, status } = req.body;
    const { id: userId } = req.user;

    const allowedStatus = ['favorited', 'hidden', 'applied'];
    if (status && !allowedStatus.includes(status)) {
        return res.status(400).json({ message: 'Ungültiger Status.' });
    }

    try {
        if (!status) {
            await db.query('DELETE FROM user_funding_status WHERE user_id = $1 AND opportunity_id = $2', [userId, opportunityId]);
        } else {
            await db.query(
                `INSERT INTO user_funding_status (user_id, opportunity_id, status) VALUES ($1, $2, $3)
                 ON CONFLICT (user_id, opportunity_id) DO UPDATE SET status = $3, updated_at = NOW()`,
                [userId, opportunityId, status]
            );
        }
        res.status(200).json({ message: 'Status aktualisiert.' });
    } catch (err) {
        res.status(500).send('Server error');
    }
};


exports.getFundingDetailById = async (req, res) => {
    const { id } = req.params;
    const { id: userId } = req.user; // Nutzer-ID aus der Authentifizierung holen

    try {
        const query = `
            SELECT 
                f.*,
                ufs.status as user_status, -- NEU: Status des Nutzers hinzugefügt
                (
                    SELECT ARRAY_AGG(fc.name)
                    FROM funding_opportunities_categories foc
                    JOIN funding_categories fc ON foc.category_id = fc.id
                    WHERE foc.opportunity_id = f.id
                ) as categories
            FROM funding_opportunities f
            -- NEU: LEFT JOIN auf die Statustabelle des Nutzers
            LEFT JOIN user_funding_status ufs ON f.id = ufs.opportunity_id AND ufs.user_id = $2
            WHERE f.id = $1
        `;
        // NEU: userId als zweiten Parameter übergeben
        const { rows } = await db.query(query, [id, userId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Förderung nicht gefunden.' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error('Error fetching funding detail:', err.message);
        res.status(500).send('Server error');
    }
};



exports.getSavedSearches = async (req, res) => {
    const { id: userId } = req.user;
    try {
        const { rows } = await db.query(
            'SELECT id, search_name, search_criteria, notifications_enabled FROM user_saved_funding_searches WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        res.json(rows);
    } catch (err) {
        console.error("Fehler beim Laden der gespeicherten Suchen:", err);
        res.status(500).send('Server error');
    }
};

exports.toggleSearchNotifications = async (req, res) => {
    const { id: searchId } = req.params;
    const { id: userId } = req.user;
    try {
        await db.query(
            `UPDATE user_saved_funding_searches 
             SET notifications_enabled = NOT notifications_enabled 
             WHERE id = $1 AND user_id = $2`,
            [searchId, userId]
        );
        res.status(200).json({ message: 'Einstellung aktualisiert.' });
    } catch (err) {
        console.error("Fehler beim Umschalten der Benachrichtigungen:", err);
        res.status(500).send('Server error');
    }
};

exports.deleteSearch = async (req, res) => {
    const { id: searchId } = req.params;
    const { id: userId } = req.user;
    try {
        const result = await db.query(
            'DELETE FROM user_saved_funding_searches WHERE id = $1 AND user_id = $2 RETURNING id',
            [searchId, userId]
        );
        if (result.rowCount === 0) {
             return res.status(404).json({ message: 'Gespeicherte Suche nicht gefunden oder keine Berechtigung.' });
        }
        res.status(200).json({ message: 'Suche erfolgreich gelöscht.' });
    } catch (err) {
        console.error(`Fehler beim Löschen der Suche ${searchId}:`, err);
        res.status(500).send('Server error');
    }
};

exports.getRegions = async (req, res) => {
    try {
        const { rows } = await db.query('SELECT id, name, code, latitude, longitude FROM regions');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching regions:', err.message);
        res.status(500).send('Server error');
    }
};


exports.generateApplicationDraft = async (req, res) => {
    const { fundingId } = req.body;
    const { id: userId, business_partner_id: businessPartnerId } = req.user;

    if (!fundingId) {
        return res.status(400).json({ message: 'Förderungs-ID fehlt.' });
    }

    let jobId;

    try {
        // KORREKTUR: Alle notwendigen Daten VOR der Transaktion in einem Rutsch laden
        const fundingRes = await db.query('SELECT title, summary_ai FROM funding_opportunities WHERE id = $1', [fundingId]);
        const userRes = await db.query('SELECT organization_name FROM users WHERE id = $1', [userId]);

        if (fundingRes.rows.length === 0) {
            return res.status(404).json({ message: 'Förderung nicht gefunden.' });
        }
        const funding = fundingRes.rows[0];
        const userProfile = userRes.rows[0] || { organization_name: "Unser Unternehmen" };
        
        // --- Datenbank-Transaktion für Gamification & Logging ---
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            // 1. Punkte abziehen
            await client.query('UPDATE users SET contribution_score = contribution_score - 3 WHERE id = $1', [userId]);

            // 2. Log-Eintrag im "Kontoauszug" erstellen
            const description = `Punkte für KI-Anschreiben ("${funding.title}") eingelöst`;
            await client.query(
                `INSERT INTO user_score_logs (user_id, points_change, action_type, description, reference_id)
                 VALUES ($1, -3, 'FUNDING_DRAFT', $2, $3)`,
                [userId, description, fundingId]
            );

            // 3. AI-Job für die Nachverfolgung erstellen
            const jobResult = await client.query(
                `INSERT INTO ai_jobs (status, is_automated) VALUES ('running', false) RETURNING id`
            );
            if (!jobResult.rows[0]?.id) {
                throw new Error('Konnte keinen AI-Job in der Datenbank erstellen.');
            }
            jobId = jobResult.rows[0].id;

            await client.query('COMMIT');
        } catch (dbError) {
            await client.query('ROLLBACK');
            throw dbError; // Fehler an den äußeren catch-Block weitergeben
        } finally {
            client.release();
        }
        
        // --- Externe KI-Anfrage (NACH der DB-Transaktion) ---
        const promptTemplate = `
            Du bist ein Experte für Förderanträge in Deutschland und Österreich. Formuliere basierend auf den folgenden Informationen 
            die ersten drei Absätze eines überzeugenden Anschreibens.
            Das Anschreiben soll professionell, prägnant und überzeugend sein.
            Hebe hervor, warum das Unternehmen und dessen mögliche Projekte perfekt für diese Förderung geeignet sind.
            Antworte ausschließlich mit dem Text des Anschreibens, ohne einleitende Sätze wie "Hier ist der Entwurf".
            {{data}}
        `;
        const inputText = `
            Informationen zur Förderung:
            - Titel: "${funding.title}"
            - Zusammenfassung der Ziele: "${funding.summary_ai}"
            Informationen zum antragstellenden Unternehmen:
            - Name: "${userProfile.organization_name}"
        `;

        const { aiResultString } = await generateAIContent({
            promptTemplate, inputText, ai_provider: 'OpenAI GPT-4o', jobId, userId
        });
        
        await db.query(`UPDATE ai_jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`, [jobId]);
        
        res.json({ draft: aiResultString });

    } catch (err) {
        if (jobId) {
            // Sicherstellen, dass der Job-Status bei einem Fehler aktualisiert wird
            await db.query(`UPDATE ai_jobs SET status = 'failed' WHERE id = $1`, [jobId]);
        }
        console.error('Error in generateApplicationDraft:', err.message);
        res.status(500).send('Ein interner Serverfehler ist aufgetreten.');
    }
};