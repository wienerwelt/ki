// src/pages/AdminCronjobsPage.tsx
import React, { useState } from 'react';
import { useLocation } from 'react-router-dom'; // NEUER IMPORT
import { Box, Typography, Container, Tabs, Tab } from '@mui/material';
import DashboardLayout from '../components/DashboardLayout';
import AdminAITab from '../components/AdminAITab';
import AdminScrapingTab from '../components/AdminScrapingTab';
import AdminEmailTab from '../components/AdminEmailTab';
import AdminAISystemTab from '../components/AdminAISystemTab';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SearchIcon from '@mui/icons-material/Search';
import EmailIcon from '@mui/icons-material/Email';
import VpnKeyIcon from '@mui/icons-material/VpnKey';

const AdminCronjobsPage: React.FC = () => {
    const location = useLocation(); // NEU
    const [currentTab, setCurrentTab] = useState(location.state?.tab || 0); // NEU: liest den Start-Tab aus dem Link-State

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setCurrentTab(newValue);
    };

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    Automatisierte Aufgaben (Cronjobs)
                </Typography>
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={currentTab} onChange={handleTabChange} aria-label="cronjob tabs">
                        <Tab icon={<SmartToyIcon />} iconPosition="start" label="KI-Abonnements (Nutzer)" />
                        <Tab icon={<VpnKeyIcon />} iconPosition="start" label="KI-System (Redaktionell)" />
                        <Tab icon={<SearchIcon />} iconPosition="start" label="Content Scraping" />
                        <Tab icon={<EmailIcon />} iconPosition="start" label="E-Mail Versand" />
                    </Tabs>
                </Box>
                <Box sx={{ pt: 3 }}>
                    {currentTab === 0 && <AdminAITab />}
                    {currentTab === 1 && <AdminAISystemTab />}
                    {currentTab === 2 && <AdminScrapingTab />}
                    {currentTab === 3 && <AdminEmailTab />}
                </Box>
            </Container>
        </DashboardLayout>
    );
};

export default AdminCronjobsPage;