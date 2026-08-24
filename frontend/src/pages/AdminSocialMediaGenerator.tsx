// frontend/src/pages/AdminSocialMediaGenerator.tsx
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
    Box, Typography, Container, Paper, Button, FormControl, InputLabel, Select, MenuItem,
    Grid, CircularProgress, Alert, TextField, Divider, Tabs, Tab, Link as MuiLink, Chip,
    ToggleButtonGroup, ToggleButton, Backdrop, IconButton, Stack, Tooltip, Collapse
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
import RefreshIcon from '@mui/icons-material/Refresh';
import StorageIcon from '@mui/icons-material/Storage';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import VisibilityIcon from '@mui/icons-material/Visibility';
import * as htmlToImage from 'html-to-image';

import apiClient from '../apiClient';
import DashboardLayout from '../components/DashboardLayout';
import { useSnackbar } from '../context/SnackbarContext';
import AiContentLabel from '../components/AiContentLabel';

interface ArchiveFile {
    country_code: string;
    country?: string;
    year: number;
    month: number;
    month_label?: string;
    time_period?: string;
    archive_path: string;
    fileName: string;
    source_name?: string;
    source_url?: string;
    sourceDownloadUrl?: string;
    last_updated?: string;
    row_count?: number;
    parser_status?: 'ready' | 'pending';
    parser_note?: string | null;
}

interface GalleryFile {
    id: string;
    name: string;
    type: string;
    url: string;
    rawUrl?: string;
    date: string;
    dateTime?: string;
    mtimeMs?: number;
    size: string;
    format: string;
}

const EMPTY_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const countryLabel = (code: string) => {
    if (code === 'AT') return 'Österreich';
    if (code === 'DE') return 'Deutschland';
    return code;
};

const getMonthLabel = (month: number) => {
    if (!month || Number.isNaN(month)) return '';
    return new Date(2000, month - 1).toLocaleString('de-DE', { month: 'long' });
};

