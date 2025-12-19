import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Box, Typography, CircularProgress, Alert, Divider,
    IconButton, Tooltip, Avatar, Chip, Link as MuiLink, Button, Card, CardContent, Stack,
    FormControl, Select, SelectChangeEvent, MenuItem, Dialog, DialogContent, DialogTitle
} from '@mui/material';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import CloseIcon from '@mui/icons-material/Close';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ThumbDownOffAltIcon from '@mui/icons-material/ThumbDownOffAlt';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps, Region } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import { format, isValid } from 'date-fns';
import { de } from 'date-fns/locale';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

interface VideoItem {
    id: string;
    title: string;
    is_read: boolean;
    published_date: string;
    full_text: string | null;
    original_url: string;
    thumbnail_url?: string;
    relevance_score: number;
    user_vote: number;
    is_trusted_source: boolean;
}

interface VideoWidgetProps extends BaseWidgetProps {
    icon?: React.ReactNode;
    title: string;
    category: string;
}

interface ActiveFilters {
    tags: string[];
}

interface HighlightedTextProps {
    text: string;
    keywords: string[];
}

// HELPER: Flagge
const Flag: React.FC<{ code?: string; alt?: string; size?: number }> = ({ code, alt, size = 20 }) => {
  if (!code) return null;
  const c = code.toUpperCase();
  if (c === 'EU') { 
      return ( <svg width={size} height={(size * 2) / 3} viewBox="0 0 12 8" xmlns="http://www.w3.org/2000/svg" aria-label={alt || 'EU'}><rect width="12" height="8" fill="#003399" />{Array.from({ length: 12 }).map((_, i) => { const angle = (i * 30 * Math.PI) / 180; const cx = 6 + Math.cos(angle) * 2.2; const cy = 4 + Math.sin(angle) * 2.2; return (<g key={i} transform={`translate(${cx},${cy})`}><polygon points="0,-0.6 0.17,-0.1 0.6,-0.1 0.26,0.16 0.39,0.6 0,0.35 -0.39,0.6 -0.26,0.16 -0.6,-0.1 -0.17,-0.1" fill="#FFCC00" /></g>);})}</svg> );
  }
  return <img loading="lazy" width={size} src={`https://flagcdn.com/w20/${c.toLowerCase()}.png`} alt={alt || c} />;
};

// HELPER: Zähler-Formatierung (>10)
const formatCount = (count: number) => count > 10 ? ">10" : count;

// HELPER: HTML Entities decodieren
const decodeHtmlEntities = (str: string) => {
    const txt = document.createElement("textarea");
    txt.innerHTML = str;
    return txt.value;
};

// HELPER: Sicheres Datumsformat
const safeFormat = (dateStr: string, fmt: string) => {
    const d = new Date(dateStr);
    return isValid(d) ? format(d, fmt, { locale: de }) : '';
};

// HELPER: Domain extrahieren
const getDomain = (url: string | null | undefined): string | null => {
    if (!url) return null;
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return null; }
};

