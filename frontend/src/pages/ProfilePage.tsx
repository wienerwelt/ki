import React, { useState, useEffect, useCallback } from 'react';
import {
  Container, Typography, Box, TextField, Button, Grid, Paper, CircularProgress,
  Alert, Snackbar, Tooltip, ToggleButton, ToggleButtonGroup, FormControlLabel, Switch,
  FormControl, InputLabel, Select, MenuItem, SelectChangeEvent, Chip, Autocomplete, useTheme, useMediaQuery
} from '@mui/material';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { useAuth } from '../context/AuthContext';
import apiClient from '../apiClient';
import { useTranslation } from 'react-i18next';
import posthog from 'posthog-js';
import ContributionHistoryModal from '../components/ContributionHistoryModal';

type ScoreFilter = 'all' | 'balanced' | 'positive';
interface FundingCategory { id: number; name: string; }

const ProfilePage: React.FC = () => {
  const { t } = useTranslation();
  const { user, updateUser, themeMode, setThemeMode, language, setLanguage } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean, message: string }>({ open: false, message: '' });
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all');
  const [userTags, setUserTags] = useState<string[]>([]);
  const [allAvailableTags, setAllAvailableTags] = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [allFundingCategories, setAllFundingCategories] = useState<FundingCategory[]>([]);
  const [userFundingCategoryIds, setUserFundingCategoryIds] = useState<number[]>([]);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [newsletterOptIn, setNewsletterOptIn] = useState<boolean>(false);
  const isDemoUser = user?.role === 'demo';

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
        const token = localStorage.getItem('jwt_token');
        const headers = { headers: { 'x-auth-token': token } };
        
        const [tagsRes, allTagsRes, allCatsRes, userCatsRes] = await Promise.all([
            apiClient.get('/api/users/tags', headers),
            apiClient.get('/api/data/all-tags', headers),
            apiClient.get('/api/funding/categories', headers),
            apiClient.get('/api/funding/user-categories', headers)
        ]);

        setUserTags(tagsRes.data || []);
        setAllAvailableTags(allTagsRes.data || []);
        setAllFundingCategories(allCatsRes.data || []);
        setUserFundingCategoryIds(userCatsRes.data || []);

    } catch (err) {
        console.error("Fehler beim Laden der Profildaten:", err);
        setError("Einige Profildaten konnten nicht geladen werden.");
    } finally {
        setLoading(false);
        setTagsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
      setOrganizationName(user.organization_name || '');
      setLinkedinUrl(user.linkedin_url || '');

      const scoreMin = user.article_score_min;
      if (scoreMin === 1) setScoreFilter('positive');
      else if (scoreMin === 0) setScoreFilter('balanced');
      else setScoreFilter('all');

      setNewsletterOptIn(Boolean((user as any).newsletter_opt_in));
      
      fetchData();
    }
  }, [user, fetchData]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isDemoUser) return;
    setError(null);

    if (password !== confirmPassword) {
      setError(t('profile.passwordsDoNotMatch'));
      return;
    }

    try {
      let articleScoreMin: number | null = null;
      if (scoreFilter === 'positive') articleScoreMin = 1;
      else if (scoreFilter === 'balanced') articleScoreMin = 0;

      // Das newsletter_opt_in wird hier bereits korrekt mitgesendet
      const profileData = {
        first_name: firstName, lastName, organization_name: organizationName, linkedin_url: linkedinUrl,
        password: password || undefined,
        article_score_min: articleScoreMin, article_score_max: null,
        preferred_theme: themeMode, preferred_language: language,
        newsletter_opt_in: newsletterOptIn,
      };

      const token = localStorage.getItem('jwt_token');
      const headers = { headers: { 'x-auth-token': token } };

      const [profileResponse] = await Promise.all([
        apiClient.put('/api/users/me', profileData, headers),
        apiClient.post('/api/funding/user-categories', { categoryIds: userFundingCategoryIds }, headers)
      ]);
      
      updateUser(profileResponse.data);
      setSnackbar({ open: true, message: t('profile.updateSuccess') });
      setPassword('');
      setConfirmPassword('');
      posthog.capture('profile_updated');
    } catch (err: any) {
      setError(err?.response?.data?.message || t('profile.updateError'));
    }
  };

  const handleTagsChange = async (_event: React.SyntheticEvent, newTags: string[]) => {
    if (isDemoUser) return;
    const oldTags = userTags;
    setUserTags(newTags);
    const tagsToAdd = newTags.filter(tag => !oldTags.includes(tag));
    const tagsToRemove = oldTags.filter(tag => !newTags.includes(tag));
    try {
        if (tagsToAdd.length > 0) await Promise.all(tagsToAdd.map(tag => apiClient.post('/api/users/tags', { tagName: tag })));
        if (tagsToRemove.length > 0) await Promise.all(tagsToRemove.map(tag => apiClient.delete(`/api/users/tags/${encodeURIComponent(tag)}`)));
        setSnackbar({ open: true, message: 'Themen aktualisiert.'});
    } catch (err) {
        setSnackbar({ open: true, message: 'Fehler beim Aktualisieren der Themen.' });
        setUserTags(oldTags);
    }
  };
  
  const handleScoreFilterChange = (_event: React.MouseEvent<HTMLElement>, newFilter: ScoreFilter | null) => {
    if (newFilter !== null) setScoreFilter(newFilter);
  };

  const handleThemeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setThemeMode(event.target.checked ? 'dark' : 'light');
  };

  const handleLanguageChange = (event: SelectChangeEvent<'de' | 'en'>) => {
    setLanguage(event.target.value as 'de' | 'en');
  };

  const handleNewsletterToggle = (_event: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
    if (isDemoUser) return;
    setNewsletterOptIn(checked);
  };

  if (loading || !user) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  }

  return (
    <Container maxWidth="md">
      <Paper sx={{ p: 4, mt: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>{t('profile.title')}</Typography>
        {isDemoUser && <Alert severity="info" sx={{ mb: 3 }}>{t('profile.demoUserNotice')}</Alert>}
        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}><TextField label={t('profile.firstname')} fullWidth value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={isDemoUser}/></Grid>
            <Grid item xs={12} sm={6}><TextField label={t('profile.lastname')} fullWidth value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={isDemoUser}/></Grid>
            <Grid item xs={12}><TextField label={t('profile.organization')} fullWidth value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} disabled={isDemoUser}/></Grid>
            <Grid item xs={12}><TextField label={t('profile.linkedinUrl')} fullWidth value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} disabled={isDemoUser}/></Grid>
            
            {/* --- NEUER ABSCHNITT FÜR FÖRDER-INTERESSEN --- */}
            <Grid item xs={12}>
                <Typography variant="h6" sx={{ mt: 2 }}>Meine Förder-Interessen</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Wählen Sie Ihre relevanten Branchen und Themen aus, damit wir Ihnen die passendsten Förderungen mit einem "Match-Score" anzeigen können.
                </Typography>
                {tagsLoading ? <CircularProgress size={24} /> : (
                    <Autocomplete
                        multiple
                        options={allFundingCategories}
                        getOptionLabel={(option) => option.name}
                        value={allFundingCategories.filter(cat => userFundingCategoryIds.includes(cat.id))}
                        onChange={(_event, newValue) => {
                            setUserFundingCategoryIds(newValue.map(v => v.id));
                        }}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        disabled={isDemoUser}
                        renderInput={(params) => (
                            <TextField {...params} variant="outlined" label="Branchen, Themen & Unternehmens-Typen" placeholder="Interessen hinzufügen" />
                        )}
                        renderTags={(value, getTagProps) =>
                            value.map((option, index) => (
                                <Chip label={option.name} {...getTagProps({ index })} />
                            ))
                        }
                    />
                )}
            </Grid>

            <Grid item xs={12}>
                <Typography variant="h6" sx={{ mt: 2 }}>Meine Themen / Tags</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Fügen Sie Themen hinzu, um Ihre Inhalte zu personalisieren. Bestehende Tags werden als Vorschlag geladen.
                </Typography>
                {tagsLoading ? <CircularProgress size={24} /> : (
                    <Autocomplete
                        multiple freeSolo options={allAvailableTags} value={userTags}
                        onChange={handleTagsChange} disabled={isDemoUser}
                        renderTags={(value: readonly string[], getTagProps) =>
                            value.map((option: string, index: number) => (<Chip variant="outlined" label={option} {...getTagProps({ index })} />))
                        }
                        renderInput={(params) => (<TextField {...params} variant="outlined" label="Themen hinzufügen..." placeholder="Tippen oder auswählen"/>)}
                    />
                )}
            </Grid>
            <Grid item xs={12}><Typography variant="h6" sx={{ mt: 2 }}>{t('profile.dashboardSettings')}</Typography></Grid>
