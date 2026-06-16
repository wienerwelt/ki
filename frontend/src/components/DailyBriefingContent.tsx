// frontend/src/components/DailyBriefingContent.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Link as MuiLink, FormControlLabel, Switch, Tooltip, 
  CircularProgress, Button, Grid, Paper, Stack, Chip, IconButton, Fade, useTheme, Divider
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
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import ThumbDownOutlinedIcon from '@mui/icons-material/ThumbDownOutlined';
import SearchIcon from '@mui/icons-material/Search';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';

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
  score?: string; // Für zukünftiges Backend-Scoring
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
                bgcolor: 'primary.50',
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
  const effectiveSubscription = isNewsletterAllowed && isSubscribed;
  
  // DYNAMISCHER TRIGGER: Sales vs. Information
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

  const readTime = useMemo(() => {
    const allText = [
        ...topInsights.map((i: any) => `${i.headline} ${i.analysis_summary} ${i.prognosis || ''} ${i.talking_point || ''}`),
        ...regulations.map((i: any) => `${i.headline} ${i.analysis_summary} ${i.talking_point || ''}`),
        ...salesTriggers.map((i: any) => `${i.headline} ${i.analysis_summary} ${i.talking_point}`)
    ].join(' ');
    
    // Zählt alle zusammenhängenden Zeichenblöcke (Wörter)
    const wordCount = allText.split(/\s+/).filter(word => word.length > 0).length;
    return Math.max(1, Math.ceil(wordCount / 200));
  }, [topInsights, regulations, salesTriggers]);

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
          key={i} label={`Quelle ${i+1}`} size="small" icon={<OpenInNewIcon fontSize="small" />} component="a" href={url} 
          target="_blank" clickable variant="outlined" sx={{ mr: 1, mt: 1, fontSize: '0.7rem' }} 
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
             <Chip label={reg.headline.includes('Förder') ? '💰 Förderung (Opportunity)' : '⚖️ Compliance'} size="small" color="secondary" sx={{ mb: 1, fontWeight: 'bold', fontSize: '0.7rem' }} />
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
      
      {isLocked && (
          <Fade in={isLocked}>
            <Box sx={{ 
                position: 'absolute', top: 60, left: 0, right: 0, bottom: 0, zIndex: 10,
                backdropFilter: 'blur(6px)', backgroundColor: 'rgba(255,255,255,0.6)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, textAlign: 'center'
            }}>
                <Box sx={{ bgcolor: 'background.paper', p: 4, borderRadius: 4, boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}>
                    <LockOutlinedIcon color="primary" sx={{ fontSize: 48, mb: 2 }} />
                    <Typography variant="h5" sx={{ fontWeight: 900, mb: 1 }}>Leads & Pitches gesperrt</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 300, mx: 'auto' }}>Helfen Sie der Community mit einer kurzen Abstimmung, um diese handlungsorientierten Leads freizuschalten.</Typography>
                    <Button 
                        variant="contained" 
                        size="large"
                        // DUMMY UI-Aktion
                        onClick={() => showSnackbar('Hier öffnet sich später das Abstimmungs-Modal!', 'info')} 
                        sx={{ borderRadius: 8, px: 4, fontWeight: 'bold' }}
                    >
                        Jetzt abstimmen
                    </Button>
                </Box>
            </Box>
          </Fade>
      )}

      <Stack spacing={3} sx={{ filter: isLocked ? 'blur(5px)' : 'none', transition: 'filter 0.3s' }}>
        {salesTriggers.map((trigger: any, idx: number) => {
          // DUMMY UI: Fake-Scoring generieren
          const isHot = idx % 2 === 0;
          
          return (
          <Box key={idx} sx={{ p: 2.5, bgcolor: '#f8fafc', borderRadius: 3, border: '1px solid #e2e8f0', transition: 'all 0.2s', '&:hover': { borderColor: '#cbd5e1', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' } }}>
             <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                 <Chip 
                    icon={isHot ? <WhatshotIcon sx={{ color: '#ef4444 !important' }}/> : <LightbulbOutlinedIcon />} 
                    label={`Zielkunde: ${trigger.account_name}`} 
                    sx={{ fontWeight: 800, bgcolor: isHot ? '#fee2e2' : '#e0f2fe', color: isHot ? '#991b1b' : '#0369a1', border: 'none' }} 
                    size="small" 
                 />
                 <Stack direction="row" spacing={1}>
                    <Tooltip title="Auf LinkedIn suchen">
                        <IconButton size="small" component="a" href={`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(trigger.account_name)}`} target="_blank" sx={{ bgcolor: '#fff', border: '1px solid #e2e8f0', color: '#0a66c2', '&:hover': { bgcolor: '#f1f5f9' } }}>
                            <LinkedInIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Im Web suchen">
                        <IconButton size="small" component="a" href={`https://www.google.com/search?q=${encodeURIComponent(trigger.account_name)}`} target="_blank" sx={{ bgcolor: '#fff', border: '1px solid #e2e8f0', color: '#64748b', '&:hover': { bgcolor: '#f1f5f9' } }}>
                            <SearchIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                 </Stack>
             </Box>

             <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>{trigger.headline}</Typography>
             <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}><TextWithSearchLinks text={trigger.analysis_summary} namesToLink={names} /></Typography>
             
             {/* PITCH / E-MAIL ENTWURF BEREICH */}
             <Box sx={{ position: 'relative', mt: 3, pt: 3, px: 2.5, pb: 2.5, bgcolor: '#ffffff', borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                 {/* Sprechblasen-Pfeil (Visueller Effekt) */}
                 <Box sx={{ position: 'absolute', top: -10, left: 24, width: 20, height: 20, bgcolor: '#ffffff', borderTop: '1px solid #e2e8f0', borderLeft: '1px solid #e2e8f0', transform: 'rotate(45deg)' }} />
                 
                 <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, color: 'text.secondary' }}>
                     <FormatQuoteIcon fontSize="small" color="disabled" />
                     <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Gesprächsaufhänger / Pitch</Typography>
                 </Box>

                 <Typography variant="body2" sx={{ fontStyle: 'italic', fontWeight: 500, color: '#334155', lineHeight: 1.6, mb: 2 }}>
                    "{trigger.talking_point}"
                 </Typography>

                 <Divider sx={{ my: 1.5 }} />

                 <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     {/* DUMMY UI: KI Feedback */}
                     <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="caption" color="text.disabled" sx={{ mr: 0.5 }}>Ansatz hilfreich?</Typography>
                        <IconButton size="small" onClick={() => showSnackbar('Danke für das Feedback! Wir verbessern den Pitch.', 'success')} sx={{ color: 'text.secondary' }}><ThumbUpOutlinedIcon sx={{ fontSize: 16 }} /></IconButton>
                        <IconButton size="small" onClick={() => showSnackbar('Danke für das Feedback! Wir passen die Prompts an.', 'info')} sx={{ color: 'text.secondary' }}><ThumbDownOutlinedIcon sx={{ fontSize: 16 }} /></IconButton>
                     </Stack>
                     
                     {/* Action Buttons */}
                     <Stack direction="row" spacing={1}>
                        <CopyButton text={trigger.talking_point} />
                        <Tooltip title="Als E-Mail öffnen">
                            <IconButton 
                                size="small" 
                                component="a" 
                                href={`mailto:?subject=${encodeURIComponent(`Bezugnehmend auf: ${trigger.headline}`)}&body=${encodeURIComponent(trigger.talking_point)}`}
                                sx={{ bgcolor: 'primary.50', color: 'primary.main', '&:hover': { bgcolor: 'primary.100' } }}
                            >
                                <EmailOutlinedIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                     </Stack>
                 </Box>
             </Box>
          </Box>
        )})}
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

        {/* BENTO GRID (Dynamisch nach Fokus & Datenverfügbarkeit) */}
        <Grid container spacing={3}>
            {dashboardFocus === 'sales' ? (
                // --- SALES MODUS (Hunter) ---
                <>
                    {salesTriggers.length > 0 ? (
                        <>
                            <Grid item xs={12} md={6}>
                                <SalesTriggersBlock />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Stack spacing={3} sx={{ height: '100%' }}>
                                    {topInsights.length > 0 && <TopInsightsBlock />}
                                    {regulations.length > 0 && <RegulationsBlock />}
                                </Stack>
                            </Grid>
                        </>
                    ) : (
                        // Fallback, wenn Sales-Fokus aktiv, aber heute keine Leads da sind -> Volle Breite
                        <Grid item xs={12}>
                            <Stack spacing={3} sx={{ height: '100%' }}>
                                {topInsights.length > 0 && <TopInsightsBlock />}
                                {regulations.length > 0 && <RegulationsBlock />}
                            </Stack>
                        </Grid>
                    )}
                </>
            ) : (
                // --- INFORMATION MODUS (Strategie) ---
                <>
                    <Grid item xs={12} md={salesTriggers.length > 0 ? 8 : 12}>
                        <Stack spacing={3} sx={{ height: '100%' }}>
                            {topInsights.length > 0 && <TopInsightsBlock />}
                            {regulations.length > 0 && salesTriggers.length === 0 && <RegulationsBlock />}
                        </Stack>
                    </Grid>
                    {salesTriggers.length > 0 && (
                        <Grid item xs={12} md={4}>
                            <Stack spacing={3} sx={{ height: '100%' }}>
                                {regulations.length > 0 && <RegulationsBlock />}
                                <SalesTriggersBlock />
                            </Stack>
                        </Grid>
                    )}
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