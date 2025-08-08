// frontend/src/pages/ResetPasswordPage.tsx
import React, { useState } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { TextField, Button, Typography, Container, Box, CircularProgress, Alert, Link } from '@mui/material';
import apiClient from '../apiClient';

const ResetPasswordPage: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (password !== confirmPassword) {
            setError('Die Passwörter stimmen nicht überein.');
            return;
        }
        setError(null);
        setLoading(true);
        try {
            const response = await apiClient.post(`/api/auth/reset-password/${token}`, { password });
            setSuccessMessage(response.data.message + ' Sie werden in 3 Sekunden weitergeleitet...');
            setTimeout(() => navigate('/login'), 3000);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Ein Fehler ist aufgetreten.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container component="main" maxWidth="xs">
            <Box sx={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', p: 3, borderRadius: 2, boxShadow: 3, backgroundColor: 'background.paper' }}>
                <Typography component="h1" variant="h5">
                    Neues Passwort festlegen
                </Typography>
                <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 3, width: '100%' }}>
                    <TextField
                        margin="normal"
                        required
                        fullWidth
                        name="password"
                        label="Neues Passwort"
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading || !!successMessage}
                    />
                    <TextField
                        margin="normal"
                        required
                        fullWidth
                        name="confirmPassword"
                        label="Passwort bestätigen"
                        type="password"
                        id="confirmPassword"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={loading || !!successMessage}
                    />
                    {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
                    {successMessage && <Alert severity="success" sx={{ mt: 2 }}>{successMessage}</Alert>}
                    <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }} disabled={loading || !!successMessage}>
                        {loading ? <CircularProgress size={24} color="inherit" /> : 'Passwort speichern'}
                    </Button>
                    
                    {/* NEU: Link zum Abbrechen und Zurückkehren */}
                    <Box textAlign="center">
                        <Link component={RouterLink} to="/login" variant="body2">
                            Abbrechen und zum Login zurückkehren
                        </Link>
                    </Box>
                </Box>
            </Box>
        </Container>
    );
};

export default ResetPasswordPage;
