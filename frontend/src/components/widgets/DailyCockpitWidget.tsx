// frontend/src/components/widgets/DailyCockpitWidget.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Accordion, AccordionSummary, AccordionDetails, Divider,
  Link as MuiLink, FormControlLabel, Switch, Tooltip, Stack, Grid,
  Card, CardContent, Skeleton, useTheme, Chip, Button
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LockIcon from '@mui/icons-material/Lock';
import InsightsIcon from '@mui/icons-material/Insights';
import EmailIcon from '@mui/icons-material/Email';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import { useSnackbar } from '../../context/SnackbarContext';
import AiContentLabel from '../AiContentLabel';

// --- Interfaces ---
interface BriefingItem {
  briefing_type: string;
  headline: string;
  analysis_summary: string;
  prognosis: string;
  talking_point: string;
  related_articles?: string; // Neu für Quellen
}

interface CockpitData {
  items?: BriefingItem[]; 
  briefing?: any | null;  
  market_briefing?: { headline: string; summary: string; prognosis: string } | null; 
  sales_triggers: any[];
  linkable_names: string[];
  hasVotedToday?: boolean; 
}

interface DailyCockpitWidgetProps extends Partial<BaseWidgetProps> {
  icon?: React.ReactNode;
  title?: string;
  widgetTypeKey?: string;
  widgetId?: string;
  isPublic?: boolean;
  partnerSlug?: string;
}

