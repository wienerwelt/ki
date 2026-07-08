// frontend/src/components/widgets/AccountIntelligenceWidget.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    IconButton,
    LinearProgress,
    Paper,
    Stack,
    Tooltip,
    Typography,
    useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import NewspaperIcon from '@mui/icons-material/Newspaper';
import RadarIcon from '@mui/icons-material/Radar';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

interface NewsArticle {
    id: string;
    account_id?: string;
    article_title: string;
    article_url: string;
    source_name: string;
    source_domain?: string | null;
    published_at: string;
    competitor_name?: string | null;
    summary?: string | null;
    signal_type?: string;
    recommended_action?: string;
    relevance_score?: number;
    status?: 'new' | 'read' | 'done' | 'ignored';
    days_old?: number;
    is_new?: boolean;
    type?: 'account' | 'competitor';
}

interface AccountIntelligenceData {
    id: string;
    name: string;
    account_status?: string | null;
    website_url?: string | null;
    linkedin_url?: string | null;
    account_news: NewsArticle[];
    competitor_news: NewsArticle[];
}

interface AccountIntelligenceWidgetProps extends BaseWidgetProps {
    icon?: React.ReactNode;
    config?: {
        title?: string;
    };
}

type ArticleStatus = 'new' | 'read' | 'done' | 'ignored';
type StatusFilter = 'open' | 'new' | 'read' | 'done' | 'ignored' | 'all';
type TimeFilter = 2 | 7 | 30 | 90 | 365;
type ArticleTypeFilter = 'all' | 'account' | 'competitor';

const statusLabels: Record<ArticleStatus, string> = {
    new: 'Neu',
    read: 'Gelesen',
    done: 'Erledigt',
    ignored: 'Ignoriert'
};

const statusColors: Record<ArticleStatus, 'default' | 'primary' | 'success' | 'warning'> = {
    new: 'primary',
    read: 'default',
    done: 'success',
    ignored: 'warning'
};

const statusFilterOptions: { value: StatusFilter; label: string }[] = [
    { value: 'open', label: 'Offen' },
    { value: 'new', label: 'Neu' },
    { value: 'read', label: 'Gelesen' },
    { value: 'done', label: 'Erledigt' },
    { value: 'ignored', label: 'Ausgeblendet' },
    { value: 'all', label: 'Alle' },
];

const timeFilterOptions: { value: TimeFilter; label: string; description: string }[] = [
    { value: 2, label: '2d', description: 'Letzte 2 Tage' },
    { value: 7, label: '7d', description: 'Letzte 7 Tage' },
    { value: 30, label: '30d', description: 'Letzte 30 Tage' },
    { value: 90, label: '90d', description: 'Letzte 90 Tage' },
    { value: 365, label: '1y', description: 'Letztes Jahr' },
];

const articleTypeFilterOptions: { value: ArticleTypeFilter; label: string }[] = [
    { value: 'all', label: 'Alle Signale' },
    { value: 'account', label: 'Accounts' },
    { value: 'competitor', label: 'Wettbewerb' },
];


const getArticleStatus = (article: NewsArticle): ArticleStatus => article.status || 'new';

const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unbekanntes Datum';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'Unbekanntes Datum';
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const getDaysOld = (dateString?: string) => {
    if (!dateString) return 999;
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 999;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)));
};

const formatAgeLabel = (daysOld: number) => {
    if (daysOld <= 0) return 'Heute';
    if (daysOld === 1) return 'Gestern';
    if (daysOld < 30) return `${daysOld} Tage`;
    if (daysOld < 365) return `${Math.floor(daysOld / 30)} Monate`;
    return '1+ Jahr';
};

interface ArticleStats {
    total: number;
    open: number;
    new: number;
    read: number;
    done: number;
    ignored: number;
}

const getScopedStatsInitial = (): ArticleStats => ({ total: 0, open: 0, new: 0, read: 0, done: 0, ignored: 0 });


