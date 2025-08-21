// backend/services/updateCommodityPrices.js
const axios = require('axios');
const db = require('../config/db'); // Passen Sie den Pfad ggf. an

// Laden der API-Schlüssel aus den Umgebungsvariablen
const METALPRICE_API_KEY = process.env.METALPRICE_API_KEY;
const OILPRICE_API_KEY = process.env.OILPRICE_API_KEY;

/**
 * Robuste "Upsert"-Logik für einen Wirtschaftsindikator.
 */
const upsertIndicator = async (indicator) => {
    const { name, value, unit, timestamp, source, countryCode = null } = indicator;

    if (value === null || value === undefined || isNaN(value)) {
        console.log(`Kein gültiger Wert für ${name} erhalten. Überspringe Datenbank-Update.`);
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
    console.log(`Daten für ${name} erfolgreich gespeichert/aktualisiert.`);
};

/**
 * Ruft den EUR/USD-Wechselkurs ab.
 */
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

/**
 * Ruft den Preis für Brent-Rohöl ab.
 */
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

/**
 * FINALE VERSION V2: Nutzt den stabilen Endpunkt und greift dynamisch auf die Daten zu.
 */
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

/**
 * Hauptfunktion, die alle Abrufe bündelt.
 */
const updateAllCommodityPrices = async () => {
    console.log('Starte die Aktualisierung der Wirtschaftsdaten...');
    const results = await Promise.allSettled([
        fetchAndStoreCurrencyRates(),
        fetchAndStoreOilPrice(),
        fetchAndStoreEuriborRate(),
    ]);

    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length > 0) {
        failures.forEach(failure => {
            console.error('Ein Sub-Job ist fehlgeschlagen:', failure.reason.message);
        });
        throw new Error('Mindestens ein Update-Job für Rohstoffdaten ist fehlgeschlagen.');
    }

    console.log('Aktualisierung der Wirtschaftsdaten erfolgreich abgeschlossen.');
};

module.exports = { updateAllCommodityPrices };