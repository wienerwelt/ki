import React, { useState, useEffect, useCallback } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
    AppBar, Toolbar, Typography, Box, Drawer, List, ListItem, ListItemText,
    IconButton, Divider, Menu, MenuItem, Tooltip, Chip,
    useTheme, useMediaQuery, Dialog, DialogContent, DialogTitle,
    Avatar, Badge // ✅ NEU: Badge importiert
} from '@mui/material';

// Icons
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SettingsIcon from '@mui/icons-material/Settings';
import BusinessIcon from '@mui/icons-material/Business';
import WidgetsIcon from '@mui/icons-material/Widgets';
import SubscriptionsIcon from '@mui/icons-material/Subscriptions';
import GroupIcon from '@mui/icons-material/Group';
import DataObjectIcon from '@mui/icons-material/DataObject';
import PolicyIcon from '@mui/icons-material/Policy';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CategoryIcon from '@mui/icons-material/Category';
import TagIcon from '@mui/icons-material/Tag';
import MonitorIcon from '@mui/icons-material/Monitor';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import CampaignIcon from '@mui/icons-material/Campaign';
import StarsIcon from '@mui/icons-material/Stars';
import ScheduleIcon from '@mui/icons-material/Schedule';
import FeedbackIcon from '@mui/icons-material/Feedback';
import FolderIcon from '@mui/icons-material/Folder';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import LogoutIcon from '@mui/icons-material/Logout';
import SearchIcon from '@mui/icons-material/Search';
import ShoppingCartCheckoutIcon from '@mui/icons-material/ShoppingCartCheckout';
import PollIcon from '@mui/icons-material/Poll';
import TuneIcon from '@mui/icons-material/Tune';
import InsightsIcon from '@mui/icons-material/Insights';
import CloseIcon from '@mui/icons-material/Close';
import GavelIcon from '@mui/icons-material/Gavel';
import ForumIcon from '@mui/icons-material/Forum';
import NotificationsIcon from '@mui/icons-material/Notifications'; // ✅ NEU

import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import posthog from 'posthog-js';
import SessionTimer from '../components/SessionTimer';
import AdvertisementBanner from '../components/AdvertisementBanner';
import apiClient from '../apiClient';
import GlobalSearchBar from '../components/GlobalSearchBar';
import { useSnackbar } from '../context/SnackbarContext';
import ContributionHistoryModal from '../components/ContributionHistoryModal';
import DailyBriefingContent from './DailyBriefingContent';


interface DashboardLayoutProps {
    children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
    const { 
      user, 
      businessPartner, 
      logout, 
      triggerDashboardRefresh, 
      userTags, 
      refreshUserTags 
    } = useAuth();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { showSnackbar } = useSnackbar();
    
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [ad, setAd] = useState<{ id: string; content: string } | null>(null);
    const [isAdVisible, setIsAdVisible] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [historyModalOpen, setHistoryModalOpen] = useState(false);
    const [briefingOpen, setBriefingOpen] = useState(false);

    // ✅ NEU: Notification State
    const [notifAnchorEl, setNotifAnchorEl] = useState<null | HTMLElement>(null);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const token = localStorage.getItem('jwt_token');

    // --- Benachrichtigungen laden ---
    const fetchNotifications = useCallback(async () => {
        if (!user) return;
        try {
            const res = await apiClient.get('/api/notifications');
            setNotifications(res.data.items);
            setUnreadCount(res.data.unreadCount);
        } catch (e) { 
            console.error("Fehler beim Laden der Notifications", e); 
        }
    }, [user]);

    // Polling für Notifications (alle 60 Sekunden)
    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    // --- Advertisement ---
    const fetchAd = useCallback(async () => {
        try {
            const { data } = await apiClient.get('/api/data/active-advertisement');
            if (data && data.content) {
                setAd(data);
                setIsAdVisible(true);
            }
        } catch (error) {
            console.error('Error fetching advertisement:', error);
        }
    }, []);

    useEffect(() => {
        if (token) {
            fetchAd();
        }
    }, [token, user, fetchAd]);

    const handleCloseAd = async () => {
        setIsAdVisible(false);
    };

    // --- Menü Handler ---
    const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    // --- Notification Handler ---
    const handleNotifClick = (event: React.MouseEvent<HTMLElement>) => {
        setNotifAnchorEl(event.currentTarget);
    };

    const handleNotifClose = async () => {
        setNotifAnchorEl(null);
        // Beim Schließen markieren wir alles als gelesen, wenn es ungelesene gab
        if (unreadCount > 0) {
            try {
                await apiClient.put('/api/notifications/read', {});
                setUnreadCount(0);
                // Lokal als gelesen markieren für die UI
                setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            } catch (e) { console.error(e); }
        }
    };