const getDomain = (url?: string | null) => {
    if (!url) return '';
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url.replace(/^https?:\/\//i, '').split('/')[0];
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
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
    const [timeFilter, setTimeFilter] = useState<TimeFilter>(30);
    const [articleTypeFilter, setArticleTypeFilter] = useState<ArticleTypeFilter>('all');
    const [savingArticleId, setSavingArticleId] = useState<string | null>(null);

    const title = config?.title || 'Account-Radar';
    const icon = propsIcon || <RadarIcon />;
    const canManageAccounts = user?.role === 'admin' || user?.role === 'assistenz';

    const fetchData = useCallback(async (isManualRefresh = false) => {
        if (isManualRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        try {
            const response = await apiClient.get('/api/data/account-intelligence');
            setData(Array.isArray(response.data) ? response.data : []);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Account-Daten.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData(false);
    }, [fetchData]);

    const allArticles = useMemo(() => {
        return data.flatMap((account) => [
            ...account.account_news.map((article) => ({ ...article, account_name: account.name, type: 'account' as const })),
            ...account.competitor_news.map((article) => ({ ...article, account_name: account.name, type: 'competitor' as const })),
        ]);
    }, [data]);

    const scopedStats = useMemo(() => {
        return allArticles.reduce((acc, article) => {
            const status = getArticleStatus(article);
            const daysOld = article.days_old ?? getDaysOld(article.published_at);
            const matchesTime = daysOld <= timeFilter;
            const matchesType = articleTypeFilter === 'all' || article.type === articleTypeFilter;

            if (!matchesTime || !matchesType) return acc;

            acc.total += 1;
            acc[status] += 1;
            if (status !== 'done' && status !== 'ignored') acc.open += 1;
            return acc;
        }, getScopedStatsInitial());
    }, [allArticles, articleTypeFilter, timeFilter]);

    const filteredData = useMemo(() => {
        return data
            .map((account) => {
                const filterArticles = (articles: NewsArticle[], type: ArticleTypeFilter) => articles.filter((article) => {
                    const status = getArticleStatus(article);
                    const daysOld = article.days_old ?? getDaysOld(article.published_at);
                    const matchesTime = daysOld <= timeFilter;
                    const matchesType = articleTypeFilter === 'all' || articleTypeFilter === type;
                    const matchesStatus =
                        statusFilter === 'all'
                            ? true
                            : statusFilter === 'open'
                                ? status !== 'done' && status !== 'ignored'
                                : status === statusFilter;

                    return matchesTime && matchesType && matchesStatus;
                });

                return {
                    ...account,
                    account_news: filterArticles(account.account_news, 'account'),
                    competitor_news: filterArticles(account.competitor_news, 'competitor'),
                };
            })
            .filter((account) => account.account_news.length > 0 || account.competitor_news.length > 0);
    }, [articleTypeFilter, data, statusFilter, timeFilter]);

    const visibleArticleCount = useMemo(() => {
        return filteredData.reduce((sum, account) => sum + account.account_news.length + account.competitor_news.length, 0);
    }, [filteredData]);

    const selectedTimeFilter = timeFilterOptions.find((option) => option.value === timeFilter);

    const updateArticleStatus = async (articleId: string, status: ArticleStatus) => {
        setSavingArticleId(articleId);

        const previousData = data;
        setData((prev) => prev.map((account) => ({
            ...account,
            account_news: account.account_news.map((article) => article.id === articleId ? { ...article, status } : article),
            competitor_news: account.competitor_news.map((article) => article.id === articleId ? { ...article, status } : article),
        })));

        try {
            await apiClient.request(`/api/data/account-intelligence/articles/${articleId}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status }),
            });
        } catch (err: any) {
            setData(previousData);
            setError(err.response?.data?.message || 'Status konnte nicht gespeichert werden.');
        } finally {
            setSavingArticleId(null);
        }
    };

    const openArticle = async (article: NewsArticle) => {
        if (getArticleStatus(article) === 'new') {
            updateArticleStatus(article.id, 'read');
        }
        window.open(article.article_url, '_blank', 'noopener,noreferrer');
    };

    const goToAccounts = () => {
        const bpId = user?.business_partner_id;
        if (bpId) navigate(`/admin/business-partners/${bpId}/accounts`);
        else navigate('/admin/business-partners');
    };

    const renderArticleCard = (article: NewsArticle, type: 'account' | 'competitor') => {
        const status = getArticleStatus(article);
        const relevance = article.relevance_score ?? 70;
        const sourceLabel = article.source_name || article.source_domain || getDomain(article.article_url) || 'Quelle';
        const isSaving = savingArticleId === article.id;
        const isCompetitor = type === 'competitor';
        const daysOld = article.days_old ?? getDaysOld(article.published_at);
        const ageLabel = formatAgeLabel(daysOld);

        return (
            <Paper
                key={article.id}
                elevation={0}
                sx={{
                    p: 1.5,
                    mb: 1.25,
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: status === 'new' ? alpha(theme.palette.primary.main, 0.35) : 'divider',
                    bgcolor: status === 'done'
                        ? alpha(theme.palette.success.main, 0.05)
                        : status === 'new'
                            ? alpha(theme.palette.primary.main, 0.045)
                            : 'background.paper',
                    opacity: isSaving ? 0.65 : 1,
                }}
            >
                <Stack direction="row" spacing={1.25} alignItems="flex-start">
                    <Box
                        sx={{
                            width: 34,
                            height: 34,
                            borderRadius: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            bgcolor: isCompetitor ? alpha(theme.palette.secondary.main, 0.12) : alpha(theme.palette.primary.main, 0.12),
                            color: isCompetitor ? 'secondary.main' : 'primary.main',
                        }}
                    >
                        {isCompetitor ? <TrackChangesIcon fontSize="small" /> : <NewspaperIcon fontSize="small" />}
                    </Box>

                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
                            <Chip
                                size="small"
                                label={article.signal_type || (isCompetitor ? 'Wettbewerb' : 'Account-Signal')}
                                color={isCompetitor ? 'secondary' : 'primary'}
                                variant="outlined"
                                sx={{ height: 22, fontWeight: 800, fontSize: '0.68rem' }}
                            />
                            <Chip
                                size="small"
                                label={statusLabels[status]}
                                color={statusColors[status]}
                                variant={status === 'new' || status === 'done' ? 'filled' : 'outlined'}
                                sx={{ height: 22, fontWeight: 800, fontSize: '0.68rem' }}
                            />
                            <Tooltip title={`Relevanz ${relevance}/100`}>
                                <Chip
                                    size="small"
                                    icon={<LocalFireDepartmentIcon sx={{ fontSize: '14px !important' }} />}
                                    label={relevance}
                                    sx={{ height: 22, fontWeight: 900, fontSize: '0.68rem' }}
                                />
                            </Tooltip>
                            <Chip
                                size="small"
                                label={ageLabel}
                                variant="outlined"
                                sx={{ height: 22, fontWeight: 750, fontSize: '0.68rem' }}
                            />
                        </Stack>

                        <Typography
                            variant="subtitle2"
                            sx={{
                                fontWeight: 850,
                                lineHeight: 1.25,
                                color: 'text.primary',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                            }}
                        >
                            {article.article_title}
                        </Typography>

                        {article.summary && (
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{
                                    mt: 0.75,
                                    lineHeight: 1.45,
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                }}
                            >
                                {article.summary}
                            </Typography>
                        )}

                        {article.recommended_action && (
                            <Box sx={{ mt: 1, p: 1, borderRadius: 2, bgcolor: alpha(theme.palette.warning.main, 0.08), border: '1px solid', borderColor: alpha(theme.palette.warning.main, 0.18) }}>
                                <Stack direction="row" spacing={0.75} alignItems="flex-start">
                                    <LightbulbIcon sx={{ fontSize: 16, color: 'warning.main', mt: 0.1 }} />
                                    <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 700, lineHeight: 1.35 }}>
                                        {article.recommended_action}
                                    </Typography>
                                </Stack>
                            </Box>
                        )}

                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                            {article.competitor_name && (
                                <Chip label={article.competitor_name} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.68rem', fontWeight: 800 }} />
                            )}
                            <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 650 }}>
                                {sourceLabel} • {formatDate(article.published_at)}
                            </Typography>
                        </Stack>
                    </Box>

                    <Stack direction="column" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
                        <Tooltip title="Artikel öffnen">
                            <IconButton size="small" onClick={() => openArticle(article)}>
                                <OpenInNewIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Als gelesen markieren">
                            <span>
                                <IconButton size="small" disabled={status === 'read' || isSaving} onClick={() => updateArticleStatus(article.id, 'read')}>
                                    <VisibilityIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title="Als erledigt markieren">
                            <span>
                                <IconButton size="small" color="success" disabled={status === 'done' || isSaving} onClick={() => updateArticleStatus(article.id, 'done')}>
                                    <DoneAllIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title="Ausblenden">
                            <span>
                                <IconButton size="small" color="warning" disabled={isSaving} onClick={() => updateArticleStatus(article.id, 'ignored')}>
                                    <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Stack>
                </Stack>
            </Paper>
        );
    };

    const renderAccount = (account: AccountIntelligenceData, index: number) => {
        const totalNewsCount = account.account_news.length + account.competitor_news.length;
        const openNewsCount = [...account.account_news, ...account.competitor_news].filter((a) => {
            const status = getArticleStatus(a);
            return status !== 'done' && status !== 'ignored';
        }).length;

        return (
            <AccordionCard key={account.id} defaultExpanded={index === 0}>
                <AccordionHeader>
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0, width: '100%' }}>
                        <BusinessCenterIcon sx={{ color: 'text.secondary', fontSize: 20, flexShrink: 0 }} />
                        <Typography sx={{ fontWeight: 900, color: 'text.primary', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {account.name}
                        </Typography>
                        {openNewsCount > 0 && <Chip label={`${openNewsCount} offen`} size="small" color="primary" sx={{ height: 22, fontWeight: 800 }} />}
                        {account.account_news.length > 0 && <Chip label={`${account.account_news.length} Account`} size="small" variant="outlined" color="primary" sx={{ height: 22, fontWeight: 700 }} />}
                        {account.competitor_news.length > 0 && <Chip label={`${account.competitor_news.length} Wettbewerb`} size="small" variant="outlined" color="secondary" sx={{ height: 22, fontWeight: 700 }} />}
                        {totalNewsCount > openNewsCount && <Chip label={`${totalNewsCount} gesamt`} size="small" variant="outlined" sx={{ height: 22, fontWeight: 700 }} />}
                    </Stack>
                </AccordionHeader>
                <AccordionBody>
                    {account.account_news.length > 0 && (
                        <Box sx={{ p: 1.25, pb: 0 }}>
                            <Typography variant="overline" color="primary" sx={{ fontWeight: 900, display: 'block', mb: 0.75 }}>
                                Aktuelles zum Account
                            </Typography>
                            {account.account_news.map((article) => renderArticleCard(article, 'account'))}
                        </Box>
                    )}

                    {account.competitor_news.length > 0 && (
                        <Box sx={{ p: 1.25, pt: account.account_news.length > 0 ? 0.5 : 1.25 }}>
                            {account.account_news.length > 0 && <Divider sx={{ mb: 1.25 }} />}
                            <Typography variant="overline" color="secondary" sx={{ fontWeight: 900, display: 'block', mb: 0.75 }}>
                                Aktivitäten der Wettbewerber
                            </Typography>
                            {account.competitor_news.map((article) => renderArticleCard(article, 'competitor'))}
                        </Box>
                    )}
                </AccordionBody>
            </AccordionCard>
        );
    };

    const renderContent = () => {
        if (loading) {
            return <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>;
        }

        if (error) {
            return (
                <Alert
                    severity="error"
                    sx={{ m: 1 }}
                    action={<Button color="inherit" size="small" onClick={() => fetchData(true)}>Erneut versuchen</Button>}
                >
                    {error}
                </Alert>
            );
        }

        if (data.length === 0) {
            return (
                <Box sx={{ p: 2.5, textAlign: 'center' }}>
                    <ManageSearchIcon sx={{ fontSize: 42, color: 'text.disabled', mb: 1 }} />
                    <Typography fontWeight={850} sx={{ mb: 0.5 }}>Noch keine Accounts zur Beobachtung</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Lege Accounts und Wettbewerber an, damit der Account-Radar relevante Signale findet.
                    </Typography>
                    {canManageAccounts && (
                        <Button size="small" variant="contained" onClick={goToAccounts} startIcon={<BusinessCenterIcon />}>
                            Accounts verwalten
                        </Button>
                    )}
                </Box>
            );
        }

        return (
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <Box sx={{ p: 1.25, borderBottom: '1px solid', borderColor: 'divider', bgcolor: alpha(theme.palette.background.default, 0.35) }}>
                    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Chip label={`${visibleArticleCount} Treffer`} color="primary" size="small" sx={{ fontWeight: 900 }} />
                        <Chip label={`${filteredData.length} Accounts`} variant="outlined" size="small" sx={{ fontWeight: 800 }} />
                        <Chip label={`${scopedStats.open} offen`} color="primary" variant="outlined" size="small" sx={{ fontWeight: 800 }} />
                        <Chip label={`${scopedStats.new} neu`} variant="outlined" size="small" sx={{ fontWeight: 800 }} />
                        <Box sx={{ flexGrow: 1 }} />
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 750, display: { xs: 'none', sm: 'inline' } }}>
                            {selectedTimeFilter?.description || 'Zeitraum'}
                        </Typography>
                        <Tooltip title="Aktualisieren">
                            <span>
                                <IconButton size="small" onClick={() => fetchData(true)} disabled={refreshing}>
                                    <RefreshIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                        {canManageAccounts && (
                            <Tooltip title="Accounts verwalten">
                                <IconButton size="small" onClick={goToAccounts}>
                                    <BusinessCenterIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Stack>

                    {refreshing && <LinearProgress sx={{ mt: 1 }} />}

                    <Stack spacing={0.75} sx={{ mt: 1 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, minWidth: 62 }}>
                                Zeitraum
                            </Typography>
                            {timeFilterOptions.map((option) => (
                                <Chip
                                    key={option.value}
                                    label={option.label}
                                    title={option.description}
                                    size="small"
                                    color={timeFilter === option.value ? 'secondary' : 'default'}
                                    variant={timeFilter === option.value ? 'filled' : 'outlined'}
                                    onClick={() => setTimeFilter(option.value)}
                                    sx={{ fontWeight: 850, minWidth: 42 }}
                                />
                            ))}
                        </Stack>

                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, minWidth: 62 }}>
                                Status
                            </Typography>
                            {statusFilterOptions.map(({ value, label }) => {
                                const count = value === 'all' ? scopedStats.total : scopedStats[value];
                                return (
                                    <Chip
                                        key={value}
                                        label={`${label} ${count}`}
                                        size="small"
                                        color={statusFilter === value ? 'primary' : 'default'}
                                        variant={statusFilter === value ? 'filled' : 'outlined'}
                                        onClick={() => setStatusFilter(value)}
                                        sx={{ fontWeight: 750 }}
                                    />
                                );
                            })}
                        </Stack>

                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, minWidth: 62 }}>
                                Ansicht
                            </Typography>
                            {articleTypeFilterOptions.map(({ value, label }) => (
                                <Chip
                                    key={value}
                                    label={label}
                                    size="small"
                                    color={articleTypeFilter === value ? 'info' : 'default'}
                                    variant={articleTypeFilter === value ? 'filled' : 'outlined'}
                                    onClick={() => setArticleTypeFilter(value)}
                                    sx={{ fontWeight: 750 }}
                                />
                            ))}
                        </Stack>
                    </Stack>
                </Box>

                <Box sx={{ overflowY: 'auto', p: 1, flexGrow: 1, minHeight: 0 }}>
                    {filteredData.length > 0 ? (
                        filteredData.map((account, index) => renderAccount(account, index))
                    ) : (
                        <Box sx={{ p: 3, textAlign: 'center' }}>
                            <Typography fontWeight={850}>Keine Signale für den aktuellen Filter.</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                Wechsle Zeitraum, Status oder Ansicht, um ältere beziehungsweise erledigte Meldungen zu sehen.
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Box>
        );
    };

    return (
        <WidgetPaper
            widgetId={widgetId}
            onDelete={onDelete}
            isRemovable={isRemovable}
            widgetTitle={title}
            widgetTypeKey={widgetTypeKey || 'account-intelligence'}
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {icon}
                    <Typography variant="h6" sx={{ fontWeight: 850 }}>{title}</Typography>
                </Box>
            }
        >
            {renderContent()}
        </WidgetPaper>
    );
};

const AccordionCard: React.FC<{ children: React.ReactNode; defaultExpanded?: boolean }> = ({ children, defaultExpanded }) => {
    const [expanded, setExpanded] = useState(!!defaultExpanded);
    const theme = useTheme();

    const childrenArray = React.Children.toArray(children);
    const header = childrenArray[0];
    const body = childrenArray[1];

    return (
        <Paper
            elevation={0}
            sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '10px !important',
                mb: 1,
                overflow: 'hidden',
            }}
        >
            <Box
                onClick={() => setExpanded((prev) => !prev)}
                sx={{
                    px: 1.5,
                    py: 1.25,
                    cursor: 'pointer',
                    bgcolor: alpha(theme.palette.background.default, 0.55),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                }}
            >
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>{header}</Box>
                <ExpandMoreIcon
                    sx={{
                        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                        color: 'text.secondary',
                    }}
                />
            </Box>
            {expanded && <Box>{body}</Box>}
        </Paper>
    );
};

const AccordionHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;
const AccordionBody: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;

export default AccountIntelligenceWidget;