const DailyCockpitWidget: React.FC<DailyCockpitWidgetProps> = ({
  widgetId, onDelete, isRemovable, widgetTypeKey, icon: propsIcon, title, isPublic = false, partnerSlug
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user, updateUser, businessPartner } = useAuth();
  const { showSnackbar } = useSnackbar();
  
  const [data, setData] = useState<CockpitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(!!user?.newsletter_opt_in && !!user?.briefing_email_enabled);

  const widgetTitle = title || 'Tägliches Cockpit';
  
  // Im public Modus gibt es keinen echten User/BP, daher Newsletter immer als "erlaubt" (optisch),
  // aber der Klick führt zum Login.
  const deliveryMode = businessPartner?.newsletter_delivery_mode || 'mobiliti';
  const newsletterFrequency = businessPartner?.newsletter_frequency || 'never';
  const externalSignupUrl = /^https?:\/\//i.test(businessPartner?.newsletter_external_signup_url || '')
    ? businessPartner?.newsletter_external_signup_url || undefined
    : undefined;
  const isNewsletterAllowed = isPublic ? true : (
    businessPartner?.allow_automated_newsletter !== false && newsletterFrequency !== 'never'
  );
  const frequencyLabel = ({ daily: 'Tägliches', weekly: 'Wöchentliches', monthly: 'Monatliches' } as const)[newsletterFrequency as 'daily' | 'weekly' | 'monthly'] || 'E-Mail';

  useEffect(() => { 
    if (!isPublic) setIsSubscribed(!!user?.newsletter_opt_in && !!user?.briefing_email_enabled);
  }, [user?.newsletter_opt_in, user?.briefing_email_enabled, isPublic]);

  const fetchData = async () => {
    setLoading(true);
    
    // --- LADE LOGIK: Public vs. Private ---
    try {
        let endpoint = '/api/data/daily-briefing';
        
        // Wenn isPublic true ist, nutzen wir einen Public-Endpunkt (falls existent) 
        // und übergeben die Partner-ID, falls wir eine aus dem Context haben.
        if (isPublic) {
            if (businessPartner?.id) {
                // Echte Daten für einen bekannten Partner auf der Public Page laden
                endpoint = `/api/public/daily-briefing?partnerId=${businessPartner.id}`;
            } else {
                // FALLBACK: Keine Partner-ID bekannt -> Wir zeigen die generischen Mock-Daten
                setData({
                    hasVotedToday: true,
                    linkable_names: ['Österreich', 'Lithium', 'E-Mobilität'],
                    items: [
                        {
                            briefing_type: 'top_insight',
                            headline: 'Kupferpreise fallen unerwartet',
                            analysis_summary: 'Aufgrund neuer Exportrichtlinien sinken die Kupferpreise um 3%. Dies könnte die Batterieproduktion begünstigen.',
                            prognosis: '',
                            talking_point: '',
                            related_articles: '["https://example.com/source1"]'
                        },
                        {
                            briefing_type: 'top_insight',
                            headline: 'Förderstopp für E-LKW diskutiert',
                            analysis_summary: 'Das Ministerium evaluiert derzeit die Förderrichtlinien. Experten erwarten eine baldige Entscheidung.',
                            prognosis: '',
                            talking_point: '',
                            related_articles: '["https://example.com/source2"]'
                        },
                        {
                            briefing_type: 'top_insight',
                            headline: 'KI-Prognose: Lade-Engpass in Region Ost',
                            analysis_summary: 'Unser Modell prognostiziert für das kommende Quartal einen 15%igen Anstieg der Ladeauslastung in Wien und Umgebung.',
                            prognosis: '',
                            talking_point: '',
                            related_articles: '["https://example.com/source3"]'
                        }
                    ],
                    sales_triggers: [
                        { id: 1, account_name: 'Logistik Müller GmbH', headline: 'Flottenerweiterung geplant', talking_point: 'Sprechen Sie den Kunden auf die fallenden Kupferpreise und günstige Lade-Infrastruktur an.' }
                    ]
                });
                setLoading(false);
                return; // Abbruch, da wir Mocks haben
            }
        }

        // API Call für eingeloggte User ODER Public User mit bekannter Partner-ID
        const response = await apiClient.get(endpoint);
        setData({
            items: response.data.items || [],
            briefing: response.data.briefing || (response.data.market_briefing?.top_insights ? response.data.market_briefing : null),
            market_briefing: response.data.market_briefing && !response.data.market_briefing.top_insights ? response.data.market_briefing : null,
            sales_triggers: response.data.sales_triggers || [],
            linkable_names: response.data.linkable_names || [],
            hasVotedToday: response.data.hasVotedToday ?? true
        });

    } catch (err) {
        if (!isPublic) showSnackbar('Fehler beim Laden des Cockpits.', 'error');
        // Fallback auf leeres Array bei Public Fehler, damit das UI nicht crasht
        setData(null); 
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [isPublic, businessPartner?.id]);

  // --- HILFSKOMPONENTEN (Innerhalb definiert, um useNavigate im Scope zu haben) ---
  const handlePublicClick = () => {
    // Wenn User im Public-Modus klickt -> Weiterleitung zum Login (ggf. mit Partner-Param)
    const canonicalSlug = partnerSlug || businessPartner?.slug;
    const loginUrl = canonicalSlug
        ? `/${encodeURIComponent(canonicalSlug)}?login=1`
        : '/login';
    navigate(loginUrl);
  };

  const TextWithSearchLinks: React.FC<{ text: string; namesToLink: string[] }> = ({ text, namesToLink }) => {
    if (!namesToLink || namesToLink.length === 0 || !text) return <>{text}</>;

    const uniqueNames = [...new Set(namesToLink)].filter(Boolean);
    const pattern = uniqueNames
        .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .sort((a, b) => b.length - a.length)
        .join('|');

    if (!pattern) return <>{text}</>;

    const regex = new RegExp(`(${pattern})`, 'gi');
    const parts = text.split(regex);

    return (
        <>
        {parts.map((part, index) => {
            const isLink = uniqueNames.some(name => name.toLowerCase() === part.toLowerCase());
            return isLink ? (
            <MuiLink
                key={index}
                component="button"
                variant="inherit"
                onClick={isPublic ? handlePublicClick : () => navigate(`/search?term=${encodeURIComponent(part)}`)}
                sx={{ 
                    fontWeight: 600, 
                    textDecoration: 'underline', 
                    textDecorationStyle: 'dotted', 
                    textUnderlineOffset: '3px',
                    color: 'primary.main',
                    '&:hover': { color: 'primary.dark' }
                }}
            >
                {part}
            </MuiLink>
            ) : <React.Fragment key={index}>{part}</React.Fragment>;
        })}
        </>
    );
  };



  const handleSubscriptionToggle = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isPublic) {
        showSnackbar('Bitte loggen Sie sich ein, um den Newsletter zu aktivieren.', 'info');
        handlePublicClick();
        return;
    }
    if (!isNewsletterAllowed) return showSnackbar('Der E-Mail-Versand ist für Ihr Unternehmen systemseitig deaktiviert.', 'warning');
    
    if (deliveryMode !== 'mobiliti') return;
    const isChecked = event.target.checked;
    try {
      if (isChecked) {
        const response = await apiClient.post('/api/auth/newsletter/opt-in', {
          email: user?.email,
          source: 'daily_cockpit'
        });
        if (response.data?.alreadyConfirmed) {
          setIsSubscribed(true);
          updateUser({ newsletter_opt_in: true, briefing_email_enabled: true, member_newsletter_enabled: true });
          showSnackbar('E-Mail-Briefing aktiviert.', 'success');
        } else {
          setIsSubscribed(false);
          showSnackbar('Bitte bestätigen Sie die Anmeldung über die zugesandte E-Mail.', 'info');
        }
      } else {
        await apiClient.put('/api/users/me', { briefing_email_enabled: false });
        setIsSubscribed(false);
        updateUser({ briefing_email_enabled: false });
        showSnackbar('E-Mail-Briefing deaktiviert. Ihre allgemeine Newsletter-Einwilligung bleibt bestehen.', 'success');
      }
    } catch {
      showSnackbar('Fehler beim Speichern der Einstellung.', 'error');
    }
  };


