const db = require('../config/db');
const { extractAustriaBrandPeriods } = require('../services/statisticsParsingService');
const { buildSocialMetrics, getPreviousPeriod } = require('../services/socialMediaMetricsService');

const monthNames = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const getArchive = async (year, month) => {
    const { rows } = await db.query(
        `SELECT archive_path
         FROM economic_statistics
         WHERE country_code = 'AT'
           AND statistic_type = 'fleet_statistics'
           AND archive_path IS NOT NULL
           AND time_period >= make_date($1::int, $2::int, 1)
           AND time_period < make_date($1::int, $2::int, 1) + interval '1 month'
         ORDER BY last_updated DESC
         LIMIT 1`,
        [year, month]
    );
    return rows[0]?.archive_path || null;
};

const run = async () => {
    const { rows } = await db.query(
        `SELECT EXTRACT(YEAR FROM time_period)::int AS year,
                EXTRACT(MONTH FROM time_period)::int AS month,
                archive_path
         FROM economic_statistics
         WHERE country_code = 'AT'
           AND statistic_type = 'fleet_statistics'
           AND archive_path IS NOT NULL
         ORDER BY time_period DESC, last_updated DESC
         LIMIT 1`
    );
    if (!rows[0]) throw new Error('Kein österreichisches Statistikarchiv gefunden.');

    const current = rows[0];
    const previousPeriod = getPreviousPeriod(Number(current.year), Number(current.month));
    const previousArchive = await getArchive(previousPeriod.year, previousPeriod.month);
    const periods = [{
        key: 'current',
        s3Key: current.archive_path,
        monthName: monthNames[Number(current.month) - 1],
    }];
    if (previousArchive) {
        periods.push({
            key: 'previous',
            s3Key: previousArchive,
            monthName: monthNames[previousPeriod.month - 1],
            optional: true,
        });
    }

    const data = await extractAustriaBrandPeriods(periods);
    const metrics = buildSocialMetrics({
        currentData: data.current,
        previousData: data.previous,
        year: Number(current.year),
        month: Number(current.month),
        monthNames,
    });

    console.log(JSON.stringify({
        period: `${current.year}-${String(current.month).padStart(2, '0')}`,
        brands: data.current.topMarken.length,
        electricBrands: data.current.topElektro.length,
        previousPeriod: metrics.previousPeriod,
        comparisonBasis: metrics.comparisonBasis,
        comparisonLabel: metrics.comparisonLabel,
        strongestGrowth: metrics.strongestGrowth,
        strongestDecline: metrics.strongestDecline,
    }, null, 2));
};

run()
    .catch((error) => {
        console.error(`[audit:social-media-data] ${error.message}`);
        process.exitCode = 1;
    })
    .finally(() => db.end());