const formatDateTime = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const AdminSocialMediaGenerator: React.FC = () => {
    const { showSnackbar } = useSnackbar();

    const [archiveFiles, setArchiveFiles] = useState<ArchiveFile[]>([]);
    const [loadingArchive, setLoadingArchive] = useState(false);
    const [expandedArchiveYears, setExpandedArchiveYears] = useState<Record<string, boolean>>({});
    const [country, setCountry] = useState('AT');
    const [year, setYear] = useState('');
    const [month, setMonth] = useState('');

    const [graphicTheme, setGraphicTheme] = useState('standard');
    const [colorMode, setColorMode] = useState<'light' | 'dark'>('light');
    const [aspectRatio, setAspectRatio] = useState('1 / 1');
    const [activeTab, setActiveTab] = useState(0);

    const [isLoading, setIsLoading] = useState(false);
    const [isSavingImage, setIsSavingImage] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [aiText, setAiText] = useState('');
    const [generatedAiText, setGeneratedAiText] = useState('');
    const [chartData, setChartData] = useState<any | null>(null);
    const [sourceFileUrl, setSourceFileUrl] = useState<string | null>(null);

    const [galleryFiles, setGalleryFiles] = useState<{ logos: GalleryFile[], socialMedia: GalleryFile[], grafiken: GalleryFile[] }>({ logos: [], socialMedia: [], grafiken: [] });
    const [loadingGallery, setLoadingGallery] = useState(false);
    const [uploadingGraphic, setUploadingGraphic] = useState(false);

    const graphicRef = useRef<HTMLDivElement>(null);
    const graphicUploadInputRef = useRef<HTMLInputElement>(null);

    const fetchArchiveFiles = useCallback(async () => {
        setLoadingArchive(true);
        try {
            const response = await apiClient.get('/api/admin/social-media/archive-files');
            const items = Array.isArray(response.data?.items) ? response.data.items : Array.isArray(response.data) ? response.data : [];
            setArchiveFiles(items);
        } catch (err: any) {
            console.error('Fehler beim Laden der Archivdaten:', err);
            setError(err.response?.data?.message || 'Archivdaten konnten nicht geladen werden.');
        } finally {
            setLoadingArchive(false);
        }
    }, []);

    const fetchGalleryFiles = useCallback(async () => {
        setLoadingGallery(true);
        try {
            const response = await apiClient.get('/api/admin/social-media/gallery-files');
            setGalleryFiles({
                logos: Array.isArray(response.data?.logos) ? response.data.logos : [],
                socialMedia: Array.isArray(response.data?.socialMedia) ? response.data.socialMedia : [],
                grafiken: Array.isArray(response.data?.grafiken) ? response.data.grafiken : [],
            });
        } catch (err) {
            console.error('Fehler beim Laden der Galerie:', err);
        } finally {
            setLoadingGallery(false);
        }
    }, []);

    useEffect(() => {
        fetchArchiveFiles();
        fetchGalleryFiles();
    }, [fetchArchiveFiles, fetchGalleryFiles]);

    const countryOptions = useMemo(() => {
        return [...new Set(archiveFiles.map((file) => file.country_code))]
            .sort()
            .map((code) => ({ code, label: countryLabel(code) }));
    }, [archiveFiles]);

    const filesForCountry = useMemo(() => {
        return archiveFiles.filter((file) => file.country_code === country);
    }, [archiveFiles, country]);

    const availableYears = useMemo(() => {
        return [...new Set(filesForCountry.map((file) => String(file.year)))]
            .sort((a, b) => Number(b) - Number(a));
    }, [filesForCountry]);

    const filesForYear = useMemo(() => {
        return filesForCountry.filter((file) => String(file.year) === String(year));
    }, [filesForCountry, year]);

    const availableMonths = useMemo(() => {
        return [...new Map(
            filesForYear
                .sort((a, b) => b.month - a.month)
                .map((file) => [String(file.month), file])
        ).values()];
    }, [filesForYear]);

    const activeArchiveFile = useMemo(() => {
        const candidates = filesForYear.filter((file) => String(file.month) === String(month));
        return candidates.sort((a, b) => {
            const dateDiff = new Date(b.last_updated || 0).getTime() - new Date(a.last_updated || 0).getTime();
            return dateDiff || String(a.fileName).localeCompare(String(b.fileName), 'de');
        })[0] || null;
    }, [filesForYear, month]);

    useEffect(() => {
        if (archiveFiles.length === 0) return;

        const preferredCountry = archiveFiles.some((file) => file.country_code === country)
            ? country
            : archiveFiles[0].country_code;

        if (preferredCountry !== country) {
            setCountry(preferredCountry);
            return;
        }

        const nextYears = [...new Set(archiveFiles
            .filter((file) => file.country_code === preferredCountry)
            .map((file) => String(file.year))
        )].sort((a, b) => Number(b) - Number(a));

        if (nextYears.length > 0 && !nextYears.includes(String(year))) {
            setYear(nextYears[0]);
        }
    }, [archiveFiles, country, year]);

    useEffect(() => {
        if (!country || !year) return;

        const nextMonths = archiveFiles
            .filter((file) => file.country_code === country && String(file.year) === String(year))
            .sort((a, b) => b.month - a.month)
            .map((file) => String(file.month));

        if (nextMonths.length > 0 && !nextMonths.includes(String(month))) {
            setMonth(nextMonths[0]);
        }
    }, [archiveFiles, country, year, month]);

    useEffect(() => {
        if (!year) return;
        setExpandedArchiveYears((prev) => ({ ...prev, [String(year)]: true }));
    }, [year]);

    const handleToggleArchiveYear = (archiveYear: string) => {
        setExpandedArchiveYears((prev) => ({
            ...prev,
            [archiveYear]: !(prev[archiveYear] ?? archiveYear === String(year)),
        }));
    };

    const handleRefreshAll = () => {
        fetchArchiveFiles();
        fetchGalleryFiles();
    };

    const handleGenerate = async () => {
        if (!activeArchiveFile) {
            showSnackbar('Bitte wählen Sie zuerst eine verfügbare Archivdatei.', 'warning');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await apiClient.post('/api/admin/social-media/generate', {
                country,
                year: Number(year),
                month: Number(month),
            });

            const generatedText = response.data.text || '';
            setAiText(generatedText);
            setGeneratedAiText(generatedText);
            setChartData(response.data.parsedData);
            setSourceFileUrl(response.data.sourceDownloadUrl || activeArchiveFile.source_url || activeArchiveFile.sourceDownloadUrl || '#');
            showSnackbar('Inhalt erfolgreich generiert!', 'success');
        } catch (err: any) {
            console.error('Fehler bei Generierung:', err);
            const message = err.response?.data?.message || 'Fehler beim Abrufen der Daten.';
            setError(message);
            showSnackbar(message, 'error');
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
                const baseName = activeArchiveFile?.fileName
                    ? activeArchiveFile.fileName.replace(/\.[^/.]+$/, '')
                    : `${country}_Statistik_${year}_${String(month).padStart(2, '0')}`;
                const formatLabel = aspectRatio === '1 / 1' ? '1x1' : aspectRatio === '4 / 5' ? '4x5' : '16x9';
                const filename = `${baseName}_${formatLabel}.png`;

                const link = document.createElement('a');
                link.download = filename;
                link.href = dataUrl;
                link.click();

                await apiClient.post('/api/admin/social-media/save', { imageBase64: dataUrl, filename });
                fetchGalleryFiles();
                showSnackbar(`Grafik als ${filename} gespeichert!`, 'success');
            } catch (err) {
                console.error('Fehler beim Bilderstellung:', err);
                showSnackbar('Fehler beim Speichern der Grafik.', 'error');
            } finally {
                setIsSavingImage(false);
            }
        }, 300);
    };

    const handleDeleteFile = async (folder: string, filename: string) => {
        if (!window.confirm(`Möchten Sie die Datei "${filename}" wirklich unwiderruflich löschen?`)) return;
        try {
            await apiClient.delete(`/api/admin/social-media/gallery-files?folder=${encodeURIComponent(folder)}&filename=${encodeURIComponent(filename)}`);
            showSnackbar('Datei erfolgreich gelöscht.', 'success');
            fetchGalleryFiles();
        } catch (err) {
            console.error('Fehler beim Löschen:', err);
            showSnackbar('Fehler beim Löschen der Datei.', 'error');
        }
    };

    const handleGraphicUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        const formData = new FormData();
        formData.append('graphic', file);
        setUploadingGraphic(true);

        try {
            const response = await apiClient.post('/api/admin/social-media/gallery-files/grafiken', formData);
            await fetchGalleryFiles();
            if (response.data?.file?.name) setGraphicTheme(response.data.file.name);
            showSnackbar('Grafik wurde optimiert, hochgeladen und als Hintergrund ausgewählt.', 'success');
        } catch (err: any) {
            console.error('Fehler beim Grafik-Upload:', err);
            showSnackbar(err.response?.data?.message || 'Grafik konnte nicht hochgeladen werden.', 'error');
        } finally {
            setUploadingGraphic(false);
        }
    };

    const handleDownloadSource = () => {
        const targetUrl = sourceFileUrl || activeArchiveFile?.source_url || activeArchiveFile?.sourceDownloadUrl;
        if (targetUrl && targetUrl !== '#') window.open(targetUrl, '_blank', 'noopener,noreferrer');
        else showSnackbar('Download-Link für Rohdaten aktuell nicht bereitgestellt.', 'warning');
    };

    const handleCopyText = () => {
        navigator.clipboard.writeText(aiText);
        showSnackbar('Text in die Zwischenablage kopiert.', 'success');
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

    const handleCopyUrl = (url: string) => {
        const fullUrl = getImageUrl(url);
        const finalUrl = fullUrl.startsWith('http') ? fullUrl : `${window.location.origin}${fullUrl}`;
        navigator.clipboard.writeText(finalUrl);
        showSnackbar('URL kopiert!', 'success');
    };

    const getGalleryActionUrl = (folder: string, filename: string, action: 'view' | 'download') => (
        getImageUrl(`/api/admin/social-media/gallery-files/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}/${action}`)
    );

    const handleViewGalleryFile = (folder: string, filename: string) => {
        const link = document.createElement('a');
        link.href = getGalleryActionUrl(folder, filename, 'view');
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    const handleDownloadGalleryFile = (folder: string, filename: string) => {
        const link = document.createElement('a');
        link.href = getGalleryActionUrl(folder, filename, 'download');
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    const formatPercent = (rawValue: unknown) => {
        if (rawValue === null || rawValue === undefined || String(rawValue).trim() === 'n.v.') return { text: 'n.v.', isPositive: false };
        const val = parseFloat(String(rawValue).replace(',', '.'));
        if (isNaN(val)) return { text: '0,0%', isPositive: false };
        return { text: `${val > 0 ? '+' : ''}${val.toFixed(1).replace('.', ',')}%`, isPositive: val > 0 };
    };

    const getSmartLogoUrl = (slug: string) => {
        if (!slug) return EMPTY_PIXEL;
        const foundLogo = galleryFiles?.logos?.find((l) => l.name.startsWith(`${slug}.`));
        if (foundLogo) return getImageUrl(foundLogo.rawUrl || `/api/logos/${foundLogo.name}`);
        return EMPTY_PIXEL;
    };

    const renderArchiveCard = () => {
        if (loadingArchive) {
            return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={18} />
                    <Typography variant="body2" color="text.secondary">Archivdaten werden geladen...</Typography>
                </Box>
            );
        }

        if (archiveFiles.length === 0) {
            return <Alert severity="warning">Keine Archivdaten in economic_statistics gefunden.</Alert>;
        }

        const groupedByYear = filesForCountry.reduce((acc, file) => {
            const key = String(file.year);
            if (!acc[key]) acc[key] = [];
            acc[key].push(file);
            return acc;
        }, {} as Record<string, ArchiveFile[]>);

        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Typography variant="subtitle2" fontWeight={900}>
                        {filesForCountry.length} Zeiträume verfügbar
                    </Typography>
                    <Tooltip title="Archiv und Galerie aktualisieren">
                        <IconButton size="small" onClick={handleRefreshAll}>
                            <RefreshIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Stack>

                {Object.entries(groupedByYear)
                    .sort(([a], [b]) => Number(b) - Number(a))
                    .map(([archiveYear, files]) => {
                        const yearFiles = [...files].sort((a, b) => b.month - a.month);
                        const isSelectedYear = String(archiveYear) === String(year);
                        const isExpanded = expandedArchiveYears[archiveYear] ?? isSelectedYear;
                        const pendingCount = yearFiles.filter((file) => file.parser_status === 'pending').length;
                        const latestMonth = yearFiles.length > 0 ? Math.max(...yearFiles.map((file) => file.month)) : null;

                        return (
                            <Paper
                                key={archiveYear}
                                elevation={0}
                                sx={{
                                    border: '1px solid',
                                    borderColor: isSelectedYear ? 'primary.light' : 'divider',
                                    borderRadius: 2,
                                    overflow: 'hidden',
                                    bgcolor: isSelectedYear ? 'rgba(2, 132, 199, 0.04)' : 'background.paper',
                                }}
                            >
                                <Box
                                    onClick={() => handleToggleArchiveYear(archiveYear)}
                                    sx={{
                                        px: 1,
                                        py: 0.75,
                                        cursor: 'pointer',
                                        bgcolor: isExpanded ? 'action.hover' : 'transparent',
                                        '&:hover': { bgcolor: 'action.hover' },
                                    }}
                                >
                                    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                                        <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary', mr: 0.25 }}>
                                            {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                                        </Box>
                                        <Typography variant="body2" sx={{ fontWeight: 900, color: isSelectedYear ? 'primary.main' : 'text.primary' }}>
                                            {archiveYear}
                                        </Typography>
                                        {isSelectedYear && <Chip size="small" color="primary" label="ausgewählt" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 800 }} />}
                                        <Chip size="small" variant="outlined" label={`${yearFiles.length} Monate`} sx={{ height: 20, fontSize: '0.65rem' }} />
                                        {latestMonth && <Chip size="small" variant="outlined" label={`neu: ${getMonthLabel(latestMonth)}`} sx={{ height: 20, fontSize: '0.65rem' }} />}
                                        {pendingCount > 0 && <Chip size="small" color="warning" variant="outlined" label={`${pendingCount} ohne Parser`} sx={{ height: 20, fontSize: '0.65rem' }} />}
                                    </Stack>
                                </Box>

                                <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, p: 0.75, pt: 0.75 }}>
                                        {yearFiles.map((file) => {
                                            const isActive = file.country_code === country && String(file.year) === String(year) && String(file.month) === String(month);
                                            const canGenerate = file.parser_status !== 'pending';
                                            return (
                                                <Box
                                                    key={`${file.country_code}-${file.year}-${file.month}-${file.archive_path}`}
                                                    onClick={() => {
                                                        setCountry(file.country_code);
                                                        setYear(String(file.year));
                                                        setMonth(String(file.month));
                                                    }}
                                                    sx={{
                                                        display: 'flex',
                                                        alignItems: 'flex-start',
                                                        gap: 1,
                                                        p: 0.8,
                                                        bgcolor: isActive ? '#e0f2fe' : 'transparent',
                                                        borderRadius: 1,
                                                        cursor: 'pointer',
                                                        border: '1px solid',
                                                        borderColor: isActive ? '#bae6fd' : 'transparent',
                                                        '&:hover': { bgcolor: isActive ? '#e0f2fe' : 'action.hover' },
                                                    }}
                                                >
                                                    {isActive ? <CheckCircleIcon color="primary" sx={{ fontSize: 18, mt: 0.2 }} /> : <InsertDriveFileIcon sx={{ fontSize: 18, mt: 0.2, color: '#94a3b8' }} />}
                                                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                                                            <Typography variant="body2" sx={{ fontWeight: isActive ? 850 : 650 }}>
                                                                {getMonthLabel(file.month)}
                                                            </Typography>
                                                            {!canGenerate && (
                                                                <Chip size="small" color="warning" variant="outlined" label="Parser fehlt" sx={{ height: 18, fontSize: '0.62rem' }} />
                                                            )}
                                                        </Stack>
                                                        <MuiLink
                                                            href={file.source_url || '#'}
                                                            target="_blank"
                                                            underline="hover"
                                                            onClick={(e) => e.stopPropagation()}
                                                            sx={{
                                                                display: 'block',
                                                                fontSize: '0.72rem',
                                                                color: isActive ? '#0284c7' : '#64748b',
                                                                fontWeight: isActive ? 'bold' : 'normal',
                                                                wordBreak: 'break-all',
                                                            }}
                                                        >
                                                            {file.fileName}
                                                        </MuiLink>
                                                        {file.last_updated && (
                                                            <Typography variant="caption" color="text.secondary">
                                                                aktualisiert: {formatDateTime(file.last_updated)}
                                                            </Typography>
                                                        )}
                                                    </Box>
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                </Collapse>
                            </Paper>
                        );
                    })}
            </Box>
        );
    };

    const renderGraphic = () => {
        if (!chartData || !chartData.topMarken || chartData.topMarken.length === 0) return null;

        const displayMonth = getMonthLabel(Number(month));
        const metrics = chartData.metrics || {};
        const topMarke = metrics.marketLeader || chartData.topMarken[0];
        const validTrends = chartData.topMarken
            .filter((m: any) => m.zulassungen > 100 && m.vergleichVorjahr !== 'n.v.')
            .map((m: any) => ({ ...m, trendVal: parseFloat(String(m.vergleichVorjahr).replace(',', '.')) }))
            .sort((a: any, b: any) => b.trendVal - a.trendVal);
        const topWinner = metrics.strongestGrowth || validTrends[0];
        const topLoser = metrics.strongestDecline || validTrends[validTrends.length - 1];
        const topElektro = metrics.topElectricBrand || (chartData.topElektro && chartData.topElektro.length > 0 ? chartData.topElektro[0] : null);
        const comparisonLabel = metrics.comparisonLabel || `ggü. ${displayMonth} ${Number(year) - 1}`;
        const trendSelectionLabel = metrics.trendSelectionLabel || 'Top-10-Marken · mehr als 100 Zulassungen';
        const metricPercent = (metric: any) => formatPercent(metric?.changePercent ?? metric?.vergleichVorjahr);
        const metricComparisonLabel = (metric: any) => metric?.comparisonLabel || comparisonLabel;
        const metricYearOverYear = (metric: any) => metric?.comparisonBasis === 'previous_month' && metric?.yearOverYearPercent !== null && metric?.yearOverYearPercent !== undefined
            ? `Vorjahr: ${formatPercent(metric.yearOverYearPercent).text}`
            : null;
        const flagBands = country === 'DE'
            ? ['#111827', '#dc2626', '#facc15']
            : ['#ed2939', '#ffffff', '#ed2939'];

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

        const bgStyle = graphicTheme === 'standard'
            ? { bgcolor: uiColors.bg }
            : {
                backgroundImage: isDark
                    ? `linear-gradient(to bottom, rgba(15, 23, 42, 0.85), rgba(15, 23, 42, 0.95)), url('${getImageUrl(`/api/grafiken/${graphicTheme}`)}')`
                    : `linear-gradient(to bottom, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0.95)), url('${getImageUrl(`/api/grafiken/${graphicTheme}`)}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
            };

        return (
            <Box
                ref={graphicRef}
                sx={{
                    width: '100%', maxWidth: '800px', aspectRatio,
                    color: uiColors.text, p: 5, borderRadius: 3,
                    boxShadow: uiColors.shadow, fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
                    position: 'relative', overflow: 'hidden', ...bgStyle,
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
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
                        <Box sx={{ width: '60%', height: '2px', bgcolor: uiColors.textMuted, mx: 'auto', mt: 1, mb: 2.5, boxShadow: isDark ? `0 0 10px ${uiColors.textMuted}` : 'none', position: 'relative' }}>
                            <Box
                                role="img"
                                aria-label={`Flagge ${countryLabel(country)}`}
                                sx={{
                                    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                                    width: 48, height: 30, borderRadius: '5px', overflow: 'hidden',
                                    border: '2px solid rgba(255,255,255,0.92)',
                                    boxShadow: isDark ? '0 4px 14px rgba(0,0,0,0.55)' : '0 4px 12px rgba(15,23,42,0.25)',
                                    display: 'grid', gridTemplateRows: 'repeat(3, 1fr)', zIndex: 2,
                                }}
                            >
                                {flagBands.map((bandColor, index) => <Box key={`${bandColor}-${index}`} sx={{ bgcolor: bandColor }} />)}
                            </Box>
                        </Box>
                        <Typography variant="h6" sx={{ fontWeight: 400, color: uiColors.textMuted }}>
                            {countryLabel(country)} im Wandel
                        </Typography>
                    </Box>

                    <Grid container spacing={3} sx={{ mb: 4, flexGrow: 1, alignContent: 'center' }}>
                        <Grid item xs={6}>
                            <Paper sx={{ background: 'linear-gradient(135deg, #2563eb 0%, #1e3a8a 100%)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)', borderRadius: 2, p: 3, height: '100%', boxShadow: '0 8px 18px rgba(30, 58, 138, 0.24)' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, borderBottom: '1px solid rgba(255,255,255,0.25)', pb: 1 }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: '#fff' }}>Marktführer</Typography>
                                    <EmojiEventsIcon sx={{ color: '#fde047' }} />
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Box sx={{ width: 60, height: 60, bgcolor: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1, border: '1px solid #e2e8f0', flexShrink: 0 }}>
                                        <img src={getSmartLogoUrl(topMarke?.logo_slug)} crossOrigin="anonymous" alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%' }} onError={(e) => { e.currentTarget.src = EMPTY_PIXEL; }} />
                                    </Box>
                                    <Box>
                                        <Typography variant="h4" sx={{ fontWeight: 800, color: '#fff' }}>{topMarke?.zulassungen.toLocaleString('de-DE')}</Typography>
                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.82)' }}>Neuzulassungen</Typography>
                                        {topMarke && <Typography variant="subtitle2" sx={{ color: metricPercent(topMarke).isPositive ? '#bbf7d0' : '#fecaca', fontWeight: 'bold' }}>{metricPercent(topMarke).text} {metricComparisonLabel(topMarke)}</Typography>}
                                        {metricYearOverYear(topMarke) && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.74)', display: 'block' }}>{metricYearOverYear(topMarke)}</Typography>}
                                    </Box>
                                </Box>
                            </Paper>
                        </Grid>
                        <Grid item xs={6}>
                            <Paper sx={{ background: 'linear-gradient(135deg, #0891b2 0%, #0f766e 100%)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)', borderRadius: 2, p: 3, height: '100%', boxShadow: '0 8px 18px rgba(15, 118, 110, 0.24)' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, borderBottom: '1px solid rgba(255,255,255,0.25)', pb: 1 }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: '#fff' }}>Top E-Auto Marke</Typography>
                                    <ElectricCarIcon sx={{ color: '#bbf7d0' }} />
                                </Box>
                                {topElektro ? (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Box sx={{ width: 60, height: 60, bgcolor: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1, border: '1px solid #e2e8f0', flexShrink: 0 }}>
                                            <img src={getSmartLogoUrl(topElektro.logo_slug)} crossOrigin="anonymous" alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%' }} onError={(e) => { e.currentTarget.src = EMPTY_PIXEL; }} />
                                        </Box>
                                        <Box>
                                            <Typography variant="h4" sx={{ fontWeight: 800, color: '#fff' }}>{topElektro.zulassungen.toLocaleString('de-DE')}</Typography>
                                            <Typography variant="body2" sx={{ color: '#fff', fontWeight: 800 }}>{topElektro.name}</Typography>
                                            <Typography variant="subtitle2" sx={{ color: metricPercent(topElektro).isPositive ? '#bbf7d0' : '#fecaca', fontWeight: 'bold' }}>{metricPercent(topElektro).text}</Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.82)', display: 'block', fontSize: '0.68rem', lineHeight: 1.2 }}>
                                                nur Elektro · {metricComparisonLabel(topElektro)}
                                            </Typography>
                                            {metricYearOverYear(topElektro) && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.74)', display: 'block', fontSize: '0.65rem' }}>{metricYearOverYear(topElektro)}</Typography>}
                                        </Box>
                                    </Box>
                                ) : <Typography color="text.secondary">Keine Daten.</Typography>}
                            </Paper>
                        </Grid>
                        <Grid item xs={6}>
                            <Paper sx={{ background: 'linear-gradient(135deg, #16a34a 0%, #166534 100%)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)', borderRadius: 2, p: 3, height: '100%', boxShadow: '0 8px 18px rgba(22, 101, 52, 0.22)' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, borderBottom: '1px solid rgba(255,255,255,0.25)', pb: 1 }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: '#fff' }}>Stärkstes Wachstum</Typography>
                                    <TrendingUpIcon sx={{ color: '#fff' }} />
                                </Box>
                                {topWinner && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Box sx={{ width: 60, height: 60, bgcolor: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1, border: '1px solid #e2e8f0', flexShrink: 0 }}>
                                            <img src={getSmartLogoUrl(topWinner.logo_slug)} crossOrigin="anonymous" alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%' }} onError={(e) => { e.currentTarget.src = EMPTY_PIXEL; }} />
                                        </Box>
                                        <Box>
                                            <Typography variant="h3" sx={{ fontWeight: 900, color: '#fff' }}>{metricPercent(topWinner).text}</Typography>
                                            <Typography variant="body1" sx={{ fontWeight: 'bold', color: '#fff' }}>{topWinner.name}</Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.82)', display: 'block', fontSize: '0.66rem', lineHeight: 1.2 }}>
                                                Gesamtmarkt · {metricComparisonLabel(topWinner)}
                                            </Typography>
                                            {metricYearOverYear(topWinner) && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)', display: 'block', fontSize: '0.63rem' }}>{metricYearOverYear(topWinner)}</Typography>}
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.72)', display: 'block', fontSize: '0.61rem', lineHeight: 1.2 }}>
                                                {trendSelectionLabel}
                                            </Typography>
                                        </Box>
                                    </Box>
                                )}
                            </Paper>
                        </Grid>
                        <Grid item xs={6}>
                            <Paper sx={{ background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)', borderRadius: 2, p: 3, height: '100%', boxShadow: '0 8px 18px rgba(153, 27, 27, 0.22)' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, borderBottom: '1px solid rgba(255,255,255,0.25)', pb: 1 }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: '#fff' }}>Stärkster Rückgang</Typography>
                                    <TrendingDownIcon sx={{ color: '#fff' }} />
                                </Box>
                                {topLoser && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Box sx={{ width: 60, height: 60, bgcolor: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1, border: '1px solid #e2e8f0', flexShrink: 0 }}>
                                            <img src={getSmartLogoUrl(topLoser.logo_slug)} crossOrigin="anonymous" alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%' }} onError={(e) => { e.currentTarget.src = EMPTY_PIXEL; }} />
                                        </Box>
                                        <Box>
                                            <Typography variant="h3" sx={{ fontWeight: 900, color: '#fff' }}>{metricPercent(topLoser).text}</Typography>
                                            <Typography variant="body1" sx={{ fontWeight: 'bold', color: '#fff' }}>{topLoser.name}</Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.82)', display: 'block', fontSize: '0.66rem', lineHeight: 1.2 }}>
                                                Gesamtmarkt · {metricComparisonLabel(topLoser)}
                                            </Typography>
                                            {metricYearOverYear(topLoser) && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)', display: 'block', fontSize: '0.63rem' }}>{metricYearOverYear(topLoser)}</Typography>}
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.72)', display: 'block', fontSize: '0.61rem', lineHeight: 1.2 }}>
                                                {trendSelectionLabel}
                                            </Typography>
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
                            <Typography variant="body2" sx={{ color: uiColors.textMuted }}>Quelle: {activeArchiveFile?.source_name || (country === 'AT' ? 'Statistik Austria' : 'KBA')}</Typography>
                            <Box component="a" href="https://mobiliti.at" target="_blank" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, textDecoration: 'none', bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', px: 2, py: 1, borderRadius: 8 }}>
                                <img src={getSmartLogoUrl('de-mobiliti')} crossOrigin="anonymous" alt="Mobiliti Logo" style={{ height: '24px' }} onError={(e) => { e.currentTarget.src = EMPTY_PIXEL; }} />
                                <Typography variant="body1" sx={{ fontWeight: 800, color: uiColors.text }}>mobiliti.at</Typography>
                            </Box>
                        </Box>
                    </Box>
                </Box>
            </Box>
        );
    };

    const canGenerate = !!activeArchiveFile && activeArchiveFile.parser_status !== 'pending';

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Backdrop sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1, display: 'flex', flexDirection: 'column', gap: 2 }} open={isSavingImage}>
                    <CircularProgress color="inherit" />
                    <Typography variant="h6">Bild wird in höchster Qualität gerendert und gespeichert...</Typography>
                </Backdrop>

                <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
                    <Box>
                        <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', mb: 0 }}>Social Media Generator</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Archivdaten werden dynamisch aus economic_statistics geladen.
                        </Typography>
                    </Box>
                    <Button variant="outlined" startIcon={<RefreshIcon />} onClick={handleRefreshAll} disabled={loadingArchive || loadingGallery}>
                        Aktualisieren
                    </Button>
                </Stack>

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
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                                    <StorageIcon color="primary" />
                                    <Typography variant="subtitle1" fontWeight="bold">Daten-Quelle</Typography>
                                </Stack>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Verfügbare Rohdaten aus der Datenbank. Neueste Zeiträume stehen oben.
                                </Typography>
                                {renderArchiveCard()}
                            </Paper>

                            <Paper sx={{ p: 3, borderRadius: 2 }}>
                                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Konfiguration</Typography>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 2 }}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Land / Markt</InputLabel>
                                        <Select value={country} label="Land / Markt" onChange={(e) => { setCountry(e.target.value); setYear(''); setMonth(''); }}>
                                            {countryOptions.map((option) => (
                                                <MenuItem key={option.code} value={option.code}>{option.label}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>

                                    <Box sx={{ display: 'flex', gap: 2 }}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel>Jahr</InputLabel>
                                            <Select value={year} label="Jahr" onChange={(e) => { setYear(e.target.value); setMonth(''); }} disabled={availableYears.length === 0}>
                                                {availableYears.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                                            </Select>
                                        </FormControl>
                                        <FormControl fullWidth size="small">
                                            <InputLabel>Monat</InputLabel>
                                            <Select value={month} label="Monat" onChange={(e) => setMonth(e.target.value)} disabled={availableMonths.length === 0}>
                                                {availableMonths.map((file) => (
                                                    <MenuItem key={`${file.year}-${file.month}-${file.archive_path}`} value={String(file.month)}>
                                                        {getMonthLabel(file.month)}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Box>

                                    {activeArchiveFile && (
                                        <Alert severity={activeArchiveFile.parser_status === 'pending' ? 'warning' : 'info'} icon={activeArchiveFile.parser_status === 'pending' ? <WarningAmberIcon /> : undefined}>
                                            <Typography variant="body2" fontWeight={800}>{activeArchiveFile.fileName}</Typography>
                                            <Typography variant="caption" display="block">
                                                Quelle: {activeArchiveFile.source_name || 'unbekannt'}
                                                {activeArchiveFile.last_updated ? ` · DB-Update: ${formatDateTime(activeArchiveFile.last_updated)}` : ''}
                                            </Typography>
                                            {activeArchiveFile.parser_note && (
                                                <Typography variant="caption" display="block">{activeArchiveFile.parser_note}</Typography>
                                            )}
                                        </Alert>
                                    )}

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

                                        <ToggleButtonGroup value={colorMode} exclusive onChange={(_, newMode) => { if (newMode) setColorMode(newMode); }} size="small" fullWidth>
                                            <ToggleButton value="light" title="Heller Modus"><LightModeIcon fontSize="small" /></ToggleButton>
                                            <ToggleButton value="dark" title="Dunkler Modus"><DarkModeIcon fontSize="small" /></ToggleButton>
                                        </ToggleButtonGroup>
                                    </Box>

                                    <Button variant="contained" fullWidth size="large" onClick={handleGenerate} disabled={isLoading || loadingArchive || !canGenerate} startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <AutoAwesomeIcon />}>
                                        {isLoading ? 'Generiere...' : 'Daten laden & Vorschau'}
                                    </Button>

                                    {activeArchiveFile && (
                                        <Button variant="outlined" fullWidth onClick={handleDownloadSource} startIcon={<FileDownloadIcon />} sx={{ mt: -1 }}>
                                            Rohdaten öffnen
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
                                            <Stack direction="row" alignItems="center" spacing={1}>
                                                <Typography variant="h6">KI-Post (LinkedIn)</Typography>
                                                <AiContentLabel kind={aiText !== generatedAiText ? 'modified' : 'generated'} size={17} />
                                            </Stack>
                                            <Button variant="outlined" size="small" startIcon={<ContentCopyIcon />} onClick={handleCopyText}>Kopieren</Button>
                                        </Box>
                                        <TextField multiline rows={8} fullWidth value={aiText} onChange={(e) => setAiText(e.target.value)} variant="outlined" />
                                    </Paper>
                                </Box>
                            ) : (
                                <Paper sx={{ p: 5, borderRadius: 2, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f8fafc', border: '1px dashed #cbd5e1' }}>
                                    <Typography color="text.secondary">Bitte wählen Sie einen Zeitraum und klicken Sie auf „Daten laden & Vorschau“.</Typography>
                                </Paper>
                            )}
                        </Grid>
                    </Grid>
                )}

                {activeTab === 1 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <Paper sx={{ p: 4, borderRadius: 2 }}>
                            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ mb: 1 }}>
                                <Typography variant="h5">Ordner: /social-media</Typography>
                                <Chip label={`${galleryFiles.socialMedia.length} Dateien`} color="primary" variant="outlined" />
                            </Stack>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Fertige, generierte Social-Media Posts. Neueste Dateien stehen oben.
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
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, gap: 1 }}>
                                                        <Chip label={item.type} size="small" color="primary" sx={{ fontSize: '0.65rem', height: 20 }} />
                                                        <Chip label={`${item.format} • ${item.size}`} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                                                    </Box>
                                                    <Typography variant="subtitle2" noWrap title={item.name}>{item.name}</Typography>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1, gap: 1 }}>
                                                        <Typography variant="caption" color="text.secondary">{item.dateTime || item.date}</Typography>
                                                        <Button size="small" variant="text" sx={{ minWidth: 'auto', p: 0.5 }} onClick={() => handleCopyUrl(item.rawUrl || item.url)}>URL</Button>
                                                    </Box>
                                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.25 }}>
                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            fullWidth
                                                            startIcon={<VisibilityIcon />}
                                                            onClick={() => handleViewGalleryFile('social-media', item.name)}
                                                        >
                                                            Ansehen
                                                        </Button>
                                                        <Button
                                                            size="small"
                                                            variant="contained"
                                                            fullWidth
                                                            startIcon={<DownloadIcon />}
                                                            onClick={() => handleDownloadGalleryFile('social-media', item.name)}
                                                        >
                                                            Download
                                                        </Button>
                                                    </Stack>
                                                </Box>
                                            </Paper>
                                        </Grid>
                                    ))}
                                </Grid>
                            )}
                        </Paper>

                        <Paper sx={{ p: 4, borderRadius: 2 }}>
                            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ mb: 1 }}>
                                <Typography variant="h5">Ordner: /grafiken</Typography>
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <input
                                        ref={graphicUploadInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,image/avif"
                                        hidden
                                        onChange={handleGraphicUpload}
                                    />
                                    <Button
                                        variant="contained"
                                        size="small"
                                        startIcon={uploadingGraphic ? <CircularProgress size={16} color="inherit" /> : <CloudUploadIcon />}
                                        disabled={uploadingGraphic}
                                        onClick={() => graphicUploadInputRef.current?.click()}
                                    >
                                        {uploadingGraphic ? 'Wird optimiert…' : 'Grafik hochladen'}
                                    </Button>
                                    <Chip label={`${galleryFiles.grafiken.length} Dateien`} variant="outlined" />
                                </Stack>
                            </Stack>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Hintergrundbilder für den Generator. JPEG, PNG, WebP oder AVIF bis 8 MB; Uploads werden automatisch auf maximal 2.000 × 2.000 px verkleinert und als WebP gespeichert.
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
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, gap: 1 }}>
                                                        <Chip label={item.type} size="small" color="default" sx={{ fontSize: '0.65rem', height: 20 }} />
                                                        <Chip label={`${item.format} • ${item.size}`} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                                                    </Box>
                                                    <Typography variant="subtitle2" noWrap title={item.name}>{item.name}</Typography>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                                                        <Typography variant="caption" color="text.secondary">{item.dateTime || item.date}</Typography>
                                                        <Button size="small" variant="text" sx={{ minWidth: 'auto', p: 0.5 }} onClick={() => handleCopyUrl(item.rawUrl || item.url)}>URL</Button>
                                                    </Box>
                                                </Box>
                                            </Paper>
                                        </Grid>
                                    ))}
                                </Grid>
                            )}
                        </Paper>

                        <Paper sx={{ p: 4, borderRadius: 2 }}>
                            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ mb: 1 }}>
                                <Typography variant="h5">Ordner: /logos</Typography>
                                <Chip label={`${galleryFiles.logos.length} Logos`} variant="outlined" />
                            </Stack>
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
                                                    <img src={getImageUrl(logo.rawUrl || `/api/logos/${logo.name}`)} alt={logo.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                                </Box>
                                                <Typography variant="caption" display="block" noWrap>{logo.name}</Typography>
                                                <Typography variant="caption" display="block" color="text.secondary">{logo.format} • {logo.size}</Typography>
                                                <Typography variant="caption" display="block" color="text.secondary">{logo.dateTime || logo.date}</Typography>
                                                <Button size="small" variant="text" sx={{ fontSize: '0.6rem', mt: 0.5 }} onClick={() => handleCopyUrl(logo.rawUrl || `/api/logos/${logo.name}`)}>URL kopieren</Button>
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
