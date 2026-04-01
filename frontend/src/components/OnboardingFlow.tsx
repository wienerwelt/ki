import { useState, useEffect } from 'react';
import { 
    Dialog, Box, Stepper, Step, StepLabel, Button, Typography, 
    TextField, Chip, Switch, FormControlLabel, Grid, Card, CardContent, Checkbox, 
    CircularProgress, useTheme, Stack, Divider, alpha 
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import StarIcon from '@mui/icons-material/Star';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import DashboardCustomizeOutlinedIcon from '@mui/icons-material/DashboardCustomizeOutlined';

// --- NEU: Icon Imports für die Widgets ---
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import EuroOutlinedIcon from '@mui/icons-material/EuroOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import ElectricCarOutlinedIcon from '@mui/icons-material/ElectricCarOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import InsertChartOutlinedIcon from '@mui/icons-material/InsertChartOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';

import apiClient from '../apiClient';
import { useAuth } from '../context/AuthContext';

const steps = ['Profil', 'Ihre Themen', 'Newsletter', 'Dashboard'];

// --- NEU: Icon Mapper ---
const getWidgetIcon = (iconName?: string) => {
    switch(iconName?.toLowerCase()) {
        case 'news': return <ArticleOutlinedIcon />;
        case 'calendar': return <CalendarMonthOutlinedIcon />;
        case 'finance': return <EuroOutlinedIcon />;
        case 'legal': return <GavelOutlinedIcon />;
        case 'map': return <MapOutlinedIcon />;
        case 'ev': return <ElectricCarOutlinedIcon />;
        case 'marketing': return <CampaignOutlinedIcon />;
        case 'chart': return <InsertChartOutlinedIcon />;
        case 'files': return <FolderOpenOutlinedIcon />;
        default: return <DashboardCustomizeOutlinedIcon />; // Fallback
    }
};

export default function OnboardingFlow({ open, onComplete }: { open: boolean, onComplete: () => void }) {
    const theme = useTheme();
    const { user, businessPartner, updateUser } = useAuth();
    const [activeStep, setActiveStep] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Form States
    const [firstName, setFirstName] = useState(user?.first_name || '');
    const [lastName, setLastName] = useState(user?.last_name || '');
    const [organizationName, setOrganizationName] = useState((user as any)?.organization_name || '');
    
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [optIn, setOptIn] = useState(true);
    const [selectedWidgets, setSelectedWidgets] = useState<string[]>([]);

    // API Data
    const [topTags, setTopTags] = useState<string[]>([]);
    const [availableWidgets, setAvailableWidgets] = useState<any[]>([]);
    const [topWidgetKeys, setTopWidgetKeys] = useState<string[]>([]);

useEffect(() => {
        if (open) {
            apiClient.get('/api/onboarding/data')
                .then(res => {
                    setTopTags(res.data.topTags);
                    setAvailableWidgets(res.data.availableWidgets);
                    setTopWidgetKeys(res.data.topWidgetKeys);
                    setSelectedWidgets(res.data.topWidgetKeys || []);
                    
                    setLoading(false);
                })
                .catch(err => {
                    console.error("Onboarding Ladefehler:", err);
                    setLoading(false);
                });
        }
    }, [open]);

    const handleNext = () => {
        if (activeStep === steps.length - 1) {
            handleComplete();
        } else {
            setActiveStep(prev => prev + 1);
        }
    };

    const handleBack = () => setActiveStep(prev => prev - 1);

    const handleTagToggle = (tag: string) => {
        setSelectedTags(prev => 
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    const handleSelectAllTags = () => setSelectedTags([...topTags]);
    const handleDeselectAllTags = () => setSelectedTags([]);

    const handleWidgetToggle = (typeKey: string) => {
        setSelectedWidgets(prev => 
            prev.includes(typeKey) ? prev.filter(k => k !== typeKey) : [...prev, typeKey]
        );
    };

    const handleSelectAllWidgets = () => setSelectedWidgets(availableWidgets.map(w => w.type_key));
    const handleDeselectAllWidgets = () => setSelectedWidgets([]);

    const handleComplete = async () => {
        setSaving(true);
        try {
            await apiClient.post('/api/onboarding/complete', {
                first_name: firstName,
                last_name: lastName,
                organization_name: organizationName,
                tags: selectedTags,
                newsletter_opt_in: optIn,
                selected_widget_keys: selectedWidgets
            });
            
            updateUser({ 
                has_completed_onboarding: true, 
                first_name: firstName, 
                last_name: lastName,
                organization_name: organizationName 
            } as any);
            
            onComplete();
        } catch (e) {
            console.error("Fehler beim Speichern des Onboardings:", e);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return null;

    // Widgets aufteilen für die Top-Anzeige
    const top3Widgets = availableWidgets.filter(w => topWidgetKeys.includes(w.type_key));
    const otherWidgets = availableWidgets.filter(w => !topWidgetKeys.includes(w.type_key));

    return (
        <Dialog 
            fullScreen 
            open={open} 
            PaperProps={{ sx: { bgcolor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)' } }}
        >
            <Box sx={{ maxWidth: 800, mx: 'auto', mt: { xs: 4, md: 8 }, p: 3, width: '100%', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                
                {/* HEADER */}
                <Box sx={{ textAlign: 'center', mb: 6, animation: 'fadeInDown 0.6s ease-out' }}>
                    {businessPartner?.logo_url ? (
                        <img src={businessPartner.logo_url} alt="Logo" style={{ maxHeight: 60, marginBottom: 24, borderRadius: 8 }} />
                    ) : (
                        <DashboardCustomizeOutlinedIcon color="primary" sx={{ fontSize: 60, mb: 2 }} />
                    )}
                    <Typography variant="h3" fontWeight="800" gutterBottom color="text.primary">
                        Willkommen bei {businessPartner?.name || 'werthaus'}
                    </Typography>
                    <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 400 }}>
                        Richten wir Ihr Dashboard perfekt auf Sie aus.
                    </Typography>
                </Box>

                <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 6, '& .MuiStepLabel-label': { fontSize: '1rem', fontWeight: 500, mt: 1 } }}>
                    {steps.map((label) => (
                        <Step key={label}><StepLabel>{label}</StepLabel></Step>
                    ))}
                </Stepper>

                {/* CONTENT AREA */}
                <Box sx={{ flexGrow: 1 }}>
                    
                    {/* --- SCHRITT 1: PROFIL --- */}
                    {activeStep === 0 && (
                        <Box sx={{ animation: 'fadeIn 0.4s' }}>
                            <Typography variant="h5" mb={4} fontWeight="800" color="text.primary" textAlign="center">
                                Persönliche Angaben
                            </Typography>
                            <Grid container spacing={3} sx={{ maxWidth: 600, mx: 'auto' }}>
                                <Grid item xs={12} sm={6}>
                                    <TextField 
                                        fullWidth label="Vorname" variant="outlined"
                                        value={firstName} onChange={e => setFirstName(e.target.value)} 
                                        InputProps={{ sx: { borderRadius: 2 } }}
                                    />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <TextField 
                                        fullWidth label="Nachname" variant="outlined"
                                        value={lastName} onChange={e => setLastName(e.target.value)} 
                                        InputProps={{ sx: { borderRadius: 2 } }}
                                    />
                                </Grid>
                                <Grid item xs={12}>
                                    <TextField 
                                        fullWidth 
                                        label="Organisation / Unternehmen" 
                                        value={organizationName} 
                                        onChange={e => setOrganizationName(e.target.value)}
                                        placeholder="Name Ihrer Firma"
                                        InputProps={{ sx: { borderRadius: 2 } }}
                                    />
                                </Grid>
                            </Grid>
                        </Box>
                    )}

                    {/* --- SCHRITT 2: THEMEN --- */}
                    {activeStep === 1 && (
                        <Box sx={{ animation: 'fadeIn 0.4s' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                                <Typography variant="h5" fontWeight="800">Ihre Themen</Typography>
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Button size="small" onClick={handleSelectAllTags} sx={{ textTransform: 'none', fontWeight: 600 }}>Alle an</Button>
                                    <Divider orientation="vertical" flexItem sx={{ height: 16, alignSelf: 'center' }} />
                                    <Button size="small" color="inherit" onClick={handleDeselectAllTags} sx={{ textTransform: 'none' }}>Alle aus</Button>
                                </Stack>
                            </Box>
                            <Typography variant="body1" color="text.secondary" mb={4}>
                                Wählen Sie Themen, die Sie besonders interessieren, um maßgeschneiderte Inhalte zu erhalten.
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                                {topTags.map(tag => {
                                    const isSelected = selectedTags.includes(tag);
                                    return (
                                        <Chip 
                                            key={tag} 
                                            label={tag} 
                                            onClick={() => handleTagToggle(tag)}
                                            color={isSelected ? 'primary' : 'default'}
                                            variant={isSelected ? 'filled' : 'outlined'}
                                            icon={isSelected ? <CheckCircleIcon /> : undefined}
                                            sx={{ 
                                                py: 2.5, 
                                                px: 1, 
                                                fontSize: '1rem', 
                                                fontWeight: isSelected ? 600 : 400,
                                                borderRadius: 3,
                                                transition: 'all 0.2s',
                                                '&:hover': { transform: 'translateY(-2px)', boxShadow: theme.shadows[2] }
                                            }}
                                        />
                                    );
                                })}
                            </Box>
                        </Box>
                    )}

                    {/* --- SCHRITT 3: NEWSLETTER --- */}
                    {activeStep === 2 && (
                        <Box sx={{ animation: 'fadeIn 0.4s', textAlign: 'center', py: 4, maxWidth: 500, mx: 'auto' }}>
                            <Card 
                                variant="outlined" 
                                sx={{ 
                                    borderRadius: 4, 
                                    bgcolor: alpha(theme.palette.primary.main, 0.03), 
                                    borderColor: alpha(theme.palette.primary.main, 0.2),
                                    p: { xs: 3, md: 5 } 
                                }}
                            >
                                <EmailOutlinedIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2, opacity: 0.8 }} />
                                <Typography variant="h4" fontWeight="800" mb={2}>Das Mobilitäts-Briefing</Typography>
                                <Typography variant="body1" color="text.secondary" mb={5} sx={{ lineHeight: 1.6 }}>
                                    Verpassen Sie keine wichtigen Entwicklungen. Wir senden Ihnen die relevantesten Branchen-News und regulatorischen Updates direkt in Ihr Postfach.
                                </Typography>
                                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                                    <FormControlLabel
                                        control={<Switch checked={optIn} onChange={(e) => setOptIn(e.target.checked)} color="primary" sx={{ transform: 'scale(1.3)', mr: 1 }} />}
                                        label={<Typography variant="h6" fontWeight="600">Newsletter abonnieren</Typography>}
                                    />
                                </Box>
                            </Card>
                        </Box>
                    )}

                    {/* --- SCHRITT 4: DASHBOARD WIDGETS --- */}
                    {activeStep === 3 && (
                        <Box sx={{ animation: 'fadeIn 0.4s' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 4 }}>
                                <Box>
                                    <Typography variant="h5" fontWeight="800" gutterBottom>Ihr Cockpit-Setup</Typography>
                                    <Typography variant="body1" color="text.secondary">Wählen Sie die Kacheln für Ihre Startseite.</Typography>
                                </Box>
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Button size="small" onClick={handleSelectAllWidgets} sx={{ textTransform: 'none', fontWeight: 600 }}>Alle an</Button>
                                    <Divider orientation="vertical" flexItem sx={{ height: 16, alignSelf: 'center' }} />
                                    <Button size="small" color="inherit" onClick={handleDeselectAllWidgets} sx={{ textTransform: 'none' }}>Alle aus</Button>
                                </Stack>
                            </Box>

                            {/* Top Widgets */}
                            {top3Widgets.length > 0 && (
                                <Box mb={5} p={3} sx={{ bgcolor: alpha(theme.palette.warning.main, 0.05), borderRadius: 4, border: `1px solid ${alpha(theme.palette.warning.main, 0.2)}` }}>
                                    <Typography variant="subtitle1" sx={{ color: 'warning.dark', display: 'flex', alignItems: 'center', gap: 1, mb: 3, fontWeight: 700 }}>
                                        <StarIcon fontSize="small" /> Beliebt bei {businessPartner?.name || 'Mitgliedern'}:
                                    </Typography>
                                    <Grid container spacing={2}>
                                        {top3Widgets.map(widget => {
                                            const isSelected = selectedWidgets.includes(widget.type_key);
                                            return (
                                                <Grid item xs={12} sm={4} key={widget.type_key}>
                                                    <Card 
                                                        variant="outlined" 
                                                        sx={{ 
                                                            cursor: 'pointer', 
                                                            height: '100%',
                                                            borderRadius: 3,
                                                            transition: 'all 0.2s ease-in-out',
                                                            borderColor: isSelected ? 'primary.main' : 'divider',
                                                            bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.08) : 'background.paper',
                                                            '&:hover': { transform: 'translateY(-2px)', boxShadow: theme.shadows[2], borderColor: 'primary.main' }
                                                        }}
                                                        onClick={() => handleWidgetToggle(widget.type_key)}
                                                    >
                                                        <CardContent sx={{ p: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: '20px !important' }}>
                                                            {/* NEU: Icon Integration */}
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                                <Box sx={{ display: 'flex', color: isSelected ? 'primary.main' : 'text.secondary', opacity: isSelected ? 1 : 0.7 }}>
                                                                    {getWidgetIcon(widget.icon_name)}
                                                                </Box>
                                                                <Typography variant="subtitle1" fontWeight="700" sx={{ color: isSelected ? 'primary.main' : 'text.primary' }}>
                                                                    {widget.name}
                                                                </Typography>
                                                            </Box>
                                                            <Checkbox checked={isSelected} color="primary" sx={{ p: 0 }} />
                                                        </CardContent>
                                                    </Card>
                                                </Grid>
                                            );
                                        })}
                                    </Grid>
                                </Box>
                            )}

                            <Typography variant="subtitle1" mb={3} fontWeight="800">Weitere Kacheln:</Typography>
                            <Grid container spacing={2}>
                                {otherWidgets.map(widget => {
                                    const isSelected = selectedWidgets.includes(widget.type_key);
                                    return (
                                        <Grid item xs={12} sm={6} key={widget.type_key}>
                                            <Card 
                                                variant="outlined" 
                                                sx={{ 
                                                    cursor: 'pointer',
                                                    height: '100%',
                                                    borderRadius: 3,
                                                    transition: 'all 0.2s ease-in-out',
                                                    borderColor: isSelected ? 'primary.main' : 'divider',
                                                    bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
                                                    '&:hover': { transform: 'translateY(-2px)', boxShadow: theme.shadows[1], borderColor: 'primary.main' }
                                                }}
                                                onClick={() => handleWidgetToggle(widget.type_key)}
                                            >
                                                <CardContent sx={{ p: 2.5, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, pb: '20px !important' }}>
                                                    {/* NEU: Icon Integration */}
                                                    <Box sx={{ display: 'flex', gap: 2, flexGrow: 1 }}>
                                                        <Box sx={{ display: 'flex', color: isSelected ? 'primary.main' : 'text.secondary', mt: 0.5, opacity: isSelected ? 1 : 0.7 }}>
                                                            {getWidgetIcon(widget.icon_name)}
                                                        </Box>
                                                        <Box>
                                                            <Typography variant="subtitle1" fontWeight="700" gutterBottom sx={{ color: isSelected ? 'primary.main' : 'text.primary' }}>
                                                                {widget.name}
                                                            </Typography>
                                                            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                                                                {widget.description}
                                                            </Typography>
                                                        </Box>
                                                    </Box>
                                                    <Checkbox checked={isSelected} color="primary" sx={{ p: 0, mt: -0.5 }} />
                                                </CardContent>
                                            </Card>
                                        </Grid>
                                    );
                                })}
                            </Grid>
                        </Box>
                    )}
                </Box>

                {/* NAVIGATION FOOTER */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 6, pt: 3, pb: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
                    <Button 
                        disabled={activeStep === 0 || saving} 
                        onClick={handleBack} 
                        size="large" 
                        sx={{ fontSize: '1.1rem', px: 3, textTransform: 'none', fontWeight: 600, color: 'text.secondary' }}
                    >
                        Zurück
                    </Button>
                    <Button 
                        variant="contained" 
                        onClick={handleNext} 
                        disabled={saving} 
                        size="large" 
                        sx={{ fontSize: '1.1rem', px: 6, borderRadius: 8, textTransform: 'none', fontWeight: 700, boxShadow: theme.shadows[4] }}
                    >
                        {saving ? <CircularProgress size={28} color="inherit" /> : (activeStep === steps.length - 1 ? 'Dashboard starten' : 'Weiter')}
                    </Button>
                </Box>
                
            </Box>
        </Dialog>
    );
}