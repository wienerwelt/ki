// frontend/src/App.tsx
/// <reference types="vite/client" />

import React, { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, createTheme, Theme } from '@mui/material/styles';
import { CssBaseline, Box, CircularProgress } from '@mui/material';
import { SnackbarProvider } from './context/SnackbarContext';

// CookieBanner bleibt klein und global. Das DashboardLayout wird lazy geladen,
// damit öffentliche Seiten nicht die komplette Dashboard-Shell mitladen.
import CookieBanner from './components/CookieBanner';
import PwaUpdatePrompt from './components/PwaUpdatePrompt';

const DashboardLayout = lazy(() => import('./components/DashboardLayout'));

// Öffentliche Seiten – lazy, damit sie nicht alle im Hauptbundle landen.
const PublicPortalPage = lazy(() => import('./pages/PublicPortalPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const DisclaimerPage = lazy(() => import('./pages/DisclaimerPage'));
const CookieSettingsPage = lazy(() => import('./pages/CookieSettingsPage'));
const NewsletterConfirmed = lazy(() => import('./pages/NewsletterConfirmed'));
const FundingSearchPage = lazy(() => import('./pages/FundingSearchPage'));
const FundingDetailPage = lazy(() => import('./pages/FundingDetailPage'));
const PublicProfileCard = lazy(() => import('./pages/PublicProfileCard'));
const PublicBpCard = lazy(() => import('./pages/PublicBpCard'));

// Geschützte Seiten – route-level code splitting.
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SearchResultsPage = lazy(() => import('./pages/SearchResultsPage'));
const AiAskPage = lazy(() => import('./pages/AiAskPage'));
const CommunityPage = lazy(() => import('./pages/CommunityPage'));
const TrustedSourcesPage = lazy(() => import('./pages/TrustedSourcesPage'));
const FeedbackCenterPage = lazy(() => import('./pages/FeedbackCenterPage'));
const FileManagementPage = lazy(() => import('./pages/FileManagementPage'));
const InternalDirectoryPage = lazy(() => import('./pages/InternalDirectoryPage'));

// Admin / Assistenz Seiten – getrennte Chunks, werden erst bei Aufruf geladen.
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const AdminBusinessPartnersPage = lazy(() => import('./pages/AdminBusinessPartnersPage'));
const AdminUserManagementPage = lazy(() => import('./pages/AdminUserManagementPage'));
const AdminWidgetTypesPage = lazy(() => import('./pages/AdminWidgetTypesPage'));
const AdminBpWidgetAccessPage = lazy(() => import('./pages/AdminBpWidgetAccessPage'));
const AdminScrapedContentPage = lazy(() => import('./pages/AdminScrapedContentPage'));
const AdminScrapingRulesPage = lazy(() => import('./pages/AdminScrapingRulesPage'));
const AdminAIPromptRulesPage = lazy(() => import('./pages/AdminAIPromptRulesPage'));
const AdminAIContentPage = lazy(() => import('./pages/AdminAIContentPage'));
const AdminCategoriesPage = lazy(() => import('./pages/AdminCategoriesPage'));
const AdminTagsPage = lazy(() => import('./pages/AdminTagsPage'));
const AdminMonitorPage = lazy(() => import('./pages/AdminMonitorPage'));
const AdminStatisticsPage = lazy(() => import('./pages/AdminStatisticsPage'));
const AdminAdvertisementsPage = lazy(() => import('./pages/AdminAdvertisementsPage'));
const AdminBpActionsPage = lazy(() => import('./pages/AdminBpActionsPage'));
const AdminCronjobsPage = lazy(() => import('./pages/AdminCronjobsPage'));
const AdminSourcesPage = lazy(() => import('./pages/AdminSourcesPage'));
const AdminEventsPage = lazy(() => import('./pages/AdminEventsPage'));
const AdminSurveysPage = lazy(() => import('./pages/AdminSurveysPage'));
const AdminFundingPage = lazy(() => import('./pages/AdminFundingPage'));
const AdminBpAccountsPage = lazy(() => import('./pages/AdminBpAccountsPage'));
const AdminBpCompetitorsPage = lazy(() => import('./pages/AdminBpCompetitorsPage'));
const AdminBpTrackedArticlesPage = lazy(() => import('./pages/AdminBpTrackedArticlesPage'));
const AdminCommunityPage = lazy(() => import('./pages/AdminCommunityPage'));
const AdminLegalMonitorPage = lazy(() => import('./pages/AdminLegalMonitorPage'));
const AdminEditorialBriefingPage = lazy(() => import('./pages/AdminEditorialBriefingPage'));
const AdminSocialMediaGenerator = lazy(() => import('./pages/AdminSocialMediaGenerator'));
const AdminDirectoryPage = lazy(() => import('./pages/AdminDirectoryPage'));

const PageLoader: React.FC = () => (
  <Box
    sx={{
      width: '100%',
      minHeight: { xs: 96, sm: 140 },
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      bgcolor: 'transparent',
      pointerEvents: 'none',
    }}
  >
    <CircularProgress size={28} />
  </Box>
);

const InitialLoader: React.FC = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <CircularProgress />
  </Box>
);

const LazyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<PageLoader />}>{children}</Suspense>
);

