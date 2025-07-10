// frontend/src/pages/LoginPage.tsx (KORRIGIERT für React 18 mit @react-oauth/google)
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    TextField,
    Button,
    Typography,
    Container,
    Box,
    CircularProgress,
    Alert,
    InputAdornment,
    IconButton,
    Divider
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';

interface LoginPageProps {
    isRegister?: boolean;
}

const LoginPage: React.FC<LoginPageProps> = ({ isRegister = false }) => {
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleClickShowPassword = () => setShowPassword((show) => !show);
    const handleMouseDownPassword = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
    };

    // Traditioneller Login mit Benutzername/Passwort (unverändert)
    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const endpoint = isRegister ? 'register' : 'login';
            const body = isRegister ? { username: identifier, email, password } : { identifier, password };

            const response = await fetch(`http://localhost:5000/api/auth/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await response.json();

            if (response.ok) {
                if (isRegister) {
                    alert('Registrierung erfolgreich! Sie können sich jetzt anmelden.');
                    navigate('/login');
                } else {
                    login(data.token);
                    navigate('/dashboard');
                }
            } else {
                setError(data.message || `Anfrage fehlgeschlagen: ${response.statusText}`);
            }
        } catch (err) {
            console.error(err);
            setError('Ein Netzwerkfehler ist aufgetreten. Bitte versuchen Sie es später erneut.');
        } finally {
            setLoading(false);
        }
    };

    // KORRIGIERT: Handler für erfolgreiche Google Anmeldung
    const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
        if (credentialResponse.credential) {
            setLoading(true);
            setError(null);
            try {
                // Senden Sie das Google-Token (credential) an Ihr Backend
                const res = await fetch('http://localhost:5000/api/auth/google', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: credentialResponse.credential }),
                });

                const data = await res.json();

                if (res.ok) {
                    // Melden Sie den Benutzer mit dem von Ihrem Backend erhaltenen JWT an
                    login(data.token);
                    navigate('/dashboard');
                } else {
                    setError(data.message || 'Google-Anmeldung fehlgeschlagen.');
                }
            } catch (err) {
                console.error('Google Auth Error:', err);
                setError('Ein Netzwerkfehler bei der Google-Anmeldung ist aufgetreten.');
            } finally {
                setLoading(false);
            }
        } else {
            setError('Google-Anmeldung fehlgeschlagen: Kein Credential erhalten.');
        }
    };

    // KORRIGIERT: Handler für fehlgeschlagene Google Anmeldung
    const handleGoogleError = () => {
        console.error('Google-Anmeldung fehlgeschlagen');
        setError('Google-Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.');
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
                <Typography component="h1" variant="h5" sx={{ mb: 2 }}>
                    {isRegister ? 'Registrieren' : 'Anmelden'}
                </Typography>
                <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1, width: '100%' }}>
                    {/* Benutzername-Feld */}
                    <TextField
                        margin="normal"
                        required
                        fullWidth
                        id="identifier"
                        label={isRegister ? "Benutzername" : "Benutzername oder E-Mail"}
                        name="identifier"
                        autoComplete="username"
                        autoFocus
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        disabled={loading}
                    />
                    {/* E-Mail-Feld (nur bei Registrierung) */}
                    {isRegister && (
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            id="email"
                            label="E-Mail Adresse"
                            name="email"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={loading}
                        />
                    )}
                    {/* Passwort-Feld */}
                    <TextField
                        margin="normal"
                        required
                        fullWidth
                        name="password"
                        label="Passwort"
                        type={showPassword ? 'text' : 'password'}
                        id="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                        aria-label="Passwort ein-/ausblenden"
                                        onClick={handleClickShowPassword}
                                        onMouseDown={handleMouseDownPassword}
                                        edge="end"
                                    >
                                        {showPassword ? <VisibilityOff /> : <Visibility />}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                    />

                    {error && (
                        <Alert severity="error" sx={{ mt: 2, width: '100%' }}>
                            {error}
                        </Alert>
                    )}
                    {/* Submit-Button für traditionellen Login */}
                    <Button
                        type="submit"
                        fullWidth
                        variant="contained"
                        sx={{ mt: 3, mb: 2 }}
                        disabled={loading}
                    >
                        {loading ? <CircularProgress size={24} color="inherit" /> : (isRegister ? 'Registrieren' : 'Anmelden')}
                    </Button>
                    
                    {/* KORRIGIERT: Google-Login-Button (nur auf Anmeldeseite) */}
                    {!isRegister && (
                         <>
                            <Divider sx={{ my: 2, width: '100%' }}>ODER</Divider>
                            <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                                <GoogleLogin
                                    onSuccess={handleGoogleSuccess}
                                    onError={handleGoogleError}
                                    theme="outline"
                                    shape="rectangular"
                                    width="300px" // Passen Sie die Breite nach Bedarf an
                                />
                            </Box>
                        </>
                    )}

                    {/* Button zum Wechseln zwischen Login und Registrierung */}
                    <Button
                        fullWidth
                        onClick={() => navigate(isRegister ? '/login' : '/register')}
                        sx={{ mt: 2 }}
                    >
                        {isRegister ? 'Bereits ein Konto? Anmelden' : 'Noch kein Konto? Registrieren'}
                    </Button>
                </Box>
            </Box>
        </Container>
    );
};

export default LoginPage;