// backend/controllers/dataController.js
const axios = require('axios');
const db = require('../config/db');
const FUEL_PRICE_API_KEY = process.env.FUEL_PRICE_API_KEY;
const FUEL_PRICE_API_URL = process.env.FUEL_PRICE_API_URL;
const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);



// --- NEU: Hilfsfunktion zur Anzeige der SQL-Abfrage ---
const logQuery = (query, params) => {
    let loggedQuery = query;
    for (let i = 0; i < params.length; i++) {
        // Ersetzt $1, $2 etc. durch die tatsächlichen Werte für eine leichtere Lesbarkeit
        const param = typeof params[i] === 'string' ? `'${params[i]}'` : params[i];
        loggedQuery = loggedQuery.replace(`$${i + 1}`, param);
    }
    console.log("--- Executing SQL ---");
    console.log(loggedQuery);
    console.log("---------------------");
};

// Optional: In-Memory-Cache zur Vermeidung häufiger API-Aufrufe für externe APIs
let fuelPriceCache = {
    data: null,
    timestamp: 0,
    ttl: 5 * 60 * 1000 // Time To Live: 5 Minuten
};

exports.getFuelPrices = async (req, res) => {
    // Prüfen, ob Daten im Cache noch gültig sind
    if (fuelPriceCache.data && (Date.now() - fuelPriceCache.timestamp < fuelPriceCache.ttl)) {
        console.log('Serving fuel prices from cache.');
        return res.json(fuelPriceCache.data);
    }

    try {
        if (!FUEL_PRICE_API_KEY || !FUEL_PRICE_API_URL) {
            console.warn('Fuel Price API Key or URL not set. Returning simulated data.');
            return res.json({
                source: 'Simulated External Fuel Prices (API Key Missing)',
                timestamp: new Date().toISOString(),
                data: [
                    { location: 'Vienna', diesel: 1.75, petrol: 1.89, unit: '€/Liter' },
                    { location: 'Berlin', diesel: 1.79, petrol: 1.93, unit: '€/Liter' },
                    { location: 'Paris', diesel: 1.88, petrol: 2.05, unit: '€/Liter' },
                ],
                trend: 'Data from external API, showing fallback data.',
            });
        }

        console.log('Fetching real fuel prices from external API...');
        const response = await axios.get(FUEL_PRICE_API_URL, {
            params: {
                api_key: FUEL_PRICE_API_KEY,
                country: 'AT,DE,FR', // Beispielparameter, ANPASSEN AN DIE ECHTE API
                fuel_type: 'diesel,petrol',
            },
        });

        const processedData = {
            source: 'Real Fuel Price API',
            timestamp: new Date().toISOString(),
            data: response.data.prices.map((price) => ({
                location: price.city || price.region,
                diesel: price.diesel || null,
                petrol: price.petrol || null,
                unit: price.unit || '€/Liter',
            })),
            trend: 'Data from external API, trend analysis requires further logic.',
        };

        fuelPriceCache.data = processedData;
        fuelPriceCache.timestamp = Date.now();

        res.json(processedData);
    } catch (err) {
        console.error('Error fetching real fuel prices:', err.message);
        res.status(500).json({
            message: err.message || 'Error fetching real fuel prices',
            source: 'Simulated External Fuel Prices (API Error)',
            timestamp: new Date().toISOString(),
            data: [
                { location: 'Vienna', diesel: 1.75, petrol: 1.89, unit: '€/Liter' },
                { location: 'Berlin', diesel: 1.79, petrol: 1.93, unit: '€/Liter' },
                { location: 'Paris', diesel: 1.88, petrol: 2.05, unit: '€/Liter' },
            ],
            trend: 'Data from external API failed, showing fallback data.',
        });
    }
};

