import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Box, Typography, CircularProgress, Alert, Divider, Avatar,
    IconButton, Tooltip, Badge, Chip, Paper, Slider, TextField, MenuItem, Link as MuiLink, Button, Card, CardContent, Stack
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import DownloadIcon from '@mui/icons-material/Download';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ThumbDownOffAltIcon from '@mui/icons-material/ThumbDownOffAlt';
import CloseIcon from '@mui/icons-material/Close';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps, Region } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';


// --- Interfaces ---
interface PodcastItem {
    id: string;
    title: string;
    is_read: boolean;
    published_date: string;
    original_url: string;
    relevance_score: number;
    user_vote: number;
    is_trusted_source: boolean;
}

interface PodcastWidgetProps extends BaseWidgetProps {
    icon?: React.ReactNode;
    title: string;
    category: string;
}

// --- Hilfskomponenten ---
const getDomain = (url: string | null | undefined): string | null => {
    if (!url) return null;
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
        return null;
    }
};

const VoteComponent: React.FC<{ item: PodcastItem; onVote: (vote: 1 | -1) => void; size?: 'small' | 'medium' }> = ({ item, onVote, size = 'small' }) => {
    const getScoreColor = (score: number) => score > 0 ? 'success.main' : score < 0 ? 'error.main' : 'text.secondary';
    const handleVote = (e: React.MouseEvent, vote: 1 | -1) => {
        e.stopPropagation();
        onVote(vote);
    };
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


// --- Haupt-Widget-Komponente ---
const PodcastWidget: React.FC<PodcastWidgetProps> = ({ onDelete, widgetId, isRemovable, icon, title, category, widgetTypeKey }) => {
    const { user } = useAuth();
    const [items, setItems] = useState<PodcastItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [counts, setCounts] = useState({ unread: 0, new: 0 });
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);

    const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
    const [filterMode, setFilterMode] = useState<'all' | 'new' | 'unread'>('all');

    const [activeTrack, setActiveTrack] = useState<PodcastItem | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);

    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (user?.regions && user.regions.length > 0) {
            const defaultRegion = user.regions.find(r => !!r.is_default) || user.regions[0];
            setSelectedRegion(defaultRegion);
        } else {
            fetchData(1, null, 'all'); 
        }
    }, [user]);

    const fetchData = useCallback(async (currentPage: number, region: Region | null, filter: 'all' | 'new' | 'unread', loadMore = false) => {
        if (!category) {
            setError("Keine Kategorie im Widget-Typ konfiguriert.");
            setIsLoading(false);
            return;
        }
        
        if (loadMore) {
            setIsLoadingMore(true);
        } else {
            setIsLoading(true);
            setItems([]); // Liste leeren bei neuem Filter
        }
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
            if (filter !== 'all') {
                params.append('filter', filter);
            }

            const response = await apiClient.get(`/api/data/scraped-content?${params.toString()}`, { headers: { 'x-auth-token': token } });
            
            const validAudioExtensions = ['.mp3', '.m4a', '.aac', '.ogg', '.wav'];
            const validItems = response.data?.data.filter((item: PodcastItem) => {
                if (!item.original_url) return false;
                try {
                    const pathname = new URL(item.original_url).pathname.toLowerCase();
                    return validAudioExtensions.some(ext => pathname.endsWith(ext));
                } catch {
                    return item.original_url.toLowerCase().includes('proxy');
                }
            });

            setItems(prev => loadMore ? [...prev, ...validItems] : validItems);
            setCounts(response.data?.counts || { unread: 0, new: 0 });
            setTotalPages(response.data?.totalPages || 0);

        } catch (err: any) {
            setError(err.response?.data?.message || `Inhalte konnten nicht geladen werden.`);
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }
    }, [category]);

    useEffect(() => {
        setPage(1); // Reset page on filter change
        if (selectedRegion || (!user?.regions || user.regions.length === 0)) {
            fetchData(1, selectedRegion, filterMode);
        }
    }, [selectedRegion, filterMode, fetchData, user?.regions]);


    const handleLoadMore = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchData(nextPage, selectedRegion, filterMode, true);
    };

