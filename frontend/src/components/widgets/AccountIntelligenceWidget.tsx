import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Avatar,
    Box,
    Button,
    Chip,
    CircularProgress,
    IconButton,
    LinearProgress,
    Paper,
    Stack,
    Tooltip,
    Typography,
    useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RadarIcon from '@mui/icons-material/Radar';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScheduleIcon from '@mui/icons-material/Schedule';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import VisibilityIcon from '@mui/icons-material/Visibility';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { resolveAssetUrl } from '../../utils/assetUrl';

const DEFAULT_ACCOUNT_LOGO = '/logos/default-company.svg';

type ArticleStatus = 'new' | 'read' | 'done' | 'ignored';

interface NewsArticle {
    id: string;
    account_id?: string;
    article_title: string;
    article_url: string;
    source_name?: string | null;
    source_domain?: string | null;
    published_at: string;
    competitor_name?: string | null;
    signal_type?: string | null;
    recommended_action?: string | null;
    relevance_score?: number | null;
    status?: ArticleStatus;
    action_type?: 'contact_planned' | 'follow_up' | null;
    follow_up_at?: string | null;
}

interface AccountIntelligenceData {
    id: string;
    name: string;
    logo_url?: string | null;
    account_news: NewsArticle[];
    competitor_news: NewsArticle[];
}

interface DashboardSignal extends NewsArticle {
    account_name: string;
    account_logo_url?: string | null;
    type: 'account' | 'competitor';
}

interface AccountIntelligenceWidgetProps extends BaseWidgetProps {
    icon?: React.ReactNode;
    config?: { title?: string };
}

const getStatus = (signal: NewsArticle): ArticleStatus => signal.status || 'new';

const isFuturePlanned = (signal: NewsArticle) => Boolean(
    signal.action_type
    && signal.follow_up_at
    && new Date(signal.follow_up_at).getTime() > Date.now()
);

const isOpen = (signal: NewsArticle) => {
    const status = getStatus(signal);
    return status !== 'done' && status !== 'ignored';
};

const formatDate = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });
};

const safeWebUrl = (value?: string | null) => {
    try {
        const parsed = new URL(String(value || ''));
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
    } catch {
        return '';
    }
};

