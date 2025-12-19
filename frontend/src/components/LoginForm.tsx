import React, { useState, Suspense } from 'react';
import { useNavigate, Link as RouterLink, useSearchParams } from 'react-router-dom'; 
import { useAuth, UserPayload } from '../context/AuthContext';
import {
  TextField, Button, Typography, Box,
  InputAdornment, IconButton, Checkbox, FormControlLabel, Link,
  Collapse, Dialog, DialogTitle, DialogContent, DialogActions, 
  CircularProgress, LinearProgress, Divider
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import CloseIcon from '@mui/icons-material/Close';
import { useSnackbar } from '../context/SnackbarContext';
import zxcvbn from 'zxcvbn';
import apiClient from '../apiClient'; 

const TermsPage = React.lazy(() => import('../pages/TermsPage'));
const PrivacyPage = React.lazy(() => import('../pages/PrivacyPage'));
const DisclaimerPage = React.lazy(() => import('../pages/DisclaimerPage'));

interface LoginFormProps {
  isRegister?: boolean;
  prefilledUsername?: string;
}

type LegalDialogContent = 'terms' | 'privacy' | 'disclaimer' | null;

const LoginForm: React.FC<LoginFormProps> = ({ isRegister = false, prefilledUsername = '' }) => {
  const [searchParams] = useSearchParams();
  const { showSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const { login } = useAuth();

  // ✅ FIX 1: Partner-Code aus URL lesen
  const partnerCode = searchParams.get('partner') || '';

  const [username, setUsername] = useState(searchParams.get('username') || prefilledUsername);
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // ✅ FIX 1: Voucher mit Code initialisieren und Feld aufklappen, wenn Code vorhanden
  const [voucher, setVoucher] = useState(partnerCode);
  const [showVoucher, setShowVoucher] = useState(!!partnerCode);
  
  const [consent, setConsent] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState<LegalDialogContent>(null);
  const [resendOpen, setResendOpen] = useState(false);
  const [resendEmail, setResendEmail] = useState('');

  const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

  const handleClickShowPassword = () => setShowPassword((show) => !show);
  const handleMouseDownPassword = (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault();

  const handleOpenLegalDialog = (type: Exclude<LegalDialogContent, null>) => {
    setDialogContent(type);
    setDialogOpen(true);
  };

  // ✅ FIX 2: Funktion zum Wechseln des Modus MIT Beibehaltung der Parameter
  const handleSwitchAuthMode = () => {
      const targetPath = isRegister ? '/login' : '/register';
      // Wir behalten alle aktuellen Suchparameter bei (z.B. ?partner=xyz)
      navigate(`${targetPath}?${searchParams.toString()}`);
  };

  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
    let newPassword = '';
    for (let i = 0; i < 14; i++) {
      newPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(newPassword);
    navigator.clipboard.writeText(newPassword).catch(() => {});
    showSnackbar('Passwort generiert und kopiert.', 'success');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isRegister && !username.trim()) return showSnackbar('Bitte einen Benutzernamen angeben.', 'error');
    if (isRegister && !usernameRegex.test(username)) return showSnackbar('Ungültiger Benutzername (3-30 Zeichen, a-z, 0-9, _).', 'error');
    if (isRegister && !email.trim()) return showSnackbar('Bitte eine E-Mail-Adresse angeben.', 'error');
    if (!password) return showSnackbar('Bitte ein Passwort angeben.', 'error');
    if (isRegister && !consent) return showSnackbar('Bitte stimmen Sie den Bedingungen zu.', 'error');

    setLoading(true);
    try {
      const endpoint = isRegister ? 'register' : 'login';
      const body = isRegister 
        ? { username, firstName, email, password, voucher, consentGiven: consent, newsletterOptIn } 
        : { identifier: username || email, password };

      const { data } = await apiClient.post(`/api/auth/${endpoint}`, body);
      
      if (isRegister) {
        showSnackbar(data?.message || 'Registrierung erfolgreich! Bitte E-Mail bestätigen.', 'success');
        // Auch beim automatischen Redirect nach Registrierung die Params behalten (optional, aber sauber)
        navigate(`/login?${searchParams.toString()}`);
      } else {
        if (!data?.token || !data?.user) { 
            throw new Error('Ungültige Serverantwort'); 
        }
        login(data.token, data.user as UserPayload);
        showSnackbar('Erfolgreich angemeldet.', 'success');
        navigate('/dashboard');
      }
    } catch (err: any) {
        const status = err.response?.status;
        const msg = err.response?.data?.message || 'Ein Fehler ist aufgetreten.';
        const suggestions = err.response?.data?.suggestions;

        if (status === 409 && Array.isArray(suggestions) && suggestions.length) {
             showSnackbar(`${msg} Vorschläge: ${suggestions.join(', ')}`, 'warning');
        } else {
             showSnackbar(msg, 'error');
        }
    } finally { 
        setLoading(false); 
    }
  };

  const handleResendVerification = async () => {
    const mail = resendEmail.trim();
    if (!emailRegex.test(mail)) return showSnackbar('Bitte eine gültige E-Mail-Adresse eingeben.', 'error');
    try {
      await apiClient.post('/api/auth/resend-verification', { email: mail });
      showSnackbar('Falls ein Konto existiert, wurde eine E-Mail gesendet.', 'success');
      setResendOpen(false);
    } catch (e: any) { 
        showSnackbar(e.response?.data?.message || 'Versand fehlgeschlagen.', 'error'); 
    }
  };

  const legalDialogTitle = (() => {
    switch (dialogContent) {
      case 'terms': return 'Nutzungsbedingungen';
      case 'privacy': return 'Datenschutzerklärung';
      case 'disclaimer': return 'Haftungsausschluss';
      default: return '';
    }
  })();

  const passwordStrength = isRegister && password ? zxcvbn(password) : null;
  const strengthLabels = ['Sehr schwach', 'Schwach', 'Mittel', 'Gut', 'Sehr stark'];

  return (
    <>
      <Box component="form" onSubmit={handleSubmit} noValidate sx={{ width: '100%', mt: 1 }}>
        
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
          <Box sx={{ mt: 1, mb: 2 }}>
            <LinearProgress
              variant="determinate"
              value={(passwordStrength?.score ?? 0) * 25}
              color={(passwordStrength?.score ?? 0) < 3 ? 'error' : 'success'}
              sx={{ height: 6, borderRadius: 3 }}
            />
            <Typography variant="caption" sx={{ mt: 0.5, display: 'block', textAlign: 'right' }}>
              Stärke: {strengthLabels[passwordStrength?.score ?? 0]}
            </Typography>
          </Box>
        )}

        {isRegister && (
          <Button onClick={generatePassword} size="small" sx={{ textTransform: 'none', mb: 2 }}>
            Sicheres Passwort generieren
          </Button>
        )}

        {isRegister && (
          <Box sx={{ mt: 1, mb: 2 }}>
            <Button size="small" onClick={() => setShowVoucher(!showVoucher)} sx={{textTransform: 'none'}}>
              {showVoucher ? 'Einladungscode verbergen' : 'Haben Sie einen Einladungscode?'}
            </Button>
            <Collapse in={showVoucher}>
              <TextField
                margin="normal" fullWidth label="Einladungscode"
                value={voucher} onChange={(e) => setVoucher(e.target.value)}
                // Wenn der Code aus der URL kommt, machen wir ihn vielleicht read-only zur Bestätigung?
                // Oder lassen ihn editierbar. Hier editierbar:
                helperText={partnerCode ? "Code automatisch aus Einladungslink übernommen" : ""}
              />
            </Collapse>
          </Box>
        )}

        {isRegister && (
          <FormControlLabel
            control={<Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} />}
            label={
              <Typography variant="body2">
                Ich stimme den{' '}
                <Link component="button" type="button" onClick={() => handleOpenLegalDialog('terms')} sx={{ verticalAlign: 'baseline' }}>AGB</Link>,{' '}
                <Link component="button" type="button" onClick={() => handleOpenLegalDialog('privacy')} sx={{ verticalAlign: 'baseline' }}>Datenschutz</Link>{' & '}
                <Link component="button" type="button" onClick={() => handleOpenLegalDialog('disclaimer')} sx={{ verticalAlign: 'baseline' }}>Disclaimer</Link> zu.
              </Typography>
            }
            sx={{ mt: 2, alignItems: 'flex-start' }}
          />
        )}

        {isRegister && (
          <FormControlLabel
            control={<Checkbox checked={newsletterOptIn} onChange={(e) => setNewsletterOptIn(e.target.checked)} />}
            label={<Typography variant="body1">Newsletter abonnieren (jederzeit kündbar).</Typography>}
            sx={{ mt: 1 }}
          />
        )}

        <Button
          type="submit"
          fullWidth
          variant="contained"
          size="large"
          sx={{ mt: 3, mb: 2, py: 1.5, fontWeight: 'bold', fontSize: '1rem' }}
          disabled={loading || (isRegister && !consent)}
        >
          {loading ? <CircularProgress size={24} color="inherit" /> : (isRegister ? 'Registrieren' : 'Anmelden')}
        </Button>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {!isRegister && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Link component={RouterLink} to="/forgot-password" variant="body2" underline="hover">
                        Passwort vergessen?
                    </Link>
                    <Link component="button" type="button" variant="body2" onClick={() => { setResendEmail(''); setResendOpen(true); }} sx={{ cursor: 'pointer' }}>
                        Bestätigung erneut senden
                    </Link>
                </Box>
            )}
            
            <Button
              fullWidth
              variant="outlined"
              size="large"
              onClick={handleSwitchAuthMode} // ✅ FIX 2: Neue Funktion genutzt
              sx={{ mt: 2, textTransform: 'none' }}
            >
              {isRegister ? 'Bereits ein Konto? Anmelden' : 'Noch kein Konto? Registrieren'}
            </Button>
        </Box>

        <Divider sx={{ my: 3 }} />
        
        <Typography variant="body2" align="center" color="text.secondary">
            <Link href="https://www.mobiliti.at" target="_blank" rel="noopener noreferrer" underline="hover">
                mobiliti.at
            </Link> Ihr smarter Überblick.
        </Typography>

      </Box>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} scroll="paper" fullWidth maxWidth="md">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>{legalDialogTitle}<IconButton onClick={() => setDialogOpen(false)}><CloseIcon /></IconButton></DialogTitle>
        <DialogContent dividers>
          <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>}>
            {dialogContent === 'terms' && <TermsPage />}
            {dialogContent === 'privacy' && <PrivacyPage />}
            {dialogContent === 'disclaimer' && <DisclaimerPage />}
          </Suspense>
        </DialogContent>
      </Dialog>

      <Dialog open={resendOpen} onClose={() => setResendOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Bestätigung erneut senden</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 2 }}>Geben Sie Ihre E-Mail-Adresse ein.</Typography>
          <TextField autoFocus fullWidth margin="dense" label="E-Mail" type="email" value={resendEmail} onChange={(e) => setResendEmail(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResendOpen(false)}>Abbrechen</Button>
          <Button variant="contained" onClick={handleResendVerification}>Senden</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default LoginForm;