import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Box, Typography, CircularProgress, MenuItem, Alert, List, ListItem, ListItemText, Divider,
    Dialog, DialogTitle, DialogContent, Button, Stack, IconButton, Tooltip, Link as MuiLink,
    DialogActions, Select, FormControl, InputLabel, SelectChangeEvent, Avatar, Chip,
    TextField, InputAdornment, Paper, ListItemAvatar
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import LinkIcon from '@mui/icons-material/Link';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ThumbDownOffAltIcon from '@mui/icons-material/ThumbDownOffAlt';
import ShareIcon from '@mui/icons-material/Share';
import DynamicFeedIcon from '@mui/icons-material/DynamicFeed';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import NewspaperIcon from '@mui/icons-material/Newspaper';
import { useNavigate } from 'react-router-dom';
import posthog from 'posthog-js';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps, Region } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import ClickAwayListener from '@mui/material/ClickAwayListener';

interface ScrapedContentItem {
    id: string;
    title: string;
    summary: string | null;
    is_read: boolean;
    published_date: string;
    event_date?: string | null;
    relevance_score: number;
    original_url?: string | null;
    category: string;
    user_vote: number;
    scraped_at: string;
    region: string | null;
    is_trusted_source: boolean;
    thumbnail_url?: string | null;
    tags?: string[] | null;
}
interface Tag {
    name: string;
    count: number;
}
interface RelevantAction {
    id: string;
    title: string;
    content_text: string;
    link_url: string;
    image_url: string;
    is_click_tracking_enabled: boolean;
    business_partner_id: string;
}
interface GenericScrapeWidgetProps extends BaseWidgetProps {
    icon?: React.ReactNode;
    title: string;
    category: string;
    description?: string;
    filterLabel?: string | null;
    widgetTypeKey: string;
}
interface TemplateState {
    open: boolean;
    loading: boolean;
    error: string | null;
    content: string;
}
interface ShareState {
    open: boolean;
    loading: boolean;
    error: string | null;
    success: string | null;
    recipientEmail: string;
}

const ArticleBodyRenderer: React.FC<{ summary: string | null | undefined }> = ({ summary }) => {
    if (!summary) return <Typography>Kein Inhalt verfügbar.</Typography>;
    return (
        <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
            {summary}
        </Typography>
    );
};
const VoteComponent: React.FC<{ item: ScrapedContentItem; onVote: (vote: 1 | -1) => void; size?: 'small' | 'medium' }> = ({ item, onVote, size = 'small' }) => {
    const getScoreColor = (score: number) => score > 0 ? 'success.main' : score < 0 ? 'error.main' : 'text.secondary';
    const handleVote = (e: React.MouseEvent, vote: 1 | -1) => {
        e.stopPropagation();
        onVote(vote);
    };
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
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
        return null;
    }
};
const AnimatedSearchBar: React.FC<{ onSearch: (term: string) => void }> = ({ onSearch }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (isExpanded) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isExpanded]);
    const handleToggle = () => {
        if (isExpanded) {
            setSearchTerm('');
            onSearch('');
        }
        setIsExpanded((prev) => !prev);
    };
    const handleClickAway = () => {
        if (isExpanded && !searchTerm) setIsExpanded(false);
    };
    const handleClear = (event: React.MouseEvent) => {
        event.stopPropagation();
        setSearchTerm('');
        onSearch('');
        inputRef.current?.focus();
    };
    return (
        <ClickAwayListener onClickAway={handleClickAway}>
            <Box sx={{ display: 'flex', alignItems: 'center', height: '40px' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: isExpanded ? 'action.hover' : 'transparent', borderRadius: 40, width: isExpanded ? 180 : 32, transition: 'width 0.3s' }}>
                    <Tooltip title={isExpanded ? "Suche schließen" : "Suchen"}><IconButton onClick={handleToggle} size="small" sx={{ ml: '4px' }}>{isExpanded ? <CloseIcon fontSize="small" /> : <SearchIcon />}</IconButton></Tooltip>
                    <Box sx={{ width: '100%', overflow: 'hidden' }}>
                        <TextField variant="standard" fullWidth value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); onSearch(e.target.value); }} placeholder="Suchen..." inputRef={inputRef} sx={{ opacity: isExpanded ? 1 : 0, transition: 'opacity 0.2s', pl: 1, pr: 1 }}
                            InputProps={{
                                disableUnderline: true,
                                endAdornment: (searchTerm && isExpanded ? (
                                    <InputAdornment position="end">
                                        <IconButton size="small" onClick={handleClear} edge="end"><ClearIcon fontSize="small" /></IconButton>
                                    </InputAdornment>
                                ) : null)
                            }}
                        />
                    </Box>
                </Box>
            </Box>
        </ClickAwayListener>
    );
};


