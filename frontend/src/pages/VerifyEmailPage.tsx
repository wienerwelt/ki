// frontend/src/pages/VerifyEmailPage.tsx
import React, { useEffect } from 'react';
import { Container, Box, Typography, CircularProgress, Alert, Button } from '@mui/material';
import { Link as RouterLink, useParams } from 'react-router-dom';

const VerifyEmailPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  // Gleiche API-Basis-Logik wie auf der LoginPage
  const API_BASE =
    (import.meta as any).env?.VITE_API_BASE_URL ||
    ((location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:5000'
      : '');

  useEffect(() => {
    if (!token) return;
    // Top-Level Navigation -> Backend übernimmt Redirect auf z. B. /login?verified=1
    const url = `${API_BASE}/api/auth/verify-email/${encodeURIComponent(token)}`;
    window.location.assign(url);
  }, [token, API_BASE]);

  if (!token) {
    return (
      <Container component="main" maxWidth="sm">
        <Box sx={{ mt: 8, p: 3, textAlign: 'center' }}>
          <Typography component="h1" variant="h5" sx={{ mb: 2 }}>
            E-Mail Bestätigung
          </Typography>
          <Alert severity="error" sx={{ mb: 2 }}>
            Kein Bestätigungs-Token gefunden.
          </Alert>
          <Button component={RouterLink} to="/login" variant="contained">
            Zurück zum Login
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container component="main" maxWidth="sm">
      <Box sx={{ mt: 8, p: 3, textAlign: 'center' }}>
        <Typography component="h1" variant="h5" sx={{ mb: 2 }}>
          E-Mail Bestätigung
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Einen Moment bitte – du wirst weitergeleitet…
        </Typography>
        <CircularProgress />
        <Box sx={{ mt: 3 }}>
          <Button component={RouterLink} to="/login">Zum Login</Button>
        </Box>
      </Box>
    </Container>
  );
};

export default VerifyEmailPage;
