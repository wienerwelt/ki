// frontend/src/components/ProfileTabSettings.tsx
import React, { useState } from 'react';
import { Box, Grid, Typography, TextField, Button, Paper, FormControlLabel, Switch, FormControl, InputLabel, Select, MenuItem, Alert, Snackbar } from '@mui/material';
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
      <Grid container spacing={4}>
        {/* Read-Only Account Infos */}
        <Grid item xs={12}><Typography variant="h6">Account Informationen</Typography></Grid>
        <Grid item xs={12} sm={6}><TextField label="E-Mail" fullWidth value={user.email} disabled /></Grid>
        <Grid item xs={12} sm={6}><TextField label="Rolle" fullWidth value={user.role} disabled /></Grid>
        <Grid item xs={12} sm={6}><TextField label="Membership Level" fullWidth value={user.membership_level || 'Kein Level'} disabled /></Grid>
        
        <Grid item xs={12} sm={6}>
            <Paper variant="outlined" sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="caption" color="text.secondary">Community-Punkte</Typography>
                    <Typography variant="body1" fontWeight="bold">{user.contribution_score || 0}</Typography>
                </Box>
                <Button size="small" variant="outlined" onClick={() => setHistoryModalOpen(true)}>Verlauf ansehen</Button>
            </Paper>
        </Grid>

        {/* App-Einstellungen */}
        <Grid item xs={12}><Typography variant="h6" sx={{ mt: 2 }}>Erscheinungsbild</Typography></Grid>
        <Grid item xs={12} sm={6}>
            <FormControlLabel control={<Switch checked={themeMode === 'dark'} onChange={handleThemeChange} disabled={isDemoUser}/>} label="Dark Mode" />
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

        {/* Sicherheit */}
        <Grid item xs={12}><Typography variant="h6" sx={{ mt: 2 }}>Sicherheit</Typography></Grid>
        <Grid item xs={12}>
            <Box component="form" onSubmit={handlePasswordChange} sx={{ maxWidth: 400 }}>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                <TextField type="password" label="Neues Passwort" fullWidth value={password} onChange={(e) => setPassword(e.target.value)} disabled={isDemoUser} sx={{ mb: 2 }} />
                <TextField type="password" label="Passwort bestätigen" fullWidth value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={isDemoUser} sx={{ mb: 2 }} />
                <Button type="submit" variant="contained" disabled={isDemoUser || !password}>Passwort aktualisieren</Button>
            </Box>
        </Grid>

      </Grid>

      <ContributionHistoryModal open={historyModalOpen} onClose={() => setHistoryModalOpen(false)} currentUserScore={user.contribution_score || 0} />
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar({ ...snackbar, open: false })} message={snackbar.message} />
    </Box>
  );
};

export default ProfileTabSettings;