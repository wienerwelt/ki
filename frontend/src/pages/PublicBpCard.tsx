// frontend/src/pages/PublicBpCard.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Container,
    Fade,
    IconButton,
    Link as MuiLink,
    Stack,
    Typography,
    alpha,
    useTheme,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import LinkIcon from '@mui/icons-material/Link';
import { QRCodeCanvas } from 'qrcode.react';
import apiClient from '../apiClient';

interface PublicPartner {
    id: string;
    name: string;
    slug?: string | null;
    logo_url: string | null;
    dashboard_title: string | null;
    primary_color: string | null;
    voucher_code: string;
}

const getAssetUrlCandidates = (url: string | null | undefined): string[] => {
    if (!url) return [];

    if (/^https?:\/\//i.test(url)) {
        return [url];
    }

    let baseUrl = import.meta.env.VITE_API_URL || '';
    if (baseUrl === '/') baseUrl = '';
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

    let cleanUrl = url.startsWith('/') ? url : `/${url}`;
    if (cleanUrl.startsWith('/api/')) {
        cleanUrl = cleanUrl.substring(4);
    }

    const apiPrefix = baseUrl.endsWith('/api') ? '' : '/api';

    const candidates = [
        `${baseUrl}${apiPrefix}${cleanUrl}`,
        `${baseUrl}${cleanUrl}`,
        cleanUrl,
    ];

    return Array.from(new Set(candidates.filter(Boolean)));
};

