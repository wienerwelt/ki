import { useEffect, useState } from 'react';
import {
    Alert,
    Avatar,
    Box,
    Button,
    CardActionArea,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
    IconButton,
    Paper,
    Stack,
    TextField,
    Typography,
    useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CloseIcon from '@mui/icons-material/Close';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import ShareIcon from '@mui/icons-material/Share';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import AiContentLabel from './AiContentLabel';
import { CareerCard, CareerEntry, careerKinds, careerRequest } from './CareerPanel';
import { CareerJob } from './CareerJobsPanel';
import { resolveAssetUrl } from '../utils/assetUrl';

const formatDate = (value?: string) => value
    ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('de-AT')
    : '';

export default function PublicCareerTeaser({
    partnerId,
    partnerPath,
    primaryColor,
}: {
    partnerId: string;
    partnerPath: string;
    primaryColor: string;
}) {
    const theme = useTheme();
    const primaryContrast = theme.palette.getContrastText(primaryColor);
    const [entries, setEntries] = useState<CareerEntry[]>([]);
    const [jobs, setJobs] = useState<CareerJob[]>([]);
    const [enabled, setEnabled] = useState(false);
    const [selected, setSelected] = useState<CareerEntry | null>(null);
    const [notice, setNotice] = useState('');
    const [shareFallback, setShareFallback] = useState('');

    useEffect(() => {
        let live = true;
        setEnabled(false);
        setEntries([]);
        setJobs([]);
        setSelected(null);
        if (!partnerId) return undefined;

        Promise.all([
            careerRequest(`/api/public/career?partnerId=${encodeURIComponent(partnerId)}`),
            careerRequest(`/api/public/career-jobs?partnerId=${encodeURIComponent(partnerId)}&limit=3`),
        ]).then(async ([data, jobData]) => {
                if (!live) return;
                setEnabled(true);
                setEntries(data.entries || []);
                setJobs(jobData.jobs || []);
                const id = new URLSearchParams(window.location.search).get('career');
                if (id) {
                    const detail = await careerRequest(`/api/public/career?partnerId=${encodeURIComponent(partnerId)}&id=${encodeURIComponent(id)}`);
                    if (live) setSelected(detail.entries[0] || null);
                }
            }).catch(() => {});

        return () => { live = false; };
    }, [partnerId]);

    if (!enabled || (entries.length === 0 && jobs.length === 0)) return null;

    const login = `/login?partner=${encodeURIComponent(partnerPath.replace(/^\//, ''))}&next=${encodeURIComponent(selected ? `/career?entry=${selected.id}` : '/career')}`;
    const columnWidth = entries.length === 1 ? 12 : entries.length === 2 ? 6 : 4;

    return (
        <Box
            id="menschen-karriere"
            sx={{
                mt: 4,
                p: { xs: 2.25, sm: 3, md: 3.5 },
                position: 'relative',
                overflow: 'hidden',
                scrollMarginTop: 100,
                borderRadius: 5,
                border: `1px solid ${alpha(primaryColor, 0.2)}`,
                background: `linear-gradient(135deg, ${alpha(primaryColor, 0.11)} 0%, #fff 45%, ${alpha(primaryColor, 0.045)} 100%)`,
                boxShadow: `0 20px 50px ${alpha(primaryColor, 0.1)}`,
                '&::after': {
                    content: '""',
                    position: 'absolute',
                    width: 260,
                    height: 260,
                    right: -120,
                    top: -150,
                    borderRadius: '50%',
                    bgcolor: alpha(primaryColor, 0.08),
                    pointerEvents: 'none',
                },
            }}
        >
            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                justifyContent="space-between"
                spacing={2}
                sx={{ position: 'relative', zIndex: 1, mb: 2.5 }}
            >
                <Box>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                        <Box sx={{ width: 36, height: 36, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: primaryColor, color: '#fff' }}>
                            <GroupsOutlinedIcon fontSize="small" />
                        </Box>
                        <Typography variant="overline" sx={{ color: primaryColor, fontWeight: 950, letterSpacing: '0.12em', lineHeight: 1.2 }}>
                            Branchen-Personalien
                        </Typography>
                    </Stack>
                    <Typography variant="h4" fontWeight={950} sx={{ letterSpacing: '-0.025em' }}>
                        Menschen &amp; Karriere
                    </Typography>
                    <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                        Neue Rollen, neue Impulse – Menschen, die die Branche bewegen.
                    </Typography>
                </Box>
                <Chip
                    label={`${entries.length + jobs.length} aktuelle Hinweise`}
                    sx={{ bgcolor: primaryColor, color: '#fff', fontWeight: 900, flexShrink: 0 }}
                />
            </Stack>

            <Grid container spacing={2} sx={{ position: 'relative', zIndex: 1 }}>
                {entries.map((entry) => {
                    const imageUrl = entry.photo_url || (entry.organization_logo ? resolveAssetUrl(entry.organization_logo) : undefined);
                    return (
                        <Grid item xs={12} md={columnWidth} key={entry.id}>
                            <Paper
                                elevation={0}
                                sx={{
                                    height: '100%',
                                    overflow: 'hidden',
                                    borderRadius: 3.5,
                                    border: `1px solid ${alpha(primaryColor, 0.18)}`,
                                    bgcolor: alpha('#fff', 0.94),
                                    transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
                                    '&:hover': {
                                        transform: 'translateY(-3px)',
                                        borderColor: alpha(primaryColor, 0.42),
                                        boxShadow: `0 16px 34px ${alpha(primaryColor, 0.13)}`,
                                    },
                                }}
                            >
                                <CardActionArea onClick={() => setSelected(entry)} sx={{ height: '100%', p: { xs: 2, sm: entries.length === 1 ? 2.5 : 2 } }}>
                                    <Stack
                                        direction={{ xs: 'column', sm: entries.length === 1 ? 'row' : 'column' }}
                                        spacing={2}
                                        alignItems={{ xs: 'stretch', sm: entries.length === 1 ? 'center' : 'stretch' }}
                                        sx={{ height: '100%' }}
                                    >
                                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexShrink: 0 }}>
                                            <Avatar src={imageUrl} sx={{ width: 64, height: 64, bgcolor: alpha(primaryColor, 0.09), color: primaryColor, border: `3px solid ${alpha(primaryColor, 0.13)}` }}>
                                                <PeopleOutlineIcon />
                                            </Avatar>
                                            <Box sx={{ minWidth: 0 }}>
                                                <Chip size="small" label={careerKinds[entry.kind] || 'Personalie'} sx={{ mb: 0.7, color: primaryColor, bgcolor: alpha(primaryColor, 0.09), fontWeight: 800 }} />
                                                <Typography variant="h6" fontWeight={950} sx={{ lineHeight: 1.15, overflowWrap: 'anywhere' }}>
                                                    {entry.person_name}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary" fontWeight={700} sx={{ mt: 0.3 }}>
                                                    {entry.organization}
                                                </Typography>
                                            </Box>
                                        </Stack>

                                        <Box sx={{ minWidth: 0, flex: 1 }}>
                                            {entry.role_title && <Typography fontWeight={850}>{entry.role_title}</Typography>}
                                            <Typography
                                                variant="body2"
                                                color="text.secondary"
                                                sx={{ mt: 0.8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}
                                            >
                                                {entry.summary}
                                            </Typography>
                                            {(entry.extraction_id || entry.ai_assisted) && (
                                                <Stack direction="row" alignItems="center" spacing={0.7} sx={{ mt: 1 }}>
                                                    <AiContentLabel kind="ai" size={14} />
                                                    <Typography variant="caption" color="text.secondary">KI-unterstützt · redaktionell geprüft</Typography>
                                                </Stack>
                                            )}
                                        </Box>

                                        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ minWidth: { sm: entries.length === 1 ? 190 : 0 }, flexShrink: 0 }}>
                                            <Typography variant="caption" color="text.secondary">
                                                {entry.effective_date ? `Start: ${formatDate(entry.effective_date)}` : `Meldung: ${formatDate(entry.published_date)}`}
                                            </Typography>
                                            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: primaryColor }}>
                                                <Typography variant="body2" fontWeight={900} whiteSpace="nowrap">Details</Typography>
                                                <ArrowForwardRoundedIcon fontSize="small" />
                                            </Stack>
                                        </Stack>
                                    </Stack>
                                </CardActionArea>
                            </Paper>
                        </Grid>
                    );
                })}
            </Grid>

            {jobs.length > 0 && <Box sx={{ position: 'relative', zIndex: 1, mt: entries.length ? 3 : 0 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" sx={{ mb: 1.5 }}>
                    <Stack direction="row" spacing={1} alignItems="center"><WorkOutlineIcon sx={{ color: primaryColor }} /><Box><Typography variant="h6" fontWeight={950}>Branchen-Jobmarkt</Typography><Typography variant="body2" color="text.secondary">Aktuelle Chancen aus dem Branchennetzwerk.</Typography></Box></Stack>
                    <Chip size="small" variant="outlined" label={`${jobs.length} ${jobs.length === 1 ? 'Stelle' : 'Stellen'}`} sx={{ color: primaryColor, borderColor: alpha(primaryColor, 0.4), fontWeight: 800 }} />
                </Stack>
                <Grid container spacing={1.5}>{jobs.map((job) => {
                    return <Grid item xs={12} md={4} key={job.id}><Paper variant="outlined" sx={{ p: 2, height: '100%', borderRadius: 3, bgcolor: alpha('#fff', 0.94), borderColor: alpha(primaryColor, 0.18) }}>
                        <Stack direction="row" spacing={1.25} alignItems="flex-start"><Avatar variant="rounded" src={job.organization_logo ? resolveAssetUrl(job.organization_logo) : undefined} sx={{ bgcolor: alpha(primaryColor, 0.09), color: primaryColor }}><WorkOutlineIcon /></Avatar><Box sx={{ minWidth: 0 }}><Typography fontWeight={900} sx={{ overflowWrap: 'anywhere' }}>{job.title}</Typography><Typography variant="body2" color="text.secondary" fontWeight={700}>{job.organization}{job.location ? ` · ${job.location}` : ''}</Typography></Box></Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{job.summary}</Typography>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.25 }}>{job.valid_until ? `Bewerbung bis ${formatDate(job.valid_until)}` : job.published_date ? `Vom ${formatDate(job.published_date)}` : 'Aktuelle Stelle'}</Typography>
                        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>{job.application_url && <Button size="small" component="a" href={job.application_url} target="_blank" rel="noopener noreferrer" endIcon={<ArrowForwardRoundedIcon />} sx={{ color: primaryColor, fontWeight: 900 }}>Zur Stelle</Button>}{job.source_url && <Button size="small" variant="text" component="a" href={job.source_url} target="_blank" rel="noopener noreferrer" sx={{ color: primaryColor, fontWeight: 800 }}>Quelle</Button>}{!job.application_url && !job.source_url && <Typography variant="caption" color="text.secondary">Bestandseintrag ohne Quellenlink</Typography>}</Stack>
                    </Paper></Grid>;
                })}</Grid>
            </Box>}

            <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3.5, overflow: 'hidden', border: `1px solid ${alpha(primaryColor, 0.24)}` } }}>
                <DialogTitle sx={{ pr: 7, bgcolor: primaryColor, color: primaryContrast, fontWeight: 900 }}>
                    {selected?.person_name}
                    <IconButton aria-label="Schließen" onClick={() => setSelected(null)} sx={{ position: 'absolute', right: 12, top: 12, color: primaryContrast }}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    {selected && (
                        <>
                            <CareerCard entry={selected} onOpen={() => {}} detail accentColor={primaryColor} />
                            <Paper variant="outlined" sx={{ mt: 1.5, p: 1.5, borderRadius: 2, borderColor: alpha(primaryColor, 0.22), bgcolor: alpha(primaryColor, 0.035) }}><Typography variant="caption" color="text.secondary" display="block">Quelle der Meldung</Typography>{selected.source_url ? <Button component="a" href={selected.source_url} target="_blank" rel="noopener noreferrer" endIcon={<ArrowForwardRoundedIcon />} sx={{ color: primaryColor, p: 0, minHeight: 'auto', justifyContent: 'flex-start' }}>Originalmeldung öffnen</Button> : <Typography variant="body2" color="text.secondary">Bestandseintrag ohne hinterlegten externen Quellenlink.</Typography>}</Paper>
                            <Typography variant="body2" sx={{ mt: 2 }}>Austausch und Kommentare bleiben der Community vorbehalten.</Typography>
                        </>
                    )}
                    {notice && <Alert severity="info" sx={{ mt: 1 }}>{notice}</Alert>}
                    {shareFallback && <TextField label="Link zum Kopieren" value={shareFallback} fullWidth InputProps={{ readOnly: true }} onFocus={(event) => event.target.select()} sx={{ mt: 2 }} />}
                </DialogContent>
                <DialogActions>
                    <Button
                        startIcon={<ShareIcon />}
                        sx={{ color: primaryColor }}
                        onClick={async () => {
                            const url = `${window.location.origin}${partnerPath}?career=${selected!.id}#menschen-karriere`;
                            setShareFallback('');
                            try {
                                if (navigator.share) await navigator.share({ title: `${selected!.person_name} · Menschen & Karriere`, url });
                                else {
                                    await navigator.clipboard.writeText(url);
                                    setNotice('Link kopiert.');
                                }
                            } catch (error: any) {
                                if (error?.name !== 'AbortError') {
                                    setShareFallback(url);
                                    setNotice('Bitte diesen Link kopieren.');
                                }
                            }
                        }}
                    >
                        Teilen
                    </Button>
                    <Button component="a" href={login} variant="contained" sx={{ bgcolor: primaryColor, color: primaryContrast, '&:hover': { bgcolor: primaryColor, filter: 'brightness(0.92)' } }}>Zur Community</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
