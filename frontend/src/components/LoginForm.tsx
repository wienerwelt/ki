import React, { useState, Suspense, useEffect } from 'react';
import { useNavigate, Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useAuth, UserPayload } from '../context/AuthContext';
import {
  TextField,
  Button,
  Typography,
  Box,
  InputAdornment,
  IconButton,
  Checkbox,
  FormControlLabel,
  Link,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  LinearProgress,
  Divider,
  useTheme,
  Alert,
  Stack,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import CloseIcon from '@mui/icons-material/Close';
import { useSnackbar } from '../context/SnackbarContext';
import zxcvbn from 'zxcvbn';
import apiClient from '../apiClient';

const TermsContent = React.lazy(() => import('../components/TermsContent').then(m => ({ default: m.TermsContent })));
const PrivacyContent = React.lazy(() => import('../components/PrivacyContent').then(m => ({ default: m.PrivacyContent })));
const DisclaimerContent = React.lazy(() => import('../components/DisclaimerContent').then(m => ({ default: m.DisclaimerContent })));

interface LoginFormProps {
  isRegister?: boolean;
  prefilledUsername?: string;
}

type LegalDialogContent = 'terms' | 'privacy' | 'disclaimer' | null;

const LEGAL_VERSIONS = {
  terms: '2026-03-18',
  privacy: '2026-03-18',
  disclaimer: '2026-03-18',
};

const COOKIE_SETTINGS_URL = '/cookie-settings';
const IMPRINT_URL = 'https://www.mobiliti.at/impressum.html';

const LoginForm: React.FC<LoginFormProps> = ({ isRegister = false, prefilledUsername = '' }) => {
  const [searchParams] = useSearchParams();
  const { showSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const theme = useTheme();

  const { login, businessPartner, setPartnerByCode } = useAuth();
  const partnerCode = searchParams.get('partner') || '';

  const customPrimaryColor = businessPartner?.color_scheme?.primary_color || theme.palette.primary.main;
  const customTextColor = businessPartner?.color_scheme?.primary_text_color || '#ffffff';

  const [username, setUsername] = useState(searchParams.get('username') || prefilledUsername);
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [voucher, setVoucher] = useState(partnerCode);
  const [showVoucher, setShowVoucher] = useState(!!partnerCode);

  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acknowledgePrivacy, setAcknowledgePrivacy] = useState(false);
  const [acknowledgeDisclaimer, setAcknowledgeDisclaimer] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState<LegalDialogContent>(null);
  const [resendOpen, setResendOpen] = useState(false);
  const [resendEmail, setResendEmail] = useState('');

  useEffect(() => {
    if (partnerCode && typeof setPartnerByCode === 'function') {
      setPartnerByCode(partnerCode);
    }
  }, [partnerCode, setPartnerByCode]);

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      if (errorParam === 'account_locked') {
        showSnackbar('Account gesperrt.', 'error');
      } else if (errorParam === 'account_expired') {
        showSnackbar('Account abgelaufen.', 'error');
      } else if (errorParam === 'account_disabled') {
        showSnackbar('Ihr Mandantenkonto ist derzeit deaktiviert.', 'error');
      } else if (errorParam === 'sso_failed' || errorParam === 'google_auth_failed' || errorParam === 'linkedin_auth_failed') {
        showSnackbar('SSO Anmeldung fehlgeschlagen.', 'error');
      }
      
      searchParams.delete('error');
      navigate({ search: searchParams.toString() }, { replace: true });
    }
  }, [searchParams, showSnackbar, navigate]);

  const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

  const handleClickShowPassword = () => setShowPassword((show) => !show);
  const handleMouseDownPassword = (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault();

  const handleOpenLegalDialog = (type: Exclude<LegalDialogContent, null>) => {
    setDialogContent(type);
    setDialogOpen(true);
  };

  const handleSwitchAuthMode = () => {
    const targetPath = isRegister ? '/login' : '/register';
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

  const passwordStrength = isRegister && password ? zxcvbn(password) : null;
  const strengthLabels = ['Sehr schwach', 'Schwach', 'Mittel', 'Gut', 'Sehr stark'];

  const canSubmitRegister =
    acceptTerms &&
    acknowledgePrivacy &&
    acknowledgeDisclaimer &&
    !!username.trim() &&
    !!email.trim() &&
    !!password;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (isRegister) {
      if (!username.trim()) return showSnackbar('Bitte einen Benutzernamen angeben.', 'error');
      if (!usernameRegex.test(username)) {
        return showSnackbar('Ungültiger Benutzername (3-30 Zeichen, a-z, 0-9, _).', 'error');
      }
      if (!email.trim()) return showSnackbar('Bitte eine E-Mail-Adresse angeben.', 'error');
      if (!emailRegex.test(email)) return showSnackbar('Bitte eine gültige E-Mail-Adresse angeben.', 'error');
      if (!password) return showSnackbar('Bitte ein Passwort angeben.', 'error');
      if ((passwordStrength?.score ?? 0) < 2) return showSnackbar('Das Passwort ist noch zu schwach.', 'error');
      if (!(acceptTerms && acknowledgePrivacy && acknowledgeDisclaimer)) {
        return showSnackbar('Bitte AGB, Datenschutz und Disclaimer bestätigen.', 'error');
      }
    } else {
      if (!(username || email).trim()) return showSnackbar('Bitte Benutzername oder E-Mail angeben.', 'error');
      if (!password) return showSnackbar('Bitte ein Passwort angeben.', 'error');
    }

    setLoading(true);
    try {
      const endpoint = isRegister ? 'register' : 'login';

      const body = isRegister
        ? {
            username: username.trim(),
            firstName: firstName.trim(),
            email: email.trim().toLowerCase(),
            password,
            voucher: voucher.trim(),
            consentGiven: acceptTerms && acknowledgePrivacy && acknowledgeDisclaimer,
            newsletterOptIn,
            legalMeta: {
              termsAccepted: acceptTerms,
              privacyAcknowledged: acknowledgePrivacy,
              disclaimerAcknowledged: acknowledgeDisclaimer,
              versions: {
                terms: LEGAL_VERSIONS.terms,
                privacy: LEGAL_VERSIONS.privacy,
                disclaimer: LEGAL_VERSIONS.disclaimer,
              },
            },
          }
        : {
            identifier: (username || email).trim(),
            password,
          };

      const { res, data } = await apiClient.post(`/api/auth/${endpoint}`, body);

if (!res.ok) {
  throw {
    status: res.status,
    data,
  };
}

      if (isRegister) {
        showSnackbar(data?.message || 'Registrierung erfolgreich! Bitte E-Mail bestätigen.', 'success');
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
  const status = err.status;
  const msg =
    err.data?.message ||
    err.data?.error ||
    err.message ||
    'Ein Fehler ist aufgetreten.';

  const suggestions = err.data?.suggestions;

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
    if (!emailRegex.test(mail)) {
      return showSnackbar('Bitte eine gültige E-Mail-Adresse eingeben.', 'error');
    }

    try {
      await apiClient.post('/api/auth/resend-verification', { email: mail.toLowerCase() });
      showSnackbar('Falls ein Konto existiert, wurde eine E-Mail gesendet.', 'success');
      setResendOpen(false);
    } catch (e: any) {
      showSnackbar(e.response?.data?.message || 'Versand fehlgeschlagen.', 'error');
    }
  };

  const legalDialogTitle = (() => {
    switch (dialogContent) {
      case 'terms':
        return 'Nutzungsbedingungen';
      case 'privacy':
        return 'Datenschutzerklärung';
      case 'disclaimer':
        return 'Haftungsausschluss';
      default:
        return '';
    }
  })();

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
    InputProps={{
      endAdornment: (username || email) ? (
        <InputAdornment position="end">
          <IconButton
            aria-label="Eingabe löschen"
            onClick={() => {
              setUsername('');
              setEmail('');
            }}
            edge="end"
            disabled={loading}
          >
            <CloseIcon />
          </IconButton>
        </InputAdornment>
      ) : null,
    }}
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
          autoComplete={isRegister ? 'new-password' : 'current-password'}
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
          <Button
            onClick={generatePassword}
            size="small"
            sx={{ textTransform: 'none', mb: 2, color: customPrimaryColor }}
          >
            Sicheres Passwort generieren
          </Button>
        )}

{isRegister && (
          <Box sx={{ mt: 1, mb: 2 }}>
            {partnerCode ? (
              // Wenn der User über einen speziellen Einladungs-Link kommt: Lock & Trust!
              <Alert 
                severity="success" 
                sx={{ 
                  bgcolor: `${customPrimaryColor}15`, 
                  color: customTextColor === '#ffffff' || !customTextColor ? customPrimaryColor : customTextColor,
                  '& .MuiAlert-icon': { color: customPrimaryColor } 
                }}
              >
                Einladung für <strong>{businessPartner?.name || 'Ihren Verband'}</strong> ist aktiv.
              </Alert>
            ) : (
              // Wenn der User organisch (ohne Link) auf der Registrierungsseite landet:
              <>
                <Button
                  size="small"
                  onClick={() => setShowVoucher(!showVoucher)}
                  sx={{ textTransform: 'none', color: customPrimaryColor }}
                >
                  {showVoucher ? 'Einladungscode verbergen' : 'Haben Sie einen Einladungscode?'}
                </Button>
    
                <Collapse in={showVoucher}>
                  <TextField
                    margin="normal"
                    fullWidth
                    label="Einladungscode"
                    value={voucher}
                    onChange={(e) => setVoucher(e.target.value)}
                    helperText="Fragen Sie Ihren Verband oder Administrator nach dem Code."
                  />
                </Collapse>
              </>
            )}
          </Box>
        )}


{isRegister && (
          <Stack spacing={1.5} sx={{ mt: 2, mb: 3 }}>
            <FormControlLabel
              sx={{ alignItems: 'flex-start', ml: 0 }}
              control={
                <Checkbox
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  sx={{ p: 0, mr: 1.5, mt: '2px', '&.Mui-checked': { color: customPrimaryColor } }}
                />
              }
              label={
                <Typography variant="body2" sx={{ lineHeight: 1.4 }}>
                  Ich akzeptiere die{' '}
                  <Link
                    component="button"
                    type="button"
                    onClick={() => handleOpenLegalDialog('terms')}
                    sx={{ color: customPrimaryColor, verticalAlign: 'baseline' }}
                  >
                    Nutzungsbedingungen
                  </Link>
                  . *
                </Typography>
              }
            />

            <FormControlLabel
              sx={{ alignItems: 'flex-start', ml: 0 }}
              control={
                <Checkbox
                  checked={acknowledgePrivacy}
                  onChange={(e) => setAcknowledgePrivacy(e.target.checked)}
                  sx={{ p: 0, mr: 1.5, mt: '2px', '&.Mui-checked': { color: customPrimaryColor } }}
                />
              }
              label={
                <Typography variant="body2" sx={{ lineHeight: 1.4 }}>
                  Ich habe die{' '}
                  <Link
                    component="button"
                    type="button"
                    onClick={() => handleOpenLegalDialog('privacy')}
                    sx={{ color: customPrimaryColor, verticalAlign: 'baseline' }}
                  >
                    Datenschutzerklärung
                  </Link>{' '}
                  zur Kenntnis genommen. *
                </Typography>
              }
            />

            <FormControlLabel
              sx={{ alignItems: 'flex-start', ml: 0 }}
              control={
                <Checkbox
                  checked={acknowledgeDisclaimer}
                  onChange={(e) => setAcknowledgeDisclaimer(e.target.checked)}
                  sx={{ p: 0, mr: 1.5, mt: '2px', '&.Mui-checked': { color: customPrimaryColor } }}
                />
              }
              label={
                <Typography variant="body2" sx={{ lineHeight: 1.4 }}>
                  Ich habe den{' '}
                  <Link
                    component="button"
                    type="button"
                    onClick={() => handleOpenLegalDialog('disclaimer')}
                    sx={{ color: customPrimaryColor, verticalAlign: 'baseline' }}
                  >
                    Disclaimer
                  </Link>{' '}
                  gelesen. *
                </Typography>
              }
            />

            <FormControlLabel
              sx={{ alignItems: 'flex-start', ml: 0 }}
              control={
                <Checkbox
                  checked={newsletterOptIn}
                  onChange={(e) => setNewsletterOptIn(e.target.checked)}
                  sx={{ p: 0, mr: 1.5, mt: '2px', '&.Mui-checked': { color: customPrimaryColor } }}
                />
              }
              label={
                <Typography variant="body2" sx={{ lineHeight: 1.4 }}>
                  Newsletter abonnieren (optional und widerrufbar).
                </Typography>
              }
            />
          </Stack>
        )}

{/* === SSO BUTTONS === */}
        <Box sx={{ mt: 3, mb: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Button
            fullWidth
            variant="outlined"
            size="large"
            onClick={() => {
              const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
              // PartnerCode anhängen, damit er als "state" mitgeschickt wird
              window.location.href = `${baseUrl}/api/auth/google${partnerCode ? `?partner=${partnerCode}` : ''}`;
            }}
            sx={{
              color: '#757575',
              borderColor: '#e0e0e0',
              backgroundColor: '#fff',
              textTransform: 'none',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1.5,
              '&:hover': { backgroundColor: '#f5f5f5', borderColor: '#d5d5d5' }
            }}
          >
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" style={{ width: 24, height: 24 }} />
            Mit Google {isRegister ? 'registrieren' : 'anmelden'}
          </Button>

          <Button
            fullWidth
            variant="outlined"
            size="large"
            onClick={() => {
              const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
              window.location.href = `${baseUrl}/api/auth/linkedin${partnerCode ? `?partner=${partnerCode}` : ''}`;
            }}
            sx={{
              color: '#0077b5',
              borderColor: '#e0e0e0',
              backgroundColor: '#fff',
              textTransform: 'none',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1.5,
              '&:hover': { backgroundColor: '#f3f8fb', borderColor: '#005885' }
            }}
          >
            <img src="https://www.svgrepo.com/show/448234/linkedin.svg" alt="LinkedIn" style={{ width: 24, height: 24 }} />
            Mit LinkedIn {isRegister ? 'registrieren' : 'anmelden'}
          </Button>
        </Box>

        <Divider sx={{ my: 2, '&::before, &::after': { borderColor: '#e0e0e0' } }}>
          <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>
            ODER TRADITIONELL
          </Typography>
        </Divider>     

        {/* --- BUTTON --- */}
        <Button
          type="submit"
          fullWidth
          variant="contained"
          size="large"
          sx={{
            mt: 3,
            mb: 2,
            py: 1.5,
            fontWeight: 'bold',
            fontSize: '1rem',
            backgroundColor: customPrimaryColor,
            color: customTextColor,
            '&:hover': {
              backgroundColor: customPrimaryColor,
              filter: 'brightness(0.9)',
            },
          }}
          disabled={loading || (isRegister && !canSubmitRegister)}
        >
          {loading ? <CircularProgress size={24} color="inherit" /> : isRegister ? 'Registrieren' : 'Anmelden'}
        </Button>

        

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {!isRegister && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Link
                component={RouterLink}
                to="/forgot-password"
                variant="body2"
                underline="hover"
                sx={{ color: customPrimaryColor }}
              >
                Passwort vergessen?
              </Link>

              <Link
                component="button"
                type="button"
                variant="body2"
                onClick={() => {
                  setResendEmail('');
                  setResendOpen(true);
                }}
                sx={{ cursor: 'pointer', color: customPrimaryColor }}
              >
                Bestätigung erneut senden
              </Link>
            </Box>
          )}

          <Button
            fullWidth
            variant="outlined"
            size="large"
            onClick={handleSwitchAuthMode}
            sx={{
              mt: 2,
              textTransform: 'none',
              color: customPrimaryColor,
              borderColor: customPrimaryColor,
              '&:hover': {
                borderColor: customPrimaryColor,
                backgroundColor: `${customPrimaryColor}10`,
              },
            }}
          >
            {isRegister ? 'Bereits ein Konto? Anmelden' : 'Noch kein Konto? Registrieren'}
          </Button>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Stack spacing={1} alignItems="center">
          <Typography variant="body2" align="center" color="text.secondary">
            <Link
              href="https://www.mobiliti.at"
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              sx={{ color: customPrimaryColor }}
            >
              mobiliti.at
            </Link>{' '}
            Ihr smarter Überblick.
          </Typography>

          <Typography variant="caption" align="center" color="text.secondary">
            <Link
              href={IMPRINT_URL}
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              sx={{ color: customPrimaryColor }}
            >
              Impressum
            </Link>
            {' · '}
            <Link
              component="button"
              type="button"
              underline="hover"
              onClick={() => handleOpenLegalDialog('privacy')}
              sx={{ color: customPrimaryColor }}
            >
              Datenschutz
            </Link>
            {' · '}
            <Link
              component="button"
              type="button"
              underline="hover"
              onClick={() => handleOpenLegalDialog('terms')}
              sx={{ color: customPrimaryColor }}
            >
              Nutzungsbedingungen
            </Link>
            {' · '}
            <Link
              component="button"
              type="button"
              underline="hover"
              onClick={() => handleOpenLegalDialog('disclaimer')}
              sx={{ color: customPrimaryColor }}
            >
              Disclaimer
            </Link>
            {' · '}
            <Link href={COOKIE_SETTINGS_URL} underline="hover" sx={{ color: customPrimaryColor }}>
              Cookie-Einstellungen
            </Link>
          </Typography>
        </Stack>
      </Box>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} scroll="paper" fullWidth maxWidth="md">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {legalDialogTitle}
          <IconButton onClick={() => setDialogOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Suspense
            fallback={
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
              </Box>
            }
          >
            {dialogContent === 'terms' && <TermsContent />}
            {dialogContent === 'privacy' && <PrivacyContent />}
            {dialogContent === 'disclaimer' && <DisclaimerContent />}
          </Suspense>
        </DialogContent>
      </Dialog>

      <Dialog open={resendOpen} onClose={() => setResendOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Bestätigung erneut senden</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Geben Sie Ihre E-Mail-Adresse ein.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="E-Mail"
            type="email"
            value={resendEmail}
            onChange={(e) => setResendEmail(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResendOpen(false)}>Abbrechen</Button>
          <Button
            variant="contained"
            onClick={handleResendVerification}
            sx={{
              backgroundColor: customPrimaryColor,
              color: customTextColor,
              '&:hover': {
                backgroundColor: customPrimaryColor,
                filter: 'brightness(0.9)',
              },
            }}
          >
            Senden
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default LoginForm;