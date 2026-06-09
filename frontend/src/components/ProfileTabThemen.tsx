// frontend/src/components/ProfileTabThemen.tsx
import React, { useState, useEffect } from 'react';
import { Box, Grid, Typography, Autocomplete, TextField, Chip, ToggleButton, ToggleButtonGroup, FormControlLabel, Switch, CircularProgress, Tooltip, Snackbar } from '@mui/material';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { useAuth } from '../context/AuthContext';
import apiClient from '../apiClient';
import { useTranslation } from 'react-i18next';

const ProfileTabThemen: React.FC<{ user: any; isDemoUser: boolean }> = ({ user, isDemoUser }) => {
  const { t } = useTranslation();
  const { userTags, refreshUserTags, updateUser } = useAuth();
  
  const [allAvailableTags, setAllAvailableTags] = useState<string[]>([]);
  const [allFundingCategories, setAllFundingCategories] = useState<{id: number; name: string}[]>([]);
  const [userFundingCategoryIds, setUserFundingCategoryIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });

  // Initiale States
  const initialScore = user.article_score_min === 1 ? 'positive' : user.article_score_min === 0 ? 'balanced' : 'all';
  const [scoreFilter, setScoreFilter] = useState<'all'|'balanced'|'positive'>(initialScore);
  const [newsletterOptIn, setNewsletterOptIn] = useState(Boolean(user.newsletter_opt_in));

  useEffect(() => {
    const fetchSelectData = async () => {
      try {
        const [tagsRes, catsRes, userCatsRes] = await Promise.all([
          apiClient.get('/api/data/all-tags'),
          apiClient.get('/api/funding/categories'),
          apiClient.get('/api/funding/user-categories')
        ]);
        setAllAvailableTags(tagsRes.data || []);
        setAllFundingCategories(catsRes.data || []);
        setUserFundingCategoryIds(userCatsRes.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSelectData();
  }, []);

  const handleTagsChange = async (_e: any, newTags: string[]) => {
    if (isDemoUser) return;
    const tagsToAdd = newTags.filter(tag => !userTags.includes(tag));
    const tagsToRemove = userTags.filter(tag => !newTags.includes(tag));
    try {
      if (tagsToAdd.length > 0) await Promise.all(tagsToAdd.map(tag => apiClient.post('/api/users/tags', { tagName: tag })));
      if (tagsToRemove.length > 0) await Promise.all(tagsToRemove.map(tag => apiClient.delete(`/api/users/tags/${encodeURIComponent(tag)}`)));
      refreshUserTags();
      setSnackbar({ open: true, message: 'Themen automatisch gespeichert.' });
    } catch (err) {
      setSnackbar({ open: true, message: 'Fehler beim Speichern.' });
    }
  };

  const handleFundingChange = async (_e: any, newValue: any[]) => {
    if (isDemoUser) return;
    const newIds = newValue.map(v => v.id);
    setUserFundingCategoryIds(newIds);
    try {
      await apiClient.post('/api/funding/user-categories', { categoryIds: newIds });
      setSnackbar({ open: true, message: 'Förder-Interessen gespeichert.' });
    } catch (err) {
      setSnackbar({ open: true, message: 'Fehler beim Speichern.' });
    }
  };

  const autoSaveProfilePref = async (key: string, value: any) => {
    if (isDemoUser) return;
    try {
      await apiClient.put('/api/users/me', { [key]: value });
      updateUser({ [key]: value });
      setSnackbar({ open: true, message: 'Einstellung gespeichert.' });
    } catch (err) {
      setSnackbar({ open: true, message: 'Fehler beim Speichern.' });
    }
  };

  return (
    <Box>
      <Grid container spacing={4}>
        <Grid item xs={12}>
          <Typography variant="h6">Meine Förder-Interessen</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Wählen Sie relevante Branchen und Themen für den Match-Score.</Typography>
          {loading ? <CircularProgress size={24} /> : (
            <Autocomplete
              multiple
              options={allFundingCategories}
              getOptionLabel={(o) => o.name}
              value={allFundingCategories.filter(c => userFundingCategoryIds.includes(c.id))}
              onChange={handleFundingChange}
              disabled={isDemoUser}
              renderInput={(params) => <TextField {...params} variant="outlined" placeholder="Interessen hinzufügen" />}
              renderTags={(val, getTagProps) => val.map((o, i) => <Chip label={o.name} {...getTagProps({ index: i })} key={o.id} />)}
            />
          )}
        </Grid>

        <Grid item xs={12}>
          <Typography variant="h6">Meine Themen / Tags</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Personalisieren Sie Ihre Dashboard-Inhalte.</Typography>
          {loading ? <CircularProgress size={24} /> : (
            <Autocomplete
              multiple
              options={allAvailableTags}
              value={userTags}
              onChange={handleTagsChange}
              disabled={isDemoUser}
              renderInput={(params) => <TextField {...params} variant="outlined" placeholder="Themen auswählen" />}
              renderTags={(val, getTagProps) => val.map((o, i) => <Chip variant="outlined" label={o} {...getTagProps({ index: i })} key={o} />)}
            />
          )}
        </Grid>

        <Grid item xs={12}>
          <Typography variant="h6">Artikel-Qualität</Typography>
          <ToggleButtonGroup
            value={scoreFilter}
            exclusive
            onChange={(e, val) => {
                if (val) {
                    setScoreFilter(val);
                    const numVal = val === 'positive' ? 1 : val === 'balanced' ? 0 : null;
                    autoSaveProfilePref('article_score_min', numVal);
                }
            }}
            disabled={isDemoUser}
            sx={{ mt: 1 }}
          >
            <ToggleButton value="all"><ThumbDownIcon sx={{ mr: 1 }} /> Alles</ToggleButton>
            <ToggleButton value="balanced"><RemoveCircleOutlineIcon sx={{ mr: 1 }} /> Ausgeglichen+</ToggleButton>
            <ToggleButton value="positive"><ThumbUpIcon sx={{ mr: 1 }} /> Nur Positive</ToggleButton>
          </ToggleButtonGroup>
        </Grid>

        <Grid item xs={12}>
          <Typography variant="h6">{t('profile.newsletterTitle')}</Typography>
          <FormControlLabel 
            control={<Switch checked={newsletterOptIn} onChange={(e) => { setNewsletterOptIn(e.target.checked); autoSaveProfilePref('newsletter_opt_in', e.target.checked); }} disabled={isDemoUser}/>} 
            label={newsletterOptIn ? t('profile.newsletterOn') : t('profile.newsletterOff')}
          />
        </Grid>
      </Grid>
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar({ ...snackbar, open: false })} message={snackbar.message} />
    </Box>
  );
};

export default ProfileTabThemen;