import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Box, Typography, CircularProgress, Alert, Divider,
    IconButton, Tooltip, Avatar, Chip, Button, Card, CardContent, Stack,
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

interface VideoWidgetProps extends Partial<BaseWidgetProps> {
    icon?: React.ReactNode;
    title: string;
    category: string;
    widgetId: string;
    widgetTypeKey: string;
    isPublic?: boolean;
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

const formatCount = (count: number) => count > 10 ? ">10" : count;

const decodeHtmlEntities = (str: string) => {
    const txt = document.createElement("textarea");
    txt.innerHTML = str;
    return txt.value;
};

const safeFormat = (dateStr: string, fmt: string) => {
    const d = new Date(dateStr);
    return isValid(d) ? format(d, fmt, { locale: de }) : '';
};

const getDomain = (url: string | null | undefined): string | null => {
    if (!url) return null;
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return null; }
};

const getVideoEmbedData = (url: string) => {
    if (!url) return null;
    const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (ytMatch && ytMatch[1]) return { type: 'youtube', src: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1` };
    const vimeoMatch = url.match(/(?:vimeo\.com\/)(\d+)/);
    if (vimeoMatch && vimeoMatch[1]) return { type: 'vimeo', src: `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1` };
    if (url.match(/\.(mp4|webm|ogg)$/i)) return { type: 'video', src: url };
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

const VideoWidget: React.FC<VideoWidgetProps> = ({ 
    onDelete, widgetId, isRemovable, icon, title, category, widgetTypeKey, isPublic = false 
}) => {
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
    const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    useEffect(() => {
        if (user?.regions && user.regions.length > 0) {
            const defaultRegion = user.regions.find(r => !!r.is_default) || null;
            setSelectedRegion(defaultRegion);
        }
    }, [user]);

    const fetchData = useCallback(async (currentPage: number, region: Region | null, filter: 'all' | 'new' | 'unread', loadMore = false) => {
        if (isPublic) {
            setIsLoading(true);
            setTimeout(() => {
                const mockVideos: VideoItem[] = [
                    { id: 'mock1', title: 'E-Mobilität Trends 2025', is_read: false, published_date: new Date().toISOString(), full_text: null, original_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', thumbnail_url: 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=400', relevance_score: 95, user_vote: 0, is_trusted_source: true },
                    { id: 'mock2', title: 'Tutorial: KI-Dashboard nutzen', is_read: true, published_date: new Date().toISOString(), full_text: null, original_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', thumbnail_url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400', relevance_score: 88, user_vote: 0, is_trusted_source: true }
                ];
                setItems(mockVideos);
                setCounts({ unread: 1, new: 1 });
                setIsLoading(false);
            }, 800);
            return;
        }

        if (!category) { setError('Keine Kategorie konfiguriert.'); setIsLoading(false); return; }
        if (loadMore) setIsLoadingMore(true); else { setIsLoading(true); setItems([]); }
        setError(null);

        try {
            const params = new URLSearchParams({ category, limit: '5', sortBy: 'date', region: region ? region.name : 'all', page: String(currentPage) });
            if (filter !== 'all') params.append('filter', filter);

            const response = await apiClient.get(`/api/data/scraped-content?${params.toString()}`);
            const newItems: VideoItem[] = response.data?.data || [];
            const decodedItems = newItems.map(item => ({ ...item, title: decodeHtmlEntities(item.title) }));

            setItems(prev => loadMore ? [...prev, ...decodedItems] : decodedItems);
            setActiveFilters(response.data?.activeFilters || null);

            const countsRes = await apiClient.get(`/api/data/scraped-content-counts?${params.toString()}`);
            setCounts(countsRes.data?.counts || { unread: 0, new: 0 });
            setTotalPages(countsRes.data?.totalPages || 0);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Inhalte konnten nicht geladen werden.');
        } finally { setIsLoading(false); setIsLoadingMore(false); }
    }, [category, isPublic]);

    useEffect(() => { 
        setPage(1);
        fetchData(1, selectedRegion, filterMode); 
    }, [selectedRegion, filterMode, fetchData]);

    const markAsRead = async (itemId: string) => {
        if (isPublic) {
            setItems(prev => prev.map(n => n.id === itemId ? { ...n, is_read: true } : n));
            return;
        }
        try {
            await apiClient.post(`/api/data/scraped-content/${itemId}/mark-as-read`, {});
            setItems(prev => prev.map(n => n.id === itemId ? { ...n, is_read: true } : n));
            setCounts(prev => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
        } catch (err) { console.error('Fehler beim Markieren als gelesen:', err); }
    };

    const handleVote = async (contentId: string, vote: 1 | -1) => {
        if (isPublic) return;
        const currentItem = items.find(item => item.id === contentId);
        if (!currentItem) return;
        const newVote = currentItem.user_vote === vote ? 0 : vote;
        try {
            const res = await apiClient.post(`/api/data/content/${contentId}/vote`, { vote: newVote, contentType: 'scraped_content' });
            setItems(prev => prev.map(item => item.id === contentId ? { ...item, relevance_score: res.data.relevance_score, user_vote: newVote } : item));
        } catch (err) { console.error('Fehler bei der Abstimmung:', err); }
    };

    const handleLoadMore = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchData(nextPage, selectedRegion, filterMode, true);
    };

    const handlePlayVideo = (item: VideoItem) => {
        if (!item.is_read) markAsRead(item.id);
        setActiveVideo(item);
    };

    const handleOpenExternal = (e: React.MouseEvent, url: string) => {
        e.stopPropagation();
        window.open(url, '_blank');
    };

    const renderPlayer = () => {
        if (!activeVideo) return null;
        const embed = getVideoEmbedData(activeVideo.original_url);
        return (
            <Box sx={{ width: '100%', aspectRatio: '16/9', bgcolor: 'black', borderRadius: 1, overflow: 'hidden' }}>
                {embed?.type === 'youtube' || embed?.type === 'vimeo' ? (
                    <iframe src={embed.src} width="100%" height="100%" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={activeVideo.title} />
                ) : embed?.type === 'video' ? (
                    <video controls autoPlay style={{ width: '100%', height: '100%' }}><source src={embed.src} /></video>
                ) : (
                    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, color: 'white', textAlign: 'center' }}>
                        <Button variant="contained" startIcon={<OpenInNewIcon />} onClick={() => window.open(activeVideo.original_url, '_blank')}>Extern öffnen</Button>
                    </Box>
                )}
            </Box>
        );
    };

    const renderContent = () => {
        if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>;
        if (error) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
        if (items.length === 0) return <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>Keine Videos gefunden.</Typography>;

        return (
            <Stack spacing={1.5} sx={{ p: 1.5 }}>
                {items.map((item) => (
                    <Card key={item.id} variant="outlined" sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }} onClick={() => handlePlayVideo(item)}>
                        <CardContent sx={{ p: '12px !important', display: 'flex', gap: 2 }}>
                            <Box sx={{ position: 'relative', minWidth: 100, width: 100, height: 56, bgcolor: 'black', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                {item.thumbnail_url ? <img src={item.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} /> : <PlayCircleOutlineIcon sx={{ color: 'white' }} />}
                                <Box sx={{ position: 'absolute', color: 'white', opacity: 0.9 }}><PlayCircleOutlineIcon /></Box>
                            </Box>
                            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: item.is_read ? 500 : 700, mb: 0.5, lineHeight: 1.2 }}><HighlightedText text={item.title} keywords={activeFilters?.tags || []} /></Typography>
                                <Stack direction="row" spacing={1} alignItems="center" color="text.secondary">
                                    <Typography variant="caption">{safeFormat(item.published_date, 'd. MMM')}</Typography>
                                    <Divider orientation="vertical" flexItem sx={{ height: 12 }} />
                                    <IconButton size="small" onClick={(e) => handleOpenExternal(e, item.original_url)}><OpenInNewIcon sx={{ fontSize: 14 }} /></IconButton>
                                    <Typography variant="caption" noWrap sx={{ maxWidth: 80 }}>{getDomain(item.original_url)}</Typography>
                                    {item.is_trusted_source && <VerifiedUserIcon sx={{ fontSize: 14, color: 'success.main' }} />}
                                    <Box sx={{ ml: 'auto !important' }}><VoteComponent item={item} onVote={(v) => handleVote(item.id, v)} /></Box>
                                </Stack>
                            </Box>
                        </CardContent>
                    </Card>
                ))}
                {page < totalPages && <Button onClick={handleLoadMore} disabled={isLoadingMore} fullWidth>{isLoadingMore ? <CircularProgress size={24} /> : 'Mehr laden'}</Button>}
            </Stack>
        );
    };

    return (
        <WidgetPaper
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                    {icon}
                    <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>{decodeHtmlEntities(title)}</Typography>
                    {!isPublic && user?.regions && user.regions.length > 1 && (
                        <FormControl size="small" sx={{ minWidth: 80 }} onMouseDown={(e) => e.stopPropagation()}>
                            <Select
                                value={selectedRegion?.id || ''}
                                variant="standard"
                                disableUnderline
                                onChange={(e: SelectChangeEvent) => setSelectedRegion(user?.regions?.find(r => r.id === e.target.value) || null)}
                                renderValue={(val) => {
                                    const r = user?.regions?.find(reg => reg.id === val);
                                    return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Flag code={r?.code} /><Typography variant="body2">{r?.code}</Typography></Box>
                                }}
                            >
                                {user.regions.map((r) => <MenuItem key={r.id} value={r.id}><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Flag code={r.code} />{r.name}</Box></MenuItem>)}
                            </Select>
                        </FormControl>
                    )}
                </Box>
            }
            widgetTitle={decodeHtmlEntities(title)} widgetTypeKey={widgetTypeKey} widgetId={widgetId} onDelete={onDelete} isRemovable={isRemovable} isPublic={isPublic} noPadding
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', height: isMobile ? 'auto' : '100%' }}>
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1, px: 2, pt: 2, gap: 1 }}>
                     <Chip label="Neu" size="small" variant={filterMode === 'new' ? 'filled' : 'outlined'} color="primary" onClick={() => setFilterMode(filterMode === 'new' ? 'all' : 'new')} avatar={<Avatar sx={{ width: 18, height: 18, fontSize: '0.7rem' }}>{formatCount(counts.new)}</Avatar>} />
                     <Chip label="Ungesehen" size="small" variant={filterMode === 'unread' ? 'filled' : 'outlined'} color="secondary" onClick={() => setFilterMode(filterMode === 'unread' ? 'all' : 'unread')} avatar={<Avatar sx={{ width: 18, height: 18, fontSize: '0.7rem' }}>{formatCount(counts.unread)}</Avatar>} />
                </Box>
                <Box sx={{ flexGrow: 1, overflowY: isMobile ? 'visible' : 'auto' }}>{renderContent()}</Box>
            </Box>

            <Dialog open={!!activeVideo} onClose={() => setActiveVideo(null)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pr: 1 }}>
                    <Typography variant="h6" noWrap sx={{ maxWidth: '90%' }}>{activeVideo ? decodeHtmlEntities(activeVideo.title) : 'Video'}</Typography>
                    <IconButton onClick={() => setActiveVideo(null)}><CloseIcon /></IconButton>
                </DialogTitle>
                <DialogContent dividers sx={{ p: 1, pb: 2 }}>{renderPlayer()}</DialogContent>
            </Dialog>
        </WidgetPaper>
    );
};

export default VideoWidget;