// frontend/src/components/ProfileTabSettings.tsx
import React, { useState } from 'react';
import { Box, Grid, Typography, TextField, Button, Paper, FormControlLabel, Switch, FormControl, InputLabel, Select, MenuItem, Alert, Snackbar, Stack, Chip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import apiClient from '../apiClient';
import ContributionHistoryModal from './ContributionHistoryModal';

const ProfileTabSettings: React.FC<{ user: any; isDemoUser: boolean }> = ({ user, isDemoUser }) => {
  const { t } = useTranslation();
  const { themeMode, setThemeMode, language, setLanguage } = useAuth();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoUser) return;
    if (password !== confirmPassword) {
      setError(t('profile.passwordsDoNotMatch'));
      return;
    }
    try {
      await apiClient.put('/api/users/me', { password });
      setSnackbar({ open: true, message: 'Passwort erfolgreich geändert.' });
      setPassword('');
      setConfirmPassword('');
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Fehler beim Ändern des Passworts.');
    }
  };

  const handleThemeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setThemeMode(e.target.checked ? 'dark' : 'light');
      // Falls gewünscht, hier auch auto-save ins Backend
  };

  return (
    <Box>
      <Stack spacing={3}>
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
          <Typography variant="h6" fontWeight={800}>Kontodaten</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Rolle und Mitgliedsstufe werden durch Ihre Organisation verwaltet.</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}><TextField label="E-Mail" fullWidth value={user.email} disabled /></Grid>
            <Grid item xs={12} sm={6}><TextField label="Rolle" fullWidth value={user.role} disabled /></Grid>
            <Grid item xs={12} sm={6}><TextField label="Mitgliedsstufe" fullWidth value={user.membership_level || 'Keine Mitgliedsstufe'} disabled /></Grid>
            <Grid item xs={12} sm={6}>
              <Paper variant="outlined" sx={{ p: 2, height: '100%', display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center' }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Community-Punkte</Typography>
                  <Chip size="small" color="primary" label={user.contribution_score || 0} sx={{ ml: 1, fontWeight: 800 }} />
                </Box>
                <Button size="small" variant="outlined" onClick={() => setHistoryModalOpen(true)}>Verlauf</Button>
              </Paper>
            </Grid>
          </Grid>
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
          <Typography variant="h6" fontWeight={800}>Darstellung</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Passen Sie Oberfläche und Sprache an.</Typography>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6}>
              <FormControlLabel control={<Switch checked={themeMode === 'dark'} onChange={handleThemeChange} disabled={isDemoUser}/>} label="Dunkle Darstellung" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Sprache</InputLabel>
                <Select value={language} label="Sprache" onChange={(e) => setLanguage(e.target.value as 'de'|'en')} disabled={isDemoUser}>
                  <MenuItem value="de">Deutsch</MenuItem>
                  <MenuItem value="en">English</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
          <Typography variant="h6" fontWeight={800}>Passwort & Sicherheit</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Verwenden Sie ein eigenständiges, ausreichend langes Passwort.</Typography>
          <Box component="form" onSubmit={handlePasswordChange} sx={{ maxWidth: 520 }}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <TextField type="password" label="Neues Passwort" fullWidth value={password} onChange={(e) => setPassword(e.target.value)} disabled={isDemoUser} sx={{ mb: 2 }} />
            <TextField type="password" label="Passwort bestätigen" fullWidth value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={isDemoUser} sx={{ mb: 2 }} />
            <Button type="submit" variant="contained" disabled={isDemoUser || !password}>Passwort aktualisieren</Button>
          </Box>
        </Paper>
      </Stack>

      <ContributionHistoryModal open={historyModalOpen} onClose={() => setHistoryModalOpen(false)} currentUserScore={user.contribution_score || 0} />
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar({ ...snackbar, open: false })} message={snackbar.message} />
    </Box>
  );
};

export default ProfileTabSettings;