exports.getTaxChanges = async (req, res) => {
    try {
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

        const result = await db.query(
            `SELECT id, title, summary, original_url, published_date, scraped_at, relevance_score
            FROM scraped_content
            WHERE source_identifier = 'steuer_at_kfz' AND published_date >= $1
            ORDER BY published_date DESC, scraped_at DESC`,
            [twoYearsAgo.toISOString()]
        );
        res.json({
            source: 'Internal Scraped Tax Changes (from scraped_content)',
            timestamp: new Date().toISOString(),
            data: result.rows.map(row => ({
                ...row,
                change_date: row.published_date ? new Date(row.published_date).toLocaleDateString('de-AT') : null,
                summary: row.summary || (row.full_text ? row.full_text.substring(0, 150) + '...' : null)
            })),
        });
    } catch (err) {
        console.error('Error fetching tax changes from scraped_content:', err.message);
        res.status(500).json({
            message: 'Error fetching tax changes',
            source: 'Internal Scraped Tax Changes (Error)',
            timestamp: new Date().toISOString(),
            data: [],
        });
    }
};

exports.getFleetAssociationNews = async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, title, summary, original_url, published_date, event_date, category, scraped_at
            FROM scraped_content
            WHERE source_identifier = 'fuhrpark_news' OR source_identifier = 'fuhrpark_events'
            ORDER BY published_date DESC, event_date DESC, scraped_at DESC
            LIMIT 20`
        );
        res.json({
            source: 'Internal Scraped Fleet Association News (from scraped_content)',
            timestamp: new Date().toISOString(),
            data: result.rows.map(row => ({
                ...row,
                description: row.summary || (row.full_text ? row.full_text.substring(0, 150) + '...' : null),
                published_date: row.published_date ? new Date(row.published_date).toLocaleDateString('de-AT') : null,
                event_date: row.event_date ? new Date(row.event_date).toLocaleDateString('de-AT') : null,
                type: row.category,
            })),
        });
    } catch (err) {
        console.error('Error fetching fleet association news from scraped_content:', err.message);
        res.status(500).json({
            message: 'Error fetching fleet association news',
            source: 'Internal Scraped Fleet Association News (Error)',
            timestamp: new Date().toISOString(),
            data: [],
        });
    }
};

exports.getTrafficInfo = async (req, res) => {
    const { regions, limit = 50, offset = 0 } = req.query;

    try {
        let query = `
            SELECT
                id, title, description, link, published_at,
                road_name, start_loc, end_loc, direction, type, region
            FROM traffic_incidents
        `;
        const queryParams = [];
        let whereClauses = [];
        let paramIndex = 1;

        if (regions) {
            const regionArray = Array.isArray(regions) ? regions : regions.split(',');
            if (regionArray.length > 0) {
                whereClauses.push(`region ILIKE ANY($${paramIndex}::text[])`);
                queryParams.push(regionArray);
                paramIndex++;
            }
        }
        
        if (whereClauses.length > 0) {
            query += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        query += ` ORDER BY published_at DESC, id DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        queryParams.push(parseInt(limit, 10));
        queryParams.push(parseInt(offset, 10));

        const result = await db.query(query, queryParams);

        res.json({
            source: 'Internal Scraped Traffic Info (from traffic_incidents)',
            timestamp: new Date().toISOString(),
            data: result.rows.map(row => ({
                ...row,
                published_at: row.published_at ? row.published_at.toISOString() : null,
                link: row.link || '#',
                relevance_score: 0 
            })),
        });
    } catch (err) {
        console.error('Error fetching traffic info from traffic_incidents:', err.message);
        res.status(500).json({
            message: 'Error fetching traffic info',
            data: [],
        });
    }
};

exports.getUniqueTrafficRegions = async (req, res) => {
    try {
        const result = await db.query(
            `SELECT DISTINCT region FROM traffic_incidents WHERE region IS NOT NULL AND region != '' ORDER BY region ASC`
        );
        res.json(result.rows.map(row => row.region));
    } catch (err) {
        console.error('Error fetching unique traffic regions:', err.message);
        res.status(500).json({
            message: 'Error fetching unique traffic regions',
            data: [],
        });
    }
};