    const handleNotifItemClick = (notif: any) => {
        handleNotifClose();
        // Typen prüfen
        if (['community_comment', 'community_like', 'community_mention'].includes(notif.type)) {
            navigate('/community'); 
        } else if (notif.type === 'file_upload') {
            navigate('/files');
        }
    };


    const handleProfile = () => {
        navigate('/profile');
        handleClose();
    };

    const toggleDrawer = (open: boolean) => (event: React.KeyboardEvent | React.MouseEvent) => {
        if (event.type === 'keydown' && ((event as React.KeyboardEvent).key === 'Tab' || (event as React.KeyboardEvent).key === 'Shift')) {
            return;
        }
        setDrawerOpen(open);
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
        posthog.capture('user_logged_out');
    };

    const handleRemoveTag = (tagToRemove: string) => async () => {
        if (user?.role === 'demo') return;
        try {
            await apiClient.delete(`/api/users/tags/${encodeURIComponent(tagToRemove)}`);
            showSnackbar(`Thema "${tagToRemove}" entfernt.`, 'info');
            refreshUserTags();
            triggerDashboardRefresh();
        } catch (err) {
            console.error("Fehler beim Entfernen des Tags:", err);
            showSnackbar('Fehler beim Entfernen des Themas.', 'error');
            refreshUserTags();
        }
    };
    
    const handleSearchOpen = () => {
        setSearchOpen(true);
    };

    const handleSearchClose = () => {
        setSearchOpen(false);
    };

    const handleBriefingOpen = () => {
        setBriefingOpen(true);
    };
    const handleBriefingClose = () => {
        setBriefingOpen(false);
    };

    const dashboardTitle = businessPartner?.dashboard_title || businessPartner?.name || 'Fleet KI-Dashboard';


    const drawerContent = (
        <Box
            sx={{ width: 250 }}
            role="presentation"
            onClick={toggleDrawer(false)}
            onKeyDown={toggleDrawer(false)}
        >
            <Toolbar />
            <Divider />
            <List>
                <ListItem button component={RouterLink} to="/dashboard"><DashboardIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.myDashboard')} /></ListItem>
                <ListItem button component={RouterLink} to="/community"><ForumIcon sx={{ mr: 2 }} /><ListItemText primary="Community" /></ListItem>
                <ListItem button component={RouterLink} to="/files"><FolderIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.fileDirectory')} /></ListItem>
                <ListItem button component={RouterLink} to="/trusted-sources"><FactCheckIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.trustedSources')} /></ListItem>
                <ListItem button component={RouterLink} to="/feedback"><FeedbackIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.feedbackAndIdeas')} /></ListItem>                
                <Divider sx={{ my: 1 }} />
                {user?.role === 'assistenz' && (
                   <>
                        <ListItem button component={RouterLink} to="/admin/users"><GroupIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.userManagement')} /></ListItem>
                        <ListItem button component={RouterLink} to="/admin/actions"><StarsIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.manageActions')} /></ListItem>
                        <ListItem button component={RouterLink} to="/admin/surveys"><PollIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.surveys')} /></ListItem>
                        <ListItem button component={RouterLink} to="/admin/community"><ForumIcon sx={{ mr: 2 }} /><ListItemText primary="Community Moderation" /></ListItem>
                        <Divider sx={{ my: 1 }} />
                   </>
                )}
                {user?.role === 'admin' && (
                    <>
                        <ListItem button component={RouterLink} to="/admin"><SettingsIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.adminArea')} /></ListItem>
                        <List component="div" disablePadding sx={{ pl: 4 }}>
                            <ListItem button component={RouterLink} to="/admin/business-partners"><BusinessIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.businessPartners')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/users"><GroupIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.users')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/widget-types"><WidgetsIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.widgetTypes')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/bp-widget-access"><SubscriptionsIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.subscriptions')} /></ListItem>
                            
                            <ListItem button component={RouterLink} to="/admin/legal-monitor"><GavelIcon sx={{ mr: 2 }} /><ListItemText primary="Monitor-Verwaltung" /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/funding"><ShoppingCartCheckoutIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.funding')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/actions"><StarsIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.manageActions')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/advertisements"><CampaignIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.advertising')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/surveys"><PollIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.surveys')} /></ListItem>
                            
                            <ListItem button component={RouterLink} to="/admin/community"><ForumIcon sx={{ mr: 2 }} /><ListItemText primary="Community Moderation" /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/events"><CalendarMonthIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.events')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/scraped-content"><DataObjectIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.scrapedContent')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/scraping-rules"><PolicyIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.scrapingRules')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/ai-content"><SmartToyIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.aiContent')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/ai-prompt-rules"><AutoAwesomeIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.aiPromptRules')} /></ListItem>
                            
