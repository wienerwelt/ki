import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { 
    TextField, Button, Typography, Container, Box, CircularProgress, 
    Alert, Link, InputAdornment, IconButton, LinearProgress 
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import apiClient from '../apiClient';
import zxcvbn from 'zxcvbn'; // WICHTIG: Muss im Frontend installiert sein

const ResetPasswordPage: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    
    // UX States
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    
    // Stärke-Analyse
    const [score, setScore] = useState(0);
    const [feedback, setFeedback] = useState<string>('');

    // Passwort-Prüfung bei jeder Eingabe
    useEffect(() => {
        if (!password) {
            setScore(0);
            setFeedback('');
            return;
        }
        const result = zxcvbn(password);
        setScore(result.score);
        setFeedback(result.feedback.warning || result.feedback.suggestions[0] || '');
    }, [password]);

    const handleClickShowPassword = () => setShowPassword((show) => !show);
    const handleMouseDownPassword = (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault();

    // Farben für den Stärke-Balken
    const getProgressColor = () => {
        if (score < 2) return 'error';
        if (score === 2) return 'warning';
        return 'success';
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        
        // Frontend-Validierung VOR dem Senden
        if (password !== confirmPassword) {
            setError('Die Passwörter stimmen nicht überein.');
            return;
        }
        if (score < 3) {
            setError('Das Passwort ist zu schwach. Bitte wählen Sie ein sichereres Passwort.');
            return;
        }

        setError(null);
        setLoading(true);

        try {
            const response = await apiClient.post(`/api/auth/reset-password/${token}`, { password });
            setSuccessMessage(response.data.message + ' Sie werden in 3 Sekunden weitergeleitet...');
            setTimeout(() => navigate('/login'), 3000);
        } catch (err: any) {
            // Fehler vom Server anzeigen, aber Formular NICHT zurücksetzen
            setError(err.response?.data?.message || 'Ein Fehler ist aufgetreten.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container component="main" maxWidth="xs">
            <Box sx={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', p: 3, borderRadius: 2, boxShadow: 3, backgroundColor: 'background.paper' }}>
                <Typography component="h1" variant="h5" gutterBottom>
                    Neues Passwort festlegen
                </Typography>
                
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
                    Bitte wählen Sie ein starkes Passwort mit mindestens 8 Zeichen.
                </Typography>

                <Box component="form" onSubmit={handleSubmit} noValidate sx={{ width: '100%' }}>
                    
                    {/* Passwort Feld */}
                    <TextField
                        margin="normal"
                        required
                        fullWidth
                        name="password"
                        label="Neues Passwort"
                        type={showPassword ? 'text' : 'password'}
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading || !!successMessage}
                        error={score > 0 && score < 3}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                        aria-label="Passwort anzeigen"
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

                    {/* Stärke-Indikator */}
                    {password && (
                        <Box sx={{ mt: 1, mb: 2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="caption" color={getProgressColor() + '.main'} fontWeight="bold">
                                    {score < 3 ? 'Zu schwach' : (score === 3 ? 'Gut' : 'Sehr stark')}
                                </Typography>
                                {score >= 3 && <CheckCircleIcon color="success" fontSize="small" />}
                            </Box>
                            <LinearProgress 
                                variant="determinate" 
                                value={(score + 1) * 20} 
                                color={getProgressColor()} 
                                sx={{ height: 6, borderRadius: 3 }}
                            />
                            {feedback && (
                                <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
                                    Tipp: {feedback}
                                </Typography>
                            )}
                        </Box>
                    )}

                    {/* Bestätigen Feld */}
                    <TextField
                        margin="normal"
                        required
                        fullWidth
                        name="confirmPassword"
                        label="Passwort bestätigen"
                        type={showPassword ? 'text' : 'password'}
                        id="confirmPassword"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={loading || !!successMessage}
                        error={confirmPassword.length > 0 && password !== confirmPassword}
                        helperText={confirmPassword.length > 0 && password !== confirmPassword ? "Passwörter stimmen nicht überein" : ""}
                    />

                    {/* Fehler / Erfolg Meldungen */}
                    {error && (
                        <Alert severity="error" icon={<ErrorIcon />} sx={{ mt: 2 }}>
                            {error}
                        </Alert>
                    )}
                    
                    {successMessage && (
                        <Alert severity="success" sx={{ mt: 2 }}>
                            {successMessage}
                        </Alert>
                    )}

                    {/* Submit Button - Deaktiviert wenn Passwort zu schwach */}
                    <Button 
                        type="submit" 
                        fullWidth 
                        variant="contained" 
                        sx={{ mt: 3, mb: 2, py: 1.2 }} 
                        disabled={loading || !!successMessage || score < 3 || password !== confirmPassword}
                    >
                        {loading ? <CircularProgress size={24} color="inherit" /> : 'Passwort speichern'}
                    </Button>
                    
                    <Box textAlign="center">
                        <Link component={RouterLink} to="/login" variant="body2" underline="hover">
                            Abbrechen und zum Login
                        </Link>
                    </Box>
                </Box>
            </Box>
        </Container>
    );
};

export default ResetPasswordPage;