exports.getBpScrapedContent = async (req, res) => {
    const { businessPartnerId, category } = req.query;
    const { id: userId } = req.user; // User-ID aus der Authentifizierung holen

    if (!businessPartnerId) {
        return res.status(400).json({ message: 'Business Partner ID is required.' });
    }
    if (!category || (category !== 'news' && category !== 'events')) {
        return res.status(400).json({ message: 'A valid category ("news" or "events") is required to build the source identifier.' });
    }

    const sourceIdentifier = `${businessPartnerId}_${category}`;
    
    const orderByClause = category === 'events' 
        ? 'ORDER BY sc.event_date DESC, sc.scraped_at DESC' 
        : 'ORDER BY sc.published_date DESC, sc.scraped_at DESC';

    try {
        const query = `
            SELECT 
                sc.id, sc.title, sc.summary, sc.original_url, sc.published_date, 
                sc.event_date, sc.category, sc.scraped_at, sc.region, sc.relevance_score,
                COALESCE(crv.vote, 0) as user_vote
            FROM scraped_content sc
            LEFT JOIN content_relevance_votes crv ON crv.content_id = sc.id AND crv.user_id = $2
            WHERE sc.source_identifier = $1
            ${orderByClause}
            LIMIT 5
        `;
        const queryParams = [sourceIdentifier, userId];

        const result = await db.query(query, queryParams);

        res.json({
            source: `Scraped Content for BP ${businessPartnerId} (Source: ${sourceIdentifier})`,
            timestamp: new Date().toISOString(),
            data: result.rows,
        });

    } catch (err) {
        console.error(`Error fetching BP scraped content for ${businessPartnerId}, category ${category}:`, err.message);
        res.status(500).json({
            message: `Error fetching BP scraped content for ${businessPartnerId}.`,
            data: [],
        });
    }
};


exports.getVignettePrices = async (req, res) => {
    const { country } = req.query;

    if (!country) {
        return res.status(400).json({ message: 'Länderkürzel (country) ist erforderlich.' });
    }

    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;

    try {
        const query = `
            SELECT country_name, year, price, currency_code, vignette_requirement_car, toll_system_truck, provider_url
            FROM vignette_prices 
            WHERE country_code = $1 AND (year IN ($2, $3) OR year = 2025)
            ORDER BY year ASC
        `;
        
        const result = await db.query(query, [country, currentYear, previousYear]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Keine Daten für dieses Land gefunden.' });
        }
        
        const rows = result.rows;
        const infoRow = rows[0];

        const responseData = {
            country_name: infoRow.country_name,
            vignette_system_car: infoRow.vignette_requirement_car,
            toll_system_truck: infoRow.toll_system_truck,
            provider_url: infoRow.provider_url,
            chart_data: rows
                .filter(row => row.price !== null)
                .map(row => ({
                    year: row.year.toString(),
                    price: parseFloat(row.price),
                    currency: row.currency_code
                }))
        };
        
        res.json(responseData);

    } catch (err) {
        console.error('Fehler beim Abrufen der Vignettendaten:', err);
        res.status(500).json({ message: 'Serverfehler beim Abrufen der Daten.' });
    }
};


exports.voteOnContent = async (req, res) => {
    const { contentId } = req.params;
    const { id: userId } = req.user;
    const { vote, contentType } = req.body;

    if (!userId) return res.status(401).json({ message: 'Authentication required.' });
    if (vote !== 1 && vote !== -1) return res.status(400).json({ message: 'Invalid vote value.' });
    if (!contentType || !['scraped_content', 'ai_content'].includes(contentType)) {
        return res.status(400).json({ message: 'Invalid content type.' });
    }

    const voteTable = contentType === 'ai_content' ? 'user_ai_content_votes' : 'content_relevance_votes';
    const contentTable = contentType === 'ai_content' ? 'ai_generated_content' : 'scraped_content';
    const contentIdColumn = contentType === 'ai_content' ? 'ai_content_id' : 'content_id';

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        
        const currentVoteRes = await client.query(`SELECT vote FROM ${voteTable} WHERE user_id = $1 AND ${contentIdColumn} = $2`, [userId, contentId]);
        const currentVote = currentVoteRes.rows.length > 0 ? currentVoteRes.rows[0].vote : 0;
        
        let newVote = vote;
        if (currentVote === vote) {
            newVote = 0;
        }

        const voteQuery = `
            INSERT INTO ${voteTable} (user_id, ${contentIdColumn}, vote) VALUES ($1, $2, $3) 
            ON CONFLICT (user_id, ${contentIdColumn}) DO UPDATE SET vote = $3;
        `;
        await client.query(voteQuery, [userId, contentId, newVote]);
        
        const scoreQuery = `SELECT SUM(vote) as new_score FROM ${voteTable} WHERE ${contentIdColumn} = $1`;
        const scoreResult = await client.query(scoreQuery, [contentId]);
        const newScore = parseInt(scoreResult.rows[0].new_score || 0, 10);
        
        const updateScoreQuery = `UPDATE ${contentTable} SET relevance_score = $1 WHERE id = $2 RETURNING relevance_score;`;
        const finalResult = await client.query(updateScoreQuery, [newScore, contentId]);
        
        await client.query('COMMIT');
        res.status(200).json(finalResult.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error processing vote:', err.message);
        res.status(500).json({ message: 'Error processing vote.' });
    } finally {
        client.release();
    }
};

