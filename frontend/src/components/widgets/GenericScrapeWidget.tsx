import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
    Box, Typography, CircularProgress, Modal, Fade, MenuItem, Alert, Stack, IconButton, Tooltip, Link as MuiLink,
    Dialog, DialogTitle, DialogContent, Button, DialogActions, Select, FormControl, SelectChangeEvent, Avatar, Chip,
    TextField, InputAdornment, Paper, useTheme, useMediaQuery, Card, CardMedia, CardContent, CardActionArea, Divider
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ThumbDownOffAltIcon from '@mui/icons-material/ThumbDownOffAlt';
import ShareIcon from '@mui/icons-material/Share';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckIcon from '@mui/icons-material/Check';
import FilterListIcon from '@mui/icons-material/FilterList';
import SortIcon from '@mui/icons-material/Sort';

import { useNavigate } from 'react-router-dom';
import posthog from 'posthog-js';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';

// --- Interfaces ---

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
    logo_url?: string | null; // NEU: Logo Unterstützung
    tags?: string[] | null;
}

interface Tag { name: string; count: number; }
interface HighlightedTextProps { text: string; keywords: string[]; }
interface RelevantAction { id: string; title: string; content_text: string; link_url: string; image_url: string; is_click_tracking_enabled: boolean; business_partner_id: string; }
interface GenericScrapeWidgetProps extends BaseWidgetProps { icon?: React.ReactNode; title: string; category: string; description?: string; filterLabel?: string | null; widgetTypeKey: string; }
interface ShareState { open: boolean; loading: boolean; error: string | null; success: string | null; recipientEmail: string; }
interface AiDraftState { open: boolean; loading: boolean; error: string | null; content: string; }

// --- Helper Components ---

// NEU: Hilfsfunktion für Logo-URLs
const getImageUrl = (url?: string | null) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5001').replace(/\/$/, '');
    let cleanPath = url.startsWith('/') ? url : `/${url}`;
    cleanPath = cleanPath.replace(/^\/public\//, '/');
    return `${baseUrl}${cleanPath}`;
};

const Flag: React.FC<{ code?: string; alt?: string; size?: number }> = ({ code, alt, size = 20 }) => {
  if (!code || code.toUpperCase() === 'ALL' || code.toUpperCase() === 'EU') { 
      return ( <svg width={size} height={(size * 2) / 3} viewBox="0 0 12 8" xmlns="http://www.w3.org/2000/svg" aria-label={alt || 'EU'}><rect width="12" height="8" fill="#003399" />{Array.from({ length: 12 }).map((_, i) => { const angle = (i * 30 * Math.PI) / 180; const cx = 6 + Math.cos(angle) * 2.2; const cy = 4 + Math.sin(angle) * 2.2; return (<g key={i} transform={`translate(${cx},${cy})`}><polygon points="0,-0.6 0.17,-0.1 0.6,-0.1 0.26,0.16 0.39,0.6 0,0.35 -0.39,0.6 -0.26,0.16 -0.6,-0.1 -0.17,-0.1" fill="#FFCC00" /></g>);})}</svg> );
  }
  return <img loading="lazy" width={size} src={`https://flagcdn.com/w20/${code.toLowerCase()}.png`} alt={alt || code} />;
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
            result.push(<mark key={index} style={{ backgroundColor: '#fef08a', color: '#0f172a', padding: '0 2px', borderRadius: '2px' }}>{keyword}</mark>);
            lastIndex = startIndex + keyword.length;
        });
        if (lastIndex < text.length) result.push(text.substring(lastIndex));
        return result;
    }, [text, keywords]);
    return <span>{parts}</span>;
};

