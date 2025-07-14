import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Box, Typography, CircularProgress, MenuItem, Alert, List, ListItem, ListItemText, Divider,
    Dialog, DialogTitle, DialogContent, Button, Stack, IconButton, Tooltip, Link as MuiLink,
    DialogActions, Pagination, Select, FormControl, InputLabel, SelectChangeEvent, Badge, Chip,
    TextField, InputAdornment
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EmailIcon from '@mui/icons-material/Email';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LinkIcon from '@mui/icons-material/Link';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
// NEU: Imports für die Daumen-Icons
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ThumbDownOffAltIcon from '@mui/icons-material/ThumbDownOffAlt';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps, Region } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import ClickAwayListener from '@mui/material/ClickAwayListener';

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
}

interface GenericScrapeWidgetProps extends BaseWidgetProps {
    icon?: React.ReactNode;
    title: string;
    category: string;
}

interface EmailState {
    open: boolean;
    loading: boolean;
    error: string | null;
    subject: string;
    body: string;
}

// --- Hilfskomponenten ---
const ArticleBodyRenderer: React.FC<{ summary: string | null | undefined }> = ({ summary }) => {
    if (!summary) return <Typography>Kein Inhalt verfügbar.</Typography>;
    return (
        <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
            {summary}
        </Typography>
    );
};

// KORRIGIERT: Das VoteComponent wurde komplett überarbeitet
const VoteComponent: React.FC<{ item: ScrapedContentItem; onVote: (vote: 1 | -1) => void; size?: 'small' | 'medium' }> = ({ item, onVote, size = 'small' }) => {
    const getScoreColor = (score: number) => score > 0 ? 'success.main' : score < 0 ? 'error.main' : 'text.secondary';
    
    const handleVote = (e: React.MouseEvent, vote: 1 | -1) => {
        e.stopPropagation();
        onVote(vote);
    };

    return (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <Tooltip title="Hilfreich">
                <IconButton size={size} onClick={(e) => handleVote(e, 1)} sx={{ p: 0.5, '&:active': { transform: 'scale(0.9)' } }}>
                    {/* KORRIGIERT: "primary" wurde zu "success" geändert, um einen grünen Daumen anzuzeigen */}
                    {item.user_vote === 1 ? <ThumbUpIcon color="success" fontSize={size} /> : <ThumbUpOffAltIcon color="action" fontSize={size} />}
                </IconButton>
            </Tooltip>
            <Typography variant="caption" sx={{ fontWeight: 'bold', color: getScoreColor(item.relevance_score), minWidth: 20, textAlign: 'center' }}>
                {item.relevance_score}
            </Typography>
            <Tooltip title="Nicht hilfreich">
                <IconButton size={size} onClick={(e) => handleVote(e, -1)} sx={{ p: 0.5, '&:active': { transform: 'scale(0.9)' } }}>
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
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        bgcolor: isExpanded ? 'action.hover' : 'transparent',
                        borderRadius: 40,
                        width: isExpanded ? 180 : 32,
                        transition: 'width 0.3s cubic-bezier(.6,-0.28,.74,.05), background-color 0.3s cubic-bezier(.6,-0.28,.74,.05)',
                    }}
                >
                    <Tooltip title={isExpanded ? "Suche schließen" : "Suchen"}>
                        <IconButton onClick={handleToggle} size="small" sx={{ ml: '4px' }}>
                            {isExpanded ? <CloseIcon fontSize="small" /> : <SearchIcon />}
                        </IconButton>
                    </Tooltip>
                    <Box sx={{ width: '100%', overflow: 'hidden' }}>
                        <TextField
                            variant="standard"
                            fullWidth
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                onSearch(e.target.value);
                            }}
                            placeholder="Suchen..."
                            inputRef={inputRef}
                            sx={{
                                opacity: isExpanded ? 1 : 0,
                                transition: 'opacity 0.2s cubic-bezier(.6,-0.28,.74,.05)',
                                pl: 1,
                                pr: 1
                            }}
                            InputProps={{
                                disableUnderline: true,
                                endAdornment: (
                                    searchTerm && isExpanded ? (
                                        <InputAdornment position="end">
                                            <IconButton
                                                size="small"
                                                aria-label="Löschen"
                                                onClick={handleClear}
                                                edge="end"
                                            >
                                                <ClearIcon fontSize="small" />
                                            </IconButton>
                                        </InputAdornment>
                                    ) : null
                                )
                            }}
                        />
                    </Box>
                </Box>
            </Box>
        </ClickAwayListener>
    );
};

