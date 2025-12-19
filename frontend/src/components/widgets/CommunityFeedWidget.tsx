import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, List, ListItemAvatar, Avatar, ListItemText,
    ListItemButton, Chip, Divider, Skeleton, Button, Badge, Tooltip,
    Dialog, IconButton, Grid, Paper, useTheme, useMediaQuery
} from '@mui/material';
import ForumIcon from '@mui/icons-material/Forum';
import CommentIcon from '@mui/icons-material/Comment';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PollIcon from '@mui/icons-material/Poll';
import PushPinIcon from '@mui/icons-material/PushPin';
import ImageIcon from '@mui/icons-material/Image';
import CloseIcon from '@mui/icons-material/Close';
import BusinessIcon from '@mui/icons-material/Business';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import StarsIcon from '@mui/icons-material/Stars';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

import WidgetPaper from './WidgetPaper'; 
import apiClient from '../../apiClient';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { BaseWidgetProps } from '../../types/dashboard.types';

interface CommunityFeedWidgetProps extends Partial<BaseWidgetProps> {
    widgetId: string;
    widgetTypeKey?: string;
    title?: string;
    isPublic?: boolean;
}

interface CommunityPost {
    id: string;
    user_id: string;
    content: string;
    first_name: string;
    last_name: string;
    profile_image_url: string | null;
    created_at: string;
    category_name?: string;
    like_count: number;
    comment_count: number;
    image_url?: string | null;
    is_pinned?: boolean;
    poll_options?: any[]; 
    last_login_at?: string;
}

// --- MOCK DATA ---
const MOCK_POSTS: CommunityPost[] = [
    {
        id: 'm1',
        user_id: 'u1',
        content: 'Hat jemand Erfahrung mit den neuen Förderanträgen für E-Ladesäulen in NÖ?',
        first_name: 'Julia',
        last_name: 'K.',
        profile_image_url: null,
        created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        like_count: 12,
        comment_count: 4,
        category_name: 'Förderungen',
        last_login_at: ''
    },
    {
        id: 'm2',
        user_id: 'u2',
        content: 'Unser Fuhrpark wird ab nächster Woche komplett auf digitale Fahrtenbücher umgestellt. Tipps zur Einführung?',
        first_name: 'Markus',
        last_name: 'W.',
        profile_image_url: null,
        created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
        like_count: 8,
        comment_count: 3,
        category_name: 'Fuhrpark',
        last_login_at: ''
    },
    {
        id: 'm3',
        user_id: 'u3',
        content: 'Wichtiges Update: Die CO2-Preisprognose für Q4 ist da.',
        first_name: 'Mobiliti',
        last_name: 'Team',
        profile_image_url: null,
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
        like_count: 25,
        comment_count: 0,
        is_pinned: true,
        category_name: 'News',
        last_login_at: ''
    }
];

// --- SUB-COMPONENT: USER PROFILE DIALOG ---
interface UserProfileDialogProps {
    open: boolean;
    onClose: () => void;
    user: { id: string; name: string; avatar: string | null } | null;
    isPublic: boolean;
}

