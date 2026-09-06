// frontend/src/pages/ProfilePage.tsx
import React, { useState } from 'react';
import { Container, Typography, Paper, Tabs, Tab, Box, Alert, CircularProgress, Stack } from '@mui/material';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import TuneIcon from '@mui/icons-material/Tune';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import SecurityIcon from '@mui/icons-material/Security';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

// Importiere die neuen Tab-Komponenten
import ProfileTabPersonal from '../components/ProfileTabPersonal';
import ProfileTabThemen from '../components/ProfileTabThemen';
import ProfileTabNotifications from '../components/ProfileTabNotifications';
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
    <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 } }}>
      <Paper sx={{ p: { xs: 2, sm: 4 }, minHeight: '70vh', borderRadius: 3 }}>
        <Stack spacing={0.5} sx={{ mb: 3 }}>
          <Typography variant="h4" component="h1" fontWeight={900}>{t('profile.title')}</Typography>
          <Typography variant="body2" color="text.secondary">Persönliche Daten, Interessen, E-Mail-Einstellungen und Sicherheit an einem Ort.</Typography>
        </Stack>
        {isDemoUser && <Alert severity="info" sx={{ mb: 3 }}>{t('profile.demoUserNotice')}</Alert>}

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={activeTab} 
            onChange={handleTabChange} 
            variant="scrollable"
            scrollButtons="auto"
            aria-label="Profil Navigation"
          >
            <Tab icon={<PersonOutlineIcon />} iconPosition="start" label="Profil & Visitenkarte" />
            <Tab icon={<TuneIcon />} iconPosition="start" label="Inhalte & Interessen" />
            <Tab icon={<EmailOutlinedIcon />} iconPosition="start" label="E-Mail & Newsletter" />
            <Tab icon={<SecurityIcon />} iconPosition="start" label="Konto & Sicherheit" />
          </Tabs>
        </Box>

        <CustomTabPanel value={activeTab} index={0}>
          <ProfileTabPersonal user={user} isDemoUser={isDemoUser} />
        </CustomTabPanel>

        <CustomTabPanel value={activeTab} index={1}>
          <ProfileTabThemen user={user} isDemoUser={isDemoUser} />
        </CustomTabPanel>

        <CustomTabPanel value={activeTab} index={2}>
          <ProfileTabNotifications user={user} isDemoUser={isDemoUser} />
        </CustomTabPanel>

        <CustomTabPanel value={activeTab} index={3}>
          <ProfileTabSettings user={user} isDemoUser={isDemoUser} />
        </CustomTabPanel>

      </Paper>
    </Container>
  );
};

export default ProfilePage;
