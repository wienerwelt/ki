import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Typography,
    CircularProgress,
    Alert,
    Divider,
    Card,
    CardContent,
    List,
    ListItem,
    ListItemText,
    Chip,
    Avatar,
    IconButton,
    Stack,
    Tooltip,
    Link as MuiLink,
    Button
} from '@mui/material';
import { BusinessPartnerInfoWidgetProps as BaseWidgetProps } from '../../types/dashboard.types';
import WidgetPaper from './WidgetPaper';
import apiClient from '../../apiClient';

// Icons
import LanguageIcon from '@mui/icons-material/Language';
import EmailIcon from '@mui/icons-material/Email';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import DateRangeIcon from '@mui/icons-material/DateRange';
import PaletteIcon from '@mui/icons-material/Palette';
import GroupIcon from '@mui/icons-material/Group';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ThumbDownOffAltIcon from '@mui/icons-material/ThumbDownOffAlt';
import Groups3Icon from '@mui/icons-material/Groups3';

// --- Interfaces ---

// Lokale Definition der benötigten Typen, um Fehler zu beheben und die Komponente eigenständig zu machen.
interface Region {
    id: string;
    name: string;
    code: string;
    is_default?: boolean;
}

interface BusinessPartner {
    id: string;
    name: string;
    dashboard_title: string | null;
    address: string | null;
    email: string | null;
    logo_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    subscription_end_date: string | null;
    url_businesspartner: string | null;
    level_1_name: string | null;
    level_2_name: string | null;
    level_3_name: string | null;
    regions: Region[];
}

// Props für das Widget mit dem korrekten Typ
interface BusinessPartnerInfoWidgetProps extends Omit<BaseWidgetProps, 'businessPartner'> {
    businessPartner: BusinessPartner;
}

interface ContentItem {
    id: string;
    title: string;
    summary: string | null;
    original_url: string;
    published_date?: string;
    event_date?: string;
    relevance_score: number;
    user_vote: number;
}
interface UserStats {
    active: number;
    inactive: number;
}