const GenericScrapeWidget: React.FC<GenericScrapeWidgetProps> = ({ onDelete, widgetId, isRemovable, icon, title, category, description, filterLabel, widgetTypeKey }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [items, setItems] = useState<ScrapedContentItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedArticle, setSelectedArticle] = useState<ScrapedContentItem | null>(null);
    const [templateState, setTemplateState] = useState<TemplateState>({ open: false, loading: false, error: null, content: '' });
    const [shareState, setShareState] = useState<ShareState>({ open: false, loading: false, error: null, success: null, recipientEmail: '' });
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [sortBy, setSortBy] = useState('date');
    const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
    const [counts, setCounts] = useState({ unread: 0, new: 0 });
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [availableTags, setAvailableTags] = useState<Tag[]>([]);
    const [selectedTag, setSelectedTag] = useState('all');
    const [filterMode, setFilterMode] = useState<'all' | 'new' | 'unread'>('all');
    const [relevantAction, setRelevantAction] = useState<RelevantAction | null>(null);

    useEffect(() => { const handler = setTimeout(() => { setDebouncedSearchTerm(searchTerm); }, 500); return () => { clearTimeout(handler); }; }, [searchTerm]);
    useEffect(() => { if (user?.regions && user.regions.length > 0) { const defaultRegion = user.regions.find(r => !!r.is_default) || user.regions[0]; setSelectedRegion(defaultRegion); } }, [user?.regions]);

    const fetchData = useCallback(async (currentPage: number, currentSortBy: string, region: Region | null, search: string, subFilter: string, currentFilterMode: string, loadMore = false) => {
        if (!category) {
            setIsLoading(false);
            setError("Keine Kategorie im Widget-Typ konfiguriert.");
            setItems([]);
            return;
        }
        if (loadMore) setIsLoadingMore(true);
        else setIsLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const params = new URLSearchParams({
                page: String(currentPage),
                limit: '10',
                sortBy: currentSortBy,
                region: region ? region.name : 'all',
                category,
                tag: subFilter,
                filter: currentFilterMode
            });
            if (search) params.append('search', search);

            const [contentRes, tagsRes, actionRes] = await Promise.all([
                apiClient.get(`/api/data/scraped-content?${params.toString()}`, { headers: { 'x-auth-token': token } }),
                apiClient.get(`/api/data/tags?category=${category}`, { headers: { 'x-auth-token': token } }),
                apiClient.get(`/api/data/relevant-action?category=${category}&region=${region?.name || 'all'}`, { headers: { 'x-auth-token': token } })
            ]);
            
            const newItems = contentRes.data?.data || [];
            setItems(prev => loadMore ? [...prev, ...newItems] : newItems);
            setTotalPages(contentRes.data?.totalPages || 0);
            setCounts(contentRes.data?.counts || { unread: 0, new: 0 });
            
            if (currentPage === 1) {
                setAvailableTags(tagsRes.data || []);
                setRelevantAction(actionRes.data);
            }

        } catch (err: any) {
            setError(err.response?.data?.message || `Inhalte konnten nicht geladen werden.`);
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }
    }, [category]);

    useEffect(() => { 
        setPage(1);
        if (selectedRegion || (user?.regions && user.regions.length === 0)) {
            fetchData(1, sortBy, selectedRegion, debouncedSearchTerm, selectedTag, filterMode);
        }
     }, [sortBy, selectedRegion, debouncedSearchTerm, selectedTag, filterMode, fetchData, user?.regions]);

    const handleLoadMore = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchData(nextPage, sortBy, selectedRegion, debouncedSearchTerm, selectedTag, filterMode, true);
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

    const handleOpenArticle = async (article: ScrapedContentItem) => {
        setSelectedArticle(article);
        if (!article.is_read) {
            try {
                const token = localStorage.getItem('jwt_token');
                await apiClient.post(`/api/data/scraped-content/${article.id}/mark-as-read`, {}, { headers: { 'x-auth-token': token } });
                setItems(prev => prev.map(n => n.id === article.id ? { ...n, is_read: true } : n));
                setCounts(prev => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
            } catch (err) { console.error("Fehler beim Markieren als gelesen:", err); }
        }
    };
    const handleVote = async (contentId: string, vote: 1 | -1) => {
        const token = localStorage.getItem('jwt_token');
        const currentItem = items.find(item => item.id === contentId);
        if (!currentItem) return;
        const newVote = currentItem.user_vote === vote ? 0 : vote;
        try {
            const res = await apiClient.post(`/api/data/content/${contentId}/vote`, { vote: newVote, contentType: 'scraped_content' }, { headers: { 'x-auth-token': token } });
            const newScore = res.data.relevance_score;
            setItems(prev => prev.map(item => item.id === contentId ? { ...item, relevance_score: newScore, user_vote: newVote } : item));
            if (selectedArticle?.id === contentId) setSelectedArticle(prev => prev ? { ...prev, relevance_score: newScore, user_vote: newVote } : null);
        } catch (err) { console.error("Fehler bei der Abstimmung:", err); }
    };
    const handleGenerateTemplate = async () => {
        if (!selectedArticle) return;
        setTemplateState({ ...templateState, loading: true, open: true, error: null });
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.post('/api/data/generate-newsletter-template', { content: selectedArticle.summary, title: selectedArticle.title }, { headers: { 'x-auth-token': token } });
            setTemplateState({ open: true, loading: false, error: null, content: response.data.template });
        } catch (err: any) {
            setTemplateState({ ...templateState, open: true, loading: false, error: err.response?.data?.message || 'Vorlage konnte nicht generiert werden.' });
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
    const handleCloseTemplateDialog = () => setTemplateState({ ...templateState, open: false });
    const handleCopyToClipboard = (text: string) => navigator.clipboard.writeText(text);

    return (
        <WidgetPaper
            title={
                 <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', width: '100%' }}>
                    <Tooltip title={description || title}><span>{icon}</span></Tooltip>
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
                    {user?.regions && user.regions.length > 1 && (
                        <TextField select value={selectedRegion?.id || ''} onChange={(e) => { const region = user?.regions?.find(r => r.id === e.target.value); setSelectedRegion(region || null); }} size="small" variant="outlined" sx={{ minWidth: 60, '& .MuiSelect-select': { paddingRight: '24px' } }}>
                            {user?.regions?.map((region) => <MenuItem key={region.id} value={region.id}><Tooltip title={region.name} placement="right"><img src={`https://flagcdn.com/w20/${region.code.toLowerCase()}.png`} width="20" alt={region.name} style={{ border: '1px solid #eee' }} /></Tooltip></MenuItem>)}
                        </TextField>
                    )}
                    {filterLabel && availableTags.length > 0 && (
                        <FormControl size="small" variant="outlined" sx={{ minWidth: 140 }}>
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
                    <FormControl size="small" variant="outlined" sx={{ minWidth: 120 }}>
                        <InputLabel>Sortieren</InputLabel>
                        <Select value={sortBy} onChange={(e: SelectChangeEvent) => setSortBy(e.target.value)} label="Sortieren">
                            <MenuItem value="date">Neueste</MenuItem>
                            <MenuItem value="relevance">Relevanz</MenuItem>
                        </Select>
                    </FormControl>
                </Box>
            }
            widgetTitle={title}
            widgetTypeKey={widgetTypeKey}
            widgetId={widgetId || ''}
            onDelete={onDelete}
            isRemovable={isRemovable}
        >
            {isLoading && page === 1 ? (
                <Box sx={{ m: 'auto', textAlign: 'center' }}><CircularProgress /></Box>
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
                                    const domain = getDomain(item.original_url);
                                    const displayDate = item.published_date || item.scraped_at;
                                    return (
                                        <React.Fragment key={item.id}>
                                            <ListItem button onClick={() => handleOpenArticle(item)} alignItems="flex-start">
                                                <ListItemAvatar>
                                                    {item.thumbnail_url ? (
                                                        <Avatar variant="rounded" src={item.thumbnail_url} sx={{ width: 56, height: 56, mr: 1.5 }} />
                                                    ) : (
                                                        <Avatar variant="rounded" sx={{ width: 56, height: 56, mr: 1.5, bgcolor: 'background.default' }}>
                                                            <NewspaperIcon color="action" />
                                                        </Avatar>
                                                    )}
                                                </ListItemAvatar>
                                                <ListItemText
                                                    primary={<Typography variant="body2" sx={{ fontWeight: item.is_read ? 'normal' : 'bold' }}>{item.title}</Typography>}
                                                    secondaryTypographyProps={{ component: 'div' }}
                                                    secondary={
                                                        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
                                                            <Typography variant="caption" color="text.secondary">
                                                                {new Date(displayDate).toLocaleDateString('de-AT')}
                                                            </Typography>
                                                            {domain && (
                                                                <MuiLink href={item.original_url!} target="_blank" rel="noopener noreferrer" variant="caption" color="text.secondary" onClick={(e) => e.stopPropagation()} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                                                    ({domain})
                                                                    {item.is_trusted_source && (<Tooltip title="Geprüfte Quelle"><VerifiedUserIcon sx={{ fontSize: 14, color: 'success.main', ml: 0.5 }} /></Tooltip>)}
                                                                </MuiLink>
                                                            )}
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
                        ) : (<Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>Keine Inhalte für Ihre Auswahl gefunden.</Typography>)}

                        {page < totalPages && (
                            <Box sx={{ textAlign: 'center', py: 1 }}>
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
                </Box>
            )}

            <Dialog open={!!selectedArticle} onClose={handleCloseDialog} fullWidth maxWidth="md" PaperProps={{ sx: { height: '90vh' } }}>
                <DialogTitle sx={{ m: 0, p: 2 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>{selectedArticle?.title}</Typography>
                        <IconButton aria-label="close" onClick={handleCloseDialog} sx={{ ml: 2 }}><CloseIcon /></IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent dividers sx={{ p: 2 }}>
                    {selectedArticle?.thumbnail_url && (
                        <Box
                            component="img"
                            src={selectedArticle.thumbnail_url}
                            alt={selectedArticle.title}
                            sx={{
                                width: '100%',
                                maxHeight: '300px',
                                objectFit: 'cover',
                                borderRadius: 1,
                                mb: 2,
                            }}
                        />
                    )}
                     <Box sx={{ mb: 2, borderBottom: 1, borderColor: 'divider', pb: 2 }}>
                        {selectedArticle?.published_date && (
                            <Typography variant="caption" color="text.secondary" display="block">
                                Veröffentlicht am: {new Date(selectedArticle.published_date).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            </Typography>
                        )}
                        {selectedArticle?.tags && selectedArticle.tags.length > 0 && (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                                {selectedArticle.tags.map(tag => <Chip key={tag} label={tag} size="small" />)}
                            </Box>
                        )}
                    </Box>

                    <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: 2 }}>
                        <ArticleBodyRenderer summary={selectedArticle?.summary} />
                        {selectedArticle?.original_url && (
                            <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                                <MuiLink
                                    href={selectedArticle.original_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    sx={{ display: 'inline-flex', alignItems: 'center', fontWeight: 'bold' }}
                                >
                                    {getDomain(selectedArticle.original_url)}
                                </MuiLink>
                            </Box>
                        )}
                    </Box>
                    <Paper 
                        elevation={3} 
                        sx={{ 
                            position: 'sticky', bottom: 0, mt: 2, p: 1, alignSelf: 'center', 
                            borderRadius: '50px', backdropFilter: 'blur(8px)', 
                            backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.8) 
                        }}
                    >
                        <Stack direction="row" spacing={1} alignItems="center">
                            {selectedArticle && <VoteComponent item={selectedArticle} onVote={(vote) => handleVote(selectedArticle.id, vote)} size="medium" />}
                            <Divider orientation="vertical" flexItem />
                            <Tooltip title="Per E-Mail senden"><IconButton onClick={handleOpenShareDialog}><ShareIcon /></IconButton></Tooltip>
                            <Tooltip title="Als Vorlage für Newsletter generieren"><IconButton onClick={handleGenerateTemplate}><DynamicFeedIcon /></IconButton></Tooltip>
                        </Stack>
                    </Paper>
                </DialogContent>
            </Dialog>

            <Dialog open={templateState.open} onClose={handleCloseTemplateDialog} fullWidth maxWidth="md">
                <DialogTitle>Newsletter-Vorlage</DialogTitle>
                <DialogContent>
                    {templateState.loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 5 }}><CircularProgress /></Box>}
                    {templateState.error && <Alert severity="error">{templateState.error}</Alert>}
                    {!templateState.loading && !templateState.error && (
                        <Stack spacing={2} sx={{ mt: 1 }}>
                            <TextField label="Generierter Text für Ihren Newsletter" fullWidth multiline rows={12} value={templateState.content} InputProps={{ readOnly: true }} />
                            <Button onClick={() => handleCopyToClipboard(templateState.content)} startIcon={<ContentCopyIcon />}>Text kopieren</Button>
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions><Button onClick={handleCloseTemplateDialog}>Schließen</Button></DialogActions>
            </Dialog>
            
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

export default GenericScrapeWidget;