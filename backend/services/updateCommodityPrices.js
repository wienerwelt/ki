// backend/services/updateCommodityPrices.js
const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../config/db');

// Laden der API-Schlüssel aus den Umgebungsvariablen
const METALPRICE_API_KEY = process.env.METALPRICE_API_KEY;
const OILPRICE_API_KEY = process.env.OILPRICE_API_KEY;

// Die Hilfsfunktion 'upsertIndicator' bleibt unverändert
const upsertIndicator = async (indicator) => {
    const { name, value, unit, timestamp, source, countryCode = null } = indicator;
    if (value === null || value === undefined || isNaN(value)) {
        console.log(`[data-update] Kein gültiger Wert für ${name} erhalten. Überspringe DB-Update.`);
        return;
    }
    const existingEntry = await db.query(
        `SELECT id FROM economic_indicators WHERE indicator_name = $1 AND data_timestamp::date = $2::date`,
        [name, timestamp]
    );
    if (existingEntry.rows.length > 0) {
        await db.query(
            `UPDATE economic_indicators SET value = $1, data_timestamp = $2, unit = $3, source = $4 WHERE id = $5`,
            [value, timestamp, unit, source, existingEntry.rows[0].id]
        );
    } else {
        await db.query(
            `INSERT INTO economic_indicators (indicator_name, value, unit, data_timestamp, source, country_code)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [name, value, unit, timestamp, source, countryCode]
        );
    }
    console.log(`[data-update] Daten für ${name} erfolgreich gespeichert/aktualisiert.`);
};


const fetchAndStoreCurrencyRates = async () => {
    if (!METALPRICE_API_KEY) throw new Error('METALPRICE_API_KEY nicht gefunden.');
    try {
        const response = await axios.get(`https://api.metalpriceapi.com/v1/latest`, {
            params: { api_key: METALPRICE_API_KEY, base: 'USD', currencies: 'EUR' }
        });
        if (response.data.success === false) throw new Error(response.data.error.info);

        const eurToUsdRate = 1 / response.data.rates.EUR;
        await upsertIndicator({
            name: 'EUR_USD',
            value: eurToUsdRate,
            unit: 'USD',
            timestamp: new Date(response.data.timestamp * 1000),
            source: 'metalpriceapi.com'
        });
    } catch (error) {
        const errorMessage = error.response?.data?.error?.info || error.message;
        throw new Error(`Währungskurs-Update fehlgeschlagen: ${errorMessage}`);
    }
};


const fetchAndStoreOilPrice = async () => {
    if (!OILPRICE_API_KEY) throw new Error('OILPRICE_API_KEY nicht gefunden.');
    try {
        const response = await axios.get('https://api.oilpriceapi.com/v1/prices/latest', {
            headers: { 'Authorization': `Token ${OILPRICE_API_KEY}` },
            params: { by_code: 'BRENT_CRUDE_USD' }
        });
        if (!response.data?.data?.price) throw new Error("Brent-Preis konnte nicht gefunden werden.");
        
        const timestamp = response.data.data.updated_at ? new Date(response.data.data.updated_at) : new Date();
        await upsertIndicator({
            name: 'BRENT_OIL',
            value: response.data.data.price,
            unit: 'USD/Barrel',
            timestamp: timestamp,
            source: 'oilpriceapi.com'
        });
    } catch (error) {
        const errorMessage = error.response?.data?.error?.message || error.message;
        throw new Error(`Ölpreis-Update fehlgeschlagen: ${errorMessage}`);
    }
};


const fetchAndStoreEuriborRate = async () => {
    try {
        const url = `https://data-api.ecb.europa.eu/service/data/FM/M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA?lastNObservations=1&detail=dataonly&format=jsondata`;
        const response = await axios.get(url, { headers: { 'Accept': 'application/json' } });

        const dataSet = response.data?.dataSets?.[0];
        if (!dataSet || !dataSet.series) {
            console.log('Keine Euribor-Datensätze in der Antwort gefunden. Überspringe Update.');
            return;
        }

        // KORREKTUR: Greife dynamisch auf den ersten verfügbaren Serien-Schlüssel zu.
        const seriesKey = Object.keys(dataSet.series)[0];
        const series = dataSet.series[seriesKey];

        if (!series || !series.observations) {
            console.log('Keine Euribor-Beobachtungen in der Antwort gefunden. Überspringe Update.');
            return;
        }

        const observationKeys = Object.keys(series.observations);
        if (observationKeys.length === 0) {
            console.log('Keine neuen Euribor-Beobachtungen gefunden. Überspringe Update.');
            return;
        }
        
        const lastObservationIndex = observationKeys[0];
        const lastObservationValue = series.observations[lastObservationIndex][0];

        const dateDimension = response.data.structure.dimensions.observation.find(dim => dim.id === 'TIME_PERIOD');
        const lastDate = dateDimension.values[lastObservationIndex].name;

        await upsertIndicator({
            name: 'EURIBOR_3M',
            value: lastObservationValue,
            unit: '%',
            timestamp: new Date(`${lastDate}-01`),
            source: 'ecb.europa.eu'
        });

    } catch (error) {
        const errorMessage = error.response ? `Status ${error.response.status}` : error.message;
        throw new Error(`Euribor-Update fehlgeschlagen: ${errorMessage}`);
    }
};


