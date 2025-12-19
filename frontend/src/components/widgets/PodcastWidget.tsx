import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box, Typography, CircularProgress, Alert, Divider, Avatar,
  IconButton, Tooltip, Chip, Paper, Slider, MenuItem, Link as MuiLink, Button, Card, CardContent, Stack, Popover,
  FormControl, Select, SelectChangeEvent
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ThumbDownOffAltIcon from '@mui/icons-material/ThumbDownOffAlt'; 
import CloseIcon from '@mui/icons-material/Close';
import TuneIcon from '@mui/icons-material/Tune';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps, Region } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import { format, isValid } from 'date-fns';
import { de } from 'date-fns/locale';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

// --- Interfaces ---
interface PodcastItem {
  id: string;
  title: string;
  is_read: boolean;
  published_date: string;
  original_url: string;
  full_text: string | null;
  relevance_score: number;
  user_vote: number;
  is_trusted_source: boolean;
}

interface ActiveFilters {
  tags: string[];
}

interface PodcastWidgetProps extends BaseWidgetProps {
  icon?: React.ReactNode;
  title: string;
  category: string;
}

interface HighlightedTextProps {
    text: string;
    keywords: string[];
}

// HELPER: Flagge (aus EconomicStatWidget übernommen)
const Flag: React.FC<{ code?: string; alt?: string; size?: number }> = ({ code, alt, size = 20 }) => {
  if (!code) return null;
  const c = code.toUpperCase();
  if (c === 'EU') { 
      return ( <svg width={size} height={(size * 2) / 3} viewBox="0 0 12 8" xmlns="http://www.w3.org/2000/svg" aria-label={alt || 'EU'}><rect width="12" height="8" fill="#003399" />{Array.from({ length: 12 }).map((_, i) => { const angle = (i * 30 * Math.PI) / 180; const cx = 6 + Math.cos(angle) * 2.2; const cy = 4 + Math.sin(angle) * 2.2; return (<g key={i} transform={`translate(${cx},${cy})`}><polygon points="0,-0.6 0.17,-0.1 0.6,-0.1 0.26,0.16 0.39,0.6 0,0.35 -0.39,0.6 -0.26,0.16 -0.6,-0.1 -0.17,-0.1" fill="#FFCC00" /></g>);})}</svg> );
  }
  return <img loading="lazy" width={size} src={`https://flagcdn.com/w20/${c.toLowerCase()}.png`} alt={alt || c} />;
};

// HELPER: Sicheres Datumsformat mit date-fns
const safeFormat = (dateStr: string, fmt: string) => {
    const d = new Date(dateStr);
    return isValid(d) ? format(d, fmt, { locale: de }) : '';
};

// HELPER: Zähler-Formatierung (>10)
const formatCount = (count: number) => count > 10 ? ">10" : count;

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

const getDomain = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return null; }
};

const isDirectAudioUrl = (url: string): boolean => {
  if (!url) return false;
  const validAudioExtensions = ['.mp3', '.m4a', '.aac', '.ogg', '.wav'];
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return validAudioExtensions.some(ext => pathname.endsWith(ext));
  } catch {
    return false;
  }
};

