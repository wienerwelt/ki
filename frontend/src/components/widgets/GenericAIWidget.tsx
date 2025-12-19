import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
    Accordion, AccordionDetails, AccordionSummary, Box, Typography, TextField, CircularProgress, MenuItem, Alert, Stack, IconButton, Tooltip, Button,
    Dialog, DialogTitle, DialogContent, DialogActions, Chip, Select, FormControl, SelectChangeEvent, InputAdornment, useTheme, useMediaQuery
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ThumbDownOffAltIcon from '@mui/icons-material/ThumbDownOffAlt';
import ShareIcon from '@mui/icons-material/Share';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';

import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps, Region } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import { format, isValid } from 'date-fns';
import { de } from 'date-fns/locale';

// --- Interfaces ---

interface AIContentItem {
    id: string;
    title: string;
    content: string; // HTML content
    summary: string | null;
    is_read: boolean;
    published_date: string;
    relevance_score: number;
    original_url?: string | null;
    category: string;
    user_vote: number;
    created_at: string;
    region: string | null;
    is_trusted_source: boolean;
    thumbnail_url?: string | null;
    tags?: string[] | null;
}

interface HighlightedTextProps {
    text: string;
    keywords: string[];
}

interface GenericAIWidgetProps extends BaseWidgetProps {
    icon?: React.ReactNode;
    title: string;
    category: string;
    description?: string;
    widgetTypeKey: string;
}

interface ShareState {
    open: boolean;
    loading: boolean;
    error: string | null;
    success: string | null;
    recipientEmail: string;
}

// --- Helper Components ---

// HELPER: Flagge
const Flag: React.FC<{ code?: string; alt?: string; size?: number }> = ({ code, alt, size = 20 }) => {
  if (!code) return null;
  const c = code.toUpperCase();
  if (c === 'EU') { 
      return ( <svg width={size} height={(size * 2) / 3} viewBox="0 0 12 8" xmlns="http://www.w3.org/2000/svg" aria-label={alt || 'EU'}><rect width="12" height="8" fill="#003399" />{Array.from({ length: 12 }).map((_, i) => { const angle = (i * 30 * Math.PI) / 180; const cx = 6 + Math.cos(angle) * 2.2; const cy = 4 + Math.sin(angle) * 2.2; return (<g key={i} transform={`translate(${cx},${cy})`}><polygon points="0,-0.6 0.17,-0.1 0.6,-0.1 0.26,0.16 0.39,0.6 0,0.35 -0.39,0.6 -0.26,0.16 -0.6,-0.1 -0.17,-0.1" fill="#FFCC00" /></g>);})}</svg> );
  }
  return <img loading="lazy" width={size} src={`https://flagcdn.com/w20/${c.toLowerCase()}.png`} alt={alt || c} />;
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
            result.push(<mark key={index} style={{ backgroundColor: '#fff59d', padding: '0 2px' }}>{keyword}</mark>);
            lastIndex = startIndex + keyword.length;
        });
        if (lastIndex < text.length) result.push(text.substring(lastIndex));
        return result;
    }, [text, keywords]);
    return <span>{parts}</span>;
};