const handlePlayPause = (item: PodcastItem) => {
    if (activeTrack?.id === item.id) {
        // Bestehenden Track pausieren oder fortsetzen
        setIsPlaying(!isPlaying);
    } else {
        // Neuen Track starten
        setProgress(0); // Fortschritt für neuen Track zurücksetzen
        setDuration(0); // Dauer zurücksetzen
        setActiveTrack(item);
        setIsPlaying(true);
        if (!item.is_read) markAsRead(item.id);
    }
};
    
    const markAsRead = async (itemId: string) => {
         try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.post(`/api/data/scraped-content/${itemId}/mark-as-read`, {}, { headers: { 'x-auth-token': token } });
            setItems(prev => prev.map(n => n.id === itemId ? { ...n, is_read: true } : n));
            setCounts(prev => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
        } catch (err) { console.error("Fehler beim Markieren als gelesen:", err); }
    }

    const handleVote = async (contentId: string, vote: 1 | -1) => {
        const token = localStorage.getItem('jwt_token');
        const currentItem = items.find(item => item.id === contentId);
        if (!currentItem) return;

        const newVote = currentItem.user_vote === vote ? 0 : vote;
        try {
            const res = await apiClient.post(`/api/data/content/${contentId}/vote`, { vote: newVote, contentType: 'scraped_content' }, { headers: { 'x-auth-token': token } });
            const newScore = res.data.relevance_score;
            const updateItem = (item: PodcastItem) => item.id === contentId ? { ...item, relevance_score: newScore, user_vote: newVote } : item;
            setItems(prev => prev.map(updateItem));
            if (activeTrack?.id === contentId) setActiveTrack(prev => prev ? updateItem(prev) : null);
        } catch (err) { console.error("Fehler bei der Abstimmung:", err); }
    };

    const handleClosePlayer = () => {
    if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setActiveTrack(null);
    setProgress(0);
    setDuration(0);
};

    const formatTime = (time: number) => {
        if (isNaN(time) || time === Infinity) return '0:00';
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setProgress(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onCanPlay = () => {
        if (isPlaying) {
            audio.play().catch(e => console.error("Audio playback failed:", e));
        }
    };
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('ended', onEnded);

    return () => {
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('loadedmetadata', onLoadedMetadata);
        audio.removeEventListener('canplay', onCanPlay);
        audio.removeEventListener('ended', onEnded);
    };
}, [activeTrack]);

