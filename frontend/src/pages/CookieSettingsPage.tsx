import React, { useState, useEffect } from 'react';
import {
  Container, Typography, Paper, Box, Switch, Button, Divider, Stack,
  useTheme, alpha, Alert, Snackbar, IconButton
} from '@mui/material';
import CookieIcon from '@mui/icons-material/Cookie';
import SecurityIcon from '@mui/icons-material/Security';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import PublicIcon from '@mui/icons-material/Public';
import MyLocationIcon from '@mui/icons-material/MyLocation'; // Neu für Standort
import SaveIcon from '@mui/icons-material/Save';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

interface CookiePreferences {
  essential: boolean;
  analytics: boolean;
  externalMedia: boolean;
  location: boolean; // Neu hinzugefügt
}

const CookieSettingsPage: React.FC = () => {
  const theme = useTheme();
  
  // GEÄNDERT: Initialwerte jetzt auf 'true', damit die Schalter aktiv sind
  const [preferences, setPreferences] = useState<CookiePreferences>({
    essential: true,
    analytics: true,
    externalMedia: true,
    location: true,
  });
  
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('cookie_preferences');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setPreferences({ ...parsed, essential: true });
      } catch (e) {
        console.error("Konnte Cookie-Einstellungen nicht parsen", e);
      }
    }
  }, []);

  const handleToggle = (key: keyof CookiePreferences) => {
    if (key === 'essential') return;
    setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    localStorage.setItem('cookie_preferences', JSON.stringify(preferences));
    window.dispatchEvent(new Event('cookie_consent_updated'));
    setShowSuccess(true);
  };

  const handleAcceptAll = () => {
    const allAccepted = { essential: true, analytics: true, externalMedia: true, location: true };
    setPreferences(allAccepted);
    localStorage.setItem('cookie_preferences', JSON.stringify(allAccepted));
    window.dispatchEvent(new Event('cookie_consent_updated'));
    setShowSuccess(true);
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'https://www.mobiliti.at';
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: { xs: 4, md: 8 } }}>
      <Container maxWidth="md">
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 6 }}>
          <IconButton onClick={handleBack} sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="subtitle2" color="text.secondary" fontWeight="bold">
            mobiliti Intelligence
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
          <Box sx={{ width: 50, height: 50, borderRadius: 3, bgcolor: alpha(theme.palette.primary.main, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CookieIcon color="primary" fontSize="large" />
          </Box>
          <Box>
            <Typography variant="h4" fontWeight={800}>Privatsphäre-Einstellungen</Typography>
            <Typography variant="body2" color="text.secondary">
              Bestimmen Sie, wie wir Ihr Dashboard-Erlebnis personalisieren dürfen.
            </Typography>
          </Box>
        </Box>

        <Paper elevation={0} sx={{ borderRadius: 4, border: '1px solid', borderColor: 'divider', overflow: 'hidden', bgcolor: 'background.paper' }}>
          
          {/* 1. Essenzielle Cookies */}
          <Box sx={{ p: { xs: 2, sm: 4 }, bgcolor: alpha(theme.palette.success.main, 0.03) }}>
            <Stack direction="row" spacing={2} alignItems="flex-start">
              <SecurityIcon color="success" sx={{ mt: 0.5 }} />
              <Box sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="h6" fontWeight="bold">Zwingend erforderlich</Typography>
                  <Switch checked={preferences.essential} disabled color="success" />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Diese Cookies und LocalStorage-Einträge sind für die Grundfunktionen zwingend notwendig. 
                  Dazu gehören Ihr Login-Token (Sicherheit), Ihre Spracheinstellungen und Ihre ausgewählte Region. Ohne diese Daten kann das System nicht funktionieren.
                </Typography>
              </Box>
            </Stack>
          </Box>

          <Divider />

          {/* 2. Analyse (PostHog) */}
          <Box sx={{ p: { xs: 2, sm: 4 } }}>
            <Stack direction="row" spacing={2} alignItems="flex-start">
              <AnalyticsIcon color="primary" sx={{ mt: 0.5 }} />
              <Box sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="h6" fontWeight="bold">Analyse & Statistik</Typography>
                  <Switch checked={preferences.analytics} onChange={() => handleToggle('analytics')} color="primary" />
                </Box>
                <Typography variant="body2" color="text.secondary">
        Wir nutzen das Analyse-Tool <strong>PostHog</strong>, um die Nutzung unseres Dashboards besser zu verstehen. 
        Dies hilft uns zu erkennen, welche Widgets besonders hilfreich sind und wo wir die Bedienung noch vereinfachen können. 
        Die Daten werden anonymisiert verarbeitet und auf Servern innerhalb der <strong>Europäischen Union (EU)</strong> gespeichert. 
        Es erfolgt keine Weitergabe an Dritte zu Werbezwecken. Das Tracking wird erst nach Ihrer aktiven Zustimmung aktiviert.
                </Typography>
              </Box>
            </Stack>
          </Box>

          <Divider />

          {/* 3. Externe Medien (Maps) */}
          <Box sx={{ p: { xs: 2, sm: 4 } }}>
            <Stack direction="row" spacing={2} alignItems="flex-start">
              <PublicIcon color="info" sx={{ mt: 0.5 }} />
              <Box sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="h6" fontWeight="bold">Externe Medien & Karten</Typography>
                  <Switch checked={preferences.externalMedia} onChange={() => handleToggle('externalMedia')} color="info" />
                </Box>
                <Typography variant="body2" color="text.secondary">
        Zur interaktiven Darstellung von Standorten (z. B. E-Ladestationen oder Tankstellen) nutzen wir Kartenmaterial von <strong>OpenStreetMap</strong> und Symbole von <strong>FlagCDN</strong>. 
        Wenn Sie diese Kategorie aktivieren, werden Inhalte von externen Servern nachgeladen. Dabei wird technisch bedingt Ihre <strong>IP-Adresse</strong> an diese Anbieter übertragen. 
        Ohne Ihre Zustimmung können wir keine Karten direkt im Dashboard anzeigen.
                </Typography>
              </Box>
            </Stack>
          </Box>

          <Divider />

          {/* 4. NEU: Standort-Dienste */}
          <Box sx={{ p: { xs: 2, sm: 4 }, bgcolor: alpha(theme.palette.info.main, 0.02) }}>
            <Stack direction="row" spacing={2} alignItems="flex-start">
              <MyLocationIcon color="info" sx={{ mt: 0.5 }} />
              <Box sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="h6" fontWeight="bold">Standort-Automatisierung</Typography>
                  <Switch checked={preferences.location} onChange={() => handleToggle('location')} color="info" />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Wenn aktiviert, fragt das Dashboard Ihren Standort ab, um Tankstellen und Ladestationen in Ihrer direkten Umgebung anzuzeigen. Deaktivieren Sie dies, wenn Sie Standorte lieber manuell suchen.
                </Typography>
              </Box>
            </Stack>
          </Box>

          <Divider />

          <Box sx={{ p: 3, bgcolor: alpha(theme.palette.action.hover, 0.05), display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button variant="outlined" onClick={handleSave} startIcon={<SaveIcon />} sx={{ borderRadius: 2 }}>
              Speichern
            </Button>
            <Button variant="contained" onClick={handleAcceptAll} sx={{ borderRadius: 2 }}>
              Alle akzeptieren
            </Button>
          </Box>
        </Paper>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 4, textAlign: 'center' }}>
          Weitere Informationen finden Sie in unserer <a href="/privacy" style={{ color: theme.palette.primary.main, textDecoration: 'none' }}>Datenschutzerklärung</a>. 
          Sie können Ihre Einstellungen hier jederzeit widerrufen.
        </Typography>

      </Container>

      <Snackbar open={showSuccess} autoHideDuration={4000} onClose={() => setShowSuccess(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" sx={{ width: '100%', borderRadius: 2 }}>Einstellungen gespeichert!</Alert>
      </Snackbar>
    </Box>
  );
};

export default CookieSettingsPage;