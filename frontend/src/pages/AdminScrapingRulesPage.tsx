import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, MenuItem, Switch, FormControlLabel, Chip, Tooltip as MuiTooltip, TableSortLabel, InputAdornment, LinearProgress,
    SelectChangeEvent, Link as MuiLink, Snackbar, Autocomplete, Grid, Stack, Divider
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SearchIcon from '@mui/icons-material/Search';
import InfoIcon from '@mui/icons-material/Info';
import TipsAndUpdatesIcon from '@mui/icons-material/TipsAndUpdates';
import ScienceIcon from '@mui/icons-material/Science';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DashboardLayout from '../components/DashboardLayout';
import AdminScheduleSelector from '../components/AdminScheduleSelector';
import apiClient from '../apiClient';

interface ScrapingRule {
    id: string;
    source_identifier: string;
    url_pattern: string | null;
    content_container_selector: string | null;
    title_selector: string | null;
    date_selector: string | null;
    description_selector: string | null;
    thumbnail_selector: string | null;
    date_format: string | null;
    category_default: string | null;
    is_active: boolean;
    last_scraped_at: string | null;
    created_at: string;
    updated_at: string;
    name: string | null;
    current_entry_count: number;
    region: string | null;
    link_selector: string | null;
    schedule: string | null;
    scrape_after_date: string | null;
    rule_type: 'content' | 'funding';
    use_headless_browser: boolean;
    scraping_strategy: string | null;
    business_partner_id?: string | null;
    inferred_business_partner_id?: string | null;
    business_partner_name?: string | null;
    validation_warnings?: string[];
    active_job_id?: string | null;
    active_job_status?: string | null;
    last_job_status?: string | null;
}

interface Category {
    id: string;
    name: string;
    category_type: string;
}

interface BusinessPartner {
    id: string;
    name: string;
    is_active?: boolean;
}

interface QueueStatus {
    counts?: Record<string, number>;
    worker?: {
        name: string;
        online: boolean;
        ttl: number | null;
    };
}

interface TestResult {
    ok: boolean;
    validation?: { warnings?: string[] };
    preview?: {
        kind: string;
        found: number;
        would_insert: number;
        already_existing: number;
        skipped: number;
        containers_found?: number;
        channel_title?: string;
        channel_id?: string;
        playlist_id?: string;
        items?: Array<{
            title: string;
            original_url: string | null;
            published_date?: string | null;
            exists?: boolean;
        }>;
    };
}

type Order = 'asc' | 'desc';

type RuleFormState = Omit<ScrapingRule, 'id' | 'created_at' | 'updated_at' | 'last_scraped_at' | 'current_entry_count'> & {
    business_partner_id: string | null;
};

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
    const valA = a[orderBy] ?? '';
    const valB = b[orderBy] ?? '';
    if (valB < valA) return -1;
    if (valB > valA) return 1;
    return 0;
}

function getComparator(order: Order, orderBy: keyof ScrapingRule): (a: ScrapingRule, b: ScrapingRule) => number {
    return order === 'desc'
        ? (a, b) => descendingComparator<ScrapingRule>(a, b, orderBy)
        : (a, b) => -descendingComparator<ScrapingRule>(a, b, orderBy);
}

const BP_CATEGORIES = ['businesspartner_news', 'businesspartner_events'];

const initialFormState: RuleFormState = {
    name: '',
    source_identifier: '',
    url_pattern: '',
    content_container_selector: '',
    title_selector: '',
    date_selector: '',
    description_selector: '',
    link_selector: '',
    thumbnail_selector: '',
    date_format: '',
    category_default: '',
    is_active: true,
    region: '',
    schedule: null,
    scrape_after_date: '',
    rule_type: 'content',
    use_headless_browser: false,
    scraping_strategy: 'standard',
    business_partner_id: null,
};

const commonDateFormats = [
    { value: 'yyyy-MM-dd', label: '2025-06-29 (ISO 8601)' },
    { value: 'dd.MM.yyyy', label: '29.06.2025 (Deutsch, Punkt)' },
    { value: 'dd-MM-yyyy', label: '29-06-2025 (Deutsch, Bindestrich)' },
    { value: 'd. MMMM yyyy', label: '29. Juni 2025 (mit Monatsname)'},
    { value: 'MM/dd/yyyy', label: '06/29/2025 (Amerikanisch)' },
    { value: 'MMMM d, yyyy', label: 'June 29, 2025 (Englisch, mit Komma)'},
    { value: 'EEE, dd MMM yyyy HH:mm:ss xx', label: 'RSS: Tue, 08 Jul 2025 10:30:00 +0200'}
];

