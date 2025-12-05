import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
    Accordion, AccordionDetails, AccordionSummary, Box, Typography, TextField, CircularProgress, MenuItem, Alert, List, ListItem, ListItemText, Divider,
    Dialog, DialogTitle, DialogContent, Chip, Button, Grid, Stack, IconButton, Tooltip, Link as MuiLink,
    DialogActions, Paper, InputAdornment, Avatar, useTheme, useMediaQuery, Popover, Card, CardMedia, CardContent, CardActionArea,
    FormControl, InputLabel, Select, SelectChangeEvent, Autocomplete, Modal, Fade, ListItemAvatar
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ThumbDownOffAltIcon from '@mui/icons-material/ThumbDownOffAlt';
import ShareIcon from '@mui/icons-material/Share';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import TuneIcon from '@mui/icons-material/Tune';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckIcon from '@mui/icons-material/Check';
import PersonIcon from '@mui/icons-material/Person';
import GroupsIcon from '@mui/icons-material/Groups';
import EmailIcon from '@mui/icons-material/Email';
import LinkIcon from '@mui/icons-material/Link';
import LanguageIcon from '@mui/icons-material/Language';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SendIcon from '@mui/icons-material/Send';
import NewspaperIcon from '@mui/icons-material/Newspaper';

import { useNavigate } from 'react-router-dom';
import posthog from 'posthog-js';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps, Region } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';

// --- Interfaces ---
interface ContentItem {
    id: string;
    title: string;
    summary: string | null;
    is_read: boolean;
    published_date: string;
    relevance_score: number;
    original_url?: string | null;
    category: string;
    user_vote: number;
    region: string | null;
    is_trusted_source: boolean;
    thumbnail_url?: string | null;
    tags?: string[] | null;
    origin: 'personal_subscription' | 'popular' | 'system_generated';
}
interface AIPromptRule { id: string; name: string; default_category_id?: string; }
interface Tag { name: string; count: number; }
interface HighlightedTextProps { text: string; keywords: string[]; }
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
    icon?: React.ReactNode;
    title: string;
    category: string;
    description?: string;
    filterLabel?: string | null;
    widgetTypeKey: string;
}
interface EmailState { open: boolean; loading: boolean; error: string | null; subject: string; body: string; }
interface ShareState { open: boolean; loading: boolean; error: string | null; success: string | null; recipientEmail: string; }
interface AiDraftState { open: boolean; loading: boolean; error: string | null; content: string; }

// HELPER: Sicheres Datumsformat
const safeDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-AT');
};

// HELPER: Zähler-Formatierung (>10)
const formatCount = (count: number) => count > 10 ? ">10" : count;

const ArticleBodyRenderer: React.FC<{ summary: string | null | undefined }> = ({ summary }) => {
    if (!summary) return <Typography>Kein Inhalt verfügbar.</Typography>;
    return (
        <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
            {summary}
        </Typography>
    );
};

const HighlightedText: React.FC<HighlightedTextProps> = ({ text, keywords }) => {
    const parts = useMemo(() => {
        if (!keywords || keywords.length === 0 || !text) return [text];
        const regex = new RegExp(`\\b(${keywords.join('|')})`, 'gi');
        const matches = [...text.matchAll(regex)];
        if (matches.length === 0) return [text];

        const result: (string | JSX.Element)[] = [];
        let lastIndex = 0;
        matches.forEach((match, index) => {
            const keyword = match[0];
            const startIndex = match.index!;
            if (startIndex > lastIndex) result.push(text.substring(lastIndex, startIndex));
            result.push(<mark key={index}>{keyword}</mark>);
            lastIndex = startIndex + keyword.length;
        });
        if (lastIndex < text.length) result.push(text.substring(lastIndex));
        return result;
    }, [text, keywords]);

    return <span>{parts}</span>;
};

