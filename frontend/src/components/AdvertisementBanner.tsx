import React, { useState, useEffect } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useAuth } from '../context/AuthContext';
import apiClient from '../apiClient';

const AdvertisementBanner: React.FC = () => {
    const { businessPartner } = useAuth();
    const [ad, setAd] = useState<{ id: string; content: string } | null>(null);
    const [isVisible, setIsVisible] = useState(false);
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
                    setIsVisible(true);
                } else {
                    setIsVisible(false);
                }
            } catch (error) {
                console.error("Fehler beim Laden der Werbung:", error);
                setIsVisible(false);
            }
        };

        fetchAd();
    }, [token]);

    const handleClose = () => {
        setIsVisible(false);
        if (ad) {
            const closedAds = JSON.parse(localStorage.getItem('closedAds') || '[]');
            localStorage.setItem('closedAds', JSON.stringify([...closedAds, ad.id]));
        }
    };

    if (!isVisible || !ad) {
        return null;
    }

    return (
        <Box
            sx={{
                height: '80px', // NEU: Feste Höhe von 80px
                backgroundColor: businessPartner?.secondary_color || 'secondary.main',
                py: 0.5,
                px: 2,
                display: 'flex',
                alignItems: 'center', // NEU: Vertikal zentriert
                justifyContent: 'center', // NEU: Horizontal zentriert
                position: 'relative',
            }}
        >
            <Typography 
                variant="body2" 
                component="div"
                dangerouslySetInnerHTML={{ __html: ad.content }}
                sx={{
                    color: '#000000', // NEU: Schwarze Schriftfarbe
                    textAlign: 'center', // NEU: Text zentrieren
                    '& a': {
                        color: '#000000', // NEU: Auch Links in schwarz
                        fontWeight: 'bold',
                        textDecoration: 'underline',
                    },
                }}
            />
            <IconButton
                size="small"
                onClick={handleClose}
                sx={{
                    color: '#000000', // NEU: Schwarzes Icon
                    position: 'absolute',
                    top: 8, // Position angepasst für bessere Optik
                    right: 8,
                }}
            >
                <CloseIcon fontSize="small" />
            </IconButton>
        </Box>
    );
};

export default AdvertisementBanner;