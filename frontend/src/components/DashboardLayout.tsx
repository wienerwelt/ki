// frontend/src/components/DashboardLayout.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
    AppBar, Toolbar, Typography, Box, Drawer, List, ListItem, ListItemText,
    ListItemIcon, IconButton, Divider, Menu, MenuItem, Tooltip, Chip, Switch,
    useTheme, useMediaQuery, Dialog, DialogContent, DialogTitle,
    Avatar, Badge, Collapse, Button, ListSubheader
} from '@mui/material';

import { alpha, keyframes } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import EmailIcon from '@mui/icons-material/Email';
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
import InsightsIcon from '@mui/icons-material/Insights';
import CloseIcon from '@mui/icons-material/Close';
import GavelIcon from '@mui/icons-material/Gavel';
import ForumIcon from '@mui/icons-material/Forum';
import NotificationsIcon from '@mui/icons-material/Notifications';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import ShareIcon from '@mui/icons-material/Share';
import StorefrontIcon from '@mui/icons-material/Storefront';

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
import OnboardingFlow from '../components/OnboardingFlow';
import { AiChatWidget } from './AiChatWidget';

interface DashboardLayoutProps {
    children: React.ReactNode;
}

const pulseAnimation = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(211, 47, 47, 0.7); }
  70% { box-shadow: 0 0 0 8px rgba(211, 47, 47, 0); }
  100% { box-shadow: 0 0 0 0 rgba(211, 47, 47, 0); }