exports.markContentAsRead = async (req, res) => {
    const { id: userId } = req.user;
    const { contentId } = req.params;
    try {
        await db.query(
            'INSERT INTO user_read_ai_content (user_id, ai_content_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [userId, contentId]
        );
        res.status(200).json({ message: 'Content marked as read.' });
    } catch (err) {
        console.error('Error marking content as read:', err.message);
        res.status(500).send('Server error');
    }
};


// NEU: Funktion zur Generierung eines E-Mail-Entwurfs mittels KI
exports.generateEmailFromContent = async (req, res) => {
    const { title, content } = req.body;
    const { name: userName } = req.user; // Name des angemeldeten Benutzers

    if (!content || !title) {
        return res.status(400).json({ message: 'Titel und Inhalt sind zur E-Mail-Generierung erforderlich.' });
    }

    // Hier wird der externe KI-Dienst aufgerufen.
    // WICHTIG: Ersetzen Sie dies durch Ihren tatsächlichen KI-Service-Aufruf (z.B. OpenAI, Google Gemini, etc.)
    // Die folgende Implementierung simuliert den Aufruf und gibt eine strukturierte Antwort zurück.
    
    const prompt = `
        Erstelle einen E-Mail-Newsletter für die Fahrer eines Fuhrparks.
        Der Absender ist der Fuhrparkleiter "${userName}".
        Das Thema ist: "${title}".
        
        Der Inhalt, der zusammengefasst und erklärt werden soll, lautet:
        ---
        ${content}
        ---

        Struktur der Antwort:
        - Formuliere einen klaren und prägnanten E-Mail-Betreff.
        - Schreibe einen freundlichen, informativen E-Mail-Text. Sprich die Fahrer direkt an (z.B. "Liebes Fahrerteam,").
        - Erkläre den Sachverhalt einfach und verständlich.
        - Gib am Ende eine klare Handlungsaufforderung, falls notwendig.
        - Beende die E-Mail mit einer freundlichen Grußformel.

        Gib das Ergebnis als JSON-Objekt mit den Schlüsseln "subject" und "body" zurück.
    `;

    try {
        // --- SIMULATION EINES KI-AUFRUFS ---
        // In einer echten Anwendung würden Sie hier den API-Call zu Ihrer KI machen.
        // const aiResponse = await axios.post('https://api.openai.com/v1/completions', { ... });
        console.log("--- Generating Email with Prompt ---");
        console.log(prompt);
        console.log("------------------------------------");

        // Simulierte Antwort für Entwicklungszwecke
        const simulatedAiResponse = {
            subject: `Wichtige Information: ${title}`,
            body: `Liebes Fahrerteam,\n\nwir möchten euch über eine wichtige Neuerung informieren, die uns alle betrifft.\n\n${content}\n\nWas bedeutet das für euch? Achtet bitte ab sofort auf [hier konkrete Anweisung einfügen, z.B. die geänderten Parkregelungen].\n\nBei Fragen stehe ich euch jederzeit zur Verfügung.\n\nBeste Grüße und allzeit gute Fahrt,\n\n${userName}`
        };

        res.json(simulatedAiResponse);

    } catch (error) {
        console.error('Fehler bei der KI-Anfrage zur E-Mail-Generierung:', error);
        res.status(500).json({ message: 'Der E-Mail-Entwurf konnte aufgrund eines internen Fehlers nicht erstellt werden.' });
    }
};


