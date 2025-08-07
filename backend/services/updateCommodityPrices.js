const axios = require('axios');
const db = require('../config/db'); // Passen Sie den Pfad ggf. an

const METALPRICE_API_KEY = process.env.METALPRICE_API_KEY;
const OILPRICE_API_KEY = process.env.OILPRICE_API_KEY;

/**
 * Ruft den EUR/USD-Wechselkurs ab und speichert ihn.
 */
const fetchAndStoreCurrencyRates = async () => {
    if (!METALPRICE_API_KEY) {
        console.error('METALPRICE_API_KEY nicht in .env gefunden. Überspringe Währungskurse.');
        return;
    }
    try {
        const response = await axios.get(`https://api.metalpriceapi.com/v1/latest`, {
            params: { api_key: METALPRICE_API_KEY, base: 'USD', currencies: 'EUR' }
        });

        if (response.data.success === false) {
             throw new Error(response.data.error.info);
        }

        const { rates } = response.data;
        const timestamp = new Date(response.data.timestamp * 1000);
        const eurToUsdRate = 1 / rates.EUR;
        const currency = { name: 'EUR_USD', rate: eurToUsdRate, unit: 'USD', source: 'metalpriceapi.com' };

        // KORREKTUR: Robuste "Upsert"-Logik ohne ON CONFLICT
        const existingEntry = await db.query(
            `SELECT id FROM economic_indicators WHERE indicator_name = $1 AND data_timestamp::date = $2::date`,
            [currency.name, timestamp]
        );

        if (existingEntry.rows.length > 0) {
            // Update
            await db.query(
                `UPDATE economic_indicators SET value = $1, data_timestamp = $2 WHERE id = $3`,
                [currency.rate, timestamp, existingEntry.rows[0].id]
            );
        } else {
            // Insert
            await db.query(
                `INSERT INTO economic_indicators (indicator_name, value, unit, data_timestamp, source, country_code)
                 VALUES ($1, $2, $3, $4, $5, NULL)`,
                [currency.name, currency.rate, currency.unit, timestamp, currency.source]
            );
        }
        console.log(`Kurs für ${currency.name} erfolgreich gespeichert/aktualisiert.`);
        
    } catch (error) {
        console.error('Fehler beim Abrufen der Währungskurse:', error.response?.data?.error || error.message);
    }
};

/**
 * Ruft den Preis für Brent-Rohöl ab und speichert ihn.
 */
const fetchAndStoreOilPrice = async () => {
    if (!OILPRICE_API_KEY) {
        console.error('OILPRICE_API_KEY nicht in .env gefunden. Überspringe Ölpreis.');
        return;
    }
    try {
        const response = await axios.get('https://api.oilpriceapi.com/v1/prices/latest', {
            headers: {
                'Authorization': `Token ${OILPRICE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            params: {
                by_code: 'BRENT_CRUDE_USD'
            }
        });
        
        if (!response.data?.data?.price) {
            throw new Error("Brent-Preis konnte in der API-Antwort nicht gefunden werden.");
        }

        const brentPrice = response.data.data.price;
        // KORREKTUR: Fallback auf aktuelles Datum, falls Zeitstempel fehlt oder ungültig ist
        const timestamp = response.data.data.updated_at ? new Date(response.data.data.updated_at) : new Date();

        if (isNaN(timestamp.getTime())) {
            console.warn("Ungültiger Zeitstempel von der Ölpreis-API, verwende aktuelles Datum als Fallback.");
            timestamp = new Date();
        }

        // KORREKTUR: Robuste "Upsert"-Logik ohne ON CONFLICT
        const existingEntry = await db.query(
            `SELECT id FROM economic_indicators WHERE indicator_name = $1 AND data_timestamp::date = $2::date`,
            ['BRENT_OIL', timestamp]
        );

        if (existingEntry.rows.length > 0) {
            // Update
            await db.query(
                `UPDATE economic_indicators SET value = $1, data_timestamp = $2 WHERE id = $3`,
                [brentPrice, timestamp, existingEntry.rows[0].id]
            );
        } else {
            // Insert
            await db.query(
                `INSERT INTO economic_indicators (indicator_name, value, unit, data_timestamp, source, country_code)
                 VALUES ($1, $2, $3, $4, $5, NULL)`,
                ['BRENT_OIL', brentPrice, 'USD/Barrel', timestamp, 'oilpriceapi.com']
            );
        }
        console.log(`Preis für BRENT_OIL erfolgreich gespeichert/aktualisiert.`);
    } catch (error) {
        console.error('Fehler beim Abrufen des Ölpreises:', error.response?.data?.error?.message || error.message);
    }
};

/**
 * Hauptfunktion, die alle Abrufe bündelt.
 */
const updateAllCommodityPrices = async () => {
    console.log('Starte die Aktualisierung der Wirtschaftsdaten...');
    await fetchAndStoreCurrencyRates();
    await fetchAndStoreOilPrice();
    console.log('Aktualisierung der Wirtschaftsdaten abgeschlossen.');
};

module.exports = { updateAllCommodityPrices };
