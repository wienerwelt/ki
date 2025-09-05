// frontend/src/components/DashboardLayout.tsx
import React, { useState, useEffect } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
    AppBar, Toolbar, Typography, Box, Drawer, List, ListItem, ListItemText,
    IconButton, Avatar, Divider, Menu, MenuItem, Tooltip, Badge
} from '@mui/material';
import FactCheckIcon from '@mui/icons-material/FactCheck';
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

import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next'; // NEU
import posthog from 'posthog-js'; // NEU
import SessionTimer from './SessionTimer';
import AdvertisementBanner from './AdvertisementBanner';
import apiClient from '../apiClient';

interface DashboardLayoutProps {
    children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
    const { user, businessPartner, logout } = useAuth();
    const { t } = useTranslation(); // NEU
    const navigate = useNavigate();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

    // Ad Banner Logic (unverändert)
    const [ad, setAd] = useState<{ id: string; content: string } | null>(null);
    const [isAdVisible, setIsAdVisible] = useState(false);
    const token = localStorage.getItem('jwt_token');

    useEffect(() => {
        const fetchAd = async () => {
            if (!token) return;
            try {
                const response = await apiClient.get('/api/data/active-advertisement', {
                    headers: { 'x-auth-token': token },
                });
                const activeAd = response.data;
                const closedAds = JSON.parse(localStorage.getItem('closedAds') || '[]');
                if (activeAd && !closedAds.includes(activeAd.id)) {
                    setAd(activeAd);
                    setIsAdVisible(true);
                } else {
                    setIsAdVisible(false);
                }
            } catch (error) {
                console.error("Error fetching advertisement:", error);
                setIsAdVisible(false);
            }
        };
        fetchAd();
    }, [token]);

    const handleCloseAd = () => {
        setIsAdVisible(false);
        if (ad) {
            const closedAds = JSON.parse(localStorage.getItem('closedAds') || '[]');
            localStorage.setItem('closedAds', JSON.stringify([...closedAds, ad.id]));
        }
    };

    const handleMenu = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
    const handleClose = () => setAnchorEl(null);
    const handleProfile = () => { navigate('/profile'); handleClose(); };
    const toggleDrawer = (open: boolean) => () => setDrawerOpen(open);

    const handleLogout = () => {
        posthog.capture('user_logged_out'); // NEU: Tracking für Logout
        handleClose();
        logout();
        navigate('/');
    };
    
    const dashboardTitle = user?.dashboard_title || businessPartner?.name || 'Fleet KI-Dashboard';
    