const europeanCountries = ['EU', 'Albanien', 'Andorra', 'Belgien', 'Bosnien und Herzegowina', 'Bulgarien', 'Dänemark', 'Deutschland', 'Estland', 'Finnland', 'Frankreich', 'Griechenland', 'Irland', 'Island', 'Italien', 'Kosovo', 'Kroatien', 'Lettland', 'Liechtenstein', 'Litauen', 'Luxemburg', 'Malta', 'Moldau', 'Monaco', 'Montenegro', 'Niederlande', 'Nordmazedonien', 'Norwegen', 'Österreich', 'Polen', 'Portugal', 'Rumänien', 'San Marino', 'Schweden', 'Schweiz', 'Serbien', 'Slowakei', 'Slowenien', 'Spanien', 'Tschechien', 'Ukraine', 'Ungarn', 'Vatikanstadt', 'Vereinigtes Königreich', 'Weißrussland', 'Zypern'];

const scrapingStrategies = [
    { value: 'standard', label: 'Standard (HTML/XML/RSS)' },
    { value: 'html_embedded_json', label: 'Spezial: JSON aus HTML-Skript' },
    { value: 'youtube_channel', label: 'YouTube: Kanal-Feed' },
    { value: 'youtube_podcast', label: 'YouTube: Podcast-Tab' },
    { value: 'youtube_music', label: 'YouTube: Music Playlist' },
];

const isBusinessPartnerCategory = (category?: string | null) => !!category && BP_CATEGORIES.includes(category);

const buildBpSourceIdentifier = (bpId: string | null, category: string | null) => {
    if (!bpId || !category) return '';
    if (category === 'businesspartner_news') return `${bpId}_news`;
    if (category === 'businesspartner_events') return `${bpId}_events`;
    return '';
};

