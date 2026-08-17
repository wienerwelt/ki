import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Alert,
    Box,
    Button,
    Chip,
    InputAdornment,
    MenuItem,
    Rating,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import AppsIcon from '@mui/icons-material/Apps';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchIcon from '@mui/icons-material/Search';
import { alpha, useTheme } from '@mui/material/styles';
import apiClient from '../../apiClient';
import { BaseWidgetProps } from '../../types/dashboard.types';
import WidgetPaper from './WidgetPaper';
import { resolveAssetUrl } from '../../utils/assetUrl';

interface SoftwareCategory { id: string; slug: string; name: string; }
interface SoftwareEntry {
    id: string;
    name: string;
    provider_name: string;
    provider_logo_url?: string | null;
    logo_url?: string | null;
    short_description?: string | null;
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
}

interface SoftwareCatalogWidgetProps extends BaseWidgetProps {
    title?: string;
    isPublic?: boolean;
    partnerId?: string;
    primaryColor?: string;
}

const scopeLabel: Record<string, string> = {
    country: 'Landesspezifisch',
    europe: 'Europaweit',
    worldwide: 'Weltweit',
};

const DEFAULT_SOFTWARE_LOGO = '/logos/default-company.svg';
const PUBLIC_SOFTWARE_INITIAL_LIMIT = 8;

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
    const [ratingSavingId, setRatingSavingId] = useState<string | null>(null);
    const [showAllPublicEntries, setShowAllPublicEntries] = useState(false);

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

    const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return entries.filter((entry) => {
            const matchesSearch = !needle || [entry.name, entry.provider_name, entry.short_description]
                .some((value) => String(value || '').toLowerCase().includes(needle));
            const matchesCategory = category === 'all' || (entry.categories || []).some((item) => item.id === category);
            const matchesCoverage = coverage === 'all' || entry.coverage_scope === coverage;
            return matchesSearch && matchesCategory && matchesCoverage;
        });
    }, [entries, search, category, coverage]);

    const visibleEntries = useMemo(() => (
        isPublic && !showAllPublicEntries
            ? filtered.slice(0, PUBLIC_SOFTWARE_INITIAL_LIMIT)
            : filtered
    ), [filtered, isPublic, showAllPublicEntries]);

    useEffect(() => {
        setShowAllPublicEntries(false);
    }, [search, category, coverage, partnerId]);

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

    const handleRating = async (entry: SoftwareEntry, value: number | null) => {
        if (isPublic || !value || ratingSavingId) return;
        setRatingSavingId(entry.id);
        try {
            const response = await apiClient.put(`/api/software/${entry.id}/rating`, { rating: value });
            setEntries((current) => current.map((item) => item.id === entry.id ? {
                ...item,
                my_rating: response.data.my_rating,
                rating_count: response.data.rating_count,
                average_rating: response.data.average_rating,
            } : item));
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

    return (
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
                    <Typography variant="body2" color="text.secondary">Branchensoftware-Suche aus Erfahrungen meiner Community.</Typography>
                    <Chip size="small" label={`${filtered.length} Treffer`} sx={{ bgcolor: alpha(accent, 0.12), color: accent, fontWeight: 900 }} />
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) repeat(2, minmax(140px, 1fr))', gap: 1.3, '@container (max-width: 680px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }, '@container (max-width: 380px)': { gridTemplateColumns: 'minmax(0, 1fr)' } }}>
                    <Box sx={{ minWidth: 0, '@container (max-width: 680px)': { gridColumn: '1 / -1' } }}>
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
                                                <Typography variant="caption" color="text.secondary" noWrap>{entry.provider_name}</Typography>
                                            </Box>
                                        </Stack>
                                        {entry.is_featured && <Chip size="small" label="Empfohlen" sx={{ bgcolor: alpha(accent, 0.1), color: accent, fontWeight: 900 }} />}
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
                                        {!isPublic && <Typography variant="caption" color="text.secondary">{entry.my_rating ? `Deine Bewertung: ${entry.my_rating}/5` : 'Jetzt bewerten'}</Typography>}
                                    </Stack>
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
                    </Stack>
                )}
            </Stack>
        </WidgetPaper>
    );
};

export default SoftwareCatalogWidget;