const VoteComponent: React.FC<{ item: ContentItem; onVote: (vote: 1 | -1) => void; size?: 'small' | 'medium' }> = ({ item, onVote, size = 'small' }) => {
    const getScoreColor = (score: number) => score > 0 ? 'success.main' : score < 0 ? 'error.main' : 'text.secondary';
    const handleVote = (e: React.MouseEvent, vote: 1 | -1) => { e.stopPropagation(); onVote(vote); };
    return (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <Tooltip title="Hilfreich">
                <IconButton size={size} onClick={(e) => handleVote(e, 1)} sx={{ p: 0.5 }}>
                    {item.user_vote === 1 ? <ThumbUpIcon color="success" fontSize={size} /> : <ThumbUpOffAltIcon color="action" fontSize={size} />}
                </IconButton>
            </Tooltip>
            <Typography variant="caption" sx={{ fontWeight: 'bold', color: getScoreColor(item.relevance_score), minWidth: 20, textAlign: 'center' }}>
                {item.relevance_score}
            </Typography>
            <Tooltip title="Nicht hilfreich">
                <IconButton size={size} onClick={(e) => handleVote(e, -1)} sx={{ p: 0.5 }}>
                    {item.user_vote === -1 ? <ThumbDownIcon color="error" fontSize={size} /> : <ThumbDownOffAltIcon color="action" fontSize={size} />}
                </IconButton>
            </Tooltip>
        </Box>
    );
};

const getDomain = (url: string | null | undefined): string | null => {
    if (!url) return null;
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return null; }
};

const AnimatedSearchBar: React.FC<{ onSearch: (term: string) => void }> = ({ onSearch }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { if (isExpanded) setTimeout(() => inputRef.current?.focus(), 50); }, [isExpanded]);
    const handleToggle = () => { if (isExpanded) { setSearchTerm(''); onSearch(''); } setIsExpanded((prev) => !prev); };
    const handleClickAway = () => { if (isExpanded && !searchTerm) setIsExpanded(false); };
    const handleClear = (event: React.MouseEvent) => { event.stopPropagation(); setSearchTerm(''); onSearch(''); inputRef.current?.focus(); };
    return (
        <ClickAwayListener onClickAway={handleClickAway}>
            <Box sx={{ display: 'flex', alignItems: 'center', height: '40px' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: isExpanded ? 'action.hover' : 'transparent', borderRadius: 40, width: isExpanded ? 180 : 32, transition: 'width 0.3s' }}>
                    <Tooltip title={isExpanded ? "Suche schließen" : "Suchen"}><IconButton onClick={handleToggle} size="small" sx={{ ml: '4px' }}>{isExpanded ? <CloseIcon fontSize="small" /> : <SearchIcon />}</IconButton></Tooltip>
                    <Box sx={{ width: '100%', overflow: 'hidden' }}>
                        <TextField variant="standard" fullWidth value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); onSearch(e.target.value); }} placeholder="Suchen..." inputRef={inputRef} sx={{ opacity: isExpanded ? 1 : 0, transition: 'opacity 0.2s', pl: 1, pr: 1 }} InputProps={{ disableUnderline: true, endAdornment: (searchTerm && isExpanded ? (<InputAdornment position="end"><IconButton size="small" onClick={handleClear} edge="end"><ClearIcon fontSize="small" /></IconButton></InputAdornment>) : null) }} />
                    </Box>
                </Box>
            </Box>
        </ClickAwayListener>
    );
};

