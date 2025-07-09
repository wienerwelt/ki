import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, TextField, Button, Grid, Paper, CircularProgress, Alert, Snackbar } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import apiClient from '../apiClient';

const ProfilePage: React.FC = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [snackbar, setSnackbar] = useState<{ open: boolean, message: string }>({ open: false, message: '' });

    // Form States
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [organizationName, setOrganizationName] = useState('');
    const [linkedinUrl, setLinkedinUrl] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Read-only States
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('');
    const [membershipLevel, setMembershipLevel] = useState('');

    useEffect(() => {
        const fetchProfile = async () => {
            setLoading(true);
            try {
                const token = localStorage.getItem('jwt_token');
                const response = await apiClient.get('/api/users/me', {
                    headers: { 'x-auth-token': token }
                });
                const profile = response.data;
                setFirstName(profile.first_name || '');
                setLastName(profile.last_name || '');
                setOrganizationName(profile.organization_name || '');
                setLinkedinUrl(profile.linkedin_url || '');
                setEmail(profile.email);
                setRole(profile.role);
                setMembershipLevel(profile.membership_level || 'Kein Level');
            } catch (err: any) {
                setError(err.response?.data?.message || 'Fehler beim Laden des Profils.');
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, []);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);

        if (password !== confirmPassword) {
            setError('Die Passwörter stimmen nicht überein.');
            return;
        }

        try {
            const token = localStorage.getItem('jwt_token');
            const profileData = {
                first_name: firstName,
                last_name: lastName,
                organization_name: organizationName,
                linkedin_url: linkedinUrl,
                password: password || undefined, // Sende Passwort nur, wenn es nicht leer ist
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

    if (loading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
    }

    return (
        <Container maxWidth="md">
            <Paper sx={{ p: 4, mt: 4 }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    Mein Profil
                </Typography>
                <Box component="form" onSubmit={handleSubmit}>
                    <Grid container spacing={3}>
                        <Grid item xs={12} sm={6}>
                            <TextField label="Vorname" fullWidth value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField label="Nachname" fullWidth value={lastName} onChange={(e) => setLastName(e.target.value)} />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField label="Organisation" fullWidth value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField label="LinkedIn Profil URL" fullWidth value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
                        </Grid>
                        <Grid item xs={12}>
                            <Typography variant="h6" sx={{ mt: 2 }}>Kontoinformationen</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField label="E-Mail" fullWidth value={email} disabled />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField label="Rolle" fullWidth value={role} disabled />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField label="Mitgliedslevel" fullWidth value={membershipLevel} disabled />
                        </Grid>
                        <Grid item xs={12}>
                            <Typography variant="h6" sx={{ mt: 2 }}>Passwort ändern</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField type="password" label="Neues Passwort" fullWidth value={password} onChange={(e) => setPassword(e.target.value)} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField type="password" label="Passwort bestätigen" fullWidth value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                        </Grid>
                        {error && (
                            <Grid item xs={12}>
                                <Alert severity="error">{error}</Alert>
                            </Grid>
                        )}
                        <Grid item xs={12}>
                            <Button type="submit" variant="contained" color="primary" sx={{ mt: 2 }}>
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
