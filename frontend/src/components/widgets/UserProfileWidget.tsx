import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Avatar, Button, Divider, Grid, Skeleton, Chip, useTheme
} from '@mui/material';
import {
    Event as EventIcon,
    Stars as StarsIcon,
    Forum as ForumIcon,
    ThumbUp as ThumbUpIcon,
    LinkedIn as LinkedInIcon,
    VerifiedUser as VerifiedUserIcon,
    Edit as EditIcon
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
                const activities = res.data;
                
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
        fetchStats();
    }, []);

    const handleEditProfile = () => {
        navigate('/profile');
    };

    if (!user) return null;

    return (
        <WidgetPaper
            widgetId={widgetId}
            onDelete={onDelete}
            isRemovable={isRemovable}
            widgetTitle={typeof title === 'string' ? title : 'Mein Profil'}
            widgetTypeKey={widgetTypeKey || 'user_profile'}
            // KORREKTUR: Titel wird jetzt übergeben statt ausgeblendet (<></>)
            title={
                <Typography variant="h6">
                    {typeof title === 'string' && title ? title : 'Mein Profil'}
                </Typography>
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
                    {businessPartner?.logo_url && (
                        <Box 
                            component="img" 
                            src={businessPartner.logo_url} 
                            sx={{ 
                                position: 'absolute', right: 10, top: 10, height: 30, 
                                opacity: 0.3, filter: 'grayscale(100%) brightness(200%)' 
                            }} 
                        />
                    )}
                </Box>

                {/* 2. PROFIL BILD & INFO */}
                <Box sx={{ px: 3, mt: -5, flexGrow: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <Avatar 
                            src={user.profile_image_url || undefined} 
                            sx={{ 
                                width: 80, height: 80, 
                                border: `4px solid ${theme.palette.background.paper}`,
                                boxShadow: theme.shadows[2],
                                fontSize: '2rem'
                            }}
                        >
                            {user.first_name?.charAt(0)}
                        </Avatar>
                        <Button 
                            size="small" 
                            startIcon={<EditIcon />} 
                            onClick={handleEditProfile}
                            sx={{ mb: 1 }}
                        >
                            Bearbeiten
                        </Button>
                    </Box>

                    <Box sx={{ mt: 1 }}>
                        <Typography variant="h6" fontWeight="bold">
                            {user.first_name} {user.last_name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {user.role === 'admin' ? 'Administrator' : (user.role === 'assistenz' ? 'Assistenz' : 'Mitglied')}
                            {user.organization_name && ` bei ${user.organization_name}`}
                        </Typography>

                        {user.membership_level && (
                            <Chip 
                                icon={<VerifiedUserIcon fontSize="small" />} 
                                label={user.membership_level} 
                                size="small" 
                                color="secondary" 
                                variant="outlined" 
                                sx={{ mt: 1 }}
                            />
                        )}
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    {/* 3. STATISTIKEN GRID */}
                    <Grid container spacing={2}>
                        <Grid item xs={6}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', mb: 1 }}>
                                <StarsIcon fontSize="small" color="warning" />
                                <Typography variant="caption">Score</Typography>
                            </Box>
                            <Typography variant="h6" fontWeight="bold">{user.contribution_score || 0}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', mb: 1 }}>
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
                                <ThumbUpIcon fontSize="small" sx={{ fontSize: 16 }} />
                                <Typography variant="caption">Hilfreich</Typography>
                            </Box>
                            <Typography variant="body2" fontWeight="bold">
                                {loading ? <Skeleton width={20} /> : (stats?.comment_count || 0)}
                            </Typography>
                        </Grid>
                    </Grid>
                </Box>

                {/* 4. FOOTER */}
                {user.linkedin_url && (
                    <Box sx={{ p: 2, mt: 'auto', borderTop: 1, borderColor: 'divider' }}>
                         <Button 
                            variant="outlined" 
                            startIcon={<LinkedInIcon />} 
                            fullWidth 
                            size="small"
                            href={user.linkedin_url} 
                            target="_blank"
                        >
                            LinkedIn Profil
                        </Button>
                    </Box>
                )}
            </Box>
        </WidgetPaper>
    );
};

export default UserProfileWidget;