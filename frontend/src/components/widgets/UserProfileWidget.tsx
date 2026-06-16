import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Button, Divider, Grid, Skeleton, Chip, useTheme, Tooltip, IconButton,
    Dialog, DialogTitle, DialogContent, alpha
} from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';
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
    Visibility as VisibilityIcon,
    Close as CloseIcon,
    Email as EmailIcon,
    Phone as PhoneIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

// Eigene Komponenten
import WidgetPaper from './WidgetPaper';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../apiClient';
import { BaseWidgetProps } from '../../types/dashboard.types';
import { UserAvatarWithStatus } from '../ProfileCard'; 

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
    const [qrOpen, setQrOpen] = useState(false);

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

    if (!user) return null;

    const publicProfileUrl = `${window.location.origin}/p/${user.id}`;
    
    // Robuster Name-Fallback
    const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Unbekanntes Mitglied';
    const orgName = (user as any).organization_name || businessPartner?.name;
    
    // HIER: Nutzt jetzt explizit created_at aus der Datenbank
    const activeSince = (user as any).created_at;

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
                    width: '100%',
                    background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                    position: 'relative'
                }}>
                    {businessPartner?.logo_url && (
                        <Box 
                            component="img" 
                            src={businessPartner.logo_url} 
                            sx={{ 
                                position: 'absolute', right: 15, top: 15, height: 32, maxWidth: 120,
                                objectFit: 'contain', bgcolor: 'rgba(255,255,255,0.9)', p: 0.5, borderRadius: 1
                            }} 
                        />
                    )}
                </Box>

                {/* 2. PROFIL BILD & HAUPTINFO */}
                <Box sx={{ px: 3, flexGrow: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-end', mt: -5 }}>
                        <Box sx={{ border: `4px solid ${theme.palette.background.paper}`, borderRadius: '50%', bgcolor: 'background.paper', position: 'relative', zIndex: 2 }}>
                            <UserAvatarWithStatus user={user as any} size={80} />
                        </Box>
                    </Box>

                    <Box sx={{ mt: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography variant="h6" fontWeight="bold" lineHeight={1.2}>
                                {displayName}
                            </Typography>
                            
                            <Tooltip title="Profil bearbeiten">
                                <IconButton size="small" onClick={() => navigate('/profile')} sx={{ bgcolor: alpha(theme.palette.primary.main, 0.1) }}>
                                    <EditIcon fontSize="small" color="primary" />
                                </IconButton>
                            </Tooltip>

                            {(user as any).linkedin_url && (
                                <Tooltip title="LinkedIn Profil öffnen">
                                    <IconButton 
                                        size="small"
                                        href={(user as any).linkedin_url} 
                                        target="_blank"
                                        sx={{ bgcolor: alpha(theme.palette.primary.main, 0.1) }}
                                    >
                                        <LinkedInIcon color="primary" fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            )}
                        </Box>

                        <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.5 }}>
                            {user.role === 'admin' ? 'Administrator' : (user.role === 'assistenz' ? 'Assistenz' : 'Mitglied')}
                            {orgName && ` • ${orgName}`}
                        </Typography>

                        <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            {user.email && (
                                <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <EmailIcon sx={{ fontSize: 16 }} /> {user.email}
                                </Typography>
                            )}
                            {(user as any).phone && (
                                <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <PhoneIcon sx={{ fontSize: 16 }} /> {(user as any).phone}
                                </Typography>
                            )}
                        </Box>

                        {(user as any).membership_level && (
                            <Chip 
                                icon={<VerifiedUserIcon fontSize="small" />} 
                                label={(user as any).membership_level} 
                                size="small" color="primary" variant="outlined" 
                                sx={{ mt: 1.5, height: 24, fontWeight: 'bold' }}
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
                                {(user as any).contribution_score || 0}
                            </Typography>
                        </Grid>

                        <Grid item xs={6}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', mb: 0.5 }}>
                                <EventIcon fontSize="small" />
                                <Typography variant="caption">Aktiv seit</Typography>
                            </Box>
                            <Typography variant="body2" fontWeight="medium">
                                {activeSince ? new Date(activeSince).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' }) : '-'}
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
                <Box sx={{ p: 2, mt: 3, borderTop: `1px solid ${theme.palette.divider}`, bgcolor: alpha(theme.palette.action.hover, 0.1) }}>
                    <Grid container spacing={1}>
                        <Grid item xs={6}>
                            <Button 
                                variant="outlined" 
                                startIcon={<QrCodeIcon />} 
                                fullWidth 
                                size="small"
                                onClick={() => setQrOpen(true)} 
                                sx={{ bgcolor: 'background.paper', boxShadow: 'none' }}
                            >
                                QR Code
                            </Button>
                        </Grid>
                        <Grid item xs={6}>
                            <Button 
                                variant="contained" 
                                startIcon={<VisibilityIcon />} 
                                fullWidth 
                                size="small"
                                href={publicProfileUrl} 
                                target="_blank"
                                sx={{ boxShadow: 'none' }}
                            >
                                Visitenkarte
                            </Button>
                        </Grid>
                    </Grid>
                </Box>
            </Box>

            {/* QR-CODE DIALOG */}
            <Dialog open={qrOpen} onClose={() => setQrOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
                    <Typography variant="h6" fontWeight="bold">Kontakt teilen</Typography>
                    <IconButton onClick={() => setQrOpen(false)} size="small" sx={{ bgcolor: 'action.hover' }}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ textAlign: 'center', pb: 4, pt: 2 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Lassen Sie diesen Code scannen, um Ihre virtuelle Visitenkarte weiterzugeben.
                    </Typography>
                    
                    <Box sx={{ bgcolor: 'white', p: 2, display: 'inline-block', borderRadius: 2, border: `1px solid ${theme.palette.divider}`, boxShadow: theme.shadows[1] }}>
                        <QRCodeSVG 
                            value={publicProfileUrl} 
                            size={200}
                            level="H" 
                            fgColor={theme.palette.primary.main} 
                        />
                    </Box>
                </DialogContent>
            </Dialog>

        </WidgetPaper>
    );
};

export default UserProfileWidget;