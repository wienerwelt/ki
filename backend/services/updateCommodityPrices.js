// backend/services/updateCommodityPrices.js
const https = require('https');
const axios = require('axios');
const cheerio = require('cheerio');
const Papa = require('papaparse');
const xlsx = require('xlsx');
const db = require('../config/db');
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3Client = require('../config/s3Client.js');

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



const fetchAndStoreSwap10YRate = async () => {
    try {
        const seriesKey = 'B.U2._X._Z.S1ZV._Z.O._X.WR._X.FL._Z._Z.EUR._Z';
        const url = `https://data-api.ecb.europa.eu/service/data/MMSR/${seriesKey}?lastNObservations=1&detail=dataonly&format=jsondata`;

        const response = await axios.get(url, { headers: { 'Accept': 'application/json' } });

        const dataSet = response.data?.dataSets?.[0];
        if (!dataSet?.series) {
            throw new Error('Keine OIS/SWAP-Datensätze in der EZB-Antwort gefunden.');
        }

        const firstSeriesKey = Object.keys(dataSet.series)[0];
        const series = dataSet.series[firstSeriesKey];
        if (!series?.observations) {
            throw new Error('Keine OIS/SWAP-Beobachtungen in der EZB-Antwort gefunden.');
        }

        const observationKeys = Object.keys(series.observations);
        if (observationKeys.length === 0) {
            throw new Error('Keine neuen OIS/SWAP-Beobachtungen gefunden.');
        }

        const obsIndex = observationKeys[0];
        const value = series.observations[obsIndex][0];

        const timeDim = response.data?.structure?.dimensions?.observation?.find(dim => dim.id === 'TIME_PERIOD');
        const timeObj = timeDim?.values?.[obsIndex];
        const dateStr = timeObj?.id || timeObj?.name; // daily meistens YYYY-MM-DD

        const timestamp = new Date(dateStr);
        if (!dateStr || isNaN(timestamp.getTime())) {
            throw new Error(`Ungültiges Datumsformat von der EZB erhalten: ${dateStr}`);
        }

        await upsertIndicator({
            name: 'SWAP_10Y',
            value: value,
            unit: '%',
            timestamp: timestamp,
            source: 'ecb.europa.eu',
            countryCode: 'EU'
        });

    } catch (error) {
        const errorMessage = error.response ? `Status ${error.response.status}` : error.message;
        throw new Error(`SWAP/OIS 10Y Update fehlgeschlagen: ${errorMessage}`);
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
    if (!OILPRICE_API_KEY) throw new Error('OILPRICE_API_KEY nicht gefunden.');
    
    try {
        // Wir nutzen den Endpoint für EU Carbon Credits (EUR)
        const response = await axios.get('https://api.oilpriceapi.com/v1/prices/latest', {
            headers: { 'Authorization': `Token ${OILPRICE_API_KEY}` },
            params: { by_code: 'EU_CARBON_EUR' }
        });

        if (!response.data?.data?.price) {
            throw new Error("CO2-Preis (EU Carbon) konnte nicht in der API-Antwort gefunden werden.");
        }

        // Timestamp aus der API nehmen oder Fallback auf Jetzt
        const timestamp = response.data.data.updated_at ? new Date(response.data.data.updated_at) : new Date();

        await upsertIndicator({
            name: 'CO2_PRICE',
            value: response.data.data.price,
            unit: 'EUR/tCO2',
            timestamp: timestamp,
            source: 'oilpriceapi.com', // Neue Quelle
            countryCode: 'EU'
        });

    } catch (error) {
        const errorMessage = error.response?.data?.error?.message || error.message;
        throw new Error(`CO2-Preis-Update (OilPriceAPI) fehlgeschlagen: ${errorMessage}`);
    }
};


const upsertStatistic = async (client, statistic) => {
    const {
        country_code, statistic_type, statistic_subtype, time_period,
        value, unit, source_name, source_url, archive_path // <-- NEU
    } = statistic;

    const existing = await client.query(
        `SELECT id FROM economic_statistics WHERE
         country_code = $1 AND statistic_type = $2 AND statistic_subtype = $3 AND time_period = $4`,
        [country_code, statistic_type, statistic_subtype, time_period]
    );

    if (existing.rows.length > 0) {
        await client.query(
            `UPDATE economic_statistics 
             SET value = $1, 
                 source_url = $2, 
                 source_name = $3, 
                 archive_path = COALESCE($4, archive_path), -- Behält alten Pfad, falls leer
                 last_updated = NOW() 
             WHERE id = $5`,
            [value, source_url, source_name, archive_path, existing.rows[0].id]
        );
    } else {
        await client.query(
            `INSERT INTO economic_statistics (
                country_code, statistic_type, statistic_subtype, time_period, time_period_granularity,
                value, unit, source_name, source_url, archive_path
            ) VALUES ($1, $2, $3, $4, 'monthly', $5, $6, $7, $8, $9)`,
            [country_code, statistic_type, statistic_subtype, time_period, value, unit, source_name, source_url, archive_path]
        );
    }
};


const fetchAndStoreCarRegistrationsDE = async () => {
    console.log('[data-update] Starte Abruf der KFZ-Neuzulassungen für Deutschland (KBA FZ8)...');

    const client = await db.connect();
    const today = new Date();
    
    // Wir probieren bis zu 2 Monate rückwirkend, falls das KBA spät dran ist
    const monthsToTry = [1, 2]; 
    let excelResponse = null;
    let successfulYear = null;
    let successfulMonth = null;
    let successfulUrl = null;

    for (const monthOffset of monthsToTry) {
        const targetDate = new Date(today.getFullYear(), today.getMonth() - monthOffset, 1);
        const year = targetDate.getFullYear();
        const month = (targetDate.getMonth() + 1).toString().padStart(2, '0');

        // NEUES URL-SCHEMA FÜR DIE FZ8 EXCEL DATEI
        const excelUrl = `https://www.kba.de/SharedDocs/Downloads/DE/Statistik/Fahrzeuge/FZ8/fz8_${year}${month}.xlsx?__blob=publicationFile`;
        console.log(`[data-update] Versuche KBA-URL: ${excelUrl}`);

        try {

            excelResponse = await axios.get(excelUrl, { 
                responseType: 'arraybuffer',
                timeout: 60000, // Gibt dem Server großzügige 60 Sekunden Zeit
                httpsAgent: new https.Agent({ keepAlive: true }), // Verhindert, dass der Socket zu früh schließt
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive'
                }
            });
            
            successfulYear = year;
            successfulMonth = month;
            successfulUrl = excelUrl;
            console.log(`[data-update] KBA-Datei für ${year}-${month} erfolgreich gefunden!`);
            break; // Erfolgreich gefunden, Schleife abbrechen
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                console.warn(`[data-update] KBA-Daten für ${year}-${month} noch nicht verfügbar (404).`);
            } else {
                console.error(`[data-update] Unerwarteter Fehler beim KBA-Abruf (${year}-${month}):`, error.message);
            }
        }
    }

    if (!excelResponse) {
        console.warn(`[data-update] KBA-Abbruch: Keine neuen FZ8-Daten für die letzten Monate gefunden.`);
        client.release();
        return;
    }

    try {
        let s3ArchivePath = null;
        try {
            const fileName = `DE_KBA_Neuzulassungen_FZ8_${successfulYear}_${successfulMonth}_${Date.now()}.xlsx`;
            s3ArchivePath = `system-archive/kba/${fileName}`;
            
            await s3Client.send(new PutObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME,
                Key: s3ArchivePath,
                Body: excelResponse.data,
                ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }));
            console.log(`[data-update] KBA Excel in S3 archiviert: ${s3ArchivePath}`);
        } catch (s3Err) {
            console.error(`[data-update] Fehler beim S3-Archivieren (KBA):`, s3Err.message);
        }

        // Excel parsen
        const workbook = xlsx.read(excelResponse.data, { type: 'array' });
        
        // Zwingend das Blatt FZ 8.4 suchen (Kraftstoffe), ansonsten Abbruch
        const targetSheetName = workbook.SheetNames.find(name => name.includes('FZ 8.4'));
        if (!targetSheetName) {
            throw new Error('Das Tabellenblatt "FZ 8.4" (Kraftstoffarten) wurde in der Excel-Datei nicht gefunden.');
        }

        const worksheet = workbook.Sheets[targetSheetName];
        const sheetData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null });

        // Datum für die Datenbank aufbauen
        const monthIndex = parseInt(successfulMonth, 10) - 1;
        const time_period = new Date(Date.UTC(successfulYear, monthIndex + 1, 0));

        let currentBlock = null; // Speichert, ob wir gerade Zeilen für 'Benzin' oder 'Diesel' scannen
        let parsedTotals = {};   // Zwischenspeicher für die gelesenen Werte

        // Zeile für Zeile durch die FZ 8.4 scannen
        for (const row of sheetData) {
            if (!row) continue;

            const colB = String(row[1] || '').trim(); // Spalte B: Kraftstoffart
            const colC = String(row[2] || '').trim(); // Spalte C: CO2-Emission bzw. "Zusammen"
            const colE = row[4];                      // Spalte E: Wert für aktuellen Monat

            if (colE === null || colE === undefined) continue;

            // 1. Direkte Treffer in derselben Zeile (Elektro, Hybrid, Plug-in)
            if (colB === 'Elektro (BEV)') {
                parsedTotals['Elektro'] = parseInt(String(colE).replace(/\D/g, ''), 10);
            }
            else if (colB === 'Hybrid') {
                parsedTotals['Hybrid-Total'] = parseInt(String(colE).replace(/\D/g, ''), 10);
            }
            else if (colB.includes('Plug-in')) {
                parsedTotals['Plug-in-Hybrid'] = parseInt(String(colE).replace(/\D/g, ''), 10);
            }

            // 2. Block-Tracking für Benzin & Diesel initiieren
            if (colB === 'Benzin') currentBlock = 'Benzin';
            if (colB === 'Diesel') currentBlock = 'Diesel';
            // Sobald wir "Benzin und Diesel zusammen" erreichen, beenden wir das Tracking
            if (colB.includes('Benzin und Diesel zusammen')) currentBlock = null;

            // 3. Gesamtsumme für den aktuellen Block finden ("Zusammen" in Spalte C)
            if (colC === 'Zusammen' && currentBlock) {
                parsedTotals[currentBlock] = parseInt(String(colE).replace(/\D/g, ''), 10);
                currentBlock = null; // Block resetten, da wir die Summe haben
            }
        }

        // Mathematik für Hybride (Gesamthybrid - Plug-in)
        const hybridOhnePlugIn = Math.max(0, (parsedTotals['Hybrid-Total'] || 0) - (parsedTotals['Plug-in-Hybrid'] || 0));
        if (hybridOhnePlugIn > 0) {
            parsedTotals['Hybrid (ohne Plug-in)'] = hybridOhnePlugIn;
        }

        await client.query('BEGIN');
        let upsertCount = 0;

        // Die ermittelten Werte in die Datenbank schreiben
        const finalTypesToSave = ['Elektro', 'Plug-in-Hybrid', 'Hybrid (ohne Plug-in)', 'Benzin', 'Diesel'];
        
        for (const dbName of finalTypesToSave) {
            const value = parsedTotals[dbName];
            if (value === undefined || isNaN(value)) continue;

            const statistic = {
                country_code: 'DE',
                statistic_type: 'fleet_statistics',
                statistic_subtype: dbName,
                time_period: time_period,
                value: value,
                unit: 'Stück',
                source_name: 'Kraftfahrt-Bundesamt (KBA)',
                archive_path: s3ArchivePath,
                source_url: successfulUrl
            };

            await upsertStatistic(client, statistic);
            upsertCount++;
        }

        await client.query('COMMIT');
        console.log(`[data-update] ${upsertCount} Einträge für KFZ-Neuzulassungen (DE) für ${successfulYear}-${successfulMonth} erfolgreich gespeichert/aktualisiert.`);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`[data-update] Fehler beim Verarbeiten der KBA-Excel für ${successfulYear}-${successfulMonth}:`, error);
        throw new Error(`Update der KFZ-Neuzulassungen (DE) fehlgeschlagen: ${error.message}`);
    } finally {
        client.release();
    }
};



