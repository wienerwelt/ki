// frontend/src/pages/ForgotPasswordPage.tsx
import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { TextField, Button, Typography, Container, Box, CircularProgress, Alert, Link } from '@mui/material';
import apiClient from '../apiClient';

const ForgotPasswordPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const navigate = useNavigate();

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setSuccessMessage(null);
        setLoading(true);
        try {
            const response = await apiClient.post('/api/auth/forgot-password', { email });
            setSuccessMessage(response.data.message);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Ein Fehler ist aufgetreten.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container component="main" maxWidth="xs">
            <Box
                sx={{
                    marginTop: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    p: 3,
                    borderRadius: 2,
                    boxShadow: 3,
                    backgroundColor: 'background.paper'
                }}
            >
                <Typography component="h1" variant="h5">
                    Passwort zurücksetzen
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
                    Geben Sie Ihre E-Mail-Adresse ein. Wir senden Ihnen einen Link, um Ihr Passwort zurückzusetzen.
                </Typography>
                <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 3, width: '100%' }}>
                    <TextField
                        margin="normal"
                        required
                        fullWidth
                        id="email"
                        label="E-Mail Adresse"
                        name="email"
                        autoComplete="email"
                        autoFocus
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={loading}
                    />
                    {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
                    {successMessage && <Alert severity="success" sx={{ mt: 2 }}>{successMessage}</Alert>}
                    <Button
                        type="submit"
                        fullWidth
                        variant="contained"
                        sx={{ mt: 3, mb: 2 }}
                        disabled={loading}
                    >
                        {loading ? <CircularProgress size={24} color="inherit" /> : 'Link anfordern'}
                    </Button>
                    
                    {/* NEU: Link zum Abbrechen und Zurückkehren */}
                    <Box textAlign="center">
                        <Link component={RouterLink} to="/login" variant="body2">
                            Zurück zum Login
                        </Link>
                    </Box>
                </Box>
            </Box>
        </Container>
    );
};

export default ForgotPasswordPage;
