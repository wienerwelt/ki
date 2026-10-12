import { useEffect, useState } from 'react';
import { Avatar, Box, Button, Chip, Divider, List, ListItemAvatar, ListItemButton, ListItemText, Stack, Typography } from '@mui/material';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { CareerEntry, careerKinds, careerRequest } from '../CareerPanel';
import { CareerJob } from '../CareerJobsPanel';
import WidgetPaper from './WidgetPaper';

export default function PeopleCareerWidget(props: any) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [entries, setEntries] = useState<CareerEntry[]>([]);
    const [jobs, setJobs] = useState<CareerJob[]>([]);
    const [error, setError] = useState('');

    useEffect(() => {
        let live = true;
        if (props.isPublic) return undefined;
        Promise.all([
            careerRequest('/api/career?limit=3'),
            careerRequest('/api/career/jobs?limit=3'),
        ]).then(([people, jobData]) => {
            if (!live) return;
            setEntries(people.entries || []);
            setJobs(jobData.jobs || []);
        }).catch((cause: Error) => { if (live) setError(cause.message); });
        return () => { live = false; };
    }, [user?.business_partner_id, props.isPublic]);

    if (props.isPublic) return null;
    return <WidgetPaper {...props} widgetTitle="Menschen & Karriere" widgetTypeKey="PeopleCareer" title={<Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}><PeopleOutlineIcon /> Menschen & Karriere</Box>} error={error || null}>
        {entries.length > 0 && <>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1, pt: 0.5 }}><Typography variant="overline" fontWeight={900}>Personalien</Typography><Chip size="small" label={entries.length} /></Stack>
            <List disablePadding>{entries.map((entry) => <ListItemButton key={entry.id} onClick={() => navigate(`/career?entry=${entry.id}`)}>
                <ListItemAvatar><Avatar src={entry.photo_url || (entry.organization_logo ? resolveAssetUrl(entry.organization_logo) : undefined)}><PeopleOutlineIcon /></Avatar></ListItemAvatar>
                <ListItemText primary={entry.person_name} secondary={`${entry.organization} · ${entry.role_title || careerKinds[entry.kind]}`} primaryTypographyProps={{ fontWeight: 800 }} />
            </ListItemButton>)}</List>
        </>}
        {entries.length > 0 && jobs.length > 0 && <Divider sx={{ my: 1 }} />}
        {jobs.length > 0 && <>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1 }}><Typography variant="overline" fontWeight={900}>Branchenjobs</Typography><Chip size="small" label={jobs.length} /></Stack>
            <List disablePadding>{jobs.map((job) => <ListItemButton key={job.id} onClick={() => navigate('/career?area=jobs')}>
                <ListItemAvatar><Avatar variant="rounded" src={job.organization_logo ? resolveAssetUrl(job.organization_logo) : undefined}><WorkOutlineIcon /></Avatar></ListItemAvatar>
                <ListItemText primary={job.title} secondary={`${job.organization}${job.location ? ` · ${job.location}` : ''}`} primaryTypographyProps={{ fontWeight: 800 }} />
            </ListItemButton>)}</List>
        </>}
        {!entries.length && !jobs.length && <Typography color="text.secondary" sx={{ p: 1 }}>Noch keine freigegebenen Personalien oder Branchenjobs vorhanden.</Typography>}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
            <Button fullWidth onClick={() => navigate('/career')} sx={{ textTransform: 'none' }}>Personalien</Button>
            <Button fullWidth onClick={() => navigate('/career?area=jobs')} sx={{ textTransform: 'none' }}>Branchenjobs</Button>
        </Stack>
    </WidgetPaper>;
}
