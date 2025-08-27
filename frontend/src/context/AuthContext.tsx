// frontend/src/context/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';
import apiClient from '../apiClient';
import { Region } from '../types/dashboard.types';
import i18n from 'i18next';
import posthog from 'posthog-js';

// === NEU: Interface für das Farbschema ===
interface ColorScheme {
    id: string;
    name: string;
    primary_color: string;
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
}

// === KORREKTUR: BusinessPartnerData verwendet jetzt das ColorScheme-Interface ===
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
    // Die alten Farb-Eigenschaften werden durch das neue Schema-Objekt ersetzt
    color_scheme: ColorScheme | null;
}

interface DecodedToken {
    user: UserPayload;
    iat: number;
    exp: number;
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
    fetchBusinessPartnerData: () => Promise<void>;
    updateUser: (newUserData: Partial<UserPayload>) => void;
    themeMode: 'light' | 'dark';
    setThemeMode: (mode: 'light' | 'dark') => void;
    language: 'de' | 'en';
    setLanguage: (lang: 'de' | 'en') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<UserPayload | null>(null);
    const [businessPartner, setBusinessPartner] = useState<BusinessPartnerData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [tokenExp, setTokenExp] = useState<number | null>(null);
    const [themeMode, setThemeModeState] = useState<'light' | 'dark'>('light');
    const [language, setLanguageState] = useState<'de' | 'en'>('de');

    const setDecodedTokenInfo = (token: string) => {
        try {
            const decoded: DecodedToken = jwtDecode(token);
            setUser(decoded.user);
            setTokenExp(decoded.exp);
            localStorage.setItem('jwt_token', token);
            
            setThemeModeState(decoded.user.preferred_theme || 'light');
            const userLang = decoded.user.preferred_language || 'de';
            setLanguageState(userLang);
            i18n.changeLanguage(userLang);
        } catch (e) {
            console.error("Failed to decode token", e);
            logout();
        }
    };

    useEffect(() => {
        const token = localStorage.getItem('jwt_token');
        if (token) {
            try {
                const decoded: DecodedToken = jwtDecode(token);
                if (decoded.exp * 1000 > Date.now()) {
                    setDecodedTokenInfo(token);
                } else {
                    localStorage.removeItem('jwt_token');
                }
            } catch (e) {
                console.error("Failed to decode token on initial load", e);
                localStorage.removeItem('jwt_token');
            }
        }
        setIsLoading(false);
    }, []);
    
    const fetchBusinessPartnerData = useCallback(async () => {
        const token = localStorage.getItem('jwt_token');
        if (!token || !user?.business_partner_id) {
            setBusinessPartner(null);
            return;
        }
        try {
            const response = await apiClient.get('/api/business-partner/me', {
                headers: { 'x-auth-token': token },
            });
            setBusinessPartner(response.data);
        } catch (error) {
            console.error('FEHLER beim Laden der Business Partner Daten:', error);
            setBusinessPartner(null);
        }
    }, [user]);

    useEffect(() => {
        if (user && user.business_partner_id) {
            fetchBusinessPartnerData();
        } else {
            setBusinessPartner(null);
        }
    }, [user, fetchBusinessPartnerData]);

    const login = (token: string, userData: UserPayload) => {
        localStorage.setItem('jwt_token', token);
        setUser(userData);
        try {
            const decoded: DecodedToken = jwtDecode(token);
            setTokenExp(decoded.exp);
            setThemeModeState(userData.preferred_theme || 'light');
            const userLang = userData.preferred_language || 'de';
            setLanguageState(userLang);
            i18n.changeLanguage(userLang);
            posthog.identify(
                userData.id,
                {
                    email: userData.email,
                    name: userData.username,
                    business_partner: userData.business_partner_name
                }
            );
        } catch (e) {
            console.error("Failed to decode token on login", e);
            logout();
        }
    };

    const logout = () => {
        localStorage.removeItem('jwt_token');
        localStorage.removeItem('closedAds');
        setUser(null);
        setBusinessPartner(null);        
        setTokenExp(null);
        posthog.reset();
    };

    const renewSession = async () => {
        // NEU: Aktuelle Einstellungen vor der Aktualisierung speichern
        const currentTheme = themeMode;
        const currentLang = language;

        try {
            const oldToken = localStorage.getItem('jwt_token');
            const response = await apiClient.post('/api/session/renew', {}, {
                headers: { 'x-auth-token': oldToken }
            });
            const { token: newToken } = response.data;
            if (newToken) {
                setDecodedTokenInfo(newToken);
                setThemeModeState(currentTheme);
                setLanguageState(currentLang);
                i18n.changeLanguage(currentLang);
            }
        } catch (error) {
            console.error("Sitzungserneuerung fehlgeschlagen:", error);
            logout();
        }
    };

    const updateUser = (newUserData: Partial<UserPayload>) => {
        setUser(prevUser => {
            if (!prevUser) return null;
            const updatedUser = { ...prevUser, ...newUserData };
            if (newUserData.preferred_theme) setThemeModeState(newUserData.preferred_theme);
            if (newUserData.preferred_language) {
                setLanguageState(newUserData.preferred_language);
                i18n.changeLanguage(newUserData.preferred_language);
            }
            return updatedUser;
        });
    };
    
    const setThemeMode = (mode: 'light' | 'dark') => {
        updateUser({ preferred_theme: mode });
    };
    const setLanguage = (lang: 'de' | 'en') => {
        updateUser({ preferred_language: lang });
    };

    const value = {
        isAuthenticated: !!user, user, businessPartner, isLoading, tokenExp,
        login, logout, renewSession, fetchBusinessPartnerData,
        updateUser,
        themeMode, setThemeMode, language, setLanguage
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