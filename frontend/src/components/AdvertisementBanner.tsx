import React, { useEffect, useMemo, useState } from 'react';
import { Box, IconButton, Typography, LinearProgress } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useAuth } from '../context/AuthContext';
import DOMPurify from 'dompurify';

interface AdvertisementBannerProps {
    content: string;
    onClose: () => void;
}

const BANNER_DURATION_SECONDS = 60;

const AdvertisementBanner: React.FC<AdvertisementBannerProps> = ({ content, onClose }) => {
    const { businessPartner } = useAuth();
    const [secondsLeft, setSecondsLeft] = useState(BANNER_DURATION_SECONDS);

    const primaryColor =
        (businessPartner as any)?.color_scheme?.primary_color ||
        (businessPartner as any)?.primary_color ||
        'primary.main';

    const secondaryColor =
        (businessPartner as any)?.color_scheme?.secondary_color ||
        (businessPartner as any)?.secondary_color ||
        'secondary.main';

    useEffect(() => {
        setSecondsLeft(BANNER_DURATION_SECONDS);

        const intervalId = window.setInterval(() => {
            setSecondsLeft((prev) => {
                if (prev <= 1) {
                    window.clearInterval(intervalId);
                    onClose();
                    return 0;
                }

                return prev - 1;
            });
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, [content, onClose]);

    const progress = useMemo(
        () => Math.max(0, Math.min(100, (secondsLeft / BANNER_DURATION_SECONDS) * 100)),
        [secondsLeft]
    );

    return (
        <Box
            sx={{
                height: 40,
                minHeight: 40,
                backgroundColor: secondaryColor,
                py: 0.5,
                px: { xs: 5.5, sm: 8 },
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
                borderBottom: '1px solid rgba(0,0,0,0.08)',
            }}
        >
            <Typography
                variant="body2"
                component="div"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content, { USE_PROFILES: { html: true } }) }}
                sx={{
                    color: '#000000',
                    textAlign: 'center',
                    fontWeight: 700,
                    lineHeight: 1.25,
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    '& a': {
                        color: '#000000',
                        fontWeight: 900,
                        textDecoration: 'underline',
                    },
                }}
            />

            <Box
                sx={{
                    position: 'absolute',
                    top: '50%',
                    right: 8,
                    transform: 'translateY(-50%)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                }}
            >
                <Typography variant="caption" sx={{ color: '#000000', fontWeight: 700, minWidth: 22, textAlign: 'right' }}>
                    {secondsLeft}s
                </Typography>
                <IconButton
                    size="small"
                    aria-label="Werbung schließen"
                    onClick={onClose}
                    sx={{ color: '#000000' }}
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
                    height: 2,
                    backgroundColor: 'rgba(255,255,255,0.3)',
                    '& .MuiLinearProgress-bar': {
                        backgroundColor: primaryColor,
                        transition: 'transform 1s linear',
                    },
                }}
            />
        </Box>
    );
};

export default AdvertisementBanner;