const fetchAndStoreKVLPI = async () => {
    try {
        const url = 'https://www.statistik.at/statistiken/volkswirtschaft-und-oeffentliche-finanzen/preise-und-preisindizes/kraftfahrzeughaftpflicht-versicherungsleistungspreisindex-kvlpi';
        
        // 1. Lade den HTML-Inhalt der Webseite
        const { data: html } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });

        // 2. Parse das HTML mit Cheerio
        const $ = cheerio.load(html);

        // 3. Finde die Daten in der Tabelle
        // Wir suchen die Tabellenzeile (tr), die den Text "KVLPI gesamt" enthält
        const targetRow = $('td:contains("KVLPI gesamt")').parent('tr');

        if (targetRow.length === 0) {
            throw new Error('KVLPI-Gesamtzeile konnte auf der Webseite nicht gefunden werden.');
        }

        // Finde den letzten Datenpunkt (td) in dieser Zeile -> das ist der aktuellste Wert
        const latestValueStr = targetRow.find('td:last-child').text().trim();
        
        // Finde den zugehörigen Monat aus dem Tabellenkopf (th)
        const latestMonthStr = $('table.table--data thead th:last-child').text().trim(); // z.B. "2025M08"

        // 4. Bereite die Daten für die Datenbank auf
        const year = parseInt(latestMonthStr.substring(0, 4));
        const month = parseInt(latestMonthStr.substring(5, 7));
        const timestamp = new Date(year, month - 1, 1); // Monat ist 0-basiert

        // Konvertiere den deutschen Komma-String in eine Zahl
        const value = parseFloat(latestValueStr.replace(',', '.'));

        if (isNaN(value)) {
            throw new Error(`Gelesener KVLPI-Wert "${latestValueStr}" ist keine gültige Zahl.`);
        }

        // 5. Speichere die Daten mit deiner bestehenden Funktion
        await upsertIndicator({
            name: 'KVLPI_GESAMT', // Eindeutiger Name für die Datenbank
            value: value,
            unit: 'Index (2020=100)',
            timestamp: timestamp,
            source: 'statistik.at',
            countryCode: 'AT'
        });

    } catch (error) {
        throw new Error(`KVLPI-Update fehlgeschlagen: ${error.message}`);
    }
};


const fetchAndStoreCO2Price = async () => {
    try {
        const url = 'https://tradingeconomics.com/commodity/carbon';

        // 1. Lade den HTML-Inhalt der Webseite
        const { data: html } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
            }
        });

        // 2. Parse das HTML mit Cheerio
        const $ = cheerio.load(html);

        // 3. Finde den Preis und die Einheit im HTML
        // Der Preis steht in einem Element mit der ID "p"
        const priceStr = $('#p').text().trim();
        // Die Einheit steht direkt daneben im Element mit der ID "unit"
        const unitStr = $('#unit').text().trim();

        const price = parseFloat(priceStr);

        if (isNaN(price)) {
            throw new Error(`Gelesener CO2-Preis "${priceStr}" von TradingEconomics ist keine gültige Zahl.`);
        }

        // 4. Speichere die Daten
        await upsertIndicator({
            name: 'CO2_PRICE',
            value: price,
            unit: unitStr || 'EUR/tCO2', // Nutze die gelesene Einheit oder einen Fallback
            timestamp: new Date(), // Wir nehmen das aktuelle Datum
            source: 'tradingeconomics.com', // Die neue Quelle!
            countryCode: null // EU-weiter Preis
        });

    } catch (error) {
        throw new Error(`CO2-Preis-Update von TradingEconomics fehlgeschlagen: ${error.message}`);
    }
};


const updateDailyIndicators = async () => {
    console.log('[data-update] Starte die Aktualisierung der TÄGLICHEN Wirtschaftsdaten...');
    const results = await Promise.allSettled([
        fetchAndStoreCurrencyRates(),
        fetchAndStoreOilPrice(),
        fetchAndStoreEuriborRate(),
        fetchAndStoreCO2Price(),
    ]);

    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length > 0) {
        failures.forEach(failure => console.error('[data-update] Ein täglicher Sub-Job ist fehlgeschlagen:', failure.reason.message));
        throw new Error('Mindestens ein täglicher Update-Job ist fehlgeschlagen.');
    }
    console.log('[data-update] Aktualisierung der täglichen Wirtschaftsdaten erfolgreich abgeschlossen.');
};

/**
 * Bündelt alle MONATLICHEN Abrufe.
 */
const updateMonthlyIndicators = async () => {
    console.log('[data-update] Starte die Aktualisierung der MONATLICHEN Wirtschaftsdaten...');
    const results = await Promise.allSettled([
        fetchAndStoreKVLPI(),
    ]);

    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length > 0) {
        failures.forEach(failure => console.error('[data-update] Ein monatlicher Sub-Job ist fehlgeschlagen:', failure.reason.message));
        throw new Error('Mindestens ein monatlicher Update-Job ist fehlgeschlagen.');
    }
    console.log('[data-update] Aktualisierung der monatlichen Wirtschaftsdaten erfolgreich abgeschlossen.');
};

// Exportiere die neuen Funktionen für den Worker und Scheduler
module.exports = { 
    updateDailyIndicators, 
    updateMonthlyIndicators 
};