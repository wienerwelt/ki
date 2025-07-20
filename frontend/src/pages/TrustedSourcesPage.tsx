// frontend/src/pages/TrustedSourcesPage.tsx
import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Paper, Tabs, Tab, CircularProgress, Alert } from '@mui/material';
import apiClient from '../apiClient';
import { useAuth } from '../context/AuthContext';

import { ProposeSourceForm } from '../components/ProposeSourceForm';
import { VoteSourcesList } from '../components/VoteSourcesList';
import { BrowseSourcesList } from '../components/BrowseSourcesList'; // <-- NEUER IMPORT

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
    const [tabIndex, setTabIndex] = useState(0); 
    const [contributionScore, setContributionScore] = useState(user?.contribution_score || 0);

    const refreshUserScore = async () => {
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.get('/api/users/me', { headers: { 'x-auth-token': token } });
            setContributionScore(response.data.contribution_score);
        } catch (err) {
            console.error("Fehler beim Aktualisieren des Punktestands", err);
        }
    };

    useEffect(() => {
        refreshUserScore();
    }, []);

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabIndex(newValue);
    };

    return (
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                <Typography variant="h4" component="h1">
                    Vertrauenswürdige Quellen
                </Typography>
                <Paper elevation={2} sx={{ p: '4px 12px', borderRadius: '16px' }}>
                    <Typography variant="h6" component="span">
                        Ihre Punkte: <strong>{contributionScore}</strong>
                    </Typography>
                </Paper>
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