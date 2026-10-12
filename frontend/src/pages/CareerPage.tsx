import { Container, Paper, Tab, Tabs } from '@mui/material';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import { useSearchParams } from 'react-router-dom';
import CareerPanel from '../components/CareerPanel';
import CareerJobsPanel from '../components/CareerJobsPanel';

export default function CareerPage() {
    const [params, setParams] = useSearchParams();
    const area = params.get('area') === 'jobs' ? 'jobs' : 'people';
    const changeArea = (next: string) => {
        const updated = new URLSearchParams(params);
        if (next === 'jobs') updated.set('area', 'jobs');
        else updated.delete('area');
        setParams(updated, { replace: true });
    };
    return <Container maxWidth="xl" sx={{ py: 3 }}>
        <Paper variant="outlined" sx={{ mb: 3, borderRadius: 3, overflow: 'hidden' }}>
            <Tabs value={area} onChange={(_, value) => changeArea(value)} variant="fullWidth" aria-label="Menschen und Karriere Bereiche">
                <Tab value="people" icon={<PeopleOutlineIcon />} iconPosition="start" label="Menschen & Karriere" />
                <Tab value="jobs" icon={<WorkOutlineIcon />} iconPosition="start" label="Branchen-Jobmarkt" />
            </Tabs>
        </Paper>
        {area === 'jobs' ? <CareerJobsPanel /> : <CareerPanel />}
    </Container>;
}