const VoteComponent: React.FC<{ item: PodcastItem; onVote: (vote: 1 | -1) => void; size?: 'small' | 'medium' }>
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
  
  const [activeFilters, setActiveFilters] = useState<ActiveFilters | null>(null);

  const [activeTrack, setActiveTrack] = useState<PodcastItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement>(null);
  
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    if (user?.regions && user.regions.length > 0) {
      const defaultRegion = user.regions.find(r => !!r.is_default) || null;
      setSelectedRegion(defaultRegion);
    }
  }, [user]);

  const fetchData = useCallback(async (currentPage: number, region: Region | null, filter: 'all' | 'new' | 'unread', loadMore = false) => {
    if (!category) {
      setError('Keine Kategorie im Widget-Typ konfiguriert.');
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

      // 1. Content laden
      const response = await apiClient.get(`/api/data/scraped-content?${params.toString()}`, { headers: { 'x-auth-token': token } });
      const newItems: PodcastItem[] = response.data?.data || [];
      setItems(prev => loadMore ? [...prev, ...newItems] : newItems);
      setActiveFilters(response.data?.activeFilters || null);

    } catch (err: any) {
      setError(err.response?.data?.message || 'Inhalte konnten nicht geladen werden.');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
    
    // 2. Counts separat laden (Non-Blocking)
    try {
        const token = localStorage.getItem('jwt_token');
        
        const countParams = new URLSearchParams({
            category, 
            limit: '5', 
            sortBy: 'date', 
            region: region ? region.name : 'all'
        });
        if (filter !== 'all') {
            countParams.append('filter', filter);
        }
        
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

  const handlePlayPause = (item: PodcastItem) => {
    if (activeTrack?.id === item.id) {
      setIsPlaying(!isPlaying);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setProgress(0);
      setDuration(0);
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
      const updateItem = (item: PodcastItem) => item.id === contentId ? { ...item, relevance_score: newScore, user_vote: newVote } : item;
      setItems(prev => prev.map(updateItem));
      if (activeTrack?.id === contentId) setActiveTrack(prev => prev ? updateItem(prev) : null);
    } catch (err) { console.error('Fehler bei der Abstimmung:', err); }
  };

  const handleClosePlayer = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = ''; // Quelle leeren, um den Download zu stoppen
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
    const onCanPlay = () => { if (isPlaying) audio.play().catch(e => console.error('Audio playback failed:', e)); };
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
  }, [activeTrack, isPlaying]);

  useEffect(() => {
    if (!activeTrack) return;
    if (isPlaying) audioRef.current?.play().catch(e => console.error('Audio playback failed:', e));
    else audioRef.current?.pause();
  }, [isPlaying, activeTrack]);

  const renderContent = () => {
    if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', p: 2 }}><CircularProgress /></Box>;
    if (error) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
    
    if (items.length === 0) {
      if (activeFilters && activeFilters.tags && activeFilters.tags.length > 0) {
        return (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Keine Beiträge für Ihre Auswahl gefunden.
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Aktiver Filter: Tag '{activeFilters.tags.join(', ')}'
            </Typography>
          </Box>
        );
      } else {
        return (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
            Keine Beiträge für Ihre Auswahl gefunden.
          </Typography>
        );
      }
    }

    return (
      <Stack spacing={1.5} sx={{ p: 1.5 }}>
        {items.map((item) => {
          const isPlayable = isDirectAudioUrl(item.original_url);
          return (
            <Card key={item.id} variant="outlined" sx={{ bgcolor: activeTrack?.id === item.id ? 'action.selected' : 'background.default', borderColor: activeTrack?.id === item.id ? 'primary.main' : 'divider', transition: 'background-color 0.3s' }}>
              <CardContent sx={{ p: '12px !important' }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Tooltip title={!isPlayable ? "Keine direkte Audio-Datei" : (isPlaying && activeTrack?.id === item.id ? 'Pause' : 'Abspielen')}>
                    <span>
                      <IconButton
                        onClick={() => isPlayable && handlePlayPause(item)}
                        disabled={!isPlayable}
                        size="large"
                        sx={{
                          bgcolor: isPlayable ? 'primary.main' : 'action.disabledBackground',
                          color: 'primary.contrastText',
                          '&:hover': { bgcolor: isPlayable ? 'primary.dark' : 'action.disabledBackground' }
                        }}
                      >
                        {isPlaying && activeTrack?.id === item.id ? <PauseIcon /> : <PlayArrowIcon />}
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Box flexGrow={1}>
                      <Typography variant="body2" sx={{ fontWeight: item.is_read ? 500 : 700, mb: 0.5 }}>
                          <HighlightedText 
                              text={item.title} 
                              keywords={activeFilters?.tags || []} 
                          />
                      </Typography>
                      <Stack direction="row" spacing={1.5} alignItems="center" color="text.secondary">
                      <Typography variant="caption">{safeFormat(item.published_date, 'd. MMM yyyy')}</Typography>
                      <Divider orientation="vertical" flexItem />
                        <MuiLink href={item.original_url} target="_blank" rel="noopener noreferrer" variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }} onClick={(e) => e.stopPropagation()}>
                          {item.full_text ? item.full_text : getDomain(item.original_url)}
                          {item.is_trusted_source && <VerifiedUserIcon sx={{ fontSize: 14, color: 'success.main' }} />}
                        </MuiLink>
                    </Stack>
                  </Box>
                  <VoteComponent item={item} onVote={(vote) => handleVote(item.id, vote)} />
                </Stack>
              </CardContent>
            </Card>
          );
        })}
        {page < totalPages && (
          <Button onClick={handleLoadMore} disabled={isLoadingMore}>
            {isLoadingMore ? <CircularProgress size={24} /> : 'Mehr laden'}
          </Button>
        )}
      </Stack>
    );
  };

  // Header Title Component analog zu EconomicStatWidget
  const widgetTitleComponent = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
        {icon}
        <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>{title}</Typography>
        
        {/* Regionen Auswahl im neuen Stil (analog EconomicStatWidget) */}
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
      widgetTitle={title} widgetTypeKey={widgetTypeKey || ''} widgetId={widgetId || ''} onDelete={onDelete} isRemovable={isRemovable} noPadding
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: isMobile ? 'auto' : '100%' }}>
        
        {/* Filterbereich jetzt IM Inhalt (unter dem Header), analog zu den Toggles im EconomicStatWidget */}
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
                label="Nicht gehört" 
                size="small" 
                variant={filterMode === 'unread' ? 'filled' : 'outlined'} 
                color="secondary" 
                clickable 
                onClick={() => setFilterMode(filterMode === 'unread' ? 'all' : 'unread')} 
                avatar={<Avatar sx={{ width: 18, height: 18, fontSize: '0.7rem', bgcolor: 'secondary.dark', color: 'secondary.contrastText' }}>{formatCount(counts.unread)}</Avatar>} 
            />
        </Box>

        <Box sx={{ flexGrow: 1, overflowY: isMobile ? 'visible' : 'auto' }}>{renderContent()}</Box>
        
        {activeTrack && (<Paper sx={{ p: 2, borderTop: 1, borderColor: 'divider', mt: 'auto' }} elevation={4}><audio ref={audioRef} src={activeTrack.original_url} preload="metadata" /><Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}><Typography variant="subtitle2" noWrap sx={{ fontWeight: 'bold' }}>{activeTrack.title}</Typography><IconButton onClick={handleClosePlayer} size="small" aria-label="Player schließen"><CloseIcon fontSize="small" /></IconButton></Stack><Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}><IconButton onClick={() => setIsPlaying(!isPlaying)} size="small" color="primary">{isPlaying ? <PauseIcon /> : <PlayArrowIcon />}</IconButton><Typography variant="caption" sx={{ minWidth: 40 }}>{formatTime(progress)}</Typography><Slider size="small" value={progress} max={duration || 100} onChange={(_, value) => { if (audioRef.current) audioRef.current.currentTime = value as number; }} sx={{ flexGrow: 1 }} /><Typography variant="caption" sx={{ minWidth: 40 }}>{formatTime(duration)}</Typography></Box></Paper>)}
      </Box>
    </WidgetPaper>
  );
};
export default PodcastWidget;