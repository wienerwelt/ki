// backend/services/updateCommodityPrices.js
const axios = require('axios');
const cheerio = require('cheerio');
const Papa = require('papaparse');
const xlsx = require('xlsx');
const db = require('../config/db');

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


/**
 * === KORRIGIERTE FUNKTION ===
 * Zurück auf MONATLICHE Daten (FM.M...), da der tägliche Endpunkt (FM.D...) 
 * einen 404-Fehler verursacht.
 */
const fetchAndStoreEuriborRate = async () => {
    try {
        // Stabile, monatliche API der EZB
        const url = `https://data-api.ecb.europa.eu/service/data/FM/M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA?lastNObservations=1&detail=dataonly&format=jsondata`;
        
        const response = await axios.get(url, { headers: { 'Accept': 'application/json' } });

        const dataSet = response.data?.dataSets?.[0];
        if (!dataSet || !dataSet.series) {
            throw new Error('Keine Euribor-Datensätze in der EZB-Antwort gefunden.');
        }

        const seriesKey = Object.keys(dataSet.series)[0];
        const series = dataSet.series[seriesKey];

        if (!series || !series.observations) {
            throw new Error('Keine Euribor-Beobachtungen in der EZB-Antwort gefunden.');
        }

        const observationKeys = Object.keys(series.observations);
        if (observationKeys.length === 0) {
            throw new Error('Keine neuen Euribor-Beobachtungen gefunden.');
        }
        
        const lastObservationIndex = observationKeys[0];
        const lastObservationValue = series.observations[lastObservationIndex][0];

        const dateDimension = response.data.structure.dimensions.observation.find(dim => dim.id === 'TIME_PERIOD');
        // KORREKTUR: Wir verwenden .name (z.B. "2025-08") für monatliche Daten
        const lastDateStr = dateDimension.values[lastObservationIndex].name; 

        // KORREKTUR: Parsen des Monatsdatums (z.B. "2025-08")
        const [year, month] = lastDateStr.split('-').map(Number);
        // Wir setzen den Timestamp auf den letzten Tag des Monats (UTC)
        const timestamp = new Date(Date.UTC(year, month, 0)); 

        if (isNaN(timestamp.getTime())) {
            throw new Error(`Ungültiges Datumsformat von der EZB erhalten: ${lastDateStr}`);
        }

        await upsertIndicator({
            name: 'EURIBOR_3M',
            value: lastObservationValue,
            unit: '%',
            timestamp: timestamp, // Monats-Timestamp
            source: 'ecb.europa.eu'
        });

    } catch (error) {
        const errorMessage = error.response ? `Status ${error.response.status}` : error.message;
        throw new Error(`Euribor-Update (monatlich) fehlgeschlagen: ${errorMessage}`);
    }
};


const fetchAndStoreKVLPI = async () => {
    try {
        const url = 'https://www.statistik.at/statistiken/volkswirtschaft-und-oeffentliche-finanzen/preise-und-preisindizes/kraftfahrzeughaftpflicht-versicherungsleistungspreisindex-kvlpi';
        
        const { data: html } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });

        const $ = cheerio.load(html);

        const headlineSpan = $('span').filter(function() {
            return $(this).text().trim() === 'KVLPI gesamt';
        });

        if (headlineSpan.length === 0) {
            throw new Error('Der "KVLPI gesamt" Indikator-Block konnte auf der Webseite nicht gefunden werden.');
        }

        const indicatorBlock = headlineSpan.closest('.key-indicators__item');

        if (indicatorBlock.length === 0) {
            throw new Error('Der übergeordnete Container für den KVLPI-Indikator wurde nicht gefunden.');
        }

        const valueStr = indicatorBlock.find('.key-indicator__value').text().trim();
        const dateStr = indicatorBlock.find('.key-indicator__year').text().trim();

        const value = parseFloat(valueStr.replace(',', '.'));

        const monthMap = {
            'Jänner': 0, 'Februar': 1, 'März': 2, 'April': 3, 'Mai': 4, 'Juni': 5,
            'Juli': 6, 'August': 7, 'September': 8, 'Oktober': 9, 'November': 10, 'Dezember': 11
        };
        const [monthName, yearStr] = dateStr.split(' ');
        const monthIndex = monthMap[monthName]; // 0-basiert (z.B. Jänner = 0)
        const year = parseInt(yearStr, 10);


        if (monthIndex === undefined || isNaN(year)) {
             throw new Error(`Datum "${dateStr}" konnte nicht verarbeitet werden.`);
        }
        
        // Letzten Tag des Monats (UTC) ermitteln
        const timestamp = new Date(Date.UTC(year, monthIndex + 1, 0));

        if (isNaN(value)) {
            throw new Error(`Gelesener KVLPI-Wert "${valueStr}" ist keine gültige Zahl.`);
        }

        await upsertIndicator({
            name: 'KVLPI_GESAMT',
            value: value,
            unit: 'Index (Statistik.at)',
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

        const { data: html } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(html);

        const priceStr = $('#p').text().trim();
        const unitStr = $('#unit').text().trim();

        const price = parseFloat(priceStr);

        if (isNaN(price)) {
            throw new Error(`Gelesener CO2-Preis "${priceStr}" von TradingEconomics ist keine gültige Zahl.`);
        }

        await upsertIndicator({
            name: 'CO2_PRICE',
            value: price,
            unit: unitStr || 'EUR/tCO2',
            timestamp: new Date(),
            source: 'tradingeconomics.com',
            countryCode: null
        });

    } catch (error) {
        throw new Error(`CO2-Preis-Update von TradingEconomics fehlgeschlagen: ${error.message}`);
    }
};


