// backend/controllers/dataController.js
const axios = require('axios');
const db = require('../config/db');
const { sendEmail } = require('../services/emailService');
const { renderLayout } = require('../services/emailTemplates');
const TANKERKOENIG_API_KEY = process.env.TANKERKOENIG_API_KEY;
const ECONTROL_API_KEY     = process.env.ECONTROL_API_KEY;
const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);
const toStr  = (v) => (v === null || v === undefined) ? '' : String(v);
const normNum = (v) => (v === null || v === undefined) ? null : Number(v);

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

const normalizeEControlStation = (station) => {
    const chargePoint = station.chargePoints && station.chargePoints[0];
    if (!chargePoint) return null;

    return {
        external_id: `AT-${station.id}`,
        provider: 'E-Control',
        name: station.name,
        operator_name: station.operatorName,
        street: station.address,
        post_code: station.postalCode,
        city: station.city,
        country_code: 'AT',
        lat: station.latitude,
        lng: station.longitude,
        charge_point_count: station.chargePoints.length,
        power_kw: chargePoint.power,
        connector_types: [...new Set(station.chargePoints.map(p => p.connector).flat())],
    };
};

const normalizeOcmStation = (station) => {
    const connections = station.Connections || [];
    const highestPower = connections.length > 0 ? Math.max(...connections.map(c => c.PowerKW || 0)) : null;

    return {
        external_id: `OCM-${station.ID}`,
        provider: 'OpenChargeMap',
        name: station.AddressInfo.Title,
        operator_name: station.OperatorInfo?.Title || 'Unbekannt',
        street: station.AddressInfo.AddressLine1,
        post_code: station.AddressInfo.Postcode,
        city: station.AddressInfo.Town,
        country_code: station.AddressInfo.Country?.ISOCode || null,
        lat: station.AddressInfo.Latitude,
        lng: station.AddressInfo.Longitude,
        charge_point_count: connections.length,
        power_kw: highestPower,
        connector_types: [...new Set(connections.map(c => c.ConnectionType?.Title).filter(Boolean))],
    };
};

function mapFuelKeyDE(k) {
  return k;
}

function mapFuelKeyAT(k) {
  if (k === 'DIE') return 'diesel';
  if (k === 'SUP') return 'e5';
  return null;
}

async function upsertFavoritesPriceCache(userId, stationsToUpdate) {
  if (!userId || !stationsToUpdate?.length) return;
  const client = await db.connect();
  try {
    const sql = `
      UPDATE public.user_favorites
      SET
        last_diesel   = $3,
        last_e5       = $4,
        last_e10      = $5,
        last_status   = $6,
        last_price_ts = NOW(),
        updated_at    = NOW()
      WHERE
        user_id = $1 AND external_id = $2;
    `;
    for (const station of stationsToUpdate) {
      const params = [
        userId,
        station.id,
        station.diesel ?? null,
        station.e5 ?? null,
        station.e10 ?? null,
        station.status ?? null
      ];
      await client.query(sql, params);
    }
  } finally {
    client.release();
  }
}

function normalizeDEDetail(detail, priceObj) {
  return {
    id: toStr(detail.id),
    countryCode: 'DE',
    name: detail.name || null,
    brand: detail.brand || null,
    street: detail.street || null,
    houseNumber: detail.houseNumber || null,
    postCode: detail.postCode ? String(detail.postCode) : null,
    city: detail.place || null,
    lat: normNum(detail.lat),
    lng: normNum(detail.lng),
    diesel: priceObj?.diesel ?? null,
    e5:     priceObj?.e5 ?? null,
    e10:    priceObj?.e10 ?? null,
    status: priceObj?.status || null,
  };
}

function normalizeATStation(station) {
  const priceMap = {};
  (station.prices || []).forEach(p => {
    const key = mapFuelKeyAT(p.fuelType);
    if (key) priceMap[key] = p.amount;
  });
  const addr = station.location?.address || '';
  let street = addr;
  let houseNumber = null;
  const m = addr.match(/^(.+?)\s+(\d+[a-zA-Z]?)$/);
  if (m) { street = m[1]; houseNumber = m[2]; }

  return {
    id: toStr(station.id),
    countryCode: 'AT',
    name: station.name || null,
    brand: (station.name || '').split(' ')[0] || null,
    street,
    houseNumber,
    postCode: station.location?.postalCode ? String(station.location.postalCode) : null,
    city: station.location?.city || null,
    lat: normNum(station.location?.latitude),
    lng: normNum(station.location?.longitude),
    diesel: priceMap.diesel ?? null,
    e5:     priceMap.e5 ?? null,
    e10:    null,
    status: 'open'
  };
}