const fetchAndStoreCarRegistrations = async () => {
    console.log('[data-update] Starte Abruf der KFZ-Neuzulassungen für Österreich (Statistik Austria ODS)...');
    
    const client = await db.connect();
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0 = Jänner, 1 = Februar, 2 = März
    
    const monthNames = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    const urlMonthNames = ["Jaenner", "Februar", "Maerz", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    
    const filesToFetch = [
        { year: currentYear - 1, monthIndex: 11 }
    ];
    
    if (currentMonth > 0) {
        filesToFetch.push({ year: currentYear, monthIndex: currentMonth - 1 });
    }

    let totalUpsertCount = 0;

    for (const fileInfo of filesToFetch) {
        const targetYear = fileInfo.year;
        const startMonthIndex = fileInfo.monthIndex;

        let fileData = null;
        let successfulUrl = "";
        let actualMonthIndex = startMonthIndex;
        let s3ArchivePath = null;

        console.log(`[data-update] Suche aktuellste ODS-Datei für das Jahr ${targetYear} (Start ab Index ${startMonthIndex})...`);

        for (let m = startMonthIndex; m >= 0; m--) {
            const endMonthNameUrl = urlMonthNames[m];
            
            let urlsToTry = [
                `https://www.statistik.at/fileadmin/pages/77/NeuzulassungenFahrzeugeJaennerBis${endMonthNameUrl}${targetYear}.ods`,
                `https://www.statistik.at/fileadmin/pages/77/NeuzulassungenFahrzeuge${endMonthNameUrl}${targetYear}.ods`
            ];

            for (let i = 1; i <= 5; i++) {
                urlsToTry.push(`https://www.statistik.at/fileadmin/pages/77/DE${i}_NeuzulassungenFahrzeugeJaennerBis${endMonthNameUrl}${targetYear}.ods`);
                urlsToTry.push(`https://www.statistik.at/fileadmin/pages/77/DE${i}_NeuzulassungenFahrzeuge${endMonthNameUrl}${targetYear}.ods`);
            }

            for (const url of urlsToTry) {
                try {
                    console.log(`[data-update] Versuche URL: ${url}`);
                    const response = await axios.get(url, { responseType: 'arraybuffer' });
                    fileData = new Uint8Array(response.data);
                    successfulUrl = url;
                    actualMonthIndex = m; 
                    console.log(`[data-update] Datei erfolgreich gefunden!`);

                    // --- S3 Upload ---
                    try {
                        const displayMonth = String(actualMonthIndex + 1).padStart(2, '0');
                        const fileName = `AT_Statistik_Neuzulassungen_${targetYear}_${displayMonth}_${Date.now()}.ods`;
                        s3ArchivePath = `system-archive/statistik_at/${fileName}`;
                        
                        await s3Client.send(new PutObjectCommand({
                            Bucket: process.env.AWS_S3_BUCKET_NAME,
                            Key: s3ArchivePath,
                            Body: response.data,
                            ContentType: 'application/vnd.oasis.opendocument.spreadsheet'
                        }));
                        console.log(`[data-update] Statistik AT Rohdatei in S3 archiviert: ${s3ArchivePath}`);
                    } catch (s3Err) {
                        console.error(`[data-update] Fehler beim S3-Archivieren (AT):`, s3Err.message);
                    }
                    
                    break; 
                } catch (err) {
                    continue; 
                }
            }

            if (fileData) break; 
        }

        if (!fileData) {
            console.warn(`[data-update] Konnte ODS-Datei für ${targetYear} unter keiner URL finden. Wird übersprungen.`);
            continue;
        }

        try {
            const workbook = xlsx.read(fileData, { type: 'array' });
            await client.query('BEGIN');

            for (const sheetName of workbook.SheetNames) {
                const sheetClean = sheetName.trim().toLowerCase();
                const monthIndex = monthNames.findIndex(m => sheetClean.includes(m.toLowerCase()));
                
                if (monthIndex === -1) {
                    console.log(`[data-update] Überspringe Blatt "${sheetName}" (Kein Monat erkannt).`);
                    continue;
                }

                const time_period = new Date(Date.UTC(targetYear, monthIndex + 1, 0));
                console.log(`[data-update] Verarbeite Daten für ${time_period.toISOString().split('T')[0]}...`);

                const worksheet = workbook.Sheets[sheetName];
                const sheetData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null });
                
                const monthlyTotals = {};
                const foundFlags = {};

                // --- NEU: Temporäre Variablen für die Hybrid-Mathematik ---
                let totalHybridBenzin = 0;
                let totalHybridDiesel = 0;
                let pluginBenzin = 0;
                let pluginDiesel = 0;

                for (const row of sheetData) {
                    if (!row || !row[0] || row[1] === null) continue;

                    const driveTypeRaw = String(row[0]).trim();
                    const registrationCount = parseInt(String(row[1]).replace(/\D/g, ''), 10);

                    if (!driveTypeRaw || isNaN(registrationCount)) continue;

                    if (driveTypeRaw.startsWith('darunter Benzin/Elektro (hybrid) – Plug-In') && !foundFlags['plug-in-benzin']) {
                        pluginBenzin = registrationCount; // Wert für spätere Berechnung merken
                        monthlyTotals['Plug-in-Hybrid'] = (monthlyTotals['Plug-in-Hybrid'] || 0) + registrationCount;
                        foundFlags['plug-in-benzin'] = true;
                    } else if (driveTypeRaw.startsWith('darunter Diesel/Elektro (hybrid) – Plug-In') && !foundFlags['plug-in-diesel']) {
                        pluginDiesel = registrationCount; // Wert für spätere Berechnung merken
                        monthlyTotals['Plug-in-Hybrid'] = (monthlyTotals['Plug-in-Hybrid'] || 0) + registrationCount;
                        foundFlags['plug-in-diesel'] = true;
                    } else if (driveTypeRaw.startsWith('Benzin/Elektro (hybrid)') && !foundFlags['hybrid-benzin']) {
                        totalHybridBenzin = registrationCount; // ACHTUNG: Hier nur den Basiswert merken, nicht direkt speichern!
                        foundFlags['hybrid-benzin'] = true;
                    } else if (driveTypeRaw.startsWith('Diesel/Elektro (hybrid)') && !foundFlags['hybrid-diesel']) {
                        totalHybridDiesel = registrationCount; // ACHTUNG: Hier nur den Basiswert merken, nicht direkt speichern!
                        foundFlags['hybrid-diesel'] = true;
                    } else if (['Benzin', 'Diesel', 'Elektro'].includes(driveTypeRaw)) {
                        if (!foundFlags[driveTypeRaw]) {
                            monthlyTotals[driveTypeRaw] = registrationCount;
                            foundFlags[driveTypeRaw] = true;
                        }
                    }
                }
                
                // --- NEU: NACH der Schleife die echten Hybrid-Werte (ohne Plug-in) berechnen ---
                const echteHybridBenzin = Math.max(0, totalHybridBenzin - pluginBenzin);
                const echteHybridDiesel = Math.max(0, totalHybridDiesel - pluginDiesel);
                
                // Nur ins Objekt schreiben, wenn überhaupt Hybrid-Zulassungen da waren
                if (totalHybridBenzin > 0 || totalHybridDiesel > 0) {
                    monthlyTotals['Hybrid (ohne Plug-in)'] = echteHybridBenzin + echteHybridDiesel;
                }

                for (const driveType in monthlyTotals) {
                    const statistic = {
                        country_code: 'AT',
                        statistic_type: 'fleet_statistics',
                        statistic_subtype: driveType,
                        time_period: time_period,
                        value: monthlyTotals[driveType],
                        unit: 'Stück',
                        source_name: 'Statistik Austria',
                        source_url: successfulUrl,
                        archive_path: s3ArchivePath 
                    };
                    
                    await upsertStatistic(client, statistic);
                    totalUpsertCount++;
                }
            }
            
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`[data-update] Fehler beim Verarbeiten der ODS-Datei für ${targetYear}:`, error.message);
            throw error; 
        }
    }

    console.log(`[data-update] FERTIG! Insgesamt ${totalUpsertCount} Einträge für KFZ-Neuzulassungen (AT) aktualisiert.`);
    client.release();
};


// Euribor-Funktion (fetchAndStoreEuriborRate) 
const updateDailyIndicators = async () => {
    console.log('[data-update] Starte die Aktualisierung der TÄGLICHEN Wirtschaftsdaten...');
    const results = await Promise.allSettled([
        fetchAndStoreCurrencyRates(),
        fetchAndStoreOilPrice(),
        fetchAndStoreSwap10YRate(),
        fetchAndStoreCO2Price(),
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


module.exports = { 
    updateDailyIndicators, 
    updateMonthlyIndicators 
};