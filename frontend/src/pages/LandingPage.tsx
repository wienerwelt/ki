// frontend/src/pages/LandingPage.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { Container, Typography, Button, Box } from '@mui/material';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import PublicIcon from '@mui/icons-material/Public';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import './LandingPage.css'; // Eigene Stile für Landing Page

const LandingPage: React.FC = () => {
    return (
        <Container maxWidth="md" sx={{ textAlign: 'center', py: 8 }}>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h3" component="h1" gutterBottom>
                    Fleet KI-Dashboard
                </Typography>
                <Typography variant="h6" component="p" color="text.secondary">
                    Ihr Kompass für betriebliche Mobilität.
                </Typography>
            </Box>

            <Box sx={{ mb: 6 }}>
                <Typography variant="h5" gutterBottom>
                    Verwandeln Sie externe Daten in strategische Vorteile.
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                    Maßgeschneiderte Einblicke für Flotten-, Beschaffungs- und Nachhaltigkeitsmanager.
                </Typography>
                <Box sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 3,
                    flexWrap: 'wrap',
                    mb: 4
                }}>
                    <DirectionsCarIcon sx={{ fontSize: 60, color: 'primary.main' }} />
                    <LocalGasStationIcon sx={{ fontSize: 60, color: 'secondary.main' }} />
                    <PublicIcon sx={{ fontSize: 60, color: 'success.main' }} />
                    <SyncAltIcon sx={{ fontSize: 60, color: 'info.main' }} />
                </Box>
                <Typography variant="body1" color="text.secondary">
                    Erleben Sie, wie externe Faktoren Ihre Entscheidungen beeinflussen – und wie Sie sie optimal nutzen können.
                </Typography>
            </Box>

            <Button
                component={Link}
                to="/login"
                variant="contained"
                color="primary"
                size="large"
                sx={{ mb: 6, px: 5, py: 1.5, borderRadius: '25px' }}
            >
                Jetzt einloggen / registrieren
            </Button>

            <Box sx={{ backgroundColor: 'background.paper', p: 4, borderRadius: 2, boxShadow: 1 }}>
                <Typography variant="h6" gutterBottom>
                    Was Sie erwarten können:
                </Typography>
                <ul className="teaser-list">
                    <li><Typography variant="body1" className="blur-text">📊 Tagesaktuelle Marktpreise (z.B. Kraftstoffe)</Typography></li>
                    <li><Typography variant="body1" className="blur-text">🚚 Echtzeit-Verkehrs- und Wetterdaten</Typography></li>
                    <li><Typography variant="body1" className="blur-text">🌱 Relevante Nachhaltigkeits- und ESG-Trends</Typography></li>
                    <li><Typography variant="body1" className="blur-text">🔗 Transparenz in globalen Lieferketten</Typography></li>
                </ul>
                <Typography variant="body2" color="text.disabled" sx={{ mt: 3 }}>
                    ...und vieles mehr – exklusiv für registrierte Nutzer.
                </Typography>
            </Box>

            <Typography variant="caption" color="text.secondary" sx={{ mt: 8, display: 'block' }}>
                &copy; 2025 Fleet KI-Dashboard. Alle Rechte vorbehalten.
            </Typography>
        </Container>
    );
};

export default LandingPage;