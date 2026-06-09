// frontend/src/pages/ProfilePage.tsx
import React, { useState } from 'react';
import { Container, Typography, Paper, Tabs, Tab, Box, Alert, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

// Importiere die neuen Tab-Komponenten
import ProfileTabPersonal from '../components/ProfileTabPersonal';
import ProfileTabThemen from '../components/ProfileTabThemen';
import ProfileTabSettings from '../components/ProfileTabSettings';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function CustomTabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`profile-tabpanel-${index}`}
      aria-labelledby={`profile-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

const ProfilePage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  if (!user) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  }

  const isDemoUser = user.role === 'demo';

  return (
    <Container maxWidth="md">
      <Paper sx={{ p: { xs: 2, sm: 4 }, mt: 4, minHeight: '70vh' }}>
        <Typography variant="h4" component="h1" gutterBottom>{t('profile.title')}</Typography>
        {isDemoUser && <Alert severity="info" sx={{ mb: 3 }}>{t('profile.demoUserNotice')}</Alert>}

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={activeTab} 
            onChange={handleTabChange} 
            variant="scrollable"
            scrollButtons="auto"
            aria-label="Profil Navigation"
          >
            <Tab label="Persönliches" />
            <Tab label="Themen & Präferenzen" />
            <Tab label="Account & Sicherheit" />
          </Tabs>
        </Box>

        <CustomTabPanel value={activeTab} index={0}>
          <ProfileTabPersonal user={user} isDemoUser={isDemoUser} />
        </CustomTabPanel>

        <CustomTabPanel value={activeTab} index={1}>
          <ProfileTabThemen user={user} isDemoUser={isDemoUser} />
        </CustomTabPanel>

        <CustomTabPanel value={activeTab} index={2}>
          <ProfileTabSettings user={user} isDemoUser={isDemoUser} />
        </CustomTabPanel>

      </Paper>
    </Container>
  );
};

export default ProfilePage;