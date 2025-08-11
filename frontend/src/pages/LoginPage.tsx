// frontend/src/pages/LoginPage.tsx
import React, { useState, Suspense } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    TextField, Button, Typography, Container, Box, CircularProgress, Alert,
    InputAdornment, IconButton, Divider, Checkbox, FormControlLabel, Link,
    Collapse, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import CloseIcon from '@mui/icons-material/Close';

// Dynamischer Import der Seiten-Komponenten für die Anzeige im Dialog
const TermsPage = React.lazy(() => import('./TermsPage'));
const PrivacyPage = React.lazy(() => import('./PrivacyPage'));


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
    
    const [voucher, setVoucher] = useState('');
    const [showVoucher, setShowVoucher] = useState(false);
    const [consent, setConsent] = useState(false);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogContent, setDialogContent] = useState<'terms' | 'privacy' | null>(null);

    const handleClickShowPassword = () => setShowPassword((show) => !show);
    const handleMouseDownPassword = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
    };

    const handleOpenLegalDialog = (type: 'terms' | 'privacy') => {
        setDialogContent(type);
        setDialogOpen(true);
    };

    const generatePassword = () => {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
        let newPassword = '';
        for (let i = 0; i < 14; i++) {
            newPassword += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setPassword(newPassword);
        navigator.clipboard.writeText(newPassword);
        alert('Ein neues, sicheres Passwort wurde generiert und in die Zwischenablage kopiert.');
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const endpoint = isRegister ? 'register' : 'login';
            const body = isRegister 
                ? { name: identifier, email, password, voucher, consentGiven: consent } 
                : { identifier, password };

            const response = await fetch(`/api/auth/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await response.json();

            if (response.ok) {
                if (isRegister) {
                    alert('Registrierung erfolgreich! Bitte prüfen Sie Ihr Postfach, um Ihre E-Mail zu bestätigen.');
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

    const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
        if (credentialResponse.credential) {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch('/api/auth/google', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: credentialResponse.credential }),
                });

                const data = await res.json();

                if (res.ok) {
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

    const handleGoogleError = () => {
        console.error('Google-Anmeldung fehlgeschlagen');
        setError('Google-Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.');
    };

    return (
        <>
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
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            name="password"
                            label="Passwort"
                            type={showPassword ? 'text' : 'password'}
                            id="password"
                            autoComplete={isRegister ? "new-password" : "current-password"}
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
                        {isRegister && (
                            <Button onClick={generatePassword} size="small" sx={{ mt: 1, textTransform: 'none' }}>
                                Sicheres Passwort generieren
                            </Button>
                        )}

                        {isRegister && (
                            <Box sx={{ mt: 2 }}>
                                <Button size="small" onClick={() => setShowVoucher(!showVoucher)}>
                                    {showVoucher ? 'Einladungscode verbergen' : 'Haben Sie einen Einladungscode?'}
                                </Button>
                                <Collapse in={showVoucher}>
                                    <TextField
                                        margin="normal" fullWidth label="Einladungscode (optional)"
                                        value={voucher} onChange={(e) => setVoucher(e.target.value)}
                                    />
                                </Collapse>
                            </Box>
                        )}

                        {isRegister && (
                            <FormControlLabel
                                control={<Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} />}
                                label={
                                    <Typography variant="body2">
                                        Ich habe die{' '}
                                        <Link component="button" type="button" onClick={() => handleOpenLegalDialog('terms')} sx={{ verticalAlign: 'baseline' }}>
                                            Nutzungsbedingungen
                                        </Link>
                                        {' '}und die{' '}
                                        <Link component="button" type="button" onClick={() => handleOpenLegalDialog('privacy')} sx={{ verticalAlign: 'baseline' }}>
                                            Datenschutzerklärung
                                        </Link>
                                        {' '}gelesen und stimme ihnen zu.
                                    </Typography>
                                }
                                sx={{ mt: 2 }}
                            />
                        )}
                        
                        {error && <Alert severity="error" sx={{ mt: 2, width: '100%' }}>{error}</Alert>}

                        <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }} disabled={loading || (isRegister && !consent)}>
                            {loading ? <CircularProgress size={24} color="inherit" /> : (isRegister ? 'Konto erstellen' : 'Anmelden')}
                        </Button>

                        {!isRegister && (
                            <Box textAlign="right">
                                <Link component={RouterLink} to="/forgot-password" variant="body2">
                                    Passwort vergessen?
                                </Link>
                            </Box>
                        )}
                        
                        {!isRegister && (
                             <>
                                <Divider sx={{ my: 2, width: '100%' }}>ODER</Divider>
                                <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                                    <GoogleLogin
                                        onSuccess={handleGoogleSuccess}
                                        onError={handleGoogleError}
                                        theme="outline"
                                        shape="rectangular"
                                        width="300px"
                                    />
                                </Box>
                            </>
                        )}

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

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} scroll="paper" fullWidth maxWidth="md">
                <DialogTitle sx={{ m: 0, p: 2 }}>
                    {dialogContent === 'terms' ? 'Nutzungsbedingungen' : 'Datenschutzerklärung'}
                    <IconButton
                        aria-label="close"
                        onClick={() => setDialogOpen(false)}
                        sx={{ position: 'absolute', right: 8, top: 8, color: (theme) => theme.palette.grey[500] }}
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>}>
                        {dialogContent === 'terms' && <TermsPage />}
                        {dialogContent === 'privacy' && <PrivacyPage />}
                    </Suspense>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)}>Schließen</Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default LoginPage;