// --- Haupt-Widget-Komponente ---
const GenericScrapeWidget: React.FC<GenericScrapeWidgetProps> = ({ onDelete, widgetId, isRemovable, icon, title, category }) => {
    const { user } = useAuth();
    const [items, setItems] = useState<ScrapedContentItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedArticle, setSelectedArticle] = useState<ScrapedContentItem | null>(null);
    const [emailState, setEmailState] = useState<EmailState>({ open: false, loading: false, error: null, subject: '', body: '' });
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [sortBy, setSortBy] = useState('date');
    const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
    const [counts, setCounts] = useState({ unread: 0, new: 0 });
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedSearchTerm(searchTerm); }, 500);
        return () => { clearTimeout(handler); };
    }, [searchTerm]);

    useEffect(() => {
        if (user?.regions && user.regions.length > 0) {
            const defaultRegion = user.regions.find(r => !!r.is_default) || user.regions[0];
            setSelectedRegion(defaultRegion);
        }
    }, [user?.regions]);

    const fetchData = useCallback(async (currentPage: number, currentSortBy: string, region: Region | null, search: string) => {
        if (!category) {
            setIsLoading(false);
            setError("Keine Kategorie im Widget-Typ konfiguriert.");
            setItems([]);
            return;
        }
        
        setIsLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const params = new URLSearchParams({
                page: String(currentPage),
                limit: '10',
                sortBy: currentSortBy,
                region: region ? region.name : 'all',
            });
            params.append('category', category);
            if (search) {
                params.append('search', search);
            }

            const response = await apiClient.get(`/api/data/scraped-content?${params.toString()}`, {
                headers: { 'x-auth-token': token }
            });

            setItems(response.data?.data || []);
            setTotalPages(response.data?.totalPages || 0);
            setCounts(response.data?.counts || { unread: 0, new: 0 });
        } catch (err: any) {
            setError(err.response?.data?.message || `Gescrapte Inhalte konnten nicht geladen werden.`);
        } finally {
            setIsLoading(false);
        }
    }, [category]);

    useEffect(() => {
        setPage(1);
    }, [sortBy, selectedRegion, debouncedSearchTerm]);

    useEffect(() => {
        fetchData(page, sortBy, selectedRegion, debouncedSearchTerm);
    }, [fetchData, page, sortBy, selectedRegion, debouncedSearchTerm]);

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

    const handleCloseDialog = () => setSelectedArticle(null);
    const handleCloseEmailDialog = () => setEmailState({ ...emailState, open: false });
    const handleCopyToClipboard = (text: string) => navigator.clipboard.writeText(text);

    return (
        <WidgetPaper 
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', width: '100%' }}>
                    {icon}
                    <Typography variant="h6">{title}</Typography>
                    <Badge badgeContent={counts.new} color="primary"><Chip label="Neu" size="small" variant="outlined" /></Badge>
                    <Badge badgeContent={counts.unread} color="secondary"><Chip label="Ungelesen" size="small" variant="outlined" /></Badge>
                    <Box sx={{ flexGrow: 1 }} />
                    <AnimatedSearchBar onSearch={setSearchTerm} />
                    {user?.regions && user.regions.length > 1 && (
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
                    <FormControl size="small" variant="outlined" sx={{ minWidth: 120 }}>
                        <InputLabel id="sort-by-label">Sortieren</InputLabel>
                        <Select
                            labelId="sort-by-label"
                            value={sortBy}
                            onChange={(e: SelectChangeEvent) => setSortBy(e.target.value)}
                            label="Sortieren"
                        >
                            <MenuItem value="date">Neueste</MenuItem>
                            <MenuItem value="relevance">Relevanz</MenuItem>
                        </Select>
                    </FormControl>
                </Box>
            }
            widgetId={widgetId || ''} onDelete={onDelete} isRemovable={isRemovable} loading={isLoading} error={error}
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Box sx={{ flexGrow: 1, overflowY: 'auto', maxHeight: 320 }}>
                    {items.length > 0 ? (
                        <List dense>
                            {items.map((item, index) => {
                                const domain = getDomain(item.original_url);
                                return (
                                    <React.Fragment key={item.id}>
                                        <ListItem
                                            button
                                            onClick={() => handleOpenArticle(item)}
                                        >
                                            <ListItemText 
                                                primary={<Typography variant="body2" sx={{ fontWeight: item.is_read ? 'normal' : 'bold' }}>{item.title}</Typography>}
                                                secondary={
                                                    <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
                                                        <Typography variant="caption" color="text.secondary">
                                                            Gefunden am: {new Date(item.scraped_at).toLocaleDateString('de-AT')}
                                                        </Typography>
                                                        {domain && (
                                                            <MuiLink 
                                                                href={item.original_url!} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer" 
                                                                variant="caption" 
                                                                color="text.secondary"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                ({domain})
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
                    ) : ( <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>Keine Inhalte für Ihre Auswahl gefunden.</Typography> )}
                </Box>
                {totalPages > 1 && <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}><Pagination count={totalPages} page={page} onChange={(e, value) => setPage(value)} size="small" /></Box>}
            </Box>

            {/* Dialog für Artikelansicht */}
            <Dialog open={!!selectedArticle} onClose={handleCloseDialog} fullWidth maxWidth="md">
                <DialogTitle sx={{ m: 0, p: 2 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>{selectedArticle?.title}</Typography>
                        <IconButton aria-label="close" onClick={handleCloseDialog} sx={{ ml: 2 }}><CloseIcon /></IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent dividers>
                    {selectedArticle?.original_url && (
                        <MuiLink href={selectedArticle.original_url} target="_blank" rel="noopener noreferrer" sx={{display: 'inline-flex', alignItems: 'center', mb: 2}}>
                            <LinkIcon sx={{mr: 1}}/>
                            Originalquelle besuchen
                        </MuiLink>
                    )}
                    <ArticleBodyRenderer summary={selectedArticle?.summary} />
                </DialogContent>
                <DialogActions sx={{ p: '16px 24px', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Button onClick={handleGenerateEmail} startIcon={<EmailIcon />} disabled={emailState.loading}>E-Mail-Entwurf{emailState.loading && <CircularProgress size={20} sx={{ ml: 1 }} />}</Button>
                    {selectedArticle && <VoteComponent item={selectedArticle} onVote={(vote) => handleVote(selectedArticle.id, vote)} size="medium" />}
                </DialogActions>
            </Dialog>

            {/* Dialog für E-Mail-Entwurf */}
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

export default GenericScrapeWidget;
