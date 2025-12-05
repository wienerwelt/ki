import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Avatar, Button, Divider, Grid, Skeleton, Chip, useTheme, Stack, Tooltip, IconButton
} from '@mui/material';
import {
    Event as EventIcon,
    EmojiEvents as EmojiEventsIcon,
    Forum as ForumIcon,
    Comment as CommentIcon,
    LinkedIn as LinkedInIcon,
    VerifiedUser as VerifiedUserIcon,
    Edit as EditIcon,
    QrCode as QrCodeIcon,
    Person as PersonIcon,
    Visibility as VisibilityIcon // Icon für "Wie werde ich gesehen"
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import WidgetPaper from './WidgetPaper';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../apiClient';
import { BaseWidgetProps } from '../../types/dashboard.types';

interface UserStats {
    post_count: number;
    comment_count: number;
    like_count: number;
}

const UserProfileWidget: React.FC<BaseWidgetProps> = ({ widgetId, onDelete, isRemovable, title, widgetTypeKey }) => {
    const { user, businessPartner } = useAuth();
    const navigate = useNavigate();
    const theme = useTheme();
    
    const [stats, setStats] = useState<UserStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await apiClient.get('/api/users/activities');
                const activities = res.data || [];
                
                const postCount = activities.filter((a: any) => a.type === 'COMMUNITY_POST').length;
                const commentCount = activities.filter((a: any) => a.type === 'COMMUNITY_COMMENT').length;
                
                setStats({
                    post_count: postCount,
                    comment_count: commentCount,
                    like_count: 0 
                });
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        if (user) fetchStats();
    }, [user]);

    const handleEditProfile = () => {
        navigate('/profile');
    };

    if (!user) return null;

    return (
        <WidgetPaper
            widgetId={widgetId}
            onDelete={onDelete}
            isRemovable={isRemovable}
            widgetTitle={typeof title === 'string' && title ? title : 'Mein Profil'}
            widgetTypeKey={widgetTypeKey || 'user_profile'}
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PersonIcon />
                    <Typography variant="h6">
                        {typeof title === 'string' && title ? title : 'Mein Profil'}
                    </Typography>
                </Box>
            } 
            loading={false}
            error={null}
            noPadding
        >
            <Box sx={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
                
                {/* 1. HEADER BANNER */}
                <Box sx={{ 
                    height: 80, 
                    background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                    position: 'relative'
                }}>
                    {/* KORREKTUR: Logo Anzeige repariert (kein Filter mehr, richtige Größe) */}
                    {businessPartner?.logo_url && (
                        <Box 
                            component="img" 
                            src={businessPartner.logo_url} 
                            sx={{ 
                                position: 'absolute', 
                                right: 15, 
                                top: 15, 
                                height: 32, // Etwas größer
                                maxWidth: 120,
                                objectFit: 'contain', // Verhindert Verzerren
                                // Filter entfernt, damit Originalfarben sichtbar sind
                                bgcolor: 'rgba(255,255,255,0.9)', // Optional: Weißer Hintergrund für Kontrast
                                p: 0.5,
                                borderRadius: 1
                            }} 
                        />
                    )}
                </Box>

                {/* 2. PROFIL BILD & HAUPTINFO */}
                <Box sx={{ px: 3, mt: -5, flexGrow: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <Avatar 
                            src={user.profile_image_url || undefined} 
                            sx={{ 
                                width: 80, height: 80, 
                                border: `4px solid ${theme.palette.background.paper}`,
                                boxShadow: theme.shadows[3],
                                fontSize: '2.5rem',
                                bgcolor: 'grey.300'
                            }}
                        >
                            {user.first_name ? user.first_name.charAt(0) : user.username.charAt(0)}
                        </Avatar>
                        
                        {/* Schnellzugriff Bearbeiten */}
                        <Tooltip title="Profil bearbeiten">
                            <IconButton size="small" onClick={handleEditProfile} sx={{ mb: 0.5, bgcolor: 'action.hover' }}>
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>

                    <Box sx={{ mt: 1.5 }}>
                        <Typography variant="h6" fontWeight="bold" lineHeight={1.2}>
                            {user.first_name} {user.last_name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                            {user.role === 'admin' ? 'Administrator' : (user.role === 'assistenz' ? 'Assistenz' : 'Mitglied')}
                            {user.organization_name && ` • ${user.organization_name}`}
                        </Typography>

                        {user.membership_level && (
                            <Chip 
                                icon={<VerifiedUserIcon fontSize="small" />} 
                                label={user.membership_level} 
                                size="small" 
                                color="primary" 
                                variant="outlined" 
                                sx={{ mt: 1, height: 24 }}
                            />
                        )}
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    {/* 3. STATISTIKEN GRID */}
                    <Grid container spacing={2}>
                        <Grid item xs={6}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', mb: 0.5 }}>
                                <EmojiEventsIcon fontSize="small" color="warning" />
                                <Typography variant="caption">Punkte</Typography>
                            </Box>
                            <Typography variant="h6" fontWeight="bold" color="text.primary">
                                {user.contribution_score || 0}
                            </Typography>
                        </Grid>

                        <Grid item xs={6}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', mb: 0.5 }}>
                                <EventIcon fontSize="small" />
                                <Typography variant="caption">Dabei seit</Typography>
                            </Box>
                            <Typography variant="body2" fontWeight="medium">
                                {(user as any).created_at ? new Date((user as any).created_at).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' }) : '-'}
                            </Typography>
                        </Grid>
                        
                        <Grid item xs={6}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', mb: 0.5 }}>
                                <ForumIcon fontSize="small" sx={{ fontSize: 16 }} />
                                <Typography variant="caption">Beiträge</Typography>
                            </Box>
                            <Typography variant="body2" fontWeight="bold">
                                {loading ? <Skeleton width={20} /> : (stats?.post_count || 0)}
                            </Typography>
                        </Grid>

                        <Grid item xs={6}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', mb: 0.5 }}>
                                <CommentIcon fontSize="small" sx={{ fontSize: 16 }} />
                                <Typography variant="caption">Kommentare</Typography>
                            </Box>
                            <Typography variant="body2" fontWeight="bold">
                                {loading ? <Skeleton width={20} /> : (stats?.comment_count || 0)}
                            </Typography>
                        </Grid>
                    </Grid>
                </Box>

                {/* 4. FOOTER ACTIONS */}
                <Box sx={{ p: 2, mt: 'auto', borderTop: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        {/* 1. Haupt-Button: Visitenkarte (Intern/QR) */}
                        <Button 
                            variant="outlined" 
                            startIcon={<QrCodeIcon />} 
                            fullWidth 
                            size="small"
                            onClick={() => navigate('/profile')} 
                            sx={{ bgcolor: 'background.paper', flexGrow: 1 }}
                        >
                            Visitenkarte
                        </Button>
                        
                        {/* 2. NEU: Icon-Button für öffentliche Vorschau ("Wie werde ich gesehen") */}
                        <Tooltip title="Öffentliche Ansicht (Vorschau)">
                            <IconButton 
                                size="small"
                                href={`/p/${user.id}`} // Link zur Public Card
                                target="_blank"
                                sx={{ 
                                    border: 1, 
                                    borderColor: 'divider', 
                                    bgcolor: 'background.paper', 
                                    borderRadius: 1 
                                }}
                            >
                                <VisibilityIcon color="action" />
                            </IconButton>
                        </Tooltip>

                        {/* 3. LinkedIn (falls vorhanden) */}
                        {user.linkedin_url && (
                            <Tooltip title="LinkedIn Profil öffnen">
                                <IconButton 
                                    size="small"
                                    href={user.linkedin_url} 
                                    target="_blank"
                                    sx={{ 
                                        border: 1, 
                                        borderColor: 'divider', 
                                        bgcolor: 'background.paper', 
                                        borderRadius: 1 
                                    }}
                                >
                                    <LinkedInIcon color="primary" />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Stack>
                </Box>
            </Box>
        </WidgetPaper>
    );
};

export default UserProfileWidget;