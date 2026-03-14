// frontend/src/pages/PublicPortalPageB.tsx
import React, { useEffect, useState, useMemo } from 'react'; // useMemo hinzugefügt
import { useSearchParams } from 'react-router-dom';
import { 
    Box, Grid, Typography, Paper, Stack, 
    Divider, Chip, useTheme, ThemeProvider, createTheme // createTheme hinzugefügt
} from '@mui/material';
import apiClient from '../apiClient';
import LoginForm from '../components/LoginForm';

// Widgets (im Public-Modus)
import BusinessPartnerInfoWidget from '../components/widgets/BusinessPartnerInfoWidget';
import EVStationWidget from '../components/widgets/EVStationWidget';
import CommodityPricesWidget from '../components/widgets/CommodityPricesWidget';
import SentimentWidget from '../components/widgets/SentimentWidget';
import VideoWidget from '../components/widgets/VideoWidget'; // ✅ Import hinzufügen

// Icons
import LockIcon from '@mui/icons-material/Lock';
import HubIcon from '@mui/icons-material/Hub';
import InsightsIcon from '@mui/icons-material/Insights';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary'; // Passendes Icon

const PublicPortalPageB: React.FC = () => {
    const [searchParams] = useSearchParams();
    const partnerCode = searchParams.get('partner') || '';
    const [publicContext, setPublicContext] = useState<any>(null);
    const theme = useTheme();

    // 1. Daten & Branding laden
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

    // Fix: partnerTheme Definition hinzufügen
    const partnerTheme = useMemo(() => createTheme({
        ...theme,
        palette: {
            ...theme.palette,
            primary: { main: primaryColor },
        },
        components: {
            MuiTextField: {
                styleOverrides: {
                    root: {
                        '& .MuiOutlinedInput-root': {
                            borderRadius: '12px',
                            height: '58px', // Höhere Felder
                        }
                    }
                }
            },
            MuiButton: {
                styleOverrides: {
                    root: {
                        borderRadius: '12px',
                        height: '58px',
                        fontWeight: 'bold',
                        textTransform: 'none'
                    }
                }
            }
        }
    }), [primaryColor, theme]);

    return (
        <Box sx={{ 
            display: 'flex', 
            minHeight: '100vh', 
            bgcolor: '#f8fafc', // Helles Slate-Grau für modernen Dashboard-Look
            overflow: 'hidden' 
        }}>
            
            {/* --- LINKER BEREICH: DAS "LIVE" DASHBOARD (Nicht interaktiv) --- */}
            <Box sx={{ 
                flexGrow: 1, 
                p: 3, 
                position: 'relative',
                filter: 'grayscale(20%)', // Leicht entsättigt für den "Vorschau"-Effekt
                opacity: 0.9,
                pointerEvents: 'none', // Verhindert Interaktion mit den Widgets
                userSelect: 'none'
            }}>
                {/* Dashboard Header Preview */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                    <Box>
                        <Typography variant="h5" fontWeight="800" color="text.primary">
                            {dashboardTitle}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Live-Analyse & Monitoring Status: <span style={{ color: '#10b981', fontWeight: 'bold' }}>Aktiv</span>
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                        <Chip icon={<HubIcon />} label="API verbunden" variant="outlined" size="small" />
                        <Chip icon={<InsightsIcon />} label="KI-Modell v3.5" variant="outlined" size="small" />
                    </Stack>
                </Stack>

                {/* Widget Grid Simulation */}
                <Grid container spacing={3}>
                    <Grid item xs={12} md={8}>
                        <EVStationWidget 
                            isPublic={true} 
                            widgetId="demo-ev" 
                            widgetTypeKey="ev-map" 
                            title="Netzwerkauslastung Wien & Umland" 
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <SentimentWidget 
                            isPublic={true} 
                            widgetId="demo-sent" 
                            widgetTypeKey="sentiment" 
                            title="Marktstimmung" 
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <CommodityPricesWidget 
                            isPublic={true} 
                            widgetId="demo-com" 
                            widgetTypeKey="com-prices" 
                            title="Energiepreise (E-Control)" 
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <BusinessPartnerInfoWidget 
                            isPublic={true} 
                            widgetId="demo-bp" 
                            widgetTypeKey="bp-info" 
                            title="Mandanten-Portfolio Übersicht" 
                            businessPartner={null} 
                            publicData={{ partner: partner, news: publicContext?.newsPreview || [] }}
                        />
                    </Grid>
                        <Grid item xs={12} md={4}>
                        <VideoWidget 
                            isPublic={true}
                            widgetId="demo-video"
                            widgetTypeKey="video-hub"
                            category="Tutorials"
                            title="Video-Academy"
                            icon={<VideoLibraryIcon sx={{ color: primaryColor }} />}
                        />
                    </Grid>
                </Grid>

                {/* Overlay-Hinweis: "Vorschau-Modus" */}
                <Box sx={{ 
                    position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)',
                    bgcolor: 'rgba(15, 23, 42, 0.8)', color: 'white', px: 3, py: 1, 
                    borderRadius: 10, backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,0.2)'
                }}>
                    <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LockIcon sx={{ fontSize: 14 }} /> Sie befinden sich im Vorschau-Modus für <strong>{partner?.name || 'Mandanten'}</strong>
                    </Typography>
                </Box>
            </Box>

            {/* --- RECHTER BEREICH: DIE LOGIN SIDEBAR --- */}
{/* --- RECHTER BEREICH: DIE LOGIN SIDEBAR --- */}
<Paper 
    elevation={0} 
    sx={{ 
        width: 600, 
        borderRadius: 0, 
        zIndex: 10, 
        display: 'flex', 
        flexDirection: 'column',
        borderLeft: '1px solid rgba(0,0,0,0.08)', 
        bgcolor: 'white' 
    }}
>
    {/* Branding-Bereich (Logo & Name) */}
<Box sx={{ p: 6, pt: 8, pb: 3, textAlign: 'center' }}>
    <Box
        sx={{
            height: 80,
            maxWidth: '100%',
            mx: 'auto',
            mb: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'white',
            p: 1.5,
            borderRadius: '16px', // Modernere Abrundung
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            border: '1px solid rgba(0,0,0,0.05)',
            overflow: 'hidden'
        }}
    >
        <Box
            component="img"
            src={logoUrl}
            alt={partner?.name || 'Logo'}
            sx={{
                maxHeight: '100%',
                maxWidth: '100%',
                objectFit: 'contain', // Verhindert Abschneiden bei Rechtecken
                width: 'auto',
                height: 'auto',
                display: 'block'
            }}
        />
    </Box>
    <Typography variant="h5" fontWeight="900" sx={{ letterSpacing: -0.8, color: '#1e293b' }}>
        {partner?.name || 'mobiliti.at'}
    </Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Mitglieder Zugang
    </Typography>
</Box>

    <Divider sx={{ mx: 4, opacity: 0.6 }} />

    {/* Login-Formular Bereich: Hochgesetzt und mit Partner-Farben */}
    <ThemeProvider theme={partnerTheme}>
        <Box sx={{ 
            p: 6, 
            pt: 4, // Kleinerer Abstand oben, um das Formular hochzuziehen
            flexGrow: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'flex-start', // Zieht den Inhalt nach oben statt zentriert
            gap: 2
        }}>
            <LoginForm isRegister={false} />
            
            {/* Optional: Ein dezenter Link unter dem Login */}
            <Typography variant="caption" textAlign="center" sx={{ mt: 2, color: 'text.disabled' }}>
                Ihre Daten werden sicher nach SOC2-Standard verarbeitet.
            </Typography>
        </Box>
    </ThemeProvider>

    {/* Footer der Sidebar */}
    <Box sx={{ p: 4, textAlign: 'center', bgcolor: '#f8fafc' }}>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
            Exklusiv für autorisierte Mandanten von <br />
            <strong style={{ color: '#1e293b' }}>{partner?.name || 'mobiliti.at'}</strong>
        </Typography>
    </Box>
</Paper>

{/* CSS für Partner-Fokus-Effekte */}
<style>{`
    .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline {
        border-color: ${primaryColor} !important;
        border-width: 2px;
    }
    .MuiInputLabel-root.Mui-focused {
        color: ${primaryColor} !important;
    }
`}</style>
        </Box>
    );
};

export default PublicPortalPageB;