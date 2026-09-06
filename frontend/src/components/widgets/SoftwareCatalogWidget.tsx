import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    InputAdornment,
    MenuItem,
    FormControlLabel,
    Radio,
    RadioGroup,
    Rating,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import AppsIcon from '@mui/icons-material/Apps';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchIcon from '@mui/icons-material/Search';
import { alpha, useTheme } from '@mui/material/styles';
import apiClient from '../../apiClient';
import { BaseWidgetProps } from '../../types/dashboard.types';
import WidgetPaper from './WidgetPaper';
import { resolveAssetUrl } from '../../utils/assetUrl';
import {
    EXPERIENCE_LEVEL_OPTIONS,
    ExperienceLevel,
    getExperienceLevelLabel,
} from '../../utils/experienceLevel';

interface SoftwareCategory { id: string; slug: string; name: string; }
interface SoftwareEntry {
    id: string;
    provider_id: string;
    name: string;
    provider_name: string;
    provider_logo_url?: string | null;
    logo_url?: string | null;
    short_description?: string | null;
    description?: string | null;
    product_url?: string | null;
    coverage_scope: 'country' | 'europe' | 'worldwide';
    country_codes?: string[];
    deployment_model?: string | null;
    pricing_model?: string | null;
    target_group?: string | null;
    is_featured?: boolean;
    categories?: SoftwareCategory[];
    experience_count: number;
    rating_count: number;
    average_rating: number | string;
    my_rating?: number | null;
    my_experience_level?: ExperienceLevel | null;
    in_use_count?: number;
    evaluated_count?: number;
    general_count?: number;
    created_at?: string;
}

interface SoftwareCatalogWidgetProps extends BaseWidgetProps {
    title?: string;
    isPublic?: boolean;
    partnerId?: string;
    primaryColor?: string;
    onProviderOpen?: (providerId: string) => void;
    standalone?: boolean;
    onTotalChange?: (total: number) => void;
}

const scopeLabel: Record<string, string> = {
    country: 'Landesspezifisch',
    europe: 'Europaweit',
    worldwide: 'Weltweit',
};

const DEFAULT_SOFTWARE_LOGO = '/logos/default-company.svg';
const PUBLIC_SOFTWARE_INITIAL_LIMIT = 8;
const INTERNAL_WIDGET_LIMIT = 6;

const SoftwareLogo: React.FC<{ src?: string | null; name: string }> = ({ src, name }) => {
    const [hasError, setHasError] = useState(false);

    useEffect(() => setHasError(false), [src]);

    return (
        <Box
            component="img"
            src={!src || hasError ? DEFAULT_SOFTWARE_LOGO : resolveAssetUrl(src)}
            alt={`${name} Logo`}
            onError={() => setHasError(true)}
            sx={{ width: '85%', height: '85%', objectFit: 'contain' }}
        />
    );
};