const VoteComponent: React.FC<{ item: AIContentItem; onVote: (vote: 1 | -1) => void; size?: 'small' | 'medium' }> = ({ item, onVote, size = 'small' }) => {
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

// --- Helper: Sicheres Datumsformat ---
const safeFormat = (dateStr: string, fmt: string) => {
    const d = new Date(dateStr);
    return isValid(d) ? format(d, fmt, { locale: de }) : '';
};

// --- Helper: Domain ---
const getDomain = (url: string | null | undefined): string | null => {
    if (!url) return null;
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
};


const GenericAIWidget: React.FC<GenericAIWidgetProps> = ({ onDelete, widgetId, isRemovable, icon, title, category, description, widgetTypeKey }) => {
    const { user } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    
    // --- State ---
    const [items, setItems] = useState<AIContentItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedArticle, setSelectedArticle] = useState<AIContentItem | null>(null);
    
    // Filter & Search
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
    
    // Dialogs
    const [shareState, setShareState] = useState<ShareState>({ open: false, loading: false, error: null, success: null, recipientEmail: '' });
    const [expandedPanel, setExpandedPanel] = useState<string | false>(false);

    // --- Effects ---
    
    // Debounce Search
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearchQuery(searchQuery), 500);
        return () => clearTimeout(handler);
    }, [searchQuery]);

    // Initial Region
    useEffect(() => {
        if (user?.regions && user.regions.length > 0 && !selectedRegion) {
            const defaultRegion = user.regions.find(r => !!r.is_default) || user.regions[0];
            setSelectedRegion(defaultRegion);
        }
    }, [user?.regions, selectedRegion]);

    // Fetch Data
    const fetchData = useCallback(async (region: Region | null, search: string) => {
        if (!category) {
            setIsLoading(false);
            setError("Keine Kategorie im Widget-Typ konfiguriert.");
            return;
        }
        
        setIsLoading(true);
        setError(null);
        
        try {
            const token = localStorage.getItem('jwt_token');
            const params = new URLSearchParams({
                category,
                limit: '10',
                sortBy: 'date',
                region: region ? region.name : 'all'
            });
            
            if (search) params.append('search', search);

            const response = await apiClient.get(`/api/data/ai-content?${params.toString()}`, { headers: { 'x-auth-token': token } });
            setItems(response.data?.data || []);
        } catch (err: any) {
            console.error("Fehler beim Laden von AI Content:", err);
            setError(err.response?.data?.message || "Inhalte konnten nicht geladen werden.");
        } finally {
            setIsLoading(false);
        }
    }, [category]);

    useEffect(() => {
        // Fetch trigger
        if (selectedRegion || (user?.regions && user.regions.length === 0)) {
            fetchData(selectedRegion, debouncedSearchQuery);
        }
    }, [selectedRegion, debouncedSearchQuery, fetchData, user?.regions]);

    // --- Actions ---

    const handleVote = async (itemId: string, vote: 1 | -1) => {
        const token = localStorage.getItem('jwt_token');
        // Optimistic Update
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, user_vote: i.user_vote === vote ? 0 : vote } : i));

        try {
            const res = await apiClient.post(`/api/data/content/${itemId}/vote`, { vote, contentType: 'ai_content' }, { headers: { 'x-auth-token': token } });
            // Update Score from Server
            setItems(prev => prev.map(i => i.id === itemId ? { ...i, relevance_score: res.data.relevance_score } : i));
        } catch (err) { console.error(err); }
    };

    const handleAccordionChange = (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
        setExpandedPanel(isExpanded ? panel : false);
        if (isExpanded) {
            const item = items.find(i => i.id === panel);
            if (item && !item.is_read) {
                markAsRead(item.id);
            }
        }
    };

    const markAsRead = async (itemId: string) => {
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.post(`/api/data/content/${itemId}/mark-as-read`, { contentType: 'ai_content' }, { headers: { 'x-auth-token': token } });
            setItems(prev => prev.map(i => i.id === itemId ? { ...i, is_read: true } : i));
        } catch (e) { /* ignore */ }
    };

    const handleOpenShareDialog = (e: React.MouseEvent, item: AIContentItem) => {
        e.stopPropagation();
        setSelectedArticle(item);
        setShareState({ open: true, loading: false, error: null, success: null, recipientEmail: '' });
    };
    const handleCloseShareDialog = () => setShareState({ ...shareState, open: false });

    const handleSendEmail = async () => {
        if (!selectedArticle || !shareState.recipientEmail) return;
        setShareState(prev => ({ ...prev, loading: true }));
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.post('/api/data/share-content-by-email', { 
                title: selectedArticle.title, 
                summary: selectedArticle.summary, // oder content snippet
                source: selectedArticle.original_url, 
                recipientEmail: shareState.recipientEmail,
                contentType: 'ai_content'
            }, { headers: { 'x-auth-token': token } });
            setShareState(prev => ({ ...prev, loading: false, success: response.data.message }));
        } catch (err: any) { 
            setShareState(prev => ({ ...prev, loading: false, error: err.response?.data?.message || 'Fehler beim Senden.' })); 
        }
    };

    // Header Component (Region Selector)
    const widgetTitleComponent = (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
            <Tooltip title={description || title}><span>{icon}</span></Tooltip>
            <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>{title}</Typography>
            
            {/* Regionen Auswahl */}
            {user?.regions && user.regions.length > 1 && (
                 <FormControl size="small" sx={{ minWidth: 80 }} onMouseDown={(e) => e.stopPropagation()}>
                    <Select
                        value={selectedRegion?.id || ''}
                        variant="standard"
                        disableUnderline
                        onChange={(e: SelectChangeEvent) => {
                            const region = user?.regions?.find(r => r.id === e.target.value);
                            setSelectedRegion(region || null);
                        }}
                        renderValue={(value) => {
                            const region = user?.regions?.find(r => r.id === value);
                            return (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Flag code={region?.code} alt={region?.name} />
                                    <Typography variant="body2">{region?.code}</Typography>
                                </Box>
                            );
                        }}
                    >
                        {user?.regions?.map((region) => (
                            <MenuItem key={region.id} value={region.id}>
                                 <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Flag code={region.code} alt={region.name} />
                                    {region.name}
                                </Box>
                            </MenuItem>
                        ))}
                    </Select>
                 </FormControl>
            )}
        </Box>
    );

    return (
        <WidgetPaper
            title={widgetTitleComponent}
            widgetTitle={title}
            widgetTypeKey={widgetTypeKey}
            widgetId={widgetId || ''}
            onDelete={onDelete}
            isRemovable={isRemovable}
            noPadding
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                
                {/* TOOLBAR: Suche */}
                <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
                     <TextField 
                        fullWidth
                        variant="outlined" 
                        size="small" 
                        placeholder="Durchsuchen..." 
                        value={searchQuery} 
                        onChange={(e) => setSearchQuery(e.target.value)}
                        InputProps={{ 
                            startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>),
                            endAdornment: searchQuery ? (
                                <InputAdornment position="end">
                                    <IconButton size="small" onClick={() => setSearchQuery('')}><CloseIcon fontSize="small" /></IconButton>
                                </InputAdornment>
                            ) : null,
                            sx: { borderRadius: 4 } 
                        }}
                    />
                </Box>

                {/* Content List */}
                <Box sx={{ flexGrow: 1, overflowY: isMobile ? 'visible' : 'auto', p: 0 }}>
                    {isLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
                    ) : error ? (
                        <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>
                    ) : items.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" sx={{ p: 4, textAlign: 'center' }}>Keine Inhalte gefunden.</Typography>
                    ) : (
                        <Box>
                            {items.map((item) => (
                                <Accordion 
                                    key={item.id} 
                                    expanded={expandedPanel === item.id} 
                                    onChange={handleAccordionChange(item.id)}
                                    disableGutters
                                    elevation={0}
                                    sx={{ '&:before': { display: 'none' }, borderBottom: 1, borderColor: 'divider' }}
                                >
                                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                        <Stack spacing={0.5} sx={{ width: '100%', pr: 1 }}>
                                            <Typography variant="subtitle2" sx={{ fontWeight: item.is_read ? 'normal' : 'bold' }}>
                                                <HighlightedText text={item.title} keywords={[debouncedSearchQuery]} />
                                            </Typography>
                                            <Stack direction="row" alignItems="center" spacing={1}>
                                                <Chip label={safeFormat(item.published_date, 'd. MMM')} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                                                {item.is_trusted_source && <VerifiedUserIcon sx={{ fontSize: 14, color: 'success.main' }} />}
                                                {item.original_url && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        {getDomain(item.original_url)}
                                                    </Typography>
                                                )}
                                            </Stack>
                                        </Stack>
                                    </AccordionSummary>
                                    <AccordionDetails sx={{ bgcolor: 'action.hover', p: 2 }}>
                                        <Typography variant="body2" component="div" dangerouslySetInnerHTML={{ __html: item.content || item.summary || '' }} sx={{ mb: 2 }} />
                                        
                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                            {item.original_url && (
                                                <Button size="small" href={item.original_url} target="_blank" endIcon={<OpenInNewIcon fontSize="inherit" />}>
                                                    Zur Quelle
                                                </Button>
                                            )}
                                            <Stack direction="row" spacing={1}>
                                                <Tooltip title="Teilen">
                                                    <IconButton size="small" onClick={(e) => handleOpenShareDialog(e, item)}><ShareIcon fontSize="small" /></IconButton>
                                                </Tooltip>
                                                <VoteComponent item={item} onVote={(vote) => handleVote(item.id, vote)} />
                                            </Stack>
                                        </Stack>
                                    </AccordionDetails>
                                </Accordion>
                            ))}
                        </Box>
                    )}
                </Box>
            </Box>

            {/* Share Dialog */}
            <Dialog open={shareState.open} onClose={handleCloseShareDialog} fullWidth maxWidth="sm">
                <DialogTitle>Inhalt teilen</DialogTitle>
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

// Hilfskomponente für Icon
function OpenInNewIcon(props: any) {
    return <svg {...props} width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>;
}

export default GenericAIWidget;