exports.getBusinessPartnerUserStatsForUser = async (req, res) => {
    const { bpId } = req.params;
    const { role: requesterRole, business_partner_id: requesterBpId } = req.user;

    if (requesterRole !== 'admin' && requesterBpId !== bpId) {
        return res.status(403).json({ message: 'Permission denied.' });
    }
    if (!isValidUUID(bpId)) {
        return res.status(400).json({ message: 'Invalid Business Partner ID format.' });
    }

    try {
        const statsQuery = `
            SELECT is_active, COUNT(*) as count 
            FROM users 
            WHERE business_partner_id = $1 
            GROUP BY is_active;
        `;
        const result = await db.query(statsQuery, [bpId]);
        
        const stats = { active: 0, inactive: 0 };
        result.rows.forEach(row => {
            if (row.is_active) {
                stats.active = parseInt(row.count, 10);
            } else {
                stats.inactive = parseInt(row.count, 10);
            }
        });
        res.json(stats);
    } catch (err) {
        console.error('Error fetching user stats:', err.message);
        res.status(500).send('Server error');
    }
};

// Stellt die für den Benutzer sichtbaren AI Prompt Rules bereit.
exports.getAIPromptRulesForUser = async (req, res) => {
    try {
        const result = await db.query('SELECT id, name, default_category_id FROM ai_prompt_rules ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching AI prompt rules for user:', err.message);
        res.status(500).send('Server error');
    }
};

// Stellt die für den Benutzer sichtbaren Kategorien bereit.
exports.getCategoriesForUser = async (req, res) => {
    try {
        const result = await db.query('SELECT id, name FROM categories ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching categories for user:', err.message);
        res.status(500).send('Server error');
    }
};

