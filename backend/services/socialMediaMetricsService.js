const DEFAULT_MINIMUM_REGISTRATIONS = 100;

const parsePercentValue = (rawValue) => {
    if (rawValue === null || rawValue === undefined || String(rawValue).trim() === 'n.v.') return null;

    const normalized = String(rawValue)
        .replace(/\s/g, '')
        .replace('%', '')
        .replace(',', '.');
    const value = Number.parseFloat(normalized);
    return Number.isFinite(value) ? value : null;
};

const normalizeBrandKey = (entry) => {
    const logoSlug = String(entry?.logo_slug || '').trim().toLowerCase();
    if (logoSlug && logoSlug !== 'default') return logoSlug;

    return String(entry?.name || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
};

const indexBrands = (entries) => new Map(
    (Array.isArray(entries) ? entries : [])
        .map((entry) => [normalizeBrandKey(entry), entry])
        .filter(([key]) => Boolean(key))
);

const calculateChangePercent = (currentValue, previousValue) => {
    const current = Number(currentValue);
    const previous = Number(previousValue);
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
    return ((current - previous) / previous) * 100;
};

const getPreviousPeriod = (year, month) => ({
    year: month === 1 ? year - 1 : year,
    month: month === 1 ? 12 : month - 1,
});

const buildMetric = ({ entry, previousIndex, previousLabel, yearOverYearLabel }) => {
    if (!entry) return null;

    const previousEntry = previousIndex.get(normalizeBrandKey(entry));
    const monthOverMonthPercent = previousEntry
        ? calculateChangePercent(entry.zulassungen, previousEntry.zulassungen)
        : null;
    const yearOverYearPercent = parsePercentValue(entry.vergleichVorjahr);
    const usesPreviousMonth = monthOverMonthPercent !== null;

    return {
        name: entry.name,
        zulassungen: Number(entry.zulassungen || 0),
        previousMonthRegistrations: previousEntry ? Number(previousEntry.zulassungen || 0) : null,
        vergleichVorjahr: entry.vergleichVorjahr,
        yearOverYearPercent,
        monthOverMonthPercent,
        changePercent: usesPreviousMonth ? monthOverMonthPercent : yearOverYearPercent,
        comparisonBasis: usesPreviousMonth ? 'previous_month' : 'same_month_previous_year',
        comparisonLabel: usesPreviousMonth ? previousLabel : yearOverYearLabel,
        comparisonStatus: usesPreviousMonth ? 'available' : (yearOverYearPercent !== null ? 'fallback_year_over_year' : 'unavailable'),
        logo_slug: entry.logo_slug,
    };
};

const buildSocialMetrics = ({
    currentData,
    previousData,
    year,
    month,
    monthNames,
    minimumRegistrations = DEFAULT_MINIMUM_REGISTRATIONS,
}) => {
    const currentBrands = Array.isArray(currentData?.topMarken) ? currentData.topMarken : [];
    const currentElectricBrands = Array.isArray(currentData?.topElektro) ? currentData.topElektro : [];
    const previousBrands = Array.isArray(previousData?.topMarken) ? previousData.topMarken : [];
    const previousElectricBrands = Array.isArray(previousData?.topElektro) ? previousData.topElektro : [];
    const previousPeriod = getPreviousPeriod(year, month);
    const previousLabel = `ggü. ${monthNames[previousPeriod.month - 1]} ${previousPeriod.year}`;
    const yearOverYearLabel = `ggü. ${monthNames[month - 1]} ${year - 1}`;
    const previousBrandIndex = indexBrands(previousBrands);
    const previousElectricIndex = indexBrands(previousElectricBrands);
    const previousPeriodAvailable = previousBrandIndex.size > 0;

    const allBrandMetrics = currentBrands.map((entry) => buildMetric({
        entry,
        previousIndex: previousBrandIndex,
        previousLabel,
        yearOverYearLabel,
    }));

    const monthlyTrendCandidates = allBrandMetrics
        .filter((metric) => metric.monthOverMonthPercent !== null)
        .filter((metric) => metric.zulassungen > minimumRegistrations && metric.previousMonthRegistrations > minimumRegistrations);
    const yearOverYearTrendCandidates = allBrandMetrics
        .filter((metric) => metric.yearOverYearPercent !== null && metric.zulassungen > minimumRegistrations)
        .map((metric) => ({
            ...metric,
            changePercent: metric.yearOverYearPercent,
            comparisonBasis: 'same_month_previous_year',
            comparisonLabel: yearOverYearLabel,
            comparisonStatus: 'fallback_year_over_year',
        }));

    const trendCandidates = monthlyTrendCandidates.length > 0
        ? monthlyTrendCandidates
        : yearOverYearTrendCandidates;
    const growthCandidates = trendCandidates
        .filter((metric) => metric.changePercent > 0)
        .sort((a, b) => b.changePercent - a.changePercent);
    const declineCandidates = trendCandidates
        .filter((metric) => metric.changePercent < 0)
        .sort((a, b) => a.changePercent - b.changePercent);
    const trendUsesPreviousMonth = monthlyTrendCandidates.length > 0;

    return {
        comparisonBasis: trendUsesPreviousMonth ? 'previous_month' : 'same_month_previous_year',
        comparisonLabel: trendUsesPreviousMonth ? previousLabel : yearOverYearLabel,
        yearOverYearLabel,
        previousPeriod: { ...previousPeriod, available: previousPeriodAvailable },
        marketLeader: buildMetric({
            entry: currentBrands[0],
            previousIndex: previousBrandIndex,
            previousLabel,
            yearOverYearLabel,
        }),
        topElectricBrand: buildMetric({
            entry: currentElectricBrands[0],
            previousIndex: previousElectricIndex,
            previousLabel,
            yearOverYearLabel,
        }),
        strongestGrowth: growthCandidates[0] || null,
        strongestDecline: declineCandidates[0] || null,
        trendSelectionLabel: trendUsesPreviousMonth
            ? `Einzelmarken · >${minimumRegistrations} Zul. je Monat`
            : `Einzelmarken · >${minimumRegistrations} Zul.`,
        evaluatedBrandCount: currentBrands.length,
    };
};

module.exports = {
    buildSocialMetrics,
    calculateChangePercent,
    getPreviousPeriod,
    normalizeBrandKey,
    parsePercentValue,
};
