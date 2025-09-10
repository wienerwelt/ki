import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Accordion, AccordionDetails, AccordionSummary, Box, Typography, TextField, CircularProgress, MenuItem, Alert, List, ListItem, ListItemText, Divider,
    Dialog, DialogTitle, DialogContent, Chip, Button, Grid, Stack, IconButton, Tooltip, Link as MuiLink,
    DialogActions, Paper, InputAdornment, Avatar
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';
import GroupsIcon from '@mui/icons-material/Groups';
import EmailIcon from '@mui/icons-material/Email';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LinkIcon from '@mui/icons-material/Link';
import LanguageIcon from '@mui/icons-material/Language';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ThumbDownOffAltIcon from '@mui/icons-material/ThumbDownOffAlt';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import { Autocomplete } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import posthog from 'posthog-js';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps, Region } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import ClickAwayListener from '@mui/material/ClickAwayListener';

interface ContentItem {
    id: string;
    title: string;
    summary: string | null;
    is_read: boolean;
    published_date: string;
    relevance_score: number;
    original_url?: string | null;
    origin: 'personal_subscription' | 'popular' | 'system_generated';
    user_vote: number;
}
interface AIPromptRule { id: string; name: string; default_category_id?: string; }
interface RelevantAction {
    id: string;
    title: string;
    content_text: string;
    link_url: string;
    image_url: string;
    is_click_tracking_enabled: boolean;
    business_partner_id: string;
}
interface GenericAIWidgetProps extends BaseWidgetProps {
    title: string;
    category: string;
    icon?: React.ReactNode;
    widgetTypeKey: string;
}
interface EmailState { open: boolean; loading: boolean; error: string | null; subject: string; body: string; }

const ArticleBodyRenderer: React.FC<{ summary: string | null | undefined }> = ({ summary }) => {
    if (!summary) return <Typography>Kein Inhalt verfügbar.</Typography>;
    return <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>{summary}</Typography>;
};
const VoteComponent: React.FC<{ item: ContentItem; onVote: (vote: 1 | -1) => void; size?: 'small' | 'medium' }> = ({ item, onVote, size = 'small' }) => {
    const getScoreColor = (score: number) => score > 0 ? 'success.main' : score < 0 ? 'error.main' : 'text.secondary';
    const handleVote = (e: React.MouseEvent, vote: 1 | -1) => { e.stopPropagation(); onVote(vote); };
    return (<Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}><Tooltip title="Hilfreich"><IconButton size={size} onClick={(e) => handleVote(e, 1)} sx={{ p: 0.5 }}>{item.user_vote === 1 ? <ThumbUpIcon color="success" fontSize={size} /> : <ThumbUpOffAltIcon color="action" fontSize={size} />}</IconButton></Tooltip><Typography variant="caption" sx={{ fontWeight: 'bold', color: getScoreColor(item.relevance_score), minWidth: 20, textAlign: 'center' }}>{item.relevance_score}</Typography><Tooltip title="Nicht hilfreich"><IconButton size={size} onClick={(e) => handleVote(e, -1)} sx={{ p: 0.5 }}>{item.user_vote === -1 ? <ThumbDownIcon color="error" fontSize={size} /> : <ThumbDownOffAltIcon color="action" fontSize={size} />}</IconButton></Tooltip></Box>);
};
const AnimatedSearchBar: React.FC<{ onSearch: (term: string) => void }> = ({ onSearch }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { if (isExpanded) { setTimeout(() => inputRef.current?.focus(), 50); } }, [isExpanded]);
    const handleToggle = () => { if (isExpanded) { setSearchTerm(''); onSearch(''); } setIsExpanded((prev) => !prev); };
    const handleClickAway = () => { if (isExpanded && !searchTerm) setIsExpanded(false); };
    const handleClear = (event: React.MouseEvent) => { event.stopPropagation(); setSearchTerm(''); onSearch(''); inputRef.current?.focus(); };
    return (<ClickAwayListener onClickAway={handleClickAway}><Box sx={{ display: 'flex', alignItems: 'center', height: '40px' }}><Box sx={{ display: 'flex', alignItems: 'center', bgcolor: isExpanded ? 'action.hover' : 'transparent', borderRadius: 40, width: isExpanded ? 180 : 32, transition: 'width 0.3s' }}><Tooltip title={isExpanded ? "Suche schließen" : "Suchen"}><IconButton onClick={handleToggle} size="small" sx={{ ml: '4px' }}>{isExpanded ? <CloseIcon fontSize="small" /> : <SearchIcon />}</IconButton></Tooltip><Box sx={{ width: '100%', overflow: 'hidden' }}><TextField variant="standard" fullWidth value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); onSearch(e.target.value); }} placeholder="Suchen..." inputRef={inputRef} sx={{ opacity: isExpanded ? 1 : 0, transition: 'opacity 0.2s', pl: 1, pr: 1 }} InputProps={{ disableUnderline: true, endAdornment: (searchTerm && isExpanded ? (<InputAdornment position="end"><IconButton size="small" onClick={handleClear} edge="end"><ClearIcon fontSize="small" /></IconButton></InputAdornment>) : null) }} /></Box></Box></Box></ClickAwayListener>);
};