                            <ListItem button component={RouterLink} to="/admin/categories"><CategoryIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.categories')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/tags"><TagIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.tags')} /></ListItem>

                            <ListItem button component={RouterLink} to="/admin/sources"><FactCheckIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.sourceManagement')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/cronjobs"><ScheduleIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.automatedTasks')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/statistics"><QueryStatsIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.statistics')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/monitor"><MonitorIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.activityMonitor')} /></ListItem>
                        </List>
                    </>
                )}
                <Divider sx={{ my: 1 }} />
                <ListItem button onClick={handleLogout}><LogoutIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.logout')} /></ListItem>
            </List>
        </Box>
    );

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: 'background.default' }}>
            <AppBar
                position="fixed"
                sx={{
                    zIndex: (theme) => theme.zIndex.drawer + 1,
                    color: businessPartner?.color_scheme?.primary_text_color || '#fff'
                }}
                color="primary"
            >
                {isAdVisible && ad && (<AdvertisementBanner content={ad.content} onClose={handleCloseAd} />)}
                <Toolbar>
                    <IconButton color="inherit" aria-label="open drawer" onClick={toggleDrawer(true)} edge="start" sx={{ mr: 2 }}><MenuIcon /></IconButton>
                    <RouterLink
                      to="/dashboard"
                      style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center' }}
                    >
                      {businessPartner?.logo_url && (
                    <Box
                      sx={{
                        height: 40,
                        maxWidth: 160,
                        mr: 2,
                        display: 'flex',
                        alignItems: 'center',
                        overflow: 'hidden',
                        lineHeight: 0,
                      }}
                    >
                      <Box
                        component="img"
                        src={businessPartner?.logo_url}
                        alt={businessPartner?.name ?? 'Logo'}
                        sx={{
                          height: '100%',
                          width: 'auto',
                          objectFit: 'contain',
                          display: 'block',
                        }}
                      />
                    </Box>
                      )}

                      <Typography variant="h6" noWrap component="div" sx={{ display: { xs: 'none', sm: 'block' } }}>
                        {dashboardTitle}
                      </Typography>
                    </RouterLink>

                    <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: isMobile ? 'flex-end' : 'center', alignItems: 'center', ml: { xs: 1, md: 3 }, mr: 2 }}>
                        {isMobile ? (
                            <>
                                <IconButton color="inherit" onClick={handleBriefingOpen}>
                                    <InsightsIcon />
                                </IconButton>
                                <IconButton color="inherit" onClick={handleSearchOpen}><SearchIcon /></IconButton>
                            </>
                        ) : (
                            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                <Box sx={{ flexGrow: 1, maxWidth: '50%' }}><GlobalSearchBar /></Box>
                                <Tooltip title="Tägliches Briefing anzeigen">
                                    <IconButton
                                        color="inherit"
                                        onClick={handleBriefingOpen}
                                        sx={{ ml: 2 }}
                                    >
                                        <InsightsIcon />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title={t('layout.tagsTooltip')}>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, ml: 2 }}>
                                    {userTags.map(tag => (
                                        <Chip
                                            key={tag}
                                            label={tag}
                                            onDelete={user?.role !== 'demo' ? handleRemoveTag(tag) : undefined}
                                            sx={{
                                                color: 'inherit',
                                                borderColor: 'inherit',
                                                '& .MuiChip-deleteIcon': {
                                                    color: 'inherit',
                                                    opacity: 0.7,
                                                    '&:hover': { opacity: 1 }
                                                }
                                            }}
                                            variant="outlined"
                                        />
                                    ))}
                                </Box>
                                </Tooltip>
                                <Tooltip title="Meine Themen im Profil bearbeiten">
                                    <IconButton
                                        component={RouterLink}
                                        to="/profile#my-tags"
                                        color="inherit"
                                        size="small"
                                        sx={{ ml: 1 }}
                                    >
                                        <TuneIcon />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        )}
                    </Box>
                    
                    <SessionTimer />
                    
                    {user && (
                        <div>
                            {!isMobile && (
                            <Tooltip title="Community-Punkte anzeigen">
                                <Chip
                                    icon={<StarsIcon sx={{ color: 'inherit !important' }} />}
                                    label={user.contribution_score ?? 0}
                                    sx={{ color: 'inherit', mr: 1, cursor: 'pointer' }}
                                    variant="outlined"
                                    onClick={() => setHistoryModalOpen(true)}
                                />
                            </Tooltip>
                            )}

                            {/* ✅ NEU: BENACHRICHTIGUNGEN (GLOCKE) */}
                            <IconButton color="inherit" onClick={handleNotifClick} sx={{ mr: 1 }}>
                                <Badge badgeContent={unreadCount} color="error">
                                    <NotificationsIcon />
                                </Badge>
                            </IconButton>

                            <Menu
                                anchorEl={notifAnchorEl}
                                open={Boolean(notifAnchorEl)}
                                onClose={handleNotifClose}
                                PaperProps={{ sx: { width: 320, maxHeight: 400 } }}
                                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                            >
                                <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                                    <Typography variant="subtitle1" fontWeight="bold">Benachrichtigungen</Typography>
                                </Box>
                                {notifications.length === 0 ? (
                                    <MenuItem disabled>Keine neuen Nachrichten</MenuItem>
                                ) : (
                                    notifications.map((n) => (
                                        <MenuItem 
                                            key={n.id} 
                                            onClick={() => handleNotifItemClick(n)}
                                            sx={{ 
                                                whiteSpace: 'normal', 
                                                bgcolor: n.is_read ? 'inherit' : 'action.hover',
                                                borderLeft: n.is_read ? 'none' : `4px solid ${theme.palette.primary.main}`,
                                                mb: 0.5
                                            }}
                                        >
                                            <Box>
                                                <Typography variant="subtitle2" fontWeight="bold">{n.title}</Typography>
                                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
                                                    {n.message}
                                                </Typography>
                                                <Typography variant="caption" color="text.disabled">
                                                    {new Date(n.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                </Typography>
                                            </Box>
                                        </MenuItem>
                                    ))
                                )}
                            </Menu>
                            {/* ----------------------------------- */}
                            
                            <IconButton 
                                size="large" 
                                edge="end" 
                                aria-label="account of current user" 
                                aria-controls="menu-appbar" 
                                aria-haspopup="true" 
                                onClick={handleMenu} 
                                color="inherit"
                            >
                                <Avatar
                                    src={user.profile_image_url || undefined}
                                    alt={user.first_name || user.username}
                                    sx={{ width: 32, height: 32 }}
                                >
                                    {user.first_name ? user.first_name.charAt(0).toUpperCase() : user.username.charAt(0).toUpperCase()}
                                </Avatar>
                            </IconButton>

                            <Menu
                                id="menu-appbar"
                                anchorEl={anchorEl}
                                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                                keepMounted
                                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                                open={Boolean(anchorEl)}
                                onClose={handleClose}
                            >
                                {isMobile && (
                                    <Box>
                                        <MenuItem disabled><StarsIcon sx={{ mr: 1.5, color: theme.palette.text.secondary }}/>{`Punkte: ${user.contribution_score ?? 0}`}</MenuItem>
                                        <Divider />
                                    </Box>
                                )}
                                <MenuItem onClick={handleProfile}>{t('layout.myProfile')} {user.role && `(${user.role})`}</MenuItem>
                                <MenuItem onClick={handleLogout}>{t('layout.logout')} </MenuItem>
                            </Menu>
                        </div>
                    )}
                </Toolbar>
            </AppBar>
            <Drawer
                variant="temporary"
                open={drawerOpen}
                onClose={toggleDrawer(false)}
                ModalProps={{ keepMounted: true }}
                sx={{ width: 250, flexShrink: 0, [`& .MuiDrawer-paper`]: { width: 250, boxSizing: 'border-box' } }}
            >
                {drawerContent}
            </Drawer>
            
            <Box 
                component="main" 
                sx={{ 
                    flexGrow: 1, 
                    p: { xs: 1, sm: 2, md: 3 }, 
                    width: `calc(100% - 250px)` 
                }}
            >
                <Toolbar />
                {children}
            </Box>

            <Dialog
                open={searchOpen}
                onClose={handleSearchClose}
                fullWidth
                maxWidth="md"
                fullScreen={isMobile}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    Suchen
                    <IconButton onClick={handleSearchClose}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 1 }}>
                        <GlobalSearchBar />
                    </Box>
                </DialogContent>
            </Dialog>

            <Dialog
                open={briefingOpen}
                onClose={handleBriefingClose}
                fullWidth
                maxWidth="md"
                fullScreen={isMobile}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    Tägliches Cockpit
                    <IconButton onClick={handleBriefingClose}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    <DailyBriefingContent />
                </DialogContent>
            </Dialog>

            <ContributionHistoryModal 
                open={historyModalOpen} 
                onClose={() => setHistoryModalOpen(false)} 
                currentUserScore={user?.contribution_score || 0}
            />            
        </Box>
    );
};

export default DashboardLayout;