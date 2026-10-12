import { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Avatar,
    Box,
    Button,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    Grid,
    IconButton,
    MenuItem,
    Paper,
    Stack,
    Tab,
    Tabs,
    TextField,
    Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { resolveAssetUrl } from '../utils/assetUrl';
import { careerRequest } from './CareerPanel';

export interface CareerJob {
    id: string;
    title: string;
    organization: string;
    location?: string;
    employment_type?: string;
    summary: string;
    application_url?: string;
    source_url?: string;
    published_date?: string;
    valid_until?: string;
    status?: string;
    created_by?: string;
    provider_id?: string;
    source_article_id?: string;
    organization_logo?: string;
    requested_public?: boolean;
    public_approved?: boolean;
    detection_method?: 'manual' | 'article_rule';
    review_note?: string;
    version?: number;
}

const emptyJob = {
    title: '', organization: '', location: '', employment_type: '', summary: '',
    application_url: '', source_url: '', published_date: '', valid_until: '',
};
const formatDate = (value?: string) => value
    ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('de-AT')
    : '';

function JobFields({ value, onChange }: { value: any; onChange: (value: any) => void }) {
    return <Grid container spacing={2} sx={{ mt: 0.25 }}>
        <Grid item xs={12}><TextField required fullWidth label="Position" value={value.title || ''} inputProps={{ maxLength: 240 }} onChange={(event) => onChange({ ...value, title: event.target.value })} /></Grid>
        <Grid item xs={12} sm={7}><TextField required fullWidth label="Unternehmen" value={value.organization || ''} inputProps={{ maxLength: 180 }} onChange={(event) => onChange({ ...value, organization: event.target.value })} helperText="Wird automatisch mit einem Unternehmen im Branchennetzwerk verknüpft, wenn es eindeutig erkannt wird." /></Grid>
        <Grid item xs={12} sm={5}><TextField fullWidth label="Ort / Region" value={value.location || ''} inputProps={{ maxLength: 180 }} onChange={(event) => onChange({ ...value, location: event.target.value })} /></Grid>
        <Grid item xs={12} sm={6}><TextField fullWidth label="Beschäftigungsart" value={value.employment_type || ''} inputProps={{ maxLength: 100 }} onChange={(event) => onChange({ ...value, employment_type: event.target.value })} placeholder="z. B. Vollzeit, Teilzeit" /></Grid>
        <Grid item xs={12} sm={3}><TextField fullWidth type="date" label="Veröffentlicht" InputLabelProps={{ shrink: true }} value={value.published_date?.slice(0, 10) || ''} onChange={(event) => onChange({ ...value, published_date: event.target.value })} /></Grid>
        <Grid item xs={12} sm={3}><TextField fullWidth type="date" label="Bewerbung bis" InputLabelProps={{ shrink: true }} value={value.valid_until?.slice(0, 10) || ''} onChange={(event) => onChange({ ...value, valid_until: event.target.value })} /></Grid>
        <Grid item xs={12}><TextField required fullWidth multiline minRows={4} label="Kurzbeschreibung" value={value.summary || ''} inputProps={{ maxLength: 2500 }} helperText={`${String(value.summary || '').length}/2500 Zeichen`} onChange={(event) => onChange({ ...value, summary: event.target.value })} /></Grid>
        <Grid item xs={12} sm={6}><TextField fullWidth type="url" label="Bewerbungslink" value={value.application_url || ''} onChange={(event) => onChange({ ...value, application_url: event.target.value })} /></Grid>
        <Grid item xs={12} sm={6}><TextField required fullWidth type="url" label="Originalquelle" value={value.source_url || ''} onChange={(event) => onChange({ ...value, source_url: event.target.value })} helperText="Wird bei der Stelle als Herkunftsnachweis verlinkt." /></Grid>
    </Grid>;
}

function JobCard({ job, manager, onOpen }: { job: CareerJob; manager: boolean; onOpen: () => void }) {
    return <Paper variant="outlined" sx={{ p: 2.25, height: '100%', borderRadius: 3, display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <Avatar variant="rounded" src={job.organization_logo ? resolveAssetUrl(job.organization_logo) : undefined} sx={{ width: 52, height: 52, bgcolor: 'action.hover', color: 'primary.main' }}><BusinessOutlinedIcon /></Avatar>
            <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography fontWeight={900} sx={{ overflowWrap: 'anywhere' }}>{job.title}</Typography>
                <Typography variant="body2" color="text.secondary" fontWeight={700}>{job.organization}{job.location ? ` · ${job.location}` : ''}</Typography>
            </Box>
        </Stack>
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
            {job.employment_type && <Chip size="small" label={job.employment_type} />}
            {job.detection_method === 'article_rule' && <Chip size="small" icon={<AutoAwesomeOutlinedIcon />} label="Aus Artikel erkannt" variant="outlined" color="primary" />}
            {job.status && job.status !== 'approved' && <Chip size="small" label={job.status === 'pending' ? 'Zu prüfen' : job.status === 'rejected' ? 'Nicht freigegeben' : 'Zurückgezogen'} color={job.status === 'pending' ? 'warning' : 'default'} />}
        </Stack>
        <Typography variant="body2" sx={{ mt: 1.5, flex: 1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{job.summary}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1.25 }}>{job.published_date ? `Veröffentlicht: ${formatDate(job.published_date)}` : 'Veröffentlichungsdatum nicht angegeben'}{job.valid_until ? ` · bis ${formatDate(job.valid_until)}` : ''}</Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
            {manager && <Button size="small" variant="outlined" onClick={onOpen}>Prüfen & bearbeiten</Button>}
            {job.application_url && <Button size="small" component="a" href={job.application_url} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewIcon />}>Zur Stelle</Button>}
            {job.source_url && <Button size="small" component="a" href={job.source_url} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewIcon />}>Quelle</Button>}
            {!job.application_url && !job.source_url && <Typography variant="caption" color="text.secondary">Bestandseintrag ohne Quellenlink</Typography>}
            {job.provider_id && <Button size="small" component={RouterLink} to={`/directory?anbieter=${encodeURIComponent(job.provider_id)}`}>Unternehmen</Button>}
        </Stack>
    </Paper>;
}

export default function CareerJobsPanel() {
    const { user } = useAuth();
    const manager = ['admin', 'assistenz'].includes(user?.role || '');
    const isAdmin = user?.role === 'admin';
    const [partnerId, setPartnerId] = useState(user?.business_partner_id || '');
    const [partners, setPartners] = useState<any[]>([]);
    const [mode, setMode] = useState('approved');
    const [search, setSearch] = useState('');
    const [data, setData] = useState<any>({ jobs: [], total: 0, counts: {} });
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [selected, setSelected] = useState<CareerJob | null>(null);
    const [form, setForm] = useState<any>(emptyJob);
    const [confirmRights, setConfirmRights] = useState(false);
    const [requestedPublic, setRequestedPublic] = useState(true);
    const [publicApproved, setPublicApproved] = useState(false);
    const [reviewNote, setReviewNote] = useState('');

    useEffect(() => {
        if (!isAdmin || !manager) return;
        careerRequest('/api/career/tenants').then((rows) => {
            setPartners(rows);
            if (!partnerId && rows[0]) setPartnerId(rows[0].id);
        }).catch((cause: Error) => setError(cause.message));
    }, [isAdmin, manager, partnerId]);

    useEffect(() => {
        if (user?.business_partner_id && !isAdmin) setPartnerId(user.business_partner_id);
    }, [user?.business_partner_id, isAdmin]);

    const reload = useCallback(async () => {
        if (!partnerId) return;
        setBusy(true); setError('');
        try {
            const result = await careerRequest(`/api/career/jobs?partnerId=${encodeURIComponent(partnerId)}&mode=${mode}&search=${encodeURIComponent(search)}`);
            setData(result);
        } catch (cause: any) { setError(cause.message); }
        finally { setBusy(false); }
    }, [partnerId, mode, search]);

    useEffect(() => { const timer = setTimeout(reload, 220); return () => clearTimeout(timer); }, [reload]);

    const run = async (task: () => Promise<void>) => {
        setBusy(true); setError(''); setMessage('');
        try { await task(); } catch (cause: any) { setError(cause.message); }
        finally { setBusy(false); }
    };
    const resetDialog = () => { setCreateOpen(false); setSelected(null); setForm(emptyJob); setConfirmRights(false); setRequestedPublic(true); setPublicApproved(false); setReviewNote(''); };
    const openReview = (job: CareerJob) => { setSelected(job); setForm({ ...emptyJob, ...job, published_date: job.published_date?.slice(0, 10) || '', valid_until: job.valid_until?.slice(0, 10) || '' }); setPublicApproved(Boolean(job.public_approved)); setReviewNote(job.review_note || ''); };
    const submit = () => run(async () => {
        const result = await careerRequest('/api/career/jobs', 'post', { ...form, business_partner_id: partnerId, confirm_rights: confirmRights, requested_public: requestedPublic });
        setMessage(result.message); resetDialog(); setMode('mine'); await reload();
    });
    const review = (status: 'approved' | 'rejected') => run(async () => {
        const result = await careerRequest(`/api/career/jobs/${selected!.id}/review?partnerId=${encodeURIComponent(partnerId)}`, 'put', { ...form, version: selected!.version, status, public_approved: publicApproved, review_note: reviewNote });
        setMessage(result.message); resetDialog(); await reload();
    });
    const withdraw = () => run(async () => {
        const result = await careerRequest(`/api/career/jobs/${selected!.id}?partnerId=${encodeURIComponent(partnerId)}`, 'delete');
        setMessage(result.message); resetDialog(); await reload();
    });

    return <Box sx={{ minWidth: 0 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2} sx={{ mb: 2.5 }}>
            <Box><Typography variant="h5" fontWeight={900}>Branchen-Jobmarkt</Typography><Typography color="text.secondary">Aus Branchenartikeln erkannte und redaktionell geprüfte Stellen – ergänzt um manuelle Einträge.</Typography></Box>
            {manager && <Button variant="contained" startIcon={<AddIcon />} disabled={!partnerId || user?.role === 'demo'} onClick={() => { setForm(emptyJob); setCreateOpen(true); }}>Stelle hinzufügen</Button>}
        </Stack>
        {isAdmin && <TextField select fullWidth label="Mandant" value={partnerId} onChange={(event) => setPartnerId(event.target.value)} sx={{ mb: 2 }}>
            {partners.map((partner) => <MenuItem key={partner.id} value={partner.id}>{partner.name}</MenuItem>)}
        </TextField>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
        <Paper variant="outlined" sx={{ borderRadius: 3, mb: 2, overflow: 'hidden' }}>
            <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'stretch', md: 'center' }} spacing={1.5} sx={{ p: 1.5 }}>
                <Tabs value={mode} onChange={(_, value) => setMode(value)} variant="scrollable" allowScrollButtonsMobile sx={{ flex: 1 }}>
                    <Tab value="approved" label={`Aktuell (${data.counts?.approved || 0})`} />
                    {manager && <Tab value="pending" label={`Zu prüfen (${data.counts?.pending || 0})`} />}
                    {manager && <Tab value="mine" label={`Meine Einträge (${data.counts?.mine || 0})`} />}
                </Tabs>
                <TextField size="small" label="Jobs durchsuchen" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ minWidth: { md: 280 } }} />
            </Stack>
        </Paper>
        {data.jobs.length > 0 ? <Grid container spacing={2}>{data.jobs.map((job: CareerJob) => <Grid item xs={12} md={6} lg={4} key={job.id}><JobCard job={job} manager={manager} onOpen={() => openReview(job)} /></Grid>)}</Grid> : !busy && <Alert severity="info">Noch keine passenden Branchenjobs vorhanden. Neue Quellenartikel werden ohne KI nach eindeutigen Stellenhinweisen geprüft; Assistenz und Admin können Einträge zusätzlich manuell anlegen.</Alert>}

        <Dialog open={createOpen || Boolean(selected)} onClose={resetDialog} maxWidth="md" fullWidth>
            <DialogTitle sx={{ pr: 7 }}>{selected ? 'Branchenjob prüfen und bearbeiten' : 'Branchenjob hinzufügen'}<IconButton aria-label="Schließen" onClick={resetDialog} sx={{ position: 'absolute', right: 12, top: 12 }}><CloseIcon /></IconButton></DialogTitle>
            <DialogContent>
                {selected?.detection_method === 'article_rule' && <Alert severity="info" icon={<AutoAwesomeOutlinedIcon />} sx={{ mb: 1.5 }}>Automatisch ohne KI aus einem Artikel erkannt. Bitte Unternehmen, Inhalt und Bewerbungslink vor der Freigabe prüfen.</Alert>}
                <JobFields value={form} onChange={setForm} />
                {!selected && <><FormControlLabel control={<Checkbox checked={confirmRights} onChange={(event) => setConfirmRights(event.target.checked)} />} label="Angaben und Berechtigung zur Veröffentlichung sind geprüft" /><FormControlLabel control={<Checkbox checked={requestedPublic} onChange={(event) => setRequestedPublic(event.target.checked)} />} label="Auch auf der Publicpage anzeigen" /></>}
                {selected && <><FormControlLabel control={<Checkbox checked={publicApproved} disabled={!selected.requested_public} onChange={(event) => setPublicApproved(event.target.checked)} />} label="Für die Publicpage freigeben" /><TextField fullWidth multiline minRows={2} label="Redaktionelle Notiz" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} sx={{ mt: 1 }} /></>}
            </DialogContent>
            <DialogActions sx={{ flexWrap: 'wrap', gap: 1, '& > :not(:first-of-type)': { ml: 0 } }}>
                <Button onClick={resetDialog}>Abbrechen</Button>
                {selected ? <><Button color="inherit" onClick={withdraw} disabled={busy}>Zurückziehen</Button><Button color="error" variant="outlined" onClick={() => review('rejected')} disabled={busy}>Nicht freigeben</Button><Button variant="contained" onClick={() => review('approved')} disabled={busy}>Freigeben</Button></> : <Button variant="contained" onClick={submit} disabled={busy || !confirmRights}>Zur Prüfung einreichen</Button>}
            </DialogActions>
        </Dialog>
    </Box>;
}