const UserProfileDialog: React.FC<UserProfileDialogProps> = ({ open, onClose, user, isPublic }) => {
    const [loading, setLoading] = useState(true);
    const [details, setDetails] = useState<any>(null);

    useEffect(() => {
        if (open && user) {
            setLoading(true);
            setDetails(null); // Reset vor neuem Laden
            
            // MOCK LOGIK für Public Mode oder Demo
            if (isPublic || user.id.startsWith('u')) {
                setTimeout(() => {
                    setDetails({
                        joined_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 400).toISOString(), 
                        organization: 'Demo Firma GmbH',
                        score: Math.floor(Math.random() * 500) + 50
                    });
                    setLoading(false);
                }, 500);
            } else {
                // ECHTE API ANFRAGE
                apiClient.get(`/api/users/${user.id}/public-profile`)
                    .then(res => setDetails(res.data))
                    .catch(() => setDetails({ 
                        // Fallback Daten falls API noch nicht existiert
                        joined_at: new Date().toISOString(),
                        organization: 'Keine Angabe',
                        score: 0 
                    })) 
                    .finally(() => setLoading(false));
            }
        }
    }, [open, user, isPublic]);

    if (!user) return null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <Box sx={{ position: 'relative', p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
                    <CloseIcon />
                </IconButton>

                <Avatar 
                    src={user.avatar || undefined} 
                    sx={{ width: 80, height: 80, mb: 2, bgcolor: 'primary.main', fontSize: '2rem' }}
                >
                    {user.name.charAt(0)}
                </Avatar>

                <Typography variant="h6" fontWeight="bold" textAlign="center">{user.name}</Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>Community Mitglied</Typography>

                <Divider sx={{ width: '100%', my: 2 }} />

                {loading ? (
                    <Box sx={{ width: '100%' }}>
                        <Skeleton height={40} sx={{ mb: 1 }} />
                        <Skeleton height={40} sx={{ mb: 1 }} />
                        <Skeleton height={40} />
                    </Box>
                ) : (
                    <Grid container spacing={2} sx={{ width: '100%' }}>
                        <Grid item xs={12}>
                            <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <CalendarMonthIcon color="action" />
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Mitglied seit</Typography>
                                    <Typography variant="body2" fontWeight="medium">
                                        {details?.joined_at ? new Date(details.joined_at).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }) : 'Unbekannt'}
                                    </Typography>
                                </Box>
                            </Paper>
                        </Grid>
                        
                        <Grid item xs={12}>
                            <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <BusinessIcon color="action" />
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Organisation</Typography>
                                    <Typography variant="body2" fontWeight="medium">
                                        {details?.organization || 'Nicht öffentlich'}
                                    </Typography>
                                </Box>
                            </Paper>
                        </Grid>

                        <Grid item xs={12}>
                            <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <StarsIcon sx={{ color: 'orange' }} />
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Community Punkte</Typography>
                                    <Typography variant="body2" fontWeight="bold">
                                        {details?.score ?? 0}
                                    </Typography>
                                </Box>
                            </Paper>
                        </Grid>
                    </Grid>
                )}
            </Box>
        </Dialog>
    );
};


// --- HAUPTKOMPONENTE ---

const getUserStatus = (lastLoginDate?: string) => {
    if (!lastLoginDate) return 'offline';
    const loginTime = new Date(lastLoginDate).getTime();
    const now = new Date().getTime();
    const diffMinutes = (now - loginTime) / (1000 * 60);
    
    if (diffMinutes < 15) return 'online'; 
    if (diffMinutes < 60 * 24) return 'active_today'; 
    return 'offline';
};

