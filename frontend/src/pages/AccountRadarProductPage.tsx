import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  AppBar,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Toolbar,
  Typography,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import RadarIcon from '@mui/icons-material/Radar';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import QueryStatsOutlinedIcon from '@mui/icons-material/QueryStatsOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import posthog from 'posthog-js';
import apiClient from '../apiClient';
import { useAuth } from '../context/AuthContext';

const demoSignals = [
  {
    account: 'AlpenLogistik GmbH',
    signal: 'Neue Standorte angekündigt',
    action: 'Bedarf und Ansprechpartner prüfen',
    score: 91,
  },
  {
    account: 'Nordlicht Mobility',
    signal: 'Leitung Einkauf neu besetzt',
    action: 'Kontaktaufnahme vorbereiten',
    score: 84,
  },
  {
    account: 'TransFleet Solutions',
    signal: 'Investition in Ladeinfrastruktur',
    action: 'Passendes Angebot zuordnen',
    score: 79,
  },
];

const valueCards = [
  {
    icon: <ScheduleOutlinedIcon />,
    title: 'Weniger suchen',
    text: 'Relevante Veränderungen bei Kunden, Interessenten und Wettbewerbern werden gebündelt.',
  },
  {
    icon: <AutoAwesomeIcon />,
    title: 'Besser verstehen',
    text: 'Jedes Signal erhält Kontext, Relevanz und einen verständlichen nächsten Schritt.',
  },
  {
    icon: <BusinessCenterIcon />,
    title: 'Früher handeln',
    text: 'Teams erkennen den richtigen Zeitpunkt für Kontakt, Angebot oder Kundenpflege.',
  },
];

const salesPlans = [
  {
    key: 'basic',
    name: 'Sales Basic',
    subtitle: 'Für den strukturierten Einstieg',
    features: ['Bis 250 Accounts', 'Account- und Kontakt-Workflows', 'Team-Zuweisung', 'Wöchentlicher Radar an bis zu 3 Empfänger', 'CSV-Export', 'Datenqualitätsprüfung'],
    highlighted: false,
  },
  {
    key: 'premium',
    name: 'Sales Premium',
    subtitle: 'Für aktive Sales-Teams und größere Bestände',
    features: ['Bis 5.000 Accounts', 'CSV-/Excel-Import mit bis zu 1.000 Zeilen', 'Täglicher, werktäglicher oder wöchentlicher Radar', 'Bis zu 25 Empfänger', 'Wettbewerber-Monitoring', 'Sales-Erfolg, Pipeline-Analyse und Management-PDF', 'KI-Sales-Kontext', 'Mandantengebundene API mit bis zu 5 Tokens'],
    highlighted: true,
  },
];

type RequestReason = 'pilot' | 'upgrade' | 'purchase' | 'renewal';

const requestReasonLabels: Record<RequestReason, string> = {
  pilot: '14-Tage-Pilot',
  upgrade: 'Paketwechsel',
  purchase: 'Abo-Kauf',
  renewal: 'Abo-Verlängerung',
};

