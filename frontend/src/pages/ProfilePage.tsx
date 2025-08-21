// frontend/src/pages/ProfilePage.tsx
import React, { useState, useEffect } from 'react';
import { 
    Container, Typography, Box, TextField, Button, Grid, Paper, CircularProgress, 
    Alert, Snackbar, Tooltip, ToggleButton, ToggleButtonGroup 
} from '@mui/material';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { useAuth } from '../context/AuthContext';
import apiClient from '../apiClient';

// Helper-Typ für die neue Score-Einstellung
type ScoreFilter = 'all' | 'balanced' | 'positive';

const ProfilePage: React.FC = () => {
    const { user, updateUser } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [snackbar, setSnackbar] = useState<{ open: boolean, message: string }>({ open: false, message: '' });

    // Lokale States für Formular-Eingaben
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [organizationName, setOrganizationName] = useState('');
    const [linkedinUrl, setLinkedinUrl] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    
    // NEU: Ein State für die intuitive Score-Auswahl
    const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all');
    
    // NEU: Prüfung für Demo-Benutzer
    const isDemoUser = user?.role === 'demo';

    useEffect(() => {
        const fetchProfile = async () => {
            if (!user) return; // Guard-Clause, falls user noch nicht geladen ist
            setLoading(true);
            try {
                const token = localStorage.getItem('jwt_token');
                const response = await apiClient.get('/api/users/me', {
                    headers: { 'x-auth-token': token }
                });
                const profile = response.data;
                
                // AuthContext aktualisieren
                updateUser(profile);

                // Formularfelder befüllen
                setFirstName(profile.first_name || '');
                setLastName(profile.last_name || '');
                setOrganizationName(profile.organization_name || '');
                setLinkedinUrl(profile.linkedin_url || '');

                // NEU: Setzt die Score-Auswahl basierend auf den DB-Werten
                const scoreMin = profile.article_score_min;
                if (scoreMin === 1) {
                    setScoreFilter('positive');
                } else if (scoreMin === 0) {
                    setScoreFilter('balanced');
                } else {
                    setScoreFilter('all');
                }

            } catch (err: any) {
                setError(err.response?.data?.message || 'Fehler beim Laden des Profils.');
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, []); // Läuft nur einmal beim Mounten der Komponente

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (isDemoUser) return; // Zusätzliche Sicherheit
        setError(null);

        if (password !== confirmPassword) {
            setError('Die Passwörter stimmen nicht überein.');
            return;
        }

        try {
            const token = localStorage.getItem('jwt_token');
            
            // NEU: Konvertiert die Score-Auswahl in den numerischen Wert für die API
            let articleScoreMin: number | null = null;
            if (scoreFilter === 'positive') {
                articleScoreMin = 1;
            } else if (scoreFilter === 'balanced') {
                articleScoreMin = 0;
            }

            const profileData = {
                first_name: firstName,
                last_name: lastName,
                organization_name: organizationName,
                linkedin_url: linkedinUrl,
                password: password || undefined,
                article_score_min: articleScoreMin,
                article_score_max: null, // `max` wird nicht mehr verwendet
            };

            await apiClient.put('/api/users/me', profileData, {
                headers: { 'x-auth-token': token }
            });
            setSnackbar({ open: true, message: 'Profil erfolgreich aktualisiert!' });
            setPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Speichern.');
        }
    };
    
    const handleScoreFilterChange = (event: React.MouseEvent<HTMLElement>, newFilter: ScoreFilter | null) => {
        if (newFilter !== null) {
            setScoreFilter(newFilter);
        }
    };

    if (loading || !user) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
    }

    return (
        <Container maxWidth="md">
            <Paper sx={{ p: 4, mt: 4 }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    Mein Profil
                </Typography>
                
                {/* NEU: Hinweismeldung für Demo-Benutzer */}
                {isDemoUser && (
                    <Alert severity="info" sx={{ mb: 3 }}>
                        Als Demo-Benutzer können Sie Ihr Profil nicht bearbeiten.
                    </Alert>
                )}

                <Box component="form" onSubmit={handleSubmit}>
                    <Grid container spacing={3}>
                        <Grid item xs={12} sm={6}>
                            <TextField label="Vorname" fullWidth value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={isDemoUser} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField label="Nachname" fullWidth value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={isDemoUser} />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField label="Organisation" fullWidth value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} disabled={isDemoUser} />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField label="LinkedIn Profil URL" fullWidth value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} disabled={isDemoUser} />
                        </Grid>
                        
                        {/* --- NEU: Überarbeitete Dashboard-Einstellungen --- */}
                        <Grid item xs={12}>
                            <Typography variant="h6" sx={{ mt: 2 }}>Dashboard-Einstellungen</Typography>
                        </Grid>
                        <Grid item xs={12}>
                           <Typography variant="body2" color="text.secondary" gutterBottom>
                                Welche Artikel-Qualität möchten Sie standardmäßig sehen?
                           </Typography>
                           <ToggleButtonGroup
                                value={scoreFilter}
                                exclusive
                                onChange={handleScoreFilterChange}
                                aria-label="Artikel-Score Filter"
                                disabled={isDemoUser}
                            >
                                <ToggleButton value="all" aria-label="alles anzeigen">
                                    <Tooltip title="Alles anzeigen (auch negativ bewertete Artikel)">
                                        <ThumbDownIcon sx={{ mr: 1 }} />
                                    </Tooltip>
                                    Alles
                                </ToggleButton>
                                <ToggleButton value="balanced" aria-label="ausgeglichen und besser">
                                    <Tooltip title="Nur neutrale und positive Artikel anzeigen (Score >= 0)">
                                        <RemoveCircleOutlineIcon sx={{ mr: 1 }} />
                                    </Tooltip>
                                    Ausgeglichen
                                </ToggleButton>
                                <ToggleButton value="positive" aria-label="nur positive">
                                    <Tooltip title="Nur positiv bewertete Artikel anzeigen (Score >= 1)">
                                        <ThumbUpIcon sx={{ mr: 1 }} />
                                    </Tooltip>
                                    Nur Hilfreiche
                                </ToggleButton>
                            </ToggleButtonGroup>
                        </Grid>
                        {/* --- Ende der Überarbeitung --- */}

                        <Grid item xs={12}>
                            <Typography variant="h6" sx={{ mt: 2 }}>Kontoinformationen</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField label="E-Mail" fullWidth value={user.email} disabled />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField label="Rolle" fullWidth value={user.role} disabled />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField label="Mitgliedslevel" fullWidth value={user.membership_level || 'Kein Level'} disabled />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField label="Community-Punkte" fullWidth value={user.contribution_score || 0} disabled />
                        </Grid>                        
                        <Grid item xs={12}>
                            <Typography variant="h6" sx={{ mt: 2 }}>Passwort ändern</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField type="password" label="Neues Passwort" fullWidth value={password} onChange={(e) => setPassword(e.target.value)} disabled={isDemoUser} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField type="password" label="Passwort bestätigen" fullWidth value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={isDemoUser} />
                        </Grid>
                        {error && (
                            <Grid item xs={12}>
                                <Alert severity="error">{error}</Alert>
                            </Grid>
                        )}
                        <Grid item xs={12}>
                            <Button type="submit" variant="contained" color="primary" sx={{ mt: 2 }} disabled={isDemoUser}>
                                Änderungen speichern
                            </Button>
                        </Grid>
                    </Grid>
                </Box>
            </Paper>
            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                message={snackbar.message}
            />
        </Container>
    );
};

export default ProfilePage;