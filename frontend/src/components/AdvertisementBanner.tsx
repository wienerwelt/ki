import React, { useState, useEffect, useRef } from 'react';
import { Box, IconButton, Typography, LinearProgress } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useAuth } from '../context/AuthContext';

interface AdvertisementBannerProps {
    content: string;
    onClose: () => void;
}

const AdvertisementBanner: React.FC<AdvertisementBannerProps> = ({ content, onClose }) => {
    const { businessPartner } = useAuth();
    const [remainingTime, setRemainingTime] = useState(60000); // Countdown in Millisekunden
    const requestRef = useRef<number>();
    const startTimeRef = useRef<number>();

    useEffect(() => {
        // Startzeitpunkt der Animation speichern
        startTimeRef.current = performance.now();

        const animate = (time: number) => {
            if (!startTimeRef.current) return;

            const elapsedTime = time - startTimeRef.current;
            const newRemainingTime = 60000 - elapsedTime;

            if (newRemainingTime <= 0) {
                setRemainingTime(0);
                onClose();
            } else {
                setRemainingTime(newRemainingTime);
                requestRef.current = requestAnimationFrame(animate);
            }
        };

        requestRef.current = requestAnimationFrame(animate);

        // Animation beim Unmounten der Komponente bereinigen
        return () => {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        };
    }, [onClose]);

    // Berechne den Fortschritt für den Ladebalken und die angezeigten Sekunden
    const progress = (remainingTime / 60000) * 100;
    const secondsLeft = Math.ceil(remainingTime / 1000);

    return (
        <Box
            sx={{
                height: '40px', // Höhe auf 40px reduziert
                backgroundColor: businessPartner?.secondary_color || 'secondary.main',
                py: 0.5,
                px: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            <Typography 
                variant="body2" 
                component="div"
                dangerouslySetInnerHTML={{ __html: content }}
                sx={{
                    color: '#000000',
                    textAlign: 'center',
                    '& a': {
                        color: '#000000',
                        fontWeight: 'bold',
                        textDecoration: 'underline',
                    },
                }}
            />
            <Box sx={{ position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: '#000000', mr: 1 }}>
                    {secondsLeft}s
                </Typography>
                <IconButton
                    size="small"
                    onClick={onClose}
                    sx={{
                        color: '#000000',
                    }}
                >
                    <CloseIcon fontSize="small" />
                </IconButton>
            </Box>

            <LinearProgress
                variant="determinate"
                value={progress}
                sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: '100%',
                    height: '2px',
                    backgroundColor: 'rgba(255,255,255,0.3)',
                    '& .MuiLinearProgress-bar': {
                        backgroundColor: businessPartner?.primary_color || 'primary.main',
                    },
                }}
            />
        </Box>
    );
};

export default AdvertisementBanner;
