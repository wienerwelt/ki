import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, CircularProgress, Container, Dialog, DialogContent, DialogTitle,
  Grid, IconButton, Paper, Stack, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import LaunchIcon from '@mui/icons-material/Launch';
import apiClient from '../apiClient';
import PublicPortalHeader, { PublicPortalNavItem } from '../components/PublicPortalHeader';
import { useSnackbar } from '../context/SnackbarContext';

type ModuleKey = 'content' | 'sales' | 'community' | 'public_page' | 'admin';
type PlatformUpdate = {
  id: string; slug: string; title: string; summary: string; body: string; benefits: string | null;
  modules: ModuleKey[]; image_url: string | null; action_required: boolean; action_text: string | null;
  published_at: string; updated_at: string;
};
const MODULE_LABELS: Record<ModuleKey, string> = { content: 'Content', sales: 'Sales / Account-Radar', community: 'Community', public_page: 'Publicpage', admin: 'Administration' };
const resolveAssetUrl = (value?: string | null) => {
  const url = String(value || '').trim();
  if (!url) return null;
  if (/^(?:https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('/')) return url;
  return `/${url.replace(/^\/+/, '')}`;
};

const PublicPlatformUpdatesPage: React.FC = () => {
  const { partnerSlug } = useParams<{ partnerSlug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showSnackbar } = useSnackbar();
  const partnerCode = partnerSlug || '5649c95a';
  const [context, setContext] = useState<any>(null);
  const [items, setItems] = useState<PlatformUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moduleFilter, setModuleFilter] = useState<ModuleKey | 'all'>('all');

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiClient.get(`/api/public/context?partnerCode=${encodeURIComponent(partnerCode)}`).then(async (contextResponse) => {
      if (!active) return;
      if (!contextResponse.res.ok) throw new Error('Mandantenportal konnte nicht geladen werden.');
      const partnerId = contextResponse.data?.partner?.id;
      if (!partnerId) throw new Error('Mandant konnte nicht zugeordnet werden.');
      const updatesResponse = await apiClient.get(`/api/public/platform-updates?partnerId=${encodeURIComponent(partnerId)}`);
      if (!active) return;
      if (!updatesResponse.res.ok) throw new Error(updatesResponse.data?.message || 'Plattform-Updates konnten nicht geladen werden.');
      setContext(contextResponse.data);
      setItems(Array.isArray(updatesResponse.data) ? updatesResponse.data : []);
    }).catch((cause) => { if (active) setError(cause.message || 'Plattform-Updates konnten nicht geladen werden.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [partnerCode]);

  const partner = context?.partner;
  const theme = context?.theme || {};
  const primaryColor = theme.primary_color || partner?.primary_color || '#159447';
  const secondaryColor = theme.secondary_color || '#0B2442';
  const darkColor = '#061B33';
  const partnerName = partner?.name || 'Mobiliti';
  const partnerClaim = partner?.claim || 'Gemeinsam. Stärker. Zukunft.';
  const logoUrl = resolveAssetUrl(partner?.logo_url);
  const slug = partner?.slug || partnerSlug || '';
  const homePath = slug ? `/${encodeURIComponent(slug)}` : '/';
  const updatesPath = homePath === '/' ? '/plattform-updates' : `${homePath}/plattform-updates`;
  const partnerWebsite = String(partner?.url_businesspartner || '');
  const selected = items.find((item) => item.slug === searchParams.get('update')) || null;
  const filtered = useMemo(() => moduleFilter === 'all' ? items : items.filter((item) => item.modules.includes(moduleFilter)), [items, moduleFilter]);
  const availableModules = useMemo(() => Array.from(new Set(items.flatMap((item) => item.modules))), [items]);

  useEffect(() => {
    if (!partner) return;
    const title = `Neu im Mitglieder-Dashboard | ${partnerName}`;
    const description = `Neue Funktionen und Verbesserungen im Mitglieder-Dashboard von ${partnerName} – verständlich erklärt und dauerhaft zum Nachlesen.`.slice(0, 160);
    const canonicalUrl = `${window.location.origin}${updatesPath}`;
    document.title = title;
    const setMeta = (selector: string, attribute: 'name' | 'property', key: string, value: string) => {
      let element = document.head.querySelector(selector) as HTMLMetaElement | null;
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, key);
        document.head.appendChild(element);
      }
      element.content = value;
    };
    setMeta('meta[name="description"]', 'name', 'description', description);
    setMeta('meta[property="og:title"]', 'property', 'og:title', title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;
  }, [partner, partnerName, updatesPath]);

  const openPartnerWebsite = () => {
    if (!partnerWebsite) {
      showSnackbar('Für diesen Mandanten ist noch keine Homepage hinterlegt.', 'info');
      return;
    }
    const target = /^https?:\/\//i.test(partnerWebsite) ? partnerWebsite : `https://${partnerWebsite}`;
    window.open(target, '_blank', 'noopener,noreferrer');
  };
  const navItems: PublicPortalNavItem[] = [
    { label: 'Start', onClick: () => navigate(homePath) },
    { label: 'Für Mitglieder', badge: Number(context?.stats?.community_members) || null, onClick: () => navigate(`${homePath}?login=1`) },
    { label: 'Branchennetzwerk', badge: (Number(context?.stats?.total_directory_entries) || 0) + (Number(context?.stats?.total_software_entries) || 0), onClick: () => navigate(`${homePath}#branchenverzeichnis`) },
    { label: 'Neu im Dashboard', badge: items.length || null, onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
    { label: 'Community', badge: Number(context?.stats?.community_activity) || null, onClick: () => navigate(`${homePath}?login=1`) },
    { label: 'Mehr', onClick: openPartnerWebsite },
  ];

  const itemUrl = (item: PlatformUpdate) => `${window.location.origin}${updatesPath}?update=${encodeURIComponent(item.slug)}`;
  const openItem = (item: PlatformUpdate) => { const next = new URLSearchParams(searchParams); next.set('update', item.slug); setSearchParams(next); };
  const closeItem = () => { const next = new URLSearchParams(searchParams); next.delete('update'); setSearchParams(next, { replace: true }); };

  if (loading) return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress sx={{ color: primaryColor }} /></Box>;

  return <Box sx={{ minHeight: '100vh', bgcolor: '#f5f8fb', color: darkColor }}>
    <PublicPortalHeader logoUrl={logoUrl} homeHref={homePath} partnerName={partnerName} partnerClaim={partnerClaim} primaryColor={primaryColor} secondaryColor={secondaryColor} darkColor={darkColor} navItems={navItems} activeLabel="Neu im Dashboard" onLogin={() => navigate(`${homePath}?login=1`)} />
    <Box sx={{ background: `linear-gradient(135deg, ${darkColor} 0%, ${primaryColor} 160%)`, color: '#fff', py: { xs: 5, md: 8 } }}>
      <Container maxWidth="lg"><Button startIcon={<ArrowBackIcon />} onClick={() => navigate(homePath)} sx={{ color: alpha('#fff', 0.82), mb: 3 }}>Startseite</Button><Typography variant="h2" fontWeight={950} sx={{ fontSize: { xs: 38, md: 62 }, letterSpacing: '-0.045em' }}>Neu im Mitglieder-Dashboard</Typography><Typography sx={{ mt: 2, maxWidth: 760, color: alpha('#fff', 0.82), fontSize: { xs: 17, md: 20 } }}>Neue Funktionen und Verbesserungen – verständlich erklärt und dauerhaft zum Nachlesen.</Typography></Container>
    </Box>
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 3 }}>
        <Chip
          clickable
          label={`Alle (${items.length})`}
          onClick={() => setModuleFilter('all')}
          sx={moduleFilter === 'all'
            ? { bgcolor: primaryColor, color: '#fff', '&:hover, &.Mui-focusVisible': { bgcolor: primaryColor, filter: 'brightness(.94)' } }
            : { borderColor: alpha(primaryColor, 0.34), color: darkColor, bgcolor: '#fff' }}
        />
        {availableModules.map((key) => {
          const active = moduleFilter === key;
          return <Chip
            clickable
            key={key}
            label={MODULE_LABELS[key]}
            variant={active ? 'filled' : 'outlined'}
            onClick={() => setModuleFilter(key)}
            sx={active
              ? { bgcolor: primaryColor, color: '#fff', '&:hover, &.Mui-focusVisible': { bgcolor: primaryColor, filter: 'brightness(.94)' } }
              : { borderColor: alpha(primaryColor, 0.34), color: darkColor, bgcolor: '#fff' }}
          />;
        })}
      </Stack>
      {filtered.length === 0 ? <Alert severity="info">Für diesen Bereich sind noch keine Plattform-Updates veröffentlicht.</Alert> : <Grid container spacing={2.5}>{filtered.map((item) => <Grid item xs={12} md={6} key={item.id}><Paper component="article" variant="outlined" onClick={() => openItem(item)} sx={{ p: { xs: 2.5, md: 3 }, height: '100%', borderRadius: 4, cursor: 'pointer', display: 'flex', flexDirection: 'column', borderColor: alpha(primaryColor, 0.18), transition: 'transform .2s ease, box-shadow .2s ease', '&:hover': { transform: 'translateY(-3px)', boxShadow: `0 18px 42px ${alpha(darkColor, 0.1)}` } }}>
        {item.image_url && <Box component="img" src={resolveAssetUrl(item.image_url) || undefined} alt="" sx={{ width: '100%', height: 190, objectFit: 'cover', borderRadius: 3, mb: 2.5 }} />}
        <Stack direction="row" justifyContent="space-between" gap={1}><Typography variant="caption" fontWeight={800} color="text.secondary">{new Date(item.published_at).toLocaleDateString('de-AT')}</Typography>{item.action_required && <Chip size="small" color="warning" label="Bitte beachten" />}</Stack>
        <Typography variant="h5" fontWeight={900} sx={{ mt: 1 }}>{item.title}</Typography><Typography color="text.secondary" sx={{ mt: 1, lineHeight: 1.65 }}>{item.summary}</Typography>
        <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 2 }}>{item.modules.map((key) => <Chip key={key} size="small" variant="outlined" label={MODULE_LABELS[key]} />)}</Stack>
        <Stack direction="row" justifyContent="flex-end" alignItems="center" sx={{ mt: 'auto', pt: 2.5 }}><Button endIcon={<LaunchIcon />} size="small" sx={{ color: primaryColor, fontWeight: 850 }}>Details</Button></Stack>
      </Paper></Grid>)}</Grid>}
    </Container>

    <Dialog open={Boolean(selected)} onClose={closeItem} fullWidth maxWidth="md" scroll="paper">
      {selected && <><DialogTitle sx={{ pr: 7 }}><Typography variant="caption" color="text.secondary">{new Date(selected.published_at).toLocaleDateString('de-AT')}</Typography><Typography variant="h4" fontWeight={900}>{selected.title}</Typography><IconButton onClick={closeItem} sx={{ position: 'absolute', top: 12, right: 12 }}><CloseIcon /></IconButton></DialogTitle><DialogContent dividers>
        {selected.image_url && <Box component="img" src={resolveAssetUrl(selected.image_url) || undefined} alt="" sx={{ width: '100%', maxHeight: 380, objectFit: 'cover', borderRadius: 3, mb: 3 }} />}
        <Typography variant="h6" color="text.secondary" sx={{ mb: 3 }}>{selected.summary}</Typography><Typography sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>{selected.body}</Typography>
        {selected.benefits && <Paper elevation={0} sx={{ mt: 3, p: 2.5, borderRadius: 3, bgcolor: alpha(primaryColor, 0.08) }}><Typography fontWeight={900} color={primaryColor}>Ihr Nutzen</Typography><Typography sx={{ mt: 0.6, whiteSpace: 'pre-wrap' }}>{selected.benefits}</Typography></Paper>}
        {selected.action_required && selected.action_text && <Alert severity="warning" sx={{ mt: 2.5 }}><Typography fontWeight={850}>Bitte beachten</Typography>{selected.action_text}</Alert>}
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} sx={{ mt: 3 }}><Button variant="outlined" onClick={() => navigator.clipboard.writeText(itemUrl(selected))} sx={{ color: primaryColor, borderColor: alpha(primaryColor, 0.55), '&:hover': { borderColor: primaryColor, bgcolor: alpha(primaryColor, 0.06) } }}>Link kopieren</Button></Stack>
      </DialogContent></>}
    </Dialog>
  </Box>;
};

export default PublicPlatformUpdatesPage;