exports.fuelSearch = async (req, res) => {
  const { country, lat: latStr, lng: lngStr, radius: radStr, query } = req.query;
  const targetCountry = (country || 'DE').toString().toUpperCase();
  let lat = Number(latStr);
  let lng = Number(lngStr);
  const radius = Math.min(Math.max(Number(radStr) || 25, 1), 25);
  const searchTerm = query ? query.toString().trim() : '';

  try {
    if (query && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
      console.log(`[Backend] Geocoding required for query: "${query}"`);
      try {
        const geocodeResp = await axios.get('https://nominatim.openstreetmap.org/search', {
          params: { q: query, countrycodes: country.toLowerCase(), format: 'json', limit: 1 },
          headers: { 'User-Agent': 'MobilitiDashboard/1.0 (Ihre-Echte-Email@ihredomain.de)' },
          timeout: 7000
        });
        if (geocodeResp.data && geocodeResp.data.length > 0) {
          lat = parseFloat(geocodeResp.data[0].lat);
          lng = parseFloat(geocodeResp.data[0].lon);
          console.log(`[Backend] Geocoding successful: lat=${lat}, lng=${lng}`);
        } else {
          return res.status(404).json({ ok: false, message: `Der Ort "${query}" konnte nicht gefunden werden.` });
        }
      } catch (geoError) {
        console.error('[Backend] Geocoding FAILED:', geoError.message);
        return res.status(502).json({ ok: false, message: 'Die Adress-Suche ist fehlgeschlagen.' });
      }
    } else if (!query && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
      return res.status(400).json({ ok: false, message: 'Gültige Koordinaten oder ein Suchbegriff sind erforderlich.' });
    }

    let stations = [];
    
    if (country === 'DE') {
      console.log(`[Backend] Searching Tankerkönig with lat=${lat}, lng=${lng}`);
      const apiKey = process.env.TANKERKOENIG_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ ok: false, message: 'API-Key für Tankerkönig fehlt in der Server-Konfiguration.' });
      }
      const tkResp = await axios.get('https://creativecommons.tankerkoenig.de/json/list.php', {
        params: { 
            lat, 
            lng, 
            rad: radius, 
            sort: 'dist', 
            type: 'all', 
            apikey: apiKey 
        },
        timeout: 10000
      });

      if (!tkResp.data.ok || tkResp.data.status !== 'ok') {
        console.error('[Backend] Tankerkönig API returned an error:', tkResp.data.message);
        throw new Error(`Tankerkönig API Fehler: ${tkResp.data.message}`);
      }

      stations = (tkResp.data.stations || []).map(s => ({
        external_id: s.id, name: s.name, brand: s.brand, street: s.street,
        house_no: s.houseNo, 
        post_code: s.postcode, 
        city: s.place,
        lat: s.lat, lng: s.lng, last_diesel: s.diesel, last_e5: s.e5, last_e10: s.e10,
        last_status: s.isOpen ? 'open' : 'closed',
        last_price_ts: new Date().toISOString(), country_code: 'DE'
      }));
    } else if (country === 'AT') {
      console.log(`[Backend] Searching E-Control with lat=${lat}, lng=${lng}`);
      stations = [];
    } else {
      return res.status(400).json({ ok: false, message: 'Ungültiger Ländercode.' });
    }

    console.log(`[Backend] Found ${stations.length} stations.`);
    res.status(200).json({ ok: true, stations });

  } catch (err) {
    const errorMessage = err?.response?.data?.message || err.message || 'Unbekannter Fehler bei der Tankstellensuche.';
    console.error(`[Backend] Fuel search final catch block error:`, errorMessage);
    res.status(500).json({ ok: false, message: errorMessage });
  }
};

exports.getPricesByIds = async (req, res) => {
    const { country, ids, userId } = req.body || {};
    try {
        if (!country || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ ok: false, message: 'Land und eine Liste von IDs sind erforderlich.' });
        }
        const cc = String(country).toUpperCase();
        let stationsToUpdate = [];

        if (cc === 'DE') {
            const apiKey = TANKERKOENIG_API_KEY;
            if (!apiKey) throw new Error('Tankerkönig API-Key fehlt');
            
            const idList = ids.map(String).filter(isValidUUID);
            if (idList.length === 0) return res.json({ ok: true });

            const priceResp = await axios.get('https://creativecommons.tankerkoenig.de/json/prices.php', { 
                params: { ids: idList.join(','), apikey: apiKey }, 
                timeout: 10000 
            });

            if (!priceResp.data?.ok) throw new Error(`Tankerkönig Preis-API Fehler: ${priceResp.data?.message}`);
            
            for (const id in priceResp.data.prices) {
                const priceInfo = priceResp.data.prices[id];
                stationsToUpdate.push({
                    id: id,
                    diesel: priceInfo.diesel ?? null,
                    e5: priceInfo.e5 ?? null,
                    e10: priceInfo.e10 ?? null,
                    status: priceInfo.status ?? null,
                });
            }
        }
        
        if (userId && stationsToUpdate.length > 0) {
            await upsertFavoritesPriceCache(userId, stationsToUpdate);
        }

        return res.json({ ok: true, message: 'Preise aktualisiert.' });
    } catch (err) {
        console.error('--- getPricesByIds FAILED ---');
        if (axios.isAxiosError(err)) {
            console.error('API Request URL:', err.config.url);
            console.error('API Response Status:', err.response?.status);
            console.error('API Response Data:', err.response?.data);
        } else {
            console.error('Generic Error:', err.message);
        }
        return res.status(500).json({ ok: false, message: 'Interner Serverfehler beim Abrufen der Preisdetails.' });
    }
};

const logQuery = (query, params) => {
    let loggedQuery = query;
    for (let i = 0; i < params.length; i++) {
        const param = typeof params[i] === 'string' ? `'${params[i]}'` : params[i];
        loggedQuery = loggedQuery.replace(`$${i + 1}`, param);
    }
    console.log("--- Executing SQL ---");
    console.log(loggedQuery);
    console.log("---------------------");
};

let fuelPriceCache = {
    data: null,
    timestamp: 0,
    ttl: 5 * 60 * 1000
};