const lazyRoute = (element: React.ReactElement) => <LazyRoute>{element}</LazyRoute>;

// --- ROUTE GUARDS ---
const ProtectedRoutes: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <InitialLoader />;
  }

  return user ? (
    <Suspense fallback={<PageLoader />}>
      <DashboardLayout>
        <Outlet />
      </DashboardLayout>
    </Suspense>
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

      const newTheme = createTheme({
        palette: {
          mode: themeMode,
          primary: {
            main: scheme?.primary_color || '#2196f3',
            contrastText: scheme?.primary_text_color || '#fff',
          },
          secondary: {
            main: scheme?.secondary_color || '#ff9800',
          },
          text: {
            primary:
              themeMode === 'light'
                ? scheme?.text_color_light || '#333333'
                : scheme?.text_color_dark || '#ffffff',
          },
          background: {
            default:
              themeMode === 'light'
                ? scheme?.background_color_light || '#f4f6f8'
                : '#0a0a0a',
            paper:
              themeMode === 'light'
                ? scheme?.paper_color_light || '#ffffff'
                : '#1e1e1e',
          },
        },
        components: {
          MuiPaper: {
            styleOverrides: {
              root: {
                backgroundImage: 'none',
              },
            },
          },
        },
      });
      setCurrentTheme(newTheme);

      if (businessPartner) {
        document.title = businessPartner.dashboard_title || `${businessPartner.name} Dashboard`;

        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor && scheme?.primary_color) {
          metaThemeColor.setAttribute('content', scheme.primary_color);
        }

        const faviconLink = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
        if (faviconLink) {
          if (businessPartner.favicon_url) {
            faviconLink.href = businessPartner.favicon_url;
          } else if (scheme?.primary_color) {
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
        document.title = 'Mobiliti Intelligence';
        const faviconLink = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
        if (faviconLink) faviconLink.href = '/favicon.svg';
      }
    }
  }, [businessPartner, isLoading, themeMode]);

  if (!currentTheme) {
    return <InitialLoader />;
  }

  const AnyThemeProvider = ThemeProvider as any;

  return (
    <AnyThemeProvider theme={currentTheme}>
      <CssBaseline />
      <PwaUpdatePrompt />
      <Router>
        <Routes>
          {/* Öffentliche Routen */}
          <Route path="/" element={lazyRoute(<PublicPortalPage />)} />
          <Route path="/login" element={lazyRoute(<PublicPortalPage />)} />
          <Route path="/register" element={lazyRoute(<PublicPortalPage isRegister={true} />)} />
          <Route path="/forgot-password" element={lazyRoute(<ForgotPasswordPage />)} />
          <Route path="/reset-password/:token" element={lazyRoute(<ResetPasswordPage />)} />
          <Route path="/verify-email/:token" element={lazyRoute(<VerifyEmailPage />)} />
          <Route path="/terms" element={lazyRoute(<TermsPage />)} />
          <Route path="/privacy" element={lazyRoute(<PrivacyPage />)} />
          <Route path="/disclaimer" element={lazyRoute(<DisclaimerPage />)} />
          <Route path="/cookie-settings" element={lazyRoute(<CookieSettingsPage />)} />
          <Route path="/newsletter/confirmed" element={lazyRoute(<NewsletterConfirmed />)} />
          <Route path="/p/:userId" element={lazyRoute(<PublicProfileCard />)} />
          <Route path="/invite/:bpId" element={lazyRoute(<PublicBpCard />)} />

          {/* Dynamische Route für Partner-Slugs, z. B. /vfa */}
          <Route path="/:partnerSlug" element={lazyRoute(<PublicPortalPage />)} />

          {/* Geschützte Dashboard-Routen */}
          <Route element={<ProtectedRoutes />}>
            <Route path="/dashboard" element={lazyRoute(<DashboardPage />)} />
            <Route path="/profile" element={lazyRoute(<ProfilePage />)} />
            <Route path="/search" element={lazyRoute(<SearchResultsPage />)} />
            <Route path="/ask" element={lazyRoute(<AiAskPage />)} />
            <Route path="/trusted-sources" element={lazyRoute(<TrustedSourcesPage />)} />
            <Route path="/feedback" element={lazyRoute(<FeedbackCenterPage />)} />
            <Route path="/files" element={lazyRoute(<FileManagementPage />)} />
            <Route path="/funding-search" element={lazyRoute(<FundingSearchPage />)} />
            <Route path="/funding-detail/:id" element={lazyRoute(<FundingDetailPage />)} />
            <Route path="/community" element={lazyRoute(<CommunityPage />)} />
            <Route path="/directory" element={lazyRoute(<InternalDirectoryPage />)} />

            {/* Assistenz & Admin Routen */}
            <Route element={<BpStaffAllowedRoutes />}>
              <Route path="/admin/users" element={lazyRoute(<AdminUserManagementPage />)} />
              <Route path="/admin/users/:businessPartnerId" element={lazyRoute(<AdminUserManagementPage />)} />
              <Route path="/admin/actions" element={lazyRoute(<AdminBpActionsPage />)} />
              <Route path="/admin/surveys" element={lazyRoute(<AdminSurveysPage />)} />
              <Route path="/admin/community" element={lazyRoute(<AdminCommunityPage />)} />
              <Route path="/admin/legal-monitor" element={lazyRoute(<AdminLegalMonitorPage />)} />
              <Route path="/admin/briefing-editorial" element={lazyRoute(<AdminEditorialBriefingPage />)} />
            </Route>

            {/* Admin-Only Routen */}
            <Route path="/admin" element={<AdminRoutes />}>
              <Route index element={lazyRoute(<AdminDashboardPage />)} />
              <Route path="business-partners" element={lazyRoute(<AdminBusinessPartnersPage />)} />
              <Route path="business-partners/:bpId/accounts" element={lazyRoute(<AdminBpAccountsPage />)} />
              <Route path="tracked-articles" element={lazyRoute(<AdminBpTrackedArticlesPage />)} />
              <Route path="accounts/:accountId/competitors" element={lazyRoute(<AdminBpCompetitorsPage />)} />
              <Route path="widget-types" element={lazyRoute(<AdminWidgetTypesPage />)} />
              <Route path="bp-widget-access" element={lazyRoute(<AdminBpWidgetAccessPage />)} />
              <Route path="bp-widget-access/:bpId" element={lazyRoute(<AdminBpWidgetAccessPage />)} />
              <Route path="scraped-content" element={lazyRoute(<AdminScrapedContentPage />)} />
              <Route path="scraping-rules" element={lazyRoute(<AdminScrapingRulesPage />)} />
              <Route path="ai-prompt-rules" element={lazyRoute(<AdminAIPromptRulesPage />)} />
              <Route path="ai-content" element={lazyRoute(<AdminAIContentPage />)} />
              <Route path="categories" element={lazyRoute(<AdminCategoriesPage />)} />
              <Route path="tags" element={lazyRoute(<AdminTagsPage />)} />
              <Route path="monitor" element={lazyRoute(<AdminMonitorPage />)} />
              <Route path="statistics" element={lazyRoute(<AdminStatisticsPage />)} />
              <Route path="advertisements" element={lazyRoute(<AdminAdvertisementsPage />)} />
              <Route path="cronjobs" element={lazyRoute(<AdminCronjobsPage />)} />
              <Route path="sources" element={lazyRoute(<AdminSourcesPage />)} />
              <Route path="events" element={lazyRoute(<AdminEventsPage />)} />
              <Route path="funding" element={lazyRoute(<AdminFundingPage />)} />
              <Route path="social-media" element={lazyRoute(<AdminSocialMediaGenerator />)} />
              <Route path="directory" element={lazyRoute(<AdminDirectoryPage />)} />
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
