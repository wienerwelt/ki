import React, { useState, useEffect } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { 
    AppBar, Toolbar, Typography, Button, Box, Drawer, List, ListItem, ListItemText, 
    IconButton, Avatar, Divider, Menu, MenuItem, Tooltip
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
import DnsIcon from '@mui/icons-material/Dns';
import { useAuth } from '../context/AuthContext';
import SessionTimer from './SessionTimer';
import AdvertisementBanner from './AdvertisementBanner';
import apiClient from '../apiClient';

interface DashboardLayoutProps {
    children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
    const { user, businessPartner, logout } = useAuth();
    const navigate = useNavigate();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

    // --- NEU: Logik für den Werbebanner ---
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
                console.error("Fehler beim Laden der Werbung:", error);
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
    // --- Ende der Banner-Logik ---

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

    const toggleDrawer = (open: boolean) => () => {
        setDrawerOpen(open);
    };

    const handleLogout = () => {
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
                <ListItem button component={RouterLink} to="/dashboard" onClick={toggleDrawer(false)}>
                    <DashboardIcon sx={{ mr: 2 }} />
                    <ListItemText primary="Mein Dashboard" />
                </ListItem>
<ListItem button component={RouterLink} to="/trusted-sources" onClick={toggleDrawer(false)}>
    <FactCheckIcon sx={{ mr: 2 }} />
    <ListItemText primary="Vertrauensw. Quellen" />
</ListItem>                
                <Divider sx={{ my: 1 }} />
                {user?.role === 'assistenz' && (
                   <>
                        <ListItem button component={RouterLink} to="/admin/users" onClick={toggleDrawer(false)}>
                            <GroupIcon sx={{ mr: 2 }} />
                            <ListItemText primary="Benutzerverwaltung" />
                        </ListItem>
                        <ListItem button component={RouterLink} to="/admin/actions" onClick={toggleDrawer(false)}>
                            <StarsIcon sx={{ mr: 2 }} />
                            <ListItemText primary="Aktionen verwalten" />
                        </ListItem>
                        <Divider sx={{ my: 1 }} />
                   </>
                )}
                {user?.role === 'admin' && (
                    <>
                        <ListItem button component={RouterLink} to="/admin" onClick={toggleDrawer(false)}>
                            <SettingsIcon sx={{ mr: 2 }} />
                            <ListItemText primary="Admin-Bereich" />
                        </ListItem>
                        <List component="div" disablePadding sx={{ pl: 4 }}>
                            <ListItem button component={RouterLink} to="/admin/cronjobs" onClick={toggleDrawer(false)}>
                                <ScheduleIcon sx={{ mr: 2 }} />
                                <ListItemText primary="Autom. Aufgaben" />
                            </ListItem>
                            <ListItem button component="a" href="http://localhost:5000/api/admin/jobs/" target="_blank" onClick={toggleDrawer(false)}>
                                <DnsIcon sx={{ mr: 2 }} />
                                <ListItemText primary="Job-Warteschlange" />
                            </ListItem>
                            <ListItem button component={RouterLink} to="/admin/statistics" onClick={toggleDrawer(false)}><QueryStatsIcon sx={{ mr: 2 }} /><ListItemText primary="Statistiken" /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/monitor" onClick={toggleDrawer(false)}><MonitorIcon sx={{ mr: 2 }} /><ListItemText primary="Aktivitätsmonitor" /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/advertisements" onClick={toggleDrawer(false)}><CampaignIcon sx={{ mr: 2 }} /><ListItemText primary="Werbung" /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/actions" onClick={toggleDrawer(false)}><StarsIcon sx={{ mr: 2 }} /><ListItemText primary="Aktionen verwalten" /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/business-partners" onClick={toggleDrawer(false)}><BusinessIcon sx={{ mr: 2 }} /><ListItemText primary="Business Partner" /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/users" onClick={toggleDrawer(false)}><GroupIcon sx={{ mr: 2 }} /><ListItemText primary="Benutzer" /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/widget-types" onClick={toggleDrawer(false)}><WidgetsIcon sx={{ mr: 2 }} /><ListItemText primary="Widget-Typen" /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/bp-widget-access" onClick={toggleDrawer(false)}><SubscriptionsIcon sx={{ mr: 2 }} /><ListItemText primary="Abonnements" /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/scraped-content" onClick={toggleDrawer(false)}><DataObjectIcon sx={{ mr: 2 }} /><ListItemText primary="Gescrapte Inhalte" /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/scraping-rules" onClick={toggleDrawer(false)}><PolicyIcon sx={{ mr: 2 }} /><ListItemText primary="Scraping-Regeln" /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/ai-prompt-rules" onClick={toggleDrawer(false)}><AutoAwesomeIcon sx={{ mr: 2 }} /><ListItemText primary="KI-Prompt-Regeln" /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/ai-content" onClick={toggleDrawer(false)}><SmartToyIcon sx={{ mr: 2 }} /><ListItemText primary="KI-Inhalte" /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/categories" onClick={toggleDrawer(false)}><CategoryIcon sx={{ mr: 2 }} /><ListItemText primary="Kategorien" /></ListItem>
                            <ListItem button component={RouterLink} to="/admin/tags" onClick={toggleDrawer(false)}><TagIcon sx={{ mr: 2 }} /><ListItemText primary="Tags" /></ListItem>
                        </List>
                    </>
                )}
            </List>
        </div>
    );

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
            <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
                {/* Banner wird hier oben im Header gerendert, wenn er sichtbar ist */}
                {isAdVisible && ad && (
                    <AdvertisementBanner
                        content={ad.content}
                        onClose={handleCloseAd}
                    />
                )}
                <Toolbar>
                    <IconButton color="inherit" aria-label="open drawer" onClick={toggleDrawer(true)} edge="start" sx={{ mr: 2 }}>
                        <MenuIcon />
                    </IconButton>
                    {businessPartner?.logo_url && (
                        <Avatar alt={businessPartner.name} src={businessPartner.logo_url} sx={{ width: 40, height: 40, mr: 2 }} variant="rounded" />
                    )}
                    <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
                        {dashboardTitle}
                    </Typography>
                    
                    <SessionTimer />

                    {user && (
                        <div>
                            <Tooltip title="Benutzerkonto">
                                <IconButton
                                    size="large"
                                    onClick={handleMenu}
                                    color="inherit"
                                >
                                    <AccountCircle />
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
                                <MenuItem onClick={handleProfile}>Mein Profil</MenuItem>
                                <MenuItem onClick={handleLogout}>Logout</MenuItem>
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
                {/* Spacer für den fixierten Header */}
                <Toolbar />
                {/* Zusätzlicher Spacer für den Banner, wenn er sichtbar ist */}
                {isAdVisible && <Box sx={{ height: '50px' }} />}
                {children}
            </Box>
        </Box>
    );
};

export default DashboardLayout;
