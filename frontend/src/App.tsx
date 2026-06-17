// frontend/src/App.tsx
/// <reference types="vite/client" />

import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, createTheme, Theme } from '@mui/material/styles';
import { CssBaseline, Box, CircularProgress } from '@mui/material';
import { SnackbarProvider } from './context/SnackbarContext';

// Layout
import DashboardLayout from './components/DashboardLayout';
import CookieBanner from './components/CookieBanner';

// Öffentliche Seiten
import PublicPortalPage from './pages/PublicPortalPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';
import DisclaimerPage from './pages/DisclaimerPage';
import CookieSettingsPage from './pages/CookieSettingsPage';
import NewsletterConfirmed from './pages/NewsletterConfirmed';
import FundingSearchPage from './pages/FundingSearchPage';
import FundingDetailPage from './pages/FundingDetailPage';
import PublicProfileCard from './pages/PublicProfileCard';
import PublicBpCard from './pages/PublicBpCard';

// Geschützte Seiten
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import SearchResultsPage from './pages/SearchResultsPage';
import AiAskPage from './pages/AiAskPage';
import CommunityPage from './pages/CommunityPage';
import TrustedSourcesPage from './pages/TrustedSourcesPage';
import FeedbackCenterPage from './pages/FeedbackCenterPage';
import FileManagementPage from './pages/FileManagementPage';
import InternalDirectoryPage from './pages/InternalDirectoryPage';

