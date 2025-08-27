/// <reference types="vite/client" />

import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, createTheme, Theme } from '@mui/material/styles';
import { CssBaseline, Box, CircularProgress } from '@mui/material';

// Layout
import DashboardLayout from './components/DashboardLayout';

// Öffentliche Seiten
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';

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
import AdminStatisticsPage from './pages/AdminStatisticsPage';
import AdminAdvertisementsPage from './pages/AdminAdvertisementsPage';
import AdminBpActionsPage from './pages/AdminBpActionsPage';
import AdminCronjobsPage from './pages/AdminCronjobsPage';
import AdminSourcesPage from './pages/AdminSourcesPage';
import TrustedSourcesPage from './pages/TrustedSourcesPage';
import FeedbackCenterPage from './pages/FeedbackCenterPage';
import FileManagementPage from './pages/FileManagementPage';
import AdminEventsPage from './pages/AdminEventsPage';


// --- ROUTE GUARDS ---
const ProtectedRoutes: React.FC = () => {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }
  return user ? (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  ) : (
    <Navigate to="/login" replace />
  );
};

const AdminRoutes: React.FC = () => {
  const { user } = useAuth();
  return user?.role === 'admin' ? <Outlet /> : <Navigate to="/dashboard" replace />;
};

const BpStaffAllowedRoutes: React.FC = () => {
  const { user } = useAuth();
  const isAllowed = user?.role === 'admin' || user?.role === 'assistenz';
  return isAllowed ? <Outlet /> : <Navigate to="/dashboard" replace />;
};

function App() {
  // themeMode wird jetzt aus dem AuthContext geholt
  const { businessPartner, isLoading, themeMode } = useAuth();
  const [currentTheme, setCurrentTheme] = useState<Theme | null>(null);

  useEffect(() => {
    if (!isLoading) {
      // Annahme: Ihr 'businessPartner' Objekt enthält jetzt ein 'color_scheme' Unterobjekt
      const scheme = businessPartner?.color_scheme; 

      const newTheme = createTheme({
        palette: {
          mode: themeMode, // 'light' or 'dark'
          
          primary: { 
            main: scheme?.primary_color || '#2196f3' 
          },
          secondary: { 
            main: scheme?.secondary_color || '#ff9800' 
          },
          text: {
            primary: themeMode === 'light'
              ? scheme?.text_color_light || '#333333'
              : scheme?.text_color_dark || '#ffffff',
          },
          background: {
            default: themeMode === 'light'
              ? scheme?.background_color_light || '#f4f6f8'
              : scheme?.background_color_dark || '#121212',
            paper: themeMode === 'light'
              // Für paper_color_light nehmen wir oft den normalen Hintergrund, falls nicht anders definiert
              ? scheme?.paper_color_light || '#ffffff' 
              : scheme?.paper_color_dark || '#1e1e1e',
          },
        },
      });
      setCurrentTheme(newTheme);
    }
  }, [businessPartner, isLoading, themeMode]);

  if (!currentTheme) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  const AnyThemeProvider = ThemeProvider as any;

  return (
    <AnyThemeProvider theme={currentTheme}>
      <CssBaseline />
      <Router>
        <Routes>
          {/* Öffentliche Routen */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<LoginPage isRegister={true} />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
          <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />

          {/* Geschützte Routen */}
          <Route element={<ProtectedRoutes />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/trusted-sources" element={<TrustedSourcesPage />} />
            <Route path="/feedback" element={<FeedbackCenterPage />} />
            <Route path="/files" element={<FileManagementPage />} />

            {/* Routen für Admins und Assistenten */}
            <Route element={<BpStaffAllowedRoutes />}>
              <Route path="/admin/users" element={<AdminUserManagementPage />} />
              <Route path="/admin/users/:businessPartnerId" element={<AdminUserManagementPage />} />
              <Route path="/admin/actions" element={<AdminBpActionsPage />} />
            </Route>

            {/* Routen nur für Admins */}
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
              <Route path="statistics" element={<AdminStatisticsPage />} />
              <Route path="advertisements" element={<AdminAdvertisementsPage />} />
              <Route path="cronjobs" element={<AdminCronjobsPage />} />
              <Route path="sources" element={<AdminSourcesPage />} />
              <Route path="events" element={<AdminEventsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AnyThemeProvider>
  );
}

function AppWrapper() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (typeof clientId === 'string' && /^['"].*['"]$/.test(clientId.trim())) {
    console.warn(
      '%cWARNUNG:',
      'color: yellow; font-weight: bold;',
      'Deine GOOGLE_CLIENT_ID enthält Anführungszeichen im Wert:',
      clientId,
      '\n→ Entferne die " oder \' aus der .env-Datei, sonst erkennt Google die ID nicht.'
    );
  }

  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

export default AppWrapper;