const SoftwareCatalogWidget: React.FC<SoftwareCatalogWidgetProps> = ({
    widgetId,
    onDelete,
    isRemovable,
    title = 'Software-Lexikon',
    isPublic = false,
    partnerId,
    primaryColor,
    onProviderOpen,
    standalone = false,
    onTotalChange,
}) => {
    const theme = useTheme();
    const navigate = useNavigate();
    const accent = primaryColor || theme.palette.primary.main;
    const [entries, setEntries] = useState<SoftwareEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('all');
    const [coverage, setCoverage] = useState('all');
    const [pricing, setPricing] = useState('all');
    const [ratingSavingId, setRatingSavingId] = useState<string | null>(null);
    const [showAllPublicEntries, setShowAllPublicEntries] = useState(false);
    const [selectedSoftware, setSelectedSoftware] = useState<SoftwareEntry | null>(null);
    const [pendingRating, setPendingRating] = useState<{ entry: SoftwareEntry; rating: number } | null>(null);
    const [pendingExperienceLevel, setPendingExperienceLevel] = useState<ExperienceLevel | ''>('');

    const load = useCallback(async () => {
        if (isPublic && !partnerId) {
            setEntries([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const response = await apiClient.get(isPublic ? '/api/public/software' : '/api/software', {
                params: isPublic ? { partnerId, limit: 100 } : {},
            });
            setEntries(response.data?.data || []);
            setError(null);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Software-Katalog konnte nicht geladen werden.');
        } finally {
            setLoading(false);
        }
    }, [isPublic, partnerId]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        onTotalChange?.(entries.length);
    }, [entries.length, onTotalChange]);

    const categories = useMemo(() => {
        const byId = new Map<string, SoftwareCategory & { count: number }>();
        entries.forEach((entry) => (entry.categories || []).forEach((item) => {
            const current = byId.get(item.id);
            byId.set(item.id, { ...item, count: (current?.count || 0) + 1 });
        }));
        return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    }, [entries]);

    const coverageCounts = useMemo(() => entries.reduce<Record<string, number>>((counts, entry) => {
        counts[entry.coverage_scope] = (counts[entry.coverage_scope] || 0) + 1;
        return counts;
    }, {}), [entries]);

    const pricingModels = useMemo(() => {
        const counts = new Map<string, number>();
        entries.forEach((entry) => {
            const value = String(entry.pricing_model || '').trim();
            if (value) counts.set(value, (counts.get(value) || 0) + 1);
        });
        return Array.from(counts.entries())
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => a.value.localeCompare(b.value, 'de'));
    }, [entries]);

    const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return entries.filter((entry) => {
            const matchesSearch = !needle || [entry.name, entry.provider_name, entry.short_description]
                .some((value) => String(value || '').toLowerCase().includes(needle));
            const matchesCategory = category === 'all' || (entry.categories || []).some((item) => item.id === category);
            const matchesCoverage = coverage === 'all' || entry.coverage_scope === coverage;
            const matchesPricing = pricing === 'all' || String(entry.pricing_model || '').trim() === pricing;
            return matchesSearch && matchesCategory && matchesCoverage && matchesPricing;
        });
    }, [entries, search, category, coverage, pricing]);

    const visibleEntries = useMemo(() => {
        if (isPublic && !showAllPublicEntries) return filtered.slice(0, PUBLIC_SOFTWARE_INITIAL_LIMIT);
        if (!isPublic && !standalone) return filtered.slice(0, INTERNAL_WIDGET_LIMIT);
        return filtered;
    }, [filtered, isPublic, showAllPublicEntries, standalone]);

    useEffect(() => {
        setShowAllPublicEntries(false);
    }, [search, category, coverage, pricing, partnerId]);

    const handleTogglePublicEntries = () => {
        if (showAllPublicEntries) {
            setShowAllPublicEntries(false);
            window.requestAnimationFrame(() => {
                document.getElementById('software-lexikon')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            return;
        }
        setShowAllPublicEntries(true);
    };

    const handleRating = (entry: SoftwareEntry, value: number | null) => {
        if (isPublic || !value || ratingSavingId) return;
        setPendingRating({ entry, rating: value });
        setPendingExperienceLevel(entry.my_experience_level || '');
    };

    const saveRating = async () => {
        if (!pendingRating || !pendingExperienceLevel || ratingSavingId) return;
        const { entry, rating } = pendingRating;
        setRatingSavingId(entry.id);
        try {
            const response = await apiClient.put(`/api/software/${entry.id}/rating`, {
                rating,
                experienceLevel: pendingExperienceLevel,
            });
            setEntries((current) => current.map((item) => item.id === entry.id ? {
                ...item,
                my_rating: response.data.my_rating,
                my_experience_level: response.data.my_experience_level,
                rating_count: response.data.rating_count,
                average_rating: response.data.average_rating,
                in_use_count: response.data.in_use_count,
                evaluated_count: response.data.evaluated_count,
                general_count: response.data.general_count,
            } : item));
            setPendingRating(null);
            setPendingExperienceLevel('');
            setError(null);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Bewertung konnte nicht gespeichert werden.');
        } finally {
            setRatingSavingId(null);
        }
    };

    const handleCategoryFilter = (categoryId: string) => {
        setCategory(categoryId);
        document.getElementById('software-lexikon')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const handleProviderOpen = (providerId: string) => {
        setSelectedSoftware(null);
        onProviderOpen?.(providerId);
    };

    return (
        <>
        <WidgetPaper
            title={<Stack direction="row" alignItems="center"><AppsIcon /><Typography variant="h6">{title}</Typography></Stack>}
            widgetTitle={title}
            widgetTypeKey="SoftwareCatalog"
            widgetId={widgetId || ''}
            onDelete={onDelete}
            isRemovable={!!isRemovable}
            loading={loading}
            error={error}
            isPublic={isPublic}
            publicHeaderColor={isPublic ? accent : undefined}
        >
            <Stack spacing={2} sx={{ containerType: 'inline-size', p: { xs: 0.5, sm: 1 }, borderRadius: 3, background: isPublic ? `linear-gradient(145deg, ${alpha(accent, 0.09)}, ${alpha(accent, 0.025)} 55%, ${alpha(theme.palette.info.main, 0.06)})` : 'transparent' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: { xs: 'flex-start', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' } }}>
                    <Box>
                        <Typography variant="body2" color="text.secondary">Branchensoftware-Suche aus Erfahrungen meiner Community.</Typography>
                        {!isPublic && !standalone && <Typography variant="caption" color="text.secondary">Kompakte Auswahl – der vollständige Katalog ist unter Branchenlösungen verfügbar.</Typography>}
                    </Box>
                    <Stack direction="row" spacing={0.7} useFlexGap flexWrap="wrap">
                        {!isPublic && <Chip size="small" label="Für meine Branche" color="success" variant="outlined" sx={{ fontWeight: 800 }} />}
                        <Chip size="small" label={`${filtered.length} Treffer`} sx={{ bgcolor: alpha(accent, 0.12), color: accent, fontWeight: 900 }} />
                    </Stack>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: standalone ? 'minmax(0, 2fr) repeat(3, minmax(140px, 1fr))' : 'minmax(0, 2fr) repeat(2, minmax(140px, 1fr))', gap: 1.3, '@container (max-width: 820px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }, '@container (max-width: 420px)': { gridTemplateColumns: 'minmax(0, 1fr)' } }}>
                    <Box sx={{ minWidth: 0, '@container (max-width: 820px)': { gridColumn: '1 / -1' } }}>
                        <TextField fullWidth size={isPublic ? 'medium' : 'small'} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Software oder Anbieter suchen" inputProps={{ maxLength: 120 }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} sx={{ '& .MuiOutlinedInput-root': { minHeight: isPublic ? 56 : 48, borderRadius: 2, bgcolor: '#fff' } }} />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                        <Select fullWidth size={isPublic ? 'medium' : 'small'} value={category} onChange={(event) => setCategory(event.target.value)} sx={{ minHeight: isPublic ? 56 : 48, borderRadius: 2, bgcolor: '#fff' }}>
                            <MenuItem value="all">Alle Kategorien ({entries.length})</MenuItem>
                            {categories.map((item) => <MenuItem key={item.id} value={item.id}>{item.name} ({item.count})</MenuItem>)}
                        </Select>
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                        <Select fullWidth size={isPublic ? 'medium' : 'small'} value={coverage} onChange={(event) => setCoverage(event.target.value)} sx={{ minHeight: isPublic ? 56 : 48, borderRadius: 2, bgcolor: '#fff' }}>
                            <MenuItem value="all">Alle Regionen ({entries.length})</MenuItem>
                            <MenuItem value="country">Landesspezifisch ({coverageCounts.country || 0})</MenuItem>
                            <MenuItem value="europe">Europaweit ({coverageCounts.europe || 0})</MenuItem>
                            <MenuItem value="worldwide">Weltweit ({coverageCounts.worldwide || 0})</MenuItem>
                        </Select>
                    </Box>
                    {standalone && (
                        <Box sx={{ minWidth: 0 }}>
                            <Select fullWidth size="small" value={pricing} onChange={(event) => setPricing(event.target.value)} sx={{ minHeight: 48, borderRadius: 2, bgcolor: '#fff' }}>
                                <MenuItem value="all">Alle Preismodelle ({entries.length})</MenuItem>
                                {pricingModels.map((item) => (
                                    <MenuItem key={item.value} value={item.value}>{item.value} ({item.count})</MenuItem>
                                ))}
                            </Select>
                        </Box>
                    )}
                </Box>

                {error ? <Alert severity="error">{error}</Alert> : (
                    <Stack spacing={2}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 1.8 }}>
                        {visibleEntries.map((entry) => (
                            <Box key={entry.id} sx={{ minWidth: 0 }}>
                                <Box sx={{ p: 2, minWidth: 0, height: '100%', borderRadius: 3, border: `1px solid ${alpha(accent, 0.2)}`, borderTop: `4px solid ${entry.is_featured ? accent : alpha(accent, 0.38)}`, bgcolor: 'background.paper', boxShadow: `0 12px 28px ${alpha(accent, 0.08)}`, display: 'flex', flexDirection: 'column' }}>
                                    <Stack direction="row" justifyContent="space-between" spacing={1.2} alignItems="flex-start">
                                        <Stack direction="row" spacing={1.2} sx={{ minWidth: 0 }}>
                                            <Box sx={{ width: 46, height: 46, flexShrink: 0, borderRadius: 2, bgcolor: alpha(accent, 0.08), display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                                                <SoftwareLogo src={entry.logo_url || entry.provider_logo_url} name={entry.name} />
                                            </Box>
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography fontWeight={950} noWrap>{entry.name}</Typography>
                                                {onProviderOpen ? (
                                                    <Button
                                                        size="small"
                                                        onClick={() => onProviderOpen(entry.provider_id)}
                                                        sx={{ minWidth: 0, p: 0, justifyContent: 'flex-start', textTransform: 'none', color: 'text.secondary', fontSize: '0.75rem', lineHeight: 1.3, maxWidth: '100%' }}
                                                    >
                                                        <Typography variant="caption" noWrap>{entry.provider_name}</Typography>
                                                    </Button>
                                                ) : (
                                                    <Typography variant="caption" color="text.secondary" noWrap>{entry.provider_name}</Typography>
                                                )}
                                            </Box>
                                        </Stack>
                                        <Stack spacing={0.5} alignItems="flex-end">
                                            {entry.is_featured && <Chip size="small" label="Empfohlen" sx={{ bgcolor: alpha(accent, 0.1), color: accent, fontWeight: 900 }} />}
                                            {Number(entry.rating_count || 0) === 0 && <Chip size="small" label="Noch ohne Bewertung" variant="outlined" />}
                                        </Stack>
                                    </Stack>
                                    <Stack direction="row" spacing={0.6} useFlexGap flexWrap="wrap" sx={{ my: 1.4 }}>
                                        <Chip size="small" variant="outlined" label={scopeLabel[entry.coverage_scope] || entry.coverage_scope} />
                                        {(entry.country_codes || []).slice(0, 4).map((code) => <Chip key={code} size="small" label={code} />)}
                                        {(entry.categories || []).slice(0, 2).map((item) => (
                                            <Chip
                                                key={item.id}
                                                size="small"
                                                clickable
                                                label={item.name}
                                                onClick={() => handleCategoryFilter(item.id)}
                                                color={category === item.id ? 'primary' : 'default'}
                                                sx={{ fontWeight: 800, '&:hover': { bgcolor: alpha(accent, 0.14) } }}
                                            />
                                        ))}
                                    </Stack>
                                    <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{entry.short_description || 'Details folgen.'}</Typography>
                                    <Stack spacing={0.35} sx={{ mt: 1.5 }}>
                                        <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
                                            <Rating
                                                value={isPublic ? Number(entry.average_rating || 0) : Number(entry.my_rating || 0)}
                                                precision={isPublic ? 0.1 : 1}
                                                readOnly={isPublic}
                                                disabled={ratingSavingId === entry.id}
                                                onChange={(_, value) => handleRating(entry, value)}
                                                size="small"
                                            />
                                            <Typography variant="caption" fontWeight={800} sx={{ whiteSpace: 'nowrap' }}>{entry.rating_count || 0} Bewertungen · Ø {Number(entry.average_rating || 0).toFixed(1)}</Typography>
                                        </Stack>
                                        {!isPublic && (
                                            <Stack direction="row" spacing={0.6} useFlexGap flexWrap="wrap" alignItems="center">
                                                <Typography variant="caption" color="text.secondary">{entry.my_rating ? `Deine Bewertung: ${entry.my_rating}/5` : 'Jetzt bewerten'}</Typography>
                                                {getExperienceLevelLabel(entry.my_experience_level, true) && (
                                                    <Chip size="small" label={getExperienceLevelLabel(entry.my_experience_level, true)} color={entry.my_experience_level === 'in_use' ? 'success' : entry.my_experience_level === 'evaluated' ? 'info' : 'default'} variant="outlined" />
                                                )}
                                            </Stack>
                                        )}
                                    </Stack>
                                    {(Number(entry.in_use_count) > 0 || Number(entry.evaluated_count) > 0 || Number(entry.general_count) > 0) && (
                                        <Stack direction="row" spacing={0.6} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                                            {Number(entry.in_use_count) > 0 && <Chip size="small" label={`${entry.in_use_count} im Einsatz`} color="success" variant="outlined" />}
                                            {Number(entry.evaluated_count) > 0 && <Chip size="small" label={`${entry.evaluated_count} evaluiert`} color="info" variant="outlined" />}
                                            {Number(entry.general_count) > 0 && <Chip size="small" label={`${entry.general_count} allgemein`} variant="outlined" />}
                                        </Stack>
                                    )}
                                    {isPublic && (
                                        <Box sx={{ mt: 1.2, p: 1.1, borderRadius: 2, bgcolor: alpha(accent, 0.055), overflow: 'hidden' }}>
                                            <Stack direction="row" spacing={0.7} alignItems="center"><LockOutlinedIcon sx={{ fontSize: 15, color: accent }} /><Typography variant="caption" fontWeight={800}>{entry.experience_count || 0} Erfahrungsbeiträge aus der Mitglieder-Community</Typography></Stack>
                                            <Box sx={{ mt: 0.7, filter: 'blur(3px)', opacity: 0.38 }}>
                                                <Box sx={{ height: 6, width: '92%', bgcolor: 'text.secondary', borderRadius: 1, mb: 0.5 }} />
                                                <Box sx={{ height: 6, width: '68%', bgcolor: 'text.secondary', borderRadius: 1 }} />
                                            </Box>
                                        </Box>
                                    )}
                                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.2 }}>
                                        <Button onClick={() => setSelectedSoftware(entry)} startIcon={<InfoOutlinedIcon />} sx={{ textTransform: 'none', fontWeight: 900, color: accent }}>Details</Button>
                                        {entry.product_url && <Button href={entry.product_url} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewIcon />} sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 900, color: accent }}>Produktseite</Button>}
                                        {!isPublic && <Button onClick={() => navigate('/community', { state: { defaultTab: 'feed', softwareToolId: entry.id } })} sx={{ textTransform: 'none', fontWeight: 900 }}>Erfahrung teilen</Button>}
                                    </Stack>
                                </Box>
                            </Box>
                        ))}
                        {filtered.length === 0 && <Alert severity="info">Keine passende Software gefunden.</Alert>}
                    </Box>
                    {isPublic && filtered.length > PUBLIC_SOFTWARE_INITIAL_LIMIT && (
                        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                            <Button
                                variant={showAllPublicEntries ? 'outlined' : 'contained'}
                                onClick={handleTogglePublicEntries}
                                sx={{
                                    minWidth: 180,
                                    borderRadius: 999,
                                    textTransform: 'none',
                                    fontWeight: 900,
                                    bgcolor: showAllPublicEntries ? 'transparent' : accent,
                                    borderColor: accent,
                                    color: showAllPublicEntries ? accent : theme.palette.getContrastText(accent),
                                    '&:hover': {
                                        bgcolor: showAllPublicEntries ? alpha(accent, 0.08) : alpha(accent, 0.88),
                                        borderColor: accent,
                                    },
                                }}
                            >
                                {showAllPublicEntries ? 'Weniger' : 'Weiter laden'}
                            </Button>
                        </Box>
                    )}
                    {!isPublic && !standalone && (
                        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                            <Button
                                variant="contained"
                                onClick={() => navigate('/directory?bereich=software')}
                                sx={{ borderRadius: 999, px: 3, textTransform: 'none', fontWeight: 900 }}
                            >
                                Gesamtes Lexikon öffnen
                            </Button>
                        </Box>
                    )}
                    </Stack>
                )}
            </Stack>
        </WidgetPaper>

        <Dialog open={Boolean(selectedSoftware)} onClose={() => setSelectedSoftware(null)} fullWidth maxWidth="md">
            {selectedSoftware && (
                <>
                    <DialogTitle sx={{ pr: 7, bgcolor: accent, color: theme.palette.getContrastText(accent) }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <Box sx={{ width: 58, height: 58, flexShrink: 0, borderRadius: 2, bgcolor: '#fff', display: 'grid', placeItems: 'center', overflow: 'hidden', p: 0.5 }}>
                                <SoftwareLogo src={selectedSoftware.logo_url || selectedSoftware.provider_logo_url} name={selectedSoftware.name} />
                            </Box>
                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="h5" fontWeight={950}>{selectedSoftware.name}</Typography>
                                <Typography variant="body2" sx={{ opacity: 0.85 }}>{selectedSoftware.provider_name}</Typography>
                            </Box>
                        </Stack>
                        <IconButton
                            aria-label="Software-Details schließen"
                            onClick={() => setSelectedSoftware(null)}
                            sx={{ position: 'absolute', right: 12, top: 12, color: 'inherit' }}
                        >
                            <CloseIcon />
                        </IconButton>
                    </DialogTitle>
                    <DialogContent dividers sx={{ p: { xs: 2, sm: 3 } }}>
                        <Stack spacing={2.5}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap" alignItems={{ xs: 'stretch', sm: 'center' }}>
                                {onProviderOpen && (
                                    <Button
                                        variant="outlined"
                                        startIcon={<BusinessOutlinedIcon />}
                                        onClick={() => handleProviderOpen(selectedSoftware.provider_id)}
                                        sx={{ textTransform: 'none', fontWeight: 900, borderColor: accent, color: accent }}
                                    >
                                        Anbieter im Branchenverzeichnis
                                    </Button>
                                )}
                                {selectedSoftware.product_url && (
                                    <Button
                                        variant="contained"
                                        href={selectedSoftware.product_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        endIcon={<OpenInNewIcon />}
                                        sx={{ textTransform: 'none', fontWeight: 900, bgcolor: accent }}
                                    >
                                        Produktseite öffnen
                                    </Button>
                                )}
                            </Stack>

                            <Box>
                                <Typography variant="subtitle1" fontWeight={950} gutterBottom>Über die Software</Typography>
                                <Typography variant="body1" sx={{ whiteSpace: 'pre-line', lineHeight: 1.7 }}>
                                    {selectedSoftware.description || selectedSoftware.short_description || 'Weitere Produktdetails folgen.'}
                                </Typography>
                            </Box>

                            <Divider />

                            <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
                                {selectedSoftware.is_featured && <Chip label="Empfohlen" sx={{ bgcolor: alpha(accent, 0.12), color: accent, fontWeight: 900 }} />}
                                <Chip variant="outlined" label={scopeLabel[selectedSoftware.coverage_scope] || selectedSoftware.coverage_scope} />
                                {(selectedSoftware.country_codes || []).map((code) => <Chip key={code} label={code} />)}
                                {(selectedSoftware.categories || []).map((item) => (
                                    <Chip
                                        key={item.id}
                                        clickable
                                        label={item.name}
                                        onClick={() => { setSelectedSoftware(null); handleCategoryFilter(item.id); }}
                                        sx={{ fontWeight: 800 }}
                                    />
                                ))}
                            </Stack>

                            {(selectedSoftware.deployment_model || selectedSoftware.pricing_model || selectedSoftware.target_group) && (
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1.2 }}>
                                    {selectedSoftware.deployment_model && <Box><Typography variant="caption" color="text.secondary">Bereitstellung</Typography><Typography fontWeight={800}>{selectedSoftware.deployment_model}</Typography></Box>}
                                    {selectedSoftware.pricing_model && <Box><Typography variant="caption" color="text.secondary">Preismodell</Typography><Typography fontWeight={800}>{selectedSoftware.pricing_model}</Typography></Box>}
                                    {selectedSoftware.target_group && <Box><Typography variant="caption" color="text.secondary">Zielgruppe</Typography><Typography fontWeight={800}>{selectedSoftware.target_group}</Typography></Box>}
                                </Box>
                            )}

                            <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: alpha(accent, 0.065) }}>
                                <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
                                    <Rating value={Number(selectedSoftware.average_rating || 0)} precision={0.1} readOnly />
                                    <Typography fontWeight={900}>{selectedSoftware.rating_count || 0} Bewertungen · Ø {Number(selectedSoftware.average_rating || 0).toFixed(1)}</Typography>
                                </Stack>
                                {(Number(selectedSoftware.in_use_count) > 0 || Number(selectedSoftware.evaluated_count) > 0 || Number(selectedSoftware.general_count) > 0) && (
                                    <Stack direction="row" spacing={0.7} useFlexGap flexWrap="wrap" sx={{ mt: 1.2 }}>
                                        {Number(selectedSoftware.in_use_count) > 0 && <Chip size="small" label={`${selectedSoftware.in_use_count} im Einsatz`} color="success" variant="outlined" />}
                                        {Number(selectedSoftware.evaluated_count) > 0 && <Chip size="small" label={`${selectedSoftware.evaluated_count} evaluiert`} color="info" variant="outlined" />}
                                        {Number(selectedSoftware.general_count) > 0 && <Chip size="small" label={`${selectedSoftware.general_count} allgemein`} variant="outlined" />}
                                    </Stack>
                                )}
                                <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mt: 1 }}>
                                    {isPublic && <LockOutlinedIcon sx={{ fontSize: 17, color: accent }} />}
                                    <Typography variant="body2" fontWeight={800}>{selectedSoftware.experience_count || 0} Erfahrungsbeiträge aus der Mitglieder-Community</Typography>
                                </Stack>
                                {isPublic ? (
                                    <Box sx={{ mt: 1, filter: 'blur(3px)', opacity: 0.38 }}>
                                        <Box sx={{ height: 7, width: '94%', bgcolor: 'text.secondary', borderRadius: 1, mb: 0.7 }} />
                                        <Box sx={{ height: 7, width: '72%', bgcolor: 'text.secondary', borderRadius: 1 }} />
                                    </Box>
                                ) : (
                                    <Button
                                        size="small"
                                        onClick={() => navigate('/community', { state: { defaultTab: 'feed', softwareToolId: selectedSoftware.id } })}
                                        sx={{ mt: 1, px: 0, textTransform: 'none', fontWeight: 900 }}
                                    >
                                        Eigene Erfahrung teilen
                                    </Button>
                                )}
                            </Box>
                        </Stack>
                    </DialogContent>
                </>
            )}
        </Dialog>

        <Dialog
            open={Boolean(pendingRating)}
            onClose={() => { if (!ratingSavingId) { setPendingRating(null); setPendingExperienceLevel(''); } }}
            fullWidth
            maxWidth="sm"
        >
            <DialogTitle sx={{ pr: 7 }}>
                Bewertung einordnen
                <IconButton
                    aria-label="Bewertung schließen"
                    onClick={() => { setPendingRating(null); setPendingExperienceLevel(''); }}
                    disabled={Boolean(ratingSavingId)}
                    sx={{ position: 'absolute', right: 12, top: 12 }}
                >
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers>
                {pendingRating && (
                    <Stack spacing={2}>
                        <Box>
                            <Typography fontWeight={900}>{pendingRating.entry.name}</Typography>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.75 }}>
                                <Rating value={pendingRating.rating} readOnly />
                                <Typography variant="body2">{pendingRating.rating} von 5 Sternen</Typography>
                            </Stack>
                        </Box>
                        <Box>
                            <Typography variant="subtitle2" fontWeight={900} gutterBottom>
                                Worauf beruht Ihre Bewertung? *
                            </Typography>
                            <RadioGroup
                                value={pendingExperienceLevel}
                                onChange={(event) => setPendingExperienceLevel(event.target.value as ExperienceLevel)}
                            >
                                {EXPERIENCE_LEVEL_OPTIONS.map((option) => (
                                    <FormControlLabel
                                        key={option.value}
                                        value={option.value}
                                        control={<Radio />}
                                        label={
                                            <Box sx={{ py: 0.5 }}>
                                                <Typography fontWeight={800}>{option.label}</Typography>
                                                <Typography variant="caption" color="text.secondary">{option.description}</Typography>
                                            </Box>
                                        }
                                    />
                                ))}
                            </RadioGroup>
                        </Box>
                    </Stack>
                )}
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                <Button onClick={() => { setPendingRating(null); setPendingExperienceLevel(''); }} disabled={Boolean(ratingSavingId)}>
                    Abbrechen
                </Button>
                <Button variant="contained" onClick={saveRating} disabled={!pendingExperienceLevel || Boolean(ratingSavingId)}>
                    Bewertung speichern
                </Button>
            </DialogActions>
        </Dialog>
        </>
    );
};

export default SoftwareCatalogWidget;
