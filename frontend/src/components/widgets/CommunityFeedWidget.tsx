import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, List, ListItemAvatar, Avatar, ListItemText,
    ListItemButton, Chip, Divider, Skeleton, Button, Badge, Tooltip
} from '@mui/material';
import ForumIcon from '@mui/icons-material/Forum';
import CommentIcon from '@mui/icons-material/Comment';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PollIcon from '@mui/icons-material/Poll';
import PushPinIcon from '@mui/icons-material/PushPin';
import ImageIcon from '@mui/icons-material/Image';

import WidgetPaper from './WidgetPaper'; 
import apiClient from '../../apiClient';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { BaseWidgetProps } from '../../types/dashboard.types';

interface CommunityPost {
    id: string;
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

// --- STATUS LOGIK ---
const getUserStatus = (lastLoginDate?: string) => {
    if (!lastLoginDate) return 'offline';
    const loginTime = new Date(lastLoginDate).getTime();
    const now = new Date().getTime();
    const diffMinutes = (now - loginTime) / (1000 * 60);
    
    if (diffMinutes < 15) return 'online'; 
    if (diffMinutes < 60 * 24) return 'active_today'; 
    return 'offline';
};

const CommunityFeedWidget: React.FC<BaseWidgetProps> = ({ widgetId, onDelete, isRemovable, title, widgetTypeKey }) => {
    const navigate = useNavigate();
    const [posts, setPosts] = useState<CommunityPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchLatestPosts = async () => {
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
    }, []);

    const handlePostClick = () => {
        navigate('/community');
    };

    return (
        <WidgetPaper
            widgetId={widgetId}
            onDelete={onDelete}
            isRemovable={isRemovable}
            widgetTitle={typeof title === 'string' ? title : 'Community Feed'}
            widgetTypeKey={widgetTypeKey || 'community_feed'}
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ForumIcon color="primary" />
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
                    <Button variant="outlined" size="small" onClick={handlePostClick}>
                        Ersten Beitrag erstellen
                    </Button>
                </Box>
            ) : (
                <>
                    <List disablePadding>
                        {posts.map((post, index) => {
                            // Status berechnen
                            const status = getUserStatus(post.last_login_at);
                            const statusColor = status === 'online' ? '#44b700' : '#ffa726';
                            const isInvisible = status === 'offline';
                            const statusTooltip = status === 'online' ? 'Online' : 'Heute aktiv';

                            // Icons ermitteln
                            const hasImage = !!post.image_url;
                            const hasPoll = post.poll_options && post.poll_options.length > 0;
                            const isPinned = post.is_pinned;

                            return (
                                <React.Fragment key={post.id}>
                                    <ListItemButton 
                                        onClick={handlePostClick} 
                                        alignItems="flex-start"
                                        sx={{ 
                                            bgcolor: isPinned ? 'action.hover' : 'transparent',
                                        }}
                                    >
                                        <ListItemAvatar>
                                            <Tooltip title={statusTooltip}>
                                                <Badge
                                                    overlap="circular"
                                                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                                                    variant="dot"
                                                    invisible={isInvisible}
                                                    sx={{
                                                        '& .MuiBadge-badge': {
                                                            backgroundColor: statusColor,
                                                            color: statusColor,
                                                            boxShadow: `0 0 0 2px white`,
                                                            '&::after': status === 'online' ? {
                                                                position: 'absolute',
                                                                top: 0,
                                                                left: 0,
                                                                width: '100%',
                                                                height: '100%',
                                                                borderRadius: '50%',
                                                                animation: 'ripple 1.2s infinite ease-in-out',
                                                                border: '1px solid currentColor',
                                                                content: '""',
                                                            } : {},
                                                        },
                                                        '@keyframes ripple': {
                                                            '0%': { transform: 'scale(.8)', opacity: 1 },
                                                            '100%': { transform: 'scale(2.4)', opacity: 0 },
                                                        },
                                                    }}
                                                >
                                                    <Avatar 
                                                        src={post.profile_image_url || undefined}
                                                        alt={post.first_name}
                                                        sx={{ width: 36, height: 36 }}
                                                    >
                                                        {post.first_name?.charAt(0)}
                                                    </Avatar>
                                                </Badge>
                                            </Tooltip>
                                        </ListItemAvatar>
                                        
                                        {/* --- HIER WURDE DER FIX ANGEWENDET --- */}
                                        <ListItemText
                                            // FIX: Verhindert, dass 'secondary' in ein <p> Tag gewrappt wird.
                                            // Stattdessen wird ein <div> verwendet, was das Nesting-Problem löst.
                                            secondaryTypographyProps={{ component: 'div' }}
                                            
                                            primary={
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                                    <Typography variant="subtitle2" component="span" fontWeight="bold" noWrap sx={{ maxWidth: '70%' }}>
                                                        {post.first_name} {post.last_name}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                                        {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: de })}
                                                    </Typography>
                                                </Box>
                                            }
                                            secondary={
                                                // Da ListItemText nun ein <div> erwartet, können wir hier normale Boxen verwenden
                                                <Box sx={{ mt: 0.5 }}>
                                                    <Typography
                                                        variant="body2"
                                                        color="text.primary"
                                                        // FIX: Auch hier sicherstellen, dass wir nicht p in p schachteln, falls nötig
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
                                                        
                                                        {isPinned && (
                                                            <Tooltip title="Angepinnt"><PushPinIcon sx={{ fontSize: 14, color: 'primary.main' }} /></Tooltip>
                                                        )}
                                                        {hasPoll && (
                                                            <Tooltip title="Umfrage"><PollIcon sx={{ fontSize: 14, color: 'info.main' }} /></Tooltip>
                                                        )}
                                                        {hasImage && (
                                                            <Tooltip title="Bild"><ImageIcon sx={{ fontSize: 14, color: 'action.active' }} /></Tooltip>
                                                        )}

                                                        {post.category_name && (
                                                            <Chip label={post.category_name} size="small" sx={{ height: 18, fontSize: '0.65rem' }} variant="outlined" />
                                                        )}
                                                        
                                                        <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                <ThumbUpIcon sx={{ fontSize: 12 }} /> {post.like_count}
                                                            </Box>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                <CommentIcon sx={{ fontSize: 12 }} /> {post.comment_count}
                                                            </Box>
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
                    <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider', textAlign: 'center' }}>
                        <Button 
                            size="small" 
                            endIcon={<ArrowForwardIcon />} 
                            onClick={handlePostClick}
                            fullWidth
                        >
                            Zur Community
                        </Button>
                    </Box>
                </>
            )}
        </WidgetPaper>
    );
};

export default CommunityFeedWidget;