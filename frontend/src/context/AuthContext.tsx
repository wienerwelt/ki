// frontend/src/context/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from 'react';
import { jwtDecode } from 'jwt-decode';
import apiClient from '../apiClient';
import { Region } from '../types/dashboard.types';
import i18n from 'i18next';
import posthog from 'posthog-js';

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
}

export interface BusinessPartnerData {
  id: string;
  name: string;
  address: string | null;
  logo_url: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  storage_tier: string;
  storage_limit_bytes: number;
  storage_usage_bytes: number;
  color_scheme: ColorScheme | null;
  dashboard_title?: string | null;
}

interface DecodedTokenAny {
  [key: string]: any;
  exp?: number;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: UserPayload | null;
  businessPartner: BusinessPartnerData | null;
  isLoading: boolean;
  tokenExp: number | null;
  login: (token: string, userData: UserPayload) => void;
  logout: () => void;
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const JWT_TOKEN_KEY = 'jwt_token';

function setStoredToken(token: string | null) {
  try {
    if (token) localStorage.setItem(JWT_TOKEN_KEY, token);
    else localStorage.removeItem(JWT_TOKEN_KEY);
  } catch {}
}

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(JWT_TOKEN_KEY);
  } catch {
    return null;
  }
}

function extractUserFromDecoded(decoded: DecodedTokenAny): Partial<UserPayload> | null {
  if (!decoded || typeof decoded !== 'object') return null;
  const rawUser = decoded.user && typeof decoded.user === 'object' ? decoded.user : decoded;
  const id = rawUser.id || rawUser.userId || rawUser.sub || null;
  if (!id) return null;

  return {
    id,
    email: rawUser.email || null,
    username: rawUser.username || null,
    role: rawUser.role || 'user',
    business_partner_id: rawUser.business_partner_id ?? null,
    regions: rawUser.regions ?? [],
    preferred_theme: rawUser.preferred_theme,
    preferred_language: rawUser.preferred_language,
    contribution_score: rawUser.contribution_score ?? 0, // <-- DIESE ZEILE HINZUFÜGEN
  } as Partial<UserPayload>;
}


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
    } catch (error) {
        console.error('Fehler beim Laden der globalen User-Tags:', error);
        setUserTags([]);
    }
  }, [user]); // Abhängig von `user`  

  const fetchBusinessPartnerData = useCallback(async () => {
    if (!user) return;

    try {
      const response = await apiClient.get('/api/data/dashboard/config');
      const { businessPartner: bp, user: freshUserData } = response.data;
      
      setBusinessPartner(bp || null);

      if (freshUserData) {
        updateUser({
          regions: freshUserData.regions || [],
          preferred_theme: freshUserData.preferred_theme,
          preferred_language: freshUserData.preferred_language,
        });
      }
    } catch (error) {
      console.error('Fehler beim Laden der Dashboard-Konfiguration:', error);
      setBusinessPartner(null);
    }
  }, [user, updateUser]);


  const initializeFromToken = useCallback(async (token: string) => {
    try {
      const decoded: DecodedTokenAny = jwtDecode(token);
      setTokenExp(decoded.exp ?? null);
      setStoredToken(token);

      const partialUser = extractUserFromDecoded(decoded);
      if (partialUser) {
        setUser(partialUser as UserPayload);
      } else {
        throw new Error("Kein gültiger User im Token gefunden.");
      }
    } catch (e) {
      console.error('Token konnte nicht dekodiert werden', e);
      setStoredToken(null);
      setUser(null);
      setTokenExp(null);
    }
  }, []);


  const refreshUser = useCallback(async () => {
        try {
            const { data: refreshedUser } = await apiClient.get<UserPayload>('/api/users/me');
            if (refreshedUser) {
                updateUser(refreshedUser);
            }
        } catch (error) {
            console.error("Fehler beim Aktualisieren der Benutzerdaten:", error);
        }
  }, [updateUser]);


useEffect(() => {
    const bootstrap = async () => {
      setIsLoading(true);
      setConfigLoaded(false);
      setUserTags([]); // Sicherstellen, dass Tags leer sind
      const token = getStoredToken();
      if (token) {
        // Schritt 1: User *initial* aus Token laden (wie bisher)
        await initializeFromToken(token);
        
        // --- NEU: Schritt 2: Sofort aktuelle Daten holen ---
        // Ruft /api/users/me auf, um den Score und andere Daten zu aktualisieren
        // bevor die App als "geladen" gilt.
        if (getStoredToken()) { // Nur wenn Token noch gültig ist
             try {
                 await refreshUser(); // Holt frische User-Daten inkl. Score
             } catch (refreshError) {
                  console.error("Fehler beim initialen User-Refresh:", refreshError);
                  // Optional: Bei Fehler hier ausloggen? logout();
             }
        }
        // --- ENDE NEU ---

      }
      setIsLoading(false); 
    };
    bootstrap();
  }, [initializeFromToken, refreshUser]); // <-- refreshUser als Abhängigkeit hinzugefügt

  useEffect(() => {
     if (user && !isLoading && !configLoaded) {
       // Lädt BP-Daten und Tags NACHDEM der User (inkl. aktuellem Score) geladen ist
       Promise.all([fetchBusinessPartnerData(), refreshUserTags()]).then(() => {
         setConfigLoaded(true);
       });
     } else if (!user && !isLoading) {
       setBusinessPartner(null);
       setUserTags([]); 
     }
  }, [user, isLoading, configLoaded, fetchBusinessPartnerData, refreshUserTags]);

  const login = useCallback((token: string, userData: UserPayload) => {
    setStoredToken(token);
    try {
      const d: any = jwtDecode(token);
      setTokenExp(typeof d.exp === 'number' ? d.exp : null);
    } catch {}
    setConfigLoaded(false);
    setUser(userData);
    posthog.identify(userData.id, {
      email: userData.email,
      name: userData.username,
    });
  }, []);

  const logout = () => {
    setStoredToken(null);
    setUser(null);
    setBusinessPartner(null);
    setTokenExp(null);
    setConfigLoaded(false);
    setUserTags([]);
    posthog.reset();
  };
  
  const renewSession = async () => {};

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