const VoteComponent: React.FC<{ item: ScrapedContentItem; onVote: (vote: 1 | -1) => void; size?: 'small' | 'medium' }> = ({ item, onVote, size = 'small' }) => {
    const getScoreColor = (score: number) => score > 0 ? 'success.main' : score < 0 ? 'error.main' : 'text.secondary';
    const handleVote = (e: React.MouseEvent, vote: 1 | -1) => { e.stopPropagation(); onVote(vote); };
    return (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, bgcolor: 'background.paper', borderRadius: 5, px: 0.5, border: '1px solid', borderColor: 'divider' }}>
            <IconButton size={size} onClick={(e) => handleVote(e, 1)} sx={{ p: 0.5 }}>
                {item.user_vote === 1 ? <ThumbUpIcon color="success" fontSize={size} /> : <ThumbUpOffAltIcon color="action" fontSize={size} />}
            </IconButton>
            <Typography variant="caption" sx={{ fontWeight: 600, color: getScoreColor(item.relevance_score), minWidth: 16, textAlign: 'center' }}>
                {item.relevance_score}
            </Typography>
            <IconButton size={size} onClick={(e) => handleVote(e, -1)} sx={{ p: 0.5 }}>
                {item.user_vote === -1 ? <ThumbDownIcon color="error" fontSize={size} /> : <ThumbDownOffAltIcon color="action" fontSize={size} />}
            </IconButton>
        </Box>
    );
};

const getDomain = (url: string | null | undefined): string | null => {
    if (!url) return null;
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return null; }
};

const NewsItemRow = React.memo(({ item, index, itemsLength, activeGlobalTags, onOpen, onVote, onNavigateSource }: any) => {
    const domain = getDomain(item.original_url);
    const displayDate = item.published_date || item.scraped_at;

    if (index === 0 && item.thumbnail_url) {
        return (
            <Card elevation={0} square sx={{ borderBottom: 1, borderColor: 'divider', mb: 1 }}>
                <CardActionArea onClick={() => onOpen(item)}>
                    <CardMedia component="img" image={item.thumbnail_url} alt={item.title} sx={{ width: '100%', height: 'auto', maxHeight: '200px', objectFit: 'cover' }} />
                    <CardContent sx={{ pb: 1 }}>
                        <Typography gutterBottom variant="subtitle1" component="div" sx={{ fontWeight: item.is_read ? 500 : 700, lineHeight: 1.3 }}>
                            <HighlightedText text={item.title} keywords={activeGlobalTags} />
                        </Typography>
                    </CardContent>
                </CardActionArea>
                <Box sx={{ px: 2, pb: 2, pt: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={500}>{new Date(displayDate).toLocaleDateString('de-AT')}</Typography>
                        {domain && (
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                {/* NEU: Logo in der Zeile */}
                                {item.logo_url && (
                                    <Box component="img" src={getImageUrl(item.logo_url)} sx={{ height: 14, width: 'auto', objectFit: 'contain', mr: 0.5 }} />
                                )}
                                <MuiLink href={item.original_url!} target="_blank" rel="noopener noreferrer" variant="caption" color="text.secondary" underline="hover">{domain}</MuiLink>
                                {item.is_trusted_source && (
                                    <Tooltip title="Geprüfte Quelle">
                                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); onNavigateSource(); }} sx={{ p: 0, ml: 0.25 }}><VerifiedUserIcon sx={{ fontSize: 14, color: 'success.main' }} /></IconButton>
                                    </Tooltip>
                                )}
                            </Box>
                        )}
                    </Box>
                    <VoteComponent item={item} onVote={(vote) => onVote(item.id, vote)} />
                </Box>
            </Card>
        );
    }

    return (
        <Box 
            onClick={() => onOpen(item)}
            sx={{ 
                display: 'flex', gap: 2, px: { xs: 2, sm: 3 }, py: 2, cursor: 'pointer',
                borderBottom: index === itemsLength - 1 ? 'none' : '1px solid', borderColor: 'divider',
                transition: 'background-color 0.2s ease', position: 'relative',
                '&:hover': { bgcolor: 'action.hover' }
            }}
        >
            {!item.is_read && (
                <Box sx={{ position: 'absolute', left: { xs: 6, sm: 12 }, top: 24, width: 6, height: 6, borderRadius: '50%', bgcolor: 'primary.main' }} />
            )}
            {item.thumbnail_url && (
                <Box component="img" src={item.thumbnail_url} sx={{ width: 60, height: 60, borderRadius: 1, objectFit: 'cover', flexShrink: 0, display: { xs: 'none', sm: 'block' } }} />
            )}
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: item.is_read ? 500 : 700, lineHeight: 1.3, mb: 0.5 }}>
                    <HighlightedText text={item.title} keywords={activeGlobalTags} />
                </Typography>
                {item.summary && (
                    <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4, mb: 1 }}>
                        {item.summary}
                    </Typography>
                )}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 'auto' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={500}>{new Date(displayDate).toLocaleDateString('de-AT')}</Typography>
                        {domain && (
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                {/* NEU: Logo in der Zeile */}
                                {item.logo_url && (
                                    <Box component="img" src={getImageUrl(item.logo_url)} sx={{ height: 14, width: 'auto', objectFit: 'contain', mr: 0.5 }} />
                                )}
                                <MuiLink href={item.original_url!} target="_blank" rel="noopener noreferrer" variant="caption" color="text.secondary" underline="hover" onClick={(e) => e.stopPropagation()}>{domain}</MuiLink>
                                {item.is_trusted_source && (
                                    <Tooltip title="Geprüfte Quelle">
                                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); onNavigateSource(); }} sx={{ p: 0, ml: 0.25 }}><VerifiedUserIcon sx={{ fontSize: 12, color: 'success.main' }} /></IconButton>
                                    </Tooltip>
                                )}
                            </Box>
                        )}
                    </Box>
                    <Box onClick={(e) => e.stopPropagation()}>
                        <VoteComponent item={item} onVote={(vote) => onVote(item.id, vote)} />
                    </Box>
                </Box>
            </Box>
        </Box>
    );
});

