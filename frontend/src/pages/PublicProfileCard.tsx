import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Avatar,
    CircularProgress,
    Alert,
    Stack,
    Button,
    Divider,
    useTheme,
    Link,
    IconButton,
    Tooltip,
    Snackbar
} from '@mui/material';
import ContactPhoneIcon from '@mui/icons-material/ContactPhone';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ShareIcon from '@mui/icons-material/Share';
import CloseIcon from '@mui/icons-material/Close';
import { QRCodeSVG } from 'qrcode.react';
import apiClient from '../apiClient';

interface PublicUser {
    id: string;
    first_name: string | null;
    last_name: string | null;
    username: string;
    organization_name: string | null;
    role: string;
    membership_level: string | null;
    linkedin_url: string | null;
    profile_image_url: string | null;
    contribution_score: number;
    member_since: string;
    email: string | null;
    phone: string | null;
    bp_logo_url: string | null;
    bp_name: string | null;
}

const PublicProfileCard: React.FC = () => {
    const { userId } = useParams<{ userId: string }>();
    const [user, setUser] = useState<PublicUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [qrOpen, setQrOpen] = useState(false);
    const [isFlipping, setIsFlipping] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
    const flipTimerRef = useRef<number | null>(null);
    const theme = useTheme();

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const response = await apiClient.get<PublicUser>(`/api/users/public/${userId}`);
                if (!response.res.ok || !response.data?.id) {
                    setUser(null);
                    setError(response.res.status === 404
                        ? 'Diese Visitenkarte ist nicht öffentlich freigegeben.'
                        : 'Profil konnte nicht geladen werden.');
                    return;
                }
                setUser(response.data);
            } catch {
                setError('Profil konnte nicht geladen werden.');
            } finally {
                setLoading(false);
            }
        };

        if (userId) fetchProfile();
    }, [userId]);

    const displayName = useMemo(() => {
        if (!user) return '';
        const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
        return fullName || 'Profil';
    }, [user]);

    // Öffentliche Visitenkarten sollen nur über ihren geteilten Link erreichbar
    // sein und nicht als Personenverzeichnis in Suchmaschinen landen.
    useEffect(() => {
        const previousTitle = document.title;
        let robotsMeta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
        const createdMeta = !robotsMeta;
        const previousRobots = robotsMeta?.content || '';
        if (!robotsMeta) {
            robotsMeta = document.createElement('meta');
            robotsMeta.name = 'robots';
            document.head.appendChild(robotsMeta);
        }
        robotsMeta.content = 'noindex, nofollow';
        if (displayName && displayName !== 'Profil') {
            document.title = `${displayName} | Visitenkarte`;
        }
        return () => {
            document.title = previousTitle;
            if (createdMeta) robotsMeta?.remove();
            else if (robotsMeta) robotsMeta.content = previousRobots;
        };
    }, [displayName]);

    const initials = useMemo(() => {
        if (!displayName) return '?';
        return displayName
            .split(' ')
            .map((part) => part.charAt(0))
            .join('')
            .slice(0, 2)
            .toUpperCase();
    }, [displayName]);

    const publicProfileUrl = useMemo(() => window.location.href, []);
    const primaryOrganization = useMemo(() => {
        if (!user) return null;
        return user.organization_name || null;
    }, [user]);

    useEffect(() => () => {
        if (flipTimerRef.current !== null) window.clearTimeout(flipTimerRef.current);
    }, []);

    const flipCard = (showQr: boolean) => {
        if (isFlipping || showQr === qrOpen) return;
        setIsFlipping(true);
        flipTimerRef.current = window.setTimeout(() => {
            setQrOpen(showQr);
            window.requestAnimationFrame(() => setIsFlipping(false));
        }, 220);
    };

    const memberSinceText = useMemo(() => {
        if (!user?.member_since) return null;
        const date = new Date(user.member_since);
        const year = date.getFullYear();
        if (Number.isNaN(year)) return null;
        return `Mitglied seit ${year}`;
    }, [user]);

    const escapeVCardValue = (value: string) => {
        return value
            .replace(/\\/g, '\\\\')
            .replace(/\n/g, '\\n')
            .replace(/;/g, '\\;')
            .replace(/,/g, '\\,');
    };

    const downloadVCard = () => {
        if (!user) return;

        const fullName =
            [user.first_name || '', user.last_name || ''].join(' ').trim() || 'Kontakt';
        const orgName = user.organization_name || '';

        const vCardLines = [
            'BEGIN:VCARD',
            'VERSION:3.0',
            `N:${escapeVCardValue(user.last_name || '')};${escapeVCardValue(user.first_name || '')};;;`,
            `FN:${escapeVCardValue(fullName)}`,
            orgName ? `ORG:${escapeVCardValue(orgName)}` : '',
            user.email ? `EMAIL;TYPE=INTERNET,WORK:${escapeVCardValue(user.email)}` : '',
            user.phone ? `TEL;TYPE=CELL:${escapeVCardValue(user.phone)}` : '',
            user.linkedin_url ? `URL:${escapeVCardValue(user.linkedin_url)}` : '',
            `URL:${escapeVCardValue(publicProfileUrl)}`,
            `NOTE:${escapeVCardValue(`Öffentliche Visitenkarte: ${publicProfileUrl}`)}`,
            'END:VCARD'
        ].filter(Boolean);

        const blob = new Blob([vCardLines.join('\r\n')], {
            type: 'text/vcard;charset=utf-8'
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute(
            'download',
            `${(user.first_name || 'Kontakt').trim()}_${(user.last_name || '').trim() || 'profil'}.vcf`
        );

        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        window.setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
    };

    const copyProfileLink = async () => {
        try {
            await navigator.clipboard.writeText(publicProfileUrl);
            setSnackbarMessage('Link wurde kopiert.');
        } catch {
            setSnackbarMessage('Link konnte nicht kopiert werden.');
        }
    };

    const nativeShare = async () => {
        if (!navigator.share) {
            flipCard(true);
            return;
        }

        try {
            await navigator.share({
                title: displayName,
                text: `Virtuelle Visitenkarte von ${displayName}`,
                url: publicProfileUrl
            });
        } catch {
            // bewusst still
        }
    };

    if (loading) {
        return (
            <Box
                sx={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: '#f6f7f9'
                }}
            >
                <CircularProgress />
            </Box>
        );
    }

    if (error || !user) {
        return (
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <Alert severity="error">{error || 'User nicht gefunden'}</Alert>
            </Box>
        );
    }

    return (
        <>
            <Box
                sx={{
                    minHeight: '100vh',
                    bgcolor: '#f6f7f9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    px: 2,
                    py: { xs: 3, sm: 6 }
                }}
            >
                <Box
                    sx={{
                        width: '100%',
                        maxWidth: 430,
                        perspective: '1400px'
                    }}
                >
                <Box
                    sx={{
                        display: 'grid',
                        transform: isFlipping ? 'rotateY(90deg)' : 'none',
                        transition: 'transform 220ms ease-in',
                        '@media (prefers-reduced-motion: reduce)': { transition: 'none' }
                    }}
                >
                <Card
                    aria-hidden={qrOpen}
                    sx={{
                        gridArea: '1 / 1',
                        width: '100%',
                        borderRadius: 6,
                        overflow: 'hidden',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.10)',
                        border: '1px solid rgba(0,0,0,0.06)',
                        background: `linear-gradient(180deg, ${theme.palette.primary.main} 0px, ${theme.palette.primary.main} 120px, #ffffff 120px)`,
                        display: qrOpen ? 'none' : 'block',
                        pointerEvents: qrOpen || isFlipping ? 'none' : 'auto'
                    }}
                >
                    <CardContent sx={{ p: 0 }}>
                        <Box sx={{ px: 3, pt: 4.5, pb: 0 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                                <Avatar
                                    src={user.profile_image_url || undefined}
                                    alt={displayName}
                                    sx={{
                                        width: 108,
                                        height: 108,
                                        fontSize: '2rem',
                                        fontWeight: 800,
                                        bgcolor: 'background.paper',
                                        color: 'primary.main',
                                        border: '4px solid #fff',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)'
                                    }}
                                >
                                    {!user.profile_image_url && initials}
                                </Avatar>
                            </Box>
                        </Box>

                        <Box sx={{ px: 3, pt: 3, pb: 4 }}>
                                <Stack spacing={2.5} alignItems="center" textAlign="center">
                                <Box>
                                    <Typography
                                        variant="h4"
                                        sx={{
                                            fontWeight: 900,
                                            lineHeight: 1.08,
                                            letterSpacing: -0.5
                                        }}
                                    >
                                        {displayName}
                                    </Typography>

                                    {primaryOrganization && (
                                        <Stack
                                            direction="row"
                                            spacing={0.75}
                                            alignItems="center"
                                            justifyContent="center"
                                            sx={{ mt: 1.25, color: 'text.secondary' }}
                                        >
                                            <Typography
                                                variant="body2"
                                                sx={{ fontWeight: 500 }}
                                            >
                                                {primaryOrganization}
                                            </Typography>
                                        </Stack>
                                    )}
                                </Box>

                                {(user.email || user.phone) && (
                                    <Stack
                                        spacing={0.9}
                                        alignItems="center"
                                        sx={{ width: '100%', px: { xs: 0, sm: 1 } }}
                                    >
                                        {user.email && (
                                            <Stack direction="row" spacing={1} alignItems="center" sx={{ maxWidth: '100%' }}>
                                                <EmailIcon fontSize="small" color="primary" aria-hidden="true" />
                                                <Link
                                                    href={`mailto:${user.email}`}
                                                    color="text.primary"
                                                    underline="hover"
                                                    sx={{ fontSize: '0.95rem', fontWeight: 600, overflowWrap: 'anywhere' }}
                                                >
                                                    {user.email}
                                                </Link>
                                            </Stack>
                                        )}

                                        {user.phone && (
                                            <Stack direction="row" spacing={1} alignItems="center" sx={{ maxWidth: '100%' }}>
                                                <PhoneIcon fontSize="small" color="primary" aria-hidden="true" />
                                                <Link
                                                    href={`tel:${user.phone}`}
                                                    color="text.primary"
                                                    underline="hover"
                                                    sx={{ fontSize: '0.95rem', fontWeight: 600, overflowWrap: 'anywhere' }}
                                                >
                                                    {user.phone}
                                                </Link>
                                            </Stack>
                                        )}
                                    </Stack>
                                )}

                                <Stack direction="row" spacing={1.25} justifyContent="center" flexWrap="wrap">
                                    {user.phone && (
                                        <Tooltip title="Anrufen">
                                            <IconButton
                                                aria-label="Anrufen"
                                                component="a"
                                                href={`tel:${user.phone}`}
                                                sx={{
                                                    bgcolor: 'rgba(0,0,0,0.04)',
                                                    color: 'primary.main',
                                                    '&:hover': {
                                                        bgcolor: 'primary.main',
                                                        color: 'primary.contrastText'
                                                    }
                                                }}
                                            >
                                                <PhoneIcon />
                                            </IconButton>
                                        </Tooltip>
                                    )}

                                    {user.email && (
                                        <Tooltip title="E-Mail schreiben">
                                            <IconButton
                                                aria-label="E-Mail schreiben"
                                                component="a"
                                                href={`mailto:${user.email}`}
                                                sx={{
                                                    bgcolor: 'rgba(0,0,0,0.04)',
                                                    color: 'primary.main',
                                                    '&:hover': {
                                                        bgcolor: 'primary.main',
                                                        color: 'primary.contrastText'
                                                    }
                                                }}
                                            >
                                                <EmailIcon />
                                            </IconButton>
                                        </Tooltip>
                                    )}

                                    {user.linkedin_url && (
                                        <Tooltip title="LinkedIn öffnen">
                                            <IconButton
                                                aria-label="LinkedIn öffnen"
                                                component="a"
                                                href={user.linkedin_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                sx={{
                                                    bgcolor: 'rgba(0,0,0,0.04)',
                                                    color: '#0077B5',
                                                    '&:hover': {
                                                        bgcolor: '#0077B5',
                                                        color: '#fff'
                                                    }
                                                }}
                                            >
                                                <LinkedInIcon />
                                            </IconButton>
                                        </Tooltip>
                                    )}

                                    <Tooltip title="Link kopieren">
                                        <IconButton
                                            aria-label="Link kopieren"
                                            onClick={copyProfileLink}
                                            sx={{
                                                bgcolor: 'rgba(0,0,0,0.04)',
                                                color: 'text.primary',
                                                '&:hover': {
                                                    bgcolor: 'rgba(0,0,0,0.08)'
                                                }
                                            }}
                                        >
                                            <ContentCopyIcon />
                                        </IconButton>
                                    </Tooltip>

                                    <Tooltip title="Teilen">
                                        <IconButton
                                            aria-label="Profil teilen"
                                            onClick={nativeShare}
                                            sx={{
                                                bgcolor: 'rgba(0,0,0,0.04)',
                                                color: 'text.primary',
                                                '&:hover': {
                                                    bgcolor: 'rgba(0,0,0,0.08)'
                                                }
                                            }}
                                        >
                                            <ShareIcon />
                                        </IconButton>
                                    </Tooltip>
                                </Stack>

                                <Button
                                    variant="contained"
                                    size="large"
                                    startIcon={<ContactPhoneIcon />}
                                    onClick={downloadVCard}
                                    fullWidth
                                    sx={{
                                        mt: 0.5,
                                        borderRadius: 999,
                                        py: 1.5,
                                        fontSize: '1rem',
                                        fontWeight: 800,
                                        textTransform: 'none',
                                        boxShadow: '0 10px 30px rgba(0,0,0,0.12)'
                                    }}
                                >
                                    Zum Adressbuch hinzufügen
                                </Button>

                                {/* GEÄNDERT: Button "Profil öffnen" entfernt, QR Button nimmt volle Breite */}
                                <Button
                                    variant="outlined"
                                    startIcon={<QrCode2Icon />}
                                    onClick={() => flipCard(true)}
                                    fullWidth
                                    sx={{
                                        borderRadius: 999,
                                        py: 1.2,
                                        textTransform: 'none',
                                        fontWeight: 700
                                    }}
                                >
                                    QR-Code anzeigen
                                </Button>

                                {(user.bp_logo_url || memberSinceText) && (
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 1,
                                            minHeight: 24,
                                            flexWrap: 'wrap'
                                        }}
                                    >
                                        {user.bp_logo_url && (
                                            <Box
                                                component="img"
                                                src={user.bp_logo_url}
                                                alt={user.bp_name || 'Business Partner'}
                                                sx={{
                                                    maxHeight: 24,
                                                    maxWidth: 130,
                                                    objectFit: 'contain',
                                                    opacity: 0.78,
                                                    display: 'block'
                                                }}
                                            />
                                        )}

                                        {memberSinceText && (
                                            <Typography
                                                variant="caption"
                                                sx={{
                                                    color: 'text.disabled',
                                                    fontWeight: 500,
                                                    letterSpacing: 0.1,
                                                    lineHeight: 1.2
                                                }}
                                            >
                                                {memberSinceText}
                                            </Typography>
                                        )}
                                    </Box>
                                )}
                            </Stack>

                            <Divider sx={{ my: 3 }} />

                            {/* GEÄNDERT: Neuer Footer Text */}
                            <Typography
                                variant="caption"
                                color="text.disabled"
                                sx={{ display: 'block', textAlign: 'center' }}
                            >
                                Virtuelle Visitenkarte erstellt von{' '}
                                <Link
                                    href="https://www.mobiliti.at"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    color="inherit"
                                    underline="hover"
                                >
                                    Mobiliti
                                </Link>
                            </Typography>
                        </Box>
                    </CardContent>
                </Card>

                <Card
                    aria-hidden={!qrOpen}
                    sx={{
                        gridArea: '1 / 1',
                        width: '100%',
                        height: '100%',
                        borderRadius: 6,
                        overflow: 'hidden',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.10)',
                        border: '1px solid rgba(0,0,0,0.06)',
                        bgcolor: 'background.paper',
                        display: qrOpen ? 'block' : 'none',
                        pointerEvents: qrOpen && !isFlipping ? 'auto' : 'none'
                    }}
                >
                    <CardContent
                        sx={{
                            position: 'relative',
                            height: '100%',
                            minHeight: 560,
                            p: { xs: 3, sm: 4 },
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center'
                        }}
                    >
                        <IconButton
                            aria-label="QR-Code schließen"
                            onClick={() => flipCard(false)}
                            sx={{
                                position: 'absolute',
                                top: 12,
                                right: 12,
                                border: '1px solid',
                                borderColor: 'divider',
                                bgcolor: 'background.paper'
                            }}
                        >
                            <CloseIcon />
                        </IconButton>

                        <Typography variant="h5" sx={{ fontWeight: 900, mb: 1 }}>
                            Kontakt teilen
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 310 }}>
                            QR-Code scannen und die Visitenkarte direkt öffnen.
                        </Typography>

                        <Box
                            sx={{
                                display: 'inline-flex',
                                p: 2,
                                bgcolor: '#fff',
                                borderRadius: 3,
                                boxShadow: theme.shadows[2],
                                border: '1px solid',
                                borderColor: 'divider'
                            }}
                        >
                            <QRCodeSVG
                                value={publicProfileUrl}
                                size={220}
                                level="H"
                                fgColor={theme.palette.primary.main}
                                bgColor="#FFFFFF"
                            />
                        </Box>

                        <Link
                            href={publicProfileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            underline="hover"
                            sx={{
                                mt: 2.5,
                                display: 'block',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                wordBreak: 'break-all'
                            }}
                        >
                            {publicProfileUrl}
                        </Link>

                        <Button onClick={copyProfileLink} startIcon={<ContentCopyIcon />} sx={{ mt: 1.5 }}>
                            Link kopieren
                        </Button>
                    </CardContent>
                </Card>
                </Box>
                </Box>
            </Box>

            <Snackbar
                open={Boolean(snackbarMessage)}
                autoHideDuration={2200}
                onClose={() => setSnackbarMessage(null)}
                message={snackbarMessage}
            />
        </>
    );
};

export default PublicProfileCard;