const items = data?.items || [];
  const legacyBriefing = data?.briefing || {};
  
  let topInsights: Array<{ headline: string, analysis_summary: string, related_articles?: string }> = [];
  
  if (items.length > 0) {
      topInsights = items
          .filter(i => i.briefing_type === 'top_insight')
          .map(i => ({ headline: i.headline, analysis_summary: i.analysis_summary, related_articles: i.related_articles }));
  } else if (legacyBriefing.top_insights) {
      topInsights = legacyBriefing.top_insights.map((i: any) => ({
          headline: i.title,
          analysis_summary: i.what_changed || i.so_what,
          related_articles: JSON.stringify(i.sources || [])
      }));
  }

  // HIERHIN VERSCHOBEN: Jetzt ist topInsights bekannt und befüllt!
  const hasNoData = !loading && 
    topInsights.length === 0 && 
    !data?.market_briefing && 
    (!data?.sales_triggers || data.sales_triggers.length === 0);

  return (
    <WidgetPaper
      widgetId={widgetId || 'default-id'}
      onDelete={onDelete}
      isRemovable={isRemovable}
      widgetTitle={widgetTitle}
      widgetTypeKey={widgetTypeKey || 'daily_cockpit'}
      title={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {propsIcon || <InsightsIcon color="primary" />} 
            <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>{widgetTitle}</Typography>
        </Box>
      }
      noPadding
      isPublic={isPublic}
    >
      <Box sx={{ p: { xs: 2, md: 3 }, position: 'relative', overflowY: 'auto', height: 'calc(100% - 56px)' }}>
        {loading ? (
            <Stack spacing={2}>
                <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
                <Skeleton variant="text" width="60%" height={30} />
                <Skeleton variant="text" height={20} />
            </Stack>
) : (
    <>
      {/* --- HINWEIS BEI FEHLENDEN DATEN --- */}
      {hasNoData && (
        <Box sx={{ textAlign: 'center', p: 4, bgcolor: alpha(theme.palette.info.main, 0.05), borderRadius: 3, border: '1px dashed', borderColor: 'info.main', my: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1, color: 'text.primary' }}>
            Keine Daten verfügbar
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Für den heutigen Tag liegen aktuell keine neuen Cockpit-Insights oder Vertriebs-Trigger vor.
          </Typography>
        </Box>
      )}

      {/* --- TOP INSIGHTS --- */}
      {topInsights.length > 0 && (
              <Box mb={isPublic ? 0 : 3}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                  <Typography variant="overline" color="primary.main" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1, letterSpacing: 1 }}>
                    <AutoAwesomeIcon fontSize="small" /> Heute in 60 Sekunden
                  </Typography>
                  <AiContentLabel kind="generated" size={16} />
                </Stack>
                <Grid container spacing={2}>
                  {topInsights.slice(0, 3).map((ins, idx) => (
                    <Grid item xs={12} md={4} key={idx}>
                      <Card 
                        variant="outlined" 
                        sx={{ 
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            borderLeft: '4px solid', 
                            borderLeftColor: 'primary.main', 
                            bgcolor: 'background.paper',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                            transition: 'transform 0.2s, box-shadow 0.2s',
                            '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 6px 12px rgba(0,0,0,0.08)' }
                        }}
                      >
                        <CardContent sx={{ p: 2.5, flexGrow: 1, '&:last-child': { pb: 2.5 } }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.5, lineHeight: 1.3, color: 'text.primary' }}>
                            {idx + 1}. <TextWithSearchLinks text={ins.headline} namesToLink={data?.linkable_names || []} />
                          </Typography>
<Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
    <TextWithSearchLinks text={ins.analysis_summary} namesToLink={data?.linkable_names || []} />
  </Typography>

                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            )}

            {/* --- GANZ ALTES FALLBACK --- */}
            {topInsights.length === 0 && data?.market_briefing && (
              <Box mb={3} sx={{ p: 3, bgcolor: alpha(theme.palette.secondary.main, 0.05), borderRadius: 2, borderLeft: '4px solid', borderLeftColor: 'secondary.main' }}>
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 'bold' }}>Markt-Briefing</Typography>
                <Typography variant="h6" sx={{ mt: 0.5, fontWeight: 700 }}><TextWithSearchLinks text={data.market_briefing.headline} namesToLink={data.linkable_names} /></Typography>
                <Typography variant="body2" sx={{ mt: 1.5, lineHeight: 1.6 }}><TextWithSearchLinks text={data.market_briefing.summary} namesToLink={data.linkable_names} /></Typography>
              </Box>
            )}

            {/* --- PUBLIC LOCK SCREEN (Login-Aufforderung) --- */}
            {isPublic && (
              <Box sx={{ mt: 3, textAlign: 'center', p: 3, bgcolor: alpha(theme.palette.primary.main, 0.05), borderRadius: 3, border: '1px dashed', borderColor: 'primary.main' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Möchten Sie alle Details und Analysen sehen?</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Die vollständigen Handlungsanweisungen und Kunden-Triggers sind nur für eingeloggte Nutzer sichtbar.</Typography>
                  <Button variant="contained" onClick={handlePublicClick} startIcon={<LockIcon />}>Jetzt einloggen</Button>
              </Box>
            )}

      {/* --- SALES TRIGGERS (Nun immer uneingeschränkt und klar lesbar) --- */}
      {!isPublic && data && data.sales_triggers && data.sales_triggers.length > 0 && (
        <Box mt={4}>
                <Divider sx={{ mb: 3 }} />
                <Typography variant="overline" color="secondary.main" sx={{ fontWeight: 800, letterSpacing: 1, mb: 1, display: 'block' }}>Sales Intelligence</Typography>
                {data.sales_triggers.map((trigger: any) => (
                  <Accordion key={trigger.id} variant="outlined" disableGutters sx={{ mb: 1.5, borderRadius: '8px !important', overflow: 'hidden', border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: alpha(theme.palette.background.default, 0.4) }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          <TextWithSearchLinks text={trigger.headline} namesToLink={data.linkable_names} />
                        </Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ bgcolor: 'background.default', borderTop: '1px solid', borderColor: 'divider', p: 2.5 }}>
                      <Typography variant="caption" sx={{ display: 'inline-block', mb: 1.5, px: 1, py: 0.5, bgcolor: alpha(theme.palette.text.primary, 0.05), borderRadius: 1, fontWeight: 600 }}>
                        Zielkunde: {trigger.account_name}
                      </Typography>
                      <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                        <b>Empfohlener Ansatz:</b> <TextWithSearchLinks text={`"${trigger.talking_point}"`} namesToLink={data.linkable_names} />
                      </Typography>
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Box>
            )}
          </>
        )}
      </Box>

      {/* --- FOOTER (NEWSLETTER SETTINGS) --- */}
      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', bgcolor: alpha(theme.palette.background.default, 0.6), px: 3, py: 1.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <EmailIcon fontSize="small" sx={{ color: isNewsletterAllowed ? (isSubscribed ? 'primary.main' : 'text.secondary') : 'text.disabled' }} />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: !isNewsletterAllowed ? 'text.disabled' : 'text.primary' }}>
                      {frequencyLabel} Branchenbriefing
                  </Typography>
                  {!isPublic && deliveryMode === 'export' && <Typography variant="caption" color="text.secondary">Versand erfolgt zentral über Ihre Organisation.</Typography>}
                  {!isPublic && deliveryMode === 'external' && <Typography variant="caption" color="text.secondary">Anmeldung und Versand erfolgen im Newsletter-System Ihrer Organisation.</Typography>}
                  {!isPublic && !isNewsletterAllowed && <Typography variant="caption" color="text.secondary">Derzeit nur im Dashboard verfügbar.</Typography>}
                </Box>
            </Box>

            {(!isPublic && deliveryMode === 'external' && isNewsletterAllowed) ? (
              <Button size="small" variant="outlined" component="a" href={externalSignupUrl} target="_blank" rel="noopener noreferrer" disabled={!externalSignupUrl}>
                Extern anmelden
              </Button>
            ) : (!isPublic && deliveryMode === 'export') ? (
              <Chip size="small" label="Zentraler Versand" variant="outlined" />
            ) : <Tooltip
                title={
                    isPublic ? "Login erforderlich, um Briefings zu abonnieren" : 
                    !isNewsletterAllowed ? "E-Mail-Versand ist für Ihr Unternehmen durch den Administrator deaktiviert." : 
                    (isSubscribed ? "Briefing abbestellen" : "Briefing abonnieren")
                }
                placement="top-end"
            >
                <FormControlLabel
                    control={
                        <Switch 
                            size="small" 
                            checked={isPublic ? false : (isNewsletterAllowed ? isSubscribed : false)} 
                            onChange={handleSubscriptionToggle} 
                            color="primary" 
                            disabled={!isNewsletterAllowed && !isPublic} 
                        />
                    }
                    label={
                        <Chip 
                            size="small" 
                            label={isPublic ? "Login" : (!isNewsletterAllowed ? "Gesperrt" : (isSubscribed ? "Aktiv" : "Inaktiv"))}
                            color={isPublic ? "default" : (!isNewsletterAllowed ? "default" : (isSubscribed ? "primary" : "default"))}
                            variant={isSubscribed && !isPublic ? "filled" : "outlined"}
                            sx={{ ml: 1, fontSize: '0.7rem', height: 20, fontWeight: 'bold' }}
                        />
                    }
                    sx={{ m: 0 }}
                />
            </Tooltip>}
        </Box>
      </Box>
    </WidgetPaper>
  );
};

export default DailyCockpitWidget;
