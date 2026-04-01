// frontend/src/pages/TrustedSourcesPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Container, Typography, Box, Paper, Tabs, Tab, Alert, Tooltip } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import apiClient from '../apiClient';
import { useAuth } from '../context/AuthContext';
import { ProposeSourceForm } from '../components/ProposeSourceForm';
import { VoteSourcesList } from '../components/VoteSourcesList';
import { BrowseSourcesList } from '../components/BrowseSourcesList';

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

function TabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;
    return (
        <div role="tabpanel" hidden={value !== index} {...other}>
            {value === index && <Box sx={{ p: { xs: 2, sm: 3 } }}>{children}</Box>}
        </div>
    );
}

const TrustedSourcesPage: React.FC = () => {
    const { user } = useAuth();
    const isDemo = user?.role === 'demo';
    const location = useLocation();

    const [tabIndex, setTabIndex] = useState(location.state?.tab || 0);
    const [contributionScore, setContributionScore] = useState(user?.contribution_score || 0);

    const votePower = useMemo(() => {
        return (1 + contributionScore / 100).toFixed(2);
    }, [contributionScore]);

    const refreshUserScore = async () => {
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.get('/api/users/me', { headers: { 'x-auth-token': token } });
            setContributionScore(response.data.contribution_score);
        } catch (err) {
            console.error("Fehler beim Aktualisieren des Punktestands", err);
        }
    };

    useEffect(() => { refreshUserScore(); }, []);

const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabIndex(newValue);
};

    return (
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            {/* Header Bereich */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                <Typography variant="h4" component="h1" fontWeight="bold">
                    Vertrauenswürdige Quellen
                </Typography>
                
                {/* Info Box Stimmkraft */}
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <Tooltip title={`Mit ${contributionScore} Punkten zählt Ihre Stimme ${votePower}-fach.`}>
                        <Paper elevation={1} sx={{ p: '6px 16px', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'background.default' }}>
                            <Typography variant="body1" component="span" fontWeight="medium" color="primary.main">
                                Stimmkraft: <Box component="span" sx={{ fontSize: '1.1rem', fontWeight: 'bold' }}>x{votePower}</Box>
                            </Typography>
                            <InfoOutlinedIcon fontSize="small" color="primary" />
                        </Paper>
                    </Tooltip>
                </Box>
            </Box>

            {/* Demo Alert */}
            {isDemo && <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>Einige Funktionen sind im Demo-Modus deaktiviert.</Alert>}

            {/* Hauptinhalt */}
            <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
                    <Tabs value={tabIndex} onChange={handleTabChange} centered variant="scrollable" scrollButtons="auto">
                        <Tab label="Quellen durchsuchen" sx={{ fontWeight: 'bold' }} />
                        <Tab label="Abstimmen" sx={{ fontWeight: 'bold' }} />
                        <Tab label="Neue Quelle vorschlagen" sx={{ fontWeight: 'bold' }} />
                    </Tabs>
                </Box>
                
                <TabPanel value={tabIndex} index={0}>
                    <BrowseSourcesList />
                </TabPanel>
                
                <TabPanel value={tabIndex} index={1}>
                    {isDemo ? (
                        <Alert severity="warning" sx={{ borderRadius: 2 }}>Das Abstimmen über Quellen ist für Demo-Benutzer deaktiviert.</Alert>
                    ) : (
                        <VoteSourcesList />
                    )}
                </TabPanel>
                
                <TabPanel value={tabIndex} index={2}>
                    {isDemo ? (
                        <Alert severity="warning" sx={{ borderRadius: 2 }}>Das Vorschlagen neuer Quellen ist für Demo-Benutzer deaktiviert.</Alert>
                    ) : (
                        <ProposeSourceForm onSuccess={refreshUserScore} />
                    )}
                </TabPanel>
            </Paper>
        </Container>
    );
};

export default TrustedSourcesPage;