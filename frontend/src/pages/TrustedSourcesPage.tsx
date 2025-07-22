// frontend/src/pages/TrustedSourcesPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
// HIER IST DIE ÄNDERUNG: useLocation wird benötigt
import { useLocation } from 'react-router-dom';
import { Container, Typography, Box, Paper, Tabs, Tab, CircularProgress, Alert, Tooltip } from '@mui/material';
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
    // HIER IST DIE ÄNDERUNG: useLocation wird hier aufgerufen
    const location = useLocation();

    // HIER IST DIE ÄNDERUNG: Der Start-Tab wird aus dem State der Navigation gelesen
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
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                <Typography variant="h4" component="h1">
                    Vertrauenswürdige Quellen
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <Paper elevation={2} sx={{ p: '4px 12px', borderRadius: '16px' }}>
                        <Typography variant="h6" component="span">
                            Ihre Punkte: <strong>{contributionScore}</strong>
                        </Typography>
                    </Paper>
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
                    <VoteSourcesList />
                </TabPanel>
                <TabPanel value={tabIndex} index={2}>
                    <ProposeSourceForm onSuccess={refreshUserScore} />
                </TabPanel>
            </Paper>
        </Container>
    );
};

export default TrustedSourcesPage;