const GenericAIWidget: React.FC<GenericAIWidgetProps> = ({ onDelete, widgetId, isRemovable, title, category, icon, widgetTypeKey }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [items, setItems] = useState<ContentItem[]>([]);
    const [counts, setCounts] = useState({ unread: 0, new: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedArticle, setSelectedArticle] = useState<ContentItem | null>(null);
    const [relevantRules, setRelevantRules] = useState<AIPromptRule[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
    const [selectedRuleId, setSelectedRuleId] = useState('');
    const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
    const [keywords, setKeywords] = useState<string[]>([]);
    const [emailState, setEmailState] = useState<EmailState>({ open: false, loading: false, error: null, subject: '', body: '' });
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [filterMode, setFilterMode] = useState<'all' | 'new' | 'unread'>('all');
    const [relevantAction, setRelevantAction] = useState<RelevantAction | null>(null);

    useEffect(() => { const handler = setTimeout(() => { setDebouncedSearchTerm(searchTerm); }, 500); return () => { clearTimeout(handler); }; }, [searchTerm]);
    useEffect(() => { if (user?.regions && user.regions.length > 0) { const defaultRegion = user.regions.find(r => !!r.is_default) || user.regions[0]; setSelectedRegion(defaultRegion); } }, [user?.regions]);
    useEffect(() => { if (relevantRules.length === 1) setSelectedRuleId(relevantRules[0].id); else setSelectedRuleId(''); }, [relevantRules]);

    const fetchData = useCallback(async (currentPage: number, search: string, filter: 'all' | 'new' | 'unread', loadMore = false) => {
        if (!category || !selectedRegion) {
            setItems([]);
            setTotalPages(0);
            setIsLoading(false);
            return;
        }
        
        if (loadMore) setIsLoadingMore(true);
        else setIsLoading(true);
        setError(null);

        try {
            const token = localStorage.getItem('jwt_token');
            const params = new URLSearchParams({ category, region: selectedRegion.name, page: String(currentPage), limit: '5' });
            if (search) params.append('search', search);
            if (filter !== 'all') params.append('filter', filter);
            
            const [rulesRes, contentRes, categoriesRes, actionRes] = await Promise.all([
                apiClient.get('/api/data/ai-prompt-rules', { headers: { 'x-auth-token': token } }),
                apiClient.get(`/api/data/ai-content?${params.toString()}`, { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/data/categories', { headers: { 'x-auth-token': token } }),
                currentPage === 1 ? apiClient.get(`/api/data/relevant-action?category=${category}&region=${selectedRegion.name}`, { headers: { 'x-auth-token': token } }) : Promise.resolve({ data: relevantAction })
            ]);

            const currentCategory = categoriesRes.data.find((c: any) => c.name === category);
            if (currentCategory) setRelevantRules(rulesRes.data.filter((r: any) => r.default_category_id === currentCategory.id));
            
            const newItems = contentRes.data?.data || [];
            setItems(prev => loadMore ? [...prev, ...newItems] : newItems);
            setCounts(contentRes.data?.counts || { unread: 0, new: 0 });
            setTotalPages(contentRes.data?.totalPages || 0);
            setRelevantAction(actionRes.data);

        } catch (err: any) {
            setError(err.response?.data?.message || `Inhalte für "${category}" konnten nicht geladen werden.`);
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }
    }, [category, selectedRegion, relevantAction]);
    
    useEffect(() => {
        setPage(1);
        if (selectedRegion) {
            fetchData(1, debouncedSearchTerm, filterMode);
        }
    }, [selectedRegion, debouncedSearchTerm, filterMode, fetchData]);

    const handleLoadMore = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchData(nextPage, debouncedSearchTerm, filterMode, true);
    };

    const handleActionClick = () => {
        if (!relevantAction) return;
        if (relevantAction.is_click_tracking_enabled) {
            posthog.capture('partner_action_clicked', {
                action_id: relevantAction.id,
                action_title: relevantAction.title,
                business_partner_id: relevantAction.business_partner_id,
                widget_category: category,
            });
        }
        window.open(relevantAction.link_url, '_blank', 'noopener,noreferrer');
    };

    const handleReportError = () => {
        navigate('/feedback', {
            state: { type: 'bug', widget: title, error: error, widgetKey: widgetTypeKey }
        });
    };
    
    const handleOpenArticle = async (article: ContentItem) => {
        setSelectedArticle(article);
        if (!article.is_read) {
            try {
                const token = localStorage.getItem('jwt_token');
                await apiClient.post(`/api/data/content/${article.id}/mark-as-read`, {}, { headers: { 'x-auth-token': token } });
                setItems(prev => prev.map(n => n.id === article.id ? { ...n, is_read: true } : n));
                setCounts(prev => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
            } catch (err) { console.error("Fehler beim Markieren als gelesen:", err); }
        }
    };
    const handleVote = async (contentId: string, vote: 1 | -1) => {
        const token = localStorage.getItem('jwt_token');
        const currentItem = items.find(item => item.id === contentId) || selectedArticle;
        if (!currentItem) return;
        const newVote = currentItem.user_vote === vote ? 0 : vote;
        try {
            const res = await apiClient.post(`/api/data/content/${contentId}/vote`, { vote: newVote, contentType: 'ai_content' }, { headers: { 'x-auth-token': token } });
            const newScore = res.data.relevance_score;
            setItems(prev => prev.map(item => item.id === contentId ? { ...item, relevance_score: newScore, user_vote: newVote } : item));
            if (selectedArticle?.id === contentId) setSelectedArticle(prev => prev ? { ...prev, relevance_score: newScore, user_vote: newVote } : null);
        } catch (err) { console.error("Fehler bei der Abstimmung:", err); }
    };
    const handleSubmitSubscription = async () => {
        if (!selectedRuleId || !selectedRegion || keywords.length === 0) {
            setSubmitError("Analyse-Typ, eine spezifische Region und Keywords sind für ein Abo erforderlich.");
            return;
        }
        setIsSubmitting(true);
        setSubmitError(null);
        setSubmitSuccess(null);
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.post('/api/admin/subscriptions', { ruleId: selectedRuleId, region: selectedRegion.name, keywords }, { headers: { 'x-auth-token': token } });
            setSubmitSuccess(`Ihr Abonnement wurde gespeichert.`);
            setKeywords([]);
            setTimeout(() => fetchData(1, debouncedSearchTerm, filterMode), 5000);
        } catch (err: any) {
            setSubmitError(err.response?.data?.message || 'Fehler beim Speichern.');
        } finally {
            setIsSubmitting(false);
        }
    };
    const handleGenerateEmail = async () => {
        if (!selectedArticle) return;
        setEmailState({ ...emailState, loading: true, open: true, error: null });
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.post('/api/data/generate-email', { content: selectedArticle.summary, title: selectedArticle.title }, { headers: { 'x-auth-token': token } });
            setEmailState({ open: true, loading: false, error: null, subject: response.data.subject, body: response.data.body });
        } catch (err: any) {
            setEmailState({ ...emailState, open: true, loading: false, error: err.response?.data?.message || 'E-Mail konnte nicht generiert werden.' });
        }
    };
    const getOriginProps = (origin: ContentItem['origin']) => {
        switch (origin) {
            case 'personal_subscription': return { text: 'Persönlich für Sie', icon: <PersonIcon fontSize="inherit" color="primary" />, tooltip: 'Dieser Inhalt wurde aufgrund Ihrer abonnierten "Hot Topics" generiert.' };
            case 'popular': return { text: 'Interessiert andere', icon: <GroupsIcon fontSize="inherit" color="action" />, tooltip: 'Dieser Inhalt wurde von anderen Nutzern abonniert oder ist im Netzwerk beliebt.' };
            case 'system_generated': return { text: 'Aus dem Netz', icon: <LanguageIcon fontSize="inherit" color="disabled" />, tooltip: 'Dieser Inhalt wurde systemseitig als relevant eingestuft.' };
            default: return { text: null, icon: null, tooltip: null };
        }
    };
    const handleCloseDialog = () => setSelectedArticle(null);
    const handleCloseEmailDialog = () => setEmailState({ ...emailState, open: false });
    const handleCopyToClipboard = (text: string) => navigator.clipboard.writeText(text);

    return (
        <WidgetPaper 
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', width: '100%' }}>
                    {icon}
                    <Typography variant="h6">{title}</Typography>
                    <Chip
                        label="Neu"
                        size="small"
                        variant={filterMode === 'new' ? 'filled' : 'outlined'}
                        color="primary"
                        clickable
                        onClick={() => setFilterMode(filterMode === 'new' ? 'all' : 'new')}
                        avatar={<Avatar sx={{ width: 22, height: 22, fontSize: '0.75rem', bgcolor: 'primary.main', color: 'primary.contrastText' }}>{counts.new}</Avatar>}
                    />
                    <Chip
                        label="Ungelesen"
                        size="small"
                        variant={filterMode === 'unread' ? 'filled' : 'outlined'}
                        color="secondary"
                        clickable
                        onClick={() => setFilterMode(filterMode === 'unread' ? 'all' : 'unread')}
                        avatar={<Avatar sx={{ width: 22, height: 22, fontSize: '0.75rem', bgcolor: 'secondary.main', color: 'secondary.contrastText' }}>{counts.unread}</Avatar>}
                    />
                    <Box sx={{ flexGrow: 1 }} />
                    <AnimatedSearchBar onSearch={setSearchTerm} />
                    {user?.regions && user.regions.length > 0 && (
                        <TextField
                            select value={selectedRegion?.id || ''}
                            onChange={(e) => {
                                const region = user?.regions?.find(r => r.id === e.target.value);
                                setSelectedRegion(region || null);
                            }}
                            size="small" variant="outlined" sx={{ minWidth: 60, '& .MuiSelect-select': { paddingRight: '24px' } }}
                        >
                            {user?.regions?.map((region) => <MenuItem key={region.id} value={region.id}><Tooltip title={region.name} placement="right"><img src={`https://flagcdn.com/w20/${region.code.toLowerCase()}.png`} width="20" alt={region.name} style={{ border: '1px solid #eee' }} /></Tooltip></MenuItem>)}
                        </TextField>
                    )}
                </Box>
            }
            widgetTitle={title}
            widgetTypeKey={widgetTypeKey}
            widgetId={widgetId || ''} 
            onDelete={onDelete} 
            isRemovable={isRemovable}
        >
            {isLoading && page === 1 ? (
                <Box sx={{ m: 'auto', textAlign: 'center' }}>
                    <CircularProgress />
                </Box>
            ) : error ? (
                <Alert
                    severity="error"
                    action={
                        <Button color="inherit" size="small" onClick={handleReportError} startIcon={<ReportProblemOutlinedIcon />}>
                            Fehler Melden
                        </Button>
                    }
                >
                    {error}
                </Alert>
            ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                        {items.length > 0 ? (
                            <List dense>
                                {items.map((item, index) => {
                                    const originProps = getOriginProps(item.origin);
                                    return (
                                        <React.Fragment key={item.id}>
                                            <ListItem button onClick={() => handleOpenArticle(item)}>
                                                <ListItemText 
                                                    primary={<Typography variant="body2" sx={{ fontWeight: item.is_read ? 'normal' : 'bold' }}>{item.title}</Typography>}
                                                    secondaryTypographyProps={{ component: 'div' }}
                                                    secondary={
                                                        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
                                                            <Tooltip title={originProps.tooltip || ''}><Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.75rem', color: 'text.secondary' }}>{originProps.icon}<span style={{ marginLeft: '4px' }}>{originProps.text}</span></Box></Tooltip>
                                                            <Box sx={{ flexGrow: 1 }} />
                                                            <VoteComponent item={item} onVote={(vote) => handleVote(item.id, vote)} />
                                                        </Box>
                                                    }
                                                />
                                            </ListItem>
                                            {index < items.length - 1 && <Divider component="li" />}
                                        </React.Fragment>
                                    );
                                })}
                            </List>
                        ) : ( <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>Keine Artikel für Ihre Auswahl gefunden.</Typography> )}
                        
                        {page < totalPages && (
                            <Box sx={{ textAlign: 'center', p: 1 }}>
                                <Button onClick={handleLoadMore} disabled={isLoadingMore}>
                                    {isLoadingMore ? <CircularProgress size={24} /> : 'Mehr laden'}
                                </Button>
                            </Box>
                        )}

                        {relevantAction && (
                            <Paper variant="outlined" sx={{ mt: 2, p: 1.5, borderColor: 'primary.main' }}>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    {relevantAction.image_url && <Avatar src={relevantAction.image_url} sx={{ width: 56, height: 56 }} variant="rounded" />}
                                    <Box flexGrow={1}>
                                        <Typography variant="caption" color="primary.main">Lösungspartner</Typography>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{relevantAction.title}</Typography>
                                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{relevantAction.content_text}</Typography>
                                    </Box>
                                    <Button variant="contained" size="small" onClick={handleActionClick}>
                                        Mehr erfahren
                                    </Button>
                                </Stack>
                            </Paper>
                        )}
                    </Box>
                    
                    <Accordion disableGutters elevation={0} sx={{ p: 0, '&.Mui-expanded': { margin: 0 }, '&:before': { display: 'none' } }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ p: 0, minHeight: '36px', '& .MuiAccordionSummary-content': { margin: '8px 0' } }}><Typography variant="body2">Persönliches Thema abonnieren</Typography></AccordionSummary>
                        <AccordionDetails sx={{ p: 1, pt: 0 }}>
                            <Grid container spacing={2}>
                                {relevantRules.length > 1 && <Grid item xs={12}><TextField select fullWidth label="Analyse-Typ für Ihr Abo" value={selectedRuleId} onChange={(e) => setSelectedRuleId(e.target.value)} size="small"><MenuItem value=""><em>Bitte Analyse wählen</em></MenuItem>{relevantRules.map(rule => (<MenuItem key={rule.id} value={rule.id}>{rule.name}</MenuItem>))}</TextField></Grid>}
                                <Grid item xs={12}><Autocomplete multiple freeSolo options={[]} value={keywords} onChange={(e, val) => setKeywords(val)} renderTags={(val, props) => val.map((opt, i) => <Chip label={opt} {...props({ index: i })} />)} renderInput={(params) => <TextField {...params} label={`Meine Hot Topics in ${selectedRegion?.name || ''}`} size="small" />}/></Grid>
                            </Grid>
                            <Button variant="contained" size="small" sx={{ mt: 2 }} startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : <SendIcon />} onClick={handleSubmitSubscription} disabled={isSubmitting || !selectedRuleId || !selectedRegion || keywords.length === 0}>Thema abonnieren</Button>
                            {submitSuccess && <Alert severity="success" sx={{ mt: 1, p: '0 16px' }}>{submitSuccess}</Alert>}
                            {submitError && <Alert severity="error" sx={{ mt: 1, p: '0 16px' }}>{submitError}</Alert>}
                        </AccordionDetails>
                    </Accordion>
                </Box>
            )}

            <Dialog open={!!selectedArticle} onClose={handleCloseDialog} fullWidth maxWidth="md" PaperProps={{ sx: { height: '90vh' } }}>
                <DialogTitle sx={{ m: 0, p: 2 }}><Box display="flex" justifyContent="space-between" alignItems="center"><Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>{selectedArticle?.title}</Typography><IconButton aria-label="close" onClick={handleCloseDialog} sx={{ ml: 2 }}><CloseIcon /></IconButton></Box></DialogTitle>
                <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', p: 2 }}>
                    <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: 2 }}>
                        <ArticleBodyRenderer summary={selectedArticle?.summary} />
                        {selectedArticle?.original_url && (
                            <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                                <MuiLink href={selectedArticle.original_url} target="_blank" rel="noopener noreferrer" sx={{display: 'inline-flex', alignItems: 'center'}}>
                                    <LinkIcon sx={{mr: 1}}/>
                                    Originalquelle besuchen
                                </MuiLink>
                            </Box>
                        )}
                    </Box>
                    <Paper elevation={3} sx={{ position: 'sticky', bottom: 0, mt: 2, p: 1, alignSelf: 'center', borderRadius: '50px', backdropFilter: 'blur(8px)', backgroundColor: 'rgba(255, 255, 255, 0.8)' }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                            {selectedArticle && <VoteComponent item={selectedArticle} onVote={(vote) => handleVote(selectedArticle.id, vote)} size="medium" />}
                            <Divider orientation="vertical" flexItem />
                            <Tooltip title="E-Mail-Entwurf generieren"><IconButton onClick={handleGenerateEmail} disabled={emailState.loading}><EmailIcon /></IconButton></Tooltip>
                        </Stack>
                    </Paper>
                </DialogContent>
            </Dialog>

            <Dialog open={emailState.open} onClose={handleCloseEmailDialog} fullWidth maxWidth="md">
                <DialogTitle>E-Mail-Entwurf</DialogTitle>
                <DialogContent>
                    {emailState.loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 5 }}><CircularProgress /></Box>}
                    {emailState.error && <Alert severity="error">{emailState.error}</Alert>}
                    {!emailState.loading && !emailState.error && (
                        <Stack spacing={2} sx={{ mt: 1 }}>
                            <TextField label="Betreff" fullWidth value={emailState.subject} onChange={(e) => setEmailState(s => ({ ...s, subject: e.target.value }))} InputProps={{ endAdornment: (<Tooltip title="Betreff kopieren"><IconButton onClick={() => handleCopyToClipboard(emailState.subject)}><ContentCopyIcon /></IconButton></Tooltip>)}}/>
                            <TextField label="E-Mail-Text" fullWidth multiline rows={10} value={emailState.body} onChange={(e) => setEmailState(s => ({ ...s, body: e.target.value }))}/>
                            <Button onClick={() => handleCopyToClipboard(emailState.body)} startIcon={<ContentCopyIcon />}>E-Mail-Text kopieren</Button>
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions><Button onClick={handleCloseEmailDialog}>Schließen</Button></DialogActions>
            </Dialog>
        </WidgetPaper>
    );
};

export default GenericAIWidget;