const AccountRadarProductPage: React.FC = () => {
  const theme = useTheme();
  const { user } = useAuth();
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'basic' | 'premium'>('premium');
  const [requestReason, setRequestReason] = useState<RequestReason>('pilot');
  const [leadForm, setLeadForm] = useState({ name: '', organization: '', email: '', phone: '', message: '', website: '' });
  const [formStartedAt, setFormStartedAt] = useState(0);
  const [formToken, setFormToken] = useState('');
  const [formReady, setFormReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const hasExistingSalesAccess = Boolean(user?.tenant_modules?.includes('sales'));
  const isLeadFormValid = useMemo(() => {
    const message = leadForm.message.trim();
    return leadForm.name.trim().length >= 2
      && leadForm.organization.trim().length >= 2
      && /^\S+@\S+\.\S+$/.test(leadForm.email.trim())
      && message.length >= 10
      && message.length <= 1000
      && !leadForm.website.trim();
  }, [leadForm]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Mobiliti Account-Radar | Relevante Signale. Klare nächste Schritte.';

    const pageDescription = 'Der Mobiliti Account-Radar erkennt relevante Veränderungen bei Kunden, Interessenten und Wettbewerbern und macht daraus klare nächste Schritte.';
    const metaDefinitions = [
      { selector: 'meta[name="description"]', attribute: 'name', key: 'description', value: pageDescription },
      { selector: 'meta[property="og:title"]', attribute: 'property', key: 'og:title', value: 'Mobiliti Account-Radar' },
      { selector: 'meta[property="og:description"]', attribute: 'property', key: 'og:description', value: pageDescription },
      { selector: 'meta[property="og:url"]', attribute: 'property', key: 'og:url', value: 'https://dashboard.mobiliti.at/account-radar' },
    ];
    const metaState = metaDefinitions.map((definition) => {
      let element = document.querySelector(definition.selector) as HTMLMetaElement | null;
      const created = !element;
      const previousValue = element?.content || '';
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(definition.attribute, definition.key);
        document.head.appendChild(element);
      }
      element.content = definition.value;
      return { element, created, previousValue };
    });

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    const createdCanonical = !canonical;
    const previousCanonical = canonical?.href || '';
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = 'https://dashboard.mobiliti.at/account-radar';

    return () => {
      document.title = previousTitle;
      metaState.forEach(({ element, created, previousValue }) => {
        if (created) element.remove();
        else element.content = previousValue;
      });
      if (createdCanonical) canonical?.remove();
      else if (canonical) canonical.href = previousCanonical;
    };
  }, []);

  const openLeadDialog = (plan: 'basic' | 'premium' = 'premium', reason: RequestReason = 'pilot') => {
    const startedAt = Date.now();
    const randomValues = new Uint32Array(4);
    window.crypto.getRandomValues(randomValues);
    setSelectedPlan(plan);
    setRequestReason(reason);
    setFormStartedAt(startedAt);
    setFormToken(Array.from(randomValues).join('-'));
    setFormReady(false);
    setSubmitError(null);
    setSubmitted(false);
    setLeadDialogOpen(true);
    window.setTimeout(() => setFormReady(true), 3600);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedReason = params.get('request');
    if (!['upgrade', 'renewal'].includes(String(requestedReason || ''))) return;
    const timeout = window.setTimeout(() => openLeadDialog(
      params.get('plan') === 'basic' ? 'basic' : 'premium',
      requestedReason as RequestReason
    ), 250);
    return () => window.clearTimeout(timeout);
  }, []);

  const primary = theme.palette.primary.main;
  const dark = '#0b1528';
  const trackCta = (placement: string, target: RequestReason | 'login') => {
    posthog.capture('account_radar_public_cta_clicked', { placement, target });
  };

  const submitLead = async () => {
    const cleanName = leadForm.name.trim();
    const cleanOrganization = leadForm.organization.trim();
    const cleanEmail = leadForm.email.trim().toLowerCase();
    const cleanMessage = leadForm.message.trim();
    if (!isLeadFormValid) {
      setSubmitError('Bitte alle Pflichtfelder vollständig und gültig ausfüllen. Die Nachricht muss 10 bis 1.000 Zeichen enthalten.');
      return;
    }
    if ((cleanMessage.match(/https?:\/\/|www\./gi) || []).length > 2) {
      setSubmitError('Bitte höchstens zwei Links in der Nachricht verwenden.');
      return;
    }
    if (!formReady) {
      setSubmitError('Das Formular wird noch vorbereitet. Bitte einen Moment warten.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const planLabel = selectedPlan === 'premium' ? 'Sales Premium' : 'Sales Basic';
      const reasonLabel = requestReasonLabels[requestReason];
      const response = await apiClient.post('/api/public/contact', {
        name: cleanName,
        org: cleanOrganization,
        email: cleanEmail,
        audience: `Account-Radar · ${planLabel} · ${reasonLabel}`,
        message: `${cleanMessage}\n\nTelefon: ${leadForm.phone.trim() || 'nicht angegeben'}\nGewünschtes Paket: ${planLabel}\nAnlass: ${reasonLabel}`,
        website: leadForm.website,
        form_started_at: formStartedAt,
        form_token: formToken,
        type: 'demo_request',
      });
      if (!response.res.ok) throw new Error(response.data?.message || 'Die Anfrage konnte nicht gesendet werden.');
      setSubmitted(true);
      posthog.capture('account_radar_lead_submitted', { plan: selectedPlan, reason: requestReason });
    } catch (error: any) {
      setSubmitError(error.message || 'Die Anfrage konnte nicht gesendet werden.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f7fb', color: dark }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: alpha('#ffffff', 0.94), color: dark, borderBottom: '1px solid #e4e8f0', backdropFilter: 'blur(12px)' }}>
        <Toolbar sx={{ maxWidth: 1240, width: '100%', mx: 'auto', minHeight: { xs: 64, md: 72 } }}>
          <Box component="img" src="/favicon.svg" alt="Mobiliti" sx={{ width: 38, height: 38, mr: 1.25 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 950, lineHeight: 1.05 }}>Mobiliti</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 750 }}>Account-Radar</Typography>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <Button component={RouterLink} to={user ? '/radar' : '/login?next=/radar'} onClick={() => trackCta('header', 'login')} variant="text" sx={{ display: { xs: 'none', sm: 'inline-flex' }, fontWeight: 850, mr: 1 }}>
            {user ? 'Zum Radar' : 'Anmelden'}
          </Button>
          <Button onClick={() => { trackCta('header', 'pilot'); openLeadDialog(); }} variant="contained" endIcon={<ArrowForwardIcon />} sx={{ fontWeight: 900, borderRadius: 999 }}>
            Pilot anfragen
          </Button>
        </Toolbar>
      </AppBar>

      <Box
        component="main"
        sx={{
          overflow: 'hidden',
          background: `radial-gradient(circle at 12% 8%, ${alpha(primary, 0.13)}, transparent 32%), radial-gradient(circle at 92% 20%, ${alpha('#ff9800', 0.12)}, transparent 28%)`,
        }}
      >
        <Container maxWidth="lg" sx={{ pt: { xs: 6, md: 10 }, pb: { xs: 7, md: 11 } }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.04fr) minmax(400px, 0.96fr)' }, gap: { xs: 5, md: 8 }, alignItems: 'center' }}>
            <Box>
              <Chip icon={<RadarIcon />} label="SIGNAL INTELLIGENCE" sx={{ mb: 2.5, bgcolor: alpha(primary, 0.1), color: primary, fontWeight: 950, letterSpacing: '0.06em' }} />
              <Typography component="h1" sx={{ fontSize: { xs: '2.55rem', sm: '3.6rem', md: '4.25rem' }, lineHeight: 0.98, letterSpacing: '-0.045em', fontWeight: 950, maxWidth: 760 }}>
                Erkennen, wann Kunden und Märkte in Bewegung kommen.
              </Typography>
              <Typography sx={{ mt: 3, maxWidth: 670, color: '#526075', fontSize: { xs: '1.05rem', md: '1.25rem' }, lineHeight: 1.6 }}>
                Relevante Veränderungen bei Kunden, Interessenten und Wettbewerbern – priorisiert, erklärt und mit einem klaren nächsten Schritt.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 4 }}>
                <Button onClick={() => { trackCta('hero', 'pilot'); openLeadDialog(); }} size="large" variant="contained" endIcon={<ArrowForwardIcon />} sx={{ minHeight: 52, px: 3, fontWeight: 900, borderRadius: 2.5 }}>
                  14-Tage-Pilot anfragen
                </Button>
                <Button component={RouterLink} to="/login?next=/radar" onClick={() => trackCta('hero', 'login')} size="large" variant="outlined" sx={{ minHeight: 52, px: 3, fontWeight: 900, borderRadius: 2.5, bgcolor: '#fff' }}>
                  Zum geschützten Radar
                </Button>
              </Stack>
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mt: 3 }}>
                {['Mandantengetrennt', 'White-Label-fähig', 'Mobil nutzbar'].map((item) => (
                  <Stack key={item} direction="row" spacing={0.7} alignItems="center">
                    <CheckCircleOutlineIcon sx={{ fontSize: 18, color: primary }} />
                    <Typography variant="body2" sx={{ fontWeight: 800, color: '#526075' }}>{item}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>

            <Paper elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 5, bgcolor: dark, color: '#fff', boxShadow: '0 28px 80px rgba(9, 22, 45, 0.22)', transform: { md: 'rotate(1.2deg)' } }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2.25 }}>
                <Box sx={{ width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: 2.5, bgcolor: alpha('#fff', 0.1) }}><RadarIcon /></Box>
                <Box>
                  <Typography sx={{ fontWeight: 950 }}>Heute im Account-Radar</Typography>
                  <Typography variant="caption" sx={{ color: alpha('#fff', 0.62) }}>3 priorisierte Signale</Typography>
                </Box>
                <Box sx={{ flexGrow: 1 }} />
                <Chip label="DEMO-DATEN" size="small" sx={{ bgcolor: alpha('#fff', 0.1), color: '#fff', fontWeight: 900, fontSize: '0.62rem' }} />
              </Stack>

              <Stack spacing={1.25}>
                {demoSignals.map((item, index) => (
                  <Paper key={item.account} elevation={0} sx={{ p: 1.6, borderRadius: 3, bgcolor: alpha('#fff', index === 0 ? 0.115 : 0.07), color: '#fff', border: `1px solid ${alpha('#fff', 0.08)}` }}>
                    <Stack direction="row" spacing={1.2} alignItems="flex-start">
                      <Box sx={{ width: 34, height: 34, flexShrink: 0, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: index === 0 ? primary : alpha('#fff', 0.1), fontWeight: 950 }}>{index + 1}</Box>
                      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                        <Stack direction="row" justifyContent="space-between" spacing={1}>
                          <Typography sx={{ fontWeight: 900, lineHeight: 1.25 }}>{item.account}</Typography>
                          <Typography variant="caption" sx={{ color: index === 0 ? '#7ee2a8' : alpha('#fff', 0.7), fontWeight: 950 }}>{item.score}%</Typography>
                        </Stack>
                        <Typography variant="body2" sx={{ mt: 0.35, color: alpha('#fff', 0.78) }}>{item.signal}</Typography>
                        <Typography variant="caption" sx={{ mt: 0.75, display: 'block', color: '#7ee2a8', fontWeight: 850 }}>Nächster Schritt: {item.action}</Typography>
                      </Box>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
              <Typography variant="caption" sx={{ mt: 1.5, display: 'block', color: alpha('#fff', 0.48), textAlign: 'center' }}>
                Rein illustrative Beispieldaten – keine echten Unternehmen oder Mandantensignale.
              </Typography>
            </Paper>
          </Box>
        </Container>

        <Box sx={{ bgcolor: '#fff', borderTop: '1px solid #e8ebf1', borderBottom: '1px solid #e8ebf1' }}>
          <Container maxWidth="lg" sx={{ py: { xs: 7, md: 10 } }}>
            <Typography variant="overline" sx={{ color: primary, fontWeight: 950, letterSpacing: '0.12em' }}>VOM CONTENT ZUR AKTION</Typography>
            <Typography component="h2" sx={{ mt: 0.5, mb: 4, maxWidth: 760, fontSize: { xs: '2rem', md: '2.8rem' }, fontWeight: 950, lineHeight: 1.1, letterSpacing: '-0.03em' }}>
              Das Dashboard zeigt, was passiert. Der Radar zeigt, wo es für Ihr Geschäft wichtig wird.
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
              {valueCards.map((card) => (
                <Paper key={card.title} elevation={0} sx={{ p: 3, border: '1px solid #e5e9f0', borderRadius: 4 }}>
                  <Box sx={{ width: 48, height: 48, display: 'grid', placeItems: 'center', borderRadius: 3, bgcolor: alpha(primary, 0.1), color: primary, mb: 2 }}>{card.icon}</Box>
                  <Typography variant="h6" sx={{ fontWeight: 950 }}>{card.title}</Typography>
                  <Typography sx={{ mt: 1, color: '#627086', lineHeight: 1.6 }}>{card.text}</Typography>
                </Paper>
              ))}
            </Box>
          </Container>
        </Box>

        <Box id="pakete" sx={{ bgcolor: '#fff', borderBottom: '1px solid #e8ebf1', scrollMarginTop: 80 }}>
          <Container maxWidth="lg" sx={{ py: { xs: 7, md: 10 } }}>
            <Typography variant="overline" sx={{ color: primary, fontWeight: 950, letterSpacing: '0.12em' }}>PASSEND ZUM VERTRIEB</Typography>
            <Typography component="h2" sx={{ mt: 0.5, fontSize: { xs: '2rem', md: '2.8rem' }, fontWeight: 950, lineHeight: 1.1, letterSpacing: '-0.03em' }}>
              Klarer Einstieg. Professionell skalierbar.
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2.5, mt: 4 }}>
              {salesPlans.map((plan) => {
                const planKey = plan.key as 'basic' | 'premium';
                const currentPlan = user?.tenant_sales_plan || 'basic';
                const isCurrentPlan = hasExistingSalesAccess && currentPlan === planKey;
                const commercialReason: RequestReason = isCurrentPlan
                  ? 'renewal'
                  : hasExistingSalesAccess ? 'upgrade' : 'purchase';
                const commercialLabel = isCurrentPlan
                  ? 'Abo verlängern'
                  : hasExistingSalesAccess ? `Zu ${plan.name} wechseln` : 'Abo kaufen';

                return (
                  <Paper
                    key={plan.name}
                    elevation={0}
                    sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: 4, border: '1px solid', borderColor: plan.highlighted ? primary : '#e5e9f0', bgcolor: plan.highlighted ? alpha(primary, 0.045) : '#fff', display: 'flex', flexDirection: 'column', height: '100%' }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                      <Stack direction="row" spacing={1.4} alignItems="center">
                        <Box sx={{ width: 48, height: 48, display: 'grid', placeItems: 'center', borderRadius: 3, bgcolor: plan.highlighted ? primary : alpha(primary, 0.1), color: plan.highlighted ? '#fff' : primary, flexShrink: 0 }}>
                          {plan.key === 'premium' ? <WorkspacePremiumOutlinedIcon /> : <RocketLaunchOutlinedIcon />}
                        </Box>
                        <Box>
                          <Typography variant="h5" sx={{ fontWeight: 950 }}>{plan.name}</Typography>
                          <Typography variant="body2" sx={{ mt: 0.4, color: '#627086' }}>{plan.subtitle}</Typography>
                        </Box>
                      </Stack>
                      {isCurrentPlan
                        ? <Chip label="AKTUELL" color="success" sx={{ fontWeight: 900 }} />
                        : plan.highlighted && <Chip label="PROFI" color="primary" sx={{ fontWeight: 900 }} />}
                    </Stack>
                    <Typography variant="h6" sx={{ mt: 2.5, fontWeight: 950 }}>Individuelles Angebot</Typography>
                    <Typography variant="caption" sx={{ color: '#627086' }}>14-Tage-Pilot vor der Freischaltung</Typography>
                    <Stack spacing={1.2} sx={{ mt: 3, flexGrow: 1 }}>
                      {plan.features.map((feature) => (
                        <Stack key={feature} direction="row" spacing={1} alignItems="flex-start">
                          <CheckCircleOutlineIcon sx={{ mt: 0.15, color: primary, fontSize: 20 }} />
                          <Typography variant="body2" sx={{ fontWeight: 750 }}>{feature}</Typography>
                        </Stack>
                      ))}
                    </Stack>
                    <Stack spacing={1} sx={{ mt: 3 }}>
                      <Button
                        onClick={() => {
                          trackCta(`plan-${plan.key}-${commercialReason}`, commercialReason);
                          openLeadDialog(planKey, commercialReason);
                        }}
                        variant={plan.highlighted || isCurrentPlan ? 'contained' : 'outlined'}
                        fullWidth
                        size="large"
                        sx={{ minHeight: 54, fontWeight: 950, fontSize: '1rem' }}
                      >
                        {commercialLabel}
                      </Button>
                      <Button
                        onClick={() => {
                          trackCta(`plan-${plan.key}-pilot`, 'pilot');
                          openLeadDialog(planKey, 'pilot');
                        }}
                        variant="text"
                        fullWidth
                        sx={{ minHeight: 42, fontWeight: 850 }}
                      >
                        14-Tage-Pilot anfragen
                      </Button>
                    </Stack>
                  </Paper>
                );
              })}
            </Box>
          </Container>
        </Box>

        <Container maxWidth="lg" sx={{ py: { xs: 7, md: 10 } }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '0.85fr 1.15fr' }, gap: { xs: 4, md: 8 }, alignItems: 'center' }}>
            <Box>
              <Typography variant="overline" sx={{ color: primary, fontWeight: 950, letterSpacing: '0.12em' }}>EINFACH IM ALLTAG</Typography>
              <Typography component="h2" sx={{ mt: 0.5, fontSize: { xs: '2rem', md: '2.8rem' }, fontWeight: 950, lineHeight: 1.1, letterSpacing: '-0.03em' }}>
                Fünf wichtige Signale statt fünfzig offene Tabs.
              </Typography>
              <Typography sx={{ mt: 2, color: '#627086', lineHeight: 1.7 }}>
                Mobil werden Signale gelesen, bewertet und erledigt. Accounts, Suchprofile und Auswertungen werden komfortabel am Desktop verwaltet.
              </Typography>
            </Box>
            <Stack spacing={1.5}>
              {[
                ['1', 'Accounts auswählen', 'Kunden, Interessenten und Wettbewerber gezielt beobachten.'],
                ['2', 'Signale priorisieren', 'Relevanz, Kontext und Handlungsoption auf einen Blick erhalten.'],
                ['3', 'Nächsten Schritt auslösen', 'Öffnen, zuweisen, erledigen oder als nicht relevant markieren.'],
              ].map(([number, title, text]) => (
                <Paper key={number} elevation={0} sx={{ p: 2.2, borderRadius: 3.5, border: '1px solid #e5e9f0', display: 'flex', gap: 2, alignItems: 'center' }}>
                  <Box sx={{ width: 42, height: 42, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 99, bgcolor: primary, color: '#fff', fontWeight: 950 }}>{number}</Box>
                  <Box>
                    <Typography sx={{ fontWeight: 950 }}>{title}</Typography>
                    <Typography variant="body2" sx={{ color: '#627086', mt: 0.25 }}>{text}</Typography>
                  </Box>
                </Paper>
              ))}
            </Stack>
          </Box>

          <Paper elevation={0} sx={{ mt: { xs: 7, md: 10 }, p: { xs: 3, md: 5 }, borderRadius: 5, bgcolor: dark, color: '#fff', overflow: 'hidden', position: 'relative' }}>
            <Box sx={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', bgcolor: alpha(primary, 0.22), filter: 'blur(12px)', right: -90, top: -120 }} />
            <Box sx={{ position: 'relative', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr auto' }, gap: 3, alignItems: 'center' }}>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}><LockOutlinedIcon /><Typography variant="overline" sx={{ fontWeight: 950, letterSpacing: '0.12em' }}>GESCHÜTZTES MANDANTENWISSEN</Typography></Stack>
                <Typography variant="h4" sx={{ fontWeight: 950, letterSpacing: '-0.025em' }}>Echte Ergebnisse bleiben intern.</Typography>
                <Typography sx={{ mt: 1.5, color: alpha('#fff', 0.7), maxWidth: 760, lineHeight: 1.65 }}>
                  Öffentliche Seiten erklären ausschließlich den Nutzen. Accountlisten, Signale, Bewertungen, Ansprechpartner und Aktivitäten werden nur authentifiziert und mandantenspezifisch bereitgestellt.
                </Typography>
              </Box>
              <Stack spacing={1.1} sx={{ minWidth: { md: 230 } }}>
                <Chip icon={<LockOutlinedIcon />} label="Keine Ergebnisdaten öffentlich" sx={{ justifyContent: 'flex-start', bgcolor: alpha('#fff', 0.1), color: '#fff', fontWeight: 850 }} />
                <Chip icon={<QueryStatsOutlinedIcon />} label="Messbare Nutzung" sx={{ justifyContent: 'flex-start', bgcolor: alpha('#fff', 0.1), color: '#fff', fontWeight: 850 }} />
                <Chip icon={<NotificationsActiveOutlinedIcon />} label="Briefing als Einstieg" sx={{ justifyContent: 'flex-start', bgcolor: alpha('#fff', 0.1), color: '#fff', fontWeight: 850 }} />
              </Stack>
            </Box>
          </Paper>

          <Box sx={{ py: { xs: 8, md: 11 }, textAlign: 'center' }}>
            <Chip label="PILOT" sx={{ fontWeight: 950, color: primary, bgcolor: alpha(primary, 0.1) }} />
            <Typography component="h2" sx={{ mt: 2, fontSize: { xs: '2rem', md: '3rem' }, fontWeight: 950, lineHeight: 1.08, letterSpacing: '-0.035em' }}>
              20 ausgewählte Unternehmen.<br />14 Tage. Ein persönlicher Signalreport.
            </Typography>
            <Typography sx={{ mt: 2, color: '#627086', maxWidth: 690, mx: 'auto', lineHeight: 1.7 }}>
              Gemeinsam prüfen wir Relevanz, Zeitersparnis und konkrete Handlungsimpulse – bevor der Radar im Team ausgerollt wird.
            </Typography>
            <Button onClick={() => { trackCta('pilot', 'pilot'); openLeadDialog(); }} size="large" variant="contained" endIcon={<ArrowForwardIcon />} sx={{ mt: 3.5, px: 4, minHeight: 54, borderRadius: 2.5, fontWeight: 950 }}>
              Pilotgespräch starten
            </Button>
          </Box>
        </Container>
      </Box>

      <Box component="footer" sx={{ bgcolor: '#fff', borderTop: '1px solid #e5e9f0' }}>
        <Container maxWidth="lg" sx={{ py: 3 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
            <Typography variant="body2" sx={{ fontWeight: 850 }}>Mobiliti Account-Radar</Typography>
            <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
            <Typography variant="caption" color="text.secondary">Relevante Signale. Klare nächste Schritte.</Typography>
            <Box sx={{ flexGrow: 1 }} />
            <Link href="https://www.mobiliti.at" target="_blank" rel="noopener noreferrer" underline="hover">mobiliti.at</Link>
            <Link component={RouterLink} to="/privacy" underline="hover">Datenschutz</Link>
            <Link component={RouterLink} to={user ? '/radar' : '/login?next=/radar'} underline="hover">{user ? 'Zum Radar' : 'Anmelden'}</Link>
          </Stack>
        </Container>
      </Box>

      <Dialog open={leadDialogOpen} onClose={() => !submitting && setLeadDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 950 }}>
          {requestReason === 'pilot' ? '14-Tage-Pilot anfragen' : `${requestReasonLabels[requestReason]} anfragen`}
        </DialogTitle>
        <DialogContent dividers>
          {submitted ? (
            <Alert severity="success">
              Vielen Dank. Ihre Anfrage ist eingegangen und wird persönlich geprüft. Es wurde noch kein kostenpflichtiger Zugang aktiviert.
            </Alert>
          ) : (
            <Stack spacing={2} sx={{ pt: 0.5 }}>
              <Alert severity="info">
                {requestReason === 'pilot'
                  ? 'Unverbindlicher 14-Tage-Pilot. Paket und Start werden persönlich abgestimmt.'
                  : 'Ihre Kauf-, Wechsel- oder Verlängerungsanfrage wird persönlich bestätigt. Mit dem Absenden entsteht noch kein kostenpflichtiger Zugang.'}
              </Alert>
              <TextField select label="Gewünschtes Paket" value={selectedPlan} onChange={(event) => setSelectedPlan(event.target.value as 'basic' | 'premium')} fullWidth>
                <MenuItem value="basic">Sales Basic</MenuItem>
                <MenuItem value="premium">Sales Premium</MenuItem>
              </TextField>
              <TextField label="Name" required value={leadForm.name} onChange={(event) => setLeadForm((current) => ({ ...current, name: event.target.value }))} fullWidth inputProps={{ maxLength: 120 }} />
              <TextField label="Organisation" required value={leadForm.organization} onChange={(event) => setLeadForm((current) => ({ ...current, organization: event.target.value }))} fullWidth inputProps={{ maxLength: 200 }} />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="E-Mail" type="email" required value={leadForm.email} onChange={(event) => setLeadForm((current) => ({ ...current, email: event.target.value }))} fullWidth inputProps={{ maxLength: 254 }} />
                <TextField label="Telefon (optional)" value={leadForm.phone} onChange={(event) => setLeadForm((current) => ({ ...current, phone: event.target.value }))} fullWidth inputProps={{ maxLength: 80 }} />
              </Stack>
              <TextField
                label="Was möchten Sie mit dem Account-Radar erreichen?"
                required
                multiline
                minRows={3}
                value={leadForm.message}
                onChange={(event) => setLeadForm((current) => ({ ...current, message: event.target.value }))}
                fullWidth
                inputProps={{ maxLength: 1000 }}
                helperText={`${leadForm.message.length}/1.000 Zeichen · mindestens 10 Zeichen`}
              />
              <TextField aria-hidden="true" tabIndex={-1} value={leadForm.website} onChange={(event) => setLeadForm((current) => ({ ...current, website: event.target.value }))} sx={{ position: 'absolute', left: -10000, width: 1, height: 1, overflow: 'hidden' }} />
              <Typography variant="caption" color="text.secondary">Mit dem Absenden stimmen Sie der Verarbeitung zur Bearbeitung Ihrer Anfrage zu. Details finden Sie in der <Link component={RouterLink} to="/privacy">Datenschutzerklärung</Link>.</Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, flexWrap: 'wrap', gap: 1, bgcolor: 'background.paper' }}>
          {!submitted && submitError && <Alert severity="error" sx={{ width: '100%', mb: 0.5 }}>{submitError}</Alert>}
          {!submitted && !isLeadFormValid && (
            <Typography variant="caption" color="text.secondary" sx={{ width: '100%' }}>
              Der Senden-Button wird aktiv, sobald alle Pflichtfelder gültig ausgefüllt sind.
            </Typography>
          )}
          <Button onClick={() => setLeadDialogOpen(false)} disabled={submitting}>{submitted ? 'Schließen' : 'Abbrechen'}</Button>
          {!submitted && (
            <Button onClick={submitLead} variant="contained" disabled={submitting || !formReady || !isLeadFormValid}>
              {submitting ? <CircularProgress size={22} color="inherit" /> : !formReady ? 'Formular wird vorbereitet …' : 'Anfrage senden'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AccountRadarProductPage;
