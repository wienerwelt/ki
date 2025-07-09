// frontend/src/context/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';
import axios from 'axios';
import apiClient from '../apiClient';
// KORREKTUR: Die neue, zentrale Region-Definition wird importiert
import { Region } from '../types/dashboard.types';

// --- Interfaces ---

interface BusinessPartnerData {
    id: string; name: string; address: string; logo_url: string;
    subscription_start_date: string; subscription_end_date: string;
    primary_color: string; secondary_color: string; text_color: string;
    background_color: string; accent_color?: string;
}

// Die lokale Region-Definition wird entfernt.

interface UserPayload {
    id: string;
    username: string; 
    role: string;
    business_partner_id: string | null;
    business_partner_name: string | null;
    dashboard_title: string | null;
    regions: Region[] | null; // Verwendet jetzt den korrekten, zentralen Region-Typ
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
    login: (token: string) => void;
    logout: () => void;
    renewSession: () => Promise<void>;
    fetchBusinessPartnerData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<UserPayload | null>(null);
    const [businessPartner, setBusinessPartner] = useState<BusinessPartnerData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [tokenExp, setTokenExp] = useState<number | null>(null);

    const setDecodedTokenInfo = (token: string) => {
        const decoded: DecodedToken = jwtDecode(token);
        setUser(decoded.user);
        setTokenExp(decoded.exp);
        localStorage.setItem('jwt_token', token);
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
            const response = await axios.get('http://localhost:5000/api/business-partner/me', {
                headers: { 'x-auth-token': token },
            });
            setBusinessPartner(response.data);
        } catch (error) {
            console.error('Error fetching business partner data:', error);
            setBusinessPartner(null);
        }
    }, [user?.business_partner_id]);

    useEffect(() => {
        if (user && user.business_partner_id) {
            fetchBusinessPartnerData();
        } else {
            setBusinessPartner(null);
        }
    }, [user, fetchBusinessPartnerData]);

    const login = (token: string) => {
        try {
            setDecodedTokenInfo(token);
        } catch (e) {
            console.error("Failed to decode token on login", e);
            logout();
        }
    };

    const logout = () => {
        localStorage.removeItem('jwt_token');
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

    const value = {
        isAuthenticated: !!user, user, businessPartner, isLoading, tokenExp,
        login, logout, renewSession, fetchBusinessPartnerData
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