const GenericAIWidget: React.FC<GenericAIWidgetProps> = ({ onDelete, widgetId, isRemovable, icon, title, category, description, filterLabel, widgetTypeKey }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const [filterAnchorEl, setFilterAnchorEl] = useState<null | HTMLElement>(null);

    const handleOpenFilterMenu = (event: React.MouseEvent<HTMLElement>) => setFilterAnchorEl(event.currentTarget);
    const handleCloseFilterMenu = () => setFilterAnchorEl(null);

    const [items, setItems] = useState<ContentItem[]>([]);
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
    const [shareState, setShareState] = useState<ShareState>({ open: false, loading: false, error: null, success: null, recipientEmail: '' });
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [availableTags, setAvailableTags] = useState<Tag[]>([]);
    const [selectedTag, setSelectedTag] = useState('all');
    const [filterMode, setFilterMode] = useState<'all' | 'new' | 'unread'>('all');
    const [relevantAction, setRelevantAction] = useState<RelevantAction | null>(null);
    const [counts, setCounts] = useState({ unread: 0, new: 0 });
    const [isImageModalOpen, setImageModalOpen] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [aiDraftState, setAiDraftState] = useState<AiDraftState>({ open: false, loading: false, error: null, content: '' });
    const [activeGlobalTags, setActiveGlobalTags] = useState<string[]>([]);
    const [sortBy, setSortBy] = useState('date');

    useEffect(() => { const handler = setTimeout(() => { setDebouncedSearchTerm(searchTerm); }, 500); return () => { clearTimeout(handler); }; }, [searchTerm]);
    useEffect(() => { if (user?.regions && user.regions.length > 0) { const defaultRegion = user.regions.find(r => !!r.is_default) || user.regions[0]; setSelectedRegion(defaultRegion); } }, [user?.regions]);
    useEffect(() => { if (relevantRules.length === 1) setSelectedRuleId(relevantRules[0].id); else setSelectedRuleId(''); }, [relevantRules]);

    useEffect(() => {
        if (!category) return;
        const token = localStorage.getItem('jwt_token');
        apiClient.get(`/api/data/tags?category=${category}`, { headers: { 'x-auth-token': token } })
            .then(tagsRes => setAvailableTags(tagsRes.data || []))
            .catch(e => console.error("Could not load tags", e));
    }, [category]);

    const fetchData = useCallback(async (currentPage: number, currentSortBy: string, search: string, filter: 'all' | 'new' | 'unread', loadMore = false) => {
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
            const params = new URLSearchParams({ category, region: selectedRegion.name, page: String(currentPage), limit: '5', sortBy: currentSortBy });
            if (search) params.append('search', search);
            if (filter !== 'all') params.append('filter', filter);
            if (selectedTag !== 'all') params.append('tag', selectedTag);
            
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
            
            if (newItems.length > 0) {
                 const allTags = newItems.flatMap((item: ContentItem) => item.tags || []);
                 setActiveGlobalTags([...new Set(allTags)] as string[]);
            }

            setCounts(contentRes.data?.counts || { unread: 0, new: 0 });
            setTotalPages(contentRes.data?.totalPages || 0);
            setRelevantAction(actionRes.data);

        } catch (err: any) {
            setError(err.response?.data?.message || `Inhalte für "${category}" konnten nicht geladen werden.`);
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }
    }, [category, selectedRegion, relevantAction, selectedTag]);
    
    useEffect(() => {
        setPage(1);
        if (selectedRegion) {
            fetchData(1, sortBy, debouncedSearchTerm, filterMode);
        }
    }, [selectedRegion, sortBy, debouncedSearchTerm, filterMode, fetchData]);

    const handleLoadMore = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchData(nextPage, sortBy, debouncedSearchTerm, filterMode, true);
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
            setTimeout(() => fetchData(1, sortBy, debouncedSearchTerm, filterMode), 5000);
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
    
    const handleOpenShareDialog = () => {
        if (!selectedArticle) return;
        setShareState({ open: true, loading: false, error: null, success: null, recipientEmail: '' });
    };
    const handleCloseShareDialog = () => setShareState({ ...shareState, open: false });
    
    const handleSendEmail = async () => {
        if (!selectedArticle || !shareState.recipientEmail) return;
        setShareState(prev => ({ ...prev, loading: true, error: null, success: null }));
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.post('/api/data/share-content-by-email', {
                title: selectedArticle.title,
                summary: selectedArticle.summary,
                source: selectedArticle.original_url,
                recipientEmail: shareState.recipientEmail
            }, { headers: { 'x-auth-token': token } });
            setShareState(prev => ({ ...prev, loading: false, success: response.data.message }));
        } catch (err: any) {
            setShareState(prev => ({ ...prev, loading: false, error: err.response?.data?.message || 'E-Mail konnte nicht gesendet werden.' }));
        }
    };

    const handleCloseDialog = () => setSelectedArticle(null);
    const handleCloseEmailDialog = () => setEmailState({ ...emailState, open: false });
    const handleCopyToClipboard = (text: string) => navigator.clipboard.writeText(text);
    
    const handleSimpleCopy = () => {
        if (!selectedArticle) return;
        const textToCopy = `${selectedArticle.title}\n\n${selectedArticle.summary}`;
        navigator.clipboard.writeText(textToCopy);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };    

    const handleGenerateAiDraft = async () => {
        if (!selectedArticle) return;
        setAiDraftState({ ...aiDraftState, open: true, loading: true, error: null, content: '' });
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.post('/api/data/generate-draft-from-content', 
                { contentId: selectedArticle.id }, 
                { headers: { 'x-auth-token': token } }
            );
            setAiDraftState({ open: true, loading: false, error: null, content: response.data.draft });
        } catch (err: any) {
            setAiDraftState({ open: true, loading: false, error: err.response?.data?.message || 'Der KI-Entwurf konnte nicht erstellt werden.', content: '' });
        }
    };
    const handleCloseAiDraftDialog = () => setAiDraftState({ ...aiDraftState, open: false });

    const renderFilterControls = (isMenu: boolean) => {
         const controlWrapper = (child: React.ReactNode) => isMenu 
            ? <Box sx={{ p: 1, width: 220 }}>{child}</Box> 
            : child;
        return (
            <>
                {isMenu && controlWrapper(
                     <TextField
                        variant="outlined"
                        fullWidth
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Suchen..."
                        size="small"
                        InputProps={{
                            startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>)
                        }}
                    />
                )}
                 {user?.regions && user.regions.length > 0 && controlWrapper(
                    <TextField
                        select value={selectedRegion?.id || ''}
                        onChange={(e) => {
                            const region = user?.regions?.find(r => r.id === e.target.value);
                            setSelectedRegion(region || null);
                        }}
                        size="small" variant="outlined" sx={{ minWidth: 60, '& .MuiSelect-select': { paddingRight: '24px' } }}
                        fullWidth={isMenu}
                        label={isMenu ? "Region" : ""}
                    >
                        {user?.regions?.map((region) => <MenuItem key={region.id} value={region.id}><Tooltip title={region.name} placement="right"><img src={`https://flagcdn.com/w20/${region.code.toLowerCase()}.png`} width="20" alt={region.name} style={{ border: '1px solid #eee' }} /></Tooltip></MenuItem>)}
                    </TextField>
                )}
                {filterLabel && availableTags.length > 0 && controlWrapper(
                    <FormControl size="small" variant="outlined" fullWidth={isMenu} sx={{ minWidth: 140 }}>
                        <InputLabel>{filterLabel}</InputLabel>
                        <Select value={selectedTag} onChange={(e: SelectChangeEvent) => setSelectedTag(e.target.value)} label={filterLabel}>
                            <MenuItem value="all">Alle</MenuItem>
                            {availableTags.map((tag) => (
                                <MenuItem key={tag.name} value={tag.name}>
                                    {tag.name} ({tag.count})
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}
                {controlWrapper(
                    <FormControl size="small" variant="outlined" fullWidth={isMenu} sx={{ minWidth: 120 }}>
                        <InputLabel>Sortieren</InputLabel>
                        <Select value={sortBy} onChange={(e: SelectChangeEvent) => setSortBy(e.target.value)} label="Sortieren">
                            <MenuItem value="date">Neueste</MenuItem>
                            <MenuItem value="relevance">Relevanz</MenuItem>
                        </Select>
                    </FormControl>
                )}
            </>
        );
    };

    return (
        <WidgetPaper 
            title={
                 <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'nowrap', width: '100%', overflow: 'hidden' }}>
                    <Tooltip title={description || title}><span>{icon}</span></Tooltip>
                    <Typography variant="h6" noWrap>{title}</Typography>
                     {isMobile ? (
                        <>
                            <Tooltip title="Neu">
                                <Chip
                                    size="small"
                                    onClick={() => setFilterMode(filterMode === 'new' ? 'all' : 'new')}
                                    sx={{ 
                                        bgcolor: filterMode === 'new' ? 'primary.main' : 'action.hover',
                                        color: filterMode === 'new' ? 'primary.contrastText' : 'text.primary',
                                        '& .MuiChip-avatar': { color: 'inherit !important' }
                                    }}
                                    avatar={<Avatar sx={{ width: 22, height: 22, fontSize: '0.75rem', color: 'inherit', bgcolor: 'transparent' }}>{formatCount(counts.new)}</Avatar>}
                                />
                            </Tooltip>
                             <Tooltip title="Ungelesen">
                                <Chip
                                    size="small"
                                    onClick={() => setFilterMode(filterMode === 'unread' ? 'all' : 'unread')}
                                     sx={{ 
                                        bgcolor: filterMode === 'unread' ? 'secondary.main' : 'action.hover',
                                        color: filterMode === 'unread' ? 'secondary.contrastText' : 'text.primary',
                                        '& .MuiChip-avatar': { color: 'inherit !important' }
                                    }}
                                    avatar={<Avatar sx={{ width: 22, height: 22, fontSize: '0.75rem', color: 'inherit', bgcolor: 'transparent' }}>{formatCount(counts.unread)}</Avatar>}
                                />
                            </Tooltip>
                        </>
                    ) : (
                         <>
                            <Chip
                                label="Neu"
                                size="small"
                                variant={filterMode === 'new' ? 'filled' : 'outlined'}
                                color="primary"
                                clickable
                                onClick={() => setFilterMode(filterMode === 'new' ? 'all' : 'new')}
                                avatar={<Avatar sx={{ width: 22, height: 22, fontSize: '0.75rem', bgcolor: 'primary.main', color: 'primary.contrastText' }}>{formatCount(counts.new)}</Avatar>}
                            />
                            <Chip
                                label="Ungelesen"
                                size="small"
                                variant={filterMode === 'unread' ? 'filled' : 'outlined'}
                                color="secondary"
                                clickable
                                onClick={() => setFilterMode(filterMode === 'unread' ? 'all' : 'unread')}
                                avatar={<Avatar sx={{ width: 22, height: 22, fontSize: '0.75rem', bgcolor: 'secondary.main', color: 'secondary.contrastText' }}>{formatCount(counts.unread)}</Avatar>}
                            />
                        </>
                    )}
                    <Box sx={{ flexGrow: 1 }} />
                    {isMobile ? (
                        <>
                            <IconButton onClick={handleOpenFilterMenu} size="small">
                                <TuneIcon />
                            </IconButton>
                            <Popover
                                open={Boolean(filterAnchorEl)}
                                anchorEl={filterAnchorEl}
                                onClose={handleCloseFilterMenu}
                                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                            >
                                <Stack spacing={1.5} sx={{ p: 1 }}>
                                    {renderFilterControls(true)}
                                </Stack>
                            </Popover>
                        </>
                    ) : (
                        <>
                           <AnimatedSearchBar onSearch={setSearchTerm} />
                           {renderFilterControls(false)}
                        </>
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
                                    const displayDate = safeDate(item.published_date);

                                    if (index === 0 && item.thumbnail_url) {
                                        return (
                                            <Card key={item.id} elevation={0} square sx={{ borderBottom: 1, borderColor: 'divider' }}>
                                                <CardActionArea onClick={() => handleOpenArticle(item)}>
                                                    <CardMedia
                                                        component="img"
                                                        image={item.thumbnail_url}
                                                        alt={item.title}
                                                        sx={{ width: '100%', height: 'auto', maxHeight: '180px', objectFit: 'cover' }}
                                                    />
                                                    <CardContent>
                                                        <Typography gutterBottom variant="h6" component="div" sx={{ fontWeight: item.is_read ? 'normal' : 'bold' }}>
                                                            <HighlightedText text={item.title} keywords={activeGlobalTags} />
                                                        </Typography>
                                                    </CardContent>
                                                </CardActionArea>
                                                <Box sx={{ px: 2, pb: 2, pt: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {displayDate}
                                                        </Typography>
                                                        {getDomain(item.original_url) && (
                                                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                                                <MuiLink href={item.original_url!} target="_blank" rel="noopener noreferrer" variant="caption">
                                                                    {getDomain(item.original_url)}
                                                                </MuiLink>
                                                                {item.is_trusted_source && (
                                                                    <Tooltip title="Info zu geprüften Quellen">
                                                                        <IconButton size="small" sx={{ p: 0, ml: 0.25 }}>
                                                                            <VerifiedUserIcon sx={{ fontSize: 14, color: 'success.main' }} />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                )}
                                                            </Box>
                                                        )}
                                                    </Box>
                                                    <VoteComponent item={item} onVote={(vote) => handleVote(item.id, vote)} />
                                                </Box>
                                            </Card>
                                        );
                                    }

                                    return (
                                        <React.Fragment key={item.id}>
                                            <ListItem button onClick={() => handleOpenArticle(item)} alignItems="flex-start">
                                                 <ListItemAvatar sx={{ mt: 1, mr: 2 }}>
                                                    {item.thumbnail_url ? (
                                                        <Avatar variant="rounded" src={item.thumbnail_url} sx={{ width: 56, height: 56 }} />
                                                    ) : (
                                                         <Avatar variant="rounded" sx={{ width: 56, height: 56, bgcolor: 'background.default' }}>
                                                            <NewspaperIcon color="action" />
                                                        </Avatar>
                                                    )}
                                                </ListItemAvatar>
                                                <ListItemText 
                                                    primary={
                                                        <Typography variant="body2" sx={{ fontWeight: item.is_read ? 'normal' : 'bold' }}>
                                                            <HighlightedText text={item.title} keywords={activeGlobalTags} />
                                                        </Typography>
                                                    }
                                                    secondaryTypographyProps={{ component: 'div' }}
                                                    secondary={
                                                        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
                                                            <Typography variant="caption" color="text.secondary">{displayDate}</Typography>
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
                                <Grid item xs={12}><Autocomplete multiple freeSolo options={[]} value={keywords} onChange={(_e, val) => setKeywords(val)} renderTags={(val, props) => val.map((opt, i) => <Chip label={opt} {...props({ index: i })} />)} renderInput={(params) => <TextField {...params} label={`Meine Hot Topics in ${selectedRegion?.name || ''}`} size="small" />}/></Grid>
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
                        {selectedArticle?.published_date && <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>Veröffentlicht: {safeDate(selectedArticle.published_date)}</Typography>}
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
                            <Tooltip title="Per E-Mail senden"><IconButton onClick={handleOpenShareDialog}><ShareIcon /></IconButton></Tooltip>
                            <Tooltip title={copySuccess ? "Kopiert!" : "Inhalt in Zwischenablage kopieren"}><IconButton onClick={handleSimpleCopy}>{copySuccess ? <CheckIcon color="success" /> : <ContentCopyIcon />}</IconButton></Tooltip>
                            <Tooltip title="E-Mail-Entwurf generieren"><IconButton onClick={handleGenerateEmail} disabled={emailState.loading}><EmailIcon /></IconButton></Tooltip>
                             <Tooltip title="KI-Zusammenfassung erstellen"><IconButton onClick={handleGenerateAiDraft} disabled={aiDraftState.loading}><AutoAwesomeIcon /></IconButton></Tooltip>
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
            
            {/* AI Draft Dialog */}
            <Dialog open={aiDraftState.open} onClose={handleCloseAiDraftDialog} fullWidth maxWidth="md">
                <DialogTitle>KI-generierter Newsletter-Entwurf</DialogTitle>
                <DialogContent>
                    {aiDraftState.loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 5 }}><CircularProgress /></Box>}
                    {aiDraftState.error && <Alert severity="error">{aiDraftState.error}</Alert>}
                    {!aiDraftState.loading && !aiDraftState.error && (
                        <Paper variant="outlined" sx={{ p: 2, mt: 2, maxHeight: '60vh', overflowY: 'auto' }}>
                            <Typography sx={{ whiteSpace: 'pre-wrap' }}>{aiDraftState.content}</Typography>
                        </Paper>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseAiDraftDialog}>Schließen</Button>
                    <Button onClick={() => navigator.clipboard.writeText(aiDraftState.content)} startIcon={<ContentCopyIcon />} disabled={!aiDraftState.content}>Text kopieren</Button>
                </DialogActions>
            </Dialog>

            <Modal open={isImageModalOpen} onClose={() => setImageModalOpen(false)} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Fade in={isImageModalOpen}>
                    <Box onClick={() => setImageModalOpen(false)} sx={{ outline: 'none', cursor: 'pointer', p: 2 }}>
                        <img src={selectedArticle?.thumbnail_url || ''} alt={selectedArticle?.title} style={{ maxHeight: '90vh', maxWidth: '90vw', objectFit: 'contain', borderRadius: 8 }} />
                    </Box>
                </Fade>
            </Modal>

            <Dialog open={shareState.open} onClose={handleCloseShareDialog} fullWidth maxWidth="sm">
                <DialogTitle>Inhalt per E-Mail senden</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <Typography>Der Artikel "{selectedArticle?.title}" wird geteilt.</Typography>
                        <TextField
                            autoFocus
                            margin="dense"
                            id="recipient-email"
                            label="E-Mail-Adresse des Empfängers"
                            type="email"
                            fullWidth
                            variant="standard"
                            value={shareState.recipientEmail}
                            onChange={(e) => setShareState(prev => ({ ...prev, recipientEmail: e.target.value, error: null, success: null }))}
                        />
                        {shareState.error && <Alert severity="error">{shareState.error}</Alert>}
                        {shareState.success && <Alert severity="success">{shareState.success}</Alert>}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseShareDialog}>Abbrechen</Button>
                    <Button onClick={handleSendEmail} disabled={shareState.loading || !shareState.recipientEmail}>
                        Senden
                        {shareState.loading && <CircularProgress size={20} sx={{ ml: 1 }} />}
                    </Button>
                </DialogActions>
            </Dialog>
        </WidgetPaper>
    );
};

export default GenericAIWidget;