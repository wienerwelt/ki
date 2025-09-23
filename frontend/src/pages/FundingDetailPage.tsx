import React, { useState, useEffect } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { 
    Container, Typography, Box, Grid, Paper, CircularProgress, Alert, Button,
    Chip, Divider
} from '@mui/material';
import { format } from 'date-fns';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import PlaceIcon from '@mui/icons-material/Place';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import PercentIcon from '@mui/icons-material/Percent';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

interface FundingDetail {
    id: string;
    title: string;
    summary_ai: string;
    deadline_start: string | null;
    deadline_end: string | null;
    funding_amount_min: number | null;
    funding_amount_max: number | null;
    funding_rate_percent: number | null;
    region: string;
    original_url: string;
    categories: string[] | null;
}

const KeyFact: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = ({ icon, label, value }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Box sx={{ mr: 1.5, color: 'text.secondary' }}>{icon}</Box>
        <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{label}</Typography>
            <Typography variant="body1" sx={{ fontWeight: 'medium' }}>{value || 'N/A'}</Typography>
        </Box>
    </Box>
);

const FundingDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [funding, setFunding] = useState<FundingDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        const fetchFundingDetail = async () => {
            setLoading(true);
            setError(null);
            try {
                // Korrekter API-Pfad
                const { data } = await apiClient.get(`/api/funding/${id}`);
                setFunding(data);
            } catch (err) {
                setError('Förderung konnte nicht geladen werden.');
            } finally {
                setLoading(false);
            }
        };
        fetchFundingDetail();
    }, [id]);

    const formatCurrency = (amount: number | null | undefined) => {
        if (amount == null) return null;
        return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    const renderContent = () => {
        if (loading) return <CircularProgress />;
        if (error) return <Alert severity="error">{error}</Alert>;
        if (!funding) return <Alert severity="warning">Keine Daten für diese Förderung gefunden.</Alert>;

        return (
            <Paper sx={{ p: { xs: 2, md: 4 } }}>
                <Grid container spacing={4}>
                    <Grid item xs={12} md={8}>
                        <Typography variant="h4" component="h1" gutterBottom>{funding.title}</Typography>
                        <Typography variant="body1" paragraph sx={{ whiteSpace: 'pre-wrap' }}>
                            {funding.summary_ai}
                        </Typography>
                        {funding.categories && funding.categories.length > 0 && (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, my: 2 }}>
                                {funding.categories.map(cat => <Chip key={cat} label={cat} />)}
                            </Box>
                        )}
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Paper variant="outlined" sx={{ p: 2, backgroundColor: 'action.hover', borderRadius: 2 }}>
                            <Typography variant="h6" gutterBottom>Eckdaten</Typography>
                            <Divider sx={{ mb: 2 }} />
                            <KeyFact 
                                icon={<CalendarTodayIcon fontSize="small"/>}
                                label="Einreichfrist"
                                value={funding.deadline_end ? format(new Date(funding.deadline_end), 'dd.MM.yyyy') : 'Laufend'}
                            />
                            <KeyFact 
                                icon={<MonetizationOnIcon fontSize="small"/>}
                                label="Förderhöhe (max.)"
                                value={formatCurrency(funding.funding_amount_max)}
                            />
                            <KeyFact 
                                icon={<PercentIcon fontSize="small"/>}
                                label="Förderquote"
                                value={funding.funding_rate_percent ? `${funding.funding_rate_percent}%` : null}
                            />
                             <KeyFact 
                                icon={<PlaceIcon fontSize="small"/>}
                                label="Region"
                                value={funding.region}
                            />
                        </Paper>
                         <Button
                            variant="contained"
                            color="primary"
                            startIcon={<AutoAwesomeIcon />}
                            sx={{ mt: 2, width: '100%' }}
                        >
                            KI-Anschreiben entwerfen
                        </Button>
                        <Button
                            variant="outlined"
                            component="a"
                            href={funding.original_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ mt: 1, width: '100%' }}
                        >
                            Zur Original-Quelle
                        </Button>
                    </Grid>
                </Grid>
            </Paper>
        );
    };

    return (
        <DashboardLayout>
            <Container maxWidth="lg" sx={{ my: 4 }}>
                <Button component={RouterLink} to="/funding-search" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>
                    Zurück zur Suche
                </Button>
                {renderContent()}
            </Container>
        </DashboardLayout>
    );
};

export default FundingDetailPage;