    const drawerContent = (
        <div>
            <Toolbar />
            <Divider />
            <List>
                {/* --- NEU: Alle Texte werden jetzt übersetzt --- */}
                <ListItem button component={RouterLink} to="/dashboard" onClick={toggleDrawer(false)}>
                    <DashboardIcon sx={{ mr: 2 }} />
                    <ListItemText primary={t('layout.myDashboard')} />
                </ListItem>
                <ListItem button component={RouterLink} to="/files" onClick={toggleDrawer(false)}>
                    <FolderIcon sx={{ mr: 2 }} />
                    <ListItemText primary={t('layout.fileDirectory')} />
                </ListItem>
                <ListItem button component={RouterLink} to="/trusted-sources" onClick={toggleDrawer(false)}>
                    <FactCheckIcon sx={{ mr: 2 }} />
                    <ListItemText primary={t('layout.trustedSources')} />
                </ListItem>
                <ListItem button component={RouterLink} to="/feedback" onClick={toggleDrawer(false)}>
                    <FeedbackIcon sx={{ mr: 2 }} />
                    <ListItemText primary={t('layout.feedbackAndIdeas')} />
                </ListItem>                
                <Divider sx={{ my: 1 }} />
                {user?.role === 'assistenz' && (
                   <>
                        <ListItem button component={RouterLink} to="/admin/users" onClick={toggleDrawer(false)}>
                            <GroupIcon sx={{ mr: 2 }} />
                            <ListItemText primary={t('layout.userManagement')} />
                        </ListItem>
                        <ListItem button component={RouterLink} to="/admin/actions" onClick={toggleDrawer(false)}>
                            <StarsIcon sx={{ mr: 2 }} />
                            <ListItemText primary={t('layout.manageActions')} />
                        </ListItem>
                        <Divider sx={{ my: 1 }} />
                   </>
                )}
                {user?.role === 'admin' && (
                    <>
                        <ListItem button component={RouterLink} to="/admin" onClick={toggleDrawer(false)}>
                            <SettingsIcon sx={{ mr: 2 }} />
                            <ListItemText primary={t('layout.adminArea')} />
                        </ListItem>
                        <List component="div" disablePadding sx={{ pl: 4 }}>
                            <ListItem button component={RouterLink} to="/admin/cronjobs" onClick={toggleDrawer(false)}><ScheduleIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.automatedTasks')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/statistics" onClick={toggleDrawer(false)}><QueryStatsIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.statistics')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/monitor" onClick={toggleDrawer(false)}><MonitorIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.activityMonitor')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/advertisements" onClick={toggleDrawer(false)}><CampaignIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.advertising')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/actions" onClick={toggleDrawer(false)}><StarsIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.manageActions')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/business-partners" onClick={toggleDrawer(false)}><BusinessIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.businessPartners')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/users" onClick={toggleDrawer(false)}><GroupIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.users')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/widget-types" onClick={toggleDrawer(false)}><WidgetsIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.widgetTypes')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/bp-widget-access" onClick={toggleDrawer(false)}><SubscriptionsIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.subscriptions')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/sources" onClick={toggleDrawer(false)}><FactCheckIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.sourceManagement')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/scraped-content" onClick={toggleDrawer(false)}><DataObjectIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.scrapedContent')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/scraping-rules" onClick={toggleDrawer(false)}><PolicyIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.scrapingRules')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/ai-prompt-rules" onClick={toggleDrawer(false)}><AutoAwesomeIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.aiPromptRules')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/ai-content" onClick={toggleDrawer(false)}><SmartToyIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.aiContent')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/categories" onClick={toggleDrawer(false)}><CategoryIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.categories')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/tags" onClick={toggleDrawer(false)}><TagIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.tags')} /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/events" onClick={toggleDrawer(false)}><CalendarMonthIcon sx={{ mr: 2 }} /><ListItemText primary={t('layout.events')} /></ListItem>
                        </List>
                    </>
                )}
            </List>
        </div>
    );

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
            <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }} color="primary">
                {isAdVisible && ad && (
                    <AdvertisementBanner content={ad.content} onClose={handleCloseAd} />
                )}
                <Toolbar>
                    <IconButton color="inherit" aria-label="open drawer" onClick={toggleDrawer(true)} edge="start" sx={{ mr: 2 }}>
                        <MenuIcon />
                    </IconButton>
                    <RouterLink to="/dashboard" style={{ textDecoration: 'none', color: 'inherit' }}>
                        {businessPartner?.logo_url && (
                            <Avatar alt={businessPartner.name} src={businessPartner.logo_url} sx={{ width: 60, height: 40, mr: 2 }} variant="rounded" />
                        )}
                    </RouterLink>
                    <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
                        {dashboardTitle}
                    </Typography>
                    <SessionTimer />
                    {user && (
                        <div>
                            <Tooltip title={`Sie haben ${user.contribution_score} Punkte gesammelt. Punkte erhalten Sie für das Vorschlagen und Bewerten von vertrauenswürdigen Quellen.`}>
                                <IconButton size="large" onClick={handleMenu} color="inherit">
                                    <Badge badgeContent={user.contribution_score} color="secondary" invisible={!user.contribution_score || user.contribution_score === 0}>
                                        <AccountCircle />
                                    </Badge>
                                </IconButton>
                            </Tooltip>
                            <Menu
                                id="menu-appbar"
                                anchorEl={anchorEl}
                                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                                keepMounted
                                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                                open={Boolean(anchorEl)}
                                onClose={handleClose}
                            >
                                <MenuItem disabled>
                                    <Typography variant="subtitle1" color="text.primary">
                                        {user.username} ({user.role})
                                    </Typography>
                                </MenuItem>
                                <Divider />
                                <MenuItem onClick={handleProfile}>{t('layout.myProfile')}</MenuItem>
                                <MenuItem onClick={handleLogout}>{t('layout.logout')}</MenuItem>
                            </Menu>
                        </div>
                    )}
                </Toolbar>
            </AppBar>
            <Drawer variant="temporary" open={drawerOpen} onClose={toggleDrawer(false)} ModalProps={{ keepMounted: true }}
                sx={{ width: 240, flexShrink: 0, [`& .MuiDrawer-paper`]: { width: 240, boxSizing: 'border-box' } }}
            >
                {drawerContent}
            </Drawer>
            <Box component="main" sx={{ flexGrow: 1, p: 3, width: '100%' }}>
                <Toolbar />
                {isAdVisible && <Box sx={{ height: '50px' }} />}
                {children}
            </Box>
        </Box>
    );
};

export default DashboardLayout;