// backend/controllers/dataController.js
const axios = require('axios');
const db = require('../config/db');
const { sendEmail } = require('../services/emailService');
const { renderLayout } = require('../services/emailTemplates');
const { generateAIContent } = require('../services/aiExecutionService');
const { logToDb } = require('../services/aiExecutionService'); 
const TANKERKOENIG_API_KEY = process.env.TANKERKOENIG_API_KEY;
const ECONTROL_API_KEY     = process.env.ECONTROL_API_KEY;
const ECONTROL_BASE_URL    = process.env.ECONTROL_BASE_URL;
const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);
const toStr  = (v) => (v === null || v === undefined) ? '' : String(v);
const normNum = (v) => (v === null || v === undefined) ? null : Number(v);
const fs = require('fs');

const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
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
                user_id = $1
                AND favorite_type = 'FuelPrices'
                AND external_id = $2;
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

    (station.prices || []).forEach((p) => {
        const key = mapFuelKeyAT(p.fuelType);
        if (key) priceMap[key] = p.amount;
    });

    const addr = station.location?.address || '';
    let street = addr;
    let houseNumber = null;

    const m = addr.match(/^(.+?)\s+(\d+[a-zA-Z]?)$/);
    if (m) {
        street = m[1];
        houseNumber = m[2];
    }

    return {
        id: `AT-${station.id}`,
        external_id: `AT-${station.id}`,
        raw_id: String(station.id),
        name: station.name || null,
        brand: (station.name || '').split(' ')[0] || null,
        street: street || null,
        house_no: houseNumber,
        post_code: station.location?.postalCode ? String(station.location.postalCode) : null,
        city: station.location?.city || null,
        lat: Number.isFinite(Number(station.location?.latitude)) ? Number(station.location.latitude) : null,
        lng: Number.isFinite(Number(station.location?.longitude)) ? Number(station.location.longitude) : null,
        last_diesel: priceMap.diesel ?? null,
        last_e5: priceMap.e5 ?? null,
        last_e10: null,
        last_status: station.open ? 'open' : 'closed',
        last_price_ts: new Date().toISOString(),
        country_code: 'AT',
        provider: 'E-Control Austria',
        distance: Number.isFinite(Number(station.distance)) ? Number(station.distance) : null,
        opening_hours: Array.isArray(station.openingHours) ? station.openingHours : []
    };
}

function mergeATStations(dieselList = [], superList = []) {
    const merged = new Map();

    for (const s of [...dieselList, ...superList]) {
        const key = String(s.id);

        if (!merged.has(key)) {
            merged.set(key, {
                ...s,
                prices: Array.isArray(s.prices) ? [...s.prices] : []
            });
            continue;
        }

        const existing = merged.get(key);

        existing.prices = [
            ...(existing.prices || []),
            ...(Array.isArray(s.prices) ? s.prices : [])
        ];

        if (typeof existing.open !== 'boolean' && typeof s.open === 'boolean') {
            existing.open = s.open;
        }

        existing.distance = existing.distance ?? s.distance;
        existing.location = existing.location || s.location;
        existing.name = existing.name || s.name;
        existing.openingHours = existing.openingHours || s.openingHours;
    }

    return [...merged.values()];
}

async function fetchATStationsByCoords(lat, lng, includeClosed = true) {
    const commonParams = {
        latitude: lat,
        longitude: lng,
        includeClosed
    };

    const [dieselResp, superResp] = await Promise.all([
        axios.get(`${ECONTROL_BASE_URL}/search/gas-stations/by-address`, {
            params: { ...commonParams, fuelType: 'DIE' },
            headers: { accept: 'application/json' },
            timeout: 10000
        }),
        axios.get(`${ECONTROL_BASE_URL}/search/gas-stations/by-address`, {
            params: { ...commonParams, fuelType: 'SUP' },
            headers: { accept: 'application/json' },
            timeout: 10000
        })
    ]);

    const dieselList = Array.isArray(dieselResp.data) ? dieselResp.data : [];
    const superList = Array.isArray(superResp.data) ? superResp.data : [];

    return mergeATStations(dieselList, superList);
}


exports.getDailyBriefing = async (req, res) => {
    const { business_partner_id: bpId, id: userId } = req.user;
    
    if (!bpId) {
        return res.status(404).json({ message: "Kein Partner zugeordnet." });
    }

    try {
        console.log(`\n--- [DEBUG getDailyBriefing] Starte Abfrage ---`);
        console.log(`User: ${userId} | BP: ${bpId}`);

        // 1. Standard-Briefing-Items abfragen (Strategie & Regulatorik)
        const briefingQuery = `
            WITH LatestBriefing AS (
                SELECT DATE(MAX(created_at)) as max_date
                FROM business_partner_intelligence_briefings
                WHERE business_partner_id = $1 
                AND status = 'published'
                AND created_at >= NOW() - INTERVAL '48 hours'
            )
            SELECT id, briefing_type, headline, analysis_summary, prognosis, talking_point, related_articles 
            FROM business_partner_intelligence_briefings 
            WHERE business_partner_id = $1 
            AND status = 'published'
            AND DATE(created_at) = (SELECT max_date FROM LatestBriefing)
            ORDER BY id ASC
        `;
        
        // 2. Markt-Barometer Status abrufen (Lock-Screen Bedingung)
        const sentimentQuery = `
            SELECT EXISTS(
                SELECT 1 FROM survey_responses sr 
                JOIN survey_questions sq ON sr.question_id = sq.id
                JOIN surveys s ON sq.survey_id = s.id
                WHERE sr.user_id = $1 AND s.title = 'Markt-Barometer' AND s.business_partner_id = $2 
                AND sr.created_at >= NOW() - INTERVAL '48 hours'
            ) as "hasVotedToday"
        `;

        // 3. NEU: Echte Sales Triggers aus den überwachten Artikeln extrahieren
        const salesTriggersQuery = `
            SELECT 
                bpta.id::text,
                bpta.article_title AS headline,
                COALESCE(bpta.summary, 'Keine Zusammenfassung verfügbar.') AS analysis_summary,
                bpa.name AS account_name
            FROM public.business_partner_tracked_articles bpta
            JOIN public.business_partner_accounts bpa ON bpta.account_id = bpa.id
            WHERE bpa.business_partner_id = $1 AND bpa.is_active = true
            ORDER BY bpta.published_at DESC NULLS LAST, bpta.created_at DESC
            LIMIT 5
        `;

        // 4. NEU: Alle überwachten Firmen- und Wettbewerbernamen für das Highlighting im Frontend sammeln
        const linkableNamesQuery = `
            SELECT name FROM public.business_partner_accounts WHERE business_partner_id = $1 AND is_active = true
            UNION
            SELECT bpc.name FROM public.business_partner_competitors bpc
            JOIN public.business_partner_accounts bpa ON bpc.account_id = bpa.id
            WHERE bpa.business_partner_id = $1
        `;

        // Alle Abfragen parallel ausführen für maximale Performance
        const [briefingRes, sentimentRes, salesTriggersRes, linkableNamesRes] = await Promise.all([
            db.query(briefingQuery, [bpId]),
            db.query(sentimentQuery, [userId, bpId]),
            db.query(salesTriggersQuery, [bpId]),
            db.query(linkableNamesQuery, [bpId])
        ]);

        // Gesprächsaufhänger dynamisch für das Vertriebsteam vorformulieren
        const salesTriggers = salesTriggersRes.rows.map(trigger => ({
            id: trigger.id,
            headline: trigger.headline,
            analysis_summary: trigger.analysis_summary,
            talking_point: `Hallo Team, ich habe gesehen, dass es bei Ihnen aktuelle Marktentwicklungen zum Thema "${trigger.headline}" gibt. Das betrifft auch unsere laufenden Projekte – lassen Sie uns dazu kurz telefonieren!`,
            account_name: trigger.account_name
        }));

        // Namen flachlegen für das Frontend-Array
        const linkableNames = linkableNamesRes.rows.map(row => row.name);

        console.log(`[getDailyBriefing] Daten erfolgreich geladen:`);
        console.log(`  -> Briefings: ${briefingRes.rows.length}`);
        console.log(`  -> Sales Leads: ${salesTriggers.length}`);
        console.log(`  -> Highlighting-Keywords: ${linkableNames.length}`);
        console.log(`-------------------------------------------------\n`);

        res.json({
            items: briefingRes.rows, 
            hasVotedToday: sentimentRes.rows[0]?.hasVotedToday || false,
            sales_triggers: salesTriggers, 
            linkable_names: linkableNames  
        });

    } catch (err) {
        console.error("--- SCHWERWIEGENDER FEHLER IN getDailyBriefing ---");
        console.error(err.message);
        res.status(500).json({ message: 'Fehler beim Laden des Briefings' });
    }
};