// --- Hilfskomponenten ---
const VoteComponent: React.FC<{ item: ContentItem; onVote: (vote: 1 | -1) => void; size?: 'small' | 'medium' }> = ({ item, onVote, size = 'small' }) => {
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
            // KORREKTUR: Der API-Endpunkt für User-Stats wurde korrigiert, um den 404-Fehler zu beheben.
            // Er zielt jetzt auf /api/data/... statt auf /api/admin/...
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
        const list = contentType === 'news' ? bpNews : bpEvents;
        const setList = contentType === 'news' ? setBpNews : setBpEvents;

        const currentItem = list.find(item => item.id === contentId);
        if (!currentItem) return;

        const newVote = currentItem.user_vote === vote ? 0 : vote;

        try {
            const res = await apiClient.post(`/api/data/content/${contentId}/vote`, { vote: newVote, contentType: 'scraped_content' }, { headers: { 'x-auth-token': token } });
            const newScore = res.data.relevance_score;
            const updateList = (items: ContentItem[]) => items.map(item =>
                item.id === contentId ? { ...item, relevance_score: newScore, user_vote: newVote } : item
            );
            setList(updateList);
        } catch (err) {
            console.error("Fehler bei der Abstimmung:", err);
        }
    };

    const getDisplayUrl = (url: string | null | undefined): string => {
        if (!url) return '';
        return url.replace(/^(https?:\/\/)?(www\.)?/, '');
    };

    const defaultRegion = businessPartner?.regions?.find(r => r.is_default);
    const memberLevels = [businessPartner?.level_1_name, businessPartner?.level_2_name, businessPartner?.level_3_name].filter(Boolean).join(', ');

    return (
        <WidgetPaper
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {/* ANPASSUNG: Titel verwendet jetzt immer 'name' */}
                    <Typography variant="h6">{businessPartner?.name || 'Business Partner'}</Typography>
                    {defaultRegion && (
                        <Tooltip title={`Standard Region: ${defaultRegion.name}`}>
                            <img src={`https://flagcdn.com/w20/${defaultRegion.code.toLowerCase()}.png`} width="30" alt={defaultRegion.name} style={{ border: '1px solid #eee', borderRadius: '2px' }} />
                        </Tooltip>
                    )}
                </Box>
            }
            widgetId={widgetId || ''}
            onDelete={onDelete}
            isRemovable={isRemovable}
            loading={loading}
            error={error}
            noPadding
        >
            {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><CircularProgress /></Box> :
             error ? <Alert severity="error" sx={{ m: 2 }}>{error}</Alert> :
             businessPartner && (
                 <Card variant="outlined" sx={{ height: '100%', border: 'none', display: 'flex', flexDirection: 'column' }}>
                    <CardContent sx={{ flexGrow: 1, overflowY: 'auto', pt: 2 }}>
                        <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', px: 2, mb: 2 }}>
                            {/* ANPASSUNG: Logo auf 80px vergrößert */}
                            <Avatar src={businessPartner.logo_url || undefined} sx={{ width: 80, height: 80, bgcolor: businessPartner.primary_color, mt: 0.5 }} variant="rounded">
                                {businessPartner.name.charAt(0)}
                            </Avatar>
                            <Stack spacing={0.5} sx={{ flexGrow: 1 }}>
                                {businessPartner.url_businesspartner && (
                                    <MuiLink href={businessPartner.url_businesspartner} target="_blank" rel="noopener noreferrer" variant="body2" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, wordBreak: 'break-all', textDecoration: 'none', color: 'text.primary' }}>
                                        <LanguageIcon color="action" fontSize="small" /> {getDisplayUrl(businessPartner.url_businesspartner)}
                                    </MuiLink>
                                )}
                                {businessPartner.email && (
                                    <MuiLink href={`mailto:${businessPartner.email}`} variant="body2" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, wordBreak: 'break-all', textDecoration: 'none', color: 'text.primary' }}>
                                        <EmailIcon color="action" fontSize="small" /> {businessPartner.email}
                                    </MuiLink>
                                )}
                                {businessPartner.address && (
                                    <Typography variant="body2" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                                        <LocationOnIcon color="action" fontSize="small" /> {businessPartner.address}
                                    </Typography>
                                )}
                            </Stack>
                        </Stack>
                        <Divider />

                        {loadingContent ? <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={24} /></Box> :
                         contentError ? <Alert severity="error" sx={{m: 2}}>{contentError}</Alert> : (
                            <>
                                <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, color: 'text.secondary', pl: 2 }}>Aktuelle Nachrichten</Typography>
                                <List dense>
                                    {bpNews.length > 0 ? bpNews.map((item, index) => (
                                        <React.Fragment key={item.id}>
                                            <ListItem
                                                button
                                                component="a"
                                                href={item.original_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <ListItemText
                                                    primary={<Typography variant="body2">{item.title}</Typography>}
                                                    secondaryTypographyProps={{ component: 'div' }}
                                                    secondary={
                                                        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
                                                            <Typography variant="caption" color="text.secondary">
                                                                {formatDate(item.published_date)}
                                                            </Typography>
                                                            <Box sx={{ flexGrow: 1 }} />
                                                            <VoteComponent item={item} onVote={(vote) => handleVote(item.id, vote, 'news')} />
                                                        </Box>
                                                    }
                                                />
                                            </ListItem>
                                            {index < bpNews.length - 1 && <Divider component="li" variant="inset" />}
                                        </React.Fragment>
                                    )) : <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>Keine Nachrichten gefunden.</Typography>}
                                </List>

                                <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, color: 'text.secondary', pl: 2 }}>Kommende Events</Typography>
                                <List dense>
                                    {bpEvents.length > 0 ? bpEvents.map((item, index) => (
                                        <React.Fragment key={item.id}>
                                            <ListItem
                                                secondaryAction={
                                                    <Button size="small" variant="outlined" href={item.original_url} target="_blank" onMouseDown={(e) => e.stopPropagation()}>Anmelden</Button>
                                                }
                                            >
                                                <ListItemText
                                                    primary={<Typography variant="body2">{item.title}</Typography>}
                                                    secondaryTypographyProps={{ component: 'div' }}
                                                    secondary={
                                                        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
                                                            <Typography variant="caption" color="text.secondary">
                                                                {formatDate(item.event_date)}
                                                            </Typography>
                                                        </Box>
                                                    }
                                                />
                                            </ListItem>
                                            {index < bpEvents.length - 1 && <Divider component="li" variant="inset" />}
                                        </React.Fragment>
                                    )) : <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>Keine Events gefunden.</Typography>}
                                </List>
                            </>
                         )}

                        <Box sx={{ p: 2, pt: 2 }}>
                            <Divider sx={{ mb: 2 }} />
                            <Box display="flex" alignItems="center" mb={1}>
                                <DateRangeIcon color="action" sx={{ mr: 1.5, fontSize: '1rem' }} />
                                <Typography variant="caption">
                                    Abo bis: {formatDate(businessPartner.subscription_end_date)}
                                </Typography>
                            </Box>
                            {userStats && (
                                <Box display="flex" alignItems="center" mb={1}>
                                    <GroupIcon color="action" sx={{ mr: 1.5, fontSize: '1rem' }} />
                                    <Typography variant="caption">
                                        Nutzer: <strong>{userStats.active}</strong> aktiv / <strong>{userStats.inactive}</strong> inaktiv
                                    </Typography>
                                </Box>
                            )}
                            {memberLevels && (
                                <Box display="flex" alignItems="center" mb={1}>
                                    <Groups3Icon color="action" sx={{ mr: 1.5, fontSize: '1rem' }} />
                                    <Typography variant="caption">
                                        Nutzergruppe: {memberLevels}
                                    </Typography>
                                </Box>
                            )}
                             <Box display="flex" alignItems="center">
                                <PaletteIcon color="action" sx={{ mr: 1.5, fontSize: '1rem' }} />
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