// HELPER: Video Embed URL ermitteln
const getVideoEmbedData = (url: string) => {
    if (!url) return null;
    
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (ytMatch && ytMatch[1]) {
        return { type: 'youtube', src: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1` };
    }
    
    // Vimeo
    const vimeoMatch = url.match(/(?:vimeo\.com\/)(\d+)/);
    if (vimeoMatch && vimeoMatch[1]) {
        return { type: 'vimeo', src: `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1` };
    }

    // Direkte Videodateien
    if (url.match(/\.(mp4|webm|ogg)$/i)) {
        return { type: 'video', src: url };
    }

    // Fallback: Versuche Iframe (könnte durch CSP blockiert werden, aber einen Versuch wert für manche Mediatheken)
    return { type: 'iframe', src: url };
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

const VoteComponent: React.FC<{ item: VideoItem; onVote: (vote: 1 | -1) => void; size?: 'small' | 'medium' }>
    = ({ item, onVote, size = 'small' }) => {
    const getScoreColor = (score: number) => score > 0 ? 'success.main' : score < 0 ? 'error.main' : 'text.secondary';
    const handleVote = (e: React.MouseEvent, vote: 1 | -1) => { e.stopPropagation(); onVote(vote); };

    return (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, p: 0.5, borderRadius: 2, bgcolor: 'action.hover' }}>
            <Tooltip title="Hilfreich">
                <IconButton size={size} onClick={(e) => handleVote(e, 1)} sx={{ p: 0.5 }}>
                    {item.user_vote === 1 ? <ThumbUpIcon color="success" fontSize={size} /> : <ThumbUpOffAltIcon color="action" fontSize={size} />}
                </IconButton>
            </Tooltip>
            <Typography variant="caption" sx={{ fontWeight: 'bold', color: getScoreColor(item.relevance_score), minWidth: 16, textAlign: 'center' }}>
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

const VideoWidget: React.FC<VideoWidgetProps> = ({ onDelete, widgetId, isRemovable, icon, title, category, widgetTypeKey }) => {
    const { user } = useAuth();
    const [items, setItems] = useState<VideoItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [counts, setCounts] = useState({ unread: 0, new: 0 });
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);

    const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
    const [filterMode, setFilterMode] = useState<'all' | 'new' | 'unread'>('all');
    const [activeFilters, setActiveFilters] = useState<ActiveFilters | null>(null);
    
    // NEU: Player State
    const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    // --- Initial Region ---
    useEffect(() => {
        if (user?.regions && user.regions.length > 0) {
            const defaultRegion = user.regions.find(r => !!r.is_default) || null;
            setSelectedRegion(defaultRegion);
        }
    }, [user]);

    // --- Fetch Data ---
    const fetchData = useCallback(async (currentPage: number, region: Region | null, filter: 'all' | 'new' | 'unread', loadMore = false) => {
        if (!category) {
            setError('Keine Kategorie konfiguriert.');
            setIsLoading(false);
            return;
        }

        if (loadMore) setIsLoadingMore(true);
        else { setIsLoading(true); setItems([]); }
        setError(null);

        try {
            const token = localStorage.getItem('jwt_token');
            const params = new URLSearchParams({
                category,
                limit: '5',
                sortBy: 'date',
                region: region ? region.name : 'all',
                page: String(currentPage)
            });
            if (filter !== 'all') params.append('filter', filter);

            // 1. Content
            const response = await apiClient.get(`/api/data/scraped-content?${params.toString()}`, { headers: { 'x-auth-token': token } });
            const newItems: VideoItem[] = response.data?.data || [];
            
            // HTML Entities im Titel decodieren
            const decodedItems = newItems.map(item => ({
                ...item,
                title: decodeHtmlEntities(item.title)
            }));

            setItems(prev => loadMore ? [...prev, ...decodedItems] : decodedItems);
            setActiveFilters(response.data?.activeFilters || null);

        } catch (err: any) {
            setError(err.response?.data?.message || 'Inhalte konnten nicht geladen werden.');
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }

        // 2. Counts (Non-blocking)
        try {
            const token = localStorage.getItem('jwt_token');
            const countParams = new URLSearchParams({
                category, 
                limit: '5', 
                sortBy: 'date', 
                region: region ? region.name : 'all'
            });
            if (filter !== 'all') countParams.append('filter', filter);
            
            const countsRes = await apiClient.get(`/api/data/scraped-content-counts?${countParams.toString()}`, { headers: { 'x-auth-token': token } });
            setCounts(countsRes.data?.counts || { unread: 0, new: 0 });
            setTotalPages(countsRes.data?.totalPages || 0);
        } catch(err) {
            console.warn("Fehler beim Laden der Zähler:", err);
        }

    }, [category]);

    useEffect(() => {
        setPage(1);
        fetchData(1, selectedRegion, filterMode);
    }, [selectedRegion, filterMode, fetchData]);

    const handleLoadMore = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchData(nextPage, selectedRegion, filterMode, true);
    };

    // NEU: Play Handler öffnet jetzt das Modal
    const handlePlayVideo = (item: VideoItem) => {
        if (!item.is_read) markAsRead(item.id);
        setActiveVideo(item);
    };

    // NEU: Externer Link Handler
    const handleOpenExternal = (e: React.MouseEvent, url: string) => {
        e.stopPropagation();
        window.open(url, '_blank');
    };

    const markAsRead = async (itemId: string) => {
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.post(`/api/data/scraped-content/${itemId}/mark-as-read`, {}, { headers: { 'x-auth-token': token } });
            setItems(prev => prev.map(n => n.id === itemId ? { ...n, is_read: true } : n));
            setCounts(prev => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
        } catch (err) { console.error('Fehler beim Markieren als gelesen:', err); }
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
        } catch (err) { console.error('Fehler bei der Abstimmung:', err); }
    };

    const renderContent = () => {
        if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', p: 2 }}><CircularProgress /></Box>;
        if (error) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
        
        if (items.length === 0) {
            if (activeFilters && activeFilters.tags && activeFilters.tags.length > 0) {
                return (
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary">Keine Videos gefunden.</Typography>
                        <Typography variant="caption" color="text.secondary">Filter: {activeFilters.tags.join(', ')}</Typography>
                    </Box>
                );
            }
            return <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>Keine Videos gefunden.</Typography>;
        }

        return (
            <Stack spacing={1.5} sx={{ p: 1.5 }}>
                {items.map((item) => (
                    <Card 
                        key={item.id} 
                        variant="outlined" 
                        sx={{ 
                            cursor: 'pointer', 
                            transition: 'all 0.2s', 
                            '&:hover': { bgcolor: 'action.hover', boxShadow: 1 }
                        }}
                        onClick={() => handlePlayVideo(item)}
                    >
                        <CardContent sx={{ p: '12px !important', display: 'flex', gap: 2 }}>
                            {/* Thumbnail */}
                            <Box sx={{ position: 'relative', minWidth: 100, width: 100, height: 56, borderRadius: 1, overflow: 'hidden', bgcolor: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {item.thumbnail_url ? (
                                    <>
                                        <img src={item.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} />
                                        <Box sx={{ position: 'absolute', color: 'white', bgcolor: 'rgba(0,0,0,0.3)', borderRadius: '50%' }}>
                                            <PlayCircleOutlineIcon />
                                        </Box>
                                    </>
                                ) : (
                                    <PlayCircleOutlineIcon sx={{ color: 'white' }} />
                                )}
                            </Box>

                            {/* Content */}
                            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: item.is_read ? 500 : 700, mb: 0.5, lineHeight: 1.2 }}>
                                    <HighlightedText text={item.title} keywords={activeFilters?.tags || []} />
                                </Typography>
                                
                                <Stack direction="row" spacing={1} alignItems="center" color="text.secondary" sx={{ flexWrap: 'wrap' }}>
                                    <Typography variant="caption">{safeFormat(item.published_date, 'd. MMM yyyy')}</Typography>
                                    <Divider orientation="vertical" flexItem sx={{ height: 12, mx: 1 }} />
                                    
                                    {/* Link zur Quelle (öffnet neuen Tab) */}
                                    <Tooltip title="In neuem Tab öffnen">
                                        <IconButton 
                                            size="small" 
                                            onClick={(e) => handleOpenExternal(e, item.original_url)}
                                            sx={{ p: 0.5, ml: -0.5 }}
                                        >
                                             <OpenInNewIcon sx={{ fontSize: 14 }} />
                                        </IconButton>
                                    </Tooltip>
                                    <Typography variant="caption" noWrap sx={{ maxWidth: 100 }}>
                                        {getDomain(item.original_url)}
                                    </Typography>
                                    {item.is_trusted_source && <VerifiedUserIcon sx={{ fontSize: 14, color: 'success.main' }} />}
                                    
                                    {/* Vote Buttons rechtsbündig */}
                                    <Box sx={{ ml: 'auto !important' }}>
                                        <VoteComponent item={item} onVote={(vote) => handleVote(item.id, vote)} />
                                    </Box>
                                </Stack>
                            </Box>
                        </CardContent>
                    </Card>
                ))}
                
                {page < totalPages && (
                    <Button onClick={handleLoadMore} disabled={isLoadingMore} fullWidth sx={{ mt: 1 }}>
                        {isLoadingMore ? <CircularProgress size={24} /> : 'Mehr laden'}
                    </Button>
                )}
            </Stack>
        );
    };

    // Header Title Component
    const widgetTitleComponent = (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
            {icon}
            <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>{decodeHtmlEntities(title)}</Typography>
            
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

    // Render Video Player Content
    const renderPlayer = () => {
        if (!activeVideo) return null;
        const embed = getVideoEmbedData(activeVideo.original_url);

        return (
            <Box sx={{ width: '100%', aspectRatio: '16/9', bgcolor: 'black', borderRadius: 1, overflow: 'hidden' }}>
                {embed?.type === 'youtube' || embed?.type === 'vimeo' ? (
                    <iframe
                        src={embed.src}
                        width="100%"
                        height="100%"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title={activeVideo.title}
                    />
                ) : embed?.type === 'video' ? (
                    <video controls autoPlay style={{ width: '100%', height: '100%' }}>
                        <source src={embed.src} />
                        Ihr Browser unterstützt dieses Videoformat nicht.
                    </video>
                ) : (
                    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, color: 'white', textAlign: 'center' }}>
                        <Typography variant="h6" gutterBottom>Wiedergabe hier nicht möglich</Typography>
                        <Button 
                            variant="contained" 
                            startIcon={<OpenInNewIcon />} 
                            onClick={() => window.open(activeVideo.original_url, '_blank')}
                        >
                            Auf externer Seite öffnen
                        </Button>
                    </Box>
                )}
            </Box>
        );
    };

    return (
        <WidgetPaper
            title={widgetTitleComponent}
            widgetTitle={decodeHtmlEntities(title)}
            widgetTypeKey={widgetTypeKey || ''}
            widgetId={widgetId || ''}
            onDelete={onDelete}
            isRemovable={isRemovable}
            noPadding
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', height: isMobile ? 'auto' : '100%' }}>
                
                {/* Filterbereich IM Inhalt */}
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1, px: 2, pt: 2, gap: 1 }}>
                     <Chip 
                        label="Neu" 
                        size="small" 
                        variant={filterMode === 'new' ? 'filled' : 'outlined'} 
                        color="primary" 
                        clickable 
                        onClick={() => setFilterMode(filterMode === 'new' ? 'all' : 'new')} 
                        avatar={<Avatar sx={{ width: 18, height: 18, fontSize: '0.7rem', bgcolor: 'primary.dark', color: 'primary.contrastText' }}>{formatCount(counts.new)}</Avatar>} 
                    />
                    <Chip 
                        label="Nicht gesehen" 
                        size="small" 
                        variant={filterMode === 'unread' ? 'filled' : 'outlined'} 
                        color="secondary" 
                        clickable 
                        onClick={() => setFilterMode(filterMode === 'unread' ? 'all' : 'unread')} 
                        avatar={<Avatar sx={{ width: 18, height: 18, fontSize: '0.7rem', bgcolor: 'secondary.dark', color: 'secondary.contrastText' }}>{formatCount(counts.unread)}</Avatar>} 
                    />
                </Box>

                <Box sx={{ flexGrow: 1, overflowY: isMobile ? 'visible' : 'auto' }}>
                    {renderContent()}
                </Box>
            </Box>

            {/* Video Player Modal */}
            <Dialog 
                open={!!activeVideo} 
                onClose={() => setActiveVideo(null)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pr: 1 }}>
                    <Typography variant="h6" noWrap sx={{ maxWidth: '90%' }}>
                        {activeVideo ? decodeHtmlEntities(activeVideo.title) : 'Video'}
                    </Typography>
                    <IconButton onClick={() => setActiveVideo(null)}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ p: 1, pb: 2 }}>
                    {renderPlayer()}
                </DialogContent>
            </Dialog>
        </WidgetPaper>
    );
};

export default VideoWidget;