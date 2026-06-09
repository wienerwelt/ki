import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
    Box, Typography, Container, Paper, Button, FormControl, InputLabel, Select, MenuItem,
    Grid, CircularProgress, Alert, TextField, Divider, Tabs, Tab, Link as MuiLink, Chip,
    ToggleButtonGroup, ToggleButton, Backdrop, IconButton
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DownloadIcon from '@mui/icons-material/Download';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ElectricCarIcon from '@mui/icons-material/ElectricCar';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import ImageIcon from '@mui/icons-material/Image';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import DeleteIcon from '@mui/icons-material/Delete';
import * as htmlToImage from 'html-to-image';

import apiClient from '../apiClient';
import DashboardLayout from '../components/DashboardLayout';
import { useSnackbar } from '../context/SnackbarContext';

// --- MOCK ARCHIV DATEN ---
const ARCHIVE_DATA: Record<string, Record<string, any[]>> = {
    'AT': {
        '2026': [
            { month: '2', fileName: 'AT_Statistik_Neuzulassungen_2026_02.ods', url: '#' },
            { month: '1', fileName: 'AT_Statistik_Neuzulassungen_2026_01.ods', url: '#' }
        ],
        '2025': [{ month: '12', fileName: 'AT_Statistik_Neuzulassungen_2025_12.ods', url: '#' }]
    },
    'DE': {
        '2026': [{ month: '3', fileName: 'KBA_Fahrzeugzulassungen_03_2026.csv', url: '#' }]
    }
};

