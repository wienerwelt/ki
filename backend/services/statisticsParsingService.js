// backend/services/statisticsParsingService.js
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const s3Client = require("../config/s3Client");
const xlsx = require('xlsx');

// Unser intelligentes Übersetzungs-Wörterbuch (Alias Mapping)
// Mappt die formellen Behördennamen auf unsere sauberen Logo-Slugs
const BRAND_ALIASES = {
    'vw-pkw': 'vw',
    'volkswagen': 'vw',
    'bayerische motorenwerke (bmw)': 'bmw',
    'mercedes-benz': 'mercedes',
    'skoda auto': 'skoda',
    'hyundai (korea)': 'hyundai',
    'kia (korea)': 'kia',
    'fiat (fca)': 'fiat',
    // Hier kannst du beliebig viele hinzufügen, wenn Marken fehlen!
};

// Hilfsfunktion: Reinigt den Markennamen und sucht den Alias
const getLogoSlug = (rawName) => {
    if (!rawName) return 'default';
    const cleanName = rawName.toLowerCase().trim();
    
    // 1. Check, ob wir einen exakten Alias haben
    if (BRAND_ALIASES[cleanName]) return BRAND_ALIASES[cleanName];
    
    // 2. Ansonsten: Mach einen Standard-Slug draus (z.B. "Alfa Romeo" -> "alfa-romeo")
    return cleanName
        .replace(/[\s_]+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-');
};

/**
 * Lädt die ODS-Datei aus S3 und extrahiert die Top 10 Listen
 */
/**
 * Lädt die ODS-Datei aus S3 und extrahiert die Top 10 Listen
 */
exports.extractTop10Austria = async (s3Key, monthName) => {
    try {
        console.log(`[Parser] Lade ODS-Datei aus S3: ${s3Key}`);
        
        // 1. Datei aus S3 laden
        const command = new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: s3Key });
        const response = await s3Client.send(command);
        const buffer = await response.Body.transformToByteArray();

        // 2. Excel einlesen
        const workbook = xlsx.read(buffer, { type: 'array' });
        
        // 3. Das richtige Tabellenblatt finden (z.B. "Jänner")
        const sheetName = workbook.SheetNames.find(s => s.toLowerCase().includes(monthName.toLowerCase()));
        if (!sheetName) throw new Error(`Tabellenblatt für Monat "${monthName}" nicht gefunden.`);

        const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null });

        const result = { topMarken: [], topElektro: [] };
        let currentMode = null;

        // 4. Zeile für Zeile durch die Datei gehen
        for (let i = 0; i < sheetData.length; i++) {
            const row = sheetData[i];
            if (!row || !row[0]) continue;

            const firstCell = String(row[0]).trim();
            const cellLower = firstCell.toLowerCase();

            // --- ERKENNE TABELLEN-ÜBERSCHRIFTEN (ROBUST) ---
            // Sucht nach Überschriften, die "Tabelle" und "Marken" enthalten, aber NICHT "Elektro"
            if (cellLower.includes('tabelle') && cellLower.includes('marken') && !cellLower.includes('elektro')) {
                console.log(`[Parser] Tabelle für 'Top Marken' gefunden: ${firstCell}`);
                currentMode = 'marken';
                i += 3; // Überspringe die Header-Zeilen
                continue;
            }
            
            // Sucht nach Überschriften, die "Elektroantrieb" enthalten
            if (cellLower.includes('tabelle') && cellLower.includes('elektroantrieb')) {
                console.log(`[Parser] Tabelle für 'Elektro' gefunden: ${firstCell}`);
                currentMode = 'elektro';
                i += 3; 
                continue;
            }

            // --- LIES DATEN, WENN WIR IN EINER TABELLE SIND ---
            if (currentMode) {
                // Wenn "Insgesamt" kommt oder die Zeile komplett leer ist, ist die Tabelle zu Ende
                if (firstCell.startsWith('Insgesamt') || firstCell === '') {
                    currentMode = null;
                    continue;
                }

                // Wir wollen nur die Top 10
                if (currentMode === 'marken' && result.topMarken.length >= 10) continue;
                if (currentMode === 'elektro' && result.topElektro.length >= 10) continue;

                // Spalte B = Zulassungen, Spalte F (Index 5) = Veränderung Vorjahr
                const zulassungen = parseInt(String(row[1]).replace(/\D/g, ''), 10);
                const aenderung = row[5] !== null ? String(row[5]).trim() : 'n.v.';

                // Überspringe Zeilen, die keine Zahl in der Zulassungs-Spalte haben
                if (isNaN(zulassungen)) continue;

                const dataPoint = {
                    name: firstCell,
                    zulassungen: zulassungen,
                    vergleichVorjahr: aenderung,
                    logo_slug: getLogoSlug(firstCell)
                };

                if (currentMode === 'marken') result.topMarken.push(dataPoint);
                if (currentMode === 'elektro') result.topElektro.push(dataPoint);
            }
        }

        console.log(`[Parser] FERTIG! ${result.topMarken.length} Marken und ${result.topElektro.length} Elektro-Einträge gefunden.`);
        return result;

    } catch (error) {
        console.error('[Parser] Fehler beim Auslesen der Top 10:', error.message);
        throw error;
    }
};