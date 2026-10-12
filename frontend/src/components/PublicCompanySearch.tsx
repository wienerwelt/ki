import { useEffect, useRef, useState } from 'react';
import {
  Alert, Avatar, Badge, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, IconButton, InputAdornment, List, ListItemButton,
  ListItemText, Paper, Stack, Tab, Tabs, TextField, Tooltip, Typography,
  useMediaQuery, useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import CloseIcon from '@mui/icons-material/Close';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import LanguageIcon from '@mui/icons-material/Language';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchIcon from '@mui/icons-material/Search';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import apiClient from '../apiClient';
import { resolveAssetUrl } from '../utils/assetUrl';

type CompanySummary = {
  id: string; name: string; description?: string; logo_url?: string; website_url?: string;
  category?: string; article_count?: number; career_count?: number; job_count?: number;
};
type ArticleSummary = {
  id: string; title: string; summary?: string; original_url?: string; published_date?: string;
  source_identifier?: string; thumbnail_url?: string;
};
type SearchPayload = {
  companies: CompanySummary[]; fallback_articles: ArticleSummary[]; fallback_reason?: string | null;
  available_companies: number;
};
type CompanyDetail = {
  company: CompanySummary & { categories?: { id: string; name: string }[]; locations?: { city?: string; country?: string }[]; software_count?: number };
  articles: ArticleSummary[];
  article_mode: 'linked' | 'name_fallback' | 'empty';
  career: any[];
  jobs: any[];
};

const formatDate = (value?: string) => value
  ? new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00Z`))
  : '';

export default function PublicCompanySearch({
  partnerId, primaryColor, darkColor, onOpenNetwork, onOpenCompany, mobileButton = false, inverted = false, invertedColor = '#fff',
}: {
  partnerId?: string | null;
  primaryColor: string;
  darkColor: string;
  onOpenNetwork?: () => void;
  onOpenCompany?: (id: string) => void;
  mobileButton?: boolean;
  inverted?: boolean;
  invertedColor?: string;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [payload, setPayload] = useState<SearchPayload | null>(null);
  const [selected, setSelected] = useState<CompanyDetail | null>(null);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    if (!open || selected || !partnerId) return undefined;
    const id = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const result = await apiClient.get<SearchPayload>('/api/public/companies', { params: { partnerId, q: query, limit: 8 } });
        if (!result.res.ok) throw new Error(result.data?.message || 'Unternehmenssuche konnte nicht geladen werden.');
        if (id === requestId.current) setPayload(result.data);
      } catch (searchError: any) {
        if (id === requestId.current) setError(searchError.message || 'Unternehmenssuche konnte nicht geladen werden.');
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, query ? 280 : 0);
    return () => { window.clearTimeout(timer); requestId.current += 1; };
  }, [open, partnerId, query, selected]);

  const close = () => { setOpen(false); setSelected(null); setTab(0); setError(''); };
  const openCompany = async (company: CompanySummary) => {
    if (!partnerId) return;
    const id = ++requestId.current; setLoading(true); setError('');
    try {
      const result = await apiClient.get<CompanyDetail>(`/api/public/companies/${encodeURIComponent(company.id)}`, { params: { partnerId } });
      if (!result.res.ok) throw new Error(result.data?.message || 'Unternehmensprofil konnte nicht geladen werden.');
      if (id === requestId.current) { setSelected(result.data); setTab(0); }
    } catch (detailError: any) {
      if (id === requestId.current) setError(detailError.message || 'Unternehmensprofil konnte nicht geladen werden.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  const trigger = mobileButton
    ? <Button fullWidth startIcon={<SearchIcon />} onClick={() => setOpen(true)} sx={{ justifyContent: 'flex-start', px: 2, py: 1.2, borderRadius: 2.5, textTransform: 'none', fontWeight: 900, color: darkColor, bgcolor: alpha(darkColor, 0.03) }}>Unternehmen &amp; Themen suchen</Button>
    : <Tooltip title="Unternehmen & Themen suchen"><span><IconButton aria-label="Unternehmen und Themen suchen" onClick={() => setOpen(true)} disabled={!partnerId} sx={{
      color: inverted ? invertedColor : primaryColor,
      bgcolor: inverted ? alpha(invertedColor, 0.13) : alpha(primaryColor, 0.08),
      border: `1px solid ${inverted ? alpha(invertedColor, 0.28) : alpha(primaryColor, 0.16)}`,
      '&:hover': { bgcolor: inverted ? alpha(invertedColor, 0.22) : alpha(primaryColor, 0.14) },
      '&.Mui-disabled': { color: inverted ? alpha(invertedColor, 0.44) : undefined },
    }}><SearchIcon /></IconButton></span></Tooltip>;

  const articleList = (articles: ArticleSummary[]) => articles.length ? (
    <List disablePadding sx={{ display: 'grid', gap: 1 }}>
      {articles.map((article) => <ListItemButton key={article.id} component="a" href={article.original_url || '#'} target="_blank" rel="noopener noreferrer" disabled={!article.original_url} sx={{ alignItems: 'flex-start', border: '1px solid', borderColor: 'divider', borderRadius: 2.5, px: 1.5 }}>
        <ListItemText primary={article.title} secondary={<><Typography component="span" variant="body2" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{article.summary || 'Kurzbeschreibung nicht verfügbar.'}</Typography><Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.6 }}>{[formatDate(article.published_date), article.source_identifier].filter(Boolean).join(' · ')}</Typography></>} primaryTypographyProps={{ fontWeight: 850, lineHeight: 1.25 }} />
        <OpenInNewIcon fontSize="small" sx={{ ml: 1, mt: 0.4, color: primaryColor }} />
      </ListItemButton>)}
    </List>
  ) : <Alert severity="info">Noch keine eindeutig zugeordneten Artikel vorhanden. Neue Inhalte werden automatisch und ohne KI-Tokens geprüft.</Alert>;

  return <>
    {trigger}
    <Dialog open={open} onClose={close} fullScreen={fullScreen} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 4, minHeight: fullScreen ? '100%' : 600 } }}>
      <DialogTitle sx={{ pr: 7, pb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          {selected && <IconButton aria-label="Zurück zur Unternehmenssuche" onClick={() => { setSelected(null); setTab(0); }} size="small"><ArrowBackIcon /></IconButton>}
          <Box><Typography variant="h5" fontWeight={950}>{selected ? selected.company.name : 'Unternehmen & Themen'}</Typography><Typography variant="body2" color="text.secondary">Branchennetzwerk, Artikel, Personalien und Jobs gemeinsam durchsuchen.</Typography></Box>
        </Stack>
        <IconButton aria-label="Schließen" onClick={close} sx={{ position: 'absolute', right: 12, top: 12 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: { xs: 2, sm: 3 } }}>
        {loading && <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 180 }}><CircularProgress sx={{ color: primaryColor }} /></Box>}
        {!loading && error && <Alert severity="error">{error}</Alert>}
        {!loading && !selected && !error && <Stack spacing={2.2}>
          <TextField autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Unternehmen oder Thema eingeben …" fullWidth inputProps={{ maxLength: 120 }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: primaryColor }} /></InputAdornment>, endAdornment: query ? <InputAdornment position="end"><IconButton aria-label="Suche löschen" size="small" onClick={() => setQuery('')}><CloseIcon fontSize="small" /></IconButton></InputAdornment> : undefined }} />
          {payload?.companies?.length ? <Stack spacing={1}>
            <Typography variant="overline" fontWeight={950} color="text.secondary">{query ? 'Gefundene Unternehmen' : 'Unternehmen im Branchennetzwerk'}</Typography>
            {payload.companies.map((company) => <Paper key={company.id} variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}><ListItemButton onClick={() => openCompany(company)} sx={{ gap: 1.5, py: 1.4 }}>
              <Avatar variant="rounded" src={company.logo_url ? resolveAssetUrl(company.logo_url) : undefined} sx={{ width: 52, height: 52, bgcolor: alpha(primaryColor, 0.08), color: primaryColor }}><BusinessOutlinedIcon /></Avatar>
              <ListItemText primary={company.name} secondary={company.category || company.description || 'Unternehmen im Branchennetzwerk'} primaryTypographyProps={{ fontWeight: 900 }} secondaryTypographyProps={{ noWrap: true }} />
              <Stack direction="row" spacing={0.65} useFlexGap flexWrap="wrap" justifyContent="flex-end" sx={{ display: { xs: 'none', sm: 'flex' } }}>
                <Chip size="small" icon={<ArticleOutlinedIcon />} label={company.article_count || 0} />
                <Chip size="small" icon={<GroupsOutlinedIcon />} label={company.career_count || 0} />
                <Chip size="small" icon={<WorkOutlineIcon />} label={company.job_count || 0} />
              </Stack>
            </ListItemButton></Paper>)}
          </Stack> : null}
          {payload?.fallback_reason && <Alert severity="info">{payload.fallback_reason === 'no_companies_available' ? 'Für diesen Mandanten sind noch keine öffentlichen Unternehmen hinterlegt. Die Suche fällt deshalb auf vorhandene Artikel zurück.' : 'Kein eindeutiges Unternehmen gefunden. Passende Artikel werden stattdessen angezeigt.'}</Alert>}
          {payload?.fallback_articles?.length ? <Box><Typography variant="overline" fontWeight={950} color="text.secondary">Passende Artikel</Typography>{articleList(payload.fallback_articles)}</Box> : null}
          {payload && payload.companies.length === 0 && payload.fallback_articles.length === 0 && <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, textAlign: 'center' }}><BusinessOutlinedIcon sx={{ color: alpha(primaryColor, 0.55), fontSize: 46 }} /><Typography fontWeight={900} sx={{ mt: 1 }}>{query ? 'Keine passenden Ergebnisse' : 'Noch keine Unternehmen vorhanden'}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Versuchen Sie einen anderen Suchbegriff oder öffnen Sie das Branchennetzwerk.</Typography>{onOpenNetwork && <Button onClick={() => { close(); onOpenNetwork(); }} sx={{ mt: 1.5, color: primaryColor }}>Branchennetzwerk ansehen</Button>}</Paper>}
        </Stack>}

        {!loading && selected && !error && <Stack spacing={2.5}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
            <Avatar variant="rounded" src={selected.company.logo_url ? resolveAssetUrl(selected.company.logo_url) : undefined} sx={{ width: 76, height: 76, bgcolor: alpha(primaryColor, 0.08), color: primaryColor }}><BusinessOutlinedIcon /></Avatar>
            <Box sx={{ flex: 1 }}><Typography variant="h5" fontWeight={950}>{selected.company.name}</Typography><Typography color="text.secondary">{selected.company.description || 'Unternehmen im Branchennetzwerk.'}</Typography><Stack direction="row" spacing={0.7} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>{selected.company.categories?.map((category) => <Chip key={category.id} size="small" label={category.name} />)}</Stack></Box>
            {selected.company.website_url && <Button component="a" href={selected.company.website_url} target="_blank" rel="noopener noreferrer" variant="outlined" startIcon={<LanguageIcon />} sx={{ color: primaryColor, borderColor: primaryColor, whiteSpace: 'nowrap' }}>Homepage</Button>}
          </Stack>
          <Divider />
          <Tabs value={tab} onChange={(_event, value) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ '& .MuiTab-root': { minHeight: 48, fontWeight: 900, textTransform: 'none' } }}>
            <Tab icon={<Badge badgeContent={selected.articles.length} color="primary"><ArticleOutlinedIcon /></Badge>} iconPosition="start" label="Artikel" />
            <Tab icon={<Badge badgeContent={selected.career.length} color="primary"><GroupsOutlinedIcon /></Badge>} iconPosition="start" label="Personalien" />
            <Tab icon={<Badge badgeContent={selected.jobs.length} color="primary"><WorkOutlineIcon /></Badge>} iconPosition="start" label="Jobs" />
          </Tabs>
          {tab === 0 && <Box>{selected.article_mode === 'name_fallback' && <Alert severity="info" sx={{ mb: 1.5 }}>Noch keine bestätigte Zuordnung vorhanden. Diese Artikel wurden als transparenter Namens-Fallback gefunden.</Alert>}{articleList(selected.articles)}</Box>}
          {tab === 1 && (selected.career.length ? <Stack spacing={1}>{selected.career.map((entry) => <Paper key={entry.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}><Typography fontWeight={900}>{entry.person_name}</Typography><Typography variant="body2" color="text.secondary">{entry.role_title || entry.organization}</Typography><Typography variant="body2" sx={{ mt: 0.7 }}>{entry.summary}</Typography></Paper>)}</Stack> : <Alert severity="info">Noch keine freigegebenen Personalien zu diesem Unternehmen.</Alert>)}
          {tab === 2 && (selected.jobs.length ? <Stack spacing={1}>{selected.jobs.map((job) => <Paper key={job.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}><Typography fontWeight={900}>{job.title}</Typography><Typography variant="body2" color="text.secondary">{[job.location, job.employment_type].filter(Boolean).join(' · ') || job.organization}</Typography><Typography variant="body2" sx={{ mt: 0.7 }}>{job.summary}</Typography>{(job.application_url || job.source_url) && <Button component="a" href={job.application_url || job.source_url} target="_blank" rel="noopener noreferrer" size="small" endIcon={<OpenInNewIcon />} sx={{ mt: 0.6, color: primaryColor }}>Zur Ausschreibung</Button>}</Paper>)}</Stack> : <Alert severity="info">Derzeit keine freigegebenen offenen Stellen dieses Unternehmens.</Alert>)}
        </Stack>}
      </DialogContent>
      {selected && <DialogActions sx={{ px: 3, py: 2 }}><Button onClick={() => { setSelected(null); setTab(0); }}>Zurück zur Suche</Button>{onOpenCompany && <Button variant="contained" onClick={() => { const id = selected.company.id; close(); onOpenCompany(id); }} sx={{ bgcolor: primaryColor }}>Netzwerkprofil öffnen</Button>}</DialogActions>}
    </Dialog>
  </>;
}
