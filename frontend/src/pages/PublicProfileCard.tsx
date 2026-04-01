import React, { useEffect, useMemo, useState } from 'react';
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
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Snackbar
} from '@mui/material';
import ContactPhoneIcon from '@mui/icons-material/ContactPhone';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ShareIcon from '@mui/icons-material/Share';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
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
    const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
    const theme = useTheme();

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await apiClient.get(`/api/users/public/${userId}`);
                setUser(res.data);
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
        return user.organization_name || user.bp_name || null;
    }, [user]);

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
        const orgName = user.organization_name || user.bp_name || 'Mobiliti Dashboard';

        const vCardLines = [
            'BEGIN:VCARD',
            'VERSION:3.0',
            `N:${escapeVCardValue(user.last_name || '')};${escapeVCardValue(user.first_name || '')};;;`,
            `FN:${escapeVCardValue(fullName)}`,
            `ORG:${escapeVCardValue(orgName)}`,
            user.email ? `EMAIL;TYPE=INTERNET,WORK:${escapeVCardValue(user.email)}` : '',
            user.phone ? `TEL;TYPE=CELL:${escapeVCardValue(user.phone)}` : '',
            user.linkedin_url ? `URL:${escapeVCardValue(user.linkedin_url)}` : '',
            `URL:${escapeVCardValue(publicProfileUrl)}`,
            `NOTE:${escapeVCardValue(`Öffentliches Profil: ${publicProfileUrl}`)}`,
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
            setQrOpen(true);
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
                <Card
                    sx={{
                        width: '100%',
                        maxWidth: 430,
                        borderRadius: 6,
                        overflow: 'hidden',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.10)',
                        border: '1px solid rgba(0,0,0,0.06)',
                        background: `linear-gradient(180deg, ${theme.palette.primary.main} 0px, ${theme.palette.primary.main} 120px, #ffffff 120px)`
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

                                <Stack
                                    direction={{ xs: 'column', sm: 'row' }}
                                    spacing={1.25}
                                    width="100%"
                                >
                                    <Button
                                        variant="outlined"
                                        startIcon={<QrCode2Icon />}
                                        onClick={() => setQrOpen(true)}
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

                                    <Button
                                        variant="outlined"
                                        startIcon={<OpenInNewIcon />}
                                        component="a"
                                        href={publicProfileUrl}
                                        fullWidth
                                        sx={{
                                            borderRadius: 999,
                                            py: 1.2,
                                            textTransform: 'none',
                                            fontWeight: 700
                                        }}
                                    >
                                        Profil öffnen
                                    </Button>
                                </Stack>

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

                            <Typography
                                variant="caption"
                                color="text.disabled"
                                sx={{ display: 'block', textAlign: 'center' }}
                            >
                                Virtuelle Visitenkarte ·{' '}
                                <Link
                                    href="https://www.mobiliti.at"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    color="inherit"
                                    underline="hover"
                                >
                                    Mobiliti Dashboard
                                </Link>
                            </Typography>
                        </Box>
                    </CardContent>
                </Card>
            </Box>

            <Dialog
                open={qrOpen}
                onClose={() => setQrOpen(false)}
                fullWidth
                maxWidth="xs"
                aria-labelledby="qr-dialog-title"
            >
                <DialogTitle id="qr-dialog-title" sx={{ fontWeight: 800 }}>
                    Kontakt teilen
                </DialogTitle>

                <DialogContent sx={{ textAlign: 'center', pt: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Lassen Sie Ihr Gegenüber den QR-Code scannen, um die Visitenkarte direkt zu öffnen.
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

                    <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                            mt: 2.5,
                            display: 'block',
                            wordBreak: 'break-all'
                        }}
                    >
                        {publicProfileUrl}
                    </Typography>
                </DialogContent>

                <DialogActions sx={{ px: 3, pb: 2.5, pt: 0 }}>
                    <Button onClick={copyProfileLink} startIcon={<ContentCopyIcon />}>
                        Link kopieren
                    </Button>
                    <Button
                        onClick={() => setQrOpen(false)}
                        variant="contained"
                        sx={{ borderRadius: 999, px: 2.5 }}
                    >
                        Schließen
                    </Button>
                </DialogActions>
            </Dialog>

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