exports.getAiContent = async (req, res) => {
    const { id: userId, last_login_at: lastLogin } = req.user;
    // NEU: Suchparameter wird aus der Anfrage ausgelesen
    const { category, region, page = 1, limit = 5, search } = req.query; 
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    if (!category) {
        return res.status(400).json({ message: 'Ein Kategorie-Name ist erforderlich.' });
    }

    try {
        const categoryResult = await db.query("SELECT id FROM categories WHERE name = $1 LIMIT 1", [category]);
        if (categoryResult.rows.length === 0) {
            return res.json({ data: [], counts: { unread: 0, new: 0 }, totalPages: 0 });
        }
        const categoryId = categoryResult.rows[0].id;

        // Basis-Query und Parameter-Array werden dynamisch aufgebaut
        let baseQuery = 'FROM ai_generated_content WHERE category_id = $1';
        const queryParams = [categoryId];
        let paramIndex = 2;

        if (region && region !== 'all') {
            baseQuery += ` AND region = $${paramIndex++}`;
            queryParams.push(region);
        }
        
        // NEU: Wenn ein Suchbegriff vorhanden ist, wird die Query erweitert
        if (search) {
            baseQuery += ` AND (title ILIKE $${paramIndex} OR generated_output ILIKE $${paramIndex})`;
            queryParams.push(`%${search}%`); // Umgibt den Suchbegriff mit % für die Teilstring-Suche
            paramIndex++;
        }
        
        // Gesamtzahl der Artikel für die Paginierung ermitteln (berücksichtigt jetzt den Filter)
        const countQuery = `SELECT COUNT(DISTINCT id) as total_items ${baseQuery}`;
        const totalResult = await db.query(countQuery, queryParams);
        const totalItems = parseInt(totalResult.rows[0].total_items, 10);
        const totalPages = Math.ceil(totalItems / limit);

        // Zählung für "ungelesen" und "neu"
        const countsQuery = `
            WITH all_content AS (
                SELECT id, created_at, user_id
                ${baseQuery}
            )
            SELECT 
                (SELECT COUNT(*) FROM all_content ac WHERE NOT EXISTS (SELECT 1 FROM user_read_ai_content urac WHERE urac.ai_content_id = ac.id AND urac.user_id = $${paramIndex})) as unread_count,
                (SELECT COUNT(*) FROM all_content WHERE created_at > $${paramIndex + 1}) as new_count
        `;
        const countsParams = [...queryParams, userId, lastLogin || new Date(0)];
        const countsResult = await db.query(countsQuery, countsParams);
        const counts = {
            unread: parseInt(countsResult.rows[0].unread_count, 10) || 0,
            new: parseInt(countsResult.rows[0].new_count, 10) || 0,
        };

        // Daten für die aktuelle Seite abrufen (berücksichtigt jetzt den Filter)
        const dataQuery = `
            SELECT 
                id, title, generated_output as summary, source_reference as original_url,
                created_at as published_date, relevance_score,
                CASE
                    WHEN user_id = $${paramIndex} THEN 'personal_subscription'
                    WHEN user_id IS NOT NULL AND user_id != $${paramIndex} THEN 'popular'
                    ELSE 'system_generated'
                END as origin,
                EXISTS (SELECT 1 FROM user_read_ai_content urac WHERE urac.ai_content_id = ai_generated_content.id AND urac.user_id = $${paramIndex}) as is_read
            ${baseQuery}
            ORDER BY
                CASE
                    WHEN user_id = $${paramIndex} THEN 1
                    WHEN user_id IS NOT NULL AND user_id != $${paramIndex} THEN 2
                    ELSE 3
                END,
                created_at DESC
            LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
        `;
        const dataParams = [...queryParams, userId, parseInt(limit, 10), offset];
        const result = await db.query(dataQuery, dataParams);
        
        res.json({
            source: `Intelligenter Feed für: ${category}`,
            timestamp: new Date().toISOString(),
            data: result.rows,
            counts: counts,
            totalPages: totalPages,
            currentPage: parseInt(page, 10)
        });

    } catch (err) {
        console.error(`Error fetching AI content for category ${category}:`, err.message);
        res.status(500).json({ message: 'Error fetching AI content', data: [] });
    }
};


// Funktion zum Abrufen aller Regionen aus der Datenbank
exports.getAllRegions = async (req, res) => {
    try {
        // KORREKTUR: latitude und longitude werden jetzt mit ausgelesen
        const result = await db.query('SELECT id, name, code, latitude, longitude FROM regions ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching all regions:', err.message);
        res.status(500).send('Server error');
    }
};

exports.getEVStations = async (req, res) => {
    const { countrycode, city, maxresults = 50, offset = 0 } = req.query;
    const apiKey = process.env.OPENCHARGEMAP_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ message: 'API Key fehlt!' });
    }
    if (!countrycode) {
        return res.status(400).json({ message: 'countrycode fehlt!' });
    }
    if (!city) {
        return res.status(400).json({ message: 'city (Ort/Stadt) ist erforderlich.' });
    }

    try {
        const params = {
            output: 'json',
            countrycode,
            maxresults: 1000, // API-Limit!
            key: apiKey,
        };

        const response = await axios.get('https://api.openchargemap.io/v3/poi/', { params });
        // Stadt-Filter (Case-insensitive)
        const filtered = response.data.filter(st =>
            (st.AddressInfo?.Town || '').toLowerCase().includes(city.trim().toLowerCase())
        );

        // Pagination nach dem Filtern:
        const start = parseInt(offset, 10) || 0;
        const end = start + parseInt(maxresults, 10) || 50;
        const paged = filtered.slice(start, end);

        res.json({
            stations: paged,
            totalCount: filtered.length,
        });
    } catch (err) {
        console.error('OCM API error:', err?.response?.data || err.message);
        res.status(502).json({ message: 'Fehler bei OCM API', error: err?.response?.data || err.message });
    }
};

