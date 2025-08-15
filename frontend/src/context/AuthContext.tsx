// frontend/src/context/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';
import axios from 'axios';
import apiClient from '../apiClient';
import { Region } from '../types/dashboard.types'; // Region wird weiterhin importiert

// === KORREKTUR: Fehlende Interfaces direkt hier definieren ===
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
}

export interface BusinessPartnerData {
    id: string;
    name: string;
    address: string | null;
    logo_url: string | null;
    subscription_start_date: string | null;
    subscription_end_date: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    text_color: string | null;
    background_color: string | null;
    accent_color?: string | null;
    primary_text_color: string | null;
    storage_tier: string;
    storage_limit_bytes: number;
    storage_usage_bytes: number;    
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<UserPayload | null>(null);
    const [businessPartner, setBusinessPartner] = useState<BusinessPartnerData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [tokenExp, setTokenExp] = useState<number | null>(null);

    const setDecodedTokenInfo = (token: string) => {
        try {
            const decoded: DecodedToken = jwtDecode(token);
            setUser(decoded.user);
            setTokenExp(decoded.exp);
            localStorage.setItem('jwt_token', token);
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
        console.log('[AuthContext] Führe fetchBusinessPartnerData aus...');
        const token = localStorage.getItem('jwt_token');
        
        if (!token || !user?.business_partner_id) {
            console.error('[AuthContext] fetchBusinessPartnerData ABGEBROCHEN. Grund:', {
                hasToken: !!token,
                userObject: user,
                hasUserBpId: !!user?.business_partner_id
            });
            setBusinessPartner(null);
            return;
        }

        console.log(`[AuthContext] Sende Anfrage an /api/business-partner/me für BP ID: ${user.business_partner_id}`);
        try {
            const response = await apiClient.get('/api/business-partner/me', {
                headers: { 'x-auth-token': token },
            });
            console.log('%c[AuthContext] ERFOLG! Antwort von /api/business-partner/me:', 'color: green; font-weight: bold;', response.data);
            setBusinessPartner(response.data);
        } catch (error) {
            console.error('%c[AuthContext] FEHLER beim Laden der Business Partner Daten:', 'color: red; font-weight: bold;', error);
            setBusinessPartner(null);
        }
    }, [user]);

    useEffect(() => {
        console.log('[AuthContext] useEffect für User-Änderung getriggert. Aktueller User-State:', user);
        if (user && user.business_partner_id) {
            console.log('[AuthContext] User hat eine business_partner_id. Rufe fetchBusinessPartnerData auf.');
            fetchBusinessPartnerData();
        } else {
            console.log('[AuthContext] User hat KEINE business_partner_id oder ist null. Setze businessPartner auf null.');
            setBusinessPartner(null);
        }
    }, [user, fetchBusinessPartnerData]);

    const login = (token: string, userData: UserPayload) => {
        console.log('[AuthContext] login-Funktion aufgerufen. Setze User-State:', userData);
        localStorage.setItem('jwt_token', token);
        setUser(userData);
        try {
            const decoded: DecodedToken = jwtDecode(token);
            setTokenExp(decoded.exp);
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
    };

    const renewSession = async () => {
        try {
            const oldToken = localStorage.getItem('jwt_token');
            const response = await apiClient.post('/api/session/renew', {}, {
                headers: { 'x-auth-token': oldToken }
            });
            const { token: newToken } = response.data;
            if (newToken) {
                setDecodedTokenInfo(newToken);
            }
        } catch (error) {
            console.error("Sitzungserneuerung fehlgeschlagen:", error);
            logout();
        }
    };

    const updateUser = (newUserData: Partial<UserPayload>) => {
        setUser(prevUser => {
            if (!prevUser) return null;
            return { ...prevUser, ...newUserData };
        });
    };

    const value = {
        isAuthenticated: !!user, user, businessPartner, isLoading, tokenExp,
        login, logout, renewSession, fetchBusinessPartnerData,
        updateUser
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
