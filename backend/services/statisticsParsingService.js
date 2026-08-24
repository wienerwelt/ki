const { GetObjectCommand } = require('@aws-sdk/client-s3');
const s3Client = require('../config/s3Client');
const xlsx = require('xlsx');

const BRAND_ALIASES = {
    'vw-pkw': 'vw',
    volkswagen: 'vw',
    'bayerische motorenwerke (bmw)': 'bmw',
    'mercedes-benz': 'mercedes',
    'skoda auto': 'skoda',
    'hyundai (korea)': 'hyundai',
    'kia (korea)': 'kia',
    'fiat (fca)': 'fiat',
};

const getLogoSlug = (rawName) => {
    if (!rawName) return 'default';
    const cleanName = String(rawName).toLowerCase().trim();

    if (BRAND_ALIASES[cleanName]) return BRAND_ALIASES[cleanName];

    return cleanName
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-z0-9-]+/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'default';
};

const parseRegistrationCount = (rawValue) => {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) return Math.trunc(rawValue);
    const parsed = Number.parseInt(String(rawValue ?? '').replace(/\D/g, ''), 10);
    return Number.isFinite(parsed) ? parsed : null;
};

const extractAustriaBrandDataFromRows = (sheetData) => {
    const result = { topMarken: [], topElektro: [] };
    let currentMode = null;
    const seenModes = new Set();

    for (let index = 0; index < sheetData.length; index += 1) {
        const row = sheetData[index];
        if (!Array.isArray(row)) continue;

        const firstCell = String(row[0] ?? '').trim();
        const cellLower = firstCell.toLowerCase();

        if (cellLower.includes('tabelle') && cellLower.includes('marken') && !cellLower.includes('elektro')) {
            if (seenModes.has('marken')) continue;
            seenModes.add('marken');
            currentMode = 'marken';
            index += 3;
            continue;
        }

        if (cellLower.includes('tabelle') && cellLower.includes('elektroantrieb')) {
            if (seenModes.has('elektro')) continue;
            seenModes.add('elektro');
            currentMode = 'elektro';
            index += 3;
            continue;
        }

        if (!currentMode || !firstCell) continue;

        if (cellLower.includes('insgesamt') || cellLower === 'marke/type' || cellLower.startsWith('sonstige pkw')) {
            currentMode = null;
            continue;
        }

        const registrations = parseRegistrationCount(row[1]);
        if (registrations === null) continue;

        const dataPoint = {
            name: firstCell,
            zulassungen: registrations,
            vergleichVorjahr: row[5] !== null && row[5] !== undefined ? String(row[5]).trim() : 'n.v.',
            logo_slug: getLogoSlug(firstCell),
        };

        if (currentMode === 'marken') result.topMarken.push(dataPoint);
        if (currentMode === 'elektro') result.topElektro.push(dataPoint);
    }

    return result;
};

const loadAustriaWorkbook = async (s3Key) => {
    console.log(`[Parser] Lade ODS-Datei aus S3: ${s3Key}`);
    const command = new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: s3Key });
    const response = await s3Client.send(command);
    const buffer = await response.Body.transformToByteArray();
    return xlsx.read(buffer, { type: 'array' });
};

const extractMonthFromWorkbook = (workbook, monthName) => {
    const normalizedMonth = String(monthName || '').toLowerCase();
    const sheetName = workbook.SheetNames.find((name) => name.toLowerCase().includes(normalizedMonth));
    if (!sheetName) throw new Error(`Tabellenblatt für Monat "${monthName}" nicht gefunden.`);

    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null });
    const result = extractAustriaBrandDataFromRows(sheetData);
    console.log(`[Parser] ${monthName}: ${result.topMarken.length} Marken und ${result.topElektro.length} Elektro-Einträge gefunden.`);
    return result;
};

exports.extractAustriaBrandPeriods = async (periods) => {
    const workbookCache = new Map();
    const result = {};

    for (const period of periods) {
        if (!period?.key || !period?.s3Key || !period?.monthName) continue;

        let workbook = workbookCache.get(period.s3Key);
        if (!workbook) {
            workbook = await loadAustriaWorkbook(period.s3Key);
            workbookCache.set(period.s3Key, workbook);
        }

        try {
            result[period.key] = extractMonthFromWorkbook(workbook, period.monthName);
        } catch (error) {
            if (!period.optional) throw error;
            console.warn(`[Parser] Optionaler Zeitraum ${period.monthName} konnte nicht gelesen werden: ${error.message}`);
            result[period.key] = null;
        }
    }

    return result;
};

exports.extractTop10Austria = async (s3Key, monthName) => {
    const periods = await exports.extractAustriaBrandPeriods([{ key: 'current', s3Key, monthName }]);
    return {
        topMarken: periods.current.topMarken.slice(0, 10),
        topElektro: periods.current.topElektro.slice(0, 10),
    };
};

exports.extractAustriaBrandDataFromRows = extractAustriaBrandDataFromRows;