exports.getScrapedContent = async (req, res) => {
    // NEU: Business Partner ID wird aus den Benutzerdaten extrahiert
    const { id: userId, last_login_at: lastLogin, business_partner_id: businessPartnerId } = req.user;
    const {
        page = 1,
        limit = 10,
        sortBy = 'date', // 'date' oder 'relevance'
        category,
        region,
        search
    } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    try {
        const queryParams = [];
        let whereClauses = [];
        let paramIndex = 1;

        if (category) {
            // NEU: Logik zur Handhabung von Business-Partner-spezifischen Kategorien
            if (category === 'businesspartner_news' || category === 'businesspartner_events') {
                if (!businessPartnerId) {
                    // Wenn der Benutzer keinem BP zugeordnet ist, kann er keine BP-spezifischen Inhalte sehen.
                    return res.json({ data: [], totalPages: 0, counts: { unread: 0, new: 0 } });
                }
                // Erstellt den erwarteten source_identifier, z.B. 'uuid-1234_news'
                const sourceIdentifier = `${businessPartnerId}_${category.split('_')[1]}`;
                whereClauses.push(`sc.source_identifier = $${paramIndex++}`);
                queryParams.push(sourceIdentifier);
            } else {
                // Standard-Filterung für alle anderen Kategorien
                whereClauses.push(`sc.category = $${paramIndex++}`);
                queryParams.push(category);
            }
        }
        
        if (region && region !== 'all') {
            whereClauses.push(`sc.region = $${paramIndex++}`);
            queryParams.push(region);
        }

        if (search) {
            whereClauses.push(`(sc.title ILIKE $${paramIndex} OR sc.summary ILIKE $${paramIndex})`);
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        
        const baseQuery = `FROM scraped_content sc ${whereString}`;

        const countQuery = `SELECT COUNT(*) as total_items ${baseQuery}`;
        const totalResult = await db.query(countQuery, queryParams);
        const totalItems = parseInt(totalResult.rows[0].total_items, 10);
        const totalPages = Math.ceil(totalItems / limit);

        // Zählung für "ungelesen" und "neu"
        const countsQuery = `
            WITH filtered_content AS (
                SELECT id, scraped_at
                ${baseQuery}
            )
            SELECT 
                (SELECT COUNT(*) FROM filtered_content fc WHERE NOT EXISTS (SELECT 1 FROM user_read_scraped_content ursc WHERE ursc.scraped_content_id = fc.id AND ursc.user_id = $${paramIndex})) as unread_count,
                (SELECT COUNT(*) FROM filtered_content WHERE scraped_at > $${paramIndex + 1}) as new_count
        `;
        const countsParams = [...queryParams, userId, lastLogin || new Date(0)];
        const countsResult = await db.query(countsQuery, countsParams);
        const counts = {
            unread: parseInt(countsResult.rows[0].unread_count, 10) || 0,
            new: parseInt(countsResult.rows[0].new_count, 10) || 0,
        };

        let orderByClause = 'ORDER BY sc.published_date DESC, sc.scraped_at DESC';
        if (sortBy === 'relevance') {
            orderByClause = 'ORDER BY sc.relevance_score DESC, sc.published_date DESC';
        }

        const dataQuery = `
            SELECT
                sc.id, sc.title, sc.summary, sc.original_url, sc.published_date,
                sc.event_date, sc.category, sc.scraped_at, sc.relevance_score, sc.region,
                EXISTS (
                    SELECT 1 FROM user_read_scraped_content ursc 
                    WHERE ursc.scraped_content_id = sc.id AND ursc.user_id = $${paramIndex}
                ) as is_read,
                COALESCE(crv.vote, 0) as user_vote
            FROM scraped_content sc
            LEFT JOIN content_relevance_votes crv ON crv.content_id = sc.id AND crv.user_id = $${paramIndex}
            ${whereString}
            ${orderByClause}
            LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
        `;

        const finalParams = [...queryParams, userId, parseInt(limit, 10), offset];
        const result = await db.query(dataQuery, finalParams);

        res.json({
            source: 'Scraped Content Feed',
            timestamp: new Date().toISOString(),
            data: result.rows,
            totalPages: totalPages,
            currentPage: parseInt(page, 10),
            counts: counts, // Zählungen hinzufügen
        });

    } catch (err) {
        console.error(`Error fetching scraped content:`, err.message);
        res.status(500).json({ message: 'Error fetching scraped content', data: [] });
    }
};

/**
 * Markiert einen gescrapten Inhalt als vom Benutzer gelesen.
 */
exports.markScrapedContentAsRead = async (req, res) => {
    const { id: userId } = req.user;
    const { contentId } = req.params;
    try {
        await db.query(
            'INSERT INTO user_read_scraped_content (user_id, scraped_content_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [userId, contentId]
        );
        res.status(200).json({ message: 'Content marked as read.' });
    } catch (err) {
        console.error('Error marking scraped content as read:', err.message);
        res.status(500).send('Server error');
    }
};

exports.getActiveAdvertisement = async (req, res) => {
    const { business_partner_id } = req.user;

    try {
        // Findet die spezifischste, aktive Anzeige:
        // 1. Zuerst eine für den Business Partner, die jetzt aktiv ist.
        // 2. Wenn nicht gefunden, eine globale Anzeige, die jetzt aktiv ist.
        const query = `
            SELECT content, id FROM advertisements
            WHERE 
                is_active = TRUE AND
                (start_date IS NULL OR start_date <= NOW()) AND
                (end_date IS NULL OR end_date >= NOW()) AND
                (business_partner_id = $1 OR business_partner_id IS NULL)
            ORDER BY 
                business_partner_id DESC NULLS LAST -- Spezifische Anzeigen vor globalen
            LIMIT 1;
        `;
        const result = await db.query(query, [business_partner_id]);

        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.json(null); // Keine aktive Anzeige gefunden
        }
    } catch (err) {
        console.error('Error fetching active advertisement:', err.message);
        res.status(500).send('Server Error');
    }
};

