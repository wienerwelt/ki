import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Link as MuiLink, FormControlLabel, Switch, Tooltip, 
  CircularProgress, Button, Grid, Paper, Stack, Chip, IconButton, Fade, useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import GavelIcon from '@mui/icons-material/Gavel';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import apiClient from '../apiClient';
import { useAuth } from '../context/AuthContext';
import { useSnackbar } from '../context/SnackbarContext';

// --- Interfaces ---
interface BriefingItem {
  id?: string;
  briefing_type: string;
  headline: string;
  analysis_summary: string;
  prognosis: string;
  talking_point: string;
  related_articles?: string;
}

interface SalesTrigger {
  id: string;
  headline: string;
  analysis_summary: string;
  talking_point: string;
  account_name: string;
}

interface CockpitData {
  items?: BriefingItem[];
  briefing?: any;
  sales_triggers: SalesTrigger[];
  linkable_names: string[];
  hasVotedToday?: boolean;
}

// --- Hilfskomponente: Verlinkung & Highlighting ---
const TextWithSearchLinks: React.FC<{ text: string; namesToLink: string[] }> = ({ text, namesToLink }) => {
  const navigate = useNavigate();
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
            onClick={() => navigate(`/search?term=${encodeURIComponent(part)}`)}
            sx={{ 
                fontWeight: 700, 
                textDecoration: 'underline', 
                textDecorationStyle: 'dotted', 
                textUnderlineOffset: '3px',
                color: 'primary.main',
                bgcolor: 'primary.50', // Leichter Textmarker-Effekt
                px: 0.5,
                borderRadius: 0.5,
                '&:hover': { color: 'primary.dark', bgcolor: 'primary.100' }
            }}
          >
            {part}
          </MuiLink>
        ) : <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </>
  );
};

// --- Hilfskomponente: Copy to Clipboard ---
const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Tooltip title={copied ? "Kopiert!" : "Pitch kopieren"}>
      <IconButton size="small" onClick={handleCopy} color={copied ? "success" : "primary"} sx={{ bgcolor: copied ? 'success.50' : 'primary.50', '&:hover': { bgcolor: copied ? 'success.100' : 'primary.100' } }}>
        {copied ? <CheckCircleOutlineIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
};

