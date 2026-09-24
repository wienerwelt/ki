const safeDateDiffDays = (dateValue) => {
  if (!dateValue) return 999;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - date.getTime()) / 86_400_000));
};

const getDomainFromUrl = (url) => {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_) {
    return String(url).replace(/^https?:\/\//i, '').split('/')[0] || null;
  }
};

const classifyAccountRadarSignal = (article, type = 'account') => {
  const text = `${article.article_title || ''} ${article.summary || ''}`.toLowerCase();
  const isCompetitor = type === 'competitor';
  const ageDays = safeDateDiffDays(article.published_at || article.signal_at);

  let signalType = isCompetitor ? 'Wettbewerbsbewegung' : 'Account-Signal';
  let recommendedAction = isCompetitor
    ? 'Prüfen, ob daraus ein Gesprächsanlass oder ein Gegenangebot für den Account entsteht.'
    : 'Kurz bewerten und als Gesprächsanlass für den Account nutzen.';
  let relevanceScore = isCompetitor ? 74 : 70;
  const hasAny = (patterns) => patterns.some((pattern) => text.includes(pattern));

  if (hasAny(['fuhrpark', 'flotte', 'fleet', 'mobilität', 'mobility', 'leasing', 'nutzfahrzeug', 'fahrzeug', 'e-mobilität', 'elektromobilität'])) {
    signalType = 'Fuhrpark-/Mobilitätssignal';
    recommendedAction = 'Mit Mobilitäts-, Fuhrpark- oder Ladeinfrastruktur-Angebot anknüpfen.';
    relevanceScore = 90;
  } else if (hasAny(['ladeinfrastruktur', 'charging', 'ladestation', 'wallbox', 'ev ', 'e-truck', 'elektrisch'])) {
    signalType = 'Lade-/E-Mobilitätschance';
    recommendedAction = 'Bedarf für Ladeinfrastruktur, Betriebskosten oder Elektrifizierung prüfen.';
    relevanceScore = 88;
  } else if (hasAny(['investition', 'investiert', 'finanzierung', 'förderung', 'subvention', 'budget', 'million', 'mio', 'expansion', 'ausbau', 'erweitert'])) {
    signalType = 'Wachstums-/Investitionssignal';
    recommendedAction = 'Kontakt aufnehmen und prüfen, ob neue Projekte oder Beschaffungen entstehen.';
    relevanceScore = 84;
  } else if (hasAny(['kooperation', 'partnerschaft', 'partner', 'joint venture', 'zusammenarbeit'])) {
    signalType = 'Partnerschaftssignal';
    recommendedAction = 'Beziehung und mögliche Kooperations-/Vertriebsansätze prüfen.';
    relevanceScore = 78;
  } else if (hasAny(['gesetz', 'verordnung', 'regulierung', 'richtlinie', 'steuer', 'co2', 'maut', 'vignette', 'compliance'])) {
    signalType = 'Regulatorik-/Compliance-Signal';
    recommendedAction = 'Auswirkungen auf den Account prüfen und Beratung/Briefing anbieten.';
    relevanceScore = 76;
  } else if (hasAny(['wechsel', 'vorstand', 'geschäftsführer', 'ceo', 'cfo', 'leitung', 'management'])) {
    signalType = 'Management-/Organisationssignal';
    recommendedAction = 'Ansprechpartner und Timing für erneute Kontaktaufnahme prüfen.';
    relevanceScore = 72;
  }

  const triggerKeys = Array.isArray(article.trigger_template_keys)
    ? article.trigger_template_keys.filter(Boolean)
    : [];
  const hasContentTrigger = triggerKeys.length > 0
    || (Array.isArray(article.trigger_profile_names) && article.trigger_profile_names.length > 0);
  const triggerClassification = {
    personnel_change: ['Entscheider-/Personalwechsel', 'Neue Verantwortung als konkreten Anlass für eine persönliche Kontaktaufnahme nutzen.', 82],
    investment_growth: ['Wachstums-/Investitionssignal', 'Investitionsbedarf prüfen und mit einem passenden Angebot frühzeitig anknüpfen.', 86],
    fleet_mobility: ['Fuhrpark-/Mobilitätssignal', 'Mit Mobilitäts-, Fuhrpark- oder Flottenangebot anknüpfen.', 91],
    charging_emobility: ['Lade-/E-Mobilitätschance', 'Bedarf für Ladeinfrastruktur, Betriebskosten oder Elektrifizierung prüfen.', 90],
    partnership: ['Partnerschaftssignal', 'Beziehung und mögliche Kooperations- oder Vertriebsansätze prüfen.', 80],
    regulation_compliance: ['Regulatorik-/Compliance-Signal', 'Auswirkungen auf den Account prüfen und ein passendes Briefing oder Beratungsangebot machen.', 79],
    restructuring: ['Veränderungs-/Risikosignal', 'Veränderten Bedarf, Zuständigkeiten und den richtigen Gesprächszeitpunkt prüfen.', 81],
  };
  const triggerRule = triggerKeys.map((key) => triggerClassification[key]).find(Boolean);
  if (triggerRule) {
    [signalType, recommendedAction] = triggerRule;
    relevanceScore = Math.max(relevanceScore, triggerRule[2]);
  } else if (hasContentTrigger) {
    signalType = 'Sales-Trigger';
    recommendedAction = 'Treffer prüfen und als aktuellen, accountbezogenen Gesprächsanlass nutzen.';
    relevanceScore = Math.max(relevanceScore, 78);
  }
  relevanceScore = Math.max(relevanceScore, Number(article.trigger_match_score || 0));

  if (isCompetitor) {
    relevanceScore += 4;
    if (!recommendedAction.toLowerCase().includes('wettbewerb')) {
      recommendedAction = `Wettbewerb beobachten: ${recommendedAction}`;
    }
  }

  if (ageDays <= 3) relevanceScore += 6;
  else if (ageDays <= 7) relevanceScore += 4;
  else if (ageDays <= 30) relevanceScore += 2;

  return {
    ...article,
    type,
    signal_type: signalType,
    recommended_action: recommendedAction,
    relevance_score: Math.max(1, Math.min(99, relevanceScore)),
    source_domain: getDomainFromUrl(article.article_url),
    days_old: ageDays,
    status: article.status || 'new',
    is_new: !article.status || article.status === 'new',
  };
};

module.exports = { classifyAccountRadarSignal, safeDateDiffDays, getDomainFromUrl };