exports.getFuelPrices = async (req, res) => {
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
                country: 'AT,DE,FR',
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


exports.getEvents = async (req, res) => {
    const { id: userId, business_partner_id: businessPartnerId } = req.user;
    const { category } = req.query;

    if (!category) {
        return res.status(400).json({ message: 'A category is required.' });
    }

    const categoryArray = category.split(',').map(c => c.trim());

    try {
        let whereClause = `sc.category = ANY($2::text[])`;
        const queryParams = [userId, categoryArray];
        
        if (businessPartnerId) {
            whereClause = `(${whereClause} OR sc.source_identifier = $3)`;
            queryParams.push(`${businessPartnerId}_events`);
        }

        const dataQuery = `
            SELECT
                sc.id, sc.title, sc.event_date AS date, sc.summary,
                sc.original_url AS url, sc.region, sc.full_text,
                s.status = 'approved' AS is_trusted_source,
                EXISTS (SELECT 1 FROM user_read_scraped_content ursc WHERE ursc.scraped_content_id = sc.id AND ursc.user_id = $1) as is_read,
                (SELECT COUNT(*) FROM content_relevance_votes WHERE content_id = sc.id AND vote = 1)::INTEGER AS participants,
                (SELECT COUNT(*) FROM content_relevance_votes WHERE content_id = sc.id AND vote = 0)::INTEGER AS "maybeParticipants",
                COALESCE((SELECT vote FROM content_relevance_votes WHERE content_id = sc.id AND user_id = $1), NULL) AS "userVote"
            FROM scraped_content sc
            LEFT JOIN sources s ON sc.original_url LIKE s.url || '%'
            WHERE ${whereClause} AND sc.event_date IS NOT NULL
            ORDER BY sc.event_date ASC
            LIMIT 50
        `;
        const { rows: events } = await db.query(dataQuery, queryParams);

        const availableRegions = [...new Set(events.map(e => e.region).filter(Boolean))];
        let regionsData = [];
        if (availableRegions.length > 0) {
            const regionQuery = 'SELECT name, code FROM regions WHERE name = ANY($1::text[])';
            const regionsResult = await db.query(regionQuery, [availableRegions]);
            regionsData = regionsResult.rows;
        }

        res.json({
            events: events,
            availableRegions: regionsData
        });
    } catch (err) {
        console.error(`Error loading calendar events for category ${category}:`, err.message);
        res.status(500).send('Serverfehler');
    }
};

exports.getFleetAssociationNews = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const query = `
            SELECT 
                id, title, summary, original_url, published_date, event_date, category, scraped_at,
                EXISTS (SELECT 1 FROM user_read_scraped_content ursc WHERE ursc.scraped_content_id = id AND ursc.user_id = $1) as is_read
            FROM scraped_content
            WHERE source_identifier = 'fuhrpark_news' OR source_identifier = 'fuhrpark_events'
            ORDER BY published_date DESC, event_date DESC, scraped_at DESC
            LIMIT 20
        `;
        const result = await db.query(query, [userId]);
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
        const indicators = ['BRENT_OIL', 'EUR_USD', 'EURIBOR_3M', 'KVLPI_GESAMT', 'CO2_PRICE']; 
        const results = {};

        for (const indicator of indicators) {
            const latestPriceQuery = `
                SELECT value, unit, data_timestamp, source, country_code 
                FROM economic_indicators
                WHERE indicator_name = $1
                ORDER BY data_timestamp DESC
                LIMIT 1;
            `;
            const latestPriceResult = await db.query(latestPriceQuery, [indicator]);

            if (latestPriceResult.rows.length === 0) continue;

            const latest = latestPriceResult.rows[0];
            const currentPrice = parseFloat(latest.value);
            
            const weekAgoQuery = `
                SELECT value FROM economic_indicators
                WHERE indicator_name = $1 AND data_timestamp <= $2::date - interval '7 days'
                ORDER BY data_timestamp DESC
                LIMIT 1;
            `;
            const weekAgoResult = await db.query(weekAgoQuery, [indicator, latest.data_timestamp]);
            const weekAgoPrice = weekAgoResult.rows.length > 0 ? parseFloat(weekAgoResult.rows[0].value) : null;

            const monthAgoQuery = `
                SELECT value FROM economic_indicators
                WHERE indicator_name = $1 AND data_timestamp <= $2::date - interval '1 month'
                ORDER BY data_timestamp DESC
                LIMIT 1;
            `;
            const monthAgoResult = await db.query(monthAgoQuery, [indicator, latest.data_timestamp]);
            const monthAgoPrice = monthAgoResult.rows.length > 0 ? parseFloat(monthAgoResult.rows[0].value) : null;
            
            const yearAgoQuery = `
                SELECT value FROM economic_indicators
                WHERE indicator_name = $1 AND data_timestamp <= $2::date - interval '1 year'
                ORDER BY data_timestamp DESC
                LIMIT 1;
            `;
            const yearAgoResult = await db.query(yearAgoQuery, [indicator, latest.data_timestamp]);
            const yearAgoPrice = yearAgoResult.rows.length > 0 ? parseFloat(yearAgoResult.rows[0].value) : null;

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
                countryCode: latest.country_code,
                trend: trend,
                historical: {
                  weekAgo: weekAgoPrice,
                  monthAgo: monthAgoPrice,
                  yearAgo: yearAgoPrice
                }
            };
        }

        res.json({ ok: true, data: results });

    } catch (error) {
        console.error('Fehler beim Abrufen der Rohstoffpreise aus der DB:', error.message);
        res.status(500).json({ ok: false, message: 'Fehler beim Abrufen der Rohstoffdaten.' });
    }
};

