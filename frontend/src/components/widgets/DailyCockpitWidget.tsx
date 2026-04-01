import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Accordion, AccordionSummary, AccordionDetails, Divider,
  Link as MuiLink, FormControlLabel, Switch, Tooltip, Stack, Grid,
  Card, CardContent, Skeleton, Fade, useTheme, Chip, Button
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
}

const DailyCockpitWidget: React.FC<DailyCockpitWidgetProps> = ({
  widgetId, onDelete, isRemovable, widgetTypeKey, icon: propsIcon, title, isPublic = false
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user, updateUser, businessPartner } = useAuth();
  const { showSnackbar } = useSnackbar();
  
  const [data, setData] = useState<CockpitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(!!user?.newsletter_opt_in);

  const widgetTitle = title || 'Tägliches Cockpit';
  
  // Im public Modus gibt es keinen echten User/BP, daher Newsletter immer als "erlaubt" (optisch),
  // aber der Klick führt zum Login.
  const isNewsletterAllowed = isPublic ? true : businessPartner?.allow_automated_newsletter !== false;

  useEffect(() => { 
    if (!isPublic) setIsSubscribed(!!user?.newsletter_opt_in); 
  }, [user?.newsletter_opt_in, isPublic]);

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
    const loginUrl = businessPartner?.name 
        ? `/login?partner=${encodeURIComponent(businessPartner.name)}` 
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
    
    const isChecked = event.target.checked;
    setIsSubscribed(isChecked);
    updateUser({ newsletter_opt_in: isChecked });
    
    try {
      await apiClient.put('/api/users/me', { newsletter_opt_in: isChecked });
      showSnackbar(`E-Mail Briefing ${isChecked ? 'aktiviert' : 'deaktiviert'}.`, 'success');
    } catch {
      setIsSubscribed(!isChecked);
      updateUser({ newsletter_opt_in: !isChecked });
      showSnackbar('Fehler beim Speichern der Einstellung.', 'error');
    }
  };

  // Lock-Screen greift nicht im Public Modus (dafür ist Login zuständig)
  const isLocked = !isPublic && data?.hasVotedToday === false;

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
            {/* --- TOP INSIGHTS --- */}
            {topInsights.length > 0 && (
              <Box mb={isPublic ? 0 : 3}>
                <Typography variant="overline" color="primary.main" sx={{ fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1, letterSpacing: 1 }}>
                  <AutoAwesomeIcon fontSize="small" /> Heute in 60 Sekunden
                </Typography>
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

            {/* --- PRIVATE LOCK SCREEN (Bezahlschranke für Barometer) --- */}
            {isLocked && (
              <Fade in={isLocked}>
                <Box sx={{ 
                  position: 'absolute', top: topInsights.length > 0 ? '260px' : '100px', left: 0, right: 0, bottom: 0, 
                  background: `linear-gradient(to bottom, transparent, ${theme.palette.background.paper} 15%, ${theme.palette.background.paper})`,
                  zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 8, textAlign: 'center', px: 3,
                  backdropFilter: 'blur(2px)'
                }}>
                  <Box sx={{ bgcolor: alpha(theme.palette.text.disabled, 0.1), p: 2, borderRadius: '50%', mb: 2 }}>
                    <LockIcon color="disabled" sx={{ fontSize: 40 }} />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Exklusive Daten gesperrt</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 300, lineHeight: 1.6 }}>
                    Bitte nehmen Sie am <b>Markt-Barometer</b> teil, um TCO-Treiber und Handlungsempfehlungen freizuschalten.
                  </Typography>
                </Box>
              </Fade>
            )}

            {/* --- SALES TRIGGERS (Nur sichtbar im privaten Modus) --- */}
            {!isPublic && data && data.sales_triggers && data.sales_triggers.length > 0 && (
              <Box mt={4} sx={{ opacity: isLocked ? 0.3 : 1, filter: isLocked ? 'blur(3px)' : 'none', pointerEvents: isLocked ? 'none' : 'auto', transition: 'all 0.3s' }}>
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
                <Typography variant="body2" sx={{ fontWeight: 600, color: !isNewsletterAllowed ? 'text.disabled' : 'text.primary' }}>
                    Tägliches E-Mail Briefing
                </Typography>
            </Box>
            
            <Tooltip 
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
            </Tooltip>
        </Box>
      </Box>
    </WidgetPaper>
  );
};

export default DailyCockpitWidget;