exports.getActiveActionsForWidget = async (req, res) => {
    // Annahme: req.user wird von der authMiddleware bereitgestellt
    const { business_partner_id, id: user_id } = req.user;

    // Wenn der Benutzer keinem Partner zugeordnet ist, gibt es keine Aktionen
    if (!business_partner_id) {
        return res.json({ data: [], totalPages: 0, counts: { unread: 0, new: 0 } });
    }

    const { page = 1, limit = 10, sortBy = 'date', search = '' } = req.query;
    const offset = (page - 1) * limit;
    const now = new Date();

    try {
        let baseQuery = `
            FROM business_partner_actions a
            WHERE 
                a.business_partner_id = $1 AND 
                a.is_active = TRUE AND
                (a.start_date IS NULL OR a.start_date <= $2) AND
                (a.end_date IS NULL OR a.end_date >= $2)
        `;
        const queryParams = [business_partner_id, now];
        let paramIndex = 3;

        if (search) {
            baseQuery += ` AND (a.title ILIKE $${paramIndex} OR a.content_text ILIKE $${paramIndex})`;
            queryParams.push(`%${search}%`);
            paramIndex++;
        }
        
        // Gesamtzahl der Ergebnisse für die Paginierung ermitteln
        const totalResult = await pool.query(`SELECT COUNT(*) ${baseQuery}`, queryParams);
        const totalItems = parseInt(totalResult.rows[0].count, 10);
        const totalPages = Math.ceil(totalItems / limit);

        // Daten für die aktuelle Seite abrufen
        // HINWEIS: is_read Logik wurde vereinfacht, um Fehler zu vermeiden.
        // Sie benötigen eine 'user_read_status' Tabelle für die volle Funktionalität.
        const dataQuery = `
            SELECT a.id, a.layout_type, a.title, a.content_text, a.link_url, a.image_url, a.created_at,
                   false as is_read 
            ${baseQuery}
            ORDER BY ${sortBy === 'title' ? 'a.title' : 'a.created_at'} DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        
        const finalQueryParams = [...queryParams, limit, offset];
        const dataResult = await pool.query(dataQuery, finalQueryParams);

        // Platzhalter für Zählungen
        const counts = { unread: 0, new: 0 };

        res.json({ data: dataResult.rows, totalPages, counts });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfehler');
    }
};