const CommunityFeedWidget: React.FC<CommunityFeedWidgetProps> = ({ 
    widgetId, onDelete, isRemovable, title, widgetTypeKey, isPublic = false 
}) => {
    const navigate = useNavigate();
    const theme = useTheme();
    // NEU: Mobile Detection für Responsive Layout
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const [posts, setPosts] = useState<CommunityPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // State für Profil-Modal
    const [selectedUser, setSelectedUser] = useState<{ id: string; name: string; avatar: string | null } | null>(null);

    useEffect(() => {
        const fetchLatestPosts = async () => {
            setLoading(true);
            if (isPublic) {
                setPosts(MOCK_POSTS);
                setLoading(false);
                return;
            }
            try {
                const response = await apiClient.get('/api/community/feed?limit=5');
                setPosts(response.data);
            } catch (err) {
                console.error('Fehler beim Laden des Community-Widgets:', err);
                setError('Konnte Beiträge nicht laden.');
            } finally {
                setLoading(false);
            }
        };
        fetchLatestPosts();
    }, [isPublic]);

    const handlePostClick = () => {
        if (isPublic) return; 
        navigate('/community');
    };

    // Handler für Klick auf User (Avatar oder Name)
    const handleUserClick = (e: React.MouseEvent, post: CommunityPost) => {
        e.stopPropagation(); // WICHTIG: Verhindert Navigation zum Feed
        setSelectedUser({
            id: post.user_id,
            name: `${post.first_name} ${post.last_name}`,
            avatar: post.profile_image_url
        });
    };

    return (
        <WidgetPaper
            widgetId={widgetId}
            onDelete={onDelete}
            isRemovable={isRemovable}
            widgetTitle={typeof title === 'string' ? title : 'Community Feed'}
            widgetTypeKey={widgetTypeKey || 'community_feed'}
            isPublic={isPublic}
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ForumIcon color={isPublic ? 'action' : 'primary'} />
                    <Typography variant="h6">{title || 'Community Feed'}</Typography>
                </Box>
            }
            loading={false}
            error={error}
            noPadding
        >
            {loading ? (
                <Box sx={{ p: 2 }}>
                    {[1, 2, 3].map((i) => (
                        <Box key={i} sx={{ display: 'flex', gap: 2, mb: 2 }}>
                            <Skeleton variant="circular" width={40} height={40} />
                            <Box sx={{ flexGrow: 1 }}>
                                <Skeleton variant="text" width="60%" />
                                <Skeleton variant="text" width="90%" />
                            </Box>
                        </Box>
                    ))}
                </Box>
            ) : posts.length === 0 ? (
                <Box sx={{ p: 3, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <ForumIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
                    <Typography variant="body2" color="text.secondary">
                        Noch keine Beiträge vorhanden.
                    </Typography>
                    {!isPublic && (
                        <Button variant="outlined" size="small" onClick={handlePostClick}>
                            Ersten Beitrag erstellen
                        </Button>
                    )}
                </Box>
            ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', height: isMobile ? 'auto' : '100%' }}>
                    <Box sx={{ flexGrow: 1, overflowY: isMobile ? 'visible' : 'auto' }}>
                        <List disablePadding>
                            {posts.map((post, index) => {
                                const status = isPublic ? 'offline' : getUserStatus(post.last_login_at);
                                const statusColor = status === 'online' ? '#44b700' : '#ffa726';
                                const isInvisible = status === 'offline';
                                const statusTooltip = status === 'online' ? 'Online' : 'Heute aktiv';

                                const hasImage = !!post.image_url;
                                const hasPoll = post.poll_options && post.poll_options.length > 0;
                                const isPinned = post.is_pinned;

                                return (
                                    <React.Fragment key={post.id}>
                                        <ListItemButton 
                                            onClick={handlePostClick} 
                                            alignItems="flex-start"
                                            sx={{ 
                                                bgcolor: isPinned ? (isPublic ? 'transparent' : 'action.hover') : 'transparent',
                                                cursor: isPublic ? 'default' : 'pointer',
                                                '&:hover': isPublic ? { bgcolor: 'transparent' } : undefined
                                            }}
                                            disableRipple={isPublic}
                                        >
                                            {/* Avatar mit Klick-Handler */}
                                            <ListItemAvatar 
                                                onClick={(e) => handleUserClick(e, post)} 
                                                sx={{ cursor: 'pointer', zIndex: 2 }} // z-Index erhöht für Klickbarkeit
                                            >
                                                <Tooltip title={isPublic ? '' : statusTooltip}>
                                                    <Badge
                                                        overlap="circular"
                                                        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                                                        variant="dot"
                                                        invisible={isInvisible}
                                                        sx={{
                                                            '& .MuiBadge-badge': {
                                                                backgroundColor: statusColor,
                                                                color: statusColor,
                                                                boxShadow: `0 0 0 2px white`
                                                            }
                                                        }}
                                                    >
                                                        <Avatar 
                                                            src={post.profile_image_url || undefined}
                                                            alt={post.first_name}
                                                            sx={{ width: 36, height: 36, '&:hover': { opacity: 0.8 } }}
                                                        >
                                                            {post.first_name?.charAt(0)}
                                                        </Avatar>
                                                    </Badge>
                                                </Tooltip>
                                            </ListItemAvatar>
                                            
                                            <ListItemText
                                                secondaryTypographyProps={{ component: 'div' }}
                                                primary={
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                                        {/* Name mit Klick-Handler und Hover-Effekt */}
                                                        <Box 
                                                            sx={{ 
                                                                display: 'flex', 
                                                                alignItems: 'center', 
                                                                cursor: 'pointer',
                                                                maxWidth: '70%',
                                                                '&:hover .user-name': { textDecoration: 'underline' },
                                                                '&:hover .info-icon': { opacity: 1 }
                                                            }}
                                                            onClick={(e) => handleUserClick(e, post)}
                                                        >
                                                            <Typography 
                                                                variant="subtitle2" 
                                                                component="span" 
                                                                fontWeight="bold" 
                                                                noWrap 
                                                                className="user-name"
                                                            >
                                                                {post.first_name} {post.last_name}
                                                            </Typography>
                                                            <InfoOutlinedIcon 
                                                                className="info-icon"
                                                                sx={{ fontSize: 14, ml: 0.5, opacity: 0, transition: 'opacity 0.2s', color: 'text.secondary' }} 
                                                            />
                                                        </Box>

                                                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                                            {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: de })}
                                                        </Typography>
                                                    </Box>
                                                }
                                                secondary={
                                                    <Box sx={{ mt: 0.5 }}>
                                                        <Typography
                                                            variant="body2"
                                                            color="text.primary"
                                                            component="div" 
                                                            sx={{
                                                                display: '-webkit-box',
                                                                overflow: 'hidden',
                                                                WebkitBoxOrient: 'vertical',
                                                                WebkitLineClamp: 2,
                                                                mb: 1,
                                                                fontSize: '0.85rem',
                                                                fontStyle: (!post.content && (hasImage || hasPoll)) ? 'italic' : 'normal'
                                                            }}
                                                        >
                                                            {post.content || (hasImage ? '📷 Bild geteilt' : (hasPoll ? '📊 Umfrage gestartet' : '...'))}
                                                        </Typography>
                                                        
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontSize: '0.75rem', color: 'text.secondary', flexWrap: 'wrap' }}>
                                                            {isPinned && <Tooltip title="Angepinnt"><PushPinIcon sx={{ fontSize: 14, color: 'primary.main' }} /></Tooltip>}
                                                            {hasPoll && <Tooltip title="Umfrage"><PollIcon sx={{ fontSize: 14, color: 'info.main' }} /></Tooltip>}
                                                            {hasImage && <Tooltip title="Bild"><ImageIcon sx={{ fontSize: 14, color: 'action.active' }} /></Tooltip>}
                                                            {post.category_name && <Chip label={post.category_name} size="small" sx={{ height: 18, fontSize: '0.65rem' }} variant="outlined" />}
                                                            <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><ThumbUpIcon sx={{ fontSize: 12 }} /> {post.like_count}</Box>
                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><CommentIcon sx={{ fontSize: 12 }} /> {post.comment_count}</Box>
                                                            </Box>
                                                        </Box>
                                                    </Box>
                                                }
                                            />
                                        </ListItemButton>
                                        {index < posts.length - 1 && <Divider variant="inset" component="li" />}
                                    </React.Fragment>
                                );
                            })}
                        </List>
                    </Box>
                    
                    {!isPublic && (
                        <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider', textAlign: 'center' }}>
                            <Button size="small" endIcon={<ArrowForwardIcon />} onClick={handlePostClick} fullWidth>
                                Zur Community
                            </Button>
                        </Box>
                    )}
                </Box>
            )}

            {/* Profil Modal einbinden */}
            <UserProfileDialog 
                open={!!selectedUser} 
                onClose={() => setSelectedUser(null)} 
                user={selectedUser}
                isPublic={!!isPublic} 
            />
        </WidgetPaper>
    );
};

export default CommunityFeedWidget;