const AdminSocialMediaGenerator: React.FC = () => {
    const { showSnackbar } = useSnackbar();
    
    const [country, setCountry] = useState('AT');
    const [year, setYear] = useState('2026');
    const [month, setMonth] = useState('2'); 
    
    const [graphicTheme, setGraphicTheme] = useState('standard');
    const [colorMode, setColorMode] = useState<'light' | 'dark'>('light');
    const [aspectRatio, setAspectRatio] = useState('1 / 1');
    const [activeTab, setActiveTab] = useState(0);
    
    const [isLoading, setIsLoading] = useState(false);
    const [isSavingImage, setIsSavingImage] = useState(false); 
    const [error, setError] = useState<string | null>(null);
    
    const [aiText, setAiText] = useState('');
    const [chartData, setChartData] = useState<any | null>(null);
    const [sourceFileUrl, setSourceFileUrl] = useState<string | null>(null);

    const [galleryFiles, setGalleryFiles] = useState<{ logos: any[], socialMedia: any[], grafiken: any[] }>({ logos: [], socialMedia: [], grafiken: [] });
    const [loadingGallery, setLoadingGallery] = useState(false);

    const graphicRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchGalleryFiles();
    }, []);

    useEffect(() => {
        const availableYears = Object.keys(ARCHIVE_DATA[country] || {}).sort((a, b) => parseInt(b) - parseInt(a));
        if (availableYears.length > 0 && !availableYears.includes(year)) setYear(availableYears[0]);
    }, [country]);

    useEffect(() => {
        const availableFiles = ARCHIVE_DATA[country]?.[year] || [];
        const availableMonths = availableFiles.map(f => f.month);
        if (availableMonths.length > 0 && !availableMonths.includes(month)) {
            const latestMonth = [...availableMonths].sort((a, b) => parseInt(b) - parseInt(a))[0];
            setMonth(latestMonth);
        }
    }, [country, year]);

    const fetchGalleryFiles = async () => {
        setLoadingGallery(true);
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.get('/api/admin/social-media/gallery-files', {
                headers: { 'x-auth-token': token }
            });
            setGalleryFiles(response.data);
        } catch (err) {
            console.error("Fehler beim Laden der Galerie:", err);
        } finally {
            setLoadingGallery(false);
        }
    };

    const handleGenerate = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.post('/api/admin/social-media/generate', 
                { country, year: parseInt(year), month: parseInt(month) },
                { headers: { 'x-auth-token': token } }
            );

            setAiText(response.data.text);
            setChartData(response.data.parsedData);
            setSourceFileUrl(response.data.sourceDownloadUrl || '#'); 
            showSnackbar('Inhalt erfolgreich generiert!', 'success');
        } catch (err: any) {
            console.error("Fehler bei Generierung:", err);
            setError(err.response?.data?.message || 'Fehler beim Abrufen der Daten.');
            showSnackbar(err.response?.data?.message || 'Fehler', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownloadImage = () => {
        if (!graphicRef.current) return;
        setIsSavingImage(true);

        setTimeout(async () => {
            try {
                const dataUrl = await htmlToImage.toPng(graphicRef.current!, { cacheBust: true, pixelRatio: 2 });
                
                // NEU: Dateiname an Basisdatei koppeln
                const activeFiles = ARCHIVE_DATA[country]?.[year] || [];
                const activeFile = activeFiles.find(f => f.month === month);
                // Wenn Basis-Datei gefunden, nimm den Namen (ohne .ods/.csv), ansonsten baue einen Fallback
                const baseName = activeFile ? activeFile.fileName.replace(/\.[^/.]+$/, "") : `${country}_Statistik_${year}_${month.padStart(2, '0')}`;
                const formatLabel = aspectRatio === '1 / 1' ? '1x1' : aspectRatio === '4 / 5' ? '4x5' : '16x9';
                
                // Der neue smarte Dateiname!
                const filename = `${baseName}_${formatLabel}.png`;

                const link = document.createElement('a');
                link.download = filename;
                link.href = dataUrl;
                link.click();

                const token = localStorage.getItem('jwt_token');
                await apiClient.post('/api/admin/social-media/save', 
                    { imageBase64: dataUrl, filename: filename },
                    { headers: { 'x-auth-token': token } }
                );

                fetchGalleryFiles();
                showSnackbar(`Grafik als ${filename} gespeichert!`, 'success');
            } catch (err) {
                console.error("Fehler beim Bilderstellung:", err);
                showSnackbar('Fehler beim Speichern der Grafik.', 'error');
            } finally {
                setIsSavingImage(false);
            }
        }, 300);
    };

    const handleDeleteFile = async (folder: string, filename: string) => {
        if (!window.confirm(`Möchten Sie die Datei "${filename}" wirklich unwiderruflich löschen?`)) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.delete(`/api/admin/social-media/gallery-files?folder=${folder}&filename=${filename}`, {
                headers: { 'x-auth-token': token }
            });
            showSnackbar('Datei erfolgreich gelöscht.', 'success');
            fetchGalleryFiles(); 
        } catch (err) {
            console.error('Fehler beim Löschen:', err);
            showSnackbar('Fehler beim Löschen der Datei.', 'error');
        }
    };

    const handleDownloadSource = () => {
        if (sourceFileUrl && sourceFileUrl !== '#') window.open(sourceFileUrl, '_blank');
        else showSnackbar('Download-Link für Rohdaten aktuell nicht bereitgestellt.', 'warning');
    };

    const handleCopyText = () => {
        navigator.clipboard.writeText(aiText);
        showSnackbar('Text in die Zwischenablage kopiert.', 'success');
    };

    const handleCopyUrl = (url: string) => {
        const fullUrl = getImageUrl(url);
        const finalUrl = fullUrl.startsWith('http') ? fullUrl : `${window.location.origin}${fullUrl}`;
        navigator.clipboard.writeText(finalUrl);
        showSnackbar('URL kopiert!', 'success');
    };

    const formatPercent = (rawStr: string) => {
        if (!rawStr || rawStr === 'n.v.') return { text: 'n.v.', isPositive: false };
        const val = parseFloat(rawStr.replace(',', '.'));
        if (isNaN(val)) return { text: '0,0%', isPositive: false };
        return { text: `${val > 0 ? '+' : ''}${val.toFixed(1).replace('.', ',')}%`, isPositive: val > 0 };
    };

    const getImageUrl = (url: string | null) => {
        if (!url) return '';
        if (url.startsWith('http')) return url;
        let baseUrl = import.meta.env.VITE_API_URL || '';
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
        let cleanUrl = url.startsWith('/') ? url : `/${url}`;
        if (cleanUrl.startsWith('/api/')) cleanUrl = cleanUrl.substring(4);
        const apiPrefix = baseUrl.endsWith('/api') ? '' : '/api';
        return `${baseUrl}${apiPrefix}${cleanUrl}`;
    };

    const getSmartLogoUrl = (slug: string) => {
        if (!slug) return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        const foundLogo = galleryFiles?.logos?.find(l => l.name.startsWith(`${slug}.`));
        if (foundLogo) return getImageUrl(`/api/logos/${foundLogo.name}`);
        return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    };

    const availableYears = useMemo(() => Object.keys(ARCHIVE_DATA[country] || {}).sort((a, b) => parseInt(b) - parseInt(a)), [country]);
    const availableMonths = useMemo(() => (ARCHIVE_DATA[country]?.[year] || []).map(f => f.month).sort((a, b) => parseInt(a) - parseInt(b)), [country, year]);

    // --- RENDERING DER GRAFIK ---
    const renderGraphic = () => {
        if (!chartData || !chartData.topMarken || chartData.topMarken.length === 0) return null;

        const displayMonth = country === 'AT' && month === '1' ? 'Jänner' : new Date(2000, parseInt(month) - 1).toLocaleString('de-DE', { month: 'long' });
        const topMarke = chartData.topMarken[0];
        const validTrends = chartData.topMarken.filter((m: any) => m.zulassungen > 100 && m.vergleichVorjahr !== 'n.v.').map((m: any) => ({ ...m, trendVal: parseFloat(String(m.vergleichVorjahr).replace(',', '.')) })).sort((a: any, b: any) => b.trendVal - a.trendVal);
        const topWinner = validTrends[0];
        const topLoser = validTrends[validTrends.length - 1];
        const topElektro = chartData.topElektro && chartData.topElektro.length > 0 ? chartData.topElektro[0] : null;

        const isDark = colorMode === 'dark';
        const uiColors = {
            bg: isDark ? '#0f172a' : '#ffffff',
            text: isDark ? '#f8fafc' : '#0f172a',
            textMuted: isDark ? '#cbd5e1' : '#64748b',
            cardBg: isDark ? 'rgba(30, 41, 59, 0.7)' : '#f8fafc',
            cardBorder: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e2e8f0',
            divider: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
            shadow: isDark ? 'inset 0 0 100px rgba(0,0,0,0.5)' : '0 10px 30px rgba(0,0,0,0.05)',
        };

        let bgStyle = graphicTheme === 'standard' 
            ? { bgcolor: uiColors.bg }
            : {
                backgroundImage: isDark 
                    ? `linear-gradient(to bottom, rgba(15, 23, 42, 0.85), rgba(15, 23, 42, 0.95)), url('${getImageUrl(`/api/grafiken/${graphicTheme}`)}')`
                    : `linear-gradient(to bottom, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0.95)), url('${getImageUrl(`/api/grafiken/${graphicTheme}`)}')`,
                backgroundSize: 'cover', backgroundPosition: 'center'
            };

        return (
            <Box 
                ref={graphicRef} 
                sx={{ 
                    width: '100%', maxWidth: '800px', aspectRatio: aspectRatio,
                    color: uiColors.text, p: 5, borderRadius: 3,
                    boxShadow: uiColors.shadow, fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
                    position: 'relative', overflow: 'hidden', ...bgStyle,
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                }}
            >
                {graphicTheme === 'standard' && (
                    <>
                        <Box sx={{ position: 'absolute', top: -100, left: -100, width: 300, height: 300, bgcolor: '#3b82f6', opacity: isDark ? 0.15 : 0.05, filter: 'blur(80px)', borderRadius: '50%' }} />
                        <Box sx={{ position: 'absolute', bottom: -100, right: -100, width: 300, height: 300, bgcolor: '#eab308', opacity: isDark ? 0.1 : 0.05, filter: 'blur(80px)', borderRadius: '50%' }} />
                    </>
                )}

                <Box sx={{ position: 'relative', zIndex: 1, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ textAlign: 'center', mb: 4 }}>
                        <Typography variant="h3" sx={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, textShadow: isDark ? '0 2px 10px rgba(0,0,0,0.5)' : 'none' }}>
                            Automarkt <Box component="span" sx={{ color: '#eab308' }}>{displayMonth} {year}</Box>
                        </Typography>
                        <Box sx={{ width: '60%', height: '2px', bgcolor: '#3b82f6', mx: 'auto', mt: 1, mb: 1, boxShadow: isDark ? '0 0 10px #3b82f6' : 'none' }} />
                        <Typography variant="h6" sx={{ fontWeight: 400, color: uiColors.textMuted }}>
                            {country === 'AT' ? 'Österreich' : 'Deutschland'} im Wandel
                        </Typography>
                    </Box>

                    <Grid container spacing={3} sx={{ mb: 4, flexGrow: 1, alignContent: 'center' }}>
                        <Grid item xs={6}>
                            <Paper sx={{ bgcolor: uiColors.cardBg, border: uiColors.cardBorder, borderRadius: 2, p: 3, height: '100%', backdropFilter: 'blur(10px)', boxShadow: isDark ? 'none' : '0 4px 6px rgba(0,0,0,0.05)' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, borderBottom: uiColors.divider, pb: 1 }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: uiColors.text }}>Marktführer</Typography>
                                    <EmojiEventsIcon sx={{ color: '#eab308' }} />
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Box sx={{ width: 60, height: 60, bgcolor: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1, border: '1px solid #e2e8f0', flexShrink: 0 }}>
                                        <img src={getSmartLogoUrl(topMarke?.logo_slug)} crossOrigin="anonymous" alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%' }} onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; }} />
                                    </Box>
                                    <Box>
                                        <Typography variant="h4" sx={{ fontWeight: 800 }}>{topMarke?.zulassungen.toLocaleString('de-DE')}</Typography>
                                        <Typography variant="body2" sx={{ color: uiColors.textMuted }}>Neuzulassungen</Typography>
                                        {topMarke && <Typography variant="subtitle2" sx={{ color: formatPercent(topMarke.vergleichVorjahr).isPositive ? '#16a34a' : '#ef4444', fontWeight: 'bold' }}>{formatPercent(topMarke.vergleichVorjahr).text} zum Vorjahr</Typography>}
                                    </Box>
                                </Box>
                            </Paper>
                        </Grid>
                        <Grid item xs={6}>
                            <Paper sx={{ bgcolor: uiColors.cardBg, border: uiColors.cardBorder, borderRadius: 2, p: 3, height: '100%', backdropFilter: 'blur(10px)', boxShadow: isDark ? 'none' : '0 4px 6px rgba(0,0,0,0.05)' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, borderBottom: uiColors.divider, pb: 1 }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: uiColors.text }}>Top E-Auto Marke</Typography>
                                    <ElectricCarIcon sx={{ color: '#16a34a' }} />
                                </Box>
                                {topElektro ? (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Box sx={{ width: 60, height: 60, bgcolor: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1, border: '1px solid #e2e8f0', flexShrink: 0 }}>
                                            <img src={getSmartLogoUrl(topElektro.logo_slug)} crossOrigin="anonymous" alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%' }} onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; }} />
                                        </Box>
                                        <Box>
                                            <Typography variant="h4" sx={{ fontWeight: 800 }}>{topElektro.zulassungen.toLocaleString('de-DE')}</Typography>
                                            <Typography variant="subtitle2" sx={{ color: formatPercent(topElektro.vergleichVorjahr).isPositive ? '#16a34a' : '#ef4444', fontWeight: 'bold' }}>{formatPercent(topElektro.vergleichVorjahr).text}</Typography>
                                        </Box>
                                    </Box>
                                ) : <Typography color="text.secondary">Keine Daten.</Typography>}
                            </Paper>
                        </Grid>
                        <Grid item xs={6}>
                            <Paper sx={{ bgcolor: uiColors.cardBg, border: uiColors.cardBorder, borderRadius: 2, p: 3, height: '100%', backdropFilter: 'blur(10px)', boxShadow: isDark ? 'none' : '0 4px 6px rgba(0,0,0,0.05)' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, borderBottom: uiColors.divider, pb: 1 }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: uiColors.text }}>Stärkstes Wachstum</Typography>
                                    <TrendingUpIcon sx={{ color: '#16a34a' }} />
                                </Box>
                                {topWinner && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Box sx={{ width: 60, height: 60, bgcolor: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1, border: '1px solid #e2e8f0', flexShrink: 0 }}>
                                            <img src={getSmartLogoUrl(topWinner.logo_slug)} crossOrigin="anonymous" alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%' }} onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; }} />
                                        </Box>
                                        <Box>
                                            <Typography variant="h3" sx={{ fontWeight: 900, color: '#16a34a' }}>{formatPercent(topWinner.vergleichVorjahr).text}</Typography>
                                            <Typography variant="body1" sx={{ fontWeight: 'bold' }}>{topWinner.name}</Typography>
                                        </Box>
                                    </Box>
                                )}
                            </Paper>
                        </Grid>
                        <Grid item xs={6}>
                            <Paper sx={{ bgcolor: uiColors.cardBg, border: uiColors.cardBorder, borderRadius: 2, p: 3, height: '100%', backdropFilter: 'blur(10px)', boxShadow: isDark ? 'none' : '0 4px 6px rgba(0,0,0,0.05)' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, borderBottom: uiColors.divider, pb: 1 }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: uiColors.text }}>Stärkster Rückgang</Typography>
                                    <TrendingDownIcon sx={{ color: '#ef4444' }} />
                                </Box>
                                {topLoser && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Box sx={{ width: 60, height: 60, bgcolor: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1, border: '1px solid #e2e8f0', flexShrink: 0 }}>
                                            <img src={getSmartLogoUrl(topLoser.logo_slug)} crossOrigin="anonymous" alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%' }} onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; }} />
                                        </Box>
                                        <Box>
                                            <Typography variant="h3" sx={{ fontWeight: 900, color: '#ef4444' }}>{formatPercent(topLoser.vergleichVorjahr).text}</Typography>
                                            <Typography variant="body1" sx={{ fontWeight: 'bold' }}>{topLoser.name}</Typography>
                                        </Box>
                                    </Box>
                                )}
                            </Paper>
                        </Grid>
                    </Grid>

                    <Box sx={{ mt: 'auto' }}>
                        <Box sx={{ bgcolor: '#eab308', color: '#0f172a', p: 1.5, textAlign: 'center', fontWeight: 'bold', mb: 3, borderRadius: 1 }}>
                            FAZIT: DER AUTOMARKT TRANSFORMIERT SICH!
                        </Box>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 2, borderTop: uiColors.divider }}>
                            <Typography variant="body2" sx={{ color: uiColors.textMuted }}>Quelle: {country === 'AT' ? 'Statistik Austria' : 'KBA'}</Typography>
                            <Box component="a" href="https://mobiliti.at" target="_blank" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, textDecoration: 'none', bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', px: 2, py: 1, borderRadius: 8 }}>
                                <img src={getSmartLogoUrl('de-mobiliti')} crossOrigin="anonymous" alt="Mobiliti Logo" style={{ height: '24px' }} onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; }} />
                                <Typography variant="body1" sx={{ fontWeight: 800, color: uiColors.text }}>mobiliti.at</Typography>
                            </Box>
                        </Box>
                    </Box>
                </Box>
            </Box>
        );
    };

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Backdrop sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1, display: 'flex', flexDirection: 'column', gap: 2 }} open={isSavingImage}>
                    <CircularProgress color="inherit" />
                    <Typography variant="h6">Bild wird in höchster Qualität gerendert und gespeichert...</Typography>
                </Backdrop>

                <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>Social Media Generator</Typography>

                <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                    <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
                        <Tab label="Generator" icon={<AutoAwesomeIcon />} iconPosition="start" />
                        <Tab label="Archiv & Galerie" icon={<ImageIcon />} iconPosition="start" />
                    </Tabs>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

                {activeTab === 0 && (
                    <Grid container spacing={4}>
                        <Grid item xs={12} md={4}>
                            <Paper sx={{ p: 3, mb: 3, borderRadius: 2, borderLeft: '4px solid #3b82f6', bgcolor: '#f8fafc' }}>
                                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>🗄️ Daten-Quelle (S3)</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Verfügbare Rohdaten für den gewählten Markt:</Typography>
                                
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                    {ARCHIVE_DATA[country] && Object.entries(ARCHIVE_DATA[country]).map(([y, files]) => (
                                        <Box key={y}>
                                            <Typography variant="caption" fontWeight="bold" color="primary">{y}</Typography>
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
                                                {files.map((file) => {
                                                    const isActive = file.month === month && y === year;
                                                    return (
                                                        <Box key={file.month} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 0.5, bgcolor: isActive ? '#e0f2fe' : 'transparent', borderRadius: 1 }}>
                                                            {isActive ? <CheckCircleIcon color="primary" sx={{ fontSize: 16 }} /> : <InsertDriveFileIcon sx={{ fontSize: 16, color: '#94a3b8' }} />}
                                                            <MuiLink href={file.url} target="_blank" underline="hover" sx={{ fontSize: '0.75rem', color: isActive ? '#0284c7' : '#64748b', fontWeight: isActive ? 'bold' : 'normal', wordBreak: 'break-all' }}>
                                                                {file.fileName}
                                                            </MuiLink>
                                                        </Box>
                                                    );
                                                })}
                                            </Box>
                                        </Box>
                                    ))}
                                </Box>
                            </Paper>

                            <Paper sx={{ p: 3, borderRadius: 2 }}>
                                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Konfiguration</Typography>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 2 }}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Land / Markt</InputLabel>
                                        <Select value={country} label="Land / Markt" onChange={(e) => setCountry(e.target.value)}>
                                            <MenuItem value="AT">Österreich</MenuItem>
                                            <MenuItem value="DE">Deutschland</MenuItem>
                                        </Select>
                                    </FormControl>

                                    <Box sx={{ display: 'flex', gap: 2 }}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel>Jahr</InputLabel>
                                            <Select value={year} label="Jahr" onChange={(e) => setYear(e.target.value)} disabled={availableYears.length === 0}>
                                                {availableYears.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                                            </Select>
                                        </FormControl>
                                        <FormControl fullWidth size="small">
                                            <InputLabel>Monat</InputLabel>
                                            <Select value={month} label="Monat" onChange={(e) => setMonth(e.target.value)} disabled={availableMonths.length === 0}>
                                                {availableMonths.map(m => (
                                                    <MenuItem key={m} value={m}>{new Date(2000, parseInt(m) - 1).toLocaleString('de-DE', { month: 'long' })}</MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Box>

                                    <FormControl fullWidth size="small">
                                        <InputLabel>Größe / Format</InputLabel>
                                        <Select value={aspectRatio} label="Größe / Format" onChange={(e) => setAspectRatio(e.target.value)}>
                                            <MenuItem value="1 / 1">Instagram / LinkedIn (Quadratisch 1:1)</MenuItem>
                                            <MenuItem value="4 / 5">Instagram / LinkedIn (Hochformat 4:5)</MenuItem>
                                            <MenuItem value="1.91 / 1">Facebook / LinkedIn (Querformat 1.91:1)</MenuItem>
                                        </Select>
                                    </FormControl>

                                    <Box sx={{ display: 'flex', gap: 2 }}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel>Hintergrund</InputLabel>
                                            <Select value={graphicTheme} label="Hintergrund" onChange={(e) => setGraphicTheme(e.target.value)}>
                                                <MenuItem value="standard">Standard (Einfarbig)</MenuItem>
                                                {galleryFiles.grafiken.map((g) => (
                                                    <MenuItem key={g.name} value={g.name}>Foto: {g.name}</MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                        
                                        <ToggleButtonGroup value={colorMode} exclusive onChange={(_, newMode) => { if(newMode) setColorMode(newMode); }} size="small" fullWidth>
                                            <ToggleButton value="light" title="Heller Modus"><LightModeIcon fontSize="small" /></ToggleButton>
                                            <ToggleButton value="dark" title="Dunkler Modus"><DarkModeIcon fontSize="small" /></ToggleButton>
                                        </ToggleButtonGroup>
                                    </Box>

                                    <Button variant="contained" fullWidth size="large" onClick={handleGenerate} disabled={isLoading || availableMonths.length === 0} startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <AutoAwesomeIcon />}>
                                        {isLoading ? 'Generiere...' : 'Daten laden & Vorschau'}
                                    </Button>

                                    {chartData && (
                                        <Button variant="outlined" fullWidth onClick={handleDownloadSource} startIcon={<FileDownloadIcon />} sx={{ mt: -1 }}>
                                            Rohdaten (Excel) laden
                                        </Button>
                                    )}
                                </Box>
                            </Paper>
                        </Grid>

                        <Grid item xs={12} md={8}>
                            {chartData ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    <Paper sx={{ p: 3, borderRadius: 2, bgcolor: '#f1f5f9' }}>
                                        <Box sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                            <Typography variant="h6">Vorschau Grafik</Typography>
                                            <Button variant="contained" color="secondary" startIcon={<DownloadIcon />} onClick={handleDownloadImage} disabled={isSavingImage}>
                                                Speichern & Herunterladen
                                            </Button>
                                        </Box>
                                        <Divider sx={{ width: '100%', mb: 3 }} />
                                        <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%', overflowX: 'auto' }}>
                                            {renderGraphic()}
                                        </Box>
                                    </Paper>

                                    <Paper sx={{ p: 3, borderRadius: 2 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                            <Typography variant="h6">KI-Post (LinkedIn)</Typography>
                                            <Button variant="outlined" size="small" startIcon={<ContentCopyIcon />} onClick={handleCopyText}>Kopieren</Button>
                                        </Box>
                                        <TextField multiline rows={8} fullWidth value={aiText} onChange={(e) => setAiText(e.target.value)} variant="outlined" />
                                    </Paper>
                                </Box>
                            ) : (
                                <Paper sx={{ p: 5, borderRadius: 2, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f8fafc', border: '1px dashed #cbd5e1' }}>
                                    <Typography color="text.secondary">Bitte wählen Sie einen Zeitraum und klicken Sie auf "Daten laden & Vorschau".</Typography>
                                </Paper>
                            )}
                        </Grid>
                    </Grid>
                )}

                {activeTab === 1 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        
                        {/* 1. SOCIAL MEDIA */}
                        <Paper sx={{ p: 4, borderRadius: 2 }}>
                            <Typography variant="h5" gutterBottom>Ordner: /social-media</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Hier liegen alle fertigen, generierten Social-Media Posts.
                            </Typography>
                            {loadingGallery ? <CircularProgress /> : (
                                <Grid container spacing={3}>
                                    {galleryFiles.socialMedia.length === 0 ? (
                                        <Grid item xs={12}><Typography color="text.secondary">Noch keine Dateien vorhanden.</Typography></Grid>
                                    ) : galleryFiles.socialMedia.map((item) => (
                                        <Grid item xs={12} sm={6} md={3} key={item.id}>
                                            <Paper elevation={2} sx={{ overflow: 'hidden', borderRadius: 2, border: '1px solid', borderColor: 'divider', position: 'relative' }}>
                                                <IconButton size="small" color="error" onClick={() => handleDeleteFile('social-media', item.name)} sx={{ position: 'absolute', top: 5, right: 5, bgcolor: 'rgba(255,255,255,0.8)', '&:hover': { bgcolor: 'white' } }}>
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                                
                                                <Box sx={{ height: 180, bgcolor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid divider', overflow: 'hidden' }}>
                                                    <img src={getImageUrl(item.url)} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                </Box>
                                                <Box sx={{ p: 1.5 }}>
                                                    {/* NEU: Format und Größe anzeigen */}
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                                        <Chip label={item.type} size="small" color="primary" sx={{ fontSize: '0.65rem', height: 20 }} />
                                                        <Chip label={`${item.format} • ${item.size}`} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                                                    </Box>
                                                    <Typography variant="subtitle2" noWrap title={item.name}>{item.name}</Typography>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                                                        <Typography variant="caption" color="text.secondary">{item.date}</Typography>
                                                        <Button size="small" variant="text" sx={{ minWidth: 'auto', p: 0.5 }} onClick={() => handleCopyUrl(item.url)}>URL</Button>
                                                    </Box>
                                                </Box>
                                            </Paper>
                                        </Grid>
                                    ))}
                                </Grid>
                            )}
                        </Paper>

                        {/* 2. GRAFIKEN */}
                        <Paper sx={{ p: 4, borderRadius: 2 }}>
                            <Typography variant="h5" gutterBottom>Ordner: /grafiken</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Hintergrundbilder, die im Generator ausgewählt werden können.
                            </Typography>
                            {loadingGallery ? <CircularProgress /> : (
                                <Grid container spacing={3}>
                                    {galleryFiles.grafiken.length === 0 ? (
                                        <Grid item xs={12}><Typography color="text.secondary">Noch keine Dateien vorhanden.</Typography></Grid>
                                    ) : galleryFiles.grafiken.map((item) => (
                                        <Grid item xs={12} sm={6} md={3} key={item.id}>
                                            <Paper elevation={2} sx={{ overflow: 'hidden', borderRadius: 2, border: '1px solid', borderColor: 'divider', position: 'relative' }}>
                                                <IconButton size="small" color="error" onClick={() => handleDeleteFile('grafiken', item.name)} sx={{ position: 'absolute', top: 5, right: 5, bgcolor: 'rgba(255,255,255,0.8)', '&:hover': { bgcolor: 'white' } }}>
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>

                                                <Box sx={{ height: 180, bgcolor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid divider', overflow: 'hidden' }}>
                                                    <img src={getImageUrl(item.url)} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                </Box>
                                                <Box sx={{ p: 1.5 }}>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                                        <Chip label={item.type} size="small" color="default" sx={{ fontSize: '0.65rem', height: 20 }} />
                                                        <Chip label={`${item.format} • ${item.size}`} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                                                    </Box>
                                                    <Typography variant="subtitle2" noWrap title={item.name}>{item.name}</Typography>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                                                        <Typography variant="caption" color="text.secondary">{item.date}</Typography>
                                                        <Button size="small" variant="text" sx={{ minWidth: 'auto', p: 0.5 }} onClick={() => handleCopyUrl(item.url)}>URL</Button>
                                                    </Box>
                                                </Box>
                                            </Paper>
                                        </Grid>
                                    ))}
                                </Grid>
                            )}
                        </Paper>

                        {/* 3. LOGOS */}
                        <Paper sx={{ p: 4, borderRadius: 2 }}>
                            <Typography variant="h5" gutterBottom>Ordner: /logos</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Die in den Grafiken verwendeten Markenlogos.
                            </Typography>
                            {loadingGallery ? <CircularProgress /> : (
                                <Grid container spacing={2}>
                                    {galleryFiles.logos.length === 0 ? (
                                        <Grid item xs={12}><Typography color="text.secondary">Noch keine Logos vorhanden.</Typography></Grid>
                                    ) : galleryFiles.logos.map((logo) => (
                                        <Grid item xs={6} sm={4} md={2} key={logo.name}>
                                            <Paper elevation={1} sx={{ p: 1.5, textAlign: 'center', border: '1px solid', borderColor: 'divider', position: 'relative' }}>
                                                <IconButton size="small" color="error" onClick={() => handleDeleteFile('logos', logo.name)} sx={{ position: 'absolute', top: 2, right: 2 }}>
                                                    <DeleteIcon sx={{ fontSize: 16 }} />
                                                </IconButton>

                                                <Box sx={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1, mt: 2 }}>
                                                    <img src={getImageUrl(`/api/logos/${logo.name}`)} alt={logo.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                                </Box>
                                                <Typography variant="caption" display="block" noWrap>{logo.name}</Typography>
                                                <Typography variant="caption" display="block" color="text.secondary">{logo.format} • {logo.size}</Typography>
                                                <Button size="small" variant="text" sx={{ fontSize: '0.6rem', mt: 0.5 }} onClick={() => handleCopyUrl(`/api/logos/${logo.name}`)}>URL kopieren</Button>
                                            </Paper>
                                        </Grid>
                                    ))}
                                </Grid>
                            )}
                        </Paper>
                    </Box>
                )}
            </Container>
        </DashboardLayout>
    );
};

export default AdminSocialMediaGenerator;