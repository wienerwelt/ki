// frontend/src/components/DashboardLayout.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
    AppBar, Toolbar, Typography, Box, Drawer, List, ListItem, ListItemText,
    IconButton, Avatar, Divider, Menu, MenuItem, Tooltip, Badge, Chip
} from '@mui/material';
import AccountCircle from '@mui/icons-material/AccountCircle';
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
import ContactMailIcon from '@mui/icons-material/ContactMail';
import NotificationsIcon from '@mui/icons-material/Notifications';
import PollIcon from '@mui/icons-material/Poll';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import posthog from 'posthog-js';
import SessionTimer from './SessionTimer';
import AdvertisementBanner from './AdvertisementBanner';
import apiClient from '../apiClient';
import GlobalSearchBar from './GlobalSearchBar';
import { useSnackbar } from '../context/SnackbarContext';

interface DashboardLayoutProps {
    children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
    const { user, businessPartner, logout, themeMode } = useAuth();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { showSnackbar } = useSnackbar();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [ad, setAd] = useState<{ id: string; content: string } | null>(null);
    const [isAdVisible, setIsAdVisible] = useState(false);
    const [userTags, setUserTags] = useState<string[]>([]);
    const [tagsLoading, setTagsLoading] = useState(true);

    const token = localStorage.getItem('jwt_token');