useEffect(() => {
    if (activeTrack) {
        if (isPlaying) {
            audioRef.current?.play().catch(e => console.error("Audio playback failed:", e));
        } else {
            audioRef.current?.pause();
        }
    }
}, [isPlaying, activeTrack]);
    
    const renderContent = () => {
        if (isLoading) {
            return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', p: 2 }}><CircularProgress /></Box>;
        }
        if (error) {
            return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
        }
        if (items.length === 0) {
            return <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>Keine Beiträge für Ihre Auswahl gefunden.</Typography>;
        }
        return (
            <Stack spacing={1.5} sx={{ p: 1.5 }}>
                {items.map((item) => (
                    <Card
                        key={item.id}
                        variant="outlined"
                        sx={{
                            bgcolor: activeTrack?.id === item.id ? 'action.selected' : 'background.default',
                            borderColor: activeTrack?.id === item.id ? 'primary.main' : 'divider',
                            transition: 'background-color 0.3s'
                        }}
                    >
                        <CardContent sx={{ p: '12px !important' }}>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <Tooltip title={isPlaying && activeTrack?.id === item.id ? "Pause" : "Abspielen"}>
                                    <IconButton onClick={() => handlePlayPause(item)} size="large" sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' } }}>
                                        {isPlaying && activeTrack?.id === item.id ? <PauseIcon /> : <PlayArrowIcon />}
                                    </IconButton>
                                </Tooltip>
                                <Box flexGrow={1}>
                                    <Typography variant="body2" sx={{ fontWeight: item.is_read ? 500 : 700, mb: 0.5 }}>
                                        {item.title}
                                    </Typography>
                                    <Stack direction="row" spacing={1.5} alignItems="center" color="text.secondary">
                                        <Typography variant="caption">
                                            {format(new Date(item.published_date), "d. MMM yyyy", { locale: de })}
                                        </Typography>
                                        <Divider orientation="vertical" flexItem />
                                         <MuiLink href={item.original_url} target="_blank" rel="noopener noreferrer" variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }} onClick={(e) => e.stopPropagation()}>
                                            {getDomain(item.original_url)}
                                            {item.is_trusted_source && <VerifiedUserIcon sx={{ fontSize: 14, color: 'success.main' }} />}
                                        </MuiLink>
                                    </Stack>
                                </Box>
                                <VoteComponent item={item} onVote={(vote) => handleVote(item.id, vote)} />
                            </Stack>
                        </CardContent>
                    </Card>
                ))}
                
                {page < totalPages && (
                    <Button onClick={handleLoadMore} disabled={isLoadingMore}>
                        {isLoadingMore ? <CircularProgress size={24} /> : 'Mehr laden'}
                    </Button>
                )}
            </Stack>
        );
    };

    return (
        <WidgetPaper
title={
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 1.5 }}>
        {/* Linke Gruppe: Titel und Filter */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, overflow: 'hidden' }}>
            {icon}
            <Typography variant="h6" noWrap>{title}</Typography>
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
    label="Nicht gehört"
    size="small"
    variant={filterMode === 'unread' ? 'filled' : 'outlined'}
    color="secondary"
    clickable
    onClick={() => setFilterMode(filterMode === 'unread' ? 'all' : 'unread')}
    avatar={<Avatar sx={{ width: 22, height: 22, fontSize: '0.75rem', bgcolor: 'secondary.main', color: 'secondary.contrastText' }}>{counts.unread}</Avatar>}
/>
        </Box>
        
        {/* Rechte Gruppe: Regionen-Auswahl */}
        <Box>
            {user?.regions && user.regions.length > 1 && (
                <TextField select value={selectedRegion?.id || ''} onChange={(e) => { const region = user?.regions?.find(r => r.id === e.target.value); setSelectedRegion(region || null); }} size="small" variant="outlined" sx={{ minWidth: 60, '& .MuiSelect-select': { paddingRight: '24px' } }}>
                    {user?.regions?.map((region) => <MenuItem key={region.id} value={region.id}><Tooltip title={region.name} placement="right"><img src={`https://flagcdn.com/w20/${region.code.toLowerCase()}.png`} width="20" alt={region.name} style={{ border: '1px solid #eee' }} /></Tooltip></MenuItem>)}
                </TextField>
            )}
        </Box>
    </Box>
}
            widgetTitle={title}
            widgetTypeKey={widgetTypeKey || ''}
            widgetId={widgetId || ''}
            onDelete={onDelete}
            isRemovable={isRemovable}
            noPadding
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                   {renderContent()}
                </Box>
{activeTrack && (
    <Paper sx={{ p: 2, borderTop: 1, borderColor: 'divider', mt: 'auto' }} elevation={4}>
        <audio ref={audioRef} src={activeTrack.original_url} preload="metadata" />
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography variant="subtitle2" noWrap sx={{ fontWeight: 'bold' }}>{activeTrack.title}</Typography>
            <IconButton onClick={handleClosePlayer} size="small" aria-label="Player schließen">
                <CloseIcon fontSize="small" />
            </IconButton>
        </Stack>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
            <IconButton onClick={() => setIsPlaying(!isPlaying)} size="small" color="primary">
                {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
            </IconButton>
            <Typography variant="caption" sx={{ minWidth: 40 }}>{formatTime(progress)}</Typography>
            <Slider
                size="small"
                value={progress}
                max={duration || 100}
                onChange={(_, value) => {
                    if(audioRef.current) audioRef.current.currentTime = value as number;
                }}
                sx={{ flexGrow: 1 }}
            />
            <Typography variant="caption" sx={{ minWidth: 40 }}>{formatTime(duration)}</Typography>
        </Box>
    </Paper>
)}
            </Box>
        </WidgetPaper>
    );
};

export default PodcastWidget;