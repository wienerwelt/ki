import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Box, Typography, CircularProgress, Alert, Divider,
    IconButton, Tooltip, Avatar, Chip, TextField, MenuItem, Link as MuiLink, Button, Card, CardContent, Stack
} from '@mui/material';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import CloseIcon from '@mui/icons-material/Close';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ThumbDownOffAltIcon from '@mui/icons-material/ThumbDownOffAlt';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps, Region } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

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

interface HighlightedTextProps {
    text: string;
    keywords: string[];
}

interface VideoWidgetProps extends BaseWidgetProps {
    icon?: React.ReactNode;
    title: string;
    category: string;
}

const HighlightedText: React.FC<HighlightedTextProps> = ({ text, keywords }) => {
    const parts = useMemo(() => {
        if (!keywords || keywords.length === 0 || !text) {
            return [text];
        }
        const regex = new RegExp(`\\b(${keywords.join('|')})`, 'gi');
        const matches = [...text.matchAll(regex)];
        if (matches.length === 0) return [text];

        const result: (string | JSX.Element)[] = [];
        let lastIndex = 0;

        matches.forEach((match, index) => {
            const keyword = match[0];
            const startIndex = match.index!;
            
            if (startIndex > lastIndex) {
                result.push(text.substring(lastIndex, startIndex));
            }
            result.push(<mark key={index}>{keyword}</mark>);
            lastIndex = startIndex + keyword.length;
        });

        if (lastIndex < text.length) {
            result.push(text.substring(lastIndex));
        }
        
        return result;
    }, [text, keywords]);

    return <span>{parts}</span>;
};

const defaultVideoThumbnail = '/logos/default-video.png';

const decodeHtmlEntities = (text: string | null | undefined): string => {
    if (!text) return '';
    try {
        const textArea = document.createElement('textarea');
        textArea.innerHTML = text;
        return textArea.value;
    } catch (e) {
        return text;
    }
};

const getYouTubeVideoId = (url: string | null | undefined): string | null => {
    if (!url) return null;
    const patterns = [
        /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
};

const getYouTubeThumbnail = (videoId: string | null): string => {
    if (!videoId) return defaultVideoThumbnail;
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
};

const getDomain = (url: string | null | undefined): string | null => {
    if (!url) return null;
    try {
        const hostname = new URL(url).hostname;
        if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
            return 'YouTube';
        }
        return hostname.replace(/^www\./, '');
    } catch (e) {
        return null;
    }
};

