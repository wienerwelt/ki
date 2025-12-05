// backend/controllers/dataController.js
const axios = require('axios');
const db = require('../config/db');
const { sendEmail } = require('../services/emailService');
const { renderLayout } = require('../services/emailTemplates');
const { generateAIContent } = require('../services/aiExecutionService');
const { logToDb } = require('../services/aiExecutionService'); 
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
    const { country, ids } = req.body || {}; // userId entfernt
    const { id: userId } = req.user; // <-- NEU: userId sicher aus dem Token holen

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

let holidayCache = {
    data: null,
    timestamp: 0,
    ttl: 6 * 60 * 60 * 1000 // 6 Stunden
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


const normalizeNagerHoliday = (holiday, countryCode) => {
    let regionName = null;
    if (countryCode === 'AT') regionName = 'Österreich';
    if (countryCode === 'DE') regionName = 'Deutschland';

    // Wir ignorieren regionale Feiertage in DE (z.B. nur in "BY"),
    // um die Filterlogik einfach zu halten. 'global: true' bedeutet landesweit.
    // if (!holiday.global) {
    //     return null; // Optional: Nur landesweite Feiertage anzeigen
    // }

    return {
        id: `holiday-${countryCode}-${holiday.date}-${holiday.localName.replace(/\s/g, '-')}`,
        title: holiday.localName, // Wir nehmen den lokalen (deutschen) Namen
        date: holiday.date,
        region: regionName,
        summary: holiday.name, // Englischer Name als "Summary"
        url: null,
        participants: 0,
        maybeParticipants: 0,
        userVote: null,
        full_text: null,
        is_trusted_source: true,
        is_read: true,
        type: 'holiday'
    };
};

// NEUE getPublicHolidays Funktion für nager.at
exports.getPublicHolidays = async (req, res) => {
    if (holidayCache.data && (Date.now() - holidayCache.timestamp < holidayCache.ttl)) {
        console.log('Serving holidays from nager.at cache.');
        return res.json(holidayCache.data);
    }

    try {
        const year = new Date().getFullYear();
        // KORREKTUR: Wir verwenden jetzt die nager.at API
        const baseUrl = 'https://date.nager.at/api/v3';
        
        console.log(`[Holiday-API] Fetching fresh holidays from nager.at for ${year}...`);

        // Feiertage für AT und DE parallel abrufen
        const [atHolidaysRes, deHolidaysRes] = await Promise.all([
            axios.get(`${baseUrl}/PublicHolidays/${year}/AT`, { timeout: 7000 }),
            axios.get(`${baseUrl}/PublicHolidays/${year}/DE`, { timeout: 7000 })
        ]);

        console.log('[Holiday-API] nager.at data received successfully.');

        // Wichtig: .filter(Boolean), falls normalizeNagerHoliday null zurückgibt
        const normalizedAT = (atHolidaysRes.data || []).map(h => normalizeNagerHoliday(h, 'AT')).filter(Boolean);
        const normalizedDE = (deHolidaysRes.data || []).map(h => normalizeNagerHoliday(h, 'DE')).filter(Boolean);

        const allHolidays = [...normalizedAT, ...normalizedDE];

        // Im Cache speichern
        holidayCache.data = allHolidays;
        holidayCache.timestamp = Date.now();

        res.json(allHolidays);

    } catch (err) {
        // Detailliertes Logging, falls es wieder fehlschlägt
        console.error('--- SCHWERWIEGENDER FEHLER: getPublicHolidays (nager.at) ---');
        if (axios.isAxiosError(err)) {
            console.error('Angefragte URL:', err.config.url);
            if (err.response) {
                console.error('HTTP-Status:', err.response.status);
                console.error('API-Antwort:', JSON.stringify(err.response.data, null, 2));
            } else {
                console.error('Fehler:', err.message);
            }
        } else {
            console.error('Interner Fehler:', err.message);
        }
        console.error('--- ENDE: Detailliertes Logging ---');

        if (holidayCache.data) {
            console.warn('Serving stale holiday cache due to API error.');
            return res.json(holidayCache.data);
        }
        res.status(502).json({ message: 'Fehler beim Abrufen der Feiertage von nager.at.' });
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
        const indicators = ['BRENT_OIL', 'EUR_USD', 'EURIBOR_3M', 'KVLPI_GESAMT']; 
        const results = {};

        for (const indicator of indicators) {
            const latestPriceQuery = `
                SELECT
                    ei.value, ei.unit, ei.data_timestamp, ei.source, ei.country_code,
                    s.status = 'approved' AS is_trusted_source
                FROM economic_indicators ei
                LEFT JOIN sources s ON ei.source = s.url
                WHERE ei.indicator_name = $1
                ORDER BY ei.data_timestamp DESC
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
                is_trusted_source: !!latest.is_trusted_source,
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

    let timeFilterClause = '';
    const queryParams = [];
    let paramIndex = 1;

    // NEU: Logik für Zeiträume, "max" lässt die Klausel leer
    if (timeframe === '1M') {
        const startDate = new Date(new Date().setMonth(new Date().getMonth() - 1));
        timeFilterClause = `WHERE data_timestamp >= $${paramIndex++}`;
        queryParams.push(startDate);
    } else if (timeframe === '6M') {
        const startDate = new Date(new Date().setMonth(new Date().getMonth() - 6));
        timeFilterClause = `WHERE data_timestamp >= $${paramIndex++}`;
        queryParams.push(startDate);
    } else if (timeframe === '1Y') {
        const startDate = new Date(new Date().setFullYear(new Date().getFullYear() - 1));
        timeFilterClause = `WHERE data_timestamp >= $${paramIndex++}`;
        queryParams.push(startDate);
    }
    // Wenn timeframe === 'max', bleibt timeFilterClause leer.

    try {
        const query = `
            SELECT
                DISTINCT ON (indicator_name, CAST(data_timestamp AS DATE))
                indicator_name,
                value,
                CAST(data_timestamp AS DATE) as date
            FROM
                economic_indicators
            ${timeFilterClause}
            ORDER BY
                indicator_name, CAST(data_timestamp AS DATE), data_timestamp DESC;
        `;

        const { rows } = await db.query(query, queryParams);
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

exports.getMonitorEntries = async (req, res) => {
    const { business_partner_id } = req.user;
    const { limit = 5 } = req.query;

    if (!business_partner_id) {
        return res.json([]);
    }

    try {
        // KORREKTUR: t.fields_definition wird jetzt mit abgerufen.
        // Das behebt den Absturz des LegalMonitorWidget.
        const query = `
            SELECT
                e.id, e.content_data, e.created_at, e.source_document_url,
                t.template_name, t.fields_definition
            FROM monitor_entries e
            JOIN monitor_templates t ON e.template_id = t.id
            WHERE e.business_partner_id = $1 AND e.is_published = TRUE
            ORDER BY e.created_at DESC
            LIMIT $2;
        `;
        
        const { rows } = await db.query(query, [business_partner_id, limit]);
        res.json(rows);

    } catch (err) {
        console.error('Fehler beim Abrufen der Monitor-Einträge:', err.message);
        res.status(500).send('Serverfehler');
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

// backend/controllers/dataController.js

exports.getVignettePrices = async (req, res) => {
    const { country } = req.query;

    if (!country) {
        return res.status(400).json({ message: 'Länderkürzel (country) ist erforderlich.' });
    }

    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;

    try {
        // ERWEITERT: Die Abfrage prüft nun auch die 'sources'-Tabelle
        const query = `
            SELECT 
                vp.country_name, vp.year, vp.price, vp.currency_code, 
                vp.vignette_requirement_car, vp.toll_system_truck, vp.provider_url,
                s.status = 'approved' AS is_trusted_source
            FROM vignette_prices vp
            LEFT JOIN sources s ON vp.provider_url LIKE s.url || '%'
            WHERE vp.country_code = $1 AND (vp.year IN ($2, $3) OR vp.year = 2025)
            ORDER BY vp.year ASC
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
            is_trusted_source: !!infoRow.is_trusted_source, // HINZUGEFÜGT
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



exports.getAccountIntelligence = async (req, res) => {
    const { business_partner_id: businessPartnerId } = req.user;

    if (!businessPartnerId) {
        // Wenn der Nutzer keinem Partner zugeordnet ist, gibt es nichts zu zeigen.
        return res.json([]);
    }

    try {
        // Diese Abfrage holt alle Daten in einem einzigen Datenbankaufruf
        // und verwendet den korrekten Tabellennamen 'business_partner_tracked_articles'.
        const query = `
            SELECT
                acc.id,
                acc.name,
                -- 1. Neueste Nachrichten zum Account selbst (wo competitor_name leer ist)
                (
                    SELECT COALESCE(json_agg(news.*), '[]'::json)
                    FROM (
                        SELECT article_title, article_url, source_name, published_at
                        FROM business_partner_tracked_articles
                        WHERE account_id = acc.id AND competitor_name IS NULL
                        ORDER BY published_at DESC
                        LIMIT 3
                    ) as news
                ) as account_news,
                -- 2. Neueste Nachrichten zu den Wettbewerbern (wo competitor_name gesetzt ist)
                (
                    SELECT COALESCE(json_agg(comp_news.*), '[]'::json)
                    FROM (
                        SELECT competitor_name, article_title, article_url, source_name, published_at
                        FROM business_partner_tracked_articles
                        WHERE account_id = acc.id AND competitor_name IS NOT NULL
                        ORDER BY published_at DESC
                        LIMIT 5
                    ) as comp_news
                ) as competitor_news
            FROM business_partner_accounts acc
            WHERE acc.business_partner_id = $1
            ORDER BY acc.name ASC;
        `;
        
        const { rows } = await db.query(query, [businessPartnerId]);
        res.json(rows);

    } catch (err) {
        console.error('Error fetching account intelligence data:', err.message);
        res.status(500).send('Server error');
    }
};


exports.voteOnContent = async (req, res) => {
if (req.user.role === 'demo') {
        return res.status(403).json({ message: 'Demo-Benutzer dürfen nicht abstimmen.' });
    }    
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
if (req.user.role === 'demo') {
        // Bei Read-Status geben wir OK zurück, speichern aber nichts, damit das UI nicht crasht
        return res.status(200).json({ message: 'Simuliert: Als gelesen markiert (Demo).' });
    }    
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
if (req.user.role === 'demo') {
        return res.json({ 
            subject: "Demo Betreff", 
            body: "Dies ist eine simulierte E-Mail-Generierung im Demo-Modus." 
        });
    }    
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
if (req.user.role === 'demo') {
        return res.status(403).json({ message: 'E-Mail-Versand ist im Demo-Modus deaktiviert.' });
    }    
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
    // targetCountry wird nur noch für die Geocodierung verwendet, nicht mehr für die API-Auswahl
    const targetCountry = (country || 'DE').toString().toUpperCase(); 
    let lat = Number(latStr);
    let lng = Number(lngStr);
    const searchTerm = query ? query.toString().trim() : '';

    try {
        // --- Schritt 1: Geocodierung (falls nötig) ---
        if (searchTerm && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
            console.log(`[EV Search] Geocoding: "${searchTerm}" in ${targetCountry}`);
            const geocodeResp = await axios.get('https://nominatim.openstreetmap.org/search', {
                params: { q: searchTerm, countrycodes: targetCountry.toLowerCase(), format: 'json', limit: 1 },
                headers: { 'User-Agent': 'MobilitiDashboard/1.0 (deine-email@domain.de)' }
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

        // --- Schritt 2: Datenquellen für Vertrauensstatus holen ---
        const approvedSourcesRes = await db.query("SELECT url FROM sources WHERE status = 'approved'");
        const approvedDomains = new Set(approvedSourcesRes.rows.map(r => r.url));
        // E-Control bleibt hier drin, falls OCM Daten von dort spiegelt
        const providerDomainMap = {
            'E-Control': 'e-control.at',
            'OpenChargeMap': 'openchargemap.org'
        };

        // --- Schritt 3: IMMER OpenChargeMap abfragen (KORRIGIERT) ---
        console.log(`[EV Search] Querying OpenChargeMap (OCM) for lat=${lat}, lng=${lng}`);
        const apiKey = process.env.OPENCHARGEMAP_API_KEY;
        if (!apiKey) {
            console.error("[EV Search] OPENCHARGEMAP_API_KEY fehlt!");
            throw new Error('API-Key für OpenChargeMap fehlt.');
        }

        // Wir entfernen die "if (targetCountry === 'AT')" Logik
        const response = await axios.get('https://api.openchargemap.io/v3/poi', {
            params: {
                output: 'json', 
                latitude: lat, 
                longitude: lng,
                distance: 25, // 25km Radius
                distanceunit: 'km', 
                maxresults: 100, // Max. 100 Ergebnisse
                key: apiKey,
                // Optional: Wir können die Suche auf das Land einschränken,
                // das der Benutzer ausgewählt hat, um die Relevanz zu erhöhen.
                countrycode: targetCountry 
            }
        });
        
        const stations = (response.data || []).map(normalizeOcmStation).filter(Boolean);
        
        // --- Schritt 4: Vertrauensstatus hinzufügen und Antwort senden ---
        const finalStations = stations.map(station => {
            const providerKey = station.provider;
            const domain = providerKey ? providerDomainMap[providerKey] : null;
            return {
                ...station,
                is_trusted_source: domain ? approvedDomains.has(domain) : false
            };
        });

        res.json({ ok: true, stations: finalStations });

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

    // Logging reduziert, um Konsole nicht zu fluten
    // console.log('[DEBUG] getScrapedContent params:', { category, page });

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

        // --- Filterlogik ---
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
                    return res.json({ data: [], activeFilters: { tags: [] } });
                }
                const sourceIdentifier = `${businessPartnerId}_${category.split('_')[1]}`;
                whereClauses.push(`sc.source_identifier = $${paramIndex++}`);
                queryParams.push(sourceIdentifier);
            } else {
                whereClauses.push(`sc.category = $${paramIndex++}`);
                queryParams.push(category);
            }
        }
        
        if (category === 'fleet_podcasts') { 
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

        const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        
        let orderByClause = 'ORDER BY sc.published_date DESC, sc.scraped_at DESC';
        if (sortBy === 'relevance') {
            orderByClause = 'ORDER BY sc.relevance_score DESC, sc.published_date DESC';
        }

        // --- OPTIMIERTE QUERY ---
        // 1. full_text ENTFERNT! (Massive Payload-Reduktion)
        // 2. Fallback für summary eingebaut: Wenn summary leer ist, nimm die ersten 300 Zeichen von full_text
        const dataQuery = `
            SELECT
                sc.id, 
                sc.title, 
                sc.summary,
                sc.original_url, 
                sc.published_date,
                sc.event_date, 
                sc.category, 
                sc.scraped_at, 
                sc.relevance_score, 
                sc.region,
                sc.thumbnail_url,
                -- sc.full_text WURDE ENTFERNT, um Browser-Crash zu verhindern
                s.status = 'approved' AS is_trusted_source,
                EXISTS (
                    SELECT 1 FROM user_read_scraped_content ursc
                    WHERE ursc.scraped_content_id = sc.id AND ursc.user_id = $${paramIndex}
                ) as is_read,
                COALESCE(crv.vote, 0) as user_vote
            FROM scraped_content sc
            LEFT JOIN sources s ON sc.original_url LIKE s.url || '%'
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
            activeFilters: { tags: userSavedTags } 
        });

    } catch (err) {
        console.error(`Error fetching scraped content:`, err.message);
        res.status(500).json({ message: 'Error fetching scraped content', data: [] });
    }
};



exports.getScrapedContentCounts = async (req, res) => {
    // KORREKTUR: Wir nutzen token_issued_at statt last_login_at für stabile "Neu"-Zahlen
    const { id: userId, token_issued_at, business_partner_id: businessPartnerId } = req.user;
    const {
        limit = 10, category, region, search,
        tag, mainFilter
        // KORREKTUR: 'filter' (z.B. 'unread') ignorieren wir hier absichtlich!
        // Die Zähler sollen immer ALLES zählen, egal welchen Tab der User offen hat.
    } = req.query;

    // Fallback, falls token_issued_at fehlt
    const stableLastLogin = token_issued_at || new Date(0);

    try {
        const userSettingsResult = await db.query('SELECT article_score_min, article_score_max FROM users WHERE id = $1', [userId]);
        const { article_score_min, article_score_max } = userSettingsResult.rows[0] || {};
        const userTagsResult = await db.query('SELECT tag_name FROM user_saved_tags WHERE user_id = $1', [userId]);
        const userSavedTags = userTagsResult.rows.map(row => row.tag_name);

        const queryParams = [];
        let whereClauses = [];
        let paramIndex = 1;

        // --- Basis-Filter (Kategorie, Region etc.) übernehmen ---
        if (userSavedTags.length > 0) {
            whereClauses.push(`EXISTS (SELECT 1 FROM scraped_content_tags sct JOIN tags t ON sct.tag_id = t.id WHERE sct.scraped_content_id = sc.id AND t.name = ANY($${paramIndex}::text[]))`);
            queryParams.push(userSavedTags);
            paramIndex++;
        }
        if (category) {
            if (category.startsWith('businesspartner_')) {
                if (!businessPartnerId) return res.json({ totalPages: 0, counts: { unread: 0, new: 0 } });
                whereClauses.push(`sc.source_identifier = $${paramIndex++}`);
                queryParams.push(`${businessPartnerId}_${category.split('_')[1]}`);
            } else {
                whereClauses.push(`sc.category = $${paramIndex++}`);
                queryParams.push(category);
            }
        }
        if (category === 'fleet_podcasts') whereClauses.push(`sc.original_url ~* '\\.(mp3|m4a|aac|ogg|wav)(\\?|$)'`);
        if (region && region !== 'all') { whereClauses.push(`sc.region = $${paramIndex++}`); queryParams.push(region); }
        if (search) { whereClauses.push(`(sc.title ILIKE $${paramIndex} OR sc.summary ILIKE $${paramIndex})`); queryParams.push(`%${search}%`); paramIndex++; }
        if (mainFilter) { whereClauses.push(`EXISTS (SELECT 1 FROM scraped_content_tags sct JOIN tags t ON sct.tag_id = t.id WHERE sct.scraped_content_id = sc.id AND t.name = $${paramIndex})`); queryParams.push(mainFilter); paramIndex++; }
        if (tag && tag !== 'all') { whereClauses.push(`EXISTS (SELECT 1 FROM scraped_content_tags sct JOIN tags t ON sct.tag_id = t.id WHERE sct.scraped_content_id = sc.id AND t.name = $${paramIndex})`); queryParams.push(tag); paramIndex++; }
        if (article_score_min != null) { whereClauses.push(`sc.relevance_score >= $${paramIndex++}`); queryParams.push(article_score_min); }
        if (article_score_max != null) { whereClauses.push(`sc.relevance_score <= $${paramIndex++}`); queryParams.push(article_score_max); }

        const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const baseJoin = `FROM scraped_content sc LEFT JOIN sources s ON sc.original_url = s.url`;

        // 1. Pagination Total (bleibt exakt)
        const countQuery = `SELECT COUNT(sc.id) as total_items ${baseJoin} ${whereString}`;
        const totalResult = await db.query(countQuery, queryParams);
        const totalItems = parseInt(totalResult.rows[0].total_items, 10);
        const totalPages = Math.ceil(totalItems / (parseInt(limit, 10) || 10));

        // 2. Optimierte Zähler (Limit 11 + 30 Tage Zeitfenster + KEIN Filter auf 'unread'/'new')
        const pIdxUser = paramIndex; 
        const pIdxLogin = paramIndex + 1;
        const countParams = [...queryParams, userId, stableLastLogin];

        // UNREAD: "Jünger als 30 Tage UND nicht gelesen" (Max 11)
        const unreadQuery = `
            SELECT COUNT(*) as cnt FROM (
                SELECT sc.id 
                ${baseJoin}
                ${whereString ? whereString + ' AND ' : 'WHERE '}
                sc.created_at > NOW() - INTERVAL '30 days' 
                AND NOT EXISTS (SELECT 1 FROM user_read_scraped_content ursc WHERE ursc.scraped_content_id = sc.id AND ursc.user_id = $${pIdxUser})
                LIMIT 11
            ) sub
        `;

        // NEW: "Neuer als Login-Zeitpunkt" (Max 11)
        const newQuery = `
            SELECT COUNT(*) as cnt FROM (
                SELECT sc.id 
                ${baseJoin}
                ${whereString ? whereString + ' AND ' : 'WHERE '}
                sc.created_at > $${pIdxLogin}
                LIMIT 11
            ) sub
        `;

        const [unreadRes, newRes] = await Promise.all([
            db.query(unreadQuery, countParams),
            db.query(newQuery, countParams)
        ]);

        res.json({
            totalPages: totalPages,
            counts: {
                unread: parseInt(unreadRes.rows[0].cnt, 10),
                new: parseInt(newRes.rows[0].cnt, 10),
            },
        });

    } catch (err) {
        console.error(`Error fetching scraped content COUNTS:`, err.message);
        res.json({ totalPages: 0, counts: { unread: 0, new: 0 } }); 
    }
};


exports.markScrapedContentAsRead = async (req, res) => {
if (req.user.role === 'demo') {
        return res.status(200).json({ message: 'Simuliert: Als gelesen markiert (Demo).' });
    }    
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

    console.log(`[EcoStats API] Anfrage erhalten: Type="${statisticType}", Country="${countryCode}"`);

    if (!statisticType) {
        return res.status(400).json({ ok: false, message: 'Ein "statisticType" ist erforderlich.' });
    }

    try {
        // Wir nehmen einen weiteren Zeitraum (2 Jahre), um sicherzugehen, dass Daten gefunden werden
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 2); 

        console.log(`[EcoStats API] Suche Daten ab: ${startDate.toISOString()}`);

        const query = `
            SELECT 
                es.time_period, 
                es.statistic_subtype, 
                es.value, 
                es.unit, 
                es.source_name, 
                es.source_url,
                s.status = 'approved' AS is_trusted_source
            FROM economic_statistics es
            LEFT JOIN sources s ON es.source_url LIKE s.url || '%'
            WHERE
                es.statistic_type = $1 AND
                es.country_code = $2 AND
                es.time_period >= $3
            ORDER BY es.time_period ASC, es.statistic_subtype ASC;
        `;
        
        const queryParams = [statisticType, countryCode, startDate];
        
        // Führe die Query aus
        const { rows } = await db.query(query, queryParams);

        console.log(`[EcoStats API] DB Resultat: ${rows.length} Zeilen gefunden.`);

        if (rows.length === 0) {
            // Debugging: Prüfen, ob es überhaupt Daten für diesen Typ gibt (unabhängig vom Land/Datum)
            const checkQuery = `SELECT count(*) as total FROM economic_statistics WHERE statistic_type = $1`;
            const checkRes = await db.query(checkQuery, [statisticType]);
            console.log(`[EcoStats API DEBUG] Total Einträge für Typ "${statisticType}" in DB: ${checkRes.rows[0].total}`);
            
            return res.json({ ok: true, data: [], subtypes: [], source: null });
        }

        // Daten pivotieren (gleiche Logik wie vorher)
        const pivotedData = rows.reduce((acc, row) => {
            // WICHTIG: Datum sicher formatieren, um Zeitzonenprobleme zu vermeiden
            const d = new Date(row.time_period);
            const dateStr = d.toISOString().split('T')[0];
            
            if (!acc[dateStr]) {
                acc[dateStr] = { date: dateStr };
            }
            acc[dateStr][row.statistic_subtype] = parseFloat(row.value);
            return acc;
        }, {});

        const chartData = Object.values(pivotedData);
        // Sortieren nach Datum sicherstellen
        chartData.sort((a, b) => new Date(a.date) - new Date(b.date));

        const subtypes = [...new Set(rows.map(r => r.statistic_subtype))];
        const latestSourceInfo = rows[rows.length - 1]; // Neueste Quelle nehmen

        console.log(`[EcoStats API] Sende ${chartData.length} aggregierte Datenpunkte an Frontend.`);

        res.json({
            ok: true,
            data: chartData,
            subtypes: subtypes,
            source: {
                name: latestSourceInfo.source_name,
                url: latestSourceInfo.source_url,
                is_trusted: !!latestSourceInfo.is_trusted_source
            }
        });

    } catch (error) {
        console.error('[EcoStats API] SCHWERWIEGENDER FEHLER:', error);
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
    // KORREKTUR 1: 'category' aus dem Request lesen
    const { page = 1, limit = 50, category } = req.query; 
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    try {
        const queryParams = [];
        let whereClauses = [];
        let paramIndex = 1;

        // KORREKTUR 2: Nur Events anzeigen, die heute oder in der Zukunft sind (ODER z.B. max 30 Tage alt)
        // Wenn du 'Anstehend' priorisieren willst, filtern wir alte Events raus.
        // Falls du auch vergangene sehen willst, müsste man die Logik komplexer machen (z.B. 2 Queries).
        // Hier: Wir holen alles ab HEUTE.
        whereClauses.push(`sc.event_date >= CURRENT_DATE`); 

        // KORREKTUR 3: Auf die spezifische Kategorie filtern, falls vorhanden
        if (category) {
            whereClauses.push(`sc.category = $${paramIndex}`);
            queryParams.push(category);
            paramIndex++;
        } else {
            // Fallback auf dein altes Muster, falls keine Kategorie kommt
            whereClauses.push(`sc.category LIKE '%_events'`); 
        }

        whereClauses.push(`sc.event_date IS NOT NULL`);

        const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Zähle nur die relevanten Items
        const countQuery = `
            SELECT COUNT(sc.id) as total_items 
            FROM scraped_content sc
            LEFT JOIN sources s ON sc.original_url LIKE s.url || '%'
            ${whereString}
        `;
        const totalResult = await db.query(countQuery, queryParams);
        const totalItems = parseInt(totalResult.rows[0].total_items, 10);
        const totalPages = Math.ceil(totalItems / limit);

        const dataQuery = `
            SELECT 
                sc.id, sc.title, sc.event_date AS date, sc.summary, 
                sc.original_url AS url, sc.region, sc.full_text,
                s.status = 'approved' AS is_trusted_source,
                EXISTS (SELECT 1 FROM user_read_scraped_content ursc WHERE ursc.scraped_content_id = sc.id AND ursc.user_id = $${paramIndex}) as is_read,
                (
                    SELECT COALESCE(json_agg(json_build_object(
                        'id', u.id,
                        'first_name', u.first_name,
                        'last_name', u.last_name,
                        'profile_image_url', u.profile_image_url,
                        'last_login_at', u.last_login_at
                    )), '[]'::json)
                    FROM content_relevance_votes crv
                    JOIN users u ON crv.user_id = u.id
                    WHERE crv.content_id = sc.id AND crv.vote = 1
                ) AS participants_data,
                (
                    SELECT COALESCE(json_agg(json_build_object(
                        'id', u.id,
                        'first_name', u.first_name,
                        'last_name', u.last_name,
                        'profile_image_url', u.profile_image_url,
                        'last_login_at', u.last_login_at
                    )), '[]'::json)
                    FROM content_relevance_votes crv
                    JOIN users u ON crv.user_id = u.id
                    WHERE crv.content_id = sc.id AND crv.vote = 0
                ) AS maybe_participants_data,
                COALESCE((SELECT vote FROM content_relevance_votes WHERE content_id = sc.id AND user_id = $${paramIndex}), NULL) AS "userVote"
            FROM scraped_content sc
            LEFT JOIN sources s ON sc.original_url LIKE s.url || '%'
            ${whereString}
            ORDER BY sc.event_date ASC
            LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
        `;

        // Parameter zusammenbauen: [category?, userId, limit, offset]
        const finalParams = [...queryParams, userId, parseInt(limit, 10), offset];
        
        const { rows: events } = await db.query(dataQuery, finalParams);

        // Regionen Logik beibehalten
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
if (req.user.role === 'demo') {
        return res.status(403).json({ message: 'Teilnahme-Voting ist im Demo-Modus deaktiviert.' });
    }    
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
if (req.user.role === 'demo') {
        return res.status(403).json({ message: 'E-Mail-Versand ist im Demo-Modus deaktiviert.' });
    }    
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
        cs.primary_color, cs.primary_text_color,
        cs.secondary_color,
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
      primary_text_color: r.primary_text_color,
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



// backend/controllers/dataController.js

// ... (andere Exports bleiben gleich)

exports.globalSearch = async (req, res) => {
    const { term } = req.query;
    const { business_partner_id } = req.user; // ID für Sicherheits-Filter

    if (!term || typeof term !== 'string' || term.trim().length < 3) {
        return res.status(400).json({ message: 'Ein Suchbegriff mit mindestens 3 Zeichen ist erforderlich.' });
    }

    const formattedTerm = term.trim().split(/\s+/).join(' & ');

    try {
        const query = `
            SELECT id, title, summary, published_date, type, relevance, url
            FROM (
                -- 1. Scraped Content (Öffentlich/Web)
                SELECT
                    id, title, summary, published_date,
                    'scraped' as type,
                    original_url as url,
                    ts_rank(to_tsvector('german', title || ' ' || COALESCE(summary, '')), to_tsquery('german', $1)) as relevance
                FROM scraped_content
                WHERE to_tsvector('german', title || ' ' || COALESCE(summary, '')) @@ to_tsquery('german', $1)
                
                UNION ALL
                
                -- 2. AI Content (Intern generiert)
                SELECT
                    id, title, generated_output as summary, created_at as published_date,
                    'ai' as type,
                    source_reference as url,
                    ts_rank(to_tsvector('german', title || ' ' || COALESCE(generated_output, '')), to_tsquery('german', $1)) as relevance
                FROM ai_generated_content
                WHERE to_tsvector('german', title || ' ' || COALESCE(generated_output, '')) @@ to_tsquery('german', $1)

                UNION ALL

                -- 3. Account News (Web)
                SELECT
                    id, article_title as title, summary, published_at as published_date,
                    'tracked_account_news' as type,
                    article_url as url,
                    ts_rank(to_tsvector('german', article_title || ' ' || COALESCE(summary, '')), to_tsquery('german', $1)) as relevance
                FROM business_partner_tracked_articles
                WHERE to_tsvector('german', article_title || ' ' || COALESCE(summary, '')) @@ to_tsquery('german', $1)

                UNION ALL

                -- 4. ✅ NEU: Dateien (Files) - Nur eigener Business Partner!
                SELECT
                    id, 
                    filename as title, 
                    COALESCE(description, 'Datei im Dateimanager') as summary, 
                    created_at as published_date,
                    'file' as type,
                    '/files' as url, -- Link zur File-Seite
                    ts_rank(to_tsvector('german', filename || ' ' || COALESCE(description, '') || ' ' || COALESCE(array_to_string(tags, ' '), '')), to_tsquery('german', $1)) as relevance
                FROM business_partner_files
                WHERE 
                    business_partner_id = $2
                    AND to_tsvector('german', filename || ' ' || COALESCE(description, '') || ' ' || COALESCE(array_to_string(tags, ' '), '')) @@ to_tsquery('german', $1)

                UNION ALL

                -- 5. ✅ NEU: Community Posts - Nur eigener Business Partner!
                SELECT
                    p.id, 
                    'Community Beitrag' as title, -- Oder User Name
                    p.content as summary, 
                    p.created_at as published_date,
                    'community_post' as type,
                    '/community' as url,
                    ts_rank(to_tsvector('german', p.content), to_tsquery('german', $1)) as relevance
                FROM community_posts p
                WHERE 
                    p.business_partner_id = $2
                    AND to_tsvector('german', p.content) @@ to_tsquery('german', $1)

            ) as search_results
            ORDER BY relevance DESC
            LIMIT 30;
        `;

        // WICHTIG: Parameter $2 ist business_partner_id
        const { rows } = await db.query(query, [formattedTerm, business_partner_id]);
        res.json(rows);

    } catch (err) {
        console.error('Fehler bei der globalen Suche:', err.message);
        res.status(500).json({ message: 'Serverfehler bei der Suche.' });
    }
};


exports.generateDraftFromContent = async (req, res) => {
if (req.user.role === 'demo') {
        return res.json({ draft: "Dies ist ein generierter Beispiel-Entwurf. Im Demo-Modus werden keine echten KI-Anfragen gesendet." });
    }    
    const { contentId } = req.body; // Das Frontend sendet die ID des Artikels
    const { id: userId } = req.user;

    if (!contentId) {
        return res.status(400).json({ message: 'Content-ID fehlt.' });
    }

    let jobId;

    try {
        // Schritt 1: Den Inhalt des Artikels aus der Datenbank laden
        const contentRes = await db.query(
            'SELECT title, summary FROM scraped_content WHERE id = $1',
            [contentId]
        );

        if (contentRes.rows.length === 0) {
            return res.status(404).json({ message: 'Inhalt nicht gefunden.' });
        }
        const content = contentRes.rows[0];

        // Hier könnte man wie im Funding-Controller optional noch Gamification-Logik einbauen (Punkte abziehen, etc.)

        // Schritt 2: AI-Job für die Nachverfolgung erstellen
        const jobResult = await db.query(
            `INSERT INTO ai_jobs (status, is_automated) VALUES ('running', false) RETURNING id`
        );
        jobId = jobResult.rows[0].id;

        // Schritt 3: Prompt für die KI erstellen und KI-Service aufrufen
        const promptTemplate = `
            Du bist ein Experte für interne Kommunikation. Formuliere basierend auf dem folgenden Artikel einen
            kurzen, informativen und ansprechenden Text für einen internen Newsletter an Mitarbeiter oder Fahrer eines Fuhrparks.
            Hebe die wichtigsten Kernaussagen hervor.
            Antworte ausschließlich mit dem finalen Text, ohne einleitende Sätze wie "Hier ist der Entwurf".
            {{data}}
        `;
        const inputText = `
            Original-Titel: "${content.title}"
            Zusammenfassung des Artikels: "${content.summary}"
        `;

        const { aiResultString } = await generateAIContent({
            promptTemplate, 
            inputText, 
            ai_provider: 'OpenAI GPT-4o', // oder was auch immer konfiguriert ist
            jobId, 
            userId
        });

        // Schritt 4: Job als erfolgreich markieren und Ergebnis zurücksenden
        await db.query(`UPDATE ai_jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`, [jobId]);

        res.json({ draft: aiResultString });

    } catch (err) {
        if (jobId) {
            await db.query(`UPDATE ai_jobs SET status = 'failed' WHERE id = $1`, [jobId]);
        }
        console.error('Error in generateDraftFromContent:', err.message);
        res.status(500).send('Ein interner Serverfehler ist aufgetreten.');
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



exports.getDailyBriefing = async (req, res) => {
    const { business_partner_id: businessPartnerId } = req.user;
    if (!businessPartnerId) {
        return res.status(404).json({ message: "Benutzer ist keinem Business Partner zugeordnet." });
    }

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Alle drei Abfragen werden parallel ausgeführt, um die Ladezeit zu optimieren
        const [marketBriefingRes, salesTriggersRes, linkableNamesRes] = await Promise.all([
            // 1. Markt-Briefing des Tages holen (unverändert)
            db.query(
                `SELECT headline, analysis_summary as summary, prognosis 
                 FROM business_partner_intelligence_briefings
                 WHERE business_partner_id = $1 AND briefing_type = 'market' AND created_at >= $2
                 ORDER BY created_at DESC LIMIT 1`,
                [businessPartnerId, today]
            ),
            // 2. Sales Trigger des Tages holen (unverändert)
            db.query(
                `SELECT brief.id, brief.account_id, brief.headline, brief.analysis_summary, 
                        brief.talking_point, acc.name as account_name 
                 FROM business_partner_intelligence_briefings brief
                 JOIN business_partner_accounts acc ON brief.account_id = acc.id
                 WHERE brief.business_partner_id = $1 AND brief.briefing_type = 'account_specific' AND brief.created_at >= $2
                 ORDER BY brief.created_at DESC`,
                [businessPartnerId, today]
            ),
            // 3. NEU: Eine vollständige Liste aller Accounts und Wettbewerber dieses Partners holen
            db.query(
                `(SELECT name FROM business_partner_accounts WHERE business_partner_id = $1)
                 UNION
                 (SELECT bpc.name FROM business_partner_competitors bpc
                  JOIN business_partner_accounts bpa ON bpc.account_id = bpa.id
                  WHERE bpa.business_partner_id = $1)`,
                [businessPartnerId]
            )
        ]);

        res.json({
            market_briefing: marketBriefingRes.rows[0] || null,
            sales_triggers: salesTriggersRes.rows,
            // NEU: Die Liste der Namen wird an das Frontend gesendet
            linkable_names: linkableNamesRes.rows.map(r => r.name)
        });

    } catch (err) {
        console.error('Error fetching daily briefing:', err.message);
        res.status(500).send('Server error');
    }
};


async function retrieveInternalDocuments(searchTerm) {
    if (!searchTerm || searchTerm.trim().length < 3) {
        return [];
    }
    const formattedTerm = searchTerm.trim().split(/\s+/).join(' & ');

    try {
        const query = `
            SELECT id, title, summary, published_date, type, url, relevance
            FROM (
                SELECT
                    id, title, summary, published_date, 'scraped' as type,
                    original_url as url,
                    ts_rank(to_tsvector('german', title || ' ' || summary), to_tsquery('german', $1)) as relevance
                FROM scraped_content
                WHERE to_tsvector('german', title || ' ' || summary) @@ to_tsquery('german', $1)
                
                UNION ALL
                
                SELECT
                    id, title, generated_output as summary, created_at as published_date, 'ai' as type,
                    source_reference as url,
                    ts_rank(to_tsvector('german', title || ' ' || generated_output), to_tsquery('german', $1)) as relevance
                FROM ai_generated_content
                WHERE to_tsvector('german', title || ' ' || generated_output) @@ to_tsquery('german', $1)

                UNION ALL

                SELECT
                    id, article_title as title, summary, published_at as published_date,
                    'tracked_account_news' as type,
                    article_url as url,
                    ts_rank(to_tsvector('german', article_title || ' ' || summary), to_tsquery('german', $1)) as relevance
                FROM business_partner_tracked_articles
                WHERE to_tsvector('german', article_title || ' ' || summary) @@ to_tsquery('german', $1)

            ) as search_results
            ORDER BY relevance DESC
            LIMIT 5; -- Wir nehmen die Top 5 relevantesten Dokumente
        `;
        const { rows } = await db.query(query, [formattedTerm]);
        return rows;
    } catch (err) {
        console.error('Fehler beim Abrufen interner Dokumente (RAG-Retrieval):', err.message);
        return [];
    }
}

// Der neue Controller für die KI-Anfrage
// AKTUALISIERTER Controller für die KI-Anfrage (mit korrigierter Transaktion)
exports.handleAiQuestion = async (req, res) => {
if (req.user.role === 'demo') {
        return res.status(403).json({ message: 'KI-Anfragen sind im Demo-Modus deaktiviert.' });
    }    
    const { question } = req.body;
    const { id: userId, business_partner_id: businessPartnerId } = req.user;

    if (!question) {
        return res.status(400).json({ message: 'Eine Frage (question) ist erforderlich.' });
    }
    if (!businessPartnerId) {
        return res.status(403).json({ message: 'Benutzer ist keinem Business Partner zugeordnet.' });
    }

    let jobId;
    const client = await db.connect();
    try {
        // --- START Transaktion 1: Job-Erstellung & Gamification ---
        await client.query('BEGIN');

        // Schritt 1: Job für Logging erstellen
        const jobResult = await client.query(`INSERT INTO ai_jobs (status, is_automated) VALUES ('running', false) RETURNING id`);
        jobId = jobResult.rows[0].id;
        
        await logToDb(jobId, 'INFO', `Starte RAG-Anfrage für User ${userId}. Frage: "${question}"`);

        // Schritt 2: Gamification (Punkteabzug)
        const pointsChange = -2;
        await client.query(
            'UPDATE users SET contribution_score = contribution_score + $1 WHERE id = $2',
            [pointsChange, userId]
        );

        // Schritt 3: Punkteabzug protokollieren
        const description = `Punkte für KI-Anfrage erhalten: "${question.substring(0, 100)}..."`;
        await client.query(
            `INSERT INTO user_score_logs (reference_id, user_id, points_change, action_type, description) 
             VALUES ($1, $2, $3, $4, $5)`,
            [jobId, userId, pointsChange, 'AI_QUERY', description]
        );

        // --- COMMIT Transaktion 1 ---
        // Der Job ist jetzt für alle anderen Verbindungen (wie aiExecutionService) sichtbar.
        await client.query('COMMIT');
        // --- ENDE Transaktion 1 ---

        // Schritt 4: Branchenspezifische Daten abrufen (außerhalb der Transaktion)
        const partnerRes = await client.query(
            `SELECT 
                bp.dashboard_focus,
                (
                    SELECT COALESCE(json_agg(c.name), '[]'::json)
                    FROM business_partner_categories bpc
                    JOIN categories c ON bpc.category_id = c.id
                    WHERE bpc.business_partner_id = bp.id AND c.category_type = 'industry'
                ) as industries
             FROM business_partners bp
             WHERE bp.id = $1;`,
            [businessPartnerId]
        );

        if (partnerRes.rows.length === 0) {
            throw new Error('Business Partner nicht gefunden.');
        }

        const partner = partnerRes.rows[0];
        const industryNames = partner.industries.length > 0 
            ? partner.industries.join(', ') 
            : 'allgemeine Mobilität und Fuhrparkmanagement';
        
        await logToDb(jobId, 'INFO', `Partner-Fokus: ${partner.dashboard_focus}. Branchen: ${industryNames}`);

        // Schritt 5: Interne Dokumente abrufen (Retrieval)
        const documents = await retrieveInternalDocuments(question);
        let context = 'Keine relevanten internen Dokumente gefunden.';
        if (documents.length > 0) {
            context = documents.map(doc => 
                `--- DOKUMENT (ID: ${doc.id}, Typ: ${doc.type}) ---\nTITEL: ${doc.title}\nINHALT: ${doc.summary || ''}\nQUELLE: ${doc.url || 'Intern'}\n---`
            ).join('\n\n');
        }
        await logToDb(jobId, 'INFO', `${documents.length} interne Dokumente gefunden.`);

        // Schritt 6: Dynamischen, branchenspezifischen Prompt erstellen (Augment)
        const promptTemplate = `
          Du bist ein hochqualifizierter KI-Assistent, spezialisiert auf die Branchen: ${industryNames}.
          ${partner.dashboard_focus === 'sales' ? 'Deine Antworten sollten besonders auf Vertriebschancen (Sales Trigger) und Geschäftsmöglichkeiten achten.' : 'Deine Antworten sollten informativ, präzise und neutral sein.'}
          BEANTWORTE DIE FRAGE DES BENUTZERS: "${question}"
          BASIERE DEINE ANTWORT AUF DEINEM ALLGEMEINEN WISSEN UND DEN FOLGENDEN INTERNEN DOKUMENTEN.
          BEZIEHE DICH WO IMMER MÖGLICH AUF DIESE DOKUMENTE, ABER ERWÄHNE NICHT DIE "DOKUMENT-ID".
          Formatiere deine Antwort als klares, lesbares Markdown.
          --- INTERNE DOKUMENTE ALS KONTEXT ---
          {{data}}
          --- ENDE DES KONTEXTES ---
        `;

        // Schritt 7: KI-Anfrage ausführen (Generate)
        // Diese Funktion kann jetzt sicher in ai_logs/ai_usage_logs schreiben,
        // da jobId committet ist.
        const { aiResultString } = await generateAIContent({
            promptTemplate,
            inputText: context,
            ai_provider: 'OpenAI GPT-4o',
            jobId: jobId,
            userId: userId
        });

        await logToDb(jobId, 'SUCCESS', 'RAG-Antwort erfolgreich generiert.');
        
        // Schritt 8: Job-Status aktualisieren (in einer neuen, kleinen Transaktion)
        await client.query(`UPDATE ai_jobs SET status = 'completed' WHERE id = $1`, [jobId]);

        // Schritt 9: Antwort an Frontend senden
        res.json({
            answer: aiResultString,
            sources: documents.map(doc => ({
                id: doc.id,
                title: doc.title,
                type: doc.type,
                url: doc.url || `/search?term=${encodeURIComponent(doc.title)}`
            }))
        });

    } catch (err) {
        // --- Rollback ist nur nötig, wenn der Fehler VOR dem Commit passiert ist ---
        // (Ein Rollback einer bereits committeten Transaktion ist nicht möglich,
        //  aber wir fangen den Fehler der KI-Ausführung ab)
        console.error('Fehler in handleAiQuestion:', err.message);
        
        if (jobId) {
            await logToDb(jobId, 'ERROR', `RAG-Job fehlgeschlagen: ${err.message}`);
            // Setze den Job-Status auf 'failed'
            try {
                await client.query(`UPDATE ai_jobs SET status = 'failed' WHERE id = $1`, [jobId]);
            } catch (updateErr) {
                console.error('Konnte Job-Status nach Fehler nicht auf FAILED setzen:', updateErr);
            }
        }
        res.status(500).json({ message: 'Fehler bei der Verarbeitung der KI-Anfrage.' });
    } finally {
        client.release();
    }
};


exports.getNotificationCounts = async (req, res) => {
    const { id: userId, business_partner_id: businessPartnerId } = req.user;

    if (!userId) {
        return res.status(401).json({ message: 'Authentifizierung erforderlich.' });
    }

    try {
        const userRes = await db.query('SELECT last_login_at FROM users WHERE id = $1', [userId]);
        const lastLogin = userRes.rows[0]?.last_login_at || new Date(0);

        // Wir führen die Zählungen parallel aus
        const [scrapedNew, aiNew, actionsNew] = await Promise.all([
            
            // --- KORREKTUR ---
            // 1. Zählt 'scraped_content', das NEUER als der letzte Login ist
            db.query(
                `SELECT COUNT(sc.id) 
                 FROM scraped_content sc 
                 WHERE sc.created_at > $1`, // Statt "NOT EXISTS"
                [lastLogin]
            ),
            
            // --- KORREKTUR ---
            // 2. Zählt 'ai_content', das NEUER als der letzte Login ist
            db.query(
                `SELECT COUNT(ac.id) 
                 FROM ai_generated_content ac 
                 WHERE ac.created_at > $1`, // Statt "NOT EXISTS"
                [lastLogin]
            ),

            // 3. Neue 'business_partner_actions' (Diese Logik war bereits korrekt)
            isValidUUID(businessPartnerId)
                ? db.query(
                    `SELECT COUNT(bpa.id) 
                     FROM business_partner_actions bpa 
                     WHERE bpa.business_partner_id = $1 AND bpa.created_at > $2`,
                    [businessPartnerId, lastLogin]
                  )
                : Promise.resolve({ rows: [{ count: 0 }] })
        ]);

        const totalCount = 
            parseInt(scrapedNew.rows[0].count, 10) +
            parseInt(aiNew.rows[0].count, 10) +
            parseInt(actionsNew.rows[0].count, 10);

        res.json({ totalCount: totalCount });

    } catch (err) {
        console.error('Fehler beim Abrufen der Benachrichtigungszählungen:', err.message);
        res.status(500).json({ message: 'Serverfehler.' });
    }
};



exports.getBusinessPartnerMembersPreview = async (req, res) => {
    // Wir holen uns die User-Info UND erlauben optional einen Query-Parameter zur Übersteuerung (für Admins wichtig)
    const { id: userId, business_partner_id: userBpId, role: userRole } = req.user;
    const { businessPartnerId: queryBpId } = req.query;

    // Priorität: Query-Param (für Admins, die filtern) -> User-BP-ID (für Assistenz/User)
    // Wenn User 'admin' ist und queryBpId sendet, nutzen wir das.
    // Wenn User 'assistenz' ist, zwingen wir userBpId.
    
    let targetBpId = null;

    if (userRole === 'admin' && queryBpId) {
        targetBpId = queryBpId;
    } else {
        targetBpId = userBpId;
    }

    console.log(`[DEBUG MembersPreview] UserID: ${userId}, Role: ${userRole}, UserBP: ${userBpId}, QueryBP: ${queryBpId} -> FINAL BP: ${targetBpId}`);

    if (!targetBpId) {
        console.warn('[DEBUG MembersPreview] Abbruch: Keine Business Partner ID ermittelt.');
        return res.json({ total: 0, members: [] });
    }

    try {
        // 1. Gesamtanzahl aktiver Mitglieder
        const countRes = await db.query(
            'SELECT COUNT(*) FROM users WHERE business_partner_id = $1 AND is_active = TRUE',
            [targetBpId]
        );
        const total = parseInt(countRes.rows[0].count, 10);

        // 2. Die 6 neuesten Mitglieder für die Vorschau
        const membersRes = await db.query(`
            SELECT id, first_name, last_name, profile_image_url, role, last_login_at
            FROM users
            WHERE business_partner_id = $1 AND is_active = TRUE
            ORDER BY 
                CASE WHEN role IN ('admin', 'assistenz') THEN 0 ELSE 1 END,
                created_at DESC
            LIMIT 6
        `, [targetBpId]);

        console.log(`[DEBUG MembersPreview] Gefunden: ${total} User für BP ${targetBpId}`);

        res.json({
            total,
            members: membersRes.rows
        });

    } catch (err) {
        console.error('Fehler beim Laden der Mitglieder-Vorschau:', err.message);
        res.status(500).send('Serverfehler');
    }
};


exports.getMarketSentiment = async (req, res) => {
    const { id: userId, business_partner_id: bpId } = req.user;

    try {
        if (!bpId) {
            return res.json({ active: false, message: "Kein Business Partner zugeordnet" });
        }

        // 1. Finde die Barometer-Umfrage DES PARTNERS
        const surveyRes = await db.query(
            "SELECT id FROM surveys WHERE title = 'Markt-Barometer' AND business_partner_id = $1 AND is_active = TRUE LIMIT 1",
            [bpId]
        );
        
        if (surveyRes.rows.length === 0) {
            return res.json({ active: false, message: "Kein Barometer für diesen Partner aktiv" });
        }
        const surveyId = surveyRes.rows[0].id;

        // ... (Rest bleibt identisch: Neueste Frage holen, Votes prüfen, Statistik berechnen) ...
        // Ab hier musst du nichts ändern, da die Logik auf 'surveyId' basiert, 
        // und wir oben jetzt die korrekte surveyId (die des Partners) geholt haben.
        
        // Kopie des Rests zur Sicherheit:
        const questionRes = await db.query(`
            SELECT id, question_text, options 
            FROM survey_questions 
            WHERE survey_id = $1 
            ORDER BY display_order DESC, id DESC 
            LIMIT 1
        `, [surveyId]);

        if (questionRes.rows.length === 0) return res.json({ active: false });
        
        const question = questionRes.rows[0];

        // Prüfen ob User abgestimmt hat
        const userVoteRes = await db.query(
            "SELECT response_text FROM survey_responses WHERE question_id = $1 AND user_id = $2",
            [question.id, userId]
        );
        const hasVoted = userVoteRes.rows.length > 0;
        const userVote = hasVoted ? userVoteRes.rows[0].response_text : null;

        // Statistik
        const statsRes = await db.query(`
            SELECT response_text, COUNT(*) as count 
            FROM survey_responses 
            WHERE question_id = $1 
            GROUP BY response_text
        `, [question.id]);

        let totalVotes = 0;
        const sentimentCounts = { bullish: 0, bearish: 0 };

        statsRes.rows.forEach(row => {
            const count = parseInt(row.count, 10);
            totalVotes += count;
            if (row.response_text === 'bullish') sentimentCounts.bullish = count;
            else if (row.response_text === 'bearish') sentimentCounts.bearish = count;
        });

        res.json({
            active: true,
            questionId: question.id,
            questionText: question.question_text,
            hasVoted,
            userVote,
            stats: {
                total: totalVotes,
                bullishPercent: totalVotes > 0 ? Math.round((sentimentCounts.bullish / totalVotes) * 100) : 0,
                bearishPercent: totalVotes > 0 ? Math.round((sentimentCounts.bearish / totalVotes) * 100) : 0,
            }
        });

    } catch (err) {
        console.error("Fehler beim Sentiment-Abruf:", err);
        res.status(500).json({ message: "Serverfehler" });
    }
};

// Vote-Funktion (nutzt du wahrscheinlich schon, aber hier spezifisch für Sentiment)
exports.voteSentiment = async (req, res) => {
    const { questionId, vote } = req.body; // vote = 'bullish' | 'bearish'
    const { id: userId } = req.user;

    try {
        await db.query(
            "INSERT INTO survey_responses (survey_id, question_id, user_id, response_text) VALUES ((SELECT survey_id FROM survey_questions WHERE id = $1), $1, $2, $3)",
            [questionId, userId, vote]
        );
        
        // +1 Punkt Gamification
        await db.query('UPDATE users SET contribution_score = contribution_score + 1 WHERE id = $1', [userId]);

        res.json({ success: true });
    } catch (err) {
        // Unique Constraint fängt Doppel-Votes ab
        res.status(400).json({ message: "Bereits abgestimmt." });
    }
};