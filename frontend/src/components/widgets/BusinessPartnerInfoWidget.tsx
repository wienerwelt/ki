import React, { useState, useEffect, useCallback } from 'react';
import { 
    Box, 
    Typography, 
    CircularProgress, 
    Alert, 
    Divider,
    Card,
    CardContent,
    CardHeader,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Chip,
    Avatar,
    IconButton,
    Stack,
    Button,
    Tooltip
} from '@mui/material';
import { BusinessPartnerInfoWidgetProps } from '../../types/dashboard.types';
import WidgetPaper from './WidgetPaper';
import apiClient from '../../apiClient';

// Icons
import LanguageIcon from '@mui/icons-material/Language';
import EventIcon from '@mui/icons-material/Event';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import DateRangeIcon from '@mui/icons-material/DateRange';
import PaletteIcon from '@mui/icons-material/Palette';
import GroupIcon from '@mui/icons-material/Group';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';

// Interfaces
interface ContentItem {
    id: string;
    title: string;
    original_url: string;
    published_date?: string;
    event_date?: string;
    relevance_score: number;
}
interface UserStats {
    active: number;
    inactive: number;
}

const BusinessPartnerInfoWidget: React.FC<BusinessPartnerInfoWidgetProps> = ({ businessPartner, loading, error, onDelete, widgetId, isRemovable }) => {
    const [bpNews, setBpNews] = useState<ContentItem[]>([]);
    const [bpEvents, setBpEvents] = useState<ContentItem[]>([]);
    const [userStats, setUserStats] = useState<UserStats | null>(null);
    const [loadingContent, setLoadingContent] = useState(false);
    const [contentError, setContentError] = useState<string | null>(null);
    const token = localStorage.getItem('jwt_token');

    const fetchWidgetData = useCallback(async () => {
        if (!businessPartner?.id || !token) return;
        setLoadingContent(true);
        setContentError(null);
        try {
            // KORREKTUR: API-Endpunkt für User-Statistiken geändert, um 403-Fehler zu vermeiden
            const [newsRes, eventsRes, statsRes] = await Promise.all([
                apiClient.get(`/api/data/bp-scraped-content?businessPartnerId=${businessPartner.id}&category=news`, { headers: { 'x-auth-token': token } }),
                apiClient.get(`/api/data/bp-scraped-content?businessPartnerId=${businessPartner.id}&category=events`, { headers: { 'x-auth-token': token } }),
                apiClient.get(`/api/data/user-stats/${businessPartner.id}`, { headers: { 'x-auth-token': token } })
            ]);
            setBpNews(newsRes.data?.data || []);
            setBpEvents(eventsRes.data?.data || []);
            setUserStats(statsRes.data);
        } catch (err: any) {
            setContentError(err.response?.data?.message || 'Fehler beim Laden der Widget-Inhalte.');
        } finally {
            setLoadingContent(false);
        }
    }, [businessPartner?.id, token]);

    useEffect(() => {
        if (businessPartner?.id) {
            fetchWidgetData();
        }
    }, [businessPartner?.id, fetchWidgetData]);
    
    const formatDate = (dateString: string | null | undefined) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return dateString;
        }
        return date.toLocaleDateString('de-AT');
    };
    
    const handleVote = async (contentId: string, vote: 1 | -1, contentType: 'news' | 'event') => {
        const token = localStorage.getItem('jwt_token');
        try {
            const res = await apiClient.post(`/api/data/vote/${contentId}`, { vote, contentType: 'scraped_content' }, { headers: { 'x-auth-token': token } });
            const newScore = res.data.relevance_score;

            const updateState = (prevItems: ContentItem[]) => prevItems.map(item => 
                item.id === contentId ? { ...item, relevance_score: newScore } : item
            );

            if (contentType === 'news') {
                setBpNews(updateState);
            } else {
                setBpEvents(updateState);
            }
        } catch (err) {
            console.error("Fehler bei der Abstimmung:", err);
        }
    };

    const VoteComponent: React.FC<{ item: ContentItem; contentType: 'news' | 'event' }> = ({ item, contentType }) => {
        const getScoreColor = (score: number) => {
            if (score > 0) return 'success.main';
            if (score < 0) return 'error.main';
            return 'text.secondary';
        };
        
        return (
            <Stack direction="row" alignItems="center" spacing={0}>
                <Tooltip title="Artikel hilfreich">
                    <IconButton aria-label="Upvote" size="small" onMouseDown={(e) => e.stopPropagation()} onClick={() => handleVote(item.id, 1, contentType)}
                        sx={{ '&:hover': { backgroundColor: 'success.light', color: 'success.dark' } }}
                    >
                        <ArrowDropUpIcon />
                    </IconButton>
                </Tooltip>
                <Typography variant="caption" sx={{ fontWeight: 'bold', color: getScoreColor(item.relevance_score), minWidth: 16, textAlign: 'center' }}>
                    {item.relevance_score}
                </Typography>
                <Tooltip title="Artikel nicht hilfreich">
                    <IconButton aria-label="Downvote" size="small" onMouseDown={(e) => e.stopPropagation()} onClick={() => handleVote(item.id, -1, contentType)}
                        sx={{ '&:hover': { backgroundColor: 'error.light', color: 'error.dark' } }}
                    >
                        <ArrowDropDownIcon />
                    </IconButton>
                </Tooltip>
            </Stack>
        );
    };

    return (
        // KORREKTUR: Fallback für widgetId hinzugefügt, um TypeScript-Fehler zu beheben
        <WidgetPaper title="Business Partner Cockpit" widgetId={widgetId || ''} onDelete={onDelete} isRemovable={isRemovable} loading={loading} error={error} noPadding>
            {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><CircularProgress /></Box> :
             error ? <Alert severity="error" sx={{ m: 2 }}>{error}</Alert> :
             businessPartner && (
                 <Card variant="outlined" sx={{ height: '100%', border: 'none', display: 'flex', flexDirection: 'column' }}>
                    <CardHeader
                        avatar={<Avatar sx={{ bgcolor: businessPartner.primary_color || 'primary.main' }}>{businessPartner.name.charAt(0)}</Avatar>}
                        title={businessPartner.name}
                        subheader="Aktuelle Informationen & Stammdaten"
                    />
                    <CardContent sx={{ flexGrow: 1, overflowY: 'auto', pt: 0 }}>
                        {loadingContent ? <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={24} /></Box> :
                         contentError ? <Alert severity="error">{contentError}</Alert> : (
                            <>
                                <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary', pl: 2 }}>Aktuelle Nachrichten</Typography>
                                <List dense>
                                    {bpNews.length > 0 ? bpNews.slice(0, 5).map(item => (
                                        <ListItem key={item.id} secondaryAction={<VoteComponent item={item} contentType="news" />}>
                                            <ListItemIcon sx={{ minWidth: 36 }}><LanguageIcon fontSize="small"/></ListItemIcon>
                                            <ListItemText
                                                primary={
                                                    <Box component="span">
                                                        <Typography
                                                            variant="body2"
                                                            component="a"
                                                            href={item.original_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            sx={{ mr: 1, textDecoration: 'none', color: 'text.primary', '&:hover': { textDecoration: 'underline' } }}
                                                        >
                                                            {item.title}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            ({formatDate(item.published_date)})
                                                        </Typography>
                                                    </Box>
                                                }
                                            />
                                        </ListItem>
                                    )) : <Typography variant="body2" color="text.secondary" sx={{ml: 2}}>Keine Nachrichten gefunden.</Typography>}
                                </List>
                                
                                <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, color: 'text.secondary', pl: 2 }}>Kommende Events</Typography>
                                <List dense>
                                    {bpEvents.length > 0 ? bpEvents.slice(0, 5).map(item => (
                                        <ListItem key={item.id}
                                            secondaryAction={
                                                <Stack direction="row" alignItems="center" spacing={1}>
                                                    <VoteComponent item={item} contentType="event" />
                                                    <Button 
                                                        variant="contained" 
                                                        size="small" 
                                                        href={item.original_url} 
                                                        target="_blank"
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        sx={{ py: 0.2, px: 1, fontSize: '0.75rem' }}
                                                    >
                                                        Anmelden
                                                    </Button>
                                                </Stack>
                                            }
                                        >
                                            <ListItemIcon sx={{ minWidth: 36 }}><EventIcon fontSize="small"/></ListItemIcon>
                                            <ListItemText
                                                primary={item.title}
                                                secondary={formatDate(item.event_date)}
                                            />
                                        </ListItem>
                                    )) : <Typography variant="body2" color="text.secondary" sx={{ml: 2}}>Keine Events gefunden.</Typography>}
                                </List>
                            </>
                         )}
                        
                        <Box sx={{ p: 2, pt: 2 }}>
                            <Divider sx={{ mb: 2 }} />
                            <Box display="flex" alignItems="center" mb={1}>
                                <LocationOnIcon color="action" sx={{ mr: 1.5 }}/>
                                <Typography variant="body2">{businessPartner.address}</Typography>
                            </Box>
                            <Box display="flex" alignItems="center" mb={1}>
                                <DateRangeIcon color="action" sx={{ mr: 1.5 }}/>
                                <Typography variant="body2">
                                    Abonnement aktiv bis: {formatDate(businessPartner.subscription_end_date)}
                                </Typography>
                            </Box>
                            {userStats && (
                                <Box display="flex" alignItems="center" mb={1}>
                                    <GroupIcon color="action" sx={{ mr: 1.5 }}/>
                                    <Typography variant="body2">
                                        Nutzer: <strong>{userStats.active}</strong> aktiv / <strong>{userStats.inactive}</strong> inaktiv
                                    </Typography>
                                </Box>
                            )}
                            <Box display="flex" alignItems="center">
                                <PaletteIcon color="action" sx={{ mr: 1.5 }} />
                                <Chip size="small" label="Primär" sx={{ bgcolor: businessPartner.primary_color, color: '#fff', mr: 1 }} />
                                <Chip size="small" label="Sekundär" sx={{ bgcolor: businessPartner.secondary_color, color: '#fff' }} />
                            </Box>
                        </Box>
                    </CardContent>
                 </Card>
             )
            }
        </WidgetPaper>
    );
};

export default BusinessPartnerInfoWidget;
