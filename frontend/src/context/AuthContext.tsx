// frontend/src/context/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from 'react';
import apiClient from '../apiClient';
import { Region } from '../types/dashboard.types';
import i18n from 'i18next';
import posthog from 'posthog-js';
import { getPartnerPublicPath, rememberPartnerSlug } from '../utils/partnerNavigation';

interface ColorScheme {
  id: string;
  name: string;
  primary_color: string;
  primary_text_color: string;
  secondary_color: string;
  text_color_light: string;
  background_color_light: string;
  paper_color_light: string;
  text_color_dark: string;
  background_color_dark: string;
  paper_color_dark: string;
}

export interface UserPayload {
  id: string;
  username: string;
  email: string;
  role: string;
  business_partner_id: string | null;
  business_partner_name: string | null;
  business_partner_category?: string | null;
  dashboard_title: string | null;
  regions: Region[] | null;
  contribution_score: number;
  membership_level: string | null;
  has_seen_welcome_widget: boolean;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  linkedin_url: string | null;
  article_score_min: number | null;
  article_score_max: number | null;
  preferred_theme?: 'light' | 'dark';
  preferred_language?: 'de' | 'en';
  newsletter_opt_in?: boolean;
  briefing_email_enabled?: boolean;
  profile_image_url?: string | null;
  has_completed_onboarding?: boolean;
}

export interface BusinessPartnerData {
  id: string;
  name: string;
  slug?: string | null;
  url_businesspartner?: string | null;
  address: string | null;
  logo_url: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  storage_tier: string;
  storage_limit_bytes: number;
  storage_usage_bytes: number;
  color_scheme: ColorScheme | null;
  dashboard_title?: string | null;
  allow_automated_newsletter?: boolean;
  newsletter_frequency?: 'daily' | 'weekly' | 'monthly' | 'never';
  newsletter_delivery_mode?: 'mobiliti' | 'export' | 'external';
  newsletter_external_signup_url?: string | null;
  newsletter_recipient_limit?: number;
  dashboard_focus?: 'information' | 'sales';
  favicon_url?: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: UserPayload | null;
  businessPartner: BusinessPartnerData | null;
  isLoading: boolean;
  tokenExp: number | null;
  login: (userData: UserPayload, sessionExpiresAt?: string | null) => void;
  logout: () => Promise<string>;
  renewSession: () => Promise<void>;
  updateUser: (newUserData: Partial<UserPayload>) => void;
  fetchBusinessPartnerData: () => Promise<void>;
  themeMode: 'light' | 'dark';
  setThemeMode: (mode: 'light' | 'dark') => void;
  language: 'de' | 'en';
  setLanguage: (lang: 'de' | 'en') => void;
  dashboardRefreshKey: number;
  triggerDashboardRefresh: () => void;
  refreshUser: () => Promise<void>;  
  userTags: string[];
  refreshUserTags: () => Promise<void>;
  setPartnerByCode: (code: string) => Promise<void>; // ✅ NEU hinzugefügt
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserPayload | null>(null);
  const [businessPartner, setBusinessPartner] = useState<BusinessPartnerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tokenExp, setTokenExp] = useState<number | null>(null);
  const [themeMode, setThemeModeState] = useState<'light' | 'dark'>('light');
  const [language, setLanguageState] = useState<'de' | 'en'>('de');
  const [configLoaded, setConfigLoaded] = useState(false);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [userTags, setUserTags] = useState<string[]>([]);

useEffect(() => {
    const syncPostHogConsent = () => {
      const consentStr = localStorage.getItem('cookie_preferences');
      if (consentStr) {
        try {
          const consent = JSON.parse(consentStr);
          if (consent.analytics === true) {
            posthog.opt_in_capturing(); // Tracking AN
          } else {
            posthog.opt_out_capturing(); // Tracking AUS
          }
        } catch (e) {
          console.error("Fehler beim Lesen der Cookie-Präferenzen", e);
        }
      } else {
        // Fallback: Wenn noch nichts bestätigt wurde, bleibt Tracking strikt aus
        posthog.opt_out_capturing(); 
      }
    };

    // 1. Direkt beim Start der App prüfen
    syncPostHogConsent();

    // 2. Auf Klicks im Cookie-Banner oder der Settings-Seite lauschen
    window.addEventListener('cookie_consent_updated', syncPostHogConsent);

    return () => {
      window.removeEventListener('cookie_consent_updated', syncPostHogConsent);
    };
  }, []);
  // ==========================================

  const triggerDashboardRefresh = () => {
    setDashboardRefreshKey(prevKey => prevKey + 1);
  };

  const updateUser = useCallback((newUserData: Partial<UserPayload>) => {
    setUser((prevUser) => {
      if (!prevUser) return null;
      const updatedUser = { ...prevUser, ...newUserData };
      
      if (newUserData.preferred_theme && ['light', 'dark'].includes(newUserData.preferred_theme)) {
        setThemeModeState(newUserData.preferred_theme);
      }
      if (newUserData.preferred_language && ['de', 'en'].includes(newUserData.preferred_language)) {
        setLanguageState(newUserData.preferred_language);
        i18n.changeLanguage(newUserData.preferred_language);
      }
      return updatedUser;
    });
  }, []);