function normalizeATStation(station) {
  const priceMap = {};

  (station.prices || []).forEach((p) => {
    const key = mapFuelKeyAT(p.fuelType);
    if (key) priceMap[key] = p.amount;
  });

  const addr = station.location?.address || '';
  let street = addr;
  let houseNumber = null;

  const m = addr.match(/^(.+?)\s+(\d+[a-zA-Z]?)$/);
  if (m) {
    street = m[1];
    houseNumber = m[2];
  }

  return {
    id: `AT-${station.id}`,
    external_id: `AT-${station.id}`,
    raw_id: String(station.id),
    name: station.name || null,
    brand: (station.name || '').split(' ')[0] || null,
    street: street || null,
    house_no: houseNumber,
    post_code: station.location?.postalCode ? String(station.location.postalCode) : null,
    city: station.location?.city || null,
    lat: Number.isFinite(Number(station.location?.latitude)) ? Number(station.location.latitude) : null,
    lng: Number.isFinite(Number(station.location?.longitude)) ? Number(station.location.longitude) : null,
    last_diesel: priceMap.diesel ?? null,
    last_e5: priceMap.e5 ?? null,
    last_e10: null,
    last_status: station.open ? 'open' : 'closed',
    last_price_ts: new Date().toISOString(),
    country_code: 'AT',
    provider: 'E-Control Austria',
    distance: Number.isFinite(Number(station.distance)) ? Number(station.distance) : null,
    opening_hours: Array.isArray(station.openingHours) ? station.openingHours : []
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
        // Geocoding falls Suchbegriff statt Koordinaten
        if (searchTerm && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
            console.log(`[Backend] Geocoding required for query: "${searchTerm}" (${targetCountry})`);

            try {
                const geocodeResp = await axios.get('https://nominatim.openstreetmap.org/search', {
                    params: {
                        q: searchTerm,
                        countrycodes: targetCountry.toLowerCase(),
                        format: 'json',
                        limit: 1
                    },
                    headers: {
                        'User-Agent': 'MobilitiDashboard/1.0 (office@yourdomain.tld)'
                    },
                    timeout: 7000
                });

                if (Array.isArray(geocodeResp.data) && geocodeResp.data.length > 0) {
                    lat = parseFloat(geocodeResp.data[0].lat);
                    lng = parseFloat(geocodeResp.data[0].lon);
                    console.log(`[Backend] Geocoding successful: lat=${lat}, lng=${lng}`);
                } else {
                    return res.status(404).json({
                        ok: false,
                        message: `Der Ort "${searchTerm}" konnte nicht gefunden werden.`
                    });
                }
            } catch (geoError) {
                console.error('[Backend] Geocoding FAILED:', geoError.message);
                return res.status(502).json({
                    ok: false,
                    message: 'Die Adress-Suche ist fehlgeschlagen.'
                });
            }
        } else if (!searchTerm && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
            return res.status(400).json({
                ok: false,
                message: 'Gültige Koordinaten oder ein Suchbegriff sind erforderlich.'
            });
        }

        let stations = [];

        // DE: Tankerkönig
        if (targetCountry === 'DE') {
            console.log(`[Backend] Searching Tankerkönig with lat=${lat}, lng=${lng}, radius=${radius}`);

            const apiKey = process.env.TANKERKOENIG_API_KEY;
            if (!apiKey) {
                return res.status(500).json({
                    ok: false,
                    message: 'API-Key für Tankerkönig fehlt in der Server-Konfiguration.'
                });
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

            if (!tkResp.data?.ok || tkResp.data?.status !== 'ok') {
                console.error('[Backend] Tankerkönig API returned an error:', tkResp.data?.message);
                throw new Error(`Tankerkönig API Fehler: ${tkResp.data?.message || 'Unbekannter Fehler'}`);
            }

            stations = (tkResp.data.stations || []).map(normalizeDEStation);
        }

        // AT: E-Control
        else if (targetCountry === 'AT') {
            console.log(`[Backend] Searching E-Control with lat=${lat}, lng=${lng}`);

            const rawStations = await fetchATStationsByCoords(lat, lng, true);

            stations = rawStations
                .map(normalizeATStation)
                .filter(Boolean)
                .filter((s) => {
                    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) return false;
                    return getDistance(lat, lng, s.lat, s.lng) <= radius;
                })
                .sort((a, b) => {
                    const da = Number.isFinite(a.distance) ? a.distance : Number.MAX_VALUE;
                    const db = Number.isFinite(b.distance) ? b.distance : Number.MAX_VALUE;
                    return da - db;
                });
        }

        else {
            return res.status(400).json({
                ok: false,
                message: 'Ungültiger Ländercode.'
            });
        }

        console.log(`[Backend] Found ${stations.length} stations for ${targetCountry}.`);

        return res.status(200).json({
            ok: true,
            stations
        });

    } catch (err) {
        const errorMessage =
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            err.message ||
            'Unbekannter Fehler bei der Tankstellensuche.';

        console.error('[Backend] Fuel search final catch block error:', errorMessage);

        return res.status(500).json({
            ok: false,
            message: errorMessage
        });
    }
};

