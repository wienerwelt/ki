import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, createTheme, Theme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, CircularProgress } from '@mui/material';

// Layout
import DashboardLayout from './components/DashboardLayout';

// Öffentliche Seiten
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';

// Geschützte Seiten
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminBusinessPartnersPage from './pages/AdminBusinessPartnersPage';
import AdminUserManagementPage from './pages/AdminUserManagementPage';
import AdminWidgetTypesPage from './pages/AdminWidgetTypesPage';
import AdminBpWidgetAccessPage from './pages/AdminBpWidgetAccessPage';
import AdminScrapedContentPage from './pages/AdminScrapedContentPage';
import AdminScrapingRulesPage from './pages/AdminScrapingRulesPage';
import AdminAIPromptRulesPage from './pages/AdminAIPromptRulesPage';
import AdminAIContentPage from './pages/AdminAIContentPage';
import AdminCategoriesPage from './pages/AdminCategoriesPage';
import AdminTagsPage from './pages/AdminTagsPage';
import AdminMonitorPage from './pages/AdminMonitorPage';
import AdminStatisticsPage from './pages/AdminStatisticsPage'; // NEU

// --- ROUTE GUARDS ---
const ProtectedRoutes: React.FC = () => {
    const { user, isLoading } = useAuth();
    if (isLoading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><CircularProgress /></Box>;
    }
    return user ? <DashboardLayout><Outlet /></DashboardLayout> : <Navigate to="/login" replace />;
};

const AdminRoutes: React.FC = () => {
    const { user } = useAuth();
    return user?.role === 'admin' ? <Outlet /> : <Navigate to="/dashboard" replace />;
};

const UserManagementAllowedRoutes: React.FC = () => {
    const { user } = useAuth();
    const isAllowed = user?.role === 'admin' || user?.role === 'assistenz';
    return isAllowed ? <Outlet /> : <Navigate to="/dashboard" replace />;
};

function App() {
    const { businessPartner, isLoading } = useAuth();
    const [currentTheme, setCurrentTheme] = useState<Theme | null>(null);

    useEffect(() => {
        if (!isLoading) {
             const newTheme = createTheme({
                palette: {
                    primary: { main: businessPartner?.primary_color || '#2196f3' },
                    secondary: { main: businessPartner?.secondary_color || '#ff9800' },
                    text: { primary: businessPartner?.text_color || '#333333' },
                    background: { default: businessPartner?.background_color || '#f4f6f8', paper: '#ffffff' },
                },
            });
            setCurrentTheme(newTheme);
        }
    }, [businessPartner, isLoading]);

    if (!currentTheme) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><CircularProgress /></Box>;
    }

    return (
        <ThemeProvider theme={currentTheme}>
            <CssBaseline />
            <Router>
                <Routes>
                    {/* Öffentliche Routen */}
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<LoginPage isRegister={true} />} />
                    
                    {/* Geschützte Routen */}
                    <Route element={<ProtectedRoutes />}>
                        <Route path="/dashboard" element={<DashboardPage />} />
                        <Route path="/profile" element={<ProfilePage />} />
                        
                        <Route element={<UserManagementAllowedRoutes />}>
                            <Route path="/admin/users" element={<AdminUserManagementPage />} />
                            <Route path="/admin/users/:businessPartnerId" element={<AdminUserManagementPage />} />
                        </Route>

                        <Route path="/admin" element={<AdminRoutes />}>
                            <Route index element={<AdminDashboardPage />} />
                            <Route path="business-partners" element={<AdminBusinessPartnersPage />} />
                            <Route path="widget-types" element={<AdminWidgetTypesPage />} />
                            <Route path="bp-widget-access" element={<AdminBpWidgetAccessPage />} />
                            <Route path="bp-widget-access/:bpId" element={<AdminBpWidgetAccessPage />} />
                            <Route path="scraped-content" element={<AdminScrapedContentPage />} />
                            <Route path="scraping-rules" element={<AdminScrapingRulesPage />} />
                            <Route path="ai-prompt-rules" element={<AdminAIPromptRulesPage />} />
                            <Route path="ai-content" element={<AdminAIContentPage />} />
                            <Route path="categories" element={<AdminCategoriesPage />} />
                            <Route path="tags" element={<AdminTagsPage />} />
                            <Route path="monitor" element={<AdminMonitorPage />} />
                            <Route path="statistics" element={<AdminStatisticsPage />} /> {/* NEU */}
                        </Route>
                    </Route>
                    
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Router>
        </ThemeProvider>
    );
}

function AppWrapper() {
    return (
        <AuthProvider>
            <App />
        </AuthProvider>
    );
}

export default AppWrapper;
