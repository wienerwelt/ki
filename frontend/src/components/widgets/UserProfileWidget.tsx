import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Avatar, Button, Divider, Grid, Skeleton, Chip, useTheme, Stack, Tooltip, IconButton,
    Dialog, DialogTitle, DialogContent
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
    Close as CloseIcon // NEU
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
    
    // NEU: State für das QR-Code Modal
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

    // NEU: Die URL zusammenbauen, die im QR Code stecken soll
    const publicProfileUrl = `${window.location.origin}/p/${user.id}`;

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
                <Box sx={{ px: 3, mt: -5, flexGrow: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <Avatar 
                            src={user.profile_image_url || undefined} 
                            sx={{ 
                                width: 80, height: 80, border: `4px solid ${theme.palette.background.paper}`,
                                boxShadow: theme.shadows[3], fontSize: '2.5rem', bgcolor: 'grey.300',
                                color: 'text.primary', position: 'relative', zIndex: 2 
                            }}
                        >
                            {user.first_name ? user.first_name.charAt(0).toUpperCase() : user.username.charAt(0).toUpperCase()}
                        </Avatar>
                        
                        {/* Schnellzugriff Bearbeiten */}
                        <Tooltip title="Profil bearbeiten">
                            <IconButton size="small" onClick={() => navigate('/profile')} sx={{ mb: 0.5, bgcolor: 'action.hover' }}>
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
                                size="small" color="primary" variant="outlined" 
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
                        {/* HIER GEÄNDERT: Öffnet nun das QR-Code Modal! */}
                        <Button 
                            variant="outlined" 
                            startIcon={<QrCodeIcon />} 
                            fullWidth 
                            size="small"
                            onClick={() => setQrOpen(true)} 
                            sx={{ bgcolor: 'background.paper', flexGrow: 1 }}
                        >
                            Visitenkarte
                        </Button>
                        
                        <Tooltip title="Öffentliche Ansicht (Vorschau)">
                            <IconButton 
                                size="small"
                                href={`/p/${user.id}`} 
                                target="_blank"
                                sx={{ border: 1, borderColor: 'divider', bgcolor: 'background.paper', borderRadius: 1 }}
                            >
                                <VisibilityIcon color="action" />
                            </IconButton>
                        </Tooltip>

                        {user.linkedin_url && (
                            <Tooltip title="LinkedIn Profil öffnen">
                                <IconButton 
                                    size="small"
                                    href={user.linkedin_url} 
                                    target="_blank"
                                    sx={{ border: 1, borderColor: 'divider', bgcolor: 'background.paper', borderRadius: 1 }}
                                >
                                    <LinkedInIcon color="primary" />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Stack>
                </Box>
            </Box>

            {/* NEU: QR-CODE DIALOG */}
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
                    
                    <Box sx={{ bgcolor: 'white', p: 2, display: 'inline-block', borderRadius: 2, boxShadow: theme.shadows[2] }}>
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