// Die 'upsertStatistic' Funktion bleibt unverändert
const upsertStatistic = async (client, statistic) => {
    const {
        country_code, statistic_type, statistic_subtype, time_period,
        value, unit, source_name, source_url
    } = statistic;

    const existing = await client.query(
        `SELECT id FROM economic_statistics WHERE
         country_code = $1 AND statistic_type = $2 AND statistic_subtype = $3 AND time_period = $4`,
        [country_code, statistic_type, statistic_subtype, time_period]
    );

    if (existing.rows.length > 0) {
        await client.query(
            `UPDATE economic_statistics SET value = $1, last_updated = NOW() WHERE id = $2`,
            [value, existing.rows[0].id]
        );
    } else {
        await client.query(
            `INSERT INTO economic_statistics (
                country_code, statistic_type, statistic_subtype, time_period, time_period_granularity,
                value, unit, source_name, source_url
            ) VALUES ($1, $2, $3, $4, 'monthly', $5, $6, $7, $8)`,
            [country_code, statistic_type, statistic_subtype, time_period, value, unit, source_name, source_url]
        );
    }
};


const fetchAndStoreCarRegistrationsDE = async () => {
    console.log('[data-update] Starte Abruf der KFZ-Neuzulassungen für Deutschland (KBA)...');

    const today = new Date();
    const targetDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const year = targetDate.getFullYear();
    const month = (targetDate.getMonth() + 1).toString().padStart(2, '0');

    const csvUrl = `https://www.kba.de/DE/Statistik/Fahrzeuge/Umwelt/Diagramme/Monatliche_NZL/${year}${month}_NZL_Pkw_KREN_csv.html?nn=852372&view=kbawebdiagramcsvexport`;
    console.log(`[data-update] Dynamisch erstellte KBA-URL: ${csvUrl}`);

    const client = await db.connect();

    try {
        const csvResponse = await axios.get(csvUrl, { responseType: 'arraybuffer' });
        const csvData = new TextDecoder('windows-1252').decode(csvResponse.data);

        const parsedData = Papa.parse(csvData, {
            header: true,
            skipEmptyLines: true,
            delimiter: ';',
        });

        let upsertCount = 0;
        await client.query('BEGIN');

        const parseMonth = (monthStr) => {
            if (!monthStr || typeof monthStr !== 'string') return null;
            const parts = monthStr.split('. ');
            if (parts.length !== 2) return null;

            const [mon, yearPart] = parts;
            const monthMap = { 'Jan': 0, 'Feb': 1, 'Mär': 2, 'Apr': 3, 'Mai': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Okt': 9, 'Nov': 10, 'Dez': 11 };
            const monthIndex = monthMap[mon];
            const fullYear = parseInt(`20${yearPart}`, 10);

            if (monthIndex === undefined || isNaN(fullYear)) return null;

            // Erstellt ein Datum für den LETZTEN Tag des Monats in UTC
            return new Date(Date.UTC(fullYear, monthIndex + 1, 0));
        };

        for (const row of parsedData.data) {
            const monthString = row['Berichtsmonat'];
            const time_period = parseMonth(monthString);

            if (!time_period) {
                console.warn(`[data-update] Konnte Datum nicht parsen: "${monthString}". Überspringe Zeile.`);
                continue;
            }

            for (const driveType in row) {
                if (driveType === 'Berichtsmonat' || !row[driveType]) continue;

                const registrationCount = parseInt(row[driveType], 10);
                if (isNaN(registrationCount)) continue;

                const statistic = {
                    country_code: 'DE',
                    statistic_type: 'fleet_statistics',
                    statistic_subtype: driveType,
                    time_period: time_period,
                    value: registrationCount,
                    unit: 'Stück',
                    source_name: 'Kraftfahrt-Bundesamt (KBA)',
                    source_url: 'https://www.kba.de/'
                };

                await upsertStatistic(client, statistic);
                upsertCount++;
            }
        }

        await client.query('COMMIT');
        console.log(`[data-update] ${upsertCount} Einträge für KFZ-Neuzulassungen (DE) erfolgreich gespeichert/aktualisiert.`);

    } catch (error) {
        await client.query('ROLLBACK');
        if (axios.isAxiosError(error) && error.response?.status === 404) {
            console.warn(`[data-update] KBA-Daten für ${year}-${month} noch nicht verfügbar (404). Überspringe...`);
            return;
        }
        console.error(`[data-update] Fehler beim Verarbeiten der KBA-Daten für ${year}-${month}:`, error);
        throw new Error(`Update der KFZ-Neuzulassungen (DE) fehlgeschlagen: ${error.message}`);
    } finally {
        client.release();
    }
};



const fetchAndStoreCarRegistrations = async () => {
    console.log('[data-update] Starte Abruf der KFZ-Neuzulassungen für Österreich (Statistik Austria ODS)...');
    
    const monthNames = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    const today = new Date();
    const year = today.getFullYear();
    const endMonthName = monthNames[new Date(today.getFullYear(), today.getMonth() - 1, 1).getMonth()];
    
    const odsUrl = `https://www.statistik.at/fileadmin/pages/77/NeuzulassungenFahrzeugeJaennerBis${endMonthName}${year}.ods`;
    console.log(`[data-update] Dynamisch erstellte ODS-URL: ${odsUrl}`);

    const client = await db.connect();

    try {
        const response = await axios.get(odsUrl, { responseType: 'arraybuffer' });
        const fileData = new Uint8Array(response.data);
        const workbook = xlsx.read(fileData, { type: 'array' });

        await client.query('BEGIN');
        let totalUpsertCount = 0;

        for (const sheetName of workbook.SheetNames) {
            const monthIndex = monthNames.findIndex(m => m.toLowerCase() === sheetName.trim().toLowerCase());
            if (monthIndex === -1) {
                console.log(`[data-update] Überspringe Tabellenblatt "${sheetName}", da es keinem Monat zugeordnet werden kann.`);
                continue;
            }

            // Erstellt ein timezone-sicheres Datum für den LETZTEN Tag des Monats.
            const time_period = new Date(Date.UTC(year, monthIndex + 1, 0));
            console.log(`[data-update] Verarbeite Tabellenblatt "${sheetName}" für den Zeitraum ${time_period.toISOString().split('T')[0]}`);

            const worksheet = workbook.Sheets[sheetName];
            const sheetData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null });
            
            const monthlyTotals = {};
            const foundFlags = {};

            for (const row of sheetData) {
                if (!row || !row[0] || row[1] === null) continue;

                const driveTypeRaw = String(row[0]).trim();
                const registrationCount = parseInt(String(row[1]).replace(/\D/g, ''), 10);

                if (!driveTypeRaw || isNaN(registrationCount)) continue;

                if (driveTypeRaw.startsWith('darunter Benzin/Elektro (hybrid) – Plug-In') && !foundFlags['plug-in-benzin']) {
                    monthlyTotals['Plug-in-Hybrid'] = (monthlyTotals['Plug-in-Hybrid'] || 0) + registrationCount;
                    foundFlags['plug-in-benzin'] = true;
                } else if (driveTypeRaw.startsWith('darunter Diesel/Elektro (hybrid) – Plug-In') && !foundFlags['plug-in-diesel']) {
                    monthlyTotals['Plug-in-Hybrid'] = (monthlyTotals['Plug-in-Hybrid'] || 0) + registrationCount;
                    foundFlags['plug-in-diesel'] = true;
                } else if (driveTypeRaw.startsWith('Benzin/Elektro (hybrid)') && !foundFlags['hybrid-benzin']) {
                    monthlyTotals['Hybrid (ohne Plug-in)'] = (monthlyTotals['Hybrid (ohne Plug-in)'] || 0) + registrationCount;
                    foundFlags['hybrid-benzin'] = true;
                } else if (driveTypeRaw.startsWith('Diesel/Elektro (hybrid)') && !foundFlags['hybrid-diesel']) {
                    monthlyTotals['Hybrid (ohne Plug-in)'] = (monthlyTotals['Hybrid (ohne Plug-in)'] || 0) + registrationCount;
                    foundFlags['hybrid-diesel'] = true;
                } else if (['Benzin', 'Diesel', 'Elektro'].includes(driveTypeRaw)) {
                    if (!foundFlags[driveTypeRaw]) {
                        monthlyTotals[driveTypeRaw] = registrationCount;
                        foundFlags[driveTypeRaw] = true;
                    }
                }
            }
            
            let currentMonthUpsertCount = 0;
            for (const driveType in monthlyTotals) {
                const statistic = {
                    country_code: 'AT',
                    statistic_type: 'fleet_statistics',
                    statistic_subtype: driveType,
                    time_period: time_period,
                    value: monthlyTotals[driveType],
                    unit: 'Stück',
                    source_name: 'Statistik Austria',
                    source_url: 'https://www.statistik.at/statistiken/tourismus-und-verkehr/fahrzeuge/kfz-neuzulassungen'
                };
                
                await upsertStatistic(client, statistic);
                currentMonthUpsertCount++;
            }
            totalUpsertCount += currentMonthUpsertCount;
        }
        
        await client.query('COMMIT');
        console.log(`[data-update] Insgesamt ${totalUpsertCount} Einträge für KFZ-Neuzulassungen (AT ODS) erfolgreich gespeichert/aktualisiert.`);

    } catch (error) {
        await client.query('ROLLBACK');
        if (axios.isAxiosError(error) && error.response?.status === 404) {
            console.warn(`[data-update] Statistik Austria ODS-Datei für ${endMonthName} ${year} noch nicht verfügbar (404). Überspringe...`);
            return;
        }
        throw new Error(`Update der KFZ-Neuzulassungen (AT ODS) fehlgeschlagen: ${error.message}`);
    } finally {
        client.release();
    }
};


