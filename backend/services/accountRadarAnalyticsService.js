const db = require('../config/db');
const { classifyAccountRadarSignal } = require('./accountRadarSignalClassifier');

const ALLOWED_PERIODS = new Set([30, 90, 365]);
const REASON_LABELS = Object.freeze({
  false_positive: 'Falscher Treffer',
  outdated: 'Veraltet',
  duplicate: 'Doppelter Treffer',
  wrong_account: 'Falscher Account',
  no_sales_relevance: 'Keine Vertriebsrelevanz',
  other: 'Sonstiger Grund',
});

const asNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const percentage = (value, base) => base > 0 ? Math.round((value / base) * 1000) / 10 : 0;
const isoDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const bucketKey = (date, periodDays) => {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  if (periodDays <= 30) return value.toISOString().slice(0, 10);
  if (periodDays <= 90) {
    const day = value.getUTCDay() || 7;
    value.setUTCDate(value.getUTCDate() - day + 1);
    return value.toISOString().slice(0, 10);
  }
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-01`;
};

async function getAccountRadarAnalytics(businessPartnerId, requestedPeriodDays = 30) {
  const periodDays = ALLOWED_PERIODS.has(Number(requestedPeriodDays)) ? Number(requestedPeriodDays) : 30;
  const [signalsResult, stageEventsResult, pipelineResult] = await Promise.all([
    db.query(`
      SELECT article.id::text,
             article.article_title,
             article.summary,
             article.source_name,
             article.article_url,
             article.competitor_name,
             COALESCE(article.published_at, article.created_at) AS signal_at,
             account.name AS account_name,
             task.id::text AS task_id,
             task.first_contact_at,
             task.sales_stage,
             task.sales_stage_updated_at,
             task.opportunity_value_eur,
             task.opportunity_probability,
             feedback.relevance_status,
             feedback.reason AS relevance_reason,
             feedback.updated_at AS feedback_at
      FROM business_partner_tracked_articles article
      JOIN business_partner_accounts account ON account.id = article.account_id
      LEFT JOIN account_radar_tasks task
        ON task.tracked_article_id = article.id
       AND task.business_partner_id = $1
       AND task.task_status <> 'cancelled'
      LEFT JOIN account_radar_signal_feedback feedback
        ON feedback.tracked_article_id = article.id
       AND feedback.business_partner_id = $1
      WHERE account.business_partner_id = $1
        AND COALESCE(article.published_at, article.created_at) >= CURRENT_TIMESTAMP - ($2::integer * INTERVAL '1 day')
      ORDER BY COALESCE(article.published_at, article.created_at) DESC
      LIMIT 50000
    `, [businessPartnerId, periodDays]),
    db.query(`
      SELECT event.task_id::text, event.created_at, event.event_data->>'sales_stage' AS sales_stage
      FROM account_radar_task_events event
      WHERE event.business_partner_id = $1
        AND event.created_at >= CURRENT_TIMESTAMP - ($2::integer * INTERVAL '1 day')
        AND event.event_data->>'sales_stage' IN ('contacted', 'meeting', 'offer', 'won', 'lost')
    `, [businessPartnerId, periodDays]),
    db.query(`
      SELECT task.sales_stage,
             COUNT(*)::int AS count,
             COALESCE(SUM(task.opportunity_value_eur), 0)::numeric AS value_eur,
             COALESCE(SUM(task.opportunity_value_eur * COALESCE(task.opportunity_probability, 0) / 100.0), 0)::numeric AS weighted_value_eur
      FROM account_radar_tasks task
      WHERE task.business_partner_id = $1
        AND task.task_status <> 'cancelled'
        AND task.sales_stage IS NOT NULL
      GROUP BY task.sales_stage
    `, [businessPartnerId]),
  ]);

  const signals = signalsResult.rows;
  const stageSets = { contacted: new Set(), meeting: new Set(), offer: new Set(), won: new Set(), lost: new Set() };
  stageEventsResult.rows.forEach((event) => stageSets[event.sales_stage]?.add(event.task_id));
  signals.forEach((signal) => {
    const changedAt = isoDate(signal.sales_stage_updated_at);
    if (signal.task_id && signal.sales_stage && changedAt
      && changedAt.getTime() >= Date.now() - periodDays * 86400000) {
      stageSets[signal.sales_stage]?.add(signal.task_id);
    }
  });

  const contacts = signals.filter((signal) => signal.first_contact_at).length;
  const responseHours = signals
    .map((signal) => {
      const signalAt = isoDate(signal.signal_at);
      const contactAt = isoDate(signal.first_contact_at);
      return signalAt && contactAt && contactAt >= signalAt ? (contactAt - signalAt) / 3600000 : null;
    })
    .filter((value) => value !== null);
  const irrelevant = signals.filter((signal) => signal.relevance_status === 'irrelevant');
  const pipelineByStage = Object.fromEntries(pipelineResult.rows.map((row) => [row.sales_stage, {
    count: Number(row.count || 0),
    valueEur: asNumber(row.value_eur),
    weightedValueEur: asNumber(row.weighted_value_eur),
  }]));
  const openStages = ['contacted', 'meeting', 'offer'];
  const openPipelineValueEur = openStages.reduce((sum, stage) => sum + asNumber(pipelineByStage[stage]?.valueEur), 0);
  const weightedPipelineValueEur = openStages.reduce((sum, stage) => sum + asNumber(pipelineByStage[stage]?.weightedValueEur), 0);
  const wonRevenueEur = asNumber(pipelineByStage.won?.valueEur);

  const sourceMap = new Map();
  const typeMap = new Map();
  const timelineMap = new Map();
  signals.forEach((signal) => {
    const source = String(signal.source_name || 'Unbekannte Quelle').trim() || 'Unbekannte Quelle';
    const sourceItem = sourceMap.get(source) || { source, signals: 0, contacts: 0, wins: 0 };
    sourceItem.signals += 1;
    sourceItem.contacts += signal.first_contact_at ? 1 : 0;
    sourceItem.wins += signal.sales_stage === 'won' ? 1 : 0;
    sourceMap.set(source, sourceItem);

    const classified = classifyAccountRadarSignal(signal, signal.competitor_name ? 'competitor' : 'account');
    const signalType = classified.signal_type || 'Sonstiges Signal';
    const typeItem = typeMap.get(signalType) || { signalType, signals: 0, contacts: 0, wins: 0 };
    typeItem.signals += 1;
    typeItem.contacts += signal.first_contact_at ? 1 : 0;
    typeItem.wins += signal.sales_stage === 'won' ? 1 : 0;
    typeMap.set(signalType, typeItem);

    const ensureBucket = (dateValue) => {
      const key = bucketKey(dateValue, periodDays);
      const bucket = timelineMap.get(key) || { date: key, signals: 0, contacts: 0, wins: 0, wonRevenueEur: 0 };
      timelineMap.set(key, bucket);
      return bucket;
    };
    ensureBucket(signal.signal_at).signals += 1;
    const contactAt = isoDate(signal.first_contact_at);
    if (contactAt && contactAt.getTime() >= Date.now() - periodDays * 86400000) ensureBucket(contactAt).contacts += 1;
    const wonAt = isoDate(signal.sales_stage_updated_at);
    if (signal.sales_stage === 'won' && wonAt && wonAt.getTime() >= Date.now() - periodDays * 86400000) {
      const wonBucket = ensureBucket(wonAt);
      wonBucket.wins += 1;
      wonBucket.wonRevenueEur += asNumber(signal.opportunity_value_eur);
    }
  });

  const enrichConversion = (item) => ({
    ...item,
    contactConversionPercent: percentage(item.contacts, item.signals),
    winConversionPercent: percentage(item.wins, item.signals),
  });
  const irrelevantReasons = Object.entries(irrelevant.reduce((result, signal) => {
    const key = signal.relevance_reason || 'other';
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {})).map(([reason, count]) => ({ reason, label: REASON_LABELS[reason] || reason, count }));

  const wonCount = stageSets.won.size;
  const lostCount = stageSets.lost.size;
  return {
    periodDays,
    generatedAt: new Date().toISOString(),
    isSampled: signals.length >= 50000,
    metrics: {
      signals: signals.length,
      tasks: signals.filter((signal) => signal.task_id).length,
      contacts,
      meetings: stageSets.meeting.size,
      offers: stageSets.offer.size,
      wins: wonCount,
      losses: lostCount,
      signalToContactPercent: percentage(contacts, signals.length),
      winRatePercent: percentage(wonCount, wonCount + lostCount),
      averageResponseHours: responseHours.length
        ? Math.round((responseHours.reduce((sum, value) => sum + value, 0) / responseHours.length) * 10) / 10
        : null,
      irrelevant: irrelevant.length,
      irrelevantPercent: percentage(irrelevant.length, signals.length),
      openPipelineValueEur,
      weightedPipelineValueEur,
      wonRevenueEur,
    },
    pipelineByStage,
    topSources: Array.from(sourceMap.values()).map(enrichConversion)
      .sort((left, right) => right.contacts - left.contacts || right.signals - left.signals).slice(0, 8),
    signalTypes: Array.from(typeMap.values()).map(enrichConversion)
      .sort((left, right) => right.contacts - left.contacts || right.signals - left.signals).slice(0, 8),
    irrelevantReasons: irrelevantReasons.sort((left, right) => right.count - left.count),
    timeline: Array.from(timelineMap.values()).sort((left, right) => left.date.localeCompare(right.date)),
  };
}

module.exports = { getAccountRadarAnalytics, REASON_LABELS };