const refreshUserTags = useCallback(async () => {
    if (!user) {
       setUserTags([]);
       return;
    }
    try {
        const { data } = await apiClient.get('/api/users/tags');
        setUserTags(data || []);
    } catch (error: any) {
        // AbortErrors stumm schalten
        if (error.name === 'AbortError' || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return;
        
        console.error('Fehler beim Laden der globalen User-Tags:', error);
        setUserTags([]);
    }
  }, [user]);

const fetchBusinessPartnerData = useCallback(async () => {
    if (!user) return;
    try {
      const response = await apiClient.get('/api/data/dashboard/config');
      const { businessPartner: bp } = response.data; 
      rememberPartnerSlug(bp?.slug);
      setBusinessPartner(bp || null);
    } catch (error: any) {
      // AbortErrors ignorieren, um Branding-Reset zu verhindern!
      if (error.name === 'AbortError' || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return;
      
      console.error('Fehler beim Laden der Dashboard-Konfiguration:', error);
      setBusinessPartner(null);
    }
  }, [user]);


const setPartnerByCode = useCallback(async (code: string) => {
  if (!code) return;
  try {
    // Wir nutzen den Endpoint, den wir gerade im publicController gefunden haben
    const { data } = await apiClient.get(`/api/public/context?partnerCode=${code}`);
    
    if (data && data.partner) {
      // WICHTIG: Dein Backend liefert das Schema als "theme". 
      // Dein Frontend erwartet es aber (laut DashboardLayout) unter "color_scheme".
      // Wir "verheiraten" beide hier:
      const fullPartnerData = {
        ...data.partner,
        color_scheme: data.theme // Wir mappen "theme" auf "color_scheme"
      };
      
      rememberPartnerSlug(fullPartnerData.slug);
      setBusinessPartner(fullPartnerData);
      console.log("Branding erfolgreich geladen:", fullPartnerData);
    }
  } catch (error) {
    console.error('Fehler beim Laden des öffentlichen Partner-Kontexts:', error);
  }
}, []);

const refreshUser = useCallback(async () => {
    try {
        const { data: refreshedUser } = await apiClient.get<UserPayload>('/api/users/me');
        if (refreshedUser) {
            updateUser(refreshedUser);
        }
    } catch (error: any) {
        // AbortErrors stumm schalten
        if (error.name === 'AbortError' || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return;
        
        console.error("Fehler beim Aktualisieren der Benutzerdaten:", error);
    }
  }, [updateUser]);


useEffect(() => {
    const bootstrap = async () => {
      setIsLoading(true);
      setConfigLoaded(false);
      setUserTags([]);
      try {
        localStorage.removeItem('jwt_token');
        localStorage.removeItem('token');
      } catch {}
      try {
        const response = await fetch('/api/users/me', { credentials: 'include' });
        if (!response.ok) throw new Error('Keine aktive Sitzung');
        const currentUser = await response.json();
        setUser(currentUser);

        const statusResponse = await fetch('/api/session/status', { credentials: 'include' });
        if (statusResponse.ok) {
          const status = await statusResponse.json();
          setTokenExp(status.expiresAt ? Math.floor(new Date(status.expiresAt).getTime() / 1000) : null);
        }
      } catch (_error) {
        setUser(null);
        setTokenExp(null);
      } finally {
        setIsLoading(false);
      }
    };
    bootstrap();
  }, []);

  useEffect(() => {
     if (user && !isLoading && !configLoaded) {
       Promise.all([fetchBusinessPartnerData(), refreshUserTags()]).then(() => {
         setConfigLoaded(true);
       });
     } else if (!user && !isLoading) {
       // Hier laden wir keine BP-Daten automatisch, da dies nun 
       // ggf. durch setPartnerByCode in der LoginForm getriggert wird.
     }
  }, [user, isLoading, configLoaded, fetchBusinessPartnerData, refreshUserTags]);

  const login = useCallback((userData: UserPayload, sessionExpiresAt?: string | null) => {
    setTokenExp(sessionExpiresAt ? Math.floor(new Date(sessionExpiresAt).getTime() / 1000) : null);
    setConfigLoaded(false);
    setUser(userData);
    posthog.identify(userData.id, {
      email: userData.email,
      name: userData.username,
    });
  }, []);

  const logout = useCallback(async () => {
    const publicPath = getPartnerPublicPath(businessPartner?.slug);
    try {
      await apiClient.post('/api/auth/logout');
    } finally {
      setUser(null);
      setBusinessPartner(null);
      setTokenExp(null);
      setConfigLoaded(false);
      setUserTags([]);
      posthog.reset();
    }
    return publicPath;
  }, [businessPartner?.slug]);
  
  const renewSession = async () => {
    const { res, data } = await apiClient.post<{ expiresAt?: string }>('/api/session/renew');
    if (!res.ok) throw new Error('Sitzung konnte nicht verlängert werden.');
    setTokenExp(data?.expiresAt ? Math.floor(new Date(data.expiresAt).getTime() / 1000) : null);
    await refreshUser();
  };

  const setThemeMode = (mode: 'light' | 'dark') => {
    updateUser({ preferred_theme: mode });
    apiClient.put('/api/users/me', { preferred_theme: mode }).catch(() => {});
  };

  const setLanguage = (lang: 'de' | 'en') => {
    updateUser({ preferred_language: lang });
    apiClient.put('/api/users/me', { preferred_language: lang }).catch(() => {});
  };

  const value: AuthContextType = {
    isAuthenticated: !!user,
    user,
    businessPartner,
    isLoading,
    tokenExp,
    login,
    logout,
    renewSession,
    updateUser,
    fetchBusinessPartnerData,
    themeMode,
    setThemeMode,
    language,
    setLanguage,
    dashboardRefreshKey,
    triggerDashboardRefresh,    
    refreshUser, 
    userTags,
    refreshUserTags,
    setPartnerByCode,
  };

  return (
    <AuthContext.Provider value={value}>
      {!isLoading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