// Admin / Assistenz Seiten
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
import AdminEventsPage from './pages/AdminEventsPage';
import AdminSurveysPage from './pages/AdminSurveysPage';
import AdminFundingPage from './pages/AdminFundingPage';
import AdminBpAccountsPage from './pages/AdminBpAccountsPage';
import AdminBpCompetitorsPage from './pages/AdminBpCompetitorsPage';
import AdminBpTrackedArticlesPage from './pages/AdminBpTrackedArticlesPage';
import AdminCommunityPage from './pages/AdminCommunityPage';
import AdminLegalMonitorPage from './pages/AdminLegalMonitorPage';
import AdminEditorialBriefingPage from './pages/AdminEditorialBriefingPage';
import AdminSocialMediaGenerator from './pages/AdminSocialMediaGenerator';
import AdminDirectoryPage from './pages/AdminDirectoryPage';

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
  const { businessPartner, isLoading, themeMode } = useAuth();
  const [currentTheme, setCurrentTheme] = useState<Theme | null>(null);

  useEffect(() => {
    if (!isLoading) {
      const scheme = businessPartner?.color_scheme;

      // --- THEME ERSTELLEN ---
      const newTheme = createTheme({
        palette: {
          mode: themeMode,
          primary: { 
            main: scheme?.primary_color || '#2196f3',
            contrastText: scheme?.primary_text_color || '#fff' 
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
              : '#0a0a0a', 
            paper: themeMode === 'light'
              ? scheme?.paper_color_light || '#ffffff' 
              : '#1e1e1e', 
          },
        },
        components: {
            MuiPaper: {
                styleOverrides: {
                    root: {
                        backgroundImage: 'none', 
                    }
                }
            }
        }
      });
      setCurrentTheme(newTheme);

      // --- DYNAMISCHES BRANDING (Favicon, Title, Theme-Color) ---
      if (businessPartner) {
        // 1. Titel im Browser-Tab
        document.title = businessPartner.dashboard_title || `${businessPartner.name} Dashboard`;

        // 2. Mobile URL-Leisten-Farbe
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor && scheme?.primary_color) {
          metaThemeColor.setAttribute('content', scheme.primary_color);
        }

        // 3. Favicon anpassen (Fallback: SVG generieren)
        const faviconLink = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
        if (faviconLink) {
          if (businessPartner.favicon_url) {
            faviconLink.href = businessPartner.favicon_url;
          } else if (scheme?.primary_color) {
            // Generiert ein rundes Icon in der Primärfarbe mit dem ersten Buchstaben des Namens
            const firstLetter = businessPartner.name ? businessPartner.name.charAt(0).toUpperCase() : 'W';
            const svgIcon = `
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="50" fill="${scheme.primary_color}" />
                <text x="50" y="65" font-family="Arial" font-size="45" fill="#fff" text-anchor="middle" font-weight="bold">
                  ${firstLetter}
                </text>
              </svg>
            `;
            faviconLink.href = `data:image/svg+xml;utf8,${encodeURIComponent(svgIcon)}`;
          }
        }
      } else {
        // Fallback für ausgeloggte Nutzer
        document.title = "Mobiliti Intelligence";
        const faviconLink = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
        if (faviconLink) faviconLink.href = "/favicon.svg"; 
      }
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
{/* ✅ Öffentliche Routen */}
          <Route path="/" element={<PublicPortalPage />} />
          <Route path="/login" element={<PublicPortalPage />} />
          <Route path="/register" element={<PublicPortalPage isRegister={true} />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
          <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/disclaimer" element={<DisclaimerPage />} />
          <Route path="/cookie-settings" element={<CookieSettingsPage />} />
          <Route path="/newsletter/confirmed" element={<NewsletterConfirmed />} />
          <Route path="/p/:userId" element={<PublicProfileCard />} />
          <Route path="/invite/:bpId" element={<PublicBpCard />} />

          {/* NEU: Dynamische Route für Partner-Slugs (z.B. /vfa) */}
          {/* React Router v6 priorisiert automatisch exakte Matches wie /login vor dieser Route */}
          <Route path="/:partnerSlug" element={<PublicPortalPage />} />

          {/* ✅ Geschützte Dashboard-Routen */}
          <Route element={<ProtectedRoutes />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/search" element={<SearchResultsPage />} />
            <Route path="/ask" element={<AiAskPage />} />
            <Route path="/trusted-sources" element={<TrustedSourcesPage />} />
            <Route path="/feedback" element={<FeedbackCenterPage />} />
            <Route path="/files" element={<FileManagementPage />} />
            <Route path="/funding-search" element={<FundingSearchPage />} />
            <Route path="/funding-detail/:id" element={<FundingDetailPage />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/directory" element={<InternalDirectoryPage />} />

            {/* ✅ Assistenz & Admin Routen */}
            <Route element={<BpStaffAllowedRoutes />}>
              <Route path="/admin/users" element={<AdminUserManagementPage />} />
              <Route path="/admin/users/:businessPartnerId" element={<AdminUserManagementPage />} />
              <Route path="/admin/actions" element={<AdminBpActionsPage />} />
              <Route path="/admin/surveys" element={<AdminSurveysPage />} />
              <Route path="/admin/community" element={<AdminCommunityPage />} />
              <Route path="/admin/legal-monitor" element={<AdminLegalMonitorPage />} />
              <Route path="/admin/briefing-editorial" element={<AdminEditorialBriefingPage />} />
            </Route>

            {/* ✅ Hardcore Admin-Only Routen */}
            <Route path="/admin" element={<AdminRoutes />}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="business-partners" element={<AdminBusinessPartnersPage />} />
              <Route path="business-partners/:bpId/accounts" element={<AdminBpAccountsPage />} />
              <Route path="tracked-articles" element={<AdminBpTrackedArticlesPage />} />
              <Route path="accounts/:accountId/competitors" element={<AdminBpCompetitorsPage />} />
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
              <Route path="funding" element={<AdminFundingPage />} />
              <Route path="social-media" element={<AdminSocialMediaGenerator />} />
              <Route path="directory" element={<AdminDirectoryPage />} />
            </Route>
          </Route>

          {/* Catch-All */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <CookieBanner />
        
      </Router>
    </AnyThemeProvider>
  );
}

function AppWrapper() {
  return (
    <AuthProvider>
      <SnackbarProvider>
        <App />
      </SnackbarProvider>
    </AuthProvider>
  );
}

export default AppWrapper;