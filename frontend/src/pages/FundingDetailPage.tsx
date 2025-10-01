import React, { useState, useEffect } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { 
    Container, Typography, Box, Grid, Paper, CircularProgress, Alert, Button,
    Chip, Divider, Modal, Fade, Backdrop
} from '@mui/material';
import { format } from 'date-fns';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import PlaceIcon from '@mui/icons-material/Place';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import PercentIcon from '@mui/icons-material/Percent';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BookmarkIcon from '@mui/icons-material/Bookmark';

import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

// --- Interfaces & Typen ---
type UserFundingStatus = 'favorited' | 'applied' | 'hidden';

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
    user_status: UserFundingStatus | null; // NEU: Status hinzugefügt
}

// --- Hilfskomponenten & Konfigurationen ---

const statusConfig: { [key in UserFundingStatus]: { label: string; color: 'success' | 'warning' | 'default' } } = {
    favorited: { label: 'Gemerkt', color: 'warning' },
    applied: { label: 'Beworben', color: 'success' },
    hidden: { label: 'Ausgeblendet', color: 'default' },
};

const KeyFact: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = ({ icon, label, value }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Box sx={{ mr: 1.5, color: 'text.secondary' }}>{icon}</Box>
        <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{label}</Typography>
            <Typography variant="body1" sx={{ fontWeight: 'medium' }}>{value || 'N/A'}</Typography>
        </Box>
    </Box>
);

// --- Hauptkomponente ---

const FundingDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [funding, setFunding] = useState<FundingDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // NEU: State für das KI-Anschreiben Modal
    const [isDraftModalOpen, setDraftModalOpen] = useState(false);
    const [draftContent, setDraftContent] = useState('');
    const [isDraftLoading, setDraftLoading] = useState(false);
    const [draftError, setDraftError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        const fetchFundingDetail = async () => {
            setLoading(true);
            setError(null);
            try {
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

    const handleGenerateDraft = async () => {
        if (!id) return;
        setDraftModalOpen(true);
        setDraftLoading(true);
        setDraftError(null);
        setDraftContent('');
        try {
            const { data } = await apiClient.post('/api/funding/generate-draft', { fundingId: id });
            setDraftContent(data.draft);
        } catch (err) {
            setDraftError('Der Entwurf konnte leider nicht erstellt werden.');
        } finally {
            setDraftLoading(false);
        }
    };

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
                        {/* ... (Titel, Zusammenfassung, etc. bleiben gleich) ... */}
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
                            {funding.user_status && (
                                <KeyFact
                                    icon={<BookmarkIcon fontSize="small"/>}
                                    label="Ihr Status"
                                    value={<Chip
                                        label={statusConfig[funding.user_status].label}
                                        color={statusConfig[funding.user_status].color}
                                        size="small"
                                    />}
                                />
                            )}
                            {/* ... (andere Eckdaten bleiben gleich) ... */}
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
                            variant="contained" color="primary" startIcon={<AutoAwesomeIcon />}
                            sx={{ mt: 2, width: '100%' }}
                            onClick={handleGenerateDraft} // NEU: OnClick-Handler
                            disabled={isDraftLoading} // NEU: Button während des Ladens deaktivieren
                        >
                            KI-Anschreiben entwerfen
                        </Button>
                        <Button
                            variant="outlined" component="a" href={funding.original_url}
                            target="_blank" rel="noopener noreferrer" sx={{ mt: 1, width: '100%' }}
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

            {/* NEU: Modal für KI-Anschreiben */}
            <Modal
                open={isDraftModalOpen}
                onClose={() => setDraftModalOpen(false)}
                closeAfterTransition
                slots={{ backdrop: Backdrop }}
                slotProps={{ backdrop: { timeout: 500 } }}
            >
                <Fade in={isDraftModalOpen}>
                    <Box sx={{
                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        width: { xs: '90%', sm: 600 }, bgcolor: 'background.paper',
                        boxShadow: 24, p: 4, borderRadius: 2
                    }}>
                        <Typography variant="h6" component="h2" gutterBottom>
                            KI-generierter Entwurf
                        </Typography>
                        {isDraftLoading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}><CircularProgress /></Box>}
                        {draftError && <Alert severity="error">{draftError}</Alert>}
                        {draftContent && (
                            <Paper variant="outlined" sx={{ p: 2, mt: 2, maxHeight: '60vh', overflowY: 'auto' }}>
                               <Typography sx={{ whiteSpace: 'pre-wrap' }}>{draftContent}</Typography>
                            </Paper>
                        )}
                        <Button onClick={() => setDraftModalOpen(false)} sx={{ mt: 2 }}>
                            Schließen
                        </Button>
                    </Box>
                </Fade>
            </Modal>
        </DashboardLayout>
    );
};

export default FundingDetailPage;