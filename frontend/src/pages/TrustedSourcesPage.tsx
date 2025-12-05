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
            {value === index && <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>{children}</Box>}
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

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabIndex(newValue);
    };

    return (
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            {/* Header Bereich */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                <Typography variant="h4" component="h1">
                    Vertrauenswürdige Quellen
                </Typography>
                
                {/* Info Box Stimmkraft */}
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <Tooltip title={`Mit ${contributionScore} Punkten zählt Ihre Stimme ${votePower}-fach.`}>
                        <Paper elevation={2} sx={{ p: '4px 12px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="h6" component="span" color="primary">
                                Stimmkraft: <strong>x{votePower}</strong>
                            </Typography>
                            <InfoOutlinedIcon fontSize="small" color="action" />
                        </Paper>
                    </Tooltip>
                </Box>
            </Box>

            {/* Demo Alert (volle Breite über dem Content) */}
            {isDemo && <Alert severity="info" sx={{ mb: 2 }}>Einige Funktionen sind im Demo-Modus deaktiviert.</Alert>}

            {/* Hauptinhalt */}
            <Paper>
                <Tabs value={tabIndex} onChange={handleTabChange} centered variant="scrollable" scrollButtons="auto">
                    <Tab label="Quellen durchsuchen" />
                    <Tab label="Abstimmen" />
                    <Tab label="Neue Quelle vorschlagen" />
                </Tabs>
                
                <TabPanel value={tabIndex} index={0}>
                    <BrowseSourcesList />
                </TabPanel>
                
                <TabPanel value={tabIndex} index={1}>
                    {/* Demo-Schutz für Abstimmung */}
                    {isDemo ? (
                        <Alert severity="warning">Das Abstimmen über Quellen ist für Demo-Benutzer deaktiviert.</Alert>
                    ) : (
                        <VoteSourcesList />
                    )}
                </TabPanel>
                
                <TabPanel value={tabIndex} index={2}>
                    {/* Demo-Schutz für Vorschläge */}
                    {isDemo ? (
                        <Alert severity="warning">Das Vorschlagen neuer Quellen ist für Demo-Benutzer deaktiviert.</Alert>
                    ) : (
                        <ProposeSourceForm onSuccess={refreshUserScore} />
                    )}
                </TabPanel>
            </Paper>
        </Container>
    );
};

export default TrustedSourcesPage;