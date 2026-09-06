const {
  resolvePublicAssistant,
  askPublicAssistant,
} = require('../services/publicAiAssistantService');

exports.getPublicAssistantConfig = async (req, res) => {
  try {
    const settings = await resolvePublicAssistant(req.params.siteKey);
    if (!settings) return res.status(404).json({ message: 'Öffentlicher Assistent nicht gefunden.' });
    return res.json({
      siteKey: settings.site_key,
      partnerName: settings.business_partner_name,
      partnerSlug: settings.slug,
      partnerLogo: settings.logo_url,
      partnerWebsite: settings.url_businesspartner,
      assistantName: settings.assistant_name,
      welcomeMessage: settings.welcome_message,
      avatarUrl: settings.avatar_key === 'male' ? '/ki-avatar-m.png' : '/ki-avatar-w.png',
      primaryColor: settings.primary_color || '#e30613',
      secondaryColor: settings.secondary_color || '#061b33',
      ready: Number(settings.document_chunks || 0) > 0,
      aiGenerated: true,
    });
  } catch (error) {
    console.error('[Public AI] Konfiguration:', error.message);
    return res.status(500).json({ message: 'Der Assistent ist derzeit nicht verfügbar.' });
  }
};

exports.askPublicAssistant = async (req, res) => {
  try {
    const settings = await resolvePublicAssistant(req.params.siteKey);
    if (!settings) return res.status(404).json({ message: 'Öffentlicher Assistent nicht gefunden.' });
    if (Number(settings.document_chunks || 0) === 0) {
      return res.status(503).json({ message: 'Die Website-Quellen werden noch vorbereitet.' });
    }
    const result = await askPublicAssistant({
      settings,
      req,
      question: req.body?.question,
      history: req.body?.history,
      sessionId: req.body?.sessionId,
    });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    if (status >= 500) console.error('[Public AI] Anfrage:', error.message);
    return res.status(status).json({
      message: status >= 500 ? 'Der Assistent konnte die Frage gerade nicht beantworten.' : error.message,
    });
  }
};