const GenericScrapeWidget: React.FC<GenericScrapeWidgetProps> = ({ onDelete, widgetId, isRemovable, icon, title, category, description, filterLabel, widgetTypeKey }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    
    const [items, setItems] = useState<ScrapedContentItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedArticle, setSelectedArticle] = useState<ScrapedContentItem | null>(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [sortBy, setSortBy] = useState('date');
    
    const [selectedRegionId, setSelectedRegionId] = useState<string>('all');
    
    const [counts, setCounts] = useState({ unread: 0, new: 0 });
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [availableTags, setAvailableTags] = useState<Tag[]>([]);
    const [selectedTag, setSelectedTag] = useState('all');
    const [filterMode, setFilterMode] = useState<'all' | 'new' | 'unread'>('all');
    const [relevantAction, setRelevantAction] = useState<RelevantAction | null>(null);
    const [isImageModalOpen, setImageModalOpen] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [activeGlobalTags, setActiveGlobalTags] = useState<string[]>([]);
    const [shareState, setShareState] = useState<ShareState>({ open: false, loading: false, error: null, success: null, recipientEmail: '' });
    const [aiDraftState, setAiDraftState] = useState<AiDraftState>({ open: false, loading: false, error: null, content: '' });

    const hasLoadedAction = useRef(false);

    useEffect(() => { const handler = setTimeout(() => { setDebouncedSearchTerm(searchTerm); }, 500); return () => { clearTimeout(handler); }; }, [searchTerm]);
    
    useEffect(() => { 
        if (user?.regions && user.regions.length > 0) { 
            const defaultReg = user.regions.find(r => !!r.is_default);
            if (defaultReg) setSelectedRegionId(defaultReg.id);
        } 
    }, [user?.regions]);

    useEffect(() => {
        if (!category) return;
        const token = localStorage.getItem('jwt_token');
        apiClient.get(`/api/data/tags?category=${category}`, { headers: { 'x-auth-token': token } })
            .then(tagsRes => setAvailableTags(tagsRes.data || []))
            .catch(e => console.error("Could not load tags", e));
    }, [category]);

    const fetchData = useCallback(async (currentPage: number, currentSortBy: string, regionId: string, search: string, subFilter: string, currentFilterMode: string, loadMore = false) => {
        if (!category) { setIsLoading(false); setError("Keine Kategorie konfiguriert."); setItems([]); return; }
        if (loadMore) setIsLoadingMore(true); else setIsLoading(true);
        setError(null);

        const token = localStorage.getItem('jwt_token');
        const regionObj = user?.regions?.find(r => r.id === regionId);
        
        const itemParams = new URLSearchParams({ 
            page: String(currentPage), 
            limit: '10', 
            sortBy: currentSortBy, 
            category, 
            filter: currentFilterMode 
        });
        
        if (regionId !== 'all' && regionObj) {
            itemParams.append('region', regionObj.name);
        } else {
            itemParams.append('region', 'all');
        }

        if (subFilter && subFilter !== 'all') itemParams.append('tag', subFilter);
        if (search) itemParams.append('search', search);

        try {
            const contentRes = await apiClient.get(`/api/data/scraped-content?${itemParams.toString()}`, { headers: { 'x-auth-token': token } });
            const newItems = contentRes.data?.data || [];
            setItems(prev => loadMore ? [...prev, ...newItems] : newItems);
            setActiveGlobalTags(contentRes.data?.activeFilters?.tags || []);
            setTotalPages(contentRes.data?.totalPages || 0);
            setCounts(contentRes.data?.counts || { unread: 0, new: 0 });

            if (currentPage === 1 && !hasLoadedAction.current) {
                hasLoadedAction.current = true;
                const regParam = regionId === 'all' ? 'all' : (regionObj?.name || 'all');
                apiClient.get(`/api/data/relevant-action?category=${category}&region=${regParam}`, { headers: { 'x-auth-token': token } })
                .then(actionRes => setRelevantAction(actionRes.data)).catch(() => {});
            }
        } catch (err: any) { setError(err.response?.data?.message || `Fehler beim Laden.`); } 
        finally { setIsLoading(false); setIsLoadingMore(false); }
    }, [category, user?.regions]);

    useEffect(() => { 
        setPage(1);
        fetchData(1, sortBy, selectedRegionId, debouncedSearchTerm, selectedTag, filterMode);
        hasLoadedAction.current = false; 
    }, [sortBy, selectedRegionId, debouncedSearchTerm, selectedTag, filterMode, fetchData]);

    // --- Handlers ---
    const handleLoadMore = () => { const nextPage = page + 1; setPage(nextPage); fetchData(nextPage, sortBy, selectedRegionId, debouncedSearchTerm, selectedTag, filterMode, true); };
    const handleOpenArticle = useCallback(async (article: ScrapedContentItem) => {
        setSelectedArticle(article);
        if (!article.is_read) {
            try {
                const token = localStorage.getItem('jwt_token');
                await apiClient.post(`/api/data/scraped-content/${article.id}/mark-as-read`, {}, { headers: { 'x-auth-token': token } });
                setItems(prev => prev.map(n => n.id === article.id ? { ...n, is_read: true } : n));
                setCounts(prev => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
            } catch (err) {}
        }
    }, []);

    const handleVote = useCallback(async (contentId: string, vote: 1 | -1) => {
        const token = localStorage.getItem('jwt_token');
        setItems(prev => prev.map(item => item.id === contentId ? { ...item, user_vote: item.user_vote === vote ? 0 : vote } : item));
        try {
            const res = await apiClient.post(`/api/data/content/${contentId}/vote`, { vote: vote, contentType: 'scraped_content' }, { headers: { 'x-auth-token': token } });
            setItems(prev => prev.map(item => item.id === contentId ? { ...item, relevance_score: res.data.relevance_score } : item));
        } catch (err) {}
    }, []);

    const handleNavigateSource = useCallback(() => navigate('/trusted-sources'), [navigate]);
    const handleActionClick = () => { if (relevantAction?.is_click_tracking_enabled) posthog.capture('partner_action_clicked', { action_id: relevantAction.id }); if (relevantAction?.link_url) window.open(relevantAction.link_url, '_blank', 'noopener,noreferrer'); };
    const handleReportError = () => navigate('/feedback', { state: { type: 'bug', widget: title, error: error, widgetKey: widgetTypeKey } });
    const handleOpenShareDialog = () => setShareState({ open: true, loading: false, error: null, success: null, recipientEmail: '' });
    const handleCloseShareDialog = () => setShareState({ ...shareState, open: false });
    const handleSendEmail = async () => {
        if (!selectedArticle || !shareState.recipientEmail) return;
        setShareState(prev => ({ ...prev, loading: true }));
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.post('/api/data/share-content-by-email', { title: selectedArticle.title, summary: selectedArticle.summary, source: selectedArticle.original_url, recipientEmail: shareState.recipientEmail }, { headers: { 'x-auth-token': token } });
            setShareState(prev => ({ ...prev, loading: false, success: response.data.message }));
        } catch (err: any) { setShareState(prev => ({ ...prev, loading: false, error: err.response?.data?.message })); }
    };
    const handleSimpleCopy = () => { if (!selectedArticle) return; navigator.clipboard.writeText(`${selectedArticle.title}\n\n${selectedArticle.summary}`); setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000); };
    const handleGenerateAiDraft = async () => {
        if (!selectedArticle) return;
        setAiDraftState({ ...aiDraftState, open: true, loading: true, error: null, content: '' });
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.post('/api/data/generate-draft-from-content', { contentId: selectedArticle.id }, { headers: { 'x-auth-token': token } });
            setAiDraftState({ open: true, loading: false, error: null, content: response.data.draft });
        } catch (err: any) { setAiDraftState({ open: true, loading: false, error: err.response?.data?.message || 'Fehler.', content: '' }); }
    };
    const handleCloseAiDraftDialog = () => setAiDraftState({ ...aiDraftState, open: false });
    const handleCloseDialog = () => setSelectedArticle(null);

    const widgetTitleComponent = (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
            <Tooltip title={description || title}><span>{icon}</span></Tooltip>
            <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>{title}</Typography>
            
            <FormControl size="small" onMouseDown={(e) => e.stopPropagation()}>
                <Select
                    value={selectedRegionId}
                    variant="standard"
                    disableUnderline
                    onChange={(e: SelectChangeEvent) => setSelectedRegionId(e.target.value)}
                    sx={{ color: 'text.secondary', fontSize: '0.85rem', fontWeight: 500, '& .MuiSelect-select': { py: 0.5, pl: 1, pr: '24px !important', display: 'flex', alignItems: 'center', gap: 1 } }}
                    renderValue={(value) => {
                        if (value === 'all') return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Flag code="EU" size={14} /><Typography variant="body2">Alle</Typography></Box>;
                        const region = user?.regions?.find(r => r.id === value);
                        return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Flag code={region?.code} size={14} /><Typography variant="body2">{region?.code}</Typography></Box>;
                    }}
                >
                    <MenuItem value="all">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}><Flag code="EU" size={16} /> Alle Regionen</Box>
                    </MenuItem>
                    {user?.regions?.map((region) => (
                        <MenuItem key={region.id} value={region.id}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}><Flag code={region.code} size={16} />{region.name}</Box>
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
        </Box>
    );

    return (
        <WidgetPaper title={widgetTitleComponent} widgetTitle={title} widgetTypeKey={widgetTypeKey} widgetId={widgetId || ''} onDelete={onDelete} isRemovable={isRemovable} noPadding>
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                
                {/* TOOLBAR */}
                <Box sx={{ px: { xs: 2, sm: 3 }, py: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                         <Chip 
                            label="Neu" size="small" 
                            variant={filterMode === 'new' ? 'filled' : 'outlined'} 
                            color={filterMode === 'new' ? 'primary' : 'default'} clickable 
                            onClick={() => setFilterMode(prev => prev === 'new' ? 'all' : 'new')} 
                            avatar={<Avatar sx={{ width: 18, height: 18, fontSize: '0.7rem', bgcolor: filterMode === 'new' ? 'primary.dark' : 'grey.300', color: filterMode === 'new' ? 'white' : 'text.primary' }}>{counts.new}</Avatar>} 
                            sx={{ fontWeight: 500, border: filterMode === 'new' ? 'none' : '1px solid #e2e8f0' }}
                        />
                        <Chip 
                            label="Ungelesen" size="small" 
                            variant={filterMode === 'unread' ? 'filled' : 'outlined'} 
                            color={filterMode === 'unread' ? 'secondary' : 'default'} clickable 
                            onClick={() => setFilterMode(prev => prev === 'unread' ? 'all' : 'unread')} 
                            avatar={<Avatar sx={{ width: 18, height: 18, fontSize: '0.7rem', bgcolor: filterMode === 'unread' ? 'secondary.dark' : 'grey.300', color: filterMode === 'unread' ? 'white' : 'text.primary' }}>{counts.unread}</Avatar>} 
                            sx={{ fontWeight: 500, border: filterMode === 'unread' ? 'none' : '1px solid #e2e8f0' }}
                        />
                        <Box sx={{ flexGrow: 1 }} />
                        <TextField 
                            variant="standard" placeholder="Suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                            InputProps={{ 
                                disableUnderline: true,
                                startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} /></InputAdornment>),
                                sx: { fontSize: '0.875rem', bgcolor: 'action.hover', px: 1.5, py: 0.5, borderRadius: 5 } 
                            }}
                            sx={{ width: isMobile ? '100%' : 180 }}
                        />
                    </Box>
                    
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        {filterLabel && availableTags.length > 0 && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <FilterListIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                                <FormControl size="small">
                                    <Select value={selectedTag} onChange={(e: SelectChangeEvent) => setSelectedTag(e.target.value)} variant="standard" disableUnderline sx={{ fontSize: '0.8rem', color: 'text.secondary', fontWeight: 500 }}>
                                        <MenuItem value="all" sx={{ fontSize: '0.85rem' }}>{filterLabel}: Alle</MenuItem>
                                        {availableTags.map((tag) => <MenuItem key={tag.name} value={tag.name} sx={{ fontSize: '0.85rem' }}>{tag.name} ({tag.count})</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Box>
                        )}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <SortIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                            <FormControl size="small">
                                <Select value={sortBy} onChange={(e: SelectChangeEvent) => setSortBy(e.target.value)} variant="standard" disableUnderline sx={{ fontSize: '0.8rem', color: 'text.secondary', fontWeight: 500 }}>
                                    <MenuItem value="date" sx={{ fontSize: '0.85rem' }}>Neueste zuerst</MenuItem>
                                    <MenuItem value="relevance" sx={{ fontSize: '0.85rem' }}>Relevanz</MenuItem>
                                </Select>
                            </FormControl>
                        </Box>
                    </Box>
                </Box>

                {/* Main Content List */}
                <Box sx={{ flexGrow: 1, overflowY: isMobile ? 'visible' : 'auto' }}>
                    {isLoading && page === 1 ? (
                        <Box sx={{ m: 'auto', textAlign: 'center', p: 4 }}><CircularProgress size={30} /></Box>
                    ) : error ? (
                        <Alert severity="error" action={<Button color="inherit" size="small" onClick={handleReportError} startIcon={<ReportProblemOutlinedIcon />}>Fehler Melden</Button>} sx={{ m: 2, border: 'none' }}>{error}</Alert>
                    ) : (
                        <>
                            {items.length > 0 ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                    {items.map((item, index) => (
                                        <NewsItemRow key={item.id} item={item} index={index} itemsLength={items.length} activeGlobalTags={activeGlobalTags} onOpen={handleOpenArticle} onVote={handleVote} onNavigateSource={handleNavigateSource} />
                                    ))}
                                </Box>
                            ) : (<Typography variant="body2" color="text.secondary" sx={{ p: 4, textAlign: 'center' }}>Keine Inhalte für Ihre Auswahl gefunden.</Typography>)}

                            {page < totalPages && (
                                <Box sx={{ textAlign: 'center', py: 3 }}>
                                    <Button onClick={handleLoadMore} disabled={isLoadingMore} sx={{ borderRadius: 5, px: 3, textTransform: 'none', color: 'text.secondary', bgcolor: 'action.hover' }}>
                                        {isLoadingMore ? <CircularProgress size={20} /> : 'Mehr laden'}
                                    </Button>
                                </Box>
                            )}
                            
                             {relevantAction && !isLoading && items.length > 0 &&(
                                <Paper variant="outlined" sx={{ mt: 2, p: 2, mx: { xs: 2, sm: 3 }, mb: 2, borderRadius: 2, borderColor: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.03) }}>
                                    <Stack direction="row" spacing={2} alignItems="center">
                                        {relevantAction.image_url && <Avatar src={relevantAction.image_url} sx={{ width: 48, height: 48 }} variant="rounded" />}
                                        <Box flexGrow={1}>
                                            <Typography variant="caption" color="primary.main" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>Lösungspartner</Typography>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 0.5 }}>{relevantAction.title}</Typography>
                                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', mt: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{relevantAction.content_text}</Typography>
                                        </Box>
                                        <Button variant="contained" size="small" onClick={handleActionClick} sx={{ borderRadius: 5, textTransform: 'none', px: 2 }}>Mehr erfahren</Button>
                                    </Stack>
                                </Paper>
                            )}
                        </>
                    )}
                </Box>
            </Box>

            {/* Article Detail Dialog */}
            <Dialog open={!!selectedArticle} onClose={handleCloseDialog} fullWidth maxWidth="md" PaperProps={{ sx: { height: { xs: '100%', sm: '90vh' }, maxHeight: '100%', m: { xs: 0, sm: 2 }, borderRadius: { xs: 0, sm: 3 } } }}>
                <DialogTitle sx={{ m: 0, p: { xs: 2, sm: 3 }, pb: 2 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                        <Box sx={{ flexGrow: 1, pr: 2 }}>
                            {/* NEU: Header-Info im Detail-Dialog mit Logo */}
                            {selectedArticle?.is_trusted_source && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, bgcolor: alpha(theme.palette.success.main, 0.08), p: '4px 12px', borderRadius: 10, width: 'fit-content', border: '1px solid', borderColor: alpha(theme.palette.success.main, 0.2) }}>
                                    {selectedArticle.logo_url ? (
                                        <Box component="img" src={getImageUrl(selectedArticle.logo_url)} sx={{ height: 18, width: 'auto', objectFit: 'contain' }} />
                                    ) : (
                                        <VerifiedUserIcon sx={{ fontSize: 16, color: 'success.main' }} />
                                    )}
                                    <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 700, textTransform: 'uppercase' }}>Geprüfte Quelle: {getDomain(selectedArticle.original_url)}</Typography>
                                </Box>
                            )}
                            <Typography variant="h5" component="div" sx={{ fontWeight: 800, lineHeight: 1.3 }}>
                                <HighlightedText text={selectedArticle?.title || ''} keywords={activeGlobalTags} />
                            </Typography>
                        </Box>
                        <IconButton aria-label="close" onClick={handleCloseDialog} sx={{ bgcolor: 'action.hover' }}><CloseIcon /></IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent dividers sx={{ p: { xs: 2, sm: 3 }, position: 'relative' }}>
                    {selectedArticle?.thumbnail_url && (
                        <Box sx={{ position: 'relative', mb: 3 }}>
                            <Box component="img" src={selectedArticle.thumbnail_url} alt={selectedArticle.title} sx={{ width: '100%', maxHeight: '350px', objectFit: 'cover', borderRadius: 2 }} />
                            <IconButton onClick={() => setImageModalOpen(true)} sx={{ position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(0, 0, 0, 0.6)', color: 'white', backdropFilter: 'blur(4px)', '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.8)' } }}><FullscreenIcon /></IconButton>
                        </Box>
                    )}
                    <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        {selectedArticle?.published_date && (
                            <Typography variant="caption" color="text.secondary" fontWeight={500}>{new Date(selectedArticle.published_date).toLocaleDateString('de-AT', { day: '2-digit', month: 'short', year: 'numeric' })}</Typography>
                        )}
                         {selectedArticle?.tags && selectedArticle.tags.length > 0 && (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{selectedArticle.tags.map(tag => <Chip key={tag} label={tag} size="small" sx={{ height: 20, fontSize: '0.7rem', bgcolor: 'action.hover' }} />)}</Box>
                        )}
                    </Box>
                     <Box sx={{ flexGrow: 1, pb: 10 }}>
                        <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, color: 'text.primary', fontSize: '1.05rem' }}>
                            <HighlightedText text={selectedArticle?.summary || ''} keywords={activeGlobalTags} />
                        </Typography>
                        {selectedArticle?.original_url && (
                            <Box sx={{ mt: 4, p: 2, bgcolor: 'action.hover', borderRadius: 2, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between' }}>
                                <Typography variant="body2" color="text.secondary">
                                    <strong style={{ color: theme.palette.text.primary }}>Quelle:</strong> {getDomain(selectedArticle.original_url) || selectedArticle.original_url}
                                </Typography>
                                <Button href={selectedArticle.original_url} target="_blank" rel="noopener noreferrer" variant="outlined" size="small" sx={{ borderRadius: 5, textTransform: 'none', bgcolor: 'background.paper' }}>
                                    Original Artikel öffnen
                                </Button>
                            </Box>
                        )}
                    </Box>
                </DialogContent>
                <Box sx={{ position: 'absolute', bottom: { xs: 16, sm: 24 }, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
                    <Paper elevation={4} sx={{ p: 1, borderRadius: 8, backdropFilter: 'blur(12px)', backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.85), border: '1px solid', borderColor: 'divider' }}>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                            {selectedArticle && <VoteComponent item={selectedArticle} onVote={(vote) => handleVote(selectedArticle.id, vote)} size="medium" />}
                            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                            <Tooltip title="Teilen"><IconButton onClick={handleOpenShareDialog} sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}><ShareIcon /></IconButton></Tooltip>
                            <Tooltip title={copySuccess ? "Kopiert!" : "Kopieren"}><IconButton onClick={handleSimpleCopy} sx={{ color: copySuccess ? 'success.main' : 'text.secondary', '&:hover': { color: 'primary.main' } }}>{copySuccess ? <CheckIcon /> : <ContentCopyIcon />}</IconButton></Tooltip>
                            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                            <Tooltip title="KI-Entwurf erstellen"><IconButton onClick={handleGenerateAiDraft} sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}><AutoAwesomeIcon /></IconButton></Tooltip>
                        </Stack>
                    </Paper>
                </Box>
            </Dialog>
            <Modal open={isImageModalOpen} onClose={() => setImageModalOpen(false)} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fade in={isImageModalOpen}><Box onClick={() => setImageModalOpen(false)} sx={{ outline: 'none', cursor: 'pointer' }}><img src={selectedArticle?.thumbnail_url || ''} alt={selectedArticle?.title} style={{ maxHeight: '90vh', maxWidth: '90vw', objectFit: 'contain' }} /></Box></Fade></Modal>
            <Dialog open={aiDraftState.open} onClose={handleCloseAiDraftDialog} fullWidth maxWidth="md">
                <DialogTitle>KI-generierter Newsletter-Entwurf</DialogTitle>
                <DialogContent>
                    {aiDraftState.loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 5 }}><CircularProgress /></Box>}
                    {!aiDraftState.loading && !aiDraftState.error && (<Paper variant="outlined" sx={{ p: 3, mt: 2, maxHeight: '60vh', overflowY: 'auto', bgcolor: '#f8fafc' }}><Typography sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.9rem' }}>{aiDraftState.content}</Typography></Paper>)}
                </DialogContent>
                <DialogActions><Button onClick={handleCloseAiDraftDialog} sx={{ textTransform: 'none' }}>Schließen</Button><Button onClick={() => navigator.clipboard.writeText(aiDraftState.content)} startIcon={<ContentCopyIcon />} variant="contained" sx={{ borderRadius: 5, textTransform: 'none' }}>Text kopieren</Button></DialogActions>
            </Dialog>
            <Dialog open={shareState.open} onClose={handleCloseShareDialog} fullWidth maxWidth="sm"><DialogTitle>Inhalt per E-Mail senden</DialogTitle><DialogContent><Stack spacing={2} sx={{ mt: 1 }}><Typography variant="body2" color="text.secondary">Der Artikel wird geteilt.</Typography><TextField autoFocus margin="dense" id="recipient-email" label="E-Mail-Adresse" type="email" fullWidth variant="outlined" size="small" value={shareState.recipientEmail} onChange={(e) => setShareState(prev => ({ ...prev, recipientEmail: e.target.value, error: null, success: null }))} />{shareState.error && <Alert severity="error">{shareState.error}</Alert>}{shareState.success && <Alert severity="success">{shareState.success}</Alert>}</Stack></DialogContent><DialogActions><Button onClick={handleCloseShareDialog}>Abbrechen</Button><Button variant="contained" onClick={handleSendEmail} disabled={shareState.loading || !shareState.recipientEmail} sx={{ borderRadius: 5 }}>Senden</Button></DialogActions></Dialog>
        </WidgetPaper>
    );
};

export default GenericScrapeWidget;