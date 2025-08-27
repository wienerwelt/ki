// frontend/src/pages/ProfilePage.tsx
import React, { useState, useEffect } from 'react';
import {
    Container, Typography, Box, TextField, Button, Grid, Paper, CircularProgress,
    Alert, Snackbar, Tooltip, ToggleButton, ToggleButtonGroup, FormControlLabel, Switch,
    FormControl, InputLabel, Select, MenuItem, SelectChangeEvent
} from '@mui/material';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { useAuth } from '../context/AuthContext';
import apiClient from '../apiClient';
import { useTranslation } from 'react-i18next';
import posthog from 'posthog-js';

type ScoreFilter = 'all' | 'balanced' | 'positive';

const ProfilePage: React.FC = () => {
    const { t } = useTranslation();
    const { user, updateUser, themeMode, setThemeMode, language, setLanguage } = useAuth();
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [snackbar, setSnackbar] = useState<{ open: boolean, message: string }>({ open: false, message: '' });

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [organizationName, setOrganizationName] = useState('');
    const [linkedinUrl, setLinkedinUrl] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all');
    
    const isDemoUser = user?.role === 'demo';

    useEffect(() => {
        // Die Formularfelder werden jetzt direkt aus dem user-Objekt im AuthContext befüllt
        if (user) {
            setFirstName(user.first_name || '');
            setLastName(user.last_name || '');
            setOrganizationName(user.organization_name || '');
            setLinkedinUrl(user.linkedin_url || '');

            const scoreMin = user.article_score_min;
            if (scoreMin === 1) setScoreFilter('positive');
            else if (scoreMin === 0) setScoreFilter('balanced');
            else setScoreFilter('all');

            setLoading(false);
        }
    }, [user]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (isDemoUser) return;
        setError(null);

        if (password !== confirmPassword) {
            setError(t('profile.passwordsDoNotMatch'));
            return;
        }

        try {
            const token = localStorage.getItem('jwt_token');
            let articleScoreMin: number | null = null;
            if (scoreFilter === 'positive') articleScoreMin = 1;
            else if (scoreFilter === 'balanced') articleScoreMin = 0;

            const profileData = {
                first_name: firstName,
                last_name: lastName,
                organization_name: organizationName,
                linkedin_url: linkedinUrl,
                password: password || undefined,
                article_score_min: articleScoreMin,
                article_score_max: null,
                preferred_theme: themeMode,
                preferred_language: language,
            };

            const response = await apiClient.put('/api/users/me', profileData, {
                headers: { 'x-auth-token': token }
            });
            
            updateUser(response.data); // Aktualisiert den globalen User-State mit der Antwort vom Server
            setSnackbar({ open: true, message: t('profile.updateSuccess') });
            setPassword('');
            setConfirmPassword('');
            
            // PostHog Event für erfolgreiche Profiländerung
            posthog.capture('profile_updated');

        } catch (err: any) {
            setError(err.response?.data?.message || t('profile.updateError'));
        }
    };
    
    const handleScoreFilterChange = (event: React.MouseEvent<HTMLElement>, newFilter: ScoreFilter | null) => {
        if (newFilter !== null) setScoreFilter(newFilter);
    };

    const handleThemeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setThemeMode(event.target.checked ? 'dark' : 'light');
    };
    
    const handleLanguageChange = (event: SelectChangeEvent<'de' | 'en'>) => {
        setLanguage(event.target.value as 'de' | 'en');
    };

    if (loading || !user) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
    }

    return (
        <Container maxWidth="md">
            <Paper sx={{ p: 4, mt: 4 }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    {t('profile.title')}
                </Typography>
                
                {isDemoUser && (
                    <Alert severity="info" sx={{ mb: 3 }}>
                        {t('profile.demoUserNotice')}
                    </Alert>
                )}

                <Box component="form" onSubmit={handleSubmit}>
                    <Grid container spacing={3}>
                        <Grid item xs={12} sm={6}>
                            <TextField label={t('profile.firstname')} fullWidth value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={isDemoUser} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField label={t('profile.lastname')} fullWidth value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={isDemoUser} />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField label={t('profile.organization')} fullWidth value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} disabled={isDemoUser} />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField label={t('profile.linkedinUrl')} fullWidth value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} disabled={isDemoUser} />
                        </Grid>
                        
                        <Grid item xs={12}>
                            <Typography variant="h6" sx={{ mt: 2 }}>{t('profile.dashboardSettings')}</Typography>
                        </Grid>
                        <Grid item xs={12}>
                           <Typography variant="body2" color="text.secondary" gutterBottom>
                               {t('profile.articleQuality')}
                           </Typography>
                           <ToggleButtonGroup value={scoreFilter} exclusive onChange={handleScoreFilterChange} aria-label="Artikel-Score Filter" disabled={isDemoUser}>
                                <ToggleButton value="all" aria-label="alles anzeigen">
                                    <Tooltip title={t('profile.tooltipAll')}><ThumbDownIcon sx={{ mr: 1 }} /></Tooltip>{t('profile.qualityAll')}
                                </ToggleButton>
                                <ToggleButton value="balanced" aria-label="ausgeglichen und besser">
                                    <Tooltip title={t('profile.tooltipBalanced')}><RemoveCircleOutlineIcon sx={{ mr: 1 }} /></Tooltip>{t('profile.qualityBalanced')}
                                </ToggleButton>
                                <ToggleButton value="positive" aria-label="nur positive">
                                    <Tooltip title={t('profile.tooltipHelpful')}><ThumbUpIcon sx={{ mr: 1 }} /></Tooltip>{t('profile.qualityHelpful')}
                                </ToggleButton>
                            </ToggleButtonGroup>
                        </Grid>

                        <Grid item xs={12}>
                            <Typography variant="h6" sx={{ mt: 2 }}>{t('profile.appearanceSettings')}</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <FormControlLabel control={<Switch checked={themeMode === 'dark'} onChange={handleThemeChange} disabled={isDemoUser} />} label={t('profile.darkTheme')} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <FormControl fullWidth size="small">
                                <InputLabel>{t('profile.language')}</InputLabel>
                                <Select value={language} label={t('profile.language')} onChange={handleLanguageChange} disabled={isDemoUser}>
                                    <MenuItem value="de">Deutsch</MenuItem>
                                    <MenuItem value="en">English</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>

                        <Grid item xs={12}>
                            <Typography variant="h6" sx={{ mt: 2 }}>{t('profile.accountInfo')}</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField label={t('profile.email')} fullWidth value={user.email} disabled />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField label={t('profile.role')} fullWidth value={user.role} disabled />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField label={t('profile.membershipLevel')} fullWidth value={user.membership_level || 'Kein Level'} disabled />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField label={t('profile.communityPoints')} fullWidth value={user.contribution_score || 0} disabled />
                        </Grid>                        
                        <Grid item xs={12}>
                            <Typography variant="h6" sx={{ mt: 2 }}>{t('profile.changePassword')}</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField type="password" label={t('profile.newPassword')} fullWidth value={password} onChange={(e) => setPassword(e.target.value)} disabled={isDemoUser} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField type="password" label={t('profile.confirmPassword')} fullWidth value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={isDemoUser} />
                        </Grid>
                        {error && (
                            <Grid item xs={12}>
                                <Alert severity="error">{error}</Alert>
                            </Grid>
                        )}
                        <Grid item xs={12}>
                            <Button type="submit" variant="contained" color="primary" sx={{ mt: 2 }} disabled={isDemoUser}>
                                {t('saveChanges')}
                            </Button>
                        </Grid>
                    </Grid>
                </Box>
            </Paper>
            <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })} message={snackbar.message} />
        </Container>
    );
};

export default ProfilePage;