exports.getCommodityHistory = async (req, res) => {
    const { timeframe = '1Y' } = req.query; 

    let startDate;
    const now = new Date();
    if (timeframe === '1M') startDate = new Date(now.setMonth(now.getMonth() - 1));
    else if (timeframe === '6M') startDate = new Date(now.setMonth(now.getMonth() - 6));
    else startDate = new Date(now.setFullYear(now.getFullYear() - 1));

    try {
        const query = `
            SELECT
                DISTINCT ON (indicator_name, CAST(data_timestamp AS DATE))
                indicator_name,
                value,
                CAST(data_timestamp AS DATE) as date
            FROM
                economic_indicators
            WHERE
                data_timestamp >= $1
            ORDER BY
                indicator_name, CAST(data_timestamp AS DATE), data_timestamp DESC;
        `;

        const { rows } = await db.query(query, [startDate]);

        const formattedData = rows.reduce((acc, row) => {
            const { indicator_name, date, value } = row;
            if (!acc[indicator_name]) {
                acc[indicator_name] = [];
            }
            acc[indicator_name].push({ date: new Date(date).toISOString().split('T')[0], value: parseFloat(value) });
            return acc;
        }, {});

        res.json({ ok: true, data: formattedData });

    } catch (error) {
        console.error('Fehler beim Abrufen der Rohstoff-Historie:', error);
        res.status(500).json({ ok: false, message: 'Serverfehler' });
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
    const { id: userId } = req.user;

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

exports.generateEmailFromContent = async (req, res) => {
    const { title, content } = req.body;
    const { name: userName } = req.user;

    if (!content || !title) {
        return res.status(400).json({ message: 'Titel und Inhalt sind zur E-Mail-Generierung erforderlich.' });
    }

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
        console.log("--- Generating Email with Prompt ---");
        console.log(prompt);
        console.log("------------------------------------");

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

function toAbsoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

exports.shareContentByEmail = async (req, res) => {
  try {
    const { title, summary, source, recipientEmail } = req.body || {};
    if (!title || !summary || !recipientEmail) {
      return res.status(400).json({ message: 'Titel, Inhalt und Empfänger-E-Mail sind erforderlich.' });
    }

    const senderName =
      req.user?.first_name?.trim() ||
      req.user?.username?.trim() ||
      req.user?.email?.trim() ||
      'Dashboard';

    let fromName = 'mobiliti Dashboard';
    let brandLogoUrl = toAbsoluteUrl('/logos/de-mobiliti.png');
    try {
      const bpId = req.user?.business_partner_id;
      if (bpId) {
        const { rows } = await db.query(
          `SELECT dashboard_title, logo_url FROM business_partners WHERE id = $1 LIMIT 1`,
          [bpId]
        );
        if (rows.length) {
          if (rows[0].dashboard_title) fromName = rows[0].dashboard_title;
          if (rows[0].logo_url) brandLogoUrl = toAbsoluteUrl(rows[0].logo_url);
        }
      }
    } catch {}

    const subject = `Info von ${fromName}: ${title}`;
    const contentHtml = `
      <p>Hallo,</p>
      <p><strong>${senderName}</strong> hat folgende Information mit Ihnen geteilt:</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0;">
      <h3 style="margin:0 0 8px;">${title}</h3>
      <div style="white-space:pre-wrap;">${summary}</div>
      ${
        source
          ? `<p style="margin-top:12px;">Originalquelle: <a href="${source}" target="_blank" rel="noopener">${source}</a></p>`
          : ''
      }
    `;

    const htmlBody = renderLayout({
      preheader: title,
      title: fromName,
      contentHtml,
      ctaLabel: source ? 'Zur Quelle' : undefined,
      ctaUrl: source || undefined,
      footerText: `Gesendet von ${fromName}.`,
      brandLogoUrl,
    });

    await sendEmail({
      to: recipientEmail,
      subject,
      html: htmlBody,
      fromName,
    });

    return res.status(200).json({
      message: `Information erfolgreich an ${recipientEmail} gesendet.`,
    });
  } catch (error) {
    console.error('shareContentByEmail error:', error);
    return res.status(500).json({ message: 'Der Inhalt konnte nicht geteilt werden.' });
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

exports.getAIPromptRulesForUser = async (req, res) => {
    try {
        const result = await db.query('SELECT id, name, default_category_id FROM ai_prompt_rules ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching AI prompt rules for user:', err.message);
        res.status(500).send('Server error');
    }
};

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

        if (article_score_min !== null && typeof article_score_min !== 'undefined') {
            baseQuery += ` AND relevance_score >= $${paramIndex++}`;
            queryParams.push(article_score_min);
        }
        if (article_score_max !== null && typeof article_score_max !== 'undefined') {
            baseQuery += ` AND relevance_score <= $${paramIndex++}`;
            queryParams.push(article_score_max);
        }

        const countQuery = `SELECT COUNT(DISTINCT id) as total_items ${baseQuery}`;
        const totalResult = await db.query(countQuery, queryParams);
        const totalItems = parseInt(totalResult.rows[0].total_items, 10);
        const totalPages = Math.ceil(totalItems / limit);

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

exports.getAllRegions = async (req, res) => {
    try {
        const result = await db.query('SELECT id, name, code, latitude, longitude FROM regions ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching all regions:', err.message);
        res.status(500).send('Server error');
    }
};

exports.evStationSearch = async (req, res) => {
    const { country, lat: latStr, lng: lngStr, query } = req.query;
    const targetCountry = (country || 'DE').toString().toUpperCase();
    let lat = Number(latStr);
    let lng = Number(lngStr);
    const searchTerm = query ? query.toString().trim() : '';

    try {
        if (searchTerm && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
            const geocodeResp = await axios.get('https://nominatim.openstreetmap.org/search', {
                params: { q: searchTerm, countrycodes: targetCountry.toLowerCase(), format: 'json', limit: 1 },
                headers: { 'User-Agent': 'MobilitiDashboard/1.0 (Ihre-Email@domain.de)' }
            });
            if (geocodeResp.data && geocodeResp.data.length > 0) {
                lat = parseFloat(geocodeResp.data[0].lat);
                lng = parseFloat(geocodeResp.data[0].lon);
            } else {
                return res.status(404).json({ ok: false, message: `Ort "${searchTerm}" nicht gefunden.` });
            }
        } else if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
             return res.status(400).json({ ok: false, message: 'Koordinaten oder Suchbegriff erforderlich.' });
        }

        let stations = [];
        if (targetCountry === 'AT') {
            const apiKey = process.env.LADESTELLEN_AT_KEY;
            if (!apiKey) throw new Error('API-Key für E-Control Ladestellen fehlt.');
            
            const response = await axios.get('https://api.e-control.at/charge/1.0/stations/by-proximity', {
                params: { latitude: lat, longitude: lng, radius: 25000 },
                headers: { 'X-Api-Key': apiKey }
            });
            stations = (response.data || []).map(normalizeEControlStation).filter(Boolean);

        } else {
            const apiKey = process.env.OPENCHARGEMAP_API_KEY;
            if (!apiKey) throw new Error('API-Key für OpenChargeMap fehlt.');

            const response = await axios.get('https://api.openchargemap.io/v3/poi', {
                params: {
                    output: 'json', latitude: lat, longitude: lng,
                    distance: 25, distanceunit: 'km', maxresults: 100, key: apiKey
                }
            });
            stations = (response.data || []).map(normalizeOcmStation).filter(Boolean);
        }
        res.json({ ok: true, stations });
    } catch (err) {
        const message = err.response?.data?.message || err.message || 'Fehler bei der Stationssuche.';
        console.error(`[EV Search Error for ${targetCountry}]:`, message, `Status: ${err.response?.status}`);
        res.status(500).json({ ok: false, message });
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
            maxresults: 1000,
            key: apiKey,
        };

        const response = await axios.get('https://api.openchargemap.io/v3/poi/', { params });
        const filtered = response.data.filter(st =>
            (st.AddressInfo?.Town || '').toLowerCase().includes(city.trim().toLowerCase())
        );

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
        tag, mainFilter, filter
    } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    console.log('[DEBUG] getScrapedContent: Anfrage erhalten mit Parametern:', { category, region, filter, page, limit });

    try {
        const userSettingsResult = await db.query(
            'SELECT article_score_min, article_score_max FROM users WHERE id = $1',
            [userId]
        );
        const { article_score_min, article_score_max } = userSettingsResult.rows[0] || {};
        
        const userTagsResult = await db.query('SELECT tag_name FROM user_saved_tags WHERE user_id = $1', [userId]);
        const userSavedTags = userTagsResult.rows.map(row => row.tag_name);

        const queryParams = [];
        let whereClauses = [];
        let paramIndex = 1;

        if (userSavedTags.length > 0) {
            whereClauses.push(`EXISTS (
                SELECT 1 FROM scraped_content_tags sct
                JOIN tags t ON sct.tag_id = t.id
                WHERE sct.scraped_content_id = sc.id AND t.name = ANY($${paramIndex}::text[])
            )`);
            queryParams.push(userSavedTags);
            paramIndex++;
        }

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
        
        console.log(`[DEBUG] Prüfe, ob Kategorie '${category}' der Podcast-Kategorie entspricht.`);
        if (category === 'fleet_podcasts') { 
            console.log('[DEBUG] Podcast-Kategorie erkannt! Füge Audio-URL-Filter hinzu.');
            whereClauses.push(`sc.original_url ~* '\\.(mp3|m4a|aac|ogg|wav)(\\?|$)'`);
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
        
        if (filter === 'unread') {
             whereClauses.push(`NOT EXISTS (SELECT 1 FROM user_read_scraped_content ursc WHERE ursc.scraped_content_id = sc.id AND ursc.user_id = $${paramIndex})`);
             queryParams.push(userId);
             paramIndex++;
        } else if (filter === 'new') {
            whereClauses.push(`sc.created_at > $${paramIndex}`);
            queryParams.push(lastLogin || new Date(0));
            paramIndex++;
        }

        console.log('[DEBUG] Finale WHERE-Klauseln:', whereClauses);
        console.log('[DEBUG] Finale Query-Parameter:', queryParams);

        const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const baseQuery = `FROM scraped_content sc LEFT JOIN sources s ON sc.original_url = s.url ${whereString}`;

        const countQuery = `SELECT COUNT(sc.id) as total_items ${baseQuery}`;
        const totalResult = await db.query(countQuery, queryParams);
        const totalItems = parseInt(totalResult.rows[0].total_items, 10);
        const totalPages = Math.ceil(totalItems / limit);
        
        console.log(`[DEBUG] Gesamtzahl gefundener Einträge (totalItems): ${totalItems}`);

        const countsQuery = `
            WITH filtered_content AS (
                SELECT sc.id, sc.created_at
                ${baseQuery}
            )
            SELECT
                (SELECT COUNT(*) FROM filtered_content fc WHERE NOT EXISTS (SELECT 1 FROM user_read_scraped_content ursc WHERE ursc.scraped_content_id = fc.id AND ursc.user_id = $${paramIndex})) as unread_count,
                (SELECT COUNT(*) FROM filtered_content WHERE created_at > $${paramIndex + 1}) as new_count
        `;
        const countsParams = [...queryParams, userId, lastLogin || new Date(0)];
        const countsResult = await db.query(countsQuery, countsParams);
        const counts = {
            unread: parseInt(countsResult.rows[0].unread_count, 10) || 0,
            new: parseInt(countsResult.rows[0].new_count, 10) || 0,
        };
        
        console.log('[DEBUG] Berechnete Counts (im Chip angezeigt):', counts);
        
        let orderByClause = 'ORDER BY sc.published_date DESC, sc.scraped_at DESC';
        if (sortBy === 'relevance') {
            orderByClause = 'ORDER BY sc.relevance_score DESC, sc.published_date DESC';
        }

        const dataQuery = `
            SELECT
                sc.id, sc.title, sc.summary, sc.original_url, sc.published_date,
                sc.event_date, sc.category, sc.scraped_at, sc.relevance_score, sc.region,
                sc.thumbnail_url, 
                s.status = 'approved' AS is_trusted_source,
                EXISTS (
                    SELECT 1 FROM user_read_scraped_content ursc
                    WHERE ursc.scraped_content_id = sc.id AND ursc.user_id = $${paramIndex}
                ) as is_read,
                COALESCE(crv.vote, 0) as user_vote
            FROM scraped_content sc
            LEFT JOIN sources s ON sc.original_url = s.url
            LEFT JOIN content_relevance_votes crv ON crv.content_id = sc.id AND crv.user_id = $${paramIndex}
            ${whereString}
            ${orderByClause}
            LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
        `;

        const finalParams = [...queryParams, userId, parseInt(limit, 10), offset];
        const result = await db.query(dataQuery, finalParams);
        
        console.log(`[DEBUG] Anzahl der an das Frontend gesendeten Einträge: ${result.rows.length}`);

        res.json({
            source: 'Scraped Content Feed',
            timestamp: new Date().toISOString(),
            data: result.rows,
            totalPages: totalPages,
            currentPage: parseInt(page, 10),
            counts: counts,
            activeFilters: { tags: userSavedTags } 
        });

    } catch (err) {
        console.error(`Error fetching scraped content:`, err.message);
        res.status(500).json({ message: 'Error fetching scraped content', data: [] });
    }
};

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



exports.getEconomicStatistics = async (req, res) => {
    const { statisticType, countryCode = 'AT' } = req.query;

    if (!statisticType) {
        return res.status(400).json({ ok: false, message: 'Ein "statisticType" ist erforderlich.' });
    }

    try {
        const startDate = new Date(new Date().setFullYear(new Date().getFullYear() - 10));

        const query = `
            SELECT 
                time_period, 
                statistic_subtype, 
                value, 
                unit, 
                source_name, 
                source_url
            FROM economic_statistics
            WHERE
                statistic_type = $1 AND
                country_code = $2 AND
                time_period >= $3
            ORDER BY time_period ASC, statistic_subtype ASC;
        `;
        const queryParams = [statisticType, countryCode, startDate];
        
        const { rows } = await db.query(query, queryParams);

        if (rows.length === 0) {
            return res.json({ ok: true, data: [], subtypes: [], source: null });
        }

        // --- NEUE DATENVERARBEITUNG (PIVOTING) ---
        // Die Daten werden von einem langen in ein breites Format umgewandelt.
        // Bsp: Aus mehreren Zeilen pro Datum wird eine Zeile mit mehreren Spalten (Benzin, Diesel etc.)
        const pivotedData = rows.reduce((acc, row) => {
            const date = new Date(row.time_period).toISOString().split('T')[0];
            if (!acc[date]) {
                acc[date] = { date };
            }
            // Der Wert wird der Spalte des entsprechenden Subtyps zugeordnet
            acc[date][row.statistic_subtype] = parseFloat(row.value);
            return acc;
        }, {});

        const chartData = Object.values(pivotedData);
        
        // Eine Liste aller einzigartigen Subtypen wird für die Filter-Buttons im Frontend erstellt.
        const subtypes = [...new Set(rows.map(r => r.statistic_subtype))];
        const latestSourceInfo = rows[rows.length - 1];

        res.json({
            ok: true,
            data: chartData,      // Die umgewandelten Daten für das Diagramm
            subtypes: subtypes,   // Die Liste der gefundenen Subtypen
            source: {
                name: latestSourceInfo.source_name,
                url: latestSourceInfo.source_url
            }
        });

    } catch (error) {
        console.error('Fehler beim Abrufen der Wirtschaftsstatistiken:', error);
        res.status(500).json({ ok: false, message: 'Serverfehler beim Abrufen der Statistikdaten.' });
    }
};


exports.getUniqueStatCountries = async (req, res) => {
    const { statisticType } = req.query;
    if (!statisticType) {
        return res.status(400).json({ message: 'A statisticType is required.' });
    }
    try {
        const query = `
            SELECT DISTINCT es.country_code as code, r.name
            FROM economic_statistics es
            JOIN regions r ON es.country_code = r.code
            WHERE es.statistic_type = $1
            ORDER BY r.name ASC;
        `;
        const result = await db.query(query, [statisticType]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching unique statistic countries:', err.message);
        res.status(500).json({ message: 'Serverfehler beim Abrufen der Länderliste.' });
    }
};


exports.getActiveAdvertisement = async (req, res) => {
    const { business_partner_id } = req.user;

    try {
        const query = `
            SELECT content, id FROM advertisements
            WHERE
                is_active = TRUE AND
                (start_date IS NULL OR start_date <= NOW()) AND
                (end_date IS NULL OR end_date >= NOW()) AND
                (business_partner_id = $1 OR business_partner_id IS NULL)
            ORDER BY
                business_partner_id DESC NULLS LAST
            LIMIT 1;
        `;
        const result = await db.query(query, [business_partner_id]);

        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.json(null);
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
        const baseQuery = `
            FROM business_partner_actions
            WHERE
                business_partner_id = $1 AND
                is_active = TRUE AND
                (start_date IS NULL OR start_date <= $2) AND
                (end_date IS NULL OR end_date >= $2)
        `;
        const queryParams = [business_partner_id, now];

        const totalQuery = `SELECT COUNT(*) ${baseQuery}`;
        const totalResult = await db.query(totalQuery, queryParams);
        const totalItems = parseInt(totalResult.rows[0].count, 10);
        const totalPages = Math.ceil(totalItems / limit);

        const dataQuery = `
            SELECT id, layout_type, title, content_text, link_url, image_url, created_at
            ${baseQuery}
            ORDER BY created_at DESC
            LIMIT $3 OFFSET $4
        `;
        const dataQueryParams = [...queryParams, limit, offset];
        const dataResult = await db.query(dataQuery, dataQueryParams);

        const newQuery = `SELECT COUNT(*) FROM business_partner_actions WHERE business_partner_id = $1 AND is_active = TRUE AND created_at >= NOW() - INTERVAL '3 days'`;
        const newResult = await db.query(newQuery, [business_partner_id]);
        const counts = { new: parseInt(newResult.rows[0].count, 10) || 0 };

        res.json({ data: dataResult.rows, totalPages, counts });

    } catch (err) {
        console.error('--- DATABASE ERROR in getActiveActionsForWidget ---');
        console.error('Timestamp:', new Date().toISOString());
        console.error('Error Message:', err.message);
        console.error('Full Error Object:', err);
        console.error('----------------------------------------------------');
        res.status(500).send('Serverfehler beim Abrufen der Aktionen.');
    }
}

exports.getCalendarEvents = async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT id, title, event_date, summary, original_url
             FROM scraped_content
             WHERE category LIKE '%_events' AND event_date IS NOT NULL
             ORDER BY event_date ASC`
        );
        
        const events = rows.map(row => ({
            id: row.id,
            title: row.title,
            start: row.event_date,
            end: row.event_date,
            allDay: true,
            resource: {
                summary: row.summary,
                url: row.original_url
            }
        }));
        
        res.json(events);
    } catch (err) {
        console.error('Fehler beim Laden der Kalender-Events:', err.message);
        res.status(500).send('Serverfehler');
    }
};

exports.getEnhancedCalendarEvents = async (req, res) => {
    const { id: userId } = req.user;
    const { page = 1, limit = 5 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    try {
        const baseQuery = `
            FROM scraped_content sc
            LEFT JOIN sources s ON sc.original_url LIKE s.url || '%'
            WHERE sc.category LIKE '%_events' AND sc.event_date IS NOT NULL
        `;

        const countQuery = `SELECT COUNT(sc.id) as total_items ${baseQuery}`;
        const totalResult = await db.query(countQuery);
        const totalItems = parseInt(totalResult.rows[0].total_items, 10);
        const totalPages = Math.ceil(totalItems / limit);

        const dataQuery = `
            SELECT 
                sc.id, sc.title, sc.event_date AS date, sc.summary, 
                sc.original_url AS url, sc.region, sc.full_text,
                s.status = 'approved' AS is_trusted_source,
                EXISTS (SELECT 1 FROM user_read_scraped_content ursc WHERE ursc.scraped_content_id = sc.id AND ursc.user_id = $1) as is_read,
                (SELECT COUNT(*) FROM content_relevance_votes WHERE content_id = sc.id AND vote = 1)::INTEGER AS participants,
                (SELECT COUNT(*) FROM content_relevance_votes WHERE content_id = sc.id AND vote = 0)::INTEGER AS "maybeParticipants",
                COALESCE((SELECT vote FROM content_relevance_votes WHERE content_id = sc.id AND user_id = $1), NULL) AS "userVote"
            ${baseQuery}
            ORDER BY sc.event_date ASC
            LIMIT $2 OFFSET $3
        `;
        const { rows: events } = await db.query(dataQuery, [userId, limit, offset]);

        const availableRegions = [...new Set(events.map(e => e.region).filter(Boolean))];
        let regionsData = [];
        if (availableRegions.length > 0) {
            const regionQuery = 'SELECT name, code FROM regions WHERE name = ANY($1::text[])';
            const regionsResult = await db.query(regionQuery, [availableRegions]);
            regionsData = regionsResult.rows;
        }

        res.json({
            events: events,
            totalPages: totalPages,
            currentPage: parseInt(page, 10),
            availableRegions: regionsData
        });
    } catch (err) {
        console.error('Fehler beim Laden der Kalender-Events:', err.message);
        res.status(500).send('Serverfehler');
    }
};

exports.voteOnEventAttendance = async (req, res) => {
    const { eventId } = req.params;
    const { vote } = req.body;
    const { id: userId } = req.user;

    if (![1, 0, -1].includes(vote)) {
        return res.status(400).json({ message: 'Ungültiger Abstimmungswert.' });
    }
    try {
        const voteQuery = `
            INSERT INTO content_relevance_votes (user_id, content_id, vote)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, content_id) DO UPDATE SET vote = $3
            RETURNING vote;
        `;
        const result = await db.query(voteQuery, [userId, eventId, vote]);
        res.status(200).json({ userVote: result.rows[0].vote });
    } catch (err) {
        console.error('Fehler beim Speichern der Event-Teilnahme:', err.message);
        res.status(500).send('Serverfehler');
    }
};

exports.shareEventByEmail = async (req, res) => {
    const { title, date, url, summary, recipientEmail } = req.body;
    const { name: senderName } = req.user;

    if (!title || !recipientEmail) {
        return res.status(400).json({ message: 'Titel und Empfänger sind erforderlich.' });
    }
    try {
        const subject = `Interessante Veranstaltung: ${title}`;
        const htmlBody = `
            <p>Hallo,</p>
            <p><strong>${senderName}</strong> hat folgende Veranstaltung mit Ihnen geteilt:</p>
            <hr>
            <h3>${title}</h3>
            <p><strong>Datum:</strong> ${new Date(date).toLocaleDateString('de-DE')}</p>
            <p>${summary || ''}</p>
            <p>Weitere Informationen finden Sie hier: <a href="${url}">${url}</a></p>
            <hr>
            <p style="font-size: 0.8em; color: #777;"><em>Diese E-Mail wurde über das KI-Dashboard versendet.</em></p>
        `;
        await sendEmail({
            to: recipientEmail,
            subject: subject,
            html: htmlBody,
            fromName: "KI-Dashboard"
        });
        res.status(200).json({ message: `Event erfolgreich an ${recipientEmail} gesendet.` });
    } catch (error) {
        console.error('Fehler beim Teilen des Events:', error);
        res.status(500).json({ message: error.message || 'Event konnte nicht geteilt werden.' });
    }
};

exports.getDashboardConfig = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const sql = `
      SELECT
        u.preferred_theme,
        u.preferred_language,
        bp.id, bp.name, bp.address, bp.logo_url,
        bp.subscription_start_date, bp.subscription_end_date,
        bp.storage_tier, bp.storage_limit_bytes, bp.storage_usage_bytes,
        bp.dashboard_title, bp.url_businesspartner,
        bp.level_1_name, bp.level_2_name, bp.level_3_name,
        cs.id as cs_id, cs.name as cs_name,
        cs.primary_color, cs.secondary_color,
        cs.text_color_light, cs.background_color_light, cs.paper_color_light,
        cs.text_color_dark, cs.background_color_dark, cs.paper_color_dark
      FROM users u
      LEFT JOIN business_partners bp ON bp.id = u.business_partner_id
      LEFT JOIN color_schemes cs ON cs.id = bp.color_scheme_id
      WHERE u.id = $1
      LIMIT 1;
    `;
    const { rows } = await db.query(sql, [userId]);

    if (!rows.length || !rows[0]?.id) {
      return res.json({ businessPartner: null, user: { preferred_theme: 'light', preferred_language: 'de', regions: [] } });
    }

    const r = rows[0];
    const color_scheme = r.cs_id ? {
      id: r.cs_id,
      name: r.cs_name,
      primary_color: r.primary_color,
      secondary_color: r.secondary_color,
      text_color_light: r.text_color_light,
      background_color_light: r.background_color_light,
      paper_color_light: r.paper_color_light,
      text_color_dark: r.text_color_dark,
      background_color_dark: r.background_color_dark,
      paper_color_dark: r.paper_color_dark,
    } : null;

    let regions = [];
    try {
      const rr = await db.query(
        `SELECT r.id, r.name, r.code, COALESCE(bpr.is_default,false) AS is_default
           FROM business_partner_regions bpr
           JOIN regions r ON r.id = bpr.region_id
          WHERE bpr.business_partner_id = $1
          ORDER BY r.name ASC`,
        [r.id]
      );
      regions = rr.rows;
    } catch { }

    return res.json({
      user: {
        preferred_theme: r.preferred_theme || 'light',
        preferred_language: r.preferred_language || 'de',
        regions: regions,
      },
      businessPartner: {
        id: r.id,
        name: r.name,
        address: r.address,
        logo_url: r.logo_url,
        subscription_start_date: r.subscription_start_date,
        subscription_end_date: r.subscription_end_date,
        storage_tier: r.storage_tier,
        storage_limit_bytes: r.storage_limit_bytes,
        storage_usage_bytes: r.storage_usage_bytes,
        dashboard_title: r.dashboard_title,
        url_businesspartner: r.url_businesspartner,
        level_1_name: r.level_1_name,
        level_2_name: r.level_2_name,
        level_3_name: r.level_3_name,
        color_scheme,
      },
    });
  } catch (e) {
    console.error('getDashboardConfig error:', e);
    return res.status(500).json({ message: 'Serverfehler' });
  }
};

exports.getAllTags = async (req, res) => {
    try {
        const result = await db.query('SELECT name FROM tags ORDER BY name ASC');
        res.json(result.rows.map(row => row.name));
    } catch (err) {
        console.error('Fehler beim Abrufen aller Tags:', err.message);
        res.status(500).json({ message: 'Serverfehler.' });
    }
};

exports.globalSearch = async (req, res) => {
    const { term } = req.query;

    if (!term || typeof term !== 'string' || term.trim().length < 3) {
        return res.status(400).json({ message: 'Ein Suchbegriff mit mindestens 3 Zeichen ist erforderlich.' });
    }

    const formattedTerm = term.trim().split(/\s+/).join(' & ');

    try {
        const query = `
            SELECT id, title, summary, published_date, type, relevance
            FROM (
                SELECT
                    id,
                    title,
                    summary,
                    published_date,
                    'scraped' as type,
                    ts_rank(to_tsvector('german', title || ' ' || summary), to_tsquery('german', $1)) as relevance
                FROM
                    scraped_content
                WHERE
                    to_tsvector('german', title || ' ' || summary) @@ to_tsquery('german', $1)
                
                UNION ALL
                
                SELECT
                    id,
                    title,
                    generated_output as summary,
                    created_at as published_date,
                    'ai' as type,
                    ts_rank(to_tsvector('german', title || ' ' || generated_output), to_tsquery('german', $1)) as relevance
                FROM
                    ai_generated_content
                WHERE
                    to_tsvector('german', title || ' ' || generated_output) @@ to_tsquery('german', $1)
            ) as search_results
            ORDER BY
                relevance DESC
            LIMIT 25;
        `;

        const { rows } = await db.query(query, [formattedTerm]);
        res.json(rows);

    } catch (err) {
        console.error('Fehler bei der globalen Suche:', err.message);
        res.status(500).json({ message: 'Serverfehler bei der Suche.' });
    }
};

exports.getRelevantAction = async (req, res) => {
    const { category, region } = req.query;

    if (!category) {
        return res.status(400).json({ message: 'Widget-Kategorie ist erforderlich.' });
    }

    try {
        const query = `
            SELECT
                id,
                business_partner_id,
                layout_type,
                title,
                content_text,
                link_url,
                image_url,
                is_click_tracking_enabled
            FROM
                business_partner_actions
            WHERE
                is_active = TRUE
                AND (start_date IS NULL OR start_date <= NOW())
                AND (end_date IS NULL OR end_date >= NOW())
                AND target_widget_category = $1
                AND (target_region = $2 OR target_region IS NULL OR target_region = '')
            ORDER BY
                RANDOM()
            LIMIT 1;
        `;
        
        const regionParam = region || 'all';

        const { rows } = await db.query(query, [category, regionParam]);

        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.json(null);
        }

    } catch (err) {
        console.error('Fehler beim Abrufen der relevanten Aktion:', err.message);
        res.status(500).json({ message: 'Serverfehler.' });
    }
};