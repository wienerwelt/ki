// frontend/src/pages/LoginPage.tsx
import React, { useState, Suspense } from 'react';
import { useNavigate, Link as RouterLink, useSearchParams } from 'react-router-dom'; 
import { useAuth, UserPayload } from '../context/AuthContext';
import {
  TextField, Button, Typography, Container, Box,
  InputAdornment, IconButton, Checkbox, FormControlLabel, Link,
  Collapse, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress, LinearProgress
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import CloseIcon from '@mui/icons-material/Close';
import { useSnackbar } from '../context/SnackbarContext';
import zxcvbn from 'zxcvbn'; // Passwort-Stärke-Checker

const TermsPage = React.lazy(() => import('./TermsPage'));
const PrivacyPage = React.lazy(() => import('./PrivacyPage'));
const DisclaimerPage = React.lazy(() => import('./DisclaimerPage'));

interface LoginPageProps {
  isRegister?: boolean;
}

type LegalDialogContent = 'terms' | 'privacy' | 'disclaimer' | null;

const LoginPage: React.FC<LoginPageProps> = ({ isRegister = false }) => {
  const [searchParams] = useSearchParams();
  const { showSnackbar } = useSnackbar();

  // Username & FirstName separat
  const [username, setUsername] = useState(searchParams.get('username') || '');
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const [voucher, setVoucher] = useState('');
  const [showVoucher, setShowVoucher] = useState(false);
  const [consent, setConsent] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState<LegalDialogContent>(null);

  // Resend Verification Dialog
  const [resendOpen, setResendOpen] = useState(false);
  const [resendEmail, setResendEmail] = useState('');

  // Username-Regex
  const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

  const handleClickShowPassword = () => setShowPassword((show) => !show);
  const handleMouseDownPassword = (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault();

  const handleOpenLegalDialog = (type: Exclude<LegalDialogContent, null>) => {
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
    navigator.clipboard.writeText(newPassword).catch(() => {});
    showSnackbar('Neues, sicheres Passwort generiert und in die Zwischenablage kopiert.', 'success');
  };

  const API_BASE =
    (import.meta as any).env?.VITE_API_BASE_URL ||
    ((location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:5000'
      : '');

  async function safeRequest(path: string, init?: RequestInit) {
    const url = API_BASE ? `${API_BASE}${path}` : path;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(url, { 
        signal: controller.signal,
        credentials: 'include',
        ...init 
      });
      const contentType = res.headers.get('content-type') || '';
      let data: any = null;

      if (contentType.includes('application/json')) {
        try { data = await res.json(); } catch {}
      } else {
        try { const text = await res.text(); if (text) data = { message: text.slice(0, 2000) }; } catch {}
      }
      return { res, data };
    } finally {
      clearTimeout(timeout);
    }
  }

  function showErrorFrom(res: Response, data: any, fallback: string) {
    const statusInfo = `${res.status} ${res.statusText || ''}`.trim();
    return data?.message
      || (res.status ? `Anfrage fehlgeschlagen: ${statusInfo}` : fallback);
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (isRegister && !username.trim()) {
      return showSnackbar('Bitte einen Benutzernamen angeben.', 'error');
    }
    if (isRegister && !usernameRegex.test(username)) {
      return showSnackbar(
        'Der Benutzername darf nur Buchstaben, Zahlen und Unterstriche enthalten und muss zwischen 3 und 30 Zeichen lang sein.',
        'error'
      );
    }
    if (isRegister && !email.trim()) {
      return showSnackbar('Bitte eine E-Mail-Adresse angeben.', 'error');
    }
    if (!password) {
      return showSnackbar('Bitte ein Passwort angeben.', 'error');
    }
    if (isRegister && !consent) {
      return showSnackbar('Bitte stimmen Sie den Bedingungen zu.', 'error');
    }

    setLoading(true);
    try {
      const endpoint = isRegister ? 'register' : 'login';
      const body = isRegister
        ? { username, firstName, email, password, voucher, consentGiven: consent, newsletterOptIn }
        : { identifier: username || email, password };

      const { res, data } = await safeRequest(`/api/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        if (res.status === 409 && Array.isArray(data?.suggestions) && data.suggestions.length) {
          showSnackbar(`${data.message} Vorschläge: ${data.suggestions.join(', ')}`, 'warning');
        } else {
          showSnackbar(showErrorFrom(res, data, isRegister ? 'Registrierung fehlgeschlagen.' : 'Die Anmeldung ist fehlgeschlagen.'), 'error');
        }
        return;
      }

      if (isRegister) {
        showSnackbar(data?.message || 'Registrierung erfolgreich! Bitte E-Mail bestätigen.', 'success');
        navigate('/login');
      } else {
        if (!data?.token || !data?.user) {
          showSnackbar('Antwort ohne Token oder Benutzerdaten erhalten. Bitte später erneut versuchen.', 'error');
          return;
        }
        login(data.token, data.user as UserPayload);
        showSnackbar('Erfolgreich angemeldet.', 'success');
        navigate('/dashboard');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        showSnackbar('Zeitüberschreitung bei der Anfrage. Bitte erneut versuchen.', 'error');
      } else {
        console.error(err);
        showSnackbar('Ein Netzwerkfehler ist aufgetreten. Bitte versuchen Sie es später erneut.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Resend Verification Submit
  const handleResendVerification = async () => {
    const mail = resendEmail.trim();
    if (!emailRegex.test(mail)) {
      showSnackbar('Bitte eine gültige E-Mail-Adresse eingeben.', 'error');
      return;
    }
    try {
      const { res, data } = await safeRequest('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: mail }),
      });
      if (!res.ok) {
        showSnackbar(showErrorFrom(res, data, 'Versand fehlgeschlagen.'), 'error');
        return;
      }
      showSnackbar(data?.message || 'Wenn ein Konto existiert, wurde eine Bestätigungs-Mail gesendet.', 'success');
      setResendOpen(false);
    } catch (e) {
      console.error(e);
      showSnackbar('Netzwerkfehler beim Versand. Bitte später erneut versuchen.', 'error');
    }
  };

  const legalDialogTitle = (() => {
    switch (dialogContent) {
      case 'terms': return 'Nutzungsbedingungen';
      case 'privacy': return 'Datenschutzerklärung';
      case 'disclaimer': return 'Haftungsausschluss (Disclaimer)';
      default: return '';
    }
  })();

  // Passwortstärke berechnen (nur bei Registrierung)
  const passwordStrength = isRegister && password ? zxcvbn(password) : null;
  const strengthLabels = ['Sehr schwach', 'Schwach', 'Mittel', 'Gut', 'Sehr stark'];

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
            
            {isRegister && (
              <>
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  id="username"
                  label="Benutzername"
                  name="username"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                />
                <TextField
                  margin="normal"
                  fullWidth
                  id="firstName"
                  label="Vorname (optional)"
                  name="firstName"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={loading}
                />
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
              </>
            )}

            {!isRegister && (
              <TextField
                margin="normal"
                required
                fullWidth
                id="identifier"
                label="Benutzername oder E-Mail"
                name="identifier"
                autoComplete="username"
                autoFocus
                value={username || email}
                onChange={(e) => setUsername(e.target.value)}
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

            {isRegister && password && (
              <Box sx={{ mt: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={(passwordStrength?.score ?? 0) * 25}
                />
                <Typography variant="caption">
                  {strengthLabels[passwordStrength?.score ?? 0]}
                </Typography>
              </Box>
            )}

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
                    {', die '}
                    <Link component="button" type="button" onClick={() => handleOpenLegalDialog('privacy')} sx={{ verticalAlign: 'baseline' }}>
                      Datenschutzerklärung
                    </Link>
                    {' und den '}
                    <Link component="button" type="button" onClick={() => handleOpenLegalDialog('disclaimer')} sx={{ verticalAlign: 'baseline' }}>
                      Haftungsausschluss (Disclaimer)
                    </Link>
                    {' gelesen und stimme ihnen zu.'}
                  </Typography>
                }
                sx={{ mt: 2 }}
              />
            )}

            {isRegister && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={newsletterOptIn}
                    onChange={(e) => setNewsletterOptIn(e.target.checked)}
                  />
                }
                label={
                  <Typography variant="body2">
                    Optional: Ich möchte per E-Mail Informationen zu neuen Funktionen, Updates und Angeboten
                    des KI-Dashboards erhalten. Ich kann diese Einwilligung jederzeit widerrufen (z.&nbsp;B. über einen Abmeldelink).
                  </Typography>
                }
                sx={{ mt: 1 }}
              />
            )}

            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 1 }}
              disabled={loading || (isRegister && !consent)}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : (isRegister ? 'Konto erstellen' : 'Anmelden')}
            </Button>

            {/* Login-Extras */}
            {!isRegister && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Link component={RouterLink} to="/forgot-password" variant="body2">
                  Passwort vergessen?
                </Link>
                <Button variant="text" size="small" onClick={() => { setResendEmail(''); setResendOpen(true); }}>
                  Bestätigungs-Mail erneut senden
                </Button>
              </Box>
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

      {/* Rechtetexte-Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} scroll="paper" fullWidth maxWidth="md">
        <DialogTitle sx={{ m: 0, p: 2 }}>
          {legalDialogTitle}
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
            {dialogContent === 'disclaimer' && <DisclaimerPage />}
          </Suspense>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Schließen</Button>
        </DialogActions>
      </Dialog>

      {/* Resend-Verification-Dialog */}
      <Dialog open={resendOpen} onClose={() => setResendOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Bestätigungs-Mail erneut senden</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Bitte geben Sie die E-Mail-Adresse Ihres Kontos ein.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="E-Mail Adresse"
            type="email"
            value={resendEmail}
            onChange={(e) => setResendEmail(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResendOpen(false)}>Abbrechen</Button>
          <Button variant="contained" onClick={handleResendVerification}>Senden</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default LoginPage;