`;

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
    const { 
      user, 
      businessPartner, 
      logout, 
      updateUser,
      triggerDashboardRefresh
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
    const [notifications, setNotifications] = useState<any[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [desktopSearchExpanded, setDesktopSearchExpanded] = useState(false);
    const [notifExpandedInMenu, setNotifExpandedInMenu] = useState(false);
    const [dashboardHeaderActions, setDashboardHeaderActions] = useState<React.ReactNode | null>(null);
    
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const token = 'cookie-session';
    
    const [isSubscribed, setIsSubscribed] = useState(!!user?.newsletter_opt_in && !!user?.briefing_email_enabled);
    const isNewsletterAllowed = businessPartner?.allow_automated_newsletter !== false
        && businessPartner?.newsletter_delivery_mode === 'mobiliti'
        && businessPartner?.newsletter_frequency !== 'never';
    const effectiveSubscription = isNewsletterAllowed && isSubscribed;

    const [menuBadges, setMenuBadges] = useState({
        community: 0,
        files: 0,
        directory: 0,
        sources: 0,
        scraped: 0,
        ai: 0,
        actions: 0
    });

    const fetchMenuBadges = useCallback(async () => {
        if (!user) return;
        try {
            const res = await apiClient.get('/api/data/notification-counts'); 
            if (res.data && res.data.menuCounts) {
                setMenuBadges(res.data.menuCounts);
            }
        } catch (e: any) {
            if (e.name === 'AbortError' || e.name === 'CanceledError' || e.code === 'ERR_CANCELED') return;
            console.error("Fehler beim Laden der Menü-Badges", e);
        }
    }, [user]);

    useEffect(() => {
        fetchMenuBadges();
        const badgeInterval = setInterval(fetchMenuBadges, 60000);
        return () => clearInterval(badgeInterval);
    }, [fetchMenuBadges]);

    useEffect(() => {
        setIsSubscribed(!!user?.newsletter_opt_in && !!user?.briefing_email_enabled);
    }, [user?.newsletter_opt_in, user?.briefing_email_enabled]);

    useEffect(() => {
        const handleHeaderActionsChange = (event: Event) => {
            const customEvent = event as CustomEvent<{ actions?: React.ReactNode | null }>;
            setDashboardHeaderActions(customEvent.detail?.actions || null);
        };

        const clearHeaderActions = () => setDashboardHeaderActions(null);

        window.addEventListener('dashboard-header-actions-change', handleHeaderActionsChange);
        window.addEventListener('dashboard-header-actions-clear', clearHeaderActions);

        return () => {
            window.removeEventListener('dashboard-header-actions-change', handleHeaderActionsChange);
            window.removeEventListener('dashboard-header-actions-clear', clearHeaderActions);
        };
    }, []);

    const handleNewsletterToggle = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isNewsletterAllowed) {
            showSnackbar('Ihr Unternehmen unterstützt derzeit keinen E-Mail-Versand.', 'warning');
            return;
        }
        const newValue = !isSubscribed;
        try {
            if (newValue) {
                const response = await apiClient.post('/api/auth/newsletter/opt-in', { email: user?.email, source: 'daily_cockpit' });
                if (response.data?.alreadyConfirmed) {
                    setIsSubscribed(true);
                    updateUser({ newsletter_opt_in: true, briefing_email_enabled: true });
                    showSnackbar('E-Mail-Briefing aktiviert.', 'success');
                } else {
                    showSnackbar('Bitte bestätigen Sie die Anmeldung über die zugesandte E-Mail.', 'info');
                }
            } else {
                await apiClient.put('/api/users/me', { briefing_email_enabled: false });
                setIsSubscribed(false);
                updateUser({ briefing_email_enabled: false });
                showSnackbar('E-Mail-Briefing deaktiviert.', 'success');
            }
        } catch {
            showSnackbar('Fehler beim Speichern der Einstellung.', 'error');
        }
    };

    const fetchNotifications = useCallback(async () => {
        if (!user) return;
        try {
            const res = await apiClient.get('/api/notifications');
            setNotifications(res.data.items);
            setUnreadCount(res.data.unreadCount);
        } catch (e: any) { 
            if (e.name === 'AbortError' || e.name === 'CanceledError' || e.code === 'ERR_CANCELED') return;
            console.error("Fehler beim Laden der Notifications", e); 
        }
    }, [user]);

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    const fetchAd = useCallback(async () => {
        try {
            const { data } = await apiClient.get('/api/data/active-advertisement');
            if (data && data.content && sessionStorage.getItem(`ad_closed_${data.id}`) !== 'true') {
                setAd(data);
                setIsAdVisible(true);
            }
        } catch (e: any) {
            if (e.name === 'AbortError' || e.name === 'CanceledError' || e.code === 'ERR_CANCELED') return;
            console.error('Error fetching advertisement:', e);
        }
    }, []);

    useEffect(() => {
        if (token) fetchAd();
    }, [token, user, fetchAd]);

    const handleCloseAd = async () => {
        setIsAdVisible(false);
        if (ad?.id) {
            sessionStorage.setItem(`ad_closed_${ad.id}`, 'true');
        }
    };

    const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
        setNotifExpandedInMenu(false);
    };
    
    const handleClose = () => setAnchorEl(null);

    const systemNotificationTypes = ['system_update_reload', 'system_update_info', 'system_update_admin'];
    const isSystemNotification = (notif: any) => systemNotificationTypes.includes(notif?.type);

    const markSingleNotificationRead = async (notificationId: string) => {
        try {
            await apiClient.put('/api/notifications/read', { notificationId });
            setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (e) {
            console.error('Fehler beim Markieren der Benachrichtigung:', e);
        }
    };

    const handleSystemUpdateRefresh = async (notif: any) => {
        if (notif?.id && !notif.is_read) {
            await markSingleNotificationRead(notif.id);
        }
        window.location.reload();
    };

    const handleNotifItemClick = (notif: any) => {
        if (isSystemNotification(notif)) return;

        handleClose();
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

    const handleLogout = async () => {
        posthog.capture('user_logged_out', {
            business_partner_id: businessPartner?.id || user?.business_partner_id || null,
            business_partner_name: businessPartner?.name || user?.business_partner_name || null,
            business_partner_slug: businessPartner?.slug || null,
        });
        const targetUrl = await logout();
        navigate(targetUrl, { 
          state: { 
            snackbarMessage: 'Sie wurden erfolgreich abgemeldet.',
            severity: 'success'
          } 
        });
    };
    
    const handleSearchOpen = () => setSearchOpen(true);
    const handleSearchClose = () => setSearchOpen(false);
    const handleBriefingOpen = () => setBriefingOpen(true);
    const handleBriefingClose = () => setBriefingOpen(false);

    const dashboardTitle = businessPartner?.dashboard_title || businessPartner?.name || 'KI-Dashboard';
    const showOnboarding = user && user.has_completed_onboarding === false && user.role !== 'demo';
    const adBannerHeight = isAdVisible && ad ? 40 : 0;

    const drawerContent = (
        <Box sx={{ width: 290 }} role="presentation" onClick={toggleDrawer(false)} onKeyDown={toggleDrawer(false)}>
            <Toolbar />
            {adBannerHeight > 0 && <Box sx={{ height: adBannerHeight }} />}
            <Divider />
            <List>
                <ListItem button component={RouterLink} to="/dashboard">
                    <ListItemIcon><DashboardIcon /></ListItemIcon>
                    <ListItemText primary={t('layout.myDashboard')} />
                </ListItem>
                
                <ListItem button component={RouterLink} to="/community">
                    <ListItemIcon>
                        <Badge badgeContent={menuBadges.community} color="error" max={99}>
                            <ForumIcon />
                        </Badge>
                    </ListItemIcon>
                    <ListItemText primary="Community" />
                </ListItem>

                <ListItem button component={RouterLink} to="/directory">
                    <ListItemIcon>
                        <Badge badgeContent={menuBadges.directory} color="error" max={99}>
                            <StorefrontIcon />
                        </Badge>
                    </ListItemIcon>
                    <ListItemText primary="Partner-Netzwerk" />
                </ListItem>

                <ListItem button component={RouterLink} to="/files">
                    <ListItemIcon>
                        <Badge badgeContent={menuBadges.files} color="error" max={99}>
                            <FolderIcon />
                        </Badge>
                    </ListItemIcon>
                    <ListItemText primary={t('layout.fileDirectory')} />
                </ListItem>

                <ListItem button component={RouterLink} to="/trusted-sources">
                    <ListItemIcon>
                        <Badge badgeContent={menuBadges.sources} color="error" max={99}>
                            <FactCheckIcon />
                        </Badge>
                    </ListItemIcon>
                    <ListItemText primary={t('layout.trustedSources')} />
                </ListItem>

                <ListItem button component={RouterLink} to="/feedback">
                    <ListItemIcon><FeedbackIcon /></ListItemIcon>
                    <ListItemText primary={t('layout.feedbackAndIdeas')} />
                </ListItem>                
                
                <Divider sx={{ my: 1 }} />
                
                {user?.role === 'assistenz' && (
                   <>
                        <ListItem button component={RouterLink} to="/admin/briefing-editorial"><ListItemIcon><HistoryEduIcon /></ListItemIcon><ListItemText primary="Briefing Redaktion" /></ListItem>
                        <ListItem button component={RouterLink} to="/admin/users"><ListItemIcon><GroupIcon /></ListItemIcon><ListItemText primary={t('layout.userManagement')} /></ListItem>
                        <ListItem button component={RouterLink} to="/admin/actions">
                            <ListItemIcon>
                                <Badge badgeContent={menuBadges.actions} color="primary" max={99}>
                                    <StarsIcon />
                                </Badge>
                            </ListItemIcon>
                            <ListItemText primary="Actions & Software" />
                        </ListItem>
                        <ListItem button component={RouterLink} to="/admin/surveys"><ListItemIcon><PollIcon /></ListItemIcon><ListItemText primary={t('layout.surveys')} /></ListItem>
                        <ListItem button component={RouterLink} to="/admin/community"><ListItemIcon><ForumIcon /></ListItemIcon><ListItemText primary="Community Moderation" /></ListItem>
                        <Divider sx={{ my: 1 }} />
                   </>
                )}
                
                {user?.role === 'admin' && (
                    <>
                        <ListItem button component={RouterLink} to="/admin">
                            <ListItemIcon><SettingsIcon /></ListItemIcon>
                            <ListItemText primary={t('layout.adminArea')} />
                        </ListItem>
                        <List component="div" disablePadding sx={{ pl: 4 }}>
                            <ListSubheader
                                disableSticky
                                sx={{ bgcolor: 'transparent', color: 'text.secondary', fontSize: '0.68rem', fontWeight: 800, lineHeight: '32px', letterSpacing: '0.08em', textTransform: 'uppercase' }}
                            >
                                Redaktion & Inhalte
                            </ListSubheader>
                            <ListItem button component={RouterLink} to="/admin/briefing-editorial">
                                <ListItemIcon><HistoryEduIcon /></ListItemIcon>
                                <ListItemText primary="Briefing Redaktion" />
                            </ListItem>
                            <ListItem button component={RouterLink} to="/admin/social-media">
                                <ListItemIcon><ShareIcon /></ListItemIcon>
                                <ListItemText primary="Social Media" />
                            </ListItem>
                            <ListItem button component={RouterLink} to="/admin/actions">
                                <ListItemIcon>
                                    <Badge badgeContent={menuBadges.actions} color="primary" max={99}>
                                        <StarsIcon />
                                    </Badge>
                                </ListItemIcon>
                                <ListItemText primary="Actions & Software" />
                            </ListItem>
                            <ListItem button component={RouterLink} to="/admin/advertisements"><ListItemIcon><CampaignIcon /></ListItemIcon><ListItemText primary={t('layout.advertising')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/surveys"><ListItemIcon><PollIcon /></ListItemIcon><ListItemText primary={t('layout.surveys')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/community"><ListItemIcon><ForumIcon /></ListItemIcon><ListItemText primary="Community Moderation" /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/events"><ListItemIcon><CalendarMonthIcon /></ListItemIcon><ListItemText primary={t('layout.events')} /></ListItem>

                            <ListSubheader
                                disableSticky
                                sx={{ bgcolor: 'transparent', color: 'text.secondary', fontSize: '0.68rem', fontWeight: 800, lineHeight: '32px', letterSpacing: '0.08em', textTransform: 'uppercase' }}
                            >
                                Mandanten & Netzwerk
                            </ListSubheader>
                            <ListItem button component={RouterLink} to="/admin/business-partners"><ListItemIcon><BusinessIcon /></ListItemIcon><ListItemText primary={t('layout.businessPartners')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/users"><ListItemIcon><GroupIcon /></ListItemIcon><ListItemText primary={t('layout.users')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/widget-types"><ListItemIcon><WidgetsIcon /></ListItemIcon><ListItemText primary={t('layout.widgetTypes')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/bp-widget-access"><ListItemIcon><SubscriptionsIcon /></ListItemIcon><ListItemText primary={t('layout.subscriptions')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/directory"><ListItemIcon><StorefrontIcon /></ListItemIcon><ListItemText primary={t('layout.directory')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/sources"><ListItemIcon><FactCheckIcon /></ListItemIcon><ListItemText primary={t('layout.sourceManagement')} /></ListItem>

                            <ListSubheader
                                disableSticky
                                sx={{ bgcolor: 'transparent', color: 'text.secondary', fontSize: '0.68rem', fontWeight: 800, lineHeight: '32px', letterSpacing: '0.08em', textTransform: 'uppercase' }}
                            >
                                Daten & KI
                            </ListSubheader>
                            <ListItem button component={RouterLink} to="/admin/funding"><ListItemIcon><ShoppingCartCheckoutIcon /></ListItemIcon><ListItemText primary={t('layout.funding')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/legal-monitor"><ListItemIcon><GavelIcon /></ListItemIcon><ListItemText primary="Monitor-Verwaltung" /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/scraped-content">
                                <ListItemIcon>
                                    <Badge 
                                        badgeContent={menuBadges.scraped} 
                                        color="error" 
                                        max={999}
                                        sx={{ '& .MuiBadge-badge': menuBadges.scraped > 0 ? { animation: `${pulseAnimation} 2s infinite` } : {} }}
                                    >
                                        <DataObjectIcon />
                                    </Badge>
                                </ListItemIcon>
                                <ListItemText primary={t('layout.scrapedContent')} />
                            </ListItem>
                            <ListItem button component={RouterLink} to="/admin/scraping-rules"><ListItemIcon><PolicyIcon /></ListItemIcon><ListItemText primary={t('layout.scrapingRules')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/ai-content">
                                <ListItemIcon>
                                    <Badge 
                                        badgeContent={menuBadges.ai} 
                                        color="error" 
                                        max={999}
                                        sx={{ '& .MuiBadge-badge': menuBadges.ai > 0 ? { animation: `${pulseAnimation} 2s infinite` } : {} }}
                                    >
                                        <SmartToyIcon />
                                    </Badge>
                                </ListItemIcon>
                                <ListItemText primary={t('layout.aiContent')} />
                            </ListItem>
                            <ListItem button component={RouterLink} to="/admin/ai-prompt-rules"><ListItemIcon><AutoAwesomeIcon /></ListItemIcon><ListItemText primary={t('layout.aiPromptRules')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/categories"><ListItemIcon><CategoryIcon /></ListItemIcon><ListItemText primary={t('layout.categories')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/tags"><ListItemIcon><TagIcon /></ListItemIcon><ListItemText primary={t('layout.tags')} /></ListItem>

                            <ListSubheader
                                disableSticky
                                sx={{ bgcolor: 'transparent', color: 'text.secondary', fontSize: '0.68rem', fontWeight: 800, lineHeight: '32px', letterSpacing: '0.08em', textTransform: 'uppercase' }}
                            >
                                Betrieb & Analyse
                            </ListSubheader>
                            <ListItem button component={RouterLink} to="/admin/cronjobs"><ListItemIcon><ScheduleIcon /></ListItemIcon><ListItemText primary={t('layout.automatedTasks')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/statistics"><ListItemIcon><QueryStatsIcon /></ListItemIcon><ListItemText primary={t('layout.statistics')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/monitor"><ListItemIcon><MonitorIcon /></ListItemIcon><ListItemText primary={t('layout.activityMonitor')} /></ListItem>
                            <Divider sx={{ my: 1 }} />                                            
                        </List>
                    </>
                )}
                <ListItem button onClick={handleLogout}>
                    <ListItemIcon><LogoutIcon color="error" /></ListItemIcon>
                    <ListItemText primary={t('layout.logout')} sx={{ color: 'error.main' }} />
                </ListItem>
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
                        maxWidth: { xs: 140, sm: 220, md: 300 },
                        mr: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start'
                        }}
                    >
                        <Box
                        component="img"
                        src={businessPartner?.logo_url}
                        alt={businessPartner?.name ?? 'Logo'}
                        sx={{
                            maxHeight: '100%',
                            maxWidth: '100%',  
                            objectFit: 'contain', 
                            width: 'auto',
                            height: 'auto',
                            display: 'block'
                        }}
                        />
                    </Box>
                    )}

                      <Typography variant="h6" noWrap component="div" sx={{ display: { xs: 'none', sm: 'block' } }}>
                        {dashboardTitle}
                      </Typography>
                    </RouterLink>

                    <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', ml: { xs: 1, md: 3 }, mr: 2 }}>
                        {isMobile ? (
                            <>
                                <IconButton color="inherit" onClick={handleBriefingOpen}>
                                    <InsightsIcon />
                                </IconButton>
                                <IconButton color="inherit" onClick={handleSearchOpen}>
                                    <SearchIcon />
                                </IconButton>
                            </>
                        ) : (
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <Collapse in={desktopSearchExpanded} orientation="horizontal" unmountOnExit>
                                    <Box sx={{ width: { sm: '250px', md: '400px' }, mr: 1, py: 0.5 }}>
                                        <GlobalSearchBar />
                                    </Box>
                                </Collapse>
                                
                                <Tooltip title={desktopSearchExpanded ? "Suche schließen" : "Suchen"}>
                                    <IconButton 
                                        color="inherit" 
                                        onClick={() => setDesktopSearchExpanded(!desktopSearchExpanded)}
                                    >
                                        {desktopSearchExpanded ? <CloseIcon /> : <SearchIcon />}
                                    </IconButton>
                                </Tooltip>

                                <Tooltip title="Tägliches Briefing anzeigen">
                                    <IconButton color="inherit" onClick={handleBriefingOpen} sx={{ ml: 1 }}>
                                        <InsightsIcon />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        )}
                    </Box>

                    {!isMobile && dashboardHeaderActions && (
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                flexShrink: 0,
                                mr: 1,
                                gap: 0.75,
                            }}
                        >
                            {dashboardHeaderActions}
                        </Box>
                    )}
                    
                    <SessionTimer />
                    
                    {user && (
                        <div>
                            <IconButton 
                                size="large" 
                                edge="end" 
                                aria-label="account of current user" 
                                aria-controls="menu-appbar" 
                                aria-haspopup="true" 
                                onClick={handleMenu} 
                                color="inherit"
                            >
                                <Badge 
                                    badgeContent={user.contribution_score || 0} 
                                    color="warning" 
                                    showZero
                                    anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                                    sx={{ '& .MuiBadge-badge': { border: `2px solid ${theme.palette.primary.main}` } }}
                                >
                                    <Badge badgeContent={unreadCount} color="error" max={99} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
                                        <Avatar
                                            src={user.profile_image_url || undefined}
                                            alt={user.first_name || user.username}
                                            sx={{ width: 32, height: 32, border: unreadCount > 0 ? `2px solid ${theme.palette.error.light}` : 'none' }}
                                        >
                                            {user.first_name ? user.first_name.charAt(0).toUpperCase() : user.username.charAt(0).toUpperCase()}
                                        </Avatar>
                                    </Badge>
                                </Badge>
                            </IconButton>

                            <Menu
                                id="menu-appbar"
                                anchorEl={anchorEl}
                                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                                keepMounted
                                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                                open={Boolean(anchorEl)}
                                onClose={handleClose}
                                PaperProps={{ sx: { width: 280, maxHeight: 500 } }}
                            >
                                <MenuItem onClick={() => { setHistoryModalOpen(true); handleClose(); }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1.5 }}>
                                        <StarsIcon sx={{ color: 'warning.main' }} fontSize="small" />
                                        <Box>
                                            <Typography variant="body2" fontWeight="bold">Community Score</Typography>
                                            <Typography variant="caption" color="text.secondary">{user.contribution_score ?? 0} Punkte gesammelt</Typography>
                                        </Box>
                                    </Box>
                                </MenuItem>

                                <Divider />

                                <MenuItem onClick={(e) => { e.stopPropagation(); setNotifExpandedInMenu(!notifExpandedInMenu); }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                                        <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: unreadCount > 0 ? 'bold' : 'normal' }}>
                                            <NotificationsIcon fontSize="small" color={unreadCount > 0 ? "error" : "action"} />
                                            Benachrichtigungen
                                        </Typography>
                                        {unreadCount > 0 && (
                                            <Chip size="small" label={`${unreadCount} neu`} color="error" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 'bold' }} />
                                        )}
                                    </Box>
                                </MenuItem>

                                <Collapse in={notifExpandedInMenu} timeout="auto" unmountOnExit>
                                    <Box sx={{ maxHeight: 220, overflowY: 'auto', bgcolor: alpha(theme.palette.action.hover, 0.4), py: 0.5, borderTop: 1, borderBottom: 1, borderColor: 'divider' }}>
                                        {notifications.length === 0 ? (
                                            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center', fontStyle: 'italic' }}>
                                                Keine Benachrichtigungen
                                            </Typography>
                                        ) : (
                                            notifications.map((n) => {
                                                const isSystem = isSystemNotification(n);
                                                const needsReload = n.type === 'system_update_reload';
                                                const isAdminUpdate = n.type === 'system_update_admin';

                                                return (
                                                    <MenuItem 
                                                        key={n.id} 
                                                        onClick={() => handleNotifItemClick(n)}
                                                        sx={{ 
                                                            whiteSpace: 'normal', 
                                                            bgcolor: n.is_read
                                                                ? 'transparent'
                                                                : isSystem
                                                                    ? alpha(theme.palette.warning.main, 0.08)
                                                                    : alpha(theme.palette.primary.main, 0.05),
                                                            borderLeft: n.is_read
                                                                ? 'none'
                                                                : `3px solid ${isSystem ? theme.palette.warning.main : theme.palette.error.main}`,
                                                            py: isSystem ? 1.25 : 1,
                                                            px: 2,
                                                            display: 'block',
                                                            cursor: isSystem ? 'default' : 'pointer',
                                                        }}
                                                    >
                                                        {isSystem ? (
                                                            <Box>
                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.6 }}>
                                                                    <Box sx={{ display: 'flex', color: isAdminUpdate ? 'success.main' : 'warning.main' }}>
                                                                        {isAdminUpdate ? <RocketLaunchIcon fontSize="small" /> : <SystemUpdateAltIcon fontSize="small" />}
                                                                    </Box>
                                                                    <Typography variant="subtitle2" sx={{ fontSize: '0.82rem', fontWeight: 900, flexGrow: 1 }}>
                                                                        {n.title}
                                                                    </Typography>
                                                                    <Chip
                                                                        size="small"
                                                                        label={isAdminUpdate ? 'Admin' : 'System'}
                                                                        color={isAdminUpdate ? 'success' : 'warning'}
                                                                        variant={n.is_read ? 'outlined' : 'filled'}
                                                                        sx={{ height: 18, fontSize: '0.62rem', fontWeight: 850 }}
                                                                    />
                                                                </Box>
                                                                <Typography
                                                                    variant="body2"
                                                                    color="text.secondary"
                                                                    sx={{
                                                                        fontSize: '0.75rem',
                                                                        lineHeight: 1.35,
                                                                        whiteSpace: 'pre-line',
                                                                    }}
                                                                >
                                                                    {n.message}
                                                                </Typography>
                                                                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                                                                    {needsReload && (
                                                                        <Button
                                                                            size="small"
                                                                            variant="contained"
                                                                            color="warning"
                                                                            startIcon={<SystemUpdateAltIcon />}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleSystemUpdateRefresh(n);
                                                                            }}
                                                                            sx={{ fontWeight: 850 }}
                                                                        >
                                                                            Jetzt aktualisieren
                                                                        </Button>
                                                                    )}
                                                                    {!needsReload && !n.is_read && (
                                                                        <Button
                                                                            size="small"
                                                                            variant="outlined"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                markSingleNotificationRead(n.id);
                                                                            }}
                                                                        >
                                                                            Gelesen
                                                                        </Button>
                                                                    )}
                                                                </Box>
                                                            </Box>
                                                        ) : (
                                                            <>
                                                                <Typography variant="subtitle2" sx={{ fontSize: '0.8rem', fontWeight: n.is_read ? 'normal' : 'bold' }}>{n.title}</Typography>
                                                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', lineHeight: 1.3 }}>{n.message}</Typography>
                                                            </>
                                                        )}
                                                    </MenuItem>
                                                );
                                            })
                                        )}
                                        {unreadCount > 0 && (
                                            <Box sx={{ p: 1, textAlign: 'center' }}>
                                                <Button 
                                                    size="small" 
                                                    fullWidth 
                                                    onClick={async (e) => { 
                                                        e.stopPropagation();
                                                        try {
                                                            await apiClient.put('/api/notifications/read', {});
                                                            setUnreadCount(0);
                                                            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
                                                        } catch (e) { console.error(e); }
                                                    }}
                                                >
                                                    Alle als gelesen markieren
                                                </Button>
                                            </Box>
                                        )}
                                    </Box>
                                </Collapse>

                                <Divider />
                                
                                <MenuItem onClick={handleNewsletterToggle} disabled={!isNewsletterAllowed}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between', gap: 3 }}>
                                        <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <EmailIcon fontSize="small" color="action" />
                                            E-Mail Briefing
                                        </Typography>
                                        <Switch 
                                            size="small" 
                                            checked={effectiveSubscription} 
                                            disableRipple
                                            sx={{ pointerEvents: 'none' }}
                                        />
                                    </Box>
                                </MenuItem>
                                {!isNewsletterAllowed && (
                                    <Typography variant="caption" color="error" sx={{ px: 2, pb: 1, display: 'block', maxWidth: 220, whiteSpace: 'normal', lineHeight: 1.2 }}>
                                        Der automatische Versand wurde durch Ihre Organisation deaktiviert.
                                    </Typography>
                                )}
                                
                                <Divider sx={{ my: 1 }} />
                                
                                <MenuItem onClick={handleProfile}>{t('layout.myProfile')} {user.role && `(${user.role})`}</MenuItem>
                                <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                                    <LogoutIcon fontSize="small" sx={{ mr: 1 }} /> {t('layout.logout')} 
                                </MenuItem>
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
                sx={{ width: 290, flexShrink: 0, [`& .MuiDrawer-paper`]: { width: 290, boxSizing: 'border-box' } }}
            >
                {drawerContent}
            </Drawer>
            
            <Box 
                component="main" 
                sx={{ 
                    flexGrow: 1, 
                    minWidth: 0,
                    p: { xs: 1, sm: 2, md: 3 }, 
                    width: '100%' 
                }}
            >
                <Toolbar />
                {adBannerHeight > 0 && (
                    <Box
                        aria-hidden="true"
                        sx={{
                            height: adBannerHeight,
                            transition: 'height 180ms ease',
                            flexShrink: 0,
                        }}
                    />
                )}
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
            {showOnboarding && (
                <OnboardingFlow 
                    open={showOnboarding} 
                    onComplete={() => {
                        triggerDashboardRefresh(); 
                    }} 
                />
            )}      
<Box
    sx={{
        '& > *': {
            '@media (max-width:600px)': {
                bottom: '108px !important',
                right: '18px !important',
            },
        },
        '& .MuiFab-root, & .MuiButtonBase-root': {
            '@media (max-width:600px)': {
                bottom: '108px !important',
            },
        },
    }}
>
    <AiChatWidget />
</Box>
        </Box>
    );
};

export default DashboardLayout;
