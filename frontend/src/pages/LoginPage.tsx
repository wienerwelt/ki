// frontend/src/pages/LoginPage.tsx (AKTUALISIERT)
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { TextField, Button, Typography, Container, Box, CircularProgress, Alert, InputAdornment, IconButton } from '@mui/material'; // NEU: InputAdornment, IconButton
import Visibility from '@mui/icons-material/Visibility';     // NEU: Icon
import VisibilityOff from '@mui/icons-material/VisibilityOff'; // NEU: Icon

interface LoginPageProps {
    isRegister?: boolean;
}

const LoginPage: React.FC<LoginPageProps> = ({ isRegister = false }) => {
    // NEU: Für Login verwenden wir 'identifier' statt 'username'
    const [identifier, setIdentifier] = useState(''); // Kann Username oder Email sein
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState(''); // Nur für Registrierung
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false); // NEU: State für Passwortsichtbarkeit
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleClickShowPassword = () => setShowPassword((show) => !show); // NEU
    const handleMouseDownPassword = (event: React.MouseEvent<HTMLButtonElement>) => { // NEU
        event.preventDefault();
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const endpoint = isRegister ? 'register' : 'login';
            const body = isRegister ? { username: identifier, email, password } : { identifier, password }; // NEU: identifier für Login

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
                    <TextField
                        margin="normal"
                        required
                        fullWidth
                        id="identifier" // NEU: ID anpassen
                        label={isRegister ? "Benutzername" : "Benutzername oder E-Mail"} // NEU: Label anpassen
                        name="identifier"
                        autoComplete="username" // Oder "email" oder "text"
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
                        // NEU: Typ dynamisch steuern
                        type={showPassword ? 'text' : 'password'}
                        id="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading}
                        // NEU: Adornment für Passwortsichtbarkeit
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
                    <Button
                        type="submit"
                        fullWidth
                        variant="contained"
                        sx={{ mt: 3, mb: 2 }}
                        disabled={loading}
                    >
                        {loading ? <CircularProgress size={24} color="inherit" /> : (isRegister ? 'Registrieren' : 'Anmelden')}
                    </Button>
                    <Button
                        fullWidth
                        onClick={() => navigate(isRegister ? '/login' : '/register')}
                    >
                        {isRegister ? 'Zur Anmeldung' : 'Noch kein Konto? Registrieren'}
                    </Button>
                </Box>
            </Box>
        </Container>
    );
};

export default LoginPage;