// KORREKTUR: Euribor-Funktion (fetchAndStoreEuriborRate) 
//            wurde aus den täglichen Jobs entfernt.
const updateDailyIndicators = async () => {
    console.log('[data-update] Starte die Aktualisierung der TÄGLICHEN Wirtschaftsdaten...');
    const results = await Promise.allSettled([
        fetchAndStoreCurrencyRates(),
        fetchAndStoreOilPrice(),
        // fetchAndStoreCO2Price(),
        // fetchAndStoreEuriborRate(), // Entfernt
    ]);

    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length > 0) {
        failures.forEach(failure => console.error('[data-update] Ein täglicher Sub-Job ist fehlgeschlagen:', failure.reason.message));
        throw new Error('Mindestens ein täglicher Update-Job ist fehlgeschlagen.');
    }
    console.log('[data-update] Aktualisierung der täglichen Wirtschaftsdaten erfolgreich abgeschlossen.');
};

const updateMonthlyIndicators = async () => {
    console.log('[data-update] Starte die Aktualisierung der MONATLICHEN Wirtschaftsdaten...');
    const results = await Promise.allSettled([
        fetchAndStoreKVLPI(),
        fetchAndStoreEuriborRate(),
        fetchAndStoreCarRegistrations(),
        fetchAndStoreCarRegistrationsDE(),
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