const AccountIntelligenceWidget: React.FC<AccountIntelligenceWidgetProps> = ({
    widgetId,
    onDelete,
    isRemovable,
    widgetTypeKey,
    config,
    icon: propsIcon,
}) => {
    const theme = useTheme();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [data, setData] = useState<AccountIntelligenceData[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [savingSignalId, setSavingSignalId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const title = config?.title || 'Sales-Cockpit';
    const icon = propsIcon || <RadarIcon />;
    const canManageAccounts = user?.role === 'admin' || user?.role === 'assistenz';

    const fetchData = useCallback(async (manual = false) => {
        if (manual) setRefreshing(true);
        else setLoading(true);
        setError(null);
        try {
            const response = await apiClient.get<AccountIntelligenceData[]>('/api/data/account-intelligence', {
                params: { limitPerGroup: 20, periodDays: 30 },
            });
            if (!response.res.ok) throw new Error((response.data as any)?.message || 'Sales-Cockpit konnte nicht geladen werden.');
            setData(Array.isArray(response.data) ? response.data : []);
        } catch (loadError: any) {
            setError(loadError?.message || 'Sales-Cockpit konnte nicht geladen werden.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData(false);
    }, [fetchData]);

    const signals = useMemo<DashboardSignal[]>(() => data.flatMap((account) => [
        ...(account.account_news || []).map((signal) => ({
            ...signal,
            account_name: account.name,
            account_logo_url: account.logo_url,
            type: 'account' as const,
        })),
        ...(account.competitor_news || []).map((signal) => ({
            ...signal,
            account_name: account.name,
            account_logo_url: account.logo_url,
            type: 'competitor' as const,
        })),
    ]), [data]);

    const metrics = useMemo(() => {
        const active = signals.filter(isOpen);
        const due = active.filter((signal) => !isFuturePlanned(signal));
        return {
            due: due.length,
            newSignals: due.filter((signal) => getStatus(signal) === 'new').length,
            planned: active.filter(isFuturePlanned).length,
        };
    }, [signals]);

    const prioritySignals = useMemo(() => signals
        .filter((signal) => isOpen(signal) && !isFuturePlanned(signal))
        .sort((left, right) => {
            const newDifference = Number(getStatus(right) === 'new') - Number(getStatus(left) === 'new');
            if (newDifference !== 0) return newDifference;
            const relevanceDifference = Number(right.relevance_score || 0) - Number(left.relevance_score || 0);
            if (relevanceDifference !== 0) return relevanceDifference;
            return new Date(right.published_at).getTime() - new Date(left.published_at).getTime();
        })
        .slice(0, 5), [signals]);

    const updateStatus = async (signalId: string, status: 'read' | 'done') => {
        const previous = data;
        setSavingSignalId(signalId);
        setData((current) => current.map((account) => ({
            ...account,
            account_news: (account.account_news || []).map((signal) => signal.id === signalId ? { ...signal, status } : signal),
            competitor_news: (account.competitor_news || []).map((signal) => signal.id === signalId ? { ...signal, status } : signal),
        })));
        try {
            const response = await apiClient.request(`/api/data/account-intelligence/articles/${signalId}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status }),
            });
            if (!response.res.ok) throw new Error((response.data as any)?.message || 'Status konnte nicht gespeichert werden.');
        } catch (saveError: any) {
            setData(previous);
            setError(saveError?.message || 'Status konnte nicht gespeichert werden.');
        } finally {
            setSavingSignalId(null);
        }
    };

    const openSource = (signal: DashboardSignal) => {
        const sourceUrl = safeWebUrl(signal.article_url);
        if (!sourceUrl) {
            setError('Die Quelle enthält keine gültige Webadresse.');
            return;
        }
        if (getStatus(signal) === 'new') updateStatus(signal.id, 'read');
        window.open(sourceUrl, '_blank', 'noopener,noreferrer');
    };

    const goToAccounts = () => {
        if (user?.business_partner_id) navigate(`/admin/business-partners/${user.business_partner_id}/accounts`);
        else navigate('/admin/business-partners');
    };

    const metricCards = [
        { label: 'Handlungsbedarf', value: metrics.due, icon: <LocalFireDepartmentIcon />, color: theme.palette.error.main },
        { label: 'Neue Signale', value: metrics.newSignals, icon: <NewReleasesIcon />, color: theme.palette.primary.main },
        { label: 'Kontakte geplant', value: metrics.planned, icon: <ScheduleIcon />, color: theme.palette.info.main },
    ];

    const renderContent = () => {
        if (loading) return <Box sx={{ minHeight: 220, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
        if (error && data.length === 0) {
            return <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => fetchData(true)}>Erneut</Button>}>{error}</Alert>;
        }

        return (
            <Stack sx={{ height: '100%', minHeight: 0 }}>
                {refreshing && <LinearProgress />}
                {error && <Alert severity="warning" sx={{ m: 1, mb: 0 }}>{error}</Alert>}

                <Box sx={{ p: 1.25, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
                    {metricCards.map((metric) => (
                        <Paper
                            key={metric.label}
                            variant="outlined"
                            onClick={() => navigate('/radar')}
                            sx={{
                                p: 1.15,
                                borderRadius: 2.5,
                                cursor: 'pointer',
                                borderColor: alpha(metric.color, 0.25),
                                background: `linear-gradient(135deg, ${alpha(metric.color, 0.12)}, ${alpha(metric.color, 0.025)})`,
                                '&:hover': { borderColor: alpha(metric.color, 0.55), transform: 'translateY(-1px)' },
                                transition: 'transform 160ms ease, border-color 160ms ease',
                            }}
                        >
                            <Stack direction="row" alignItems="center" spacing={1}>
                                <Box sx={{ color: metric.color, display: 'flex', '& svg': { fontSize: 22 } }}>{metric.icon}</Box>
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="h6" fontWeight={950} lineHeight={1}>{metric.value}</Typography>
                                    <Typography variant="caption" color="text.secondary" fontWeight={800} noWrap>{metric.label}</Typography>
                                </Box>
                            </Stack>
                        </Paper>
                    ))}
                </Box>

                <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.25, pb: 0.8 }}>
                    <Typography variant="subtitle2" fontWeight={950}>Jetzt priorisieren</Typography>
                    <Chip size="small" label="letzte 30 Tage" variant="outlined" sx={{ height: 22, fontWeight: 750 }} />
                    <Box sx={{ flexGrow: 1 }} />
                    <Tooltip title="Aktualisieren"><span><IconButton size="small" onClick={() => fetchData(true)} disabled={refreshing}><RefreshIcon fontSize="small" /></IconButton></span></Tooltip>
                    {canManageAccounts && <Tooltip title="Accounts verwalten"><IconButton size="small" onClick={goToAccounts}><BusinessCenterIcon fontSize="small" /></IconButton></Tooltip>}
                </Stack>

                <Stack spacing={0.85} sx={{ px: 1.25, pb: 1, overflowY: 'auto', flexGrow: 1, minHeight: 0 }}>
                    {prioritySignals.map((signal) => {
                        const isSaving = savingSignalId === signal.id;
                        const isCompetitor = signal.type === 'competitor';
                        return (
                            <Paper key={signal.id} variant="outlined" sx={{ p: 1.05, borderRadius: 2.3, opacity: isSaving ? 0.6 : 1 }}>
                                <Stack direction="row" spacing={1} alignItems="flex-start">
                                    <Avatar
                                        variant="rounded"
                                        src={resolveAssetUrl(signal.account_logo_url) || DEFAULT_ACCOUNT_LOGO}
                                        alt={`${signal.account_name} Logo`}
                                        imgProps={{ onError: (event) => { event.currentTarget.src = DEFAULT_ACCOUNT_LOGO; } }}
                                        sx={{ width: 38, height: 38, flexShrink: 0, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', '& img': { objectFit: 'contain', p: 0.35 } }}
                                    />
                                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                        <Stack direction="row" spacing={0.6} useFlexGap flexWrap="wrap" alignItems="center">
                                            <Typography variant="caption" fontWeight={950} color="text.primary">{signal.account_name}</Typography>
                                            {isCompetitor && <Chip size="small" icon={<TrackChangesIcon />} label={signal.competitor_name || 'Wettbewerb'} color="secondary" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />}
                                            {getStatus(signal) === 'new' && <Chip size="small" label="Neu" color="primary" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 850 }} />}
                                            <Chip size="small" icon={<LocalFireDepartmentIcon />} label={signal.relevance_score || 0} sx={{ height: 20, fontSize: '0.65rem', fontWeight: 850 }} />
                                        </Stack>
                                        <Typography variant="body2" fontWeight={850} sx={{ mt: 0.35, lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                            {signal.article_title}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.35, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {signal.recommended_action || signal.signal_type || signal.source_name || signal.source_domain || 'Signal prüfen'}{formatDate(signal.published_at) ? ` · ${formatDate(signal.published_at)}` : ''}
                                        </Typography>
                                    </Box>
                                    <Stack direction="row" spacing={0.15} sx={{ flexShrink: 0 }}>
                                        <Tooltip title="Quelle öffnen"><IconButton size="small" onClick={() => openSource(signal)}><OpenInNewIcon fontSize="small" /></IconButton></Tooltip>
                                        <Tooltip title="Als gelesen markieren"><span><IconButton size="small" disabled={getStatus(signal) === 'read' || isSaving} onClick={() => updateStatus(signal.id, 'read')}><VisibilityIcon fontSize="small" /></IconButton></span></Tooltip>
                                        <Tooltip title="Erledigen"><span><IconButton size="small" color="success" disabled={isSaving} onClick={() => updateStatus(signal.id, 'done')}><DoneAllIcon fontSize="small" /></IconButton></span></Tooltip>
                                    </Stack>
                                </Stack>
                            </Paper>
                        );
                    })}

                    {prioritySignals.length === 0 && (
                        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5, textAlign: 'center' }}>
                            <DoneAllIcon color="success" sx={{ fontSize: 34 }} />
                            <Typography fontWeight={900}>Aktuell kein offener Handlungsbedarf</Typography>
                            <Typography variant="body2" color="text.secondary">Geplante Kontakte und abgeschlossene Vorgänge bleiben im Account-Radar sichtbar.</Typography>
                        </Paper>
                    )}
                </Stack>

                <Box sx={{ p: 1.25, pt: 0.5 }}>
                    <Button fullWidth variant="contained" startIcon={<RadarIcon />} onClick={() => navigate('/radar')} sx={{ minHeight: 42, fontWeight: 900 }}>
                        Vollständigen Account-Radar öffnen
                    </Button>
                </Box>
            </Stack>
        );
    };

    return (
        <WidgetPaper
            widgetId={widgetId}
            onDelete={onDelete}
            isRemovable={isRemovable}
            widgetTitle={title}
            widgetTypeKey={widgetTypeKey || 'account-intelligence'}
            noPadding
            title={<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{icon}<Typography variant="h6" fontWeight={900}>{title}</Typography></Box>}
        >
            {renderContent()}
        </WidgetPaper>
    );
};

export default AccountIntelligenceWidget;