const AdminScrapingRulesPage: React.FC = () => {
    const location = useLocation();
    const [rules, setRules] = useState<ScrapingRule[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [businessPartners, setBusinessPartners] = useState<BusinessPartner[]>([]);
    const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingRule, setEditingRule] = useState<Partial<ScrapingRule> | null>(null);
    const [searchTerm, setSearchTerm] = useState(location.state?.prefillSearch || '');
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<keyof ScrapingRule>('name');
    const [formState, setFormState] = useState<RuleFormState>(initialFormState);
    const [logModalOpen, setLogModalOpen] = useState(false);
    const [currentJobId, setCurrentJobId] = useState<string | null>(null);
    const [jobLogs, setJobLogs] = useState<{ log_level: string, message: string, created_at: string }[]>([]);
    const [jobStatus, setJobStatus] = useState<string | null>(null);
    const [suggesting, setSuggesting] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<TestResult | null>(null);
    const [suggestionAlert, setSuggestionAlert] = useState<string | null>(null);
    const [snackbar, setSnackbar] = useState<{ open: boolean, message: string }>({ open: false, message: '' });

    const fetchInitialData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const [rulesRes, categoriesRes, bpRes, queueRes] = await Promise.allSettled([
                apiClient.get('/api/admin/scraping-rules', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/categories', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/business-partners', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/scraping-rules/queue-status', { headers: { 'x-auth-token': token } }),
            ]);

            if (rulesRes.status === 'fulfilled') setRules(rulesRes.value.data || []);
            else throw rulesRes.reason;

            if (categoriesRes.status === 'fulfilled') setCategories(categoriesRes.value.data || []);
            if (bpRes.status === 'fulfilled') setBusinessPartners(bpRes.value.data || []);
            if (queueRes.status === 'fulfilled') setQueueStatus(queueRes.value.data || null);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Daten.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchInitialData(); }, [fetchInitialData]);

    useEffect(() => {
        if (!currentJobId || !logModalOpen || (jobStatus !== 'running' && jobStatus !== 'pending')) return;
        const interval = setInterval(async () => {
            try {
                const token = localStorage.getItem('jwt_token');
                const res = await apiClient.get(`/api/admin/scraping-rules/logs/${currentJobId}`, { headers: { 'x-auth-token': token } });
                setJobLogs(res.data.logs);
                setJobStatus(res.data.status);
            } catch (e) {
                console.error('Fehler beim Log-Polling:', e);
                setJobStatus('failed');
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [currentJobId, logModalOpen, jobStatus]);

    useEffect(() => {
        if (!isBusinessPartnerCategory(formState.category_default)) return;
        const generated = buildBpSourceIdentifier(formState.business_partner_id, formState.category_default);
        if (generated && generated !== formState.source_identifier) {
            setFormState(prev => ({ ...prev, source_identifier: generated }));
        }
    }, [formState.business_partner_id, formState.category_default]);

    const handleFormChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<any>) => {
        const target = event.target as HTMLInputElement;
        const name = target.name;
        const value = target.type === 'checkbox' ? target.checked : target.value;
        setFormState(prevState => {
            const next = { ...prevState, [name]: value } as RuleFormState;
            if (name === 'scraping_strategy' && String(value).startsWith('youtube_')) {
                next.use_headless_browser = false;
                next.content_container_selector = '';
                next.title_selector = '';
                next.date_selector = '';
                next.description_selector = '';
                next.link_selector = '';
                next.thumbnail_selector = '';
                next.date_format = '';
            }
            if (name === 'category_default' && !isBusinessPartnerCategory(String(value))) {
                next.business_partner_id = null;
            }
            return next;
        });
        setTestResult(null);
    };

    const handleOpenAddDialog = () => {
        setEditingRule(null);
        setFormState(initialFormState);
        setOpenDialog(true);
        setSuggestionAlert(null);
        setTestResult(null);
    };

    const handleOpenEditDialog = (rule: ScrapingRule) => {
        setEditingRule(rule);
        setFormState({
            name: rule.name ?? '',
            source_identifier: rule.source_identifier ?? '',
            url_pattern: rule.url_pattern ?? '',
            content_container_selector: rule.content_container_selector ?? '',
            title_selector: rule.title_selector ?? '',
            date_selector: rule.date_selector ?? '',
            description_selector: rule.description_selector ?? '',
            link_selector: rule.link_selector ?? '',
            thumbnail_selector: rule.thumbnail_selector ?? '',
            date_format: rule.date_format ?? '',
            category_default: rule.category_default ?? '',
            is_active: rule.is_active,
            region: rule.region ?? '',
            schedule: rule.schedule ?? null,
            scrape_after_date: rule.scrape_after_date ? rule.scrape_after_date.split('T')[0] : '',
            rule_type: rule.rule_type || 'content',
            use_headless_browser: rule.use_headless_browser || false,
            scraping_strategy: rule.scraping_strategy || 'standard',
            business_partner_id: rule.business_partner_id || rule.inferred_business_partner_id || null,
        });
        setOpenDialog(true);
        setSuggestionAlert(null);
        setTestResult(null);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingRule(null);
        setError(null);
        setSuggestionAlert(null);
        setTestResult(null);
    };

    const buildRuleData = () => ({
        ...formState,
        id: editingRule?.id,
        scrape_after_date: formState.scrape_after_date || null,
        business_partner_id: isBusinessPartnerCategory(formState.category_default) ? formState.business_partner_id : null,
    });

    const handleSubmit = async () => {
        setError(null);
        const token = localStorage.getItem('jwt_token');
        try {
            const ruleData = buildRuleData();
            const method = editingRule?.id ? 'put' : 'post';
            const url = editingRule?.id ? `/api/admin/scraping-rules/${editingRule.id}` : '/api/admin/scraping-rules';
            const res = await apiClient[method](url, ruleData, { headers: { 'x-auth-token': token } });

            const warnings = res.data?.warnings || [];
            setSnackbar({ open: true, message: warnings.length ? `Regel gespeichert. Warnungen: ${warnings.length}` : 'Regel erfolgreich gespeichert.' });
            handleCloseDialog();
            fetchInitialData();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Speichern.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Diese Regel wird deaktiviert/archiviert. Fortfahren?')) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.delete(`/api/admin/scraping-rules/${id}`, { headers: { 'x-auth-token': token } });
            setSnackbar({ open: true, message: 'Regel wurde deaktiviert/archiviert.' });
            fetchInitialData();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler beim Archivieren.');
        }
    };

    const handleTriggerScrape = async (rule: ScrapingRule) => {
        setJobLogs([{ log_level: 'INFO', message: `Starte Scraping-Job für "${rule.source_identifier}"...`, created_at: new Date().toISOString() }]);
        setJobStatus('pending');
        setCurrentJobId(null);
        setLogModalOpen(true);
        try {
            const token = localStorage.getItem('jwt_token');
            const res = await apiClient.post(`/api/admin/scraping-rules/${rule.id}/trigger-scrape`, {}, { headers: { 'x-auth-token': token } });
            setCurrentJobId(res.data.jobId);
            setJobStatus('running');
        } catch (err: any) {
            const errorMessage = err.response?.data?.message || 'Fehler beim Auslösen des Jobs.';
            setJobLogs(prev => [...prev, { log_level: 'ERROR', message: errorMessage, created_at: new Date().toISOString() }]);
            setJobStatus('failed');
        }
    };

    const handleTestRule = async () => {
        setTesting(true);
        setError(null);
        setTestResult(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const res = await apiClient.post('/api/admin/scraping-rules/test-rule', buildRuleData(), { headers: { 'x-auth-token': token } });
            setTestResult(res.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Regel-Test fehlgeschlagen.');
        } finally {
            setTesting(false);
        }
    };

    const handleCloseLogModal = () => {
        setLogModalOpen(false);
        setCurrentJobId(null);
        setJobLogs([]);
        setJobStatus(null);
        fetchInitialData();
    };

    const handleSortRequest = (property: keyof ScrapingRule) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const handleSuggestSelectors = async () => {
        if (!formState.url_pattern) {
            setError('Bitte geben Sie zuerst eine URL ein.');
            return;
        }
        setSuggesting(true);
        setError(null);
        setSuggestionAlert(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.post('/api/admin/scraping-rules/suggest', { url: formState.url_pattern }, { headers: { 'x-auth-token': token } });
            const data = response.data;
            if (data?.format === 'html') {
                setFormState(prevState => ({
                    ...prevState,
                    content_container_selector: data.rules.content_container_selector || '',
                    title_selector: data.rules.title_selector || '',
                    date_selector: data.rules.date_selector || '',
                    description_selector: data.rules.description_selector || '',
                    link_selector: data.rules.link_selector || '',
                    thumbnail_selector: data.rules.thumbnail_selector || '',
                    date_format: data.rules.date_format || prevState.date_format,
                }));
                setSuggestionAlert('Selektoren wurden analysiert und eingefügt. Bitte danach "Regel testen" ausführen.');
            } else if (data?.format?.includes('rss')) {
                setSuggestionAlert(data.rules.message || 'RSS/Atom/XML-Feed erkannt. Keine Selektoren notwendig.');
            } else {
                setError('Die KI hat keine brauchbare Antwortstruktur zurückgegeben.');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Abrufen der Vorschläge.');
        } finally {
            setSuggesting(false);
        }
    };

    const searchFilter = useCallback((rule: ScrapingRule) => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return true;

        const searchableText = [
            rule.name,
            rule.source_identifier,
            rule.url_pattern,
            rule.region,
            rule.category_default,
            rule.rule_type,
            rule.scraping_strategy,
            rule.business_partner_name,
            rule.last_job_status,
            rule.active_job_status,
            ...(rule.validation_warnings || [])
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        return searchableText.includes(term);
    }, [searchTerm]);

    const sortedAndFilteredRules = useMemo(() => {
        return [...rules]
            .filter(searchFilter)
            .sort(getComparator(order, orderBy));
    }, [rules, searchFilter, order, orderBy]);

    const contentCategories = useMemo(() => categories.filter(c => c.category_type === 'content'), [categories]);
    const showHtmlSelectors = formState.scraping_strategy === 'standard' || formState.scraping_strategy === 'html_embedded_json';
    const showAiSuggest = formState.scraping_strategy === 'standard';
    const bpCategorySelected = isBusinessPartnerCategory(formState.category_default);

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Box>
                        <Typography variant="h4" component="h1">Scraping-Regeln Verwaltung ({sortedAndFilteredRules.length})</Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
                            <Chip size="small" label={`Scrape-Worker: ${queueStatus?.worker?.online ? 'online' : 'offline'}`} color={queueStatus?.worker?.online ? 'success' : 'error'} />
                            {queueStatus?.counts && <Chip size="small" variant="outlined" label={`Queue: ${queueStatus.counts.waiting || 0} wartend · ${queueStatus.counts.active || 0} aktiv · ${queueStatus.counts.failed || 0} fehlgeschlagen`} />}
                        </Stack>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <TextField variant="outlined" size="small" placeholder="Suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>), }}/>
                        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAddDialog}>Regel hinzufügen</Button>
                    </Box>
                </Box>

                {loading && rules.length === 0 ? <CircularProgress /> : error ? <Alert severity="error">{error}</Alert> : (
                    <Paper>
                        <TableContainer sx={{ maxHeight: '70vh' }}>
                            <Table stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sortDirection={orderBy === 'name' ? order : false}><TableSortLabel active={orderBy === 'name'} direction={order} onClick={() => handleSortRequest('name')}>Name</TableSortLabel></TableCell>
                                        <TableCell>Qualität</TableCell>
                                        <TableCell sortDirection={orderBy === 'rule_type' ? order : false}><TableSortLabel active={orderBy === 'rule_type'} direction={order} onClick={() => handleSortRequest('rule_type')}>Typ</TableSortLabel></TableCell>
                                        <TableCell>Kategorie</TableCell>
                                        <TableCell sortDirection={orderBy === 'region' ? order : false}><TableSortLabel active={orderBy === 'region'} direction={order} onClick={() => handleSortRequest('region')}>Region</TableSortLabel></TableCell>
                                        <TableCell sortDirection={orderBy === 'url_pattern' ? order : false}><TableSortLabel active={orderBy === 'url_pattern'} direction={order} onClick={() => handleSortRequest('url_pattern')}>URL</TableSortLabel></TableCell>
                                        <TableCell align="center" sortDirection={orderBy === 'current_entry_count' ? order : false}><TableSortLabel active={orderBy === 'current_entry_count'} direction={order} onClick={() => handleSortRequest('current_entry_count')}>Einträge</TableSortLabel></TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell sortDirection={orderBy === 'last_scraped_at' ? order : false}><TableSortLabel active={orderBy === 'last_scraped_at'} direction={order} onClick={() => handleSortRequest('last_scraped_at')}>Zuletzt</TableSortLabel></TableCell>
                                        <TableCell>Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortedAndFilteredRules.map((rule) => {
                                        const linkTarget = rule.rule_type === 'funding'
                                            ? `/admin/funding?sourceRuleId=${rule.id}`
                                            : `/admin/scraped-content?source_identifier=${rule.source_identifier}`;
                                        const hasWarnings = (rule.validation_warnings || []).length > 0;
                                        const hasActiveJob = !!rule.active_job_id;

                                        return (
                                            <TableRow key={rule.id} hover>
                                                <TableCell sx={{ fontWeight: 'bold' }}>
                                                    {rule.name || '-'}
                                                    <Typography variant="caption" display="block" color="text.secondary">{rule.source_identifier}</Typography>
                                                    {rule.business_partner_name && <Chip label={rule.business_partner_name} size="small" variant="outlined" sx={{ mt: 0.5 }} />}
                                                </TableCell>
                                                <TableCell>
                                                    {hasWarnings ? (
                                                        <MuiTooltip title={(rule.validation_warnings || []).join(' | ')}>
                                                            <Chip icon={<WarningAmberIcon />} label="Warnung" size="small" color="warning" />
                                                        </MuiTooltip>
                                                    ) : <Chip label="OK" size="small" color="success" variant="outlined" />}
                                                </TableCell>
                                                <TableCell>
                                                    <Stack spacing={0.5}>
                                                        <Chip label={rule.rule_type || 'content'} size="small" color={rule.rule_type === 'funding' ? 'secondary' : 'default'} />
                                                        {rule.scraping_strategy && rule.scraping_strategy !== 'standard' && <Chip label={rule.scraping_strategy} size="small" variant="outlined" color="info" />}
                                                    </Stack>
                                                </TableCell>
                                                <TableCell>{rule.category_default || '-'}</TableCell>
                                                <TableCell>{rule.region || '-'}</TableCell>
                                                <TableCell sx={{ wordBreak: 'break-all', maxWidth: 220 }}>
                                                    <MuiLink href={rule.url_pattern || '#'} target="_blank" rel="noopener noreferrer" underline="hover">
                                                        {rule.url_pattern ? rule.url_pattern.substring(0, 42) + '...' : '-'}
                                                    </MuiLink>
                                                </TableCell>
                                                <TableCell align="center"><MuiLink component={RouterLink} to={linkTarget} underline="hover">{rule.current_entry_count}</MuiLink></TableCell>
                                                <TableCell>
                                                    <Stack spacing={0.5}>
                                                        <Chip label={rule.is_active ? 'aktiv' : 'inaktiv'} size="small" color={rule.is_active ? 'success' : 'default'} />
                                                        {hasActiveJob && <Chip label={rule.active_job_status || 'pending'} size="small" color="warning" />}
                                                        {rule.last_job_status && !hasActiveJob && <Chip label={`letzter Job: ${rule.last_job_status}`} size="small" variant="outlined" />}
                                                    </Stack>
                                                </TableCell>
                                                <TableCell>{rule.last_scraped_at ? new Date(rule.last_scraped_at).toLocaleString('de-AT') : '-'}</TableCell>
                                                <TableCell>
                                                    <IconButton size="small" color="primary" onClick={() => handleOpenEditDialog(rule)}><EditIcon /></IconButton>
                                                    <MuiTooltip title="Regel deaktivieren/archivieren"><IconButton size="small" color="error" onClick={() => handleDelete(rule.id)}><DeleteIcon /></IconButton></MuiTooltip>
                                                    <MuiTooltip title={hasActiveJob ? 'Für diese Regel läuft bereits ein Job' : 'Scraping jetzt starten'}>
                                                        <span><IconButton size="small" color="secondary" disabled={hasActiveJob || !queueStatus?.worker?.online} onClick={() => handleTriggerScrape(rule)}><PlayArrowIcon /></IconButton></span>
                                                    </MuiTooltip>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                )}

                <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md">
                    <DialogTitle>{editingRule?.id ? 'Scraping-Regel bearbeiten' : 'Neue Scraping-Regel hinzufügen'}</DialogTitle>
                    <DialogContent>
                        <Grid container spacing={2} sx={{ mt: 1 }}>
                            <Grid item xs={12}>
                                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                                {suggestionAlert && <Alert severity="info" sx={{ mb: 2 }}>{suggestionAlert}</Alert>}
                            </Grid>
                            <Grid item xs={12} sm={6}><TextField name="name" label="Name der Regel" fullWidth value={formState.name} onChange={handleFormChange} margin="dense" /></Grid>
                            <Grid item xs={12} sm={6}><TextField name="source_identifier" label="Source Identifier" fullWidth value={formState.source_identifier} onChange={handleFormChange} margin="dense" required disabled={!!editingRule || bpCategorySelected} helperText={bpCategorySelected ? 'Wird aus Business Partner und Kategorie automatisch erzeugt.' : 'Nach Erstellung gesperrt.'} /></Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField select name="rule_type" label="Regel-Typ" fullWidth value={formState.rule_type} onChange={handleFormChange} margin="dense">
                                    <MenuItem value="content">Standard-Inhalt</MenuItem>
                                    <MenuItem value="funding">Förderung</MenuItem>
                                </TextField>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField select name="scraping_strategy" label="Scraping-Strategie" fullWidth value={formState.scraping_strategy} onChange={handleFormChange} margin="dense">
                                    {scrapingStrategies.map(strategy => <MenuItem key={strategy.value} value={strategy.value}>{strategy.label}</MenuItem>)}
                                </TextField>
                            </Grid>
                            <Grid item xs={12}>
                                <TextField name="url_pattern" label="URL der Übersichtsseite, des Feeds oder YouTube-Quelle" fullWidth value={formState.url_pattern} onChange={handleFormChange} margin="dense" required
                                    helperText={formState.scraping_strategy === 'youtube_channel' ? 'Erlaubt: /channel/UC... oder @handle.' : formState.scraping_strategy === 'youtube_music' ? 'Erwartet eine Playlist-URL mit list=...' : undefined}
                                    InputProps={{
                                        endAdornment: showAiSuggest ? (
                                            <InputAdornment position="end">
                                                <Button onClick={handleSuggestSelectors} disabled={suggesting || !formState.url_pattern} startIcon={suggesting ? <CircularProgress size={20} /> : <TipsAndUpdatesIcon />}>
                                                    {suggesting ? 'Analysiere...' : 'Vorschlagen'}
                                                </Button>
                                            </InputAdornment>
                                        ) : undefined
                                    }}
                                />
                            </Grid>

                            {showHtmlSelectors && (
                                <>
                                    <Grid item xs={12}><Typography variant="subtitle2" sx={{ mt: 1 }}>HTML-Selektoren / RSS</Typography></Grid>
                                    <Grid item xs={12}><TextField name="content_container_selector" label="Container Selektor" fullWidth value={formState.content_container_selector} onChange={handleFormChange} margin="dense" helperText="Bei RSS/XML leer lassen. Bei HTML: Selektor für jeden einzelnen Eintrag." /></Grid>
                                    <Grid item xs={12}><TextField name="link_selector" label="Link Selektor" fullWidth value={formState.link_selector} onChange={handleFormChange} margin="dense" /></Grid>
                                    {formState.rule_type === 'content' && (
                                        <>
                                            <Grid item xs={12} sm={6}><TextField name="title_selector" label="Titel Selektor" fullWidth value={formState.title_selector} onChange={handleFormChange} margin="dense" /></Grid>
                                            <Grid item xs={12} sm={6}><TextField name="date_selector" label="Datum Selektor" fullWidth value={formState.date_selector} onChange={handleFormChange} margin="dense" /></Grid>
                                            <Grid item xs={12} sm={6}><TextField name="thumbnail_selector" label="Thumbnail Selektor" fullWidth value={formState.thumbnail_selector} onChange={handleFormChange} margin="dense" /></Grid>
                                            <Grid item xs={12} sm={6}><TextField name="description_selector" label="Beschreibung Selektor" fullWidth value={formState.description_selector} onChange={handleFormChange} margin="dense" /></Grid>
                                        </>
                                    )}
                                </>
                            )}

                            <Grid item xs={12}><Typography variant="subtitle2" sx={{ mt: 1 }}>Einstellungen</Typography></Grid>
                            {formState.rule_type === 'content' && showHtmlSelectors && (
                                <Grid item xs={12}>
                                    <Autocomplete freeSolo options={commonDateFormats.map(option => option.value)}
                                        getOptionLabel={(option) => { const found = commonDateFormats.find(o => o.value === option); return found ? `${found.label} (${found.value})` : option; }}
                                        value={formState.date_format || ''}
                                        onInputChange={(_event, newValue) => { setFormState(prev => ({ ...prev, date_format: newValue })); }}
                                        renderInput={(params) => (<TextField {...params} label="Datum Format (optional)" margin="dense" />)}
                                    />
                                </Grid>
                            )}
                            <Grid item xs={12} sm={6}>
                                <TextField select name="category_default" label="Standard-Kategorie" fullWidth value={formState.category_default} onChange={handleFormChange} margin="dense" required>
                                    <MenuItem value=""><em>Wählen Sie eine Kategorie</em></MenuItem>
                                    {contentCategories.map(cat => <MenuItem key={cat.id} value={cat.name}>{cat.name}</MenuItem>)}
                                </TextField>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField select name="region" label="Region" fullWidth value={formState.region} onChange={handleFormChange} margin="dense">
                                    <MenuItem value=""><em>Keine Region</em></MenuItem>
                                    {europeanCountries.map(country => <MenuItem key={country} value={country}>{country}</MenuItem>)}
                                </TextField>
                            </Grid>

                            {bpCategorySelected && (
                                <Grid item xs={12}>
                                    <TextField select name="business_partner_id" label="Business Partner / Mandant" fullWidth value={formState.business_partner_id || ''} onChange={handleFormChange} margin="dense" required helperText="Businesspartner-News/Events sind mandantenspezifisch. Fleet-News bleiben global für alle Mandanten sichtbar.">
                                        <MenuItem value=""><em>Business Partner wählen</em></MenuItem>
                                        {businessPartners.map(bp => <MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>)}
                                    </TextField>
                                </Grid>
                            )}

                            <Grid item xs={12}>
                                <TextField name="scrape_after_date" label="Inhalte nur nach diesem Datum scrapen (optional)" type="date" fullWidth value={formState.scrape_after_date || ''} onChange={handleFormChange} InputLabelProps={{ shrink: true }} margin="dense" />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <FormControlLabel control={<Switch name="is_active" checked={formState.is_active} onChange={handleFormChange} />} label="Regel für Scraping aktiv" />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <FormControlLabel control={<Switch name="use_headless_browser" checked={formState.use_headless_browser} onChange={handleFormChange} disabled={String(formState.scraping_strategy).startsWith('youtube_')} />} label="Headless-Browser verwenden" />
                                <MuiTooltip title="Für Webseiten, die Inhalte mit JavaScript nachladen. Langsamer und RAM-intensiver. Für YouTube nicht nötig.">
                                    <IconButton size="small"><InfoIcon fontSize="small" /></IconButton>
                                </MuiTooltip>
                            </Grid>
                            <Grid item xs={12}>
                                <Box sx={{ mt: 2, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                    <Typography variant="subtitle1" gutterBottom>Automatisierung (Cronjob)</Typography>
                                    <AdminScheduleSelector value={formState.schedule || null} onChange={(cronString) => setFormState(prev => ({ ...prev, schedule: cronString }))} />
                                </Box>
                            </Grid>

                            <Grid item xs={12}>
                                <Divider sx={{ my: 1 }} />
                                <Button variant="outlined" startIcon={testing ? <CircularProgress size={18} /> : <ScienceIcon />} onClick={handleTestRule} disabled={testing || !formState.url_pattern || !formState.category_default}>
                                    {testing ? 'Teste Regel...' : 'Regel testen ohne Speichern'}
                                </Button>
                            </Grid>

                            {testResult?.preview && (
                                <Grid item xs={12}>
                                    <Alert severity="success" sx={{ mb: 2 }}>
                                        Test erfolgreich: {testResult.preview.found} gefunden, {testResult.preview.would_insert} neu, {testResult.preview.already_existing} bereits vorhanden, {testResult.preview.skipped} übersprungen.
                                        {testResult.preview.containers_found !== undefined && ` Container gefunden: ${testResult.preview.containers_found}.`}
                                        {testResult.preview.channel_title && ` Kanal: ${testResult.preview.channel_title}.`}
                                    </Alert>
                                    {(testResult.validation?.warnings || []).map((warning, idx) => <Alert key={idx} severity="warning" sx={{ mb: 1 }}>{warning}</Alert>)}
                                    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 240 }}>
                                        <Table size="small" stickyHeader>
                                            <TableHead><TableRow><TableCell>Titel</TableCell><TableCell>Datum</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
                                            <TableBody>
                                                {(testResult.preview.items || []).map((item, idx) => (
                                                    <TableRow key={idx}>
                                                        <TableCell>{item.title}</TableCell>
                                                        <TableCell>{item.published_date ? new Date(item.published_date).toLocaleDateString('de-AT') : '-'}</TableCell>
                                                        <TableCell><Chip size="small" label={item.exists ? 'bereits vorhanden' : 'neu'} color={item.exists ? 'default' : 'success'} /></TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                </Grid>
                            )}
                        </Grid>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseDialog}>Abbrechen</Button>
                        <Button onClick={handleSubmit} disabled={loading}>{editingRule ? 'Speichern' : 'Hinzufügen'}</Button>
                    </DialogActions>
                </Dialog>

                <Dialog open={logModalOpen} onClose={handleCloseLogModal} fullWidth maxWidth="md">
                    <DialogTitle>Scraping-Fortschritt</DialogTitle>
                    <DialogContent>
                        {(jobStatus === 'running' || jobStatus === 'pending') && <LinearProgress sx={{ mb: 2 }} />}
                        <Box component="pre" sx={{ maxHeight: 400, overflowY: 'auto', bgcolor: '#f5f5f5', p: 2, borderRadius: 1, whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>
                            {jobLogs.map((log, index) => (
                                <Typography key={index} component="div" variant="body2" sx={{ color: log.log_level === 'ERROR' ? 'red' : 'inherit' }}>
                                    <span style={{ color: 'gray' }}>[{new Date(log.created_at).toLocaleTimeString('de-AT')}]</span>
                                    <span style={{ fontWeight: 'bold', margin: '0 8px' }}>[{log.log_level}]</span>
                                    {log.message}
                                </Typography>
                            ))}
                        </Box>
                        {jobStatus === 'completed' && <Alert severity="success" sx={{mt: 2}}>Job erfolgreich abgeschlossen.</Alert>}
                        {jobStatus === 'failed' && <Alert severity="error" sx={{mt: 2}}>Job mit Fehlern abgebrochen.</Alert>}
                    </DialogContent>
                    <DialogActions><Button onClick={handleCloseLogModal}>Schließen</Button></DialogActions>
                </Dialog>

                <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} message={snackbar.message} />
            </Container>
        </DashboardLayout>
    );
};

export default AdminScrapingRulesPage;
