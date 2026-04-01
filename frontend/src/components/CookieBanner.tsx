import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Paper, Slide, Stack, useTheme, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import CookieIcon from '@mui/icons-material/Cookie';

const CookieBanner: React.FC = () => {
  const [show, setShow] = useState(false);
  const navigate = useNavigate();
  const theme = useTheme();

  useEffect(() => {
    // Prüfe, ob der User bereits eine Entscheidung getroffen hat
    const consent = localStorage.getItem('cookie_preferences');
    if (!consent) {
      // Verzögere die Anzeige minimal für ein weicheres Laden
      const timer = setTimeout(() => setShow(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem('cookie_preferences', JSON.stringify({ essential: true, analytics: true, externalMedia: true }));
    setShow(false);
    // Hier Event triggern, falls Google Analytics / Maps dynamisch nachgeladen werden müssen
    window.dispatchEvent(new Event('cookie_consent_updated'));
  };

  const handleEssentialOnly = () => {
    localStorage.setItem('cookie_preferences', JSON.stringify({ essential: true, analytics: false, externalMedia: false }));
    setShow(false);
    window.dispatchEvent(new Event('cookie_consent_updated'));
  };

  if (!show) return null;

  return (
    <Slide direction="up" in={show} mountOnEnter unmountOnExit>
      <Paper 
elevation={16}
        sx={{
          position: 'fixed', 
          bottom: { xs: 16, sm: 24 }, 
          // --- DIE ROBUSTE ZENTRIERUNG ---
          left: 16, 
          right: 16, 
          mx: 'auto', // margin-left: auto, margin-right: auto
          // -------------------------------
          maxWidth: 900,
          zIndex: 9999,
          borderRadius: 3, 
          border: '1px solid', 
          borderColor: 'divider', 
          overflow: 'hidden'
        }}
      >
        <Box 
          sx={{ 
            p: { xs: 2.5, sm: 3 }, 
            display: 'flex', 
            flexDirection: { xs: 'column', md: 'row' }, 
            gap: { xs: 3, md: 4 }, 
            alignItems: { xs: 'flex-start', md: 'center' } 
          }}
        >
          {/* Text- und Icon-Bereich */}
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexGrow: 1 }}>
            <Box sx={{ flexShrink: 0, display: { xs: 'none', sm: 'flex' }, width: 40, height: 40, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.1), alignItems: 'center', justifyContent: 'center' }}>
              <CookieIcon color="primary" fontSize="small" />
            </Box>
            
            <Box>
              <Typography variant="subtitle1" fontWeight={800} gutterBottom sx={{ lineHeight: 1.2 }}>
                Ihre Privatsphäre ist uns wichtig
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                Wir nutzen Cookies, um das Dashboard sicher zu betreiben, die Nutzung zu analysieren und externe Medien einzubinden. Sie können Ihre Auswahl jederzeit anpassen.
              </Typography>
            </Box>
          </Box>

          {/* Button-Bereich */}
          <Stack 
            direction={{ xs: 'column', sm: 'row' }} 
            spacing={1.5} 
            sx={{ flexShrink: 0, width: { xs: '100%', md: 'auto' } }}
          >
            <Button 
              size="small"
              variant="outlined" 
              color="inherit" 
              fullWidth // Auf dem Handy volle Breite, am Desktop reihen sie sich nebeneinander
              onClick={() => { setShow(false); navigate('/cookie-settings'); }}
              sx={{ borderRadius: 2 }}
            >
              Anpassen
            </Button>
            <Button 
              size="small"
              variant="outlined" 
              fullWidth
              onClick={handleEssentialOnly}
              sx={{ borderRadius: 2 }}
            >
              Nur Notwendige
            </Button>
            <Button 
              size="small"
              variant="contained" 
              fullWidth
              onClick={handleAcceptAll}
              sx={{ borderRadius: 2 }}
            >
              Alle akzeptieren
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Slide>
  );
};

export default CookieBanner;