const VoteComponent: React.FC<{ item: VideoItem; onVote: (vote: 1 | -1) => void; }> = ({ item, onVote }) => {
    const getScoreColor = (score: number) => score > 0 ? 'success.main' : score < 0 ? 'error.main' : 'text.secondary';
    const handleVote = (e: React.MouseEvent, vote: 1 | -1) => {
        e.stopPropagation();
        onVote(vote);
    };
    return (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, p: 0.5, borderRadius: 2, bgcolor: 'action.hover' }}>
            <Tooltip title="Hilfreich"><IconButton size="small" onClick={(e) => handleVote(e, 1)} sx={{ p: 0.5 }}>{item.user_vote === 1 ? <ThumbUpIcon color="success" fontSize="small" /> : <ThumbUpOffAltIcon color="action" fontSize="small" />}</IconButton></Tooltip>
            <Typography variant="caption" sx={{ fontWeight: 'bold', color: getScoreColor(item.relevance_score), minWidth: 16, textAlign: 'center' }}>{item.relevance_score}</Typography>
            <Tooltip title="Nicht hilfreich"><IconButton size="small" onClick={(e) => handleVote(e, -1)} sx={{ p: 0.5 }}>{item.user_vote === -1 ? <ThumbDownIcon color="error" fontSize="small" /> : <ThumbDownOffAltIcon color="action" fontSize="small" />}</IconButton></Tooltip>
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
    const [activeGlobalTags, setActiveGlobalTags] = useState<string[]>([]);
    const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);
    const playerRef = useRef<HTMLDivElement>(null);

    const fetchData = useCallback(async (currentPage: number, region: Region | null, filter: 'all' | 'new' | 'unread', loadMore = false) => {
        if (!category) {
            setError("Keine Kategorie im Widget-Typ konfiguriert.");
            setIsLoading(false);
            return;
        }

        if (loadMore) setIsLoadingMore(true);
        else setIsLoading(true);
        if (!loadMore) setItems([]);
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

            const response = await apiClient.get(`/api/data/scraped-content?${params.toString()}`, { headers: { 'x-auth-token': token } });
            const fetchedItems: VideoItem[] = response.data?.data || [];
            
            setItems(prev => loadMore ? [...prev, ...fetchedItems] : fetchedItems);
            setCounts(response.data?.counts || { unread: 0, new: 0 });
            setTotalPages(response.data?.totalPages || 0);
            setActiveGlobalTags(response.data?.activeFilters?.tags || []);

            if (currentPage === 1 && !loadMore && fetchedItems.length > 0 && !activeVideo) {
                setActiveVideo(fetchedItems[0]);
            }

        } catch (err: any) {
            setError(err.response?.data?.message || `Videos konnten nicht geladen werden.`);
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }
    }, [category, activeVideo]);
    
    useEffect(() => {
        if (user?.regions) {
            const defaultRegion = user.regions.find(r => !!r.is_default) || null;
            setSelectedRegion(defaultRegion);
        }
    }, [user?.regions]);

    useEffect(() => {
        setPage(1);
        setActiveVideo(null); 
        fetchData(1, selectedRegion, filterMode);
    }, [selectedRegion, filterMode]);

    const handleLoadMore = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchData(nextPage, selectedRegion, filterMode, true);
    };

    const handleSelectVideo = (item: VideoItem) => {
        setActiveVideo(item);
        if (!item.is_read) markAsRead(item.id);
        playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    const markAsRead = async (itemId: string) => {
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.post(`/api/data/scraped-content/${itemId}/mark-as-read`, {}, { headers: { 'x-auth-token': token } });
            setItems(prev => prev.map(n => n.id === itemId ? { ...n, is_read: true } : n));
            setCounts(prev => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
        } catch (err) { console.error("Fehler beim Markieren als gesehen:", err); }
    };

    const handleVote = async (contentId: string, vote: 1 | -1) => {
        const token = localStorage.getItem('jwt_token');
        const currentItem = items.find(item => item.id === contentId);
        if (!currentItem) return;
        const newVote = currentItem.user_vote === vote ? 0 : vote;
        try {
            const res = await apiClient.post(`/api/data/content/${contentId}/vote`, { vote: newVote, contentType: 'scraped_content' }, { headers: { 'x-auth-token': token } });
            const newScore = res.data.relevance_score;
            const updateItem = (item: VideoItem) => item.id === contentId ? { ...item, relevance_score: newScore, user_vote: newVote } : item;
            setItems(prev => prev.map(updateItem));
            if (activeVideo?.id === contentId) {
                setActiveVideo(prev => prev ? updateItem(prev) : null);
            }
        } catch (err) { console.error("Fehler bei der Abstimmung:", err); }
    };

    const handleClosePlayer = () => {
        setActiveVideo(null);
    };

    const renderContent = () => {
        if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', p: 2 }}><CircularProgress /></Box>;
        if (error) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
        if (items.length === 0) return <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>Keine Videos für Ihre Auswahl gefunden.</Typography>;
        
        const activeVideoId = getYouTubeVideoId(activeVideo?.original_url);

        return (
            <Box sx={{ height: '100%', overflowY: 'auto' }}>
                {activeVideo && activeVideoId && (
                    <Box ref={playerRef} sx={{ p: 1.5, pt: 0 }}>
                        <Box sx={{ aspectRatio: '16/9', bgcolor: 'black', position: 'relative', borderRadius: 1, overflow: 'hidden' }}>
                            <iframe
                                key={activeVideoId}
                                width="100%"
                                height="100%"
                                src={`https://www.youtube-nocookie.com/embed/${activeVideoId}`}
                                title="YouTube video player"
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                                referrerPolicy="strict-origin-when-cross-origin"
                            ></iframe>
                            <Tooltip title="Player schließen">
                                <IconButton onClick={handleClosePlayer} sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(0,0,0,0.5)', color: 'white', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' } }}>
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Box>
                        <Typography variant="h6" sx={{ mt: 1 }}>
                            <HighlightedText
                                text={decodeHtmlEntities(activeVideo.title)}
                                keywords={activeGlobalTags}
                            />
                        </Typography>
                        <Stack direction="row" spacing={1.5} alignItems="center" color="text.secondary" mt={0.5}>
                            <Typography variant="caption">{decodeHtmlEntities(activeVideo.full_text)}</Typography>
                            <Divider orientation="vertical" flexItem />
                            <Typography variant="caption">{format(new Date(activeVideo.published_date), "d. MMMM yyyy", { locale: de })}</Typography>
                        </Stack>
                    </Box>
                )}

                <Stack spacing={1.5} sx={{ p: 1.5, pt: activeVideo ? 0 : 1.5 }}>
                    {items.map((item) => {
                        const videoId = getYouTubeVideoId(item.original_url);
                        if (!videoId) return null;
                        
                        return (
                            <Card
                                key={item.id}
                                variant="outlined"
                                onClick={() => handleSelectVideo(item)}
                                sx={{
                                    cursor: 'pointer',
                                    bgcolor: activeVideo?.id === item.id ? 'action.selected' : 'background.default',
                                    borderColor: activeVideo?.id === item.id ? 'primary.main' : 'divider',
                                    transition: 'background-color 0.3s'
                                }}
                            >
                                <CardContent sx={{ p: '12px !important' }}>
                                    <Stack direction="row" spacing={1.5} alignItems="center">
                                        <Box
                                            sx={{
                                                position: 'relative',
                                                width: 100,
                                                height: 60,
                                                flexShrink: 0,
                                                borderRadius: 1,
                                                overflow: 'hidden',
                                            }}
                                        >
                                            <img
                                                src={item.thumbnail_url || getYouTubeThumbnail(videoId)}
                                                alt={decodeHtmlEntities(item.title)}
                                                onError={(e) => { (e.target as HTMLImageElement).src = defaultVideoThumbnail; }}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                            <IconButton sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'rgba(255,255,255,0.9)', bgcolor: 'rgba(0,0,0,0.6)', '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' } }} size="small">
                                                <PlayCircleOutlineIcon fontSize="small" />
                                            </IconButton>
                                        </Box>
                                        <Box flexGrow={1} sx={{ minWidth: 0 }}>
                                            <Typography variant="body2" sx={{ fontWeight: item.is_read ? 500 : 700, mb: 0.5 }} noWrap>
                                                <HighlightedText text={decodeHtmlEntities(item.title)} keywords={activeGlobalTags} />
                                            </Typography>
                                            <Stack direction="row" spacing={1.5} alignItems="center" color="text.secondary">
                                                <Typography variant="caption">{decodeHtmlEntities(item.full_text)}</Typography>
                                                <Divider orientation="vertical" flexItem />
                                                <Typography variant="caption">{format(new Date(item.published_date), "d. MMM yy", { locale: de })}</Typography>
                                            </Stack>
                                        </Box>
                                        <VoteComponent item={item} onVote={(vote) => handleVote(item.id, vote)} />
                                    </Stack>
                                </CardContent>
                            </Card>
                        );
                    })}
                    {page < totalPages && <Button onClick={handleLoadMore} disabled={isLoadingMore}>{isLoadingMore ? <CircularProgress size={24} /> : 'Mehr laden'}</Button>}
                </Stack>
            </Box>
        );
    };

    return (
        <WidgetPaper
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, overflow: 'hidden' }}>
                        {icon}
                        <Typography variant="h6" noWrap>{title}</Typography>
                        <Chip label="Neu" size="small" variant={filterMode === 'new' ? 'filled' : 'outlined'} color="primary" clickable onClick={() => setFilterMode(filterMode === 'new' ? 'all' : 'new')} avatar={<Avatar sx={{ width: 22, height: 22, fontSize: '0.75rem' }}>{counts.new}</Avatar>} />
                        <Chip label="Nicht gesehen" size="small" variant={filterMode === 'unread' ? 'filled' : 'outlined'} color="secondary" clickable onClick={() => setFilterMode(filterMode === 'unread' ? 'all' : 'unread')} avatar={<Avatar sx={{ width: 22, height: 22, fontSize: '0.75rem' }}>{counts.unread}</Avatar>} />
                    </Box>
                    <Box>
                        {user?.regions && user.regions.length > 0 && (
                            <TextField 
                                select 
                                value={selectedRegion?.id || ''} 
                                onChange={(e) => { 
                                    const regionId = e.target.value;
                                    const region = user?.regions?.find(r => r.id === regionId) || null; 
                                    setSelectedRegion(region); 
                                }} 
                                size="small" 
                                variant="outlined" 
                                sx={{ minWidth: 60, '& .MuiSelect-select': { paddingRight: '32px !important' } }}
                                SelectProps={{
                                    renderValue: (selectedId) => {
                                        const idAsString = selectedId as string;
                                        if (idAsString === '') {
                                            return <Tooltip title="Alle Regionen"><img src="https://flagcdn.com/w20/eu.png" width={20} alt="Alle Regionen" style={{ border: '1px solid #eee', verticalAlign: 'middle' }} /></Tooltip>;
                                        }
                                        const region = user?.regions?.find(r => r.id === idAsString);
                                        return <Tooltip title={region?.name}><img src={`https://flagcdn.com/w20/${region?.code.toLowerCase()}.png`} width={20} alt={region?.name} style={{ border: '1px solid #eee', verticalAlign: 'middle' }} /></Tooltip>;
                                    }
                                }}
                            >
                                <MenuItem value="">
                                    <Tooltip title="Alle Regionen" placement="right">
                                        <img src="https://flagcdn.com/w20/eu.png" width="20" alt="Alle Regionen" style={{ border: '1px solid #eee' }} />
                                    </Tooltip>
                                </MenuItem>
                                {user?.regions?.map((region) => (
                                    <MenuItem key={region.id} value={region.id}>
                                        <Tooltip title={region.name} placement="right">
                                            <img src={`https://flagcdn.com/w20/${region.code.toLowerCase()}.png`} width="20" alt={region.name} style={{ border: '1px solid #eee' }} />
                                        </Tooltip>
                                    </MenuItem>
                                ))}
                            </TextField>
                        )}
                    </Box>
                </Box>
            }
            widgetTitle={decodeHtmlEntities(title)}
            widgetTypeKey={widgetTypeKey || ''}
            widgetId={widgetId || ''}
            onDelete={onDelete}
            isRemovable={isRemovable}
            noPadding
        >
            {renderContent()}
        </WidgetPaper>
    );
};

export default VideoWidget;