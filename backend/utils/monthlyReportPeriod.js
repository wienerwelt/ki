const cronParser = require('cron-parser');

function getMonthlyReportPeriod(now = new Date()) {
    // Inclusive at midnight, independent of the host's time zone and DST.
    const interval = cronParser.parseExpression('0 0 1 * *', {
        currentDate: new Date(now.getTime() + 1), tz: 'Europe/Vienna',
    });
    const currentMonthStart = interval.prev().toDate();
    const lastMonthStart = interval.prev().toDate();
    const prevMonthStart = interval.prev().toDate();
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit',
    }).formatToParts(lastMonthStart);
    const year = parts.find((part) => part.type === 'year').value;
    const month = parts.find((part) => part.type === 'month').value;
    return { currentMonthStart, lastMonthStart, prevMonthStart, reportMonth: `${year}-${month}-01` };
}

module.exports = { getMonthlyReportPeriod };