const PublicBpCard: React.FC = () => {
    const { bpId } = useParams<{ bpId: string }>();
    const navigate = useNavigate();
    const theme = useTheme();

    const [partner, setPartner] = useState<PublicPartner | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [logoAttemptIndex, setLogoAttemptIndex] = useState(0);

    useEffect(() => {
        const fetchPartner = async () => {
            try {
                const res = await apiClient.get(`/api/public/partner-card/${bpId}`);
                setPartner(res.data);
            } catch (err) {
                setError('Partner-Daten konnten nicht geladen werden.');
            } finally {
                setLoading(false);
            }
        };

        if (bpId) fetchPartner();
    }, [bpId]);

    useEffect(() => {
        setLogoAttemptIndex(0);
    }, [partner?.logo_url]);

    const handleClose = () => {
        if (window.history.length > 1) {
            navigate(-1);
            return;
        }

        navigate('/');
    };

    if (loading) {
        return (
            <Box
                sx={{
                    height: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <CircularProgress />
            </Box>
        );
    }

    if (error || !partner) {
        return (
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <Alert severity="error">{error || 'Partner nicht gefunden'}</Alert>
            </Box>
        );
    }

    const accessCode = partner.voucher_code || partner.id.slice(-8);
    const registerUrl = `${window.location.origin}/register?partner=${encodeURIComponent(accessCode)}`;

    const primaryColor = partner.primary_color || theme.palette.primary.main;
    const logoCandidates = getAssetUrlCandidates(partner.logo_url);
    const logoUrl = logoCandidates[logoAttemptIndex] || '';

    const handleCopyCode = async () => {
        try {
            await navigator.clipboard.writeText(registerUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setCopied(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <Box
            sx={{
                minHeight: '100vh',
                background: `
                    radial-gradient(circle at 15% 10%, ${alpha(primaryColor, 0.22)} 0, transparent 32%),
                    linear-gradient(135deg, #f8fafc 0%, #eef2f7 52%, ${alpha(primaryColor, 0.12)} 100%)
                `,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                p: { xs: 1.5, sm: 2 },
                '@media print': {
                    bgcolor: 'white',
                    background: 'white',
                    p: 0,
                    alignItems: 'flex-start',
                },
            }}
        >
            <Fade in timeout={500}>
                <Container maxWidth="xs" sx={{ px: { xs: 0.5, sm: 2 } }}>
                    <Card
                        sx={{
                            borderRadius: 4,
                            boxShadow: `0 24px 70px ${alpha('#0f172a', 0.22)}`,
                            overflow: 'hidden',
                            position: 'relative',
                            border: `1px solid ${alpha(primaryColor, 0.18)}`,
                            '@media print': {
                                boxShadow: 'none',
                                border: '1px solid #ccc',
                                borderRadius: 2,
                            },
                        }}
                    >
                        <IconButton
                            aria-label="Schließen"
                            onClick={handleClose}
                            size="small"
                            sx={{
                                position: 'absolute',
                                top: 10,
                                right: 10,
                                zIndex: 10,
                                bgcolor: alpha('#fff', 0.92),
                                color: '#0f172a',
                                boxShadow: `0 8px 20px ${alpha('#0f172a', 0.18)}`,
                                '&:hover': {
                                    bgcolor: '#fff',
                                },
                                '@media print': {
                                    display: 'none',
                                },
                            }}
                        >
                            <CloseIcon fontSize="small" />
                        </IconButton>

                        {/* Header Branding */}
                        <Box
                            sx={{
                                height: 112,
                                background: `linear-gradient(135deg, ${primaryColor} 0%, ${alpha(primaryColor, 0.78)} 48%, #111827 100%)`,
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'center',
                                position: 'relative',
                                color: '#fff',
                                px: 3,
                                pt: 2,
                            }}
                        >
                            {/* Decorative Layer: darf abgeschnitten werden */}
                            <Box
                                sx={{
                                    position: 'absolute',
                                    inset: 0,
                                    overflow: 'hidden',
                                    zIndex: 0,
                                }}
                            >
                                <Box
                                    sx={{
                                        position: 'absolute',
                                        width: 180,
                                        height: 180,
                                        borderRadius: '50%',
                                        bgcolor: alpha('#fff', 0.16),
                                        top: -90,
                                        left: -55,
                                    }}
                                />

                                <Box
                                    sx={{
                                        position: 'absolute',
                                        width: 145,
                                        height: 145,
                                        borderRadius: '50%',
                                        bgcolor: alpha('#fff', 0.1),
                                        right: -42,
                                        bottom: -72,
                                    }}
                                />

                                <Box
                                    sx={{
                                        position: 'absolute',
                                        inset: 0,
                                        backgroundImage:
                                            'linear-gradient(45deg, rgba(255,255,255,0.10) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.10) 75%, transparent 75%, transparent)',
                                        backgroundSize: '26px 26px',
                                        opacity: 0.2,
                                    }}
                                />
                            </Box>

                            <Stack
                                alignItems="center"
                                spacing={0.5}
                                sx={{
                                    position: 'relative',
                                    zIndex: 1,
                                    textAlign: 'center',
                                    maxWidth: '80%',
                                }}
                            >
                                <Chip
                                    label={partner.dashboard_title || 'Einladung zum Dashboard'}
                                    size="small"
                                    sx={{
                                        bgcolor: alpha('#fff', 0.18),
                                        color: '#fff',
                                        border: `1px solid ${alpha('#fff', 0.28)}`,
                                        fontWeight: 800,
                                        maxWidth: 260,
                                        '& .MuiChip-label': {
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        },
                                    }}
                                />

                                <Typography variant="caption" sx={{ fontWeight: 700, opacity: 0.9 }}>
                                    Schnellzugang für Mitglieder
                                </Typography>
                            </Stack>
                        </Box>

                        {/* Logo Overlay: eigener Layer, nicht im abgeschnittenen Header */}
                        <Box
                            sx={{
                                position: 'absolute',
                                top: 78,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                bgcolor: 'white',
                                p: 1.4,
                                borderRadius: '50%',
                                boxShadow: `0 14px 32px ${alpha('#0f172a', 0.24)}`,
                                width: 82,
                                height: 82,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 5,
                                border: `1px solid ${alpha(primaryColor, 0.16)}`,
                            }}
                        >
                            {logoUrl ? (
                                <Box
                                    component="img"
                                    src={logoUrl}
                                    alt={partner.name}
                                    onError={() =>
                                        setLogoAttemptIndex((idx) =>
                                            idx + 1 < logoCandidates.length ? idx + 1 : idx
                                        )
                                    }
                                    sx={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'contain',
                                        display: 'block',
                                        borderRadius: partner.logo_url?.toLowerCase().endsWith('.svg') ? 0 : 1,
                                    }}
                                />
                            ) : (
                                <Typography variant="h4" fontWeight="bold" sx={{ color: primaryColor }}>
                                    {partner.name ? partner.name.charAt(0).toUpperCase() : '?'}
                                </Typography>
                            )}
                        </Box>

                        <CardContent
                            sx={{
                                pt: 7.5,
                                textAlign: 'center',
                                pb: 3.25,
                                px: { xs: 2.25, sm: 3 },
                                position: 'relative',
                                zIndex: 1,
                            }}
                        >
                            <Typography variant="h6" fontWeight={950} gutterBottom sx={{ lineHeight: 1.2 }}>
                                Willkommen bei {partner.name}
                            </Typography>

                            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 330, mx: 'auto', mb: 2 }}>
                                QR-Code scannen oder den Registrierungslink kopieren, um dem Team-Dashboard beizutreten.
                            </Typography>

                            <Box sx={{ my: 2.25, display: 'flex', justifyContent: 'center' }}>
                                <Box
                                    sx={{
                                        p: 1.25,
                                        border: `1px solid ${alpha(primaryColor, 0.18)}`,
                                        borderRadius: 2.5,
                                        bgcolor: 'white',
                                        boxShadow: `0 12px 26px ${alpha('#0f172a', 0.08)}`,
                                    }}
                                >
                                    <QRCodeCanvas value={registerUrl} size={176} level="H" includeMargin />
                                </Box>
                            </Box>

                            <Box
                                sx={{
                                    bgcolor: alpha(primaryColor, 0.06),
                                    p: 2,
                                    borderRadius: 3,
                                    border: `1px dashed ${alpha(primaryColor, 0.42)}`,
                                    mb: 2,
                                    position: 'relative',
                                }}
                            >
                                <Typography variant="overline" color="text.secondary" display="block" sx={{ lineHeight: 1.2 }}>
                                    Ihr Zugangs-Code
                                </Typography>

                                <Typography
                                    variant="h4"
                                    fontWeight={950}
                                    sx={{
                                        letterSpacing: 3,
                                        color: primaryColor,
                                        lineHeight: 1.1,
                                        my: 0.5,
                                    }}
                                >
                                    {accessCode}
                                </Typography>

                                <Button
                                    size="small"
                                    startIcon={copied ? <CheckCircleIcon /> : <ContentCopyIcon />}
                                    onClick={handleCopyCode}
                                    sx={{
                                        mt: 0.5,
                                        color: primaryColor,
                                        fontWeight: 800,
                                        '@media print': {
                                            display: 'none',
                                        },
                                    }}
                                >
                                    {copied ? 'Link kopiert!' : 'Link kopieren'}
                                </Button>
                            </Box>

                            <Box
                                sx={{
                                    px: 1.5,
                                    py: 1.25,
                                    borderRadius: 2,
                                    bgcolor: alpha('#0f172a', 0.04),
                                    mb: 2,
                                }}
                            >
                                <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center" sx={{ mb: 0.5 }}>
                                    <LinkIcon sx={{ fontSize: 16, color: primaryColor }} />

                                    <Typography variant="caption" fontWeight={800} color="text.secondary">
                                        Registrierung unter
                                    </Typography>
                                </Stack>

                                <MuiLink
                                    href={registerUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    variant="caption"
                                    underline="hover"
                                    sx={{
                                        display: 'block',
                                        wordBreak: 'break-all',
                                        color: 'text.primary',
                                        fontWeight: 800,
                                    }}
                                >
                                    {registerUrl}
                                </MuiLink>
                            </Box>

                            <Stack
                                direction="row"
                                spacing={1.25}
                                justifyContent="center"
                                sx={{
                                    '@media print': {
                                        display: 'none',
                                    },
                                }}
                            >
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={<PrintIcon />}
                                    onClick={handlePrint}
                                    sx={{
                                        borderColor: primaryColor,
                                        color: primaryColor,
                                        borderRadius: 2,
                                        fontWeight: 800,
                                    }}
                                >
                                    Drucken
                                </Button>

                                <Button
                                    variant="contained"
                                    size="small"
                                    startIcon={copied ? <CheckCircleIcon /> : <ContentCopyIcon />}
                                    onClick={handleCopyCode}
                                    sx={{
                                        bgcolor: primaryColor,
                                        borderRadius: 2,
                                        fontWeight: 800,
                                        '&:hover': {
                                            bgcolor: primaryColor,
                                            filter: 'brightness(0.92)',
                                        },
                                    }}
                                >
                                    Kopieren
                                </Button>
                            </Stack>
                        </CardContent>
                    </Card>
                </Container>
            </Fade>
        </Box>
    );
};

export default PublicBpCard;