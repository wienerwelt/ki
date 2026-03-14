import React, { useEffect, useState } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom'; 
import { Box, Container, Paper, Typography, Grid, useTheme, Fade, Tooltip } from '@mui/material';
import LoginForm from '../components/LoginForm'; 
import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';

// Widgets für den Hintergrund
import BusinessPartnerInfoWidget from '../components/widgets/BusinessPartnerInfoWidget';
import EVStationWidget from '../components/widgets/EVStationWidget';
import CommodityPricesWidget from '../components/widgets/CommodityPricesWidget';
import SentimentWidget from '../components/widgets/SentimentWidget';

// Icons für die Trusted Badges (Falls Bilder fehlen, als Fallback)
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';

interface PublicPortalPageProps {
    isRegister?: boolean;
}

const PublicPortalPageA: React.FC<PublicPortalPageProps> = ({ isRegister = false }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const partnerCode = searchParams.get('partner');
    const [publicContext, setPublicContext] = useState<any>(null);
    const theme = useTheme();
    const location = useLocation();
    const navigate = useNavigate();
    const { showSnackbar } = useSnackbar();

useEffect(() => {
        // Fall 1: E-Mail erfolgreich verifiziert (kommt vom Backend Redirect)
        if (searchParams.get('verified') === '1') {
            showSnackbar('E-Mail erfolgreich bestätigt! Sie können sich nun anmelden.', 'success');
            
            // Parameter aus URL entfernen, damit die Meldung bei Refresh nicht nervt
            searchParams.delete('verified');
            setSearchParams(searchParams, { replace: true });
        }
        
        // Fall 2: Newsletter bestätigt
        if (searchParams.get('newsletter_confirmed') === '1') {
            showSnackbar('Newsletter-Anmeldung erfolgreich bestätigt!', 'success');
            searchParams.delete('newsletter_confirmed');
            setSearchParams(searchParams, { replace: true });
        }
    }, [searchParams, setSearchParams, showSnackbar]);    

    // --- TICKER LOGIC ---
    const [tickerIndex, setTickerIndex] = useState(0);
    
    // Dynamische Nachrichten für den Ticker
    const tickerMessages = [
        `${publicContext?.pulse?.active_users || 12} Nutzer online`,
        "Aktuelle Kraftstoffpreise geladen",
        "KI-Analysen für heute verfügbar",
        "Live-Status: E-Ladestationen aktualisiert"
    ];

    useEffect(() => {
        // Prüfen, ob wir mit einer Nachricht (vom Logout) hierher geleitet wurden
        if (location.state?.snackbarMessage) {
            showSnackbar(location.state.snackbarMessage, location.state.severity || 'success');
            
            // State bereinigen, damit die Meldung bei Refresh nicht nochmal kommt
            navigate(location.pathname + location.search, { replace: true, state: {} });
        }
    }, [location, showSnackbar, navigate]);    

    useEffect(() => {
        const interval = setInterval(() => {
            setTickerIndex((prev) => (prev + 1) % tickerMessages.length);
        }, 4000); // Wechsel alle 4 Sekunden
        return () => clearInterval(interval);
    }, [tickerMessages.length]);

    // --- DATA FETCHING ---
    useEffect(() => {
        const fetchPublicData = async () => {
            try {
                const code = partnerCode || ''; 
                const res = await apiClient.get(`/api/public/context?partnerCode=${code}`);
                setPublicContext(res.data);
            } catch (e) {
                console.error("Public context load failed", e);
            }
        };
        fetchPublicData();
    }, [partnerCode]);

    // --- BRANDING LOGIC ---
    const hasPartner = !!publicContext?.partner;
    const logoUrl = publicContext?.partner?.logo_url || '/logos/de-mobiliti.png';
    
    const platformName = hasPartner 
        ? (publicContext.partner.dashboard_title || `${publicContext.partner.name} Dashboard`)
        : 'KI-Dashboard';

    const actionText = isRegister ? 'Registrieren' : 'Anmelden';

    const widgetBranding = publicContext?.partner || {
        name: 'Mobiliti',
        logo_url: logoUrl,
        dashboard_title: 'Smart KI-Dashboard'
    };

    // --- TRUSTED PARTNERS CONFIG (Zufallsauswahl) ---
    // Wir nutzen useState mit einer Initializer-Funktion, damit der Zufall nur einmal beim Laden passiert
    // und nicht bei jedem Re-Render springt.
    const [trustedPartners] = useState(() => {
        const allPartners = [
            { name: 'E-Control', src: '/logos/at-econtrol.png' },
            { name: 'iusbote', src: '/logos/at-iusbote.png' }, 
            { name: 'Bundesverband Betriebliche Mobilität', src: '/logos/de-bbm.png' },         
            { name: 'OpenChargeMap', src: '/logos/eu-openchargemap.png' },
            { name: 'Tankerkönig', src: '/logos/de-tankerkoenig.png' },
            { name: 'Heise Consulting', src: '/logos/at-heise.png' },
            { name: 'Europäische Zentralbank', src: '/logos/eu-ecb.png' }
        ];
        
        // Zufällig mischen und die ersten 4 nehmen
        return allPartners
            .sort(() => 0.5 - Math.random())
            .slice(0, 4);
    });

    return (
        <Box sx={{ 
            position: 'relative', 
            minHeight: '100vh', 
            overflow: 'hidden',
            bgcolor: 'background.default' 
        }}>
            
            {/* --- LAYER 1: GHOST DASHBOARD (Hintergrund) --- */}
            <Fade in={true} timeout={1500}>
                <Box sx={{ 
                    position: 'absolute', 
                    inset: 0,
                    zIndex: 0,
                    p: 2,
                    opacity: 0.6, 
                    filter: 'blur(4px) grayscale(20%)',
                    pointerEvents: 'none',
                    transform: 'scale(1.02)', 
                    transition: 'all 1s ease-in-out'
                }}>
                    <Grid container spacing={3}>
                        <Grid item xs={12} md={4} sx={{ display: { xs: 'none', md: 'block' } }}>
                            <Box sx={{ height: 400 }}>
                                <BusinessPartnerInfoWidget 
                                    isPublic={true} 
                                    widgetId="ghost-bp" widgetTypeKey="bp-info" title="Info"
                                    businessPartner={null}
                                    publicData={{ partner: widgetBranding, news: publicContext?.newsPreview || [] }}
                                />
                            </Box>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Box sx={{ height: 400 }}>
                                <EVStationWidget isPublic={true} widgetId="ghost-ev" widgetTypeKey="ev-map" title="Ladestationen" />
                            </Box>
                        </Grid>
                        <Grid item xs={12} md={4} sx={{ display: { xs: 'none', md: 'block' } }}>
                            <Box sx={{ height: 400 }}>
                                <SentimentWidget 
                                    isPublic={true} 
                                    widgetId="ghost-sentiment" 
                                    widgetTypeKey="sentiment" 
                                    title="Marktstimmung" 
                                />
                            </Box>
                        </Grid>                        
                        <Grid item xs={12} md={4} sx={{ display: { xs: 'none', md: 'block' } }}>
                            <Box sx={{ height: 400 }}>
                                <CommodityPricesWidget isPublic={true} widgetId="ghost-com" widgetTypeKey="com-prices" title="Markt" />
                            </Box>
                        </Grid>
                    </Grid>
                </Box>
            </Fade>

            {/* --- LAYER 2: GRADIENT OVERLAY --- */}
            <Box sx={{ 
                position: 'absolute', inset: 0, zIndex: 1, 
                background: theme.palette.mode === 'dark' 
                    ? 'linear-gradient(135deg, rgba(0,0,0,0.85) 0%, rgba(20,20,20,0.7) 100%)' 
                    : 'linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(240,245,255,0.5) 100%)'
            }} />

            {/* --- LAYER 3: VORDERGRUND INHALT --- */}
            <Container maxWidth="xs" sx={{ 
                position: 'relative', 
                zIndex: 2, 
                minHeight: '100vh', 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center',
                py: 4
            }}>
                
                {/* LOGIN CARD */}
                <Fade in={true} timeout={800}>
                    <Paper 
                        elevation={24} 
                        sx={{ 
                            p: { xs: 3, sm: 4 }, 
                            width: '100%', 
                            borderRadius: 5, 
                            backdropFilter: 'blur(20px)',
                            bgcolor: theme.palette.mode === 'dark' 
                                ? 'rgba(30,30,30,0.75)' 
                                : 'rgba(255,255,255,0.85)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            mb: 4 
                        }}
                    >
                        {/* HEADER */}
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3, width: '100%' }}>
                            {logoUrl && (
                                <img 
                                    src={logoUrl} 
                                    alt="Logo" 
                                    style={{ height: 55, width: 'auto', objectFit: 'contain', marginRight: 20 }} 
                                />
                            )}
                            <Box sx={{ textAlign: 'left' }}>
                                <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.2, fontWeight: 500 }}>
                                    {actionText}
                                </Typography>
                                <Typography variant="h6" fontWeight="bold" sx={{ lineHeight: 1.2, letterSpacing: '-0.5px' }}>
                                    {platformName}
                                </Typography>
                            </Box>
                        </Box>

                        {/* LIVE TICKER */}
                        <Box sx={{ 
                            mb: 2, display: 'flex', alignItems: 'center', gap: 1.5, 
                            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0, 0, 0, 0.04)', 
                            px: 2, py: 0.8, borderRadius: 10,
                            minWidth: 240, justifyContent: 'center' 
                        }}>
                            {/* Pulsierender Punkt */}
                            <Box sx={{ 
                                width: 8, height: 8, borderRadius: '50%', bgcolor: '#44b700', 
                                position: 'relative',
                                '&::after': {
                                    content: '""',
                                    position: 'absolute',
                                    top: 0, left: 0,
                                    width: '100%', height: '100%',
                                    borderRadius: '50%',
                                    animation: 'ripple 1.5s infinite ease-in-out',
                                    border: '1px solid #44b700',
                                },
                                '@keyframes ripple': {
                                    '0%': { transform: 'scale(0.8)', opacity: 1 },
                                    '100%': { transform: 'scale(2.4)', opacity: 0 },
                                }
                            }} />
                            
                            {/* Wechselnder Text */}
                            <Fade key={tickerIndex} in={true} timeout={500}>
                                <Typography variant="caption" fontWeight="600" color="text.secondary">
                                    {tickerMessages[tickerIndex]}
                                </Typography>
                            </Fade>
                        </Box>

                        <Box sx={{ width: '100%' }}>
                            <LoginForm isRegister={isRegister} /> 
                        </Box>
                    </Paper>
                </Fade>

                {/* TRUSTED DATA BADGES FOOTER */}
                <Box sx={{ 
                    mt: 'auto', 
                    textAlign: 'center',
                    opacity: 0.8,
                    width: '100%'
                }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block', fontWeight: 500, letterSpacing: 1, textTransform: 'uppercase' }}>
                        Verified Data Sources
                    </Typography>
                    <Box sx={{ 
                        display: 'flex', 
                        justifyContent: 'center', 
                        gap: 3, 
                        flexWrap: 'wrap',
                        filter: 'grayscale(100%)', 
                        opacity: 0.7,
                        transition: 'all 0.3s',
                        '&:hover': { filter: 'grayscale(0%)', opacity: 1 } 
                    }}>
                        {trustedPartners.map((partner) => (
                            <Tooltip key={partner.name} title={`Daten von ${partner.name}`}>
                                {/* Wir versuchen das Bild zu laden, Fallback ist Text/Icon */}
                                <Box 
                                    component="img"
                                    src={partner.src}
                                    alt={partner.name}
                                    onError={(e: any) => {
                                        e.target.style.display = 'none'; // Bild verstecken wenn nicht gefunden
                                        e.target.nextSibling.style.display = 'flex'; // Fallback anzeigen
                                    }}
                                    sx={{ height: 24, width: 'auto', objectFit: 'contain', cursor: 'help' }}
                                />
                            </Tooltip>
                        ))}
                        {/* Fallback Icon falls Bilder fehlen (wird durch onError gesteuert, hier nur als unsichtbares Element vorbereitet) */}
                        <Box sx={{ display: 'none', alignItems: 'center', gap: 0.5 }}>
                            <VerifiedUserIcon sx={{ fontSize: 16 }} />
                        </Box>
                    </Box>
                </Box>

            </Container>
        </Box>
    );
};

export default PublicPortalPageA;