<Grid item xs={12}>
              <Typography variant="body2" color="text.secondary" gutterBottom>{t('profile.articleQuality')}</Typography>
              <ToggleButtonGroup
                value={scoreFilter}
                exclusive
                onChange={handleScoreFilterChange}
                aria-label="Artikel-Score Filter"
                disabled={isDemoUser}
                // NEU: Passt die Ausrichtung und Breite an die Bildschirmgröße an
                orientation={isMobile ? 'vertical' : 'horizontal'}
                fullWidth={isMobile}
              >
                <ToggleButton value="all" aria-label="alles anzeigen">
                  <Tooltip title={t('profile.tooltipAll')}>
                    <ThumbDownIcon sx={{ mr: 1 }} />
                  </Tooltip>
                  {t('profile.qualityAll')}
                </ToggleButton>
                <ToggleButton value="balanced" aria-label="ausgeglichen und besser">
                  <Tooltip title={t('profile.tooltipBalanced')}>
                    <RemoveCircleOutlineIcon sx={{ mr: 1 }} />
                  </Tooltip>
                  {t('profile.qualityBalanced')}
                </ToggleButton>
                <ToggleButton value="positive" aria-label="nur positive">
                  <Tooltip title={t('profile.tooltipHelpful')}>
                    <ThumbUpIcon sx={{ mr: 1 }} />
                  </Tooltip>
                  {t('profile.qualityHelpful')}
                </ToggleButton>
              </ToggleButtonGroup>
            </Grid>

            <Grid item xs={12}><Typography variant="h6" sx={{ mt: 2 }}>{t('profile.appearanceSettings')}</Typography></Grid>
            <Grid item xs={12} sm={6}><FormControlLabel control={<Switch checked={themeMode === 'dark'} onChange={handleThemeChange} disabled={isDemoUser}/>} label={t('profile.darkTheme')}/></Grid>
            <Grid item xs={12} sm={6}><FormControl fullWidth size="small"><InputLabel>{t('profile.language')}</InputLabel><Select value={language} label={t('profile.language')} onChange={handleLanguageChange} disabled={isDemoUser}><MenuItem value="de">Deutsch</MenuItem><MenuItem value="en">English</MenuItem></Select></FormControl></Grid>
            <Grid item xs={12}><Typography variant="h6" sx={{ mt: 2 }}>{t('profile.newsletterTitle')}</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('profile.newsletterDescription')}</Typography><FormControlLabel control={<Switch checked={newsletterOptIn} onChange={handleNewsletterToggle} disabled={isDemoUser}/>} label={newsletterOptIn ? t('profile.newsletterOn') : t('profile.newsletterOff')}/></Grid>
            <Grid item xs={12}><Typography variant="h6" sx={{ mt: 2 }}>{t('profile.accountInfo')}</Typography></Grid>
            <Grid item xs={12} sm={6}><TextField label={t('profile.email')} fullWidth value={user.email} disabled /></Grid>
            <Grid item xs={12} sm={6}><TextField label={t('profile.role')} fullWidth value={user.role} disabled /></Grid>
            <Grid item xs={12} sm={6}><TextField label={t('profile.membershipLevel')} fullWidth value={user.membership_level || 'Kein Level'} disabled/></Grid>
      <Grid item xs={12} sm={6}>
        <Paper variant="outlined" sx={{ p: '13.5px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '100%' }}>
            <Box>
                <Typography variant="caption" color="text.secondary">Community-Punkte</Typography>
                <Typography variant="body1">{user.contribution_score || 0}</Typography>
            </Box>
            <Button size="small" onClick={() => setHistoryModalOpen(true)}>Verlauf</Button>
        </Paper>
      </Grid>
            <Grid item xs={12}><Typography variant="h6" sx={{ mt: 2 }}>{t('profile.changePassword')}</Typography></Grid>
            <Grid item xs={12} sm={6}><TextField type="password" label={t('profile.newPassword')} fullWidth value={password} onChange={(e) => setPassword(e.target.value)} disabled={isDemoUser}/></Grid>
            <Grid item xs={12} sm={6}><TextField type="password" label={t('profile.confirmPassword')} fullWidth value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={isDemoUser}/></Grid>
            {error && (<Grid item xs={12}><Alert severity="error">{error}</Alert></Grid>)}
            <Grid item xs={12}><Button type="submit" variant="contained" color="primary" sx={{ mt: 2 }} disabled={isDemoUser}>{t('saveChanges')}</Button></Grid>
          </Grid>
        </Box>
      </Paper>
      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })} message={snackbar.message} />
      <ContributionHistoryModal 
        open={historyModalOpen} 
        onClose={() => setHistoryModalOpen(false)} 
        currentUserScore={user.contribution_score || 0}
      />        
    </Container>
  );
};
export default ProfilePage;