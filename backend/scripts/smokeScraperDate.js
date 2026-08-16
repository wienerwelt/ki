const { parseDateString } = require('../utils/dateParser');

const isoDay = (date) => date ? date.toISOString().slice(0, 10) : null;

function run() {
    const cases = [
        { value: '12.06.2026', format: null, expected: '2026-06-12' },
        { value: '6.12.2026', format: null, expected: '2026-12-06' },
        { value: '12.6.2026', format: 'd.M.yyyy', expected: '2026-06-12' },
        { value: 'Stand: 12.06.2026', format: null, expected: '2026-06-12' },
        { value: '31.02.2026', format: null, expected: null },
    ];

    const results = cases.map((testCase) => ({
        ...testCase,
        actual: isoDay(parseDateString(testCase.value, testCase.format)),
    }));
    const ok = results.every((result) => result.actual === result.expected);

    console.log(JSON.stringify({ ok, results }, null, 2));
    if (!ok) process.exitCode = 1;
}

try {
    run();
} catch (error) {
    console.error('[smoke:scraper-date] fehlgeschlagen:', error.message);
    process.exitCode = 1;
}