exports.getPricesByIds = async (req, res) => {
    const { country, ids } = req.body || {};
    const { id: userId } = req.user;

    try {
        if (!country || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                ok: false,
                message: 'Land und eine Liste von IDs sind erforderlich.'
            });
        }

        const cc = String(country).toUpperCase();
        let stationsToUpdate = [];

        // -----------------------------------
        // DE: direkter Preisabruf via Tankerkönig
        // -----------------------------------
        if (cc === 'DE') {
            const apiKey = TANKERKOENIG_API_KEY;
            if (!apiKey) throw new Error('Tankerkönig API-Key fehlt');

            const idList = ids.map(String).filter(isValidUUID);
            if (idList.length === 0) {
                return res.json({
                    ok: true,
                    message: 'Keine gültigen DE-IDs übergeben.'
                });
            }

            const priceResp = await axios.get(
                'https://creativecommons.tankerkoenig.de/json/prices.php',
                {
                    params: {
                        ids: idList.join(','),
                        apikey: apiKey
                    },
                    timeout: 10000
                }
            );

            if (!priceResp.data?.ok) {
                throw new Error(`Tankerkönig Preis-API Fehler: ${priceResp.data?.message || 'Unbekannter Fehler'}`);
            }

            for (const id in priceResp.data.prices) {
                const priceInfo = priceResp.data.prices[id];
                stationsToUpdate.push({
                    id,
                    diesel: priceInfo.diesel ?? null,
                    e5: priceInfo.e5 ?? null,
                    e10: priceInfo.e10 ?? null,
                    status: priceInfo.status ?? null
                });
            }
        }

        // -----------------------------------
        // AT: Refresh über gespeicherte Favoriten-Koordinaten
        // -----------------------------------
        else if (cc === 'AT') {
            if (!userId) {
                return res.status(401).json({
                    ok: false,
                    message: 'Authentifizierung erforderlich.'
                });
            }

            const externalIds = ids.map(String).filter(Boolean);

            if (externalIds.length === 0) {
                return res.json({
                    ok: true,
                    message: 'Keine gültigen AT-IDs übergeben.'
                });
            }

            const favRes = await db.query(
                `
                SELECT external_id, lat, lng, country_code
                FROM public.user_favorites
                WHERE user_id = $1
                  AND favorite_type = 'FuelPrices'
                  AND country_code = 'AT'
                  AND external_id = ANY($2::text[])
                `,
                [userId, externalIds]
            );

            const favorites = favRes.rows || [];

            if (favorites.length === 0) {
                return res.json({
                    ok: true,
                    message: 'Keine passenden AT-Favoriten mit Koordinaten gefunden.'
                });
            }

            for (const fav of favorites) {
                const favLat = Number(fav.lat);
                const favLng = Number(fav.lng);

                if (!Number.isFinite(favLat) || !Number.isFinite(favLng)) {
                    continue;
                }

                try {
                    const nearbyStations = await fetchATStationsByCoords(favLat, favLng, true);
                    const normalized = nearbyStations.map(normalizeATStation).filter(Boolean);

                    // Primärmatch über external_id
                    let matched = normalized.find((s) => s.external_id === fav.external_id);

                    // Fallback über minimale Distanz
                    if (!matched) {
                        const sortedByDistance = normalized
                            .map((s) => ({
                                station: s,
                                distKm:
                                    Number.isFinite(s.lat) && Number.isFinite(s.lng)
                                        ? getDistance(favLat, favLng, s.lat, s.lng)
                                        : Number.MAX_VALUE
                            }))
                            .sort((a, b) => a.distKm - b.distKm);

                        if (sortedByDistance.length > 0 && sortedByDistance[0].distKm <= 0.25) {
                            matched = sortedByDistance[0].station;
                        }
                    }

                    if (matched) {
                        stationsToUpdate.push({
                            id: fav.external_id,
                            diesel: matched.last_diesel ?? null,
                            e5: matched.last_e5 ?? null,
                            e10: null,
                            status: matched.last_status ?? null
                        });
                    }
                } catch (singleErr) {
                    console.warn(`[AT Refresh] Favorit ${fav.external_id} konnte nicht aktualisiert werden:`, singleErr.message);
                }
            }
        }

        else {
            return res.status(400).json({
                ok: false,
                message: 'Ungültiger Ländercode.'
            });
        }

        if (userId && stationsToUpdate.length > 0) {
            await upsertFavoritesPriceCache(userId, stationsToUpdate);
        }

        return res.json({
            ok: true,
            message:
                stationsToUpdate.length > 0
                    ? `${stationsToUpdate.length} Preise aktualisiert.`
                    : 'Keine Preise konnten aktualisiert werden.'
        });

    } catch (err) {
        console.error('--- getPricesByIds FAILED ---');
        if (axios.isAxiosError(err)) {
            console.error('API Request URL:', err.config?.url);
            console.error('API Response Status:', err.response?.status);
            console.error('API Response Data:', err.response?.data);
        } else {
            console.error('Generic Error:', err.message);
        }

        return res.status(500).json({
            ok: false,
            message: 'Interner Serverfehler beim Abrufen der Preisdetails.'
        });
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

        // --- KORREKTUR HIER: s.logo_url HINZUGEFÜGT ---
        const dataQuery = `
            SELECT
                sc.id, sc.title, sc.event_date AS date, sc.summary,
                sc.original_url AS url, sc.region, sc.full_text,
                s.logo_url,
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

/*
exports.getFleetAssociationNews = async (req, res) => {
    try {
        const { id: userId } = req.user;
        // OPTIMIERUNG: LEFT(summary, 300) und LIMIT sicherstellen
        const query = `
            SELECT 
                id, title, LEFT(summary, 300) as summary, original_url, published_date, event_date, category, scraped_at,
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
                description: row.summary, // Summary ist jetzt gekürzt
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

*/

exports.getCommodityPrices = async (req, res) => {
    try {
        const indicators = ['BRENT_OIL', 'EUR_USD', 'EURIBOR_3M', 'SWAP_10Y', 'CO2_PRICE', 'KVLPI_GESAMT' ];
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
        return res.status(400).json({ message: 'A valid category ("news" or "events") is required.' });
    }

    const sourceIdentifier = `${businessPartnerId}_${category}`;

    try {
        let query;
        let queryParams;

        if (category === 'events') {
            query = `
                SELECT
                    sc.id,
                    sc.title,
                    LEFT(sc.summary, 300) as summary,
                    sc.original_url,
                    sc.published_date,
                    sc.event_date,
                    sc.category,
                    sc.scraped_at,
                    sc.region,
                    sc.relevance_score,
                    COALESCE(crv.vote, 0) as user_vote
                FROM scraped_content sc
                LEFT JOIN content_relevance_votes crv
                    ON crv.content_id = sc.id AND crv.user_id = $2
                WHERE
                    sc.source_identifier = $1
                    AND sc.category = 'businesspartner_events'
                    AND sc.event_date IS NOT NULL
                    AND sc.event_date >= CURRENT_DATE
                ORDER BY sc.event_date ASC, sc.scraped_at DESC
            `;
            queryParams = [sourceIdentifier, userId];
        } else {
            query = `
                SELECT
                    sc.id,
                    sc.title,
                    LEFT(sc.summary, 300) as summary,
                    sc.original_url,
                    sc.published_date,
                    sc.event_date,
                    sc.category,
                    sc.scraped_at,
                    sc.region,
                    sc.relevance_score,
                    COALESCE(crv.vote, 0) as user_vote
                FROM scraped_content sc
                LEFT JOIN content_relevance_votes crv
                    ON crv.content_id = sc.id AND crv.user_id = $2
                WHERE sc.source_identifier = $1
                ORDER BY sc.published_date DESC, sc.scraped_at DESC
                LIMIT 5
            `;
            queryParams = [sourceIdentifier, userId];
        }

        const result = await db.query(query, queryParams);
        let items = result.rows;

        if (category === 'events' && items.length > 0) {
            const eventIds = items.map(e => e.id);

            const votesQuery = `
                SELECT 
                    v.content_id,
                    v.vote,
                    u.id,
                    u.first_name,
                    u.last_name,
                    u.profile_image_url,
                    u.last_login_at
                FROM content_relevance_votes v
                JOIN users u ON v.user_id = u.id
                WHERE v.content_id = ANY($1::uuid[])
            `;

            const votesResult = await db.query(votesQuery, [eventIds]);

            items = items.map(item => {
                const itemVotes = votesResult.rows.filter(v => v.content_id === item.id);

                const participants = itemVotes
                    .filter(v => v.vote === 1)
                    .map(v => ({
                        id: v.id,
                        first_name: v.first_name,
                        last_name: v.last_name,
                        profile_image_url: v.profile_image_url,
                        last_login_at: v.last_login_at
                    }));

                const maybeParticipants = itemVotes
                    .filter(v => v.vote === 0)
                    .map(v => ({
                        id: v.id,
                        first_name: v.first_name,
                        last_name: v.last_name,
                        profile_image_url: v.profile_image_url,
                        last_login_at: v.last_login_at
                    }));

                return {
                    ...item,
                    participants,
                    maybeParticipants
                };
            });
        }

        res.json({
            source: `Scraped Content for BP ${businessPartnerId} (Source: ${sourceIdentifier})`,
            timestamp: new Date().toISOString(),
            data: items,
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
        // OPTIMIERUNG: Logik geändert von "IN ($2, $3)" zu ">= $3"
        // Dadurch werden Vorjahr, aktuelles Jahr UND alle zukünftigen Jahre geladen.
        const query = `
            SELECT 
                vp.country_name, vp.year, vp.price, vp.currency_code, 
                vp.vignette_requirement_car, vp.toll_system_truck, vp.provider_url,
                s.status = 'approved' AS is_trusted_source
            FROM vignette_prices vp
            LEFT JOIN sources s ON vp.provider_url LIKE s.url || '%'
            WHERE vp.country_code = $1 AND vp.year >= $2
            ORDER BY vp.year ASC
        `;

        // Wir übergeben nur noch previousYear ($2)
        const result = await db.query(query, [country, previousYear]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Keine Daten für dieses Land gefunden.' });
        }

        const rows = result.rows;
        // Metadaten vom aktuellsten Eintrag nehmen (oder vom ersten)
        const infoRow = rows[0];

        const responseData = {
            country_name: infoRow.country_name,
            vignette_system_car: infoRow.vignette_requirement_car,
            toll_system_truck: infoRow.toll_system_truck,
            provider_url: infoRow.provider_url,
            is_trusted_source: !!infoRow.is_trusted_source,
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



const ACCOUNT_INTELLIGENCE_STATUSES = new Set(['new', 'read', 'done', 'ignored']);

const safeDateDiffDays = (dateValue) => {
    if (!dateValue) return 999;
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 999;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)));
};

const getDomainFromUrl = (url) => {
    if (!url) return null;
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch (_) {
        return String(url).replace(/^https?:\/\//i, '').split('/')[0] || null;
    }
};

const classifyAccountIntelligenceArticle = (article, type) => {
    const text = `${article.article_title || ''} ${article.summary || ''}`.toLowerCase();
    const isCompetitor = type === 'competitor';
    const ageDays = safeDateDiffDays(article.published_at);

    let signalType = isCompetitor ? 'Wettbewerbsbewegung' : 'Account-Signal';
    let recommendedAction = isCompetitor
        ? 'Prüfen, ob daraus ein Gesprächsanlass oder ein Gegenangebot für den Account entsteht.'
        : 'Kurz bewerten und als Gesprächsanlass für den Account nutzen.';
    let relevanceScore = isCompetitor ? 74 : 70;

    const hasAny = (patterns) => patterns.some((pattern) => text.includes(pattern));

    if (hasAny(['fuhrpark', 'flotte', 'fleet', 'mobilität', 'mobility', 'leasing', 'nutzfahrzeug', 'fahrzeug', 'e-mobilität', 'elektromobilität'])) {
        signalType = 'Fuhrpark-/Mobilitätssignal';
        recommendedAction = 'Mit Mobilitäts-, Fuhrpark- oder Ladeinfrastruktur-Angebot anknüpfen.';
        relevanceScore = 90;
    } else if (hasAny(['ladeinfrastruktur', 'charging', 'ladestation', 'wallbox', 'ev ', 'e-truck', 'elektrisch'])) {
        signalType = 'Lade-/E-Mobilitätschance';
        recommendedAction = 'Bedarf für Ladeinfrastruktur, Betriebskosten oder Elektrifizierung prüfen.';
        relevanceScore = 88;
    } else if (hasAny(['investition', 'investiert', 'finanzierung', 'förderung', 'subvention', 'budget', 'million', 'mio', 'expansion', 'ausbau', 'erweitert'])) {
        signalType = 'Wachstums-/Investitionssignal';
        recommendedAction = 'Kontakt aufnehmen und prüfen, ob neue Projekte oder Beschaffungen entstehen.';
        relevanceScore = 84;
    } else if (hasAny(['kooperation', 'partnerschaft', 'partner', 'joint venture', 'zusammenarbeit'])) {
        signalType = 'Partnerschaftssignal';
        recommendedAction = 'Beziehung und mögliche Kooperations-/Vertriebsansätze prüfen.';
        relevanceScore = 78;
    } else if (hasAny(['gesetz', 'verordnung', 'regulierung', 'richtlinie', 'steuer', 'co2', 'maut', 'vignette', 'compliance'])) {
        signalType = 'Regulatorik-/Compliance-Signal';
        recommendedAction = 'Auswirkungen auf den Account prüfen und Beratung/Briefing anbieten.';
        relevanceScore = 76;
    } else if (hasAny(['wechsel', 'vorstand', 'geschäftsführer', 'ceo', 'cfo', 'leitung', 'management'])) {
        signalType = 'Management-/Organisationssignal';
        recommendedAction = 'Ansprechpartner und Timing für erneute Kontaktaufnahme prüfen.';
        relevanceScore = 72;
    }

    if (isCompetitor) {
        relevanceScore += 4;
        if (!recommendedAction.toLowerCase().includes('wettbewerb')) {
            recommendedAction = `Wettbewerb beobachten: ${recommendedAction}`;
        }
    }

    if (ageDays <= 3) relevanceScore += 6;
    else if (ageDays <= 7) relevanceScore += 4;
    else if (ageDays <= 30) relevanceScore += 2;

    relevanceScore = Math.max(1, Math.min(99, relevanceScore));

    return {
        ...article,
        type,
        signal_type: signalType,
        recommended_action: recommendedAction,
        relevance_score: relevanceScore,
        source_domain: getDomainFromUrl(article.article_url),
        days_old: ageDays,
        status: article.status || 'new',
        is_new: !article.status || article.status === 'new'
    };
};

exports.getAccountIntelligence = async (req, res) => {
    const { id: userId, business_partner_id: businessPartnerId } = req.user;

    if (!businessPartnerId || !userId) {
        return res.json([]);
    }

    try {
        const query = `
            SELECT
                acc.id,
                acc.name,
                acc.status as account_status,
                acc.website_url,
                acc.linkedin_url,
                (
                    SELECT COALESCE(json_agg(news.* ORDER BY news.published_at DESC NULLS LAST), '[]'::json)
                    FROM (
                        SELECT
                            bpta.id::text,
                            bpta.account_id::text,
                            bpta.article_title,
                            bpta.article_url,
                            bpta.source_name,
                            bpta.published_at,
                            bpta.summary,
                            bpta.created_at,
                            COALESCE(ais.status, 'new') AS status,
                            ais.updated_at AS status_updated_at
                        FROM business_partner_tracked_articles bpta
                        LEFT JOIN account_intelligence_item_status ais
                          ON ais.tracked_article_id = bpta.id
                         AND ais.user_id = $2
                        WHERE bpta.account_id = acc.id
                          AND bpta.competitor_name IS NULL
                          AND COALESCE(ais.status, 'new') <> 'ignored'
                        ORDER BY bpta.published_at DESC NULLS LAST, bpta.created_at DESC
                        LIMIT 5
                    ) as news
                ) as account_news,
                (
                    SELECT COALESCE(json_agg(comp_news.* ORDER BY comp_news.published_at DESC NULLS LAST), '[]'::json)
                    FROM (
                        SELECT
                            bpta.id::text,
                            bpta.account_id::text,
                            bpta.competitor_name,
                            bpta.article_title,
                            bpta.article_url,
                            bpta.source_name,
                            bpta.published_at,
                            bpta.summary,
                            bpta.created_at,
                            COALESCE(ais.status, 'new') AS status,
                            ais.updated_at AS status_updated_at
                        FROM business_partner_tracked_articles bpta
                        LEFT JOIN account_intelligence_item_status ais
                          ON ais.tracked_article_id = bpta.id
                         AND ais.user_id = $2
                        WHERE bpta.account_id = acc.id
                          AND bpta.competitor_name IS NOT NULL
                          AND COALESCE(ais.status, 'new') <> 'ignored'
                        ORDER BY bpta.published_at DESC NULLS LAST, bpta.created_at DESC
                        LIMIT 8
                    ) as comp_news
                ) as competitor_news
            FROM business_partner_accounts acc
            WHERE acc.business_partner_id = $1
              AND COALESCE(acc.is_active, TRUE) = TRUE
            ORDER BY acc.name ASC;
        `;

        const { rows } = await db.query(query, [businessPartnerId, userId]);

        const enrichedRows = rows.map((account) => ({
            ...account,
            account_news: Array.isArray(account.account_news)
                ? account.account_news.map((article) => classifyAccountIntelligenceArticle(article, 'account'))
                : [],
            competitor_news: Array.isArray(account.competitor_news)
                ? account.competitor_news.map((article) => classifyAccountIntelligenceArticle(article, 'competitor'))
                : []
        }));

        res.json(enrichedRows);
    } catch (err) {
        console.error('Error fetching account intelligence data:', err.message);
        res.status(500).json({ message: 'Fehler beim Laden der Account Intelligence Daten.' });
    }
};

exports.updateAccountIntelligenceStatus = async (req, res) => {
    const { id: userId, business_partner_id: businessPartnerId } = req.user;
    const { articleId } = req.params;
    const { status } = req.body || {};

    if (!userId || !businessPartnerId) {
        return res.status(401).json({ message: 'Authentifizierung erforderlich.' });
    }

    if (!isValidUUID(articleId)) {
        return res.status(400).json({ message: 'Ungültige Artikel-ID.' });
    }

    if (!ACCOUNT_INTELLIGENCE_STATUSES.has(status)) {
        return res.status(400).json({ message: 'Ungültiger Status.' });
    }

    try {
        const ownershipCheck = await db.query(`
            SELECT bpta.id
            FROM business_partner_tracked_articles bpta
            JOIN business_partner_accounts bpa ON bpa.id = bpta.account_id
            WHERE bpta.id = $1
              AND bpa.business_partner_id = $2
            LIMIT 1
        `, [articleId, businessPartnerId]);

        if (ownershipCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Artikel nicht gefunden oder nicht für diesen Mandanten freigegeben.' });
        }

        if (status === 'new') {
            await db.query(`
                DELETE FROM account_intelligence_item_status
                WHERE user_id = $1 AND tracked_article_id = $2
            `, [userId, articleId]);

            return res.json({ article_id: articleId, status: 'new' });
        }

        const result = await db.query(`
            INSERT INTO account_intelligence_item_status (user_id, tracked_article_id, status, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (user_id, tracked_article_id)
            DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
            RETURNING tracked_article_id::text AS article_id, status, updated_at
        `, [userId, articleId, status]);

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating account intelligence status:', err.message);
        res.status(500).json({ message: 'Status konnte nicht gespeichert werden.' });
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
    const { type } = req.query;

    try {
        // Wir holen name_lang dazu, damit das Dropdown "Fuhrpark" statt "fleet" anzeigt!
        let query = 'SELECT id, name, name_lang FROM categories WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (type) {
            query += ` AND category_type = $${paramIndex++}`;
            params.push(type);
        }

        // Alphabetisch nach dem deutschen Namen sortieren
        query += ' ORDER BY COALESCE(name_lang, name) ASC';

        const result = await db.query(query, params);
        
        // Array erzwingen
        res.json(result.rows || []);
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
    // token_issued_at nutzen für stabile "Neu"-Zahlen während der Session
    const { id: userId, token_issued_at, last_login_at, business_partner_id: businessPartnerId } = req.user;
    const stableLastLogin = token_issued_at || last_login_at || new Date(0);

    const {
        page = 1,
        limit = 10,
        sortBy = 'date',
        category,
        region,
        search,
        tag,
        mainFilter,
        filter
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const offset = (pageNum - 1) * limitNum;

    try {
        // User Score-Filter
        const userSettingsResult = await db.query(
            'SELECT article_score_min, article_score_max FROM users WHERE id = $1',
            [userId]
        );
        const { article_score_min, article_score_max } = userSettingsResult.rows[0] || {};

        // Saved Tags
        const userTagsResult = await db.query(
            'SELECT tag_name FROM user_saved_tags WHERE user_id = $1',
            [userId]
        );
        const userSavedTags = userTagsResult.rows.map(row => row.tag_name);

        const baseParams = [];
        const baseWhere = [];
        let p = 1;

        if (userSavedTags.length > 0) {
            baseWhere.push(`
                EXISTS (
                    SELECT 1
                    FROM scraped_content_tags sct
                    JOIN tags t ON sct.tag_id = t.id
                    WHERE sct.scraped_content_id = sc.id
                      AND t.name = ANY($${p}::text[])
                )
            `);
            baseParams.push(userSavedTags);
            p++;
        }

        if (category) {
            if (category.startsWith('businesspartner_')) {
                if (!businessPartnerId) {
                    return res.json({ data: [], totalPages: 0, counts: { unread: 0, new: 0 } });
                }
                baseWhere.push(`sc.source_identifier = $${p++}`);
                baseParams.push(`${businessPartnerId}_${category.split('_')[1]}`);
            } else {
                baseWhere.push(`sc.category = $${p++}`);
                baseParams.push(category);
            }
        }

        if (category === 'fleet_podcasts') {
            baseWhere.push(`sc.original_url ~* '\\.(mp3|m4a|aac|ogg|wav)(\\?|$)'`);
        }

        if (region && region !== 'all') {
            baseWhere.push(`sc.region = $${p++}`);
            baseParams.push(region);
        }

        if (search) {
            baseWhere.push(`(sc.title ILIKE $${p} OR sc.summary ILIKE $${p})`);
            baseParams.push(`%${search}%`);
            p++;
        }

        if (mainFilter) {
            baseWhere.push(`EXISTS (SELECT 1 FROM scraped_content_tags sct JOIN tags t ON sct.tag_id = t.id WHERE sct.scraped_content_id = sc.id AND t.name = $${p})`);
            baseParams.push(mainFilter);
            p++;
        }

        if (tag && tag !== 'all') {
            baseWhere.push(`EXISTS (SELECT 1 FROM scraped_content_tags sct JOIN tags t ON sct.tag_id = t.id WHERE sct.scraped_content_id = sc.id AND t.name = $${p})`);
            baseParams.push(tag);
            p++;
        }

        if (article_score_min != null) { baseWhere.push(`sc.relevance_score >= $${p++}`); baseParams.push(article_score_min); }
        if (article_score_max != null) { baseWhere.push(`sc.relevance_score <= $${p++}`); baseParams.push(article_score_max); }

        const baseWhereString = baseWhere.length > 0 ? `WHERE ${baseWhere.join(' AND ')}` : '';

        // Counts holen
        const totalQuery = `SELECT COUNT(sc.id) as total_items FROM scraped_content sc ${baseWhereString}`;
        const totalResult = await db.query(totalQuery, baseParams);
        const totalItems = parseInt(totalResult.rows[0]?.total_items || '0', 10);
        const totalPages = Math.ceil(totalItems / limitNum);

        const unreadParams = [...baseParams, userId];
        const unreadQuery = `SELECT COUNT(*) as cnt FROM (SELECT sc.id FROM scraped_content sc ${baseWhereString ? baseWhereString + ' AND ' : 'WHERE '} sc.created_at > NOW() - INTERVAL '30 days' AND NOT EXISTS (SELECT 1 FROM user_read_scraped_content ursc WHERE ursc.scraped_content_id = sc.id AND ursc.user_id = $${p}) LIMIT 11) sub`;
        
        const newParams = [...baseParams, stableLastLogin];
        const newQuery = `SELECT COUNT(*) as cnt FROM (SELECT sc.id FROM scraped_content sc ${baseWhereString ? baseWhereString + ' AND ' : 'WHERE '} sc.created_at > $${p} LIMIT 11) sub`;

        const [unreadRes, newRes] = await Promise.all([db.query(unreadQuery, unreadParams), db.query(newQuery, newParams)]);

        // Daten Query
        const dataParams = [...baseParams];
        const dataWhere = [...baseWhere];
        let pd = p;

        if (filter === 'unread') {
            dataWhere.push(`NOT EXISTS (SELECT 1 FROM user_read_scraped_content ursc WHERE ursc.scraped_content_id = sc.id AND ursc.user_id = $${pd})`);
            dataParams.push(userId);
            pd++;
        } else if (filter === 'new') {
            dataWhere.push(`sc.created_at > $${pd}`);
            dataParams.push(stableLastLogin);
            pd++;
        }

        const dataWhereString = dataWhere.length > 0 ? `WHERE ${dataWhere.join(' AND ')}` : '';
        let orderByClause = 'ORDER BY sc.published_date DESC NULLS LAST, sc.event_date DESC NULLS LAST, sc.scraped_at DESC';
        if (sortBy === 'relevance') orderByClause = 'ORDER BY sc.relevance_score DESC, sc.published_date DESC NULLS LAST, sc.scraped_at DESC';

const dataQuery = `
            SELECT
                sc.id,
                sc.title,
                LEFT(sc.summary, 400) as summary,
                sc.original_url,
                sc.published_date,
                sc.event_date,
                sc.category,
                sc.scraped_at,
                sc.relevance_score,
                sc.region,
                sc.thumbnail_url,
                s.logo_url, 
                s.status = 'approved' AS is_trusted_source,
                EXISTS (
                    SELECT 1
                    FROM user_read_scraped_content ursc
                    WHERE ursc.scraped_content_id = sc.id
                      AND ursc.user_id = $${pd}
                ) as is_read,
                COALESCE(crv.vote, 0) as user_vote,
                (
                    SELECT COALESCE(array_agg(t.name), ARRAY[]::text[])
                    FROM scraped_content_tags sct
                    JOIN tags t ON sct.tag_id = t.id
                    WHERE sct.scraped_content_id = sc.id
                ) as tags,
                (
                    SELECT COALESCE(json_agg(json_build_object('name', t.name, 'logo_url', t.logo_url)), '[]'::json)
                    FROM scraped_content_tags sct
                    JOIN tags t ON sct.tag_id = t.id
                    WHERE sct.scraped_content_id = sc.id
                ) as tag_details
            FROM scraped_content sc
            LEFT JOIN sources s ON sc.original_url LIKE s.url || '%'
            LEFT JOIN content_relevance_votes crv ON crv.content_id = sc.id AND crv.user_id = $${pd}
            ${dataWhereString}
            ${orderByClause}
            LIMIT $${pd + 1} OFFSET $${pd + 2}
        `;

        const result = await db.query(dataQuery, [...dataParams, userId, limitNum, offset]);

        res.json({
            data: result.rows,
            totalPages,
            counts: { unread: parseInt(unreadRes.rows[0]?.cnt || '0', 10), new: parseInt(newRes.rows[0]?.cnt || '0', 10) }
        });
    } catch (err) {
        console.error(`Error fetching scraped content:`, err.message);
        res.status(500).json({ message: 'Error fetching scraped content', data: [] });
    }
};





exports.getScrapedContentCounts = async (req, res) => {
    // NEU: Wir nutzen 'token_issued_at' (Login-Zeitpunkt) für stabile "Neu"-Zahlen während der Session
    const { id: userId, token_issued_at, last_login_at } = req.user;
    
    // Fallback: Wenn token_issued_at nicht da ist (alter Token), nimm last_login_at
    const stableLastLogin = token_issued_at || last_login_at || new Date(0);

    const {
        limit = 10, category, region, search,
        tag, mainFilter
        // 'filter' ignorieren wir hier, damit die Zähler immer den Gesamtstatus zeigen
    } = req.query;

    try {
        const userSettingsResult = await db.query('SELECT article_score_min, article_score_max FROM users WHERE id = $1', [userId]);
        const { article_score_min, article_score_max } = userSettingsResult.rows[0] || {};
        const userTagsResult = await db.query('SELECT tag_name FROM user_saved_tags WHERE user_id = $1', [userId]);
        const userSavedTags = userTagsResult.rows.map(row => row.tag_name);

        const queryParams = [];
        let whereClauses = [];
        let paramIndex = 1;

        // --- Filterlogik (Muss identisch zu getScrapedContent sein) ---
        if (userSavedTags.length > 0) {
            whereClauses.push(`EXISTS (SELECT 1 FROM scraped_content_tags sct JOIN tags t ON sct.tag_id = t.id WHERE sct.scraped_content_id = sc.id AND t.name = ANY($${paramIndex}::text[]))`);
            queryParams.push(userSavedTags);
            paramIndex++;
        }
        if (category) {
            // Business Partner News/Events Special Handling
            if (category.startsWith('businesspartner_')) {
                if (!req.user.business_partner_id) return res.json({ totalPages: 0, counts: { unread: 0, new: 0 } });
                whereClauses.push(`sc.source_identifier = $${paramIndex++}`);
                queryParams.push(`${req.user.business_partner_id}_${category.split('_')[1]}`); // z.B. ID_news
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

        // 1. Pagination Total
        const countQuery = `SELECT COUNT(sc.id) as total_items ${baseJoin} ${whereString}`;
        const totalResult = await db.query(countQuery, queryParams);
        const totalItems = parseInt(totalResult.rows[0].total_items, 10);
        const totalPages = Math.ceil(totalItems / (parseInt(limit, 10) || 10));

        // 2. OPTIMIERTE ZÄHLER (Limit 11 + 30 Tage)
        // WICHTIG: Wir nutzen den SELBEN paramIndex für beide Queries, 
        // aber übergeben unterschiedliche Parameter-Arrays.

        // UNREAD: "Jünger als 30 Tage UND nicht gelesen"
        const unreadQuery = `
            SELECT COUNT(*) as cnt FROM (
                SELECT sc.id 
                ${baseJoin}
                ${whereString ? whereString + ' AND ' : 'WHERE '}
                sc.created_at > NOW() - INTERVAL '30 days' 
                AND NOT EXISTS (SELECT 1 FROM user_read_scraped_content ursc WHERE ursc.scraped_content_id = sc.id AND ursc.user_id = $${paramIndex})
                LIMIT 11
            ) sub
        `;

        // NEW: "Neuer als Login-Zeitpunkt"
        const newQuery = `
            SELECT COUNT(*) as cnt FROM (
                SELECT sc.id 
                ${baseJoin}
                ${whereString ? whereString + ' AND ' : 'WHERE '}
                sc.created_at > $${paramIndex}
                LIMIT 11
            ) sub
        `;

        // KORREKTUR: Separate Parameter-Arrays erstellen!
        const unreadParams = [...queryParams, userId];          // $paramIndex = userId
        const newParams = [...queryParams, stableLastLogin];    // $paramIndex = lastLogin

        const [unreadRes, newRes] = await Promise.all([
            db.query(unreadQuery, unreadParams),
            db.query(newQuery, newParams)
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
    const { business_partner_id } = req.user || {};

    if (!business_partner_id || !isValidUUID(business_partner_id)) {
        return res.json({ data: [], totalPages: 0, counts: { new: 0 } });
    }

    const safePage = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 24);
    const offset = (safePage - 1) * safeLimit;

    try {
        // Abgelaufene Aktionen serverseitig bereinigen, damit sie nicht mehr aktiv angezeigt werden.
        await db.query(`
            UPDATE business_partner_actions
            SET is_active = false,
                updated_at = NOW()
            WHERE business_partner_id = $1
              AND is_active = true
              AND end_date IS NOT NULL
              AND end_date < NOW()
        `, [business_partner_id]);

        const baseQuery = `
            FROM business_partner_actions
            WHERE
                business_partner_id = $1
                AND is_active = TRUE
                AND (start_date IS NULL OR start_date <= NOW())
                AND (end_date IS NULL OR end_date >= NOW())
        `;
        const queryParams = [business_partner_id];

        const totalQuery = `SELECT COUNT(*) ${baseQuery}`;
        const totalResult = await db.query(totalQuery, queryParams);
        const totalItems = parseInt(totalResult.rows[0].count, 10) || 0;
        const totalPages = Math.ceil(totalItems / safeLimit);

        const dataQuery = `
            SELECT
                a.id,
                a.business_partner_id,
                a.layout_type,
                a.title,
                a.content_text,
                a.link_url,
                a.image_url,
                a.created_at,
                a.updated_at,
                a.start_date,
                a.end_date,
                a.target_widget_category,
                a.target_region,
                a.is_click_tracking_enabled,
                a.promotion_label,
                a.promotion_type,
                a.cta_label,
                a.secondary_image_url,
                a.secondary_link_url,
                a.secondary_cta_label,
                a.priority,
                COALESCE(a.info, '{}'::jsonb) AS info,
                a.directory_provider_id,
                dp.name AS directory_provider_name,
                dp.logo_url AS directory_provider_logo_url,
                a.software_tool_id,
                st.name AS software_tool_name,
                st.product_url AS software_tool_url,
                st.logo_url AS software_tool_logo_url
            FROM business_partner_actions a
            LEFT JOIN directory_providers dp ON dp.id = a.directory_provider_id
            LEFT JOIN software_tools st
              ON st.id = a.software_tool_id
             AND st.business_partner_id = a.business_partner_id
            WHERE
                a.business_partner_id = $1
                AND a.is_active = TRUE
                AND (a.start_date IS NULL OR a.start_date <= NOW())
                AND (a.end_date IS NULL OR a.end_date >= NOW())
            ORDER BY a.priority DESC, a.start_date DESC NULLS LAST, a.created_at DESC
            LIMIT $2 OFFSET $3
        `;
        const dataResult = await db.query(dataQuery, [...queryParams, safeLimit, offset]);

        const newQuery = `
            SELECT COUNT(*) 
            FROM business_partner_actions
            WHERE business_partner_id = $1
              AND is_active = TRUE
              AND created_at >= NOW() - INTERVAL '3 days'
        `;
        const newResult = await db.query(newQuery, [business_partner_id]);
        const counts = { new: parseInt(newResult.rows[0].count, 10) || 0 };

        return res.json({
            data: dataResult.rows,
            totalPages,
            counts,
            currentPage: safePage,
            limit: safeLimit,
        });

    } catch (err) {
        console.error('--- DATABASE ERROR in getActiveActionsForWidget ---');
        console.error('Timestamp:', new Date().toISOString());
        console.error('Error Message:', err.message);
        console.error('Error Code:', err.code);
        console.error('Error Detail:', err.detail);
        console.error('Full Error Object:', err);
        console.error('----------------------------------------------------');
        return res.status(500).json({ message: 'Serverfehler beim Abrufen der Aktionen.' });
    }
};


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

const normalizeCalendarCategory = (value) => {
    const v = String(value || '').trim();
    if (!v) return null;
    return v;
};

exports.getEnhancedCalendarEvents = async (req, res) => {
    const userId = req.user ? req.user.id : null;
    const businessPartnerId = req.user ? req.user.business_partner_id : null; 
    const { page = 1, limit = 50, category, region } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    try {
        const queryParams = [];
        let whereClauses = [];
        let paramIndex = 1;

        // 1. Nur heutige und zukünftige Events
        whereClauses.push(`sc.event_date >= CURRENT_DATE`);
        whereClauses.push(`sc.event_date IS NOT NULL`);

        // 2. Kategorie und Business-Partner Logik
        let categoryWhere = "";
        
        if (category) {
            const categoryArray = String(category)
                .split(',')
                .map(c => normalizeCalendarCategory(c))
                .filter(Boolean);

            const uniqueCategories = [...new Set(categoryArray)];
            const wantsBusinessPartnerEvents = uniqueCategories.includes('businesspartner_events');
            const globalCategories = uniqueCategories.filter(c => c !== 'businesspartner_events');
            const categoryParts = [];

            if (globalCategories.length === 1) {
                categoryParts.push(`sc.category = $${paramIndex}`);
                queryParams.push(globalCategories[0]);
                paramIndex++;
            } else if (globalCategories.length > 1) {
                categoryParts.push(`sc.category = ANY($${paramIndex}::text[])`);
                queryParams.push(globalCategories);
                paramIndex++;
            }

            if (wantsBusinessPartnerEvents && businessPartnerId) {
                const bpSourceIdentifier = `${businessPartnerId}_events`;
                categoryParts.push(`(sc.source_identifier = $${paramIndex} AND sc.category = 'businesspartner_events')`);
                queryParams.push(bpSourceIdentifier);
                paramIndex++;
            }

            categoryWhere = categoryParts.length > 0 ? categoryParts.join(' OR ') : 'FALSE';
            whereClauses.push(`(${categoryWhere})`);
            
        } else {
            whereClauses.push(`(sc.category LIKE '%_events' OR sc.category = 'events')`);
        }

        if (region && String(region).toLowerCase() !== 'all') {
            whereClauses.push(`(
                sc.region ILIKE $${paramIndex} 
                OR sc.region IN (SELECT name FROM regions WHERE code ILIKE $${paramIndex})
                OR sc.region IS NULL 
                OR sc.region = ''
            )`);
            queryParams.push(region);
            paramIndex++;
        }

        const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // --- ZÄHLEN ---
        const countQuery = `
            SELECT COUNT(sc.id) as total_items
            FROM scraped_content sc
            LEFT JOIN sources s ON sc.original_url LIKE s.url || '%'
            ${whereString}
        `;
        const totalResult = await db.query(countQuery, queryParams);
        const totalItems = parseInt(totalResult.rows[0].total_items, 10);
        const totalPages = Math.ceil(totalItems / parseInt(limit, 10));

        // --- DATEN HOLEN (KORREKTUR HIER: s.logo_url HINZUGEFÜGT) ---
        const dataQuery = `
            SELECT 
                sc.id,
                sc.title,
                sc.event_date AS date,
                sc.summary,
                sc.original_url AS url,
                sc.region,
                sc.full_text,
                sc.category,
                s.logo_url,
                s.status = 'approved' AS is_trusted_source,
                EXISTS (
                    SELECT 1
                    FROM user_read_scraped_content ursc
                    WHERE ursc.scraped_content_id = sc.id
                      AND ursc.user_id = $${paramIndex}
                ) as is_read,
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
                COALESCE((
                    SELECT vote
                    FROM content_relevance_votes
                    WHERE content_id = sc.id AND user_id = $${paramIndex}
                ), NULL) AS "userVote"
            FROM scraped_content sc
            LEFT JOIN sources s ON sc.original_url LIKE s.url || '%'
            ${whereString}
            ORDER BY sc.event_date ASC
            LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
        `;

        const finalParams = [...queryParams, userId, parseInt(limit, 10), offset];
        const { rows: events } = await db.query(dataQuery, finalParams);

        // --- REGIONEN FÜR DAS DROPDOWN IM FRONTEND ---
        const availableRegions = [...new Set(events.map(e => e.region).filter(Boolean))];
        let regionsData = [];

        if (availableRegions.length > 0) {
            const regionQuery = `
                SELECT name, code
                FROM regions
                WHERE name = ANY($1::text[])
                   OR code = ANY($1::text[])
            `;
            const regionsResult = await db.query(regionQuery, [availableRegions]);
            regionsData = regionsResult.rows;
        }

        res.json({
            events,
            totalPages,
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
        // 1. Branding des Business Partners laden (für Logo & Name)
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
        } catch (e) {
            console.error('Fehler beim Laden des Partner-Brandings für Event-E-Mail:', e);
        }

        // 2. Den inneren HTML-Inhalt zusammenbauen
        const formattedDate = new Date(date).toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const contentHtml = `
            <p>Hallo,</p>
            <p><strong>${senderName}</strong> hat folgende Veranstaltung mit Ihnen geteilt:</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0;">
            <h3 style="margin:0 0 8px;">${title}</h3>
            <p><strong>Wann:</strong> ${formattedDate}</p>
            <div style="white-space:pre-wrap; margin-bottom: 16px;">${summary || ''}</div>
        `;

        // 3. Das schöne Template anwenden (emailTemplates.js wird hier genutzt!)
        const subject = `Interessante Veranstaltung: ${title}`;
        const htmlBody = renderLayout({
            preheader: `Einladung zu: ${title}`,
            title: fromName,
            contentHtml,
            ctaLabel: url ? 'Anmeldung & Details' : undefined,
            ctaUrl: url || undefined,
            footerText: `Gesendet von ${fromName} über das KI-Dashboard.`,
            brandLogoUrl,
        });

        // 4. E-Mail versenden (emailService.js wird hier genutzt!)
        await sendEmail({
            to: recipientEmail,
            subject: subject,
            html: htmlBody,
            fromName: fromName
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
        bp.id, bp.name, bp.slug, bp.address, bp.logo_url,
        bp.subscription_start_date, bp.subscription_end_date,
        bp.storage_tier, bp.storage_limit_bytes, bp.storage_usage_bytes,
        bp.dashboard_title, bp.url_businesspartner,
        bp.level_1_name, bp.level_2_name, bp.level_3_name,
        
        -- NEU HINZUGEFÜGT:
        bp.allow_automated_newsletter,
        bp.dashboard_focus,
        
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
        slug: r.slug,
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
        allow_automated_newsletter: r.allow_automated_newsletter,
        dashboard_focus: r.dashboard_focus,
        
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
    const {
        business_partner_id: rawBusinessPartnerId,
        role: rawRole
    } = req.user || {};

    if (!term || typeof term !== 'string' || term.trim().length < 3) {
        return res.status(400).json({
            message: 'Ein Suchbegriff mit mindestens 3 Zeichen ist erforderlich.'
        });
    }

    const searchTerm = term.trim();
    const role = String(rawRole || '').toLowerCase();
    const isAdmin = role === 'admin';
    const businessPartnerId = isValidUUID(rawBusinessPartnerId) ? rawBusinessPartnerId : null;

    try {
        const query = `
            SELECT
                id,
                title,
                summary,
                published_date,
                type,
                relevance,
                url,
                category,
                source_identifier,
                owner_business_partner_id,
                owner_business_partner_name,
                visibility_scope,
                admin_notice
            FROM (
                -- 1. Scraped Content
                SELECT
                    sc.id::text AS id,
                    sc.title,
                    sc.summary,
                    COALESCE(
                        sc.published_date::timestamptz,
                        sc.event_date::timestamptz,
                        sc.scraped_at,
                        sc.created_at
                    ) AS published_date,
                    'scraped'::text AS type,
                    sc.original_url::text AS url,
                    sc.category::text AS category,
                    sc.source_identifier::text AS source_identifier,
                    owner_bp.id::text AS owner_business_partner_id,
                    owner_bp.name::text AS owner_business_partner_name,
                    CASE
                        WHEN sc.category IN ('businesspartner_news', 'businesspartner_events')
                             AND owner_bp.id::text = $2::text
                            THEN 'own_mandant'
                        WHEN sc.category IN ('businesspartner_news', 'businesspartner_events')
                            THEN 'other_mandant'
                        ELSE 'global'
                    END::text AS visibility_scope,
                    CASE
                        WHEN $3::boolean
                             AND sc.category IN ('businesspartner_news', 'businesspartner_events')
                             AND owner_bp.name IS NOT NULL
                            THEN 'Admin-Ansicht · Mandant: ' || owner_bp.name
                        WHEN $3::boolean
                             AND sc.category IN ('businesspartner_news', 'businesspartner_events')
                            THEN 'Admin-Ansicht · Mandant unbekannt'
                        WHEN $3::boolean
                            THEN 'Admin-Ansicht · Globaler Inhalt'
                        ELSE NULL
                    END::text AS admin_notice,
                    ts_rank(
                        to_tsvector('german', sc.title || ' ' || COALESCE(sc.summary, '')),
                        websearch_to_tsquery('german', $1)
                    ) AS relevance
                FROM scraped_content sc
                LEFT JOIN business_partners owner_bp
                    ON (
                        sc.source_identifier = owner_bp.id::text || '_news'
                        OR sc.source_identifier = owner_bp.id::text || '_events'
                    )
                WHERE
                    to_tsvector('german', sc.title || ' ' || COALESCE(sc.summary, ''))
                        @@ websearch_to_tsquery('german', $1)
                    AND (
                        $3::boolean
                        OR sc.category NOT IN ('businesspartner_news', 'businesspartner_events')
                        OR sc.source_identifier = $2::text || '_news'
                        OR sc.source_identifier = $2::text || '_events'
                    )

                UNION ALL

                -- 2. AI Content
                SELECT
                    agc.id::text AS id,
                    COALESCE(agc.title, 'KI-Inhalt') AS title,
                    agc.generated_output AS summary,
                    agc.created_at AS published_date,
                    'ai'::text AS type,
                    agc.source_reference::text AS url,
                    NULL::text AS category,
                    NULL::text AS source_identifier,
                    ai_bp.id::text AS owner_business_partner_id,
                    ai_bp.name::text AS owner_business_partner_name,
                    CASE
                        WHEN agc.user_id IS NULL THEN 'global'
                        WHEN ai_bp.id::text = $2::text THEN 'own_mandant'
                        ELSE 'other_mandant'
                    END::text AS visibility_scope,
                    CASE
                        WHEN $3::boolean AND ai_bp.name IS NOT NULL
                            THEN 'Admin-Ansicht · Mandant: ' || ai_bp.name
                        WHEN $3::boolean AND agc.user_id IS NULL
                            THEN 'Admin-Ansicht · Globaler KI-Inhalt'
                        WHEN $3::boolean
                            THEN 'Admin-Ansicht · Mandant unbekannt'
                        ELSE NULL
                    END::text AS admin_notice,
                    ts_rank(
                        to_tsvector('german', COALESCE(agc.title, '') || ' ' || COALESCE(agc.generated_output, '')),
                        websearch_to_tsquery('german', $1)
                    ) AS relevance
                FROM ai_generated_content agc
                LEFT JOIN users ai_user
                    ON ai_user.id = agc.user_id
                LEFT JOIN business_partners ai_bp
                    ON ai_bp.id = ai_user.business_partner_id
                WHERE
                    to_tsvector('german', COALESCE(agc.title, '') || ' ' || COALESCE(agc.generated_output, ''))
                        @@ websearch_to_tsquery('german', $1)
                    AND (
                        $3::boolean
                        OR agc.user_id IS NULL
                        OR ai_user.business_partner_id = $2::uuid
                    )

                UNION ALL

                -- 3. Account Intelligence / Tracked Articles
                SELECT
                    bpta.id::text AS id,
                    bpta.article_title AS title,
                    bpta.summary,
                    COALESCE(bpta.published_at, bpta.created_at) AS published_date,
                    'tracked_account_news'::text AS type,
                    bpta.article_url::text AS url,
                    NULL::text AS category,
                    NULL::text AS source_identifier,
                    bp.id::text AS owner_business_partner_id,
                    bp.name::text AS owner_business_partner_name,
                    CASE
                        WHEN bp.id::text = $2::text THEN 'own_mandant'
                        ELSE 'other_mandant'
                    END::text AS visibility_scope,
                    CASE
                        WHEN $3::boolean AND bp.name IS NOT NULL
                            THEN 'Admin-Ansicht · Mandant: ' || bp.name
                        WHEN $3::boolean
                            THEN 'Admin-Ansicht · Mandant unbekannt'
                        ELSE NULL
                    END::text AS admin_notice,
                    ts_rank(
                        to_tsvector('german', bpta.article_title || ' ' || COALESCE(bpta.summary, '')),
                        websearch_to_tsquery('german', $1)
                    ) AS relevance
                FROM business_partner_tracked_articles bpta
                JOIN business_partner_accounts bpa
                    ON bpa.id = bpta.account_id
                JOIN business_partners bp
                    ON bp.id = bpa.business_partner_id
                WHERE
                    to_tsvector('german', bpta.article_title || ' ' || COALESCE(bpta.summary, ''))
                        @@ websearch_to_tsquery('german', $1)
                    AND (
                        $3::boolean
                        OR bpa.business_partner_id = $2::uuid
                    )

                UNION ALL

                -- 4. Dateien
                SELECT
                    bpf.id::text AS id,
                    bpf.filename AS title,
                    COALESCE(bpf.description, 'Datei im Dateimanager') AS summary,
                    bpf.created_at AS published_date,
                    'file'::text AS type,
                    '/files'::text AS url,
                    NULL::text AS category,
                    NULL::text AS source_identifier,
                    bp.id::text AS owner_business_partner_id,
                    bp.name::text AS owner_business_partner_name,
                    CASE
                        WHEN bp.id::text = $2::text THEN 'own_mandant'
                        ELSE 'other_mandant'
                    END::text AS visibility_scope,
                    CASE
                        WHEN $3::boolean AND bp.name IS NOT NULL
                            THEN 'Admin-Ansicht · Mandant: ' || bp.name
                        WHEN $3::boolean
                            THEN 'Admin-Ansicht · Mandant unbekannt'
                        ELSE NULL
                    END::text AS admin_notice,
                    ts_rank(
                        to_tsvector(
                            'german',
                            bpf.filename || ' ' ||
                            COALESCE(bpf.description, '') || ' ' ||
                            COALESCE(array_to_string(bpf.tags, ' '), '')
                        ),
                        websearch_to_tsquery('german', $1)
                    ) AS relevance
                FROM business_partner_files bpf
                JOIN business_partners bp
                    ON bp.id = bpf.business_partner_id
                WHERE
                    to_tsvector(
                        'german',
                        bpf.filename || ' ' ||
                        COALESCE(bpf.description, '') || ' ' ||
                        COALESCE(array_to_string(bpf.tags, ' '), '')
                    ) @@ websearch_to_tsquery('german', $1)
                    AND (
                        $3::boolean
                        OR bpf.business_partner_id = $2::uuid
                    )

                UNION ALL

                -- 5. Community Posts
                SELECT
                    cp.id::text AS id,
                    'Community Beitrag'::text AS title,
                    cp.content AS summary,
                    cp.created_at AS published_date,
                    'community_post'::text AS type,
                    '/community'::text AS url,
                    NULL::text AS category,
                    NULL::text AS source_identifier,
                    bp.id::text AS owner_business_partner_id,
                    bp.name::text AS owner_business_partner_name,
                    CASE
                        WHEN bp.id::text = $2::text THEN 'own_mandant'
                        ELSE 'other_mandant'
                    END::text AS visibility_scope,
                    CASE
                        WHEN $3::boolean AND bp.name IS NOT NULL
                            THEN 'Admin-Ansicht · Mandant: ' || bp.name
                        WHEN $3::boolean
                            THEN 'Admin-Ansicht · Mandant unbekannt'
                        ELSE NULL
                    END::text AS admin_notice,
                    ts_rank(
                        to_tsvector('german', COALESCE(cp.content, '')),
                        websearch_to_tsquery('german', $1)
                    ) AS relevance
                FROM community_posts cp
                JOIN business_partners bp
                    ON bp.id = cp.business_partner_id
                WHERE
                    to_tsvector('german', COALESCE(cp.content, ''))
                        @@ websearch_to_tsquery('german', $1)
                    AND (
                        $3::boolean
                        OR cp.business_partner_id = $2::uuid
                    )
            ) AS search_results
            ORDER BY relevance DESC, published_date DESC NULLS LAST
            LIMIT 30;
        `;

        const { rows } = await db.query(query, [searchTerm, businessPartnerId, isAdmin]);
        res.json(rows);
    } catch (err) {
        console.error('Fehler bei der globalen Suche:', err);
        res.status(500).json({
            message: 'Serverfehler bei der Suche.',
            error: err.message
        });
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
            ai_provider: 'OpenAI GPT-4o',
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


const getPartnerBranding = async (bpId) => {
    const sql = `
      SELECT bp.dashboard_title, bp.logo_url, cs.*
      FROM business_partners bp
      LEFT JOIN color_schemes cs ON bp.color_scheme_id = cs.id
      WHERE bp.id = $1`;
    const { rows } = await db.query(sql, [bpId]);
    return rows[0] || {};
};

exports.getDailyBriefing = async (req, res) => {
    const { business_partner_id: bpId, id: userId } = req.user;
    
    if (!bpId) {
        return res.status(404).json({ message: "Kein Partner zugeordnet." });
    }

    try {
        console.log(`\n--- [DEBUG getDailyBriefing] Starte Abfrage ---`);
        console.log(`User: ${userId} | BP: ${bpId}`);

        // =========================================================
        // 1. DIAGNOSE: Was liegt überhaupt in der Datenbank?
        // =========================================================
        const diagRes = await db.query(
            `SELECT status, COUNT(*) as cnt, MAX(created_at) as last_created 
             FROM business_partner_intelligence_briefings 
             WHERE business_partner_id = $1 
             GROUP BY status`,
            [bpId]
        );
        
        if (diagRes.rows.length === 0) {
            console.log(`[DIAGNOSE] ❌ Absolut KEINE Briefings für diesen BP in der Datenbank gefunden! (Weder Draft noch Published)`);
        } else {
            console.log(`[DIAGNOSE] ✅ Gefundene Einträge für diesen BP:`);
            diagRes.rows.forEach(row => {
                console.log(`  -> Status: '${row.status}' | Anzahl: ${row.cnt} | Neuestes: ${new Date(row.last_created).toLocaleString('de-DE')}`);
            });
        }

        // =========================================================
        // 2. EIGENTLICHE ABFRAGE (Entschärft!)
        // =========================================================
        // Wir suchen die neuesten PUBLISHED Briefings der letzten 48 Stunden, 
        // damit nächtliche Cronjobs (z.B. um 23:55 Uhr) am nächsten Morgen nicht verschwunden sind.
        const briefingQuery = `
            WITH LatestBriefing AS (
                SELECT DATE(MAX(created_at)) as max_date
                FROM business_partner_intelligence_briefings
                WHERE business_partner_id = $1 
                AND status = 'published'
                AND created_at >= NOW() - INTERVAL '48 hours'
            )
            SELECT id, briefing_type, headline, analysis_summary, prognosis, talking_point, related_articles 
            FROM business_partner_intelligence_briefings 
            WHERE business_partner_id = $1 
            AND status = 'published'
            AND DATE(created_at) = (SELECT max_date FROM LatestBriefing)
            ORDER BY id ASC
        `;
        
        // Sentiment (Umfrage) - Hier erlauben wir auch 48h Kulanz für den Test
        const sentimentQuery = `
            SELECT EXISTS(
                SELECT 1 FROM survey_responses sr 
                JOIN survey_questions sq ON sr.question_id = sq.id
                JOIN surveys s ON sq.survey_id = s.id
                WHERE sr.user_id = $1 AND s.title = 'Markt-Barometer' AND s.business_partner_id = $2 
                AND sr.created_at >= NOW() - INTERVAL '48 hours'
            ) as "hasVotedToday"
        `;

        const [briefingRes, sentimentRes] = await Promise.all([
            db.query(briefingQuery, [bpId]),
            db.query(sentimentQuery, [userId, bpId])
        ]);

        console.log(`[getDailyBriefing] Sende ${briefingRes.rows.length} PUBLISHED Items an das Frontend.`);
        console.log(`-------------------------------------------------\n`);

        res.json({
            items: briefingRes.rows, 
            hasVotedToday: sentimentRes.rows[0]?.hasVotedToday || false,
            sales_triggers: [], 
            linkable_names: []  
        });

    } catch (err) {
        console.error("--- SQL FEHLER IN getDailyBriefing ---");
        console.error(err.message);
        res.status(500).json({ message: 'Fehler beim Laden des Briefings' });
    }
};


async function retrieveInternalDocuments(searchTerm) {
    if (!searchTerm || searchTerm.trim().length < 3) return [];
    
    // Wir suchen nach Schlagworten in Inhalten UND Experten-Tags
    const formattedTerm = searchTerm.trim().split(/\s+/).join(' & ');

    try {
        const query = `
            SELECT id, title, summary, type, url, relevance
            FROM (
                -- Bestehende Suche (Scraped/AI/News)
                SELECT id, title, summary, 'scraped' as type, original_url as url, 
                       ts_rank(to_tsvector('german', title || ' ' || summary), to_tsquery('german', $1)) as relevance
                FROM scraped_content WHERE to_tsvector('german', title || ' ' || summary) @@ to_tsquery('german', $1)
                
                UNION ALL
                SELECT 
                    u.id::text, 
                    'Experte: ' || u.first_name || ' ' || u.last_name as title,
                    'Expertise in: ' || string_agg(ust.tag_name, ', ') || 
                    '. Kontakt: ' || COALESCE(u.phone, 'Keine Nummer hinterlegt') || 
                    ' (' || u.email || ')' as summary,
                    'user' as type,
                    '/community' as url,
                    10.0 as relevance
                FROM users u
                JOIN user_saved_tags ust ON u.id = ust.user_id
                WHERE ust.tag_name ILIKE $2
                GROUP BY u.id
            ) as search_results
            ORDER BY relevance DESC
            LIMIT 6;
        `;
        const { rows } = await db.query(query, [formattedTerm, `%${searchTerm}%`]);
        return rows;
    } catch (err) {
        console.error('Fehler bei der Experten-Suche:', err.message);
        return [];
    }
}


exports.handleAiQuestion = async (req, res) => {
    if (req.user.role === 'demo') {
        return res.status(403).json({ message: 'KI-Anfragen sind im Demo-Modus deaktiviert.' });
    }    
    
    // NEU: sessionId wird aus dem Frontend erwartet
    const { question, history, sessionId } = req.body;
    const { id: userId, business_partner_id: businessPartnerId } = req.user;

    if (!question) {
        return res.status(400).json({ message: 'Eine Frage (question) ist erforderlich.' });
    }
    if (!businessPartnerId) {
        return res.status(403).json({ message: 'Benutzer ist keinem Business Partner zugeordnet.' });
    }

    let jobId;
    let currentSessionId = sessionId;
    const client = await db.connect();
    
    try {
        await client.query('BEGIN');

        // 1. Session-Management: Wenn keine Session-ID da ist, erstelle eine neue
        if (!currentSessionId) {
            const sessionRes = await client.query(
                `INSERT INTO ai_chat_sessions (user_id) VALUES ($1) RETURNING id`,
                [userId]
            );
            currentSessionId = sessionRes.rows[0].id;
        }

        // 2. Nutzer-Nachricht in der Datenbank speichern
        await client.query(
            `INSERT INTO ai_chat_messages (session_id, role, content) VALUES ($1, 'user', $2)`,
            [currentSessionId, question]
        );

        // 3. Job-Erstellung & Gamification
        const jobResult = await client.query(`INSERT INTO ai_jobs (status, is_automated) VALUES ('running', false) RETURNING id`);
        jobId = jobResult.rows[0].id;
        
        await logToDb(jobId, 'INFO', `Starte RAG-Anfrage für User ${userId}. Frage: "${question}"`);

        const pointsChange = -2;
        await client.query(
            'UPDATE users SET contribution_score = contribution_score + $1 WHERE id = $2',
            [pointsChange, userId]
        );

        const description = `Punkte für KI-Anfrage erhalten: "${question.substring(0, 100)}..."`;
        await client.query(
            `INSERT INTO user_score_logs (reference_id, user_id, points_change, action_type, description) 
             VALUES ($1, $2, $3, $4, $5)`,
            [jobId, userId, pointsChange, 'AI_QUERY', description]
        );

        await client.query('COMMIT');

        // 4. Partner-Daten abrufen (inkl. Homepage)
        const partnerRes = await client.query(
            `SELECT 
                bp.dashboard_focus,
                bp.url_businesspartner,
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

        if (partnerRes.rows.length === 0) throw new Error('Business Partner nicht gefunden.');
        const partner = partnerRes.rows[0];
        const industryNames = partner.industries.length > 0 ? partner.industries.join(', ') : 'allgemeine Mobilität';

        // 5. Dokumenten-Retrieval
        const documents = await retrieveInternalDocuments(question);
        let context = 'Keine relevanten internen Dokumente gefunden.';
        if (documents.length > 0) {
            context = documents.map(doc => 
                `--- DOKUMENT (ID: ${doc.id}, Typ: ${doc.type}) ---\nTITEL: ${doc.title}\nINHALT: ${doc.summary || ''}\nQUELLE: ${doc.url || 'Intern'}\n---`
            ).join('\n\n');
        }

        const promptTemplate = `
          Du bist ein hochqualifizierter KI-Assistent, spezialisiert auf die Branchen: ${industryNames}.
          BEANTWORTE DIE FRAGE DES BENUTZERS: "${question}"
          BASIERE DEINE ANTWORT AUF DEINEM ALLGEMEINEN WISSEN UND DEN FOLGENDEN INTERNEN DOKUMENTEN.
          BEZIEHE DICH WO IMMER MÖGLICH AUF DIESE DOKUMENTE, ABER ERWÄHNE NICHT DIE "DOKUMENT-ID".
          Formatiere deine Antwort als klares, lesbares Markdown.
          --- INTERNE DOKUMENTE ALS KONTEXT ---
          {{data}}
          --- ENDE DES KONTEXTES ---
        `;

        // 6. KI-Anfrage senden
        const { aiResultString } = await generateAIContent({
            promptTemplate,
            inputText: context,
            history: history,
            ai_provider: 'OpenAI GPT-4o',
            jobId: jobId,
            userId: userId,
            bpHomepage: partner.url_businesspartner // Homepage als Quelle!
        });

        // 7. KI-Antwort in der Datenbank speichern
        await client.query(
            `INSERT INTO ai_chat_messages (session_id, role, content) VALUES ($1, 'assistant', $2)`,
            [currentSessionId, aiResultString]
        );
        
        await client.query(`UPDATE ai_jobs SET status = 'completed' WHERE id = $1`, [jobId]);

        // 8. Antwort inkl. Session-ID ans Frontend senden
        res.json({
            sessionId: currentSessionId,
            answer: aiResultString,
            sources: documents.map(doc => ({
                id: doc.id,
                title: doc.title,
                type: doc.type,
                url: doc.url || `/search?term=${encodeURIComponent(doc.title)}`
            }))
        });

    } catch (err) {
        console.error('Fehler in handleAiQuestion:', err.message);
        if (jobId) {
            try {
                await client.query(`UPDATE ai_jobs SET status = 'failed' WHERE id = $1`, [jobId]);
            } catch (e) {}
        }
        res.status(500).json({ message: 'Fehler bei der Verarbeitung der KI-Anfrage.' });
    } finally {
        client.release();
    }
};
// ...


exports.getNotificationCounts = async (req, res) => {
    const {
        id: userId,
        business_partner_id: businessPartnerId,
        role,
        last_login_at: previousLoginAt,
        token_issued_at: tokenIssuedAt
    } = req.user;

    if (!userId) {
        return res.status(401).json({ message: 'Authentifizierung erforderlich.' });
    }

    try {
        // Der vorherige Login wird bei der Anmeldung im JWT eingefroren. Alte
        // Tokens enthalten ihn noch nicht und verwenden daher ihren Ausgabezeitpunkt.
        const changeSince = previousLoginAt || tokenIssuedAt || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const isAdmin = role === 'admin';

        const [scrapedNew, aiNew, actionsNew, communityNew, filesNew, directoryNew, sourcesNew] = await Promise.all([
            // 1. Scraped Content: Zählt die letzten 30 Tage, falls nicht explizit gelesen!
            db.query(`
                SELECT COUNT(sc.id) as cnt 
                FROM scraped_content sc 
                WHERE sc.created_at > NOW() - INTERVAL '30 days' 
                  AND NOT EXISTS (
                      SELECT 1 FROM user_read_scraped_content ursc 
                      WHERE ursc.scraped_content_id = sc.id AND ursc.user_id = $1
                  )`, [userId]),
            
            // 2. AI Content: Zählt die letzten 30 Tage, falls nicht explizit gelesen!
            db.query(`
                SELECT COUNT(agc.id) as cnt 
                FROM ai_generated_content agc 
                WHERE agc.created_at > NOW() - INTERVAL '30 days' 
                  AND NOT EXISTS (
                      SELECT 1 FROM user_read_ai_content urac 
                      WHERE urac.ai_content_id = agc.id AND urac.user_id = $1
                  )`, [userId]),

            // 3. Actions und Software: neue UND geaenderte Datensaetze.
            isAdmin
                ? db.query(`
                    SELECT (
                        (SELECT COUNT(*) FROM business_partner_actions WHERE COALESCE(updated_at, created_at) > $1)
                        +
                        (SELECT COUNT(*) FROM software_tools WHERE COALESCE(updated_at, created_at) > $1)
                    )::int AS cnt
                `, [changeSince])
                : isValidUUID(businessPartnerId)
                    ? db.query(`
                        SELECT (
                            (SELECT COUNT(*) FROM business_partner_actions WHERE business_partner_id = $1 AND COALESCE(updated_at, created_at) > $2)
                            +
                            (SELECT COUNT(*) FROM software_tools WHERE business_partner_id = $1 AND COALESCE(updated_at, created_at) > $2)
                        )::int AS cnt
                    `, [businessPartnerId, changeSince])
                    : Promise.resolve({ rows: [{ cnt: 0 }] }),

            // 4. Community Posts
            isAdmin
                ? db.query(`SELECT COUNT(id) as cnt FROM community_posts WHERE COALESCE(updated_at, created_at) > $1`, [changeSince])
                : isValidUUID(businessPartnerId)
                    ? db.query(`SELECT COUNT(id) as cnt FROM community_posts WHERE business_partner_id = $1 AND COALESCE(updated_at, created_at) > $2`, [businessPartnerId, changeSince])
                    : Promise.resolve({ rows: [{ cnt: 0 }] }),

            // 5. Dateien
            isAdmin
                ? db.query(`SELECT COUNT(id) as cnt FROM business_partner_files WHERE COALESCE(updated_at, created_at) > $1`, [changeSince])
                : isValidUUID(businessPartnerId)
                    ? db.query(`SELECT COUNT(id) as cnt FROM business_partner_files WHERE business_partner_id = $1 AND COALESCE(updated_at, created_at) > $2`, [businessPartnerId, changeSince])
                    : Promise.resolve({ rows: [{ cnt: 0 }] }),

            // 6. Partner-Netzwerk
            isAdmin
                ? db.query(`SELECT COUNT(id) as cnt FROM directory_providers WHERE COALESCE(updated_at, created_at) > $1`, [changeSince])
                : isValidUUID(businessPartnerId)
                ? db.query(`
                    SELECT COUNT(p.id) as cnt 
                    FROM directory_providers p
                    INNER JOIN directory_provider_mandant_settings ms ON p.id = ms.provider_id
                    WHERE ms.business_partner_id = $1 AND ms.status = 'active' AND COALESCE(p.updated_at, p.created_at) > $2
                  `, [businessPartnerId, changeSince])
                : Promise.resolve({ rows: [{ cnt: 0 }] }),

            // 7. Quellen
            db.query(`SELECT COUNT(id) as cnt FROM sources WHERE status = 'approved' AND COALESCE(updated_at, created_at) > $1`, [changeSince])
        ]);

        const counts = {
            scraped: parseInt(scrapedNew.rows[0].cnt, 10),
            ai: parseInt(aiNew.rows[0].cnt, 10),
            actions: parseInt(actionsNew.rows[0].cnt, 10),
            community: parseInt(communityNew.rows[0].cnt, 10),
            files: parseInt(filesNew.rows[0].cnt, 10),
            directory: parseInt(directoryNew.rows[0].cnt, 10),
            sources: parseInt(sourcesNew.rows[0].cnt, 10)
        };

        const totalCount = Object.values(counts).reduce((sum, value) => sum + value, 0);

        res.json({ 
            totalCount: totalCount,
            menuCounts: counts 
        });

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
    // 1. SICHERER ZUGRIFF: Prüfen ob User existiert (Gast = null)
    const userId = req.user ? req.user.id : null;
    const bpId = req.user ? req.user.business_partner_id : null;

    try {
        let surveyRes;

        // 2. SURVEY SUCHEN (Partner-Spezifisch ODER Global für Gäste)
        if (bpId) {
            // Variante A: Eingeloggter User -> Suche das Barometer SEINES Partners
            surveyRes = await db.query(
                "SELECT id FROM surveys WHERE title = 'Markt-Barometer' AND business_partner_id = $1 AND is_active = TRUE LIMIT 1",
                [bpId]
            );
        } else {
            // Variante B: Public Landingpage Gast -> Suche das globale Barometer 
            // (Nimmt einfach das erste aktive Barometer, z.B. vom Hauptverband)
            surveyRes = await db.query(
                "SELECT id FROM surveys WHERE title = 'Markt-Barometer' AND is_active = TRUE LIMIT 1"
            );
        }
        
        if (surveyRes.rows.length === 0) {
            return res.json({ active: false, message: "Kein aktives Barometer gefunden" });
        }
        const surveyId = surveyRes.rows[0].id;

        // 3. Neueste Frage holen
        const questionRes = await db.query(`
            SELECT id, question_text, options 
            FROM survey_questions 
            WHERE survey_id = $1 
            ORDER BY display_order DESC, id DESC 
            LIMIT 1
        `, [surveyId]);

        if (questionRes.rows.length === 0) return res.json({ active: false });
        const question = questionRes.rows[0];

        // 4. Prüfen ob User abgestimmt hat (NUR wenn userId existiert!)
        let hasVoted = false;
        let userVote = null;

        if (userId) {
            const userVoteRes = await db.query(
                "SELECT response_text FROM survey_responses WHERE question_id = $1 AND user_id = $2",
                [question.id, userId]
            );
            hasVoted = userVoteRes.rows.length > 0;
            userVote = hasVoted ? userVoteRes.rows[0].response_text : null;
        }

        // 5. Statistik berechnen (Diese Daten darf jeder sehen)
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

        // 6. Antwort senden
        res.json({
            active: true,
            questionId: question.id,
            questionText: question.question_text,
            hasVoted,    // Bei Gästen immer false
            userVote,    // Bei Gästen immer null
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