const DailyBriefingContent: React.FC = () => {
  const theme = useTheme();
  const [data, setData] = useState<CockpitData | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, updateUser, businessPartner } = useAuth();
  const { showSnackbar } = useSnackbar();
  
  // --- NEWSLETTER HIERARCHIE-LOGIK ---
  const [isSubscribed, setIsSubscribed] = useState(!!user?.newsletter_opt_in);
  const isNewsletterAllowed = businessPartner?.allow_automated_newsletter !== false;
  
  // WICHTIG: Die Kombination aus beidem (BP schlägt User)
  const effectiveSubscription = isNewsletterAllowed && isSubscribed;
  
  // DYNAMISCHER TRIGGER: Sales vs. Information (Fallback ist 'information')
  const dashboardFocus = businessPartner?.dashboard_focus || 'information';

  useEffect(() => setIsSubscribed(!!user?.newsletter_opt_in), [user?.newsletter_opt_in]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/data/daily-briefing');
      setData(response.data);
    } catch (err: any) {
      showSnackbar('Fehler beim Laden des Tages-Briefings.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubscriptionToggle = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!isNewsletterAllowed) return showSnackbar('Der E-Mail-Versand ist für Ihr Unternehmen systemseitig deaktiviert.', 'warning');
    
    const isChecked = event.target.checked;
    setIsSubscribed(isChecked);
    updateUser({ newsletter_opt_in: isChecked });
    
    try {
      await apiClient.put('/api/users/me', { newsletter_opt_in: isChecked });
      showSnackbar(`E-Mail Briefing ${isChecked ? 'aktiviert' : 'deaktiviert'}.`, 'success');
    } catch (err) {
      setIsSubscribed(!isChecked);
      updateUser({ newsletter_opt_in: !isChecked });
      showSnackbar('Fehler beim Speichern der Einstellung.', 'error');
    }
  };

  // --- DATEN-EXTRAKTION ---
  const names = data?.linkable_names || [];
  const salesTriggers = data?.sales_triggers || [];
  const items = data?.items || [];
  const legacyBriefing = data?.briefing || {};

  const topInsights = items.length > 0 
    ? items.filter(i => i.briefing_type === 'top_insight')
    : (legacyBriefing.top_insights || []).map((i: any) => ({ headline: i.title, analysis_summary: i.what_changed, prognosis: i.so_what, talking_point: i.action, related_articles: JSON.stringify(i.sources || []) }));

  const regulations = items.length > 0
    ? items.filter(i => i.briefing_type === 'regulation')
    : (legacyBriefing.regulation_and_funding || []).map((i: any) => ({ headline: i.title, analysis_summary: i.summary, talking_point: i.action, related_articles: JSON.stringify(i.source ? [i.source] : []) }));

  const isLocked = data?.hasVotedToday === false;
  const hasAnyData = topInsights.length > 0 || regulations.length > 0 || salesTriggers.length > 0;

  // Lesezeit berechnen (Grob: 200 Wörter pro Minute)
  const readTime = useMemo(() => {
    const textLength = JSON.stringify(topInsights).split(' ').length + JSON.stringify(regulations).split(' ').length;
    return Math.max(1, Math.ceil(textLength / 200));
  }, [topInsights, regulations]);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 4, minHeight: 300 }}><CircularProgress /></Box>;
  }

  if (!hasAnyData) {
    return <Typography sx={{ p: 4, textAlign: 'center' }} color="text.secondary">Für heute wurde noch kein Briefing erstellt.</Typography>;
  }

  // --- BENTO BOX KOMPONENTEN ---
  const renderSources = (jsonString?: string) => {
    if (!jsonString) return null;
    try {
      const urls: string[] = JSON.parse(jsonString);
      return urls.map((url, i) => (
        <Chip 
          key={i} 
          label={`Quelle ${i+1}`} 
          size="small" 
          icon={<OpenInNewIcon fontSize="small" />} 
          component="a" 
          href={url} 
          target="_blank" 
          clickable 
          variant="outlined"
          sx={{ mr: 1, mt: 1, fontSize: '0.7rem' }} 
        />
      ));
    } catch { return null; }
  };

  const TopInsightsBlock = () => (
    <Paper sx={{ p: 3, borderRadius: 4, height: '100%', border: '1px solid', borderColor: 'divider', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
      <Typography variant="h6" sx={{ fontWeight: 800, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
        <LightbulbOutlinedIcon color="primary" /> Strategische Insights
      </Typography>
      <Stack spacing={4}>
        {topInsights.map((ins: any, idx: number) => (
          <Box key={idx} sx={{ position: 'relative', pl: 2, borderLeft: '3px solid', borderColor: 'primary.main' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.3, mb: 1 }}>{ins.headline}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}><TextWithSearchLinks text={ins.analysis_summary} namesToLink={names} /></Typography>
            {(ins.prognosis || ins.talking_point) && (
                <Box sx={{ p: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.05), borderRadius: 2, mb: 1 }}>
                    {ins.prognosis && <Typography variant="body2" sx={{ mb: ins.talking_point ? 1 : 0 }}><b>Prognose:</b> <TextWithSearchLinks text={ins.prognosis} namesToLink={names} /></Typography>}
                    {ins.talking_point && <Typography variant="body2"><b>Empfehlung:</b> <TextWithSearchLinks text={ins.talking_point} namesToLink={names} /></Typography>}
                </Box>
            )}
            <Box>{renderSources(ins.related_articles)}</Box>
          </Box>
        ))}
      </Stack>
    </Paper>
  );

  const RegulationsBlock = () => (
    <Paper sx={{ p: 3, borderRadius: 4, height: '100%', border: '1px solid', borderColor: 'divider', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
      <Typography variant="h6" sx={{ fontWeight: 800, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
        <GavelIcon color="secondary" /> Regulatorik & Förderung
      </Typography>
      <Stack spacing={3}>
        {regulations.map((reg: any, idx: number) => (
          <Box key={idx} sx={{ p: 2, bgcolor: alpha(theme.palette.secondary.main, 0.05), borderRadius: 3, border: '1px solid', borderColor: alpha(theme.palette.secondary.main, 0.1) }}>
             <Chip label={reg.headline.includes('Förder') ? '💰 Förderung' : '⚖️ Compliance'} size="small" color="secondary" sx={{ mb: 1, fontWeight: 'bold', fontSize: '0.7rem' }} />
             <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>{reg.headline}</Typography>
             <Typography variant="body2" sx={{ mb: 1 }}><TextWithSearchLinks text={reg.analysis_summary} namesToLink={names} /></Typography>
             {reg.talking_point && <Typography variant="body2" sx={{ fontWeight: 600, color: 'secondary.dark' }}>Aktion: <TextWithSearchLinks text={reg.talking_point} namesToLink={names} /></Typography>}
             <Box>{renderSources(reg.related_articles)}</Box>
          </Box>
        ))}
      </Stack>
    </Paper>
  );

  const SalesTriggersBlock = () => (
    <Paper sx={{ p: 3, borderRadius: 4, height: '100%', border: '1px solid', borderColor: 'divider', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', position: 'relative', overflow: 'hidden' }}>
      <Typography variant="h6" sx={{ fontWeight: 800, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
        <MonetizationOnIcon color="success" /> Sales Intelligence
      </Typography>
      
      {/* Das Milchglas-Overlay für den Lock-Screen */}
      {isLocked && (
          <Fade in={isLocked}>
            <Box sx={{ 
                position: 'absolute', top: 60, left: 0, right: 0, bottom: 0, zIndex: 10,
                backdropFilter: 'blur(6px)', backgroundColor: 'rgba(255,255,255,0.6)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, textAlign: 'center'
            }}>
                <Box sx={{ bgcolor: 'background.paper', p: 3, borderRadius: 4, boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
                    <LockOutlinedIcon color="primary" sx={{ fontSize: 40, mb: 1 }} />
                    <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Sales-Pitches gesperrt</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Nehmen Sie kurz am Markt-Barometer teil, um diese handlungsorientierten Leads freizuschalten.</Typography>
                    <Button variant="contained" onClick={() => {/* Navigation zur Umfrage */}} sx={{ borderRadius: 8, px: 3 }}>Jetzt abstimmen</Button>
                </Box>
            </Box>
          </Fade>
      )}

      <Stack spacing={3} sx={{ filter: isLocked ? 'blur(4px)' : 'none', transition: 'filter 0.3s' }}>
        {salesTriggers.map((trigger: any, idx: number) => (
          <Box key={idx} sx={{ p: 2.5, bgcolor: '#f8fafc', borderRadius: 3, border: '1px solid #e2e8f0' }}>
             <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                 <Chip icon={<WhatshotIcon sx={{ color: '#ef4444 !important' }}/>} label={`Zielkunde: ${trigger.account_name}`} sx={{ fontWeight: 800, bgcolor: '#fee2e2', color: '#991b1b', border: 'none' }} size="small" />
             </Box>
             <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>{trigger.headline}</Typography>
             <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}><TextWithSearchLinks text={trigger.analysis_summary} namesToLink={names} /></Typography>
             
             <Box sx={{ p: 1.5, bgcolor: '#fff', borderRadius: 2, border: '1px dashed #cbd5e1', display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                 <Box sx={{ flexGrow: 1 }}>
                     <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>Pitch / Ansatz:</Typography>
                     <Typography variant="body2" sx={{ fontStyle: 'italic', fontWeight: 600 }}>"{trigger.talking_point}"</Typography>
                 </Box>
                 <CopyButton text={trigger.talking_point} />
             </Box>
          </Box>
        ))}
      </Stack>
    </Paper>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Scrollbarer Content-Bereich */}
      <Box sx={{ flexGrow: 1, overflowY: 'auto', p: { xs: 2, md: 3 }, bgcolor: '#f1f5f9' }}>
        
        {/* TL;DR HERO BLOCK */}
        <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 2 }}>
            <Box>
                <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '-0.03em', color: 'text.primary' }}>
                    Guten Morgen, {user?.first_name || 'Team'}.
                </Typography>
                <Typography variant="subtitle1" color="text.secondary" sx={{ mt: 0.5 }}>
                    Hier ist Ihr Wissensvorsprung für heute.
                </Typography>
            </Box>
            <Chip icon={<AccessTimeIcon />} label={`ca. ${readTime} Min. Lesezeit`} variant="outlined" sx={{ bgcolor: '#fff', fontWeight: 'bold' }} />
        </Box>

        {/* BENTO GRID (Dynamisch nach Fokus) */}
        <Grid container spacing={3}>
            {dashboardFocus === 'sales' ? (
                // --- SALES MODUS (Hunter) ---
                <>
                    {salesTriggers.length > 0 && (
                        <Grid item xs={12} md={6}>
                            <SalesTriggersBlock />
                        </Grid>
                    )}
                    <Grid item xs={12} md={6}>
                        <Stack spacing={3} sx={{ height: '100%' }}>
                            {topInsights.length > 0 && <TopInsightsBlock />}
                            {regulations.length > 0 && <RegulationsBlock />}
                        </Stack>
                    </Grid>
                </>
            ) : (
                // --- INFORMATION MODUS (Strategie) ---
                <>
                    <Grid item xs={12} md={8}>
                        <Stack spacing={3} sx={{ height: '100%' }}>
                            {topInsights.length > 0 && <TopInsightsBlock />}
                            {regulations.length > 0 && salesTriggers.length === 0 && <RegulationsBlock />}
                        </Stack>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Stack spacing={3} sx={{ height: '100%' }}>
                            {regulations.length > 0 && salesTriggers.length > 0 && <RegulationsBlock />}
                            {salesTriggers.length > 0 && <SalesTriggersBlock />}
                        </Stack>
                    </Grid>
                </>
            )}
        </Grid>
      </Box>

      {/* FOOTER (Newsletter Toggle mit harter BP-Sperre) */}
      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', px: 3, py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: !isNewsletterAllowed ? 'text.disabled' : 'text.primary' }}>
            Tägliches Briefing als E-Mail erhalten
        </Typography>
        <Tooltip title={!isNewsletterAllowed ? "E-Mail-Versand ist systemseitig deaktiviert." : (effectiveSubscription ? "Abonnement kündigen" : "Jetzt abonnieren")}>
            <FormControlLabel
                control={
                  <Switch 
                    size="medium" 
                    checked={effectiveSubscription} 
                    onChange={handleSubscriptionToggle} 
                    color="primary" 
                    disabled={!isNewsletterAllowed} 
                  />
                }
                label={
                  <Chip 
                    size="small" 
                    label={!isNewsletterAllowed ? "Gesperrt" : (effectiveSubscription ? "Aktiv" : "Inaktiv")} 
                    color={!isNewsletterAllowed ? "default" : (effectiveSubscription ? "primary" : "default")} 
                    variant={effectiveSubscription ? "filled" : "outlined"} 
                    sx={{ ml: 1, fontWeight: 'bold' }} 
                  />
                }
                sx={{ m: 0 }}
            />
        </Tooltip>
      </Box>
    </Box>
  );
};

export default DailyBriefingContent;