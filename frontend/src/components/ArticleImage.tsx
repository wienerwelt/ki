import React, { useEffect, useState } from 'react';
import { Box, SxProps, Theme } from '@mui/material';
import ImageNotSupportedOutlinedIcon from '@mui/icons-material/ImageNotSupportedOutlined';

interface ArticleImageProps {
    src: string;
    alt: string;
    variant?: 'preview' | 'thumbnail' | 'detail';
    badges?: React.ReactNode;
    sx?: SxProps<Theme>;
}

// News photos must not be cropped: the source's entire image remains visible.
const ArticleImage: React.FC<ArticleImageProps> = ({ src, alt, variant = 'preview', badges, sx = [] }) => {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [src]);
    const thumbnail = variant === 'thumbnail';

    return (
        <Box sx={[
            {
                width: thumbnail ? 60 : '100%',
                height: thumbnail ? 60 : undefined,
                aspectRatio: variant === 'preview' ? '16 / 9' : undefined,
                maxHeight: variant === 'preview' ? 200 : undefined,
                borderRadius: variant === 'preview' ? 0 : thumbnail ? 1 : 2,
                bgcolor: 'action.hover', overflow: 'hidden', flexShrink: 0, position: 'relative', isolation: 'isolate',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            },
            ...(Array.isArray(sx) ? sx : [sx]),
        ]}>
            {failed ? (
                <Box role="img" aria-label={`Bild nicht verfügbar: ${alt}`} sx={{ p: 2, color: 'text.secondary' }}>
                    <ImageNotSupportedOutlinedIcon />
                </Box>
            ) : (
                <>
                {!thumbnail && (
                    <Box component="img" src={src} alt="" aria-hidden="true" loading="lazy" decoding="async"
                        sx={{
                            position: 'absolute', inset: 0, width: '100%', height: '100%',
                            objectFit: 'cover', filter: 'blur(10px)', transform: 'scale(1.05)',
                            opacity: 0.32, pointerEvents: 'none',
                        }} />
                )}
                <Box component="img" src={src} alt={alt} loading="lazy" decoding="async"
                    onError={() => setFailed(true)}
                    sx={{
                        display: 'block', width: '100%', position: 'relative',
                        height: variant === 'detail' ? 'auto' : '100%',
                        maxHeight: variant === 'detail' ? { xs: '45vh', sm: 350 } : '100%',
                        objectFit: 'contain', objectPosition: 'center',
                    }} />
                </>
            )}
            {badges && <Box sx={{ position: 'absolute', top: 10, right: 10, zIndex: 1 }}>{badges}</Box>}
        </Box>
    );
};

export default ArticleImage;
