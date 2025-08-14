// backend/controllers/dataController.js
const axios = require('axios');
const db = require('../config/db');
const { sendEmail } = require('../services/emailService');
const FUEL_PRICE_API_KEY = process.env.FUEL_PRICE_API_KEY;
const FUEL_PRICE_API_URL = process.env.FUEL_PRICE_API_URL;
const TANKERKOENIG_API_KEY = process.env.TANKERKOENIG_API_KEY;
const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);


// --- HILFSFUNKTIONEN ---
const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const normalizeTankerkoenigStation = (station, countryCode) => ({
    id: station.id,
    name: station.name,
    brand: station.brand,
    street: station.street,
    houseNumber: station.houseNumber,
    postCode: station.postCode.toString().padStart(5, '0'),
    city: station.place,
    lat: station.lat,
    lng: station.lng,
    countryCode: countryCode.toUpperCase(),
});

const normalizeEControlStation = (station, countryCode) => ({
    id: station.id.toString(),
    name: station.name,
    brand: station.name.split(' ')[0],
    street: station.location.address.split(',')[0].trim(),
    houseNumber: '',
    postCode: station.location.postalCode,
    city: station.location.city,
    lat: station.location.latitude,
    lng: station.location.longitude,
    countryCode: countryCode.toUpperCase(),
});


