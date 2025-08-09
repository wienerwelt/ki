const axios = require('axios');
const db = require('../config/db'); // Passen Sie den Pfad ggf. an

const METALPRICE_API_KEY = process.env.METALPRICE_API_KEY;
const OILPRICE_API_KEY = process.env.OILPRICE_API_KEY;
const CO2_API_KEY = process.env.CO2_API_KEY; // NEU

/**
 * Robuste "Upsert"-Logik für einen Wirtschaftsindikator.
 * Prüft, ob für den Tag bereits ein Eintrag existiert und fügt ihn ein oder aktualisiert ihn.
 */
const upsertIndicator = async (indicator) => {
    const { name, value, unit, timestamp, source, countryCode = null } = indicator;

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
    if (!METALPRICE_API_KEY) {
        console.error('METALPRICE_API_KEY nicht gefunden. Überspringe Währungskurse.');
        return;
    }
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
        console.error('Fehler beim Abrufen der Währungskurse:', error.response?.data?.error || error.message);
    }
};

/**
 * Ruft den Preis für Brent-Rohöl ab.
 */
const fetchAndStoreOilPrice = async () => {
    if (!OILPRICE_API_KEY) {
        console.error('OILPRICE_API_KEY nicht gefunden. Überspringe Ölpreis.');
        return;
    }
    try {
        const response = await axios.get('https://api.oilpriceapi.com/v1/prices/latest', {
            headers: { 'Authorization': `Token ${OILPRICE_API_KEY}` },
            params: { by_code: 'BRENT_CRUDE_USD' }
        });
        if (!response.data?.data?.price) throw new Error("Brent-Preis konnte nicht gefunden werden.");
        
        let timestamp = response.data.data.updated_at ? new Date(response.data.data.updated_at) : new Date();
        if (isNaN(timestamp.getTime())) timestamp = new Date();

        await upsertIndicator({
            name: 'BRENT_OIL',
            value: response.data.data.price,
            unit: 'USD/Barrel',
            timestamp: timestamp,
            source: 'oilpriceapi.com'
        });
    } catch (error) {
        console.error('Fehler beim Abrufen des Ölpreises:', error.response?.data?.error?.message || error.message);
    }
};

/**
 * --- NEUE FUNKTION: Ruft den 3-Monats-Euribor von der EZB ab. ---
 */
const fetchAndStoreEuriborRate = async () => {
    try {
        // API-Endpunkt der EZB für den 3-Monats-Euribor (Serie: FM.D.U2.EUR.4F.KR.EURIBOR3MD.AVG)
        const url = 'https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.EURIBOR3MD.AVG?lastNObservations=1';
        const response = await axios.get(url, {
            headers: { 'Accept': 'application/json' }
        });

        const series = response.data.dataSets[0].series['0:0:0:0:0:0:0'];
        const lastObservation = series.observations[Object.keys(series.observations).length - 1];
        const date = response.data.structure.dimensions.observation[0].values[Object.keys(series.observations).length - 1].id;
        
        await upsertIndicator({
            name: 'EURIBOR_3M',
            value: lastObservation[0],
            unit: '%',
            timestamp: new Date(date),
            source: 'ecb.europa.eu'
        });
    } catch (error) {
        console.error('Fehler beim Abrufen des Euribor-Zinssatzes:', error.response?.data || error.message);
    }
};

/**
 * --- NEUE FUNKTION: Ruft den CO2-Emissionspreis (EUA Futures) ab. ---
 */
const fetchAndStoreCO2Price = async () => {
    if (!CO2_API_KEY) {
        console.error('CO2_API_KEY nicht gefunden. Überspringe CO2-Preis.');
        return;
    }
    try {
        const response = await axios.get('https://commodities-api.com/api/latest', {
            params: {
                access_key: CO2_API_KEY,
                base: 'EUR',
                symbols: 'CARBON' // Symbol für EU Carbon Emissions Allowances (EUA)
            }
        });
        if (!response.data.success) throw new Error(response.data.error.info);
        
        // Die API gibt den Preis pro Tonne in der Basiswährung (EUR) zurück.
        const co2Price = response.data.data.rates.CARBON;

        await upsertIndicator({
            name: 'CO2_PRICE',
            value: co2Price,
            unit: 'EUR/Tonne',
            timestamp: new Date(response.data.data.date),
            source: 'commodities-api.com'
        });
    } catch (error) {
        console.error('Fehler beim Abrufen des CO2-Preises:', error.response?.data?.error || error.message);
    }
};

/**
 * Hauptfunktion, die alle Abrufe bündelt.
 */
const updateAllCommodityPrices = async () => {
    console.log('Starte die Aktualisierung der Wirtschaftsdaten...');
    await fetchAndStoreCurrencyRates();
    await fetchAndStoreOilPrice();
    await fetchAndStoreEuriborRate(); // NEU
    await fetchAndStoreCO2Price();   // NEU
    console.log('Aktualisierung der Wirtschaftsdaten abgeschlossen.');
};

module.exports = { updateAllCommodityPrices };