    const fetchUserTags = useCallback(async () => {
        if (!user) {
            setUserTags([]);
            setTagsLoading(false);
            return;
        }
        setTagsLoading(true);
        try {
            const { data } = await apiClient.get('/api/users/tags');
            setUserTags(data || []);
        } catch (err) {
            console.error("Fehler beim Laden der User-Tags für DashboardLayout:", err);
        } finally {
            setTagsLoading(false);
        }
    }, [user]);

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
            fetchUserTags();
        }
    }, [token, user, fetchUserTags, fetchAd]);

    const handleCloseAd = async () => {
        setIsAdVisible(false);
    };

    const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
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
        const oldTags = userTags;
        setUserTags(userTags.filter(tag => tag !== tagToRemove));

        try {
            await apiClient.delete(`/api/users/tags/${encodeURIComponent(tagToRemove)}`);
            showSnackbar(`Thema "${tagToRemove}" entfernt.`, 'info');
        } catch (err) {
            console.error("Fehler beim Entfernen des Tags:", err);
            showSnackbar('Fehler beim Entfernen des Themas.', 'error');
            setUserTags(oldTags);
        }
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
                <ListItem button component={RouterLink} to="/dashboard">
                    <DashboardIcon sx={{ mr: 2 }} />
                    <ListItemText primary={t('layout.myDashboard')} />
                </ListItem>
                <ListItem button component={RouterLink} to="/files">
                    <FolderIcon sx={{ mr: 2 }} />
                    <ListItemText primary={t('layout.fileDirectory')} />
                </ListItem>
                <ListItem button component={RouterLink} to="/trusted-sources">
                    <FactCheckIcon sx={{ mr: 2 }} />
                    <ListItemText primary={t('layout.trustedSources')} />
                </ListItem>
                <ListItem button component={RouterLink} to="/feedback">
                    <FeedbackIcon sx={{ mr: 2 }} />
                    <ListItemText primary={t('layout.feedbackAndIdeas')} />
                </ListItem>                
                <ListItem button component={RouterLink} to="/contact-us">
                    <ContactMailIcon sx={{ mr: 2 }} />
                    <ListItemText primary={t('contactUs.title')} />
                </ListItem>
                <Divider sx={{ my: 1 }} />
                {user?.role === 'assistenz' && (
                   <>
                        <ListItem button component={RouterLink} to="/admin/users">
                            <GroupIcon sx={{ mr: 2 }} />
                            <ListItemText primary={t('layout.userManagement')} />
                        </ListItem>
                        <ListItem button component={RouterLink} to="/admin/actions">
                            <StarsIcon sx={{ mr: 2 }} />
                            <ListItemText primary={t('layout.manageActions')} />
                        </ListItem>
                        <ListItem button component={RouterLink} to="/admin/surveys">
                            <PollIcon sx={{ mr: 2 }} />
                            <ListItemText primary={t('layout.surveys')} />
                        </ListItem>                        
                        <Divider sx={{ my: 1 }} />
                   </>
                )}
                {user?.role === 'admin' && (
                    <>
                        <ListItem button component={RouterLink} to="/admin">
                            <SettingsIcon sx={{ mr: 2 }} />
                            <ListItemText primary={t('layout.adminArea')} />
                        </ListItem>
                        <List component="div" disablePadding sx={{ pl: 4 }}>
                            <ListItem button component={RouterLink} to="/admin/cronjobs"><ScheduleIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.automatedTasks')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/statistics"><QueryStatsIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.statistics')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/monitor"><MonitorIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.activityMonitor')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/advertisements"><CampaignIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.advertising')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/actions"><StarsIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.manageActions')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/business-partners"><BusinessIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.businessPartners')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/users"><GroupIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.users')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/widget-types"><WidgetsIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.widgetTypes')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/bp-widget-access"><SubscriptionsIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.subscriptions')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/sources"><FactCheckIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.sourceManagement')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/scraped-content"><DataObjectIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.scrapedContent')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/scraping-rules"><PolicyIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.scrapingRules')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/ai-prompt-rules"><AutoAwesomeIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.aiPromptRules')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/ai-content"><SmartToyIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.aiContent')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/categories"><CategoryIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.categories')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/tags"><TagIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.tags')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/events"><CalendarMonthIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.events')} /></ListItem>
                        </List>
                    </>
                )}
                <Divider sx={{ my: 1 }} />
                <ListItem button onClick={handleLogout}>
                    <LogoutIcon sx={{ mr: 2 }} />
                    <ListItemText primary={t('layout.logout')} />
                </ListItem>
            </List>
        </Box>
    );

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: themeMode === 'dark' ? '#333' : '#f4f6f8' }}>
            <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }} color="primary">
                {isAdVisible && ad && (
                    <AdvertisementBanner content={ad.content} onClose={handleCloseAd} />
                )}
                <Toolbar>
                    <IconButton color="inherit" aria-label="open drawer" onClick={toggleDrawer(true)} edge="start" sx={{ mr: 2 }}>
                        <MenuIcon />
                    </IconButton>
                    <RouterLink to="/dashboard" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center' }}>
                        {businessPartner?.logo_url && (
                            <Avatar alt={businessPartner.name} src={businessPartner.logo_url} sx={{ width: 60, height: 40, mr: 2 }} variant="rounded" />
                        )}
                        <Typography variant="h6" noWrap component="div" sx={{ display: { xs: 'none', sm: 'block' } }}>
                            {dashboardTitle}
                        </Typography>
                    </RouterLink>

                    <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', ml: { xs: 0, md: 3 }, mr: 2 }}>
                        {/* SUCHFELD AUF 50% BREITE BEGRENZT */}
                        <Box sx={{ width: '50%' }}>
                           <GlobalSearchBar />
                        </Box>
                        <Tooltip title={t('layout.tagsTooltip')}>
                            <Box sx={{ display: { xs: 'none', sm: 'flex' }, flexWrap: 'wrap', gap: 1, ml: 2 }}>
                                {!tagsLoading && userTags.map(tag => (
                                    <Chip
                                        key={tag}
                                        label={tag}
                                        onDelete={user?.role !== 'demo' ? handleRemoveTag(tag) : undefined}
                                        color="secondary"
                                        size="small"
                                        variant="outlined"
                                        sx={{
                                            color: 'inherit',
                                            borderColor: 'currentColor',
                                            '& .MuiChip-deleteIcon': {
                                                color: 'inherit',
                                                '&:hover': { color: 'white' },
                                            },
                                        }}
                                    />
                                ))}
                            </Box>
                        </Tooltip>
                    </Box>
                    
                    <SessionTimer />
                    
                    {user && (
                        <div>
                            {/* GAMIFICATION SCORE HINZUGEFÜGT */}
                            <Tooltip title="Community-Punkte">
                                <Chip
                                    icon={<StarsIcon sx={{ color: 'inherit !important' }}/>}
                                    label={user.contribution_score ?? 0}
                                    sx={{ color: 'inherit', mr: 1 }}
                                    variant="outlined"
                                />
                            </Tooltip>

                            <IconButton size="large" aria-label="Benachrichtigungen" color="inherit">
                                <Badge badgeContent={0} color="error">
                                    <NotificationsIcon />
                                </Badge>
                            </IconButton>
                            <IconButton
                                size="large"
                                edge="end"
                                aria-label="account of current user"
                                aria-controls="menu-appbar"
                                aria-haspopup="true"
                                onClick={handleMenu}
                                color="inherit"
                            >
                                <AccountCircle />
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
                                {/* ROLLE ZUM PROFIL-MENÜ HINZUGEFÜGT */}
                                <MenuItem onClick={handleProfile}>
                                    {t('layout.myProfile')} {user.role && `(${user.role})`}
                                </MenuItem>
                                <MenuItem onClick={handleLogout}>{t('layout.logout')}</MenuItem>
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
                sx={{
                    width: 250,
                    flexShrink: 0,
                    [`& .MuiDrawer-paper`]: { width: 250, boxSizing: 'border-box' },
                }}
            >
                {drawerContent}
            </Drawer>
            <Box component="main" sx={{ flexGrow: 1, p: 3, width: `calc(100% - 250px)`, mt: { xs: (isAdVisible ? '120px' : '64px'), sm: (isAdVisible ? '120px' : '64px') } }}>
                <Toolbar />
                {children}
            </Box>
        </Box>
    );
};

export default DashboardLayout;