// --- HAUPT-CONTROLLER-FUNKTIONEN ---
exports.fuelSearch = async (req, res) => {
    const { country, fuelType, lat, lng, rad, query, sortBy } = req.query;

    if (!country) {
        return res.status(400).json({ ok: false, message: 'Länder-Code ist erforderlich.' });
    }

    try {
        let location = { lat, lng };

        if (query && (!lat || !lng)) {
            const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=${country.toLowerCase()}`;
            const geoResponse = await axios.get(geocodeUrl, { headers: { 'User-Agent': 'Fleet-KI-Dashboard/1.0' } });
            
            if (geoResponse.data.length === 0) {
                return res.status(404).json({ ok: false, message: `Ort '${query}' konnte nicht gefunden werden.` });
            }
            const geoResult = geoResponse.data[0];
            location = { lat: parseFloat(geoResult.lat), lng: parseFloat(geoResult.lon) };
        }

        let stations = [];

        // Provider-Logik basierend auf dem Land
        switch (country.toUpperCase()) {
            case 'DE':
                // Code für Deutschland bleibt unverändert
                if (!TANKERKOENIG_API_KEY) throw new Error('Tankerkönig API-Schlüssel ist nicht konfiguriert.');
                const deParams = {
                    lat: location.lat, lng: location.lng, rad: rad || 10,
                    type: fuelType || 'all', sort: sortBy === 'dist' ? 'dist' : 'price',
                    apikey: TANKERKOENIG_API_KEY,
                };
                const deResponse = await axios.get('https://creativecommons.tankerkoenig.de/json/list.php', { params: deParams });
                if (!deResponse.data.ok) throw new Error(deResponse.data.message);
                stations = deResponse.data.stations.map(s => normalizeTankerkoenigStation(s, country));
                break;

case 'AT':
    // KORREKTE E-Control-API verwenden!
    const atApiBaseUrl = 'https://api.e-control.at/sprit/1.0';
    const atParams = {
        latitude: location.lat,
        longitude: location.lng,
        fuelType: fuelType === 'e5' || fuelType === 'e10' ? 'SUP' : 'DIE',
    };
    // Optional: address, wenn du PLZ/Ort an den User sendest:
    if (query) atParams.address = query;
    // Jetzt richtigen Endpunkt nutzen:
    const atResponse = await axios.get(`${atApiBaseUrl}/search/gas-stations/by-address`, {
        params: atParams,
        headers: { 'User-Agent': 'Fleet-KI-Dashboard/1.0' }
    });
    stations = atResponse.data.map(s => normalizeEControlStation(s, country));
    if (sortBy === 'dist') {
        stations.sort((a, b) => getDistance(location.lat, location.lng, a.lat, a.lng) - getDistance(location.lat, location.lng, b.lat, b.lng));
    }
    break;


            case 'FR':
            case 'ES':
            case 'IT':
            case 'GR':
                 return res.status(400).json({ ok: false, message: `Spritpreis-Suche für ${country.toUpperCase()} ist noch nicht implementiert.` });

            default:
                return res.status(400).json({ ok: false, message: `Land '${country}' wird aktuell nicht unterstützt.` });
        }
        
        return res.json({ ok: true, stations });

    } catch (error) {
        console.error(`Fehler bei der Tankstellen-Suche für ${country}:`, error.message);
        return res.status(500).json({ ok: false, message: `Fehler bei der Kommunikation mit dem Provider für ${country.toUpperCase()}.` });
    }
};


exports.getPricesByIds = async (req, res) => {
    const { ids, country } = req.query;
    if (!ids || !country) return res.status(400).json({ ok: false, message: 'IDs und Länder-Code sind erforderlich.' });

    try {
        let prices = {};
        switch (country.toUpperCase()) {
            case 'DE':
                if (!TANKERKOENIG_API_KEY) throw new Error('Tankerkönig API-Schlüssel ist nicht konfiguriert.');
                const deParams = { ids, apikey: TANKERKOENIG_API_KEY };
                const deResponse = await axios.get('https://creativecommons.tankerkoenig.de/json/prices.php', { params: deParams });
                if (!deResponse.data.ok) throw new Error(deResponse.data.message);
                prices = deResponse.data.prices;
                break;
            
            // === KORRIGIERTER BLOCK FÜR ÖSTERREICH ===
            case 'AT':
                const atApiUrl = 'https://api.e-control.at/sprit/1.0/get-prices/by-ids';
                const idArray = ids.split(',');

                // Die E-Control API kann mehrere IDs in einem einzigen Aufruf verarbeiten.
                const atResponse = await axios.post(atApiUrl, idArray, {
                    headers: { 'Content-Type': 'application/json' }
                });

                if (atResponse.data && atResponse.data.length > 0) {
                    atResponse.data.forEach(station => {
                        prices[station.id] = {
                            status: 'open', // Annahme, da die neue API keinen Status pro ID liefert
                            diesel: station.prices.find(p => p.fuelType === 'DIE')?.amount || null,
                            e5: station.prices.find(p => p.fuelType === 'SUP')?.amount || null,
                            e10: null, // E-Control liefert kein separates E10
                        };
                    });
                }
                break;

            case 'FR':
            case 'ES':
            case 'IT':
            case 'GR':
                return res.status(400).json({ ok: false, message: `Preise für ${country.toUpperCase()} sind noch nicht implementiert.` });

            default:
                return res.status(400).json({ ok: false, message: `Land '${country}' wird aktuell nicht unterstützt.` });
        }
        return res.json({ ok: true, prices });
    } catch (error) {
        console.error(`Fehler beim Abrufen der Preise für ${country}:`, error.message);
        return res.status(500).json({ ok: false, message: `Fehler bei der Kommunikation mit dem Provider für ${country.toUpperCase()}.` });
    }
};


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

exports.getVignetteCountries = async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT country_code as code, country_name as name
            FROM vignette_prices
            ORDER BY country_name ASC
        `;
        const result = await db.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Fehler beim Abrufen der Vignetten-Länder:', err);
        res.status(500).json({ message: 'Serverfehler beim Abrufen der Länderliste.' });
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

exports.getCommodityPrices = async (req, res) => {
    try {
        const indicators = ['BRENT_OIL', 'EUR_USD', 'EURIBOR_3M']; 
        const results = {};

        for (const indicator of indicators) {
            // Aktuellsten Preis und Quelle holen
            const latestPriceQuery = `
                SELECT value, unit, data_timestamp, source 
                FROM economic_indicators
                WHERE indicator_name = $1
                ORDER BY data_timestamp DESC
                LIMIT 1;
            `;
            const latestPriceResult = await db.query(latestPriceQuery, [indicator]);

            if (latestPriceResult.rows.length === 0) continue;

            const latest = latestPriceResult.rows[0];
            const currentPrice = parseFloat(latest.value);
            
            // Preis von vor einer Woche holen
            const weekAgoQuery = `
                SELECT value FROM economic_indicators
                WHERE indicator_name = $1 AND data_timestamp <= $2::date - interval '7 days'
                ORDER BY data_timestamp DESC
                LIMIT 1;
            `;
            const weekAgoResult = await db.query(weekAgoQuery, [indicator, latest.data_timestamp]);
            const weekAgoPrice = weekAgoResult.rows.length > 0 ? parseFloat(weekAgoResult.rows[0].value) : null;

            // Preis von vor einem Monat holen
            const monthAgoQuery = `
                SELECT value FROM economic_indicators
                WHERE indicator_name = $1 AND data_timestamp <= $2::date - interval '1 month'
                ORDER BY data_timestamp DESC
                LIMIT 1;
            `;
            const monthAgoResult = await db.query(monthAgoQuery, [indicator, latest.data_timestamp]);
            const monthAgoPrice = monthAgoResult.rows.length > 0 ? parseFloat(monthAgoResult.rows[0].value) : null;
            
            // === NEU: Preis von vor einem Jahr holen ===
            const yearAgoQuery = `
                SELECT value FROM economic_indicators
                WHERE indicator_name = $1 AND data_timestamp <= $2::date - interval '1 year'
                ORDER BY data_timestamp DESC
                LIMIT 1;
            `;
            const yearAgoResult = await db.query(yearAgoQuery, [indicator, latest.data_timestamp]);
            const yearAgoPrice = yearAgoResult.rows.length > 0 ? parseFloat(yearAgoResult.rows[0].value) : null;

            // Trend bestimmen (Vergleich mit dem Wert von vor einer Woche)
            let trend = 'stable';
            if (weekAgoPrice) {
                if (currentPrice > weekAgoPrice) trend = 'up';
                if (currentPrice < weekAgoPrice) trend = 'down';
            }

            results[indicator] = {
                currentPrice: currentPrice,
                unit: latest.unit,
                lastUpdate: latest.data_timestamp,
                source: latest.source,
                trend: trend,
                historical: {
                  weekAgo: weekAgoPrice,
                  monthAgo: monthAgoPrice,
                  yearAgo: yearAgoPrice // === NEU: Jahreswert zum Ergebnis hinzugefügt ===
                }
            };
        }

        res.json({ ok: true, data: results });

    } catch (error) {
        console.error('Fehler beim Abrufen der Rohstoffpreise aus der DB:', error.message);
        res.status(500).json({ ok: false, message: 'Fehler beim Abrufen der Rohstoffdaten.' });
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


exports.shareContentByEmail = async (req, res) => {
    const { title, summary, source, recipientEmail } = req.body;
    const { name: senderName, business_partner_id } = req.user;

    if (!title || !summary || !recipientEmail) {
        return res.status(400).json({ message: 'Titel, Inhalt und Empfänger-E-Mail sind erforderlich.' });
    }

    try {
        let fromName = 'KI-Dashboard';
        if (business_partner_id) {
            const bpResult = await db.query('SELECT dashboard_title FROM business_partners WHERE id = $1', [business_partner_id]);
            if (bpResult.rows.length > 0 && bpResult.rows[0].dashboard_title) {
                fromName = bpResult.rows[0].dashboard_title;
            }
        }

        const subject = `Info von ${fromName}: ${title}`;
        const htmlBody = `
            <p>Hallo,</p>
            <p><strong>${senderName}</strong> hat folgende Information mit Ihnen geteilt:</p>
            <hr>
            <h3>${title}</h3>
            <p>${summary}</p>
            ${source ? `<p>Weitere Details finden Sie in der Originalquelle: <a href="${source}">${source}</a></p>` : ''}
            <hr>
            <p style="font-size: 0.8em; color: #777;"><em>Diese E-Mail wurde automatisch von "${fromName}" versendet.</em></p>
        `;

        await sendEmail({
            to: recipientEmail,
            subject: subject,
            html: htmlBody,
            fromName: fromName,
        });

        res.status(200).json({ message: `Information erfolgreich an ${recipientEmail} gesendet.` });

    } catch (error) {
        console.error('Fehler bei der "Teilen"-Funktion:', error);
        res.status(500).json({ message: error.message || 'Der Inhalt konnte nicht geteilt werden.' });
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
    const { category, region, page = 1, limit = 5, search } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    if (!category) {
        return res.status(400).json({ message: 'Ein Kategorie-Name ist erforderlich.' });
    }

    try {
        // KORREKTUR: Lädt die aktuellen Benutzereinstellungen direkt aus der DB, um veraltete JWT-Daten zu umgehen.
        const userSettingsResult = await db.query(
            'SELECT article_score_min, article_score_max FROM users WHERE id = $1',
            [userId]
        );
        const { article_score_min, article_score_max } = userSettingsResult.rows[0] || {};
        
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

        if (search) {
            baseQuery += ` AND (title ILIKE $${paramIndex} OR generated_output ILIKE $${paramIndex})`;
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        // Score-Filter aus den frisch geladenen Benutzereinstellungen anwenden
        if (article_score_min !== null && typeof article_score_min !== 'undefined') {
            baseQuery += ` AND relevance_score >= $${paramIndex++}`;
            queryParams.push(article_score_min);
        }
        if (article_score_max !== null && typeof article_score_max !== 'undefined') {
            baseQuery += ` AND relevance_score <= $${paramIndex++}`;
            queryParams.push(article_score_max);
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

exports.getTagsForCategory = async (req, res) => {
    const { category, mainFilter } = req.query;

    if (!category) {
        return res.status(400).json({ message: 'Eine Kategorie ist erforderlich.' });
    }

    try {
        let query;
        const queryParams = [category];
        
        // Wenn ein Hauptfilter gesetzt ist, werden nur "Sub-Tags" gezählt.
        if (mainFilter) {
            queryParams.push(mainFilter);
            query = `
                SELECT
                    t.name,
                    COUNT(sct.scraped_content_id)::integer as count
                FROM
                    tags t
                JOIN
                    scraped_content_tags sct ON t.id = sct.tag_id
                WHERE
                    sct.scraped_content_id IN (
                        SELECT sc.id
                        FROM scraped_content sc
                        JOIN scraped_content_tags sct_main ON sc.id = sct_main.scraped_content_id
                        JOIN tags t_main ON sct_main.tag_id = t_main.id
                        WHERE sc.category ILIKE $1 AND t_main.name = $2
                    )
                    AND t.name != $2
                GROUP BY t.name
                ORDER BY count DESC, t.name ASC;
            `;
        } else {
            // Ohne Hauptfilter werden alle Tags der Kategorie gezählt.
            query = `
                SELECT
                    t.name,
                    COUNT(sct.scraped_content_id)::integer as count
                FROM tags t
                JOIN scraped_content_tags sct ON t.id = sct.tag_id
                JOIN scraped_content sc ON sct.scraped_content_id = sc.id
                WHERE sc.category ILIKE $1
                GROUP BY t.name
                ORDER BY count DESC, t.name ASC;
            `;
        }
        
        const result = await db.query(query, queryParams);
        const tags = result.rows.map(row => ({ name: row.name, count: row.count }));
        res.json(tags);
    } catch (err) {
        console.error(`Error fetching tags for category ${category}:`, err.message);
        res.status(500).json({ message: 'Fehler beim Abrufen der Tags.' });
    }
};


exports.getScrapedContent = async (req, res) => {
    const { id: userId, last_login_at: lastLogin, business_partner_id: businessPartnerId } = req.user;
    const {
        page = 1, limit = 10, sortBy = 'date', category, region, search,
        tag, // Das ist der "Sub-Tag" aus dem Dropdown
        mainFilter // NEU: Der Hauptfilter aus der Widget-Config
    } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    try {
        const userSettingsResult = await db.query(
            'SELECT article_score_min, article_score_max FROM users WHERE id = $1',
            [userId]
        );
        const { article_score_min, article_score_max } = userSettingsResult.rows[0] || {};
        
        const queryParams = [];
        let whereClauses = [];
        let paramIndex = 1;

        if (category) {
            if (category === 'businesspartner_news' || category === 'businesspartner_events') {
                if (!businessPartnerId) {
                    return res.json({ data: [], totalPages: 0, counts: { unread: 0, new: 0 } });
                }
                const sourceIdentifier = `${businessPartnerId}_${category.split('_')[1]}`;
                whereClauses.push(`sc.source_identifier = $${paramIndex++}`);
                queryParams.push(sourceIdentifier);
            } else {
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
        
        if (mainFilter) {
            whereClauses.push(`EXISTS (
                SELECT 1 FROM scraped_content_tags sct
                JOIN tags t ON sct.tag_id = t.id
                WHERE sct.scraped_content_id = sc.id AND t.name = $${paramIndex}
            )`);
            queryParams.push(mainFilter);
            paramIndex++;
        }
        
        if (tag && tag !== 'all') {
            whereClauses.push(`EXISTS (
                SELECT 1 FROM scraped_content_tags sct
                JOIN tags t ON sct.tag_id = t.id
                WHERE sct.scraped_content_id = sc.id AND t.name = $${paramIndex}
            )`);
            queryParams.push(tag);
            paramIndex++;
        }

        if (article_score_min !== null && typeof article_score_min !== 'undefined') {
            whereClauses.push(`sc.relevance_score >= $${paramIndex++}`);
            queryParams.push(article_score_min);
        }
        if (article_score_max !== null && typeof article_score_max !== 'undefined') {
            whereClauses.push(`sc.relevance_score <= $${paramIndex++}`);
            queryParams.push(article_score_max);
        }

        const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const baseQuery = `FROM scraped_content sc ${whereString}`;

        const countQuery = `SELECT COUNT(*) as total_items ${baseQuery}`;
        const totalResult = await db.query(countQuery, queryParams);
        const totalItems = parseInt(totalResult.rows[0].total_items, 10);
        const totalPages = Math.ceil(totalItems / limit);

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
            counts: counts,
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
    const { business_partner_id } = req.user;

    if (!business_partner_id) {
        return res.json({ data: [], totalPages: 0, counts: { new: 0 } });
    }

    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    const now = new Date();

    try {
        // Basis-Query, die nur die notwendigen Spalten abfragt
        const baseQuery = `
            FROM business_partner_actions
            WHERE
                business_partner_id = $1 AND
                is_active = TRUE AND
                (start_date IS NULL OR start_date <= $2) AND
                (end_date IS NULL OR end_date >= $2)
        `;
        const queryParams = [business_partner_id, now];

        // Gesamtzahl der Aktionen für die Paginierung ermitteln
        const totalQuery = `SELECT COUNT(*) ${baseQuery}`;
        const totalResult = await db.query(totalQuery, queryParams);
        const totalItems = parseInt(totalResult.rows[0].count, 10);
        const totalPages = Math.ceil(totalItems / limit);

        // Daten für die aktuelle Seite abrufen
        const dataQuery = `
            SELECT id, layout_type, title, content_text, link_url, image_url, created_at
            ${baseQuery}
            ORDER BY created_at DESC
            LIMIT $3 OFFSET $4
        `;
        const dataQueryParams = [...queryParams, limit, offset];
        const dataResult = await db.query(dataQuery, dataQueryParams);

        // Zähler für "neue" Aktionen (z.B. in den letzten 3 Tagen erstellt)
        const newQuery = `SELECT COUNT(*) FROM business_partner_actions WHERE business_partner_id = $1 AND is_active = TRUE AND created_at >= NOW() - INTERVAL '3 days'`;
        const newResult = await db.query(newQuery, [business_partner_id]);
        const counts = { new: parseInt(newResult.rows[0].count, 10) || 0 };

        res.json({ data: dataResult.rows, totalPages, counts });

    } catch (err) {
        // Verbessertes Fehler-Logging
        console.error('--- DATABASE ERROR in getActiveActionsForWidget ---');
        console.error('Timestamp:', new Date().toISOString());
        console.error('Error Message:', err.message);
        console.error('Full Error Object:', err);
        console.error('----------------------------------------------------');
        res.status(500).send('Serverfehler beim Abrufen der Aktionen.');
    }
}