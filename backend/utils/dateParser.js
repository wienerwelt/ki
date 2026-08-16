const { parse } = require('date-fns');
const { de } = require('date-fns/locale');

const parseGermanNumericDate = (value) => {
    const match = String(value || '').match(/(?:^|\D)(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/);
    if (!match) return null;

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

    if (parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day) {
        return null;
    }

    return parsed;
};

const parseDateString = (dateString, dateFormat) => {
    if (!dateString) return null;
    const trimmedDate = String(dateString).trim();

    if (dateFormat) {
        try {
            const parsed = parse(trimmedDate, dateFormat, new Date(), { locale: de });
            if (!Number.isNaN(parsed.getTime())) return parsed;
        } catch (_error) {
            // Weitere bekannte Formate werden unten versucht.
        }
    }

    // Punktgetrennte Datumswerte aus deutschsprachigen Quellen sind immer
    // Tag.Monat.Jahr. `new Date('12.06.2026')` wuerde sie sonst als
    // US-Datum (6. Dezember) interpretieren.
    const parsedGermanDate = parseGermanNumericDate(trimmedDate);
    if (parsedGermanDate) return parsedGermanDate;

    try {
        const parsedRss = parse(trimmedDate, 'EEE, dd MMM yyyy HH:mm:ss xx', new Date(), { locale: de });
        if (!Number.isNaN(parsedRss.getTime())) return parsedRss;
    } catch (_error) {
        // ISO- und RFC-kompatible Werte werden noch nativ versucht.
    }

    const fallbackParsed = new Date(trimmedDate);
    return Number.isNaN(fallbackParsed.getTime()) ? null : fallbackParsed;
};

module.exports = {
    parseDateString,
};
