const assert = require('assert/strict');
const { extractAustriaBrandDataFromRows } = require('../services/statisticsParsingService');
const { buildSocialMetrics } = require('../services/socialMediaMetricsService');

const monthNames = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const tableHeader = (title) => [[title], ['Header 1'], ['Header 2'], ['Header 3']];
const currentBrandRows = Array.from({ length: 11 }, (_, index) => {
    const number = index + 1;
    const registrations = number === 1 ? 1000 : number === 2 ? 200 : number === 11 ? 400 : 150 + number;
    const yearOverYear = number === 11 ? '80,0' : number === 2 ? '-10,0' : '5,0';
    return [`Marke ${number}`, registrations, null, null, null, yearOverYear];
});
const electricRows = [
    ['Elektro Eins', 500, null, null, null, '25,0'],
    ['Elektro Zwei', 250, null, null, null, '10,0'],
];
const rows = [
    ...tableHeader('Tabelle: Neuzulassungen nach Marken'),
    ...currentBrandRows,
    ['Insgesamt', 9999],
    ...tableHeader('Tabelle: Neuzulassungen nach Marken und Elektroantrieb'),
    ...electricRows,
    ['Insgesamt', 750],
    ...tableHeader('Tabelle: Neuzulassungen nach Marken kumuliert'),
    ['Kumulativ Falsch', 9999, null, null, null, '999,0'],
    ['Insgesamt', 9999],
];

const parsed = extractAustriaBrandDataFromRows(rows);
assert.equal(parsed.topMarken.length, 11, 'Der Parser muss mehr als die bisherigen Top 10 einlesen.');
assert.equal(parsed.topElektro.length, 2, 'Elektromarken müssen separat vollständig eingelesen werden.');

const previousData = {
    topMarken: parsed.topMarken.map((entry, index) => ({
        ...entry,
        zulassungen: index === 0 ? 900 : index === 1 ? 250 : index === 10 ? 200 : entry.zulassungen,
    })),
    topElektro: parsed.topElektro.map((entry, index) => ({ ...entry, zulassungen: index === 0 ? 400 : 240 })),
};

const metrics = buildSocialMetrics({
    currentData: parsed,
    previousData,
    year: 2026,
    month: 5,
    monthNames,
});

assert.equal(metrics.comparisonBasis, 'previous_month');
assert.equal(metrics.comparisonLabel, 'ggü. April 2026');
assert.equal(metrics.marketLeader.name, 'Marke 1');
assert.ok(Math.abs(metrics.marketLeader.changePercent - 11.1111) < 0.01);
assert.equal(metrics.strongestGrowth.name, 'Marke 11', 'Auch Marken außerhalb der Top 10 müssen ausgewertet werden.');
assert.equal(metrics.strongestGrowth.changePercent, 100);
assert.equal(metrics.strongestDecline.name, 'Marke 2');
assert.equal(metrics.strongestDecline.changePercent, -20);
assert.equal(metrics.topElectricBrand.comparisonLabel, 'ggü. April 2026');
assert.equal(metrics.trendSelectionLabel, 'Einzelmarken · >100 Zul. je Monat');

const januaryMetrics = buildSocialMetrics({
    currentData: parsed,
    previousData,
    year: 2026,
    month: 1,
    monthNames,
});
assert.equal(januaryMetrics.comparisonLabel, 'ggü. Dezember 2025', 'Der Jahreswechsel muss korrekt auf Dezember zurückgehen.');

const fallbackMetrics = buildSocialMetrics({
    currentData: parsed,
    previousData: null,
    year: 2026,
    month: 5,
    monthNames,
});
assert.equal(fallbackMetrics.comparisonBasis, 'same_month_previous_year');
assert.equal(fallbackMetrics.comparisonLabel, 'ggü. Mai 2025');
assert.equal(fallbackMetrics.strongestGrowth.name, 'Marke 11');

console.log('[smoke:social-media-metrics] OK');
