import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { 
    Box, Grid, Typography, Paper, Stack, 
    Chip, useTheme, ThemeProvider, createTheme, Fade
} from '@mui/material';
import { alpha } from '@mui/material/styles';

import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';
import LoginForm from '../components/LoginForm';

// Icons 
import LockIcon from '@mui/icons-material/Lock';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';

// --- WIDGETS ---
import EVStationWidget from '../components/widgets/EVStationWidget';
import CommodityPricesWidget from '../components/widgets/CommodityPricesWidget';
import SentimentWidget from '../components/widgets/SentimentWidget';
import DailyCockpitWidget from '../components/widgets/DailyCockpitWidget'; 
import EventCalendarWidget from '../components/widgets/EventCalendarWidget';

interface PublicPortalPageProps {
    isRegister?: boolean;
}

const PublicPortalPage: React.FC<PublicPortalPageProps> = ({ isRegister = false }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const partnerCode = searchParams.get('partner') || '';
    const [publicContext, setPublicContext] = useState<any>(null);
    
    const theme = useTheme();
    const location = useLocation();
    const navigate = useNavigate();
    const { showSnackbar } = useSnackbar();

    // --- 1. DATEN & BRANDING LADEN ---
    useEffect(() => {
        const fetchBranding = async () => {
            try {
                const res = await apiClient.get(`/api/public/context?partnerCode=${partnerCode}`);
                setPublicContext(res.data);
            } catch (e) {
                console.error("Branding konnte nicht geladen werden", e);
            }
        };
        fetchBranding();
    }, [partnerCode]);

    const partner = publicContext?.partner;
    const primaryColor = partner?.primary_color || theme.palette.primary.main;
    const logoUrl = partner?.logo_url || '/logos/de-mobiliti.png';
    const dashboardTitle = partner?.dashboard_title || 'Smart KI-Dashboard';

    // --- 2. THEMES DEFINIEREN ---
    // Theme 1: Für das Login-Formular (Rechts) -> Hell, nutzt Partnerfarbe
    const loginTheme = useMemo(() => createTheme({
        ...theme,
        palette: {
            mode: 'light',
            primary: { main: primaryColor },
        },
        components: {
            MuiTextField: { styleOverrides: { root: { '& .MuiOutlinedInput-root': { borderRadius: '12px', height: '58px' } } } },
            MuiButton: { styleOverrides: { root: { borderRadius: '12px', height: '58px', fontWeight: 'bold', textTransform: 'none' } } }
        }
    }), [primaryColor, theme]);

    // Theme 2: Für das Glass Cockpit (Links) -> ZWINGEND DARK MODE
    const glassCockpitTheme = useMemo(() => createTheme({
        ...theme,
        palette: {
            mode: 'dark',
            primary: { main: primaryColor },
            background: { paper: 'rgba(15, 23, 42, 0.6)' }, // Halbtransparente Widget-Karten
        },
        components: {
            MuiPaper: {
                styleOverrides: {
                    root: {
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
                    }
                }
            }
        }
    }), [primaryColor, theme]);

    // --- 3. SNACKBAR LOGIK ---
    useEffect(() => {
        if (searchParams.get('verified') === '1') {
            showSnackbar('E-Mail erfolgreich bestätigt! Sie können sich nun anmelden.', 'success');
            searchParams.delete('verified');
            setSearchParams(searchParams, { replace: true });
        }
    }, [searchParams, setSearchParams, showSnackbar]);    

    useEffect(() => {
        if (location.state?.snackbarMessage) {
            showSnackbar(location.state.snackbarMessage, location.state.severity || 'success');
            navigate(location.pathname + location.search, { replace: true, state: {} });
        }
    }, [location, showSnackbar, navigate]);    

    // --- 4. LIVE TICKER (Animation Rechts) ---
    const [tickerIndex, setTickerIndex] = useState(0);
    const tickerMessages = [
        "Predictive Alerts aktiv",
        "KI-Sentiment Modell: Online",
        "Echtzeit-Standortdaten aktualisiert"
    ];

    useEffect(() => {
        const interval = setInterval(() => setTickerIndex((prev) => (prev + 1) % tickerMessages.length), 4000); 
        return () => clearInterval(interval);
    }, [tickerMessages.length]);

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#020617', overflow: 'hidden' }}>
            
            {/* ========================================================= */}
            {/* LINKER BEREICH: DAS "GLASS COCKPIT" (2/3 BREITE, DARK MODE) */}
            {/* ========================================================= */}
            <ThemeProvider theme={glassCockpitTheme}>
                <Box sx={{ 
                    display: { xs: 'none', md: 'flex' },
                    flex: 2, 
                    p: { md: 4, lg: 6 }, 
                    flexDirection: 'column',
                    position: 'relative',
                    userSelect: 'none',
                    overflowY: 'auto',
                    // Animierter, tiefer Glow im Hintergrund basierend auf der Partnerfarbe
                    background: `
                        radial-gradient(circle at 15% 50%, ${alpha(primaryColor, 0.15)}, transparent 40%),
                        radial-gradient(circle at 85% 10%, ${alpha(primaryColor, 0.1)}, transparent 30%),
                        #020617
                    `,
                }}>
                    
                    {/* --- COCKPIT HEADER --- */}
                    <Box sx={{ mb: 4 }}>
                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1.5 }}>
                            <Box sx={{ bgcolor: primaryColor, width: 10, height: 10, borderRadius: '50%', boxShadow: `0 0 12px ${primaryColor}` }} />
                            <Typography variant="overline" sx={{ color: alpha('#fff', 0.7), fontWeight: 800, letterSpacing: 2 }}>
                                {partner?.name || 'MOBILITI'} INTELLIGENCE CORE
                            </Typography>
                        </Stack>
                        <Typography variant="h2" sx={{ color: '#fff', fontWeight: 900, mb: 1, letterSpacing: -1, fontSize: { md: '2.5rem', lg: '3.5rem' } }}>
                            {dashboardTitle}
                        </Typography>
                        <Typography variant="h6" sx={{ color: alpha('#fff', 0.5), fontWeight: 400, maxWidth: '80%' }}>
                            Live-Geodaten, Branchen-Events, Markt-Sentiment und KI-Predictive Insights auf einen Blick.
                        </Typography>
                    </Box>

                    {/* --- WIDGET GRID SHOWCASE --- */}
                    <Grid container spacing={3} sx={{ position: 'relative', zIndex: 2 /* Verhindert Klicks im Mock-Modus */ }}>
                        
                        {/* LINKE SPALTE (Groß): EV Stationen & Kalender */}
                        <Grid item xs={12} lg={8}>
                            <Stack spacing={3} sx={{ height: '100%' }}>
                                <EVStationWidget 
                                    isPublic={true} 
                                    widgetId="demo-ev" 
                                    widgetTypeKey="EVStation" 
                                    title="Netzwerkauslastung & Infrastruktur" 
                                />
                                
                                <Box sx={{ flexGrow: 1 }}>
                                    <EventCalendarWidget 
                                        isPublic={true} 
                                        widgetId="demo-cal" 
                                        widgetTypeKey="EventCalendar" 
                                        category="fleet_events, industry_events, businesspartner_events"
                                        defaultRegion="AT"
                                        title="Branchen-Kalender (Live)" 
                                        isRemovable={false}
                                        onDelete={() => {}}
                                    />
                                </Box>
                            </Stack>
                        </Grid>
                        
                        {/* RECHTE SPALTE (Schmal): Sentiment & Preise */}
                        <Grid item xs={12} lg={4}>
                            <Stack spacing={3}>
                                <SentimentWidget 
                                    isPublic={true} // Nutzt jetzt /api/public/sentiment
                                    widgetId="demo-sent" 
                                    widgetTypeKey="sentiment_widget" 
                                    title="KI Markt-Barometer (Live)" 
                                />
                                <CommodityPricesWidget 
                                    isPublic={true} 
                                    widgetId="demo-com" 
                                    widgetTypeKey="CommodityPrices" 
                                    title="Indikatoren Echtzeit" 
                                />
                            </Stack>
                        </Grid>

                        {/* VOLLE BREITE UNTEN (Das KI Tages-Briefing) */}
                        <Grid item xs={12}>
                            <Box sx={{ position: 'relative' }}>
                                <Chip 
                                    icon={<AutoAwesomeIcon sx={{ color: '#000 !important' }} />} 
                                    label="AI Generating Insights" 
                                    size="small"
                                    sx={{ position: 'absolute', top: -12, right: 24, zIndex: 10, bgcolor: primaryColor, color: '#000', fontWeight: 'bold' }} 
                                />
                                <DailyCockpitWidget 
                                    isPublic={true} 
                                    widgetId="demo-briefing" 
                                    widgetTypeKey="daily_cockpit" 
                                    title="Tages-Cockpit (KI-Briefing)" 
                                />
                            </Box>
                        </Grid>
                    </Grid>

                    {/* --- FOOTER HINWEIS --- */}
                    <Box sx={{ mt: 'auto', pt: 4, display: 'flex', justifyContent: 'center', opacity: 0.6 }}>
                        <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LockIcon sx={{ fontSize: 14 }} /> Dashboard-Vorschau. Melden Sie sich an, um alle Funktionen freizuschalten.
                        </Typography>
                    </Box>
                </Box>
            </ThemeProvider>

            {/* ========================================================= */}
            {/* RECHTER BEREICH: DIE LOGIN SIDEBAR (1/3 BREITE, LIGHT MODE) */}
            {/* ========================================================= */}
            <Paper elevation={24} sx={{ 
                width: { xs: '100%', md: '33.33%' },
                minWidth: { md: '450px' }, 
                flex: 'none', 
                borderRadius: 0, 
                zIndex: 10, 
                display: 'flex', 
                flexDirection: 'column',
                bgcolor: '#ffffff',
                overflowY: 'auto' 
            }}>
                <Box sx={{ p: { xs: 4, md: 6 }, pt: { xs: 6, md: 8 }, pb: 3 }}>
                    
                    {/* Branding-Bereich */}
                    <Box sx={{ mb: 5, textAlign: 'center' }}>
                        <Box sx={{
                            height: 70, maxWidth: '100%', mx: 'auto', mb: 3, display: 'flex',
                            alignItems: 'center', justifyContent: 'center', p: 1
                        }}>
                            <Box component="img" src={logoUrl} alt={partner?.name || 'Logo'}
                                sx={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', width: 'auto', height: 'auto', display: 'block' }}
                            />
                        </Box>
                        <Typography variant="h4" fontWeight="900" sx={{ letterSpacing: -0.5, color: '#1e293b' }}>
                            {isRegister ? 'Konto erstellen' : 'Willkommen zurück'}
                        </Typography>
                        <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
                            Mitgliederbereich
                        </Typography>

                        {/* LIVE TICKER */}
                        <Box sx={{ 
                            mt: 3, display: 'flex', alignItems: 'center', gap: 1.5, 
                            bgcolor: alpha(primaryColor, 0.05), px: 2, py: 0.8, borderRadius: 10,
                            width: 'fit-content', mx: 'auto', border: `1px solid ${alpha(primaryColor, 0.1)}`
                        }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: primaryColor, animation: 'pulse 2s infinite' }} />
                            <Fade key={tickerIndex} in={true} timeout={500}>
                                <Typography variant="caption" fontWeight="bold" sx={{ color: primaryColor }}>
                                    {tickerMessages[tickerIndex]}
                                </Typography>
                            </Fade>
                        </Box>
                    </Box>

                    {/* Login-Formular Bereich nutzt das helle Partner-Theme */}
                    <ThemeProvider theme={loginTheme}>
                        <LoginForm isRegister={isRegister} />
                    </ThemeProvider>

                    {/* Features Liste unter dem Login */}
                    <Box sx={{ mt: 6, p: 3, bgcolor: '#f8fafc', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                        <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold', color: '#334155' }}>Was Sie im Dashboard erwartet:</Typography>
                        <Stack spacing={1.5}>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <VerifiedUserIcon sx={{ color: primaryColor, fontSize: 16 }} />
                                <Typography variant="caption" color="text.secondary">Verifizierte Branchenquellen (z.B. E-Control)</Typography>
                            </Stack>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <AutoAwesomeIcon sx={{ color: primaryColor, fontSize: 16 }} />
                                <Typography variant="caption" color="text.secondary">KI-generierte Markt-Insights</Typography>
                            </Stack>
                        </Stack>
                    </Box>

                </Box>
                
                <Box sx={{ mt: 'auto', p: 3, textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
                    <Typography variant="caption" color="text.disabled">
                        SSO verfügbar · DSGVO-ready · Enterprise Security
                    </Typography>
                </Box>
            </Paper>

            {/* CSS für Pulsieren und unsichtbare Scrollbars für cleanen Look */}
            <style>{`
                @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
                ::-webkit-scrollbar { width: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
                ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
            `}</style>
        </Box>
    );
};

export default PublicPortalPage;