// frontend/src/components/ProfileCard.tsx
import React, { useState } from 'react';
import {
    Avatar,
    Badge,
    Box,
    Button,
    Chip,
    Dialog,
    DialogContent,
    DialogTitle,
    Divider,
    Grid,
    IconButton,
    Stack,
    Tooltip,
    Typography,
    useTheme,
} from '@mui/material';

import EventIcon from '@mui/icons-material/Event';
import StarsIcon from '@mui/icons-material/Stars';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import EmailIcon from '@mui/icons-material/Email';
import QrCodeIcon from '@mui/icons-material/QrCode';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import BusinessIcon from '@mui/icons-material/Business';

import { QRCodeSVG } from 'qrcode.react';

// --- Types ---
export interface UserProfileData {
    id: string;
    first_name: string | null;
    last_name: string | null;
    username?: string;
    profile_image_url: string | null;
    membership_level?: string;
    organization_name?: string | null;
    business_partner_name?: string | null;
    role?: string;
    linkedin_url?: string;
    email?: string;
    member_since?: string | null;
    contribution_score?: number;
    last_login_at?: string;
    tags?: string[] | null;
}

// --- Hilfsfunktionen ---
const getUserStatus = (lastLoginDate?: string) => {
    if (!lastLoginDate) return 'offline';

    const lastLoginTimestamp = new Date(lastLoginDate).getTime();

    if (!Number.isFinite(lastLoginTimestamp)) {
        return 'offline';
    }

    const diffMinutes =
        (Date.now() - lastLoginTimestamp) / (1000 * 60);

    if (diffMinutes < 15) return 'online';
    if (diffMinutes < 60 * 24) return 'active_today';

    return 'offline';
};

const getStatusText = (status: string) => {
    if (status === 'online') return 'Gerade online';
    if (status === 'active_today') return 'Heute aktiv';

    return 'Offline';
};

const getRoleLabel = (role?: string) => {
    if (role === 'admin') return 'Administrator';
    if (role === 'assistenz') return 'Assistenz';

    return 'Mitglied';
};

const normalizeExternalUrl = (url?: string) => {
    if (!url) return undefined;

    if (/^https?:\/\//i.test(url)) {
        return url;
    }

    return `https://${url}`;
};

const formatMemberSince = (value?: string | null): string | null => {
    if (!value) return null;
    const date = new Date(value);
    const now = new Date();
    if (!Number.isFinite(date.getTime()) || date.getTime() > now.getTime() + 24 * 60 * 60 * 1000) return null;
    return date.toLocaleDateString('de-AT', { month: 'long', year: 'numeric' });
};

// --- Avatar-Komponente ---
export const UserAvatarWithStatus: React.FC<{
    user: Partial<UserProfileData>;
    size?: number;
    onClick?: (event: React.MouseEvent) => void;
}> = ({
    user,
    size = 40,
    onClick,
}) => {
    const status = getUserStatus(user.last_login_at);
    const invisible = status === 'offline';

    const letter = user.first_name
        ? user.first_name.charAt(0).toUpperCase()
        : user.username
            ? user.username.charAt(0).toUpperCase()
            : '?';

    return (
        <Tooltip
            title={getStatusText(status)}
            disableInteractive
        >
            <Badge
                overlap="circular"
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                }}
                variant="dot"
                color={status === 'online' ? 'success' : 'warning'}
                invisible={invisible}
                sx={{
                    '& .MuiBadge-badge': {
                        backgroundColor:
                            status === 'online'
                                ? '#44b700'
                                : '#ffa726',
                        color:
                            status === 'online'
                                ? '#44b700'
                                : '#ffa726',
                        boxShadow: '0 0 0 2px white',
                        cursor: onClick
                            ? 'pointer'
                            : 'default',
                        height: size > 50 ? 14 : 10,
                        minWidth: size > 50 ? 14 : 10,
                        borderRadius: '50%',
                    },
                }}
            >
                <Avatar
                    src={user.profile_image_url || undefined}
                    alt={
                        [user.first_name, user.last_name]
                            .filter(Boolean)
                            .join(' ') || user.username || 'Profilbild'
                    }
                    sx={{
                        width: size,
                        height: size,
                        cursor: onClick
                            ? 'pointer'
                            : 'default',
                        bgcolor: 'primary.main',
                        color: 'white',
                    }}
                    onClick={onClick}
                >
                    {letter}
                </Avatar>
            </Badge>
        </Tooltip>
    );
};

// --- Haupt-Card-Komponente ---
export const ProfileCard: React.FC<{
    user: UserProfileData;
}> = ({ user }) => {
    const theme = useTheme();

    const [qrOpen, setQrOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const status = getUserStatus(user.last_login_at);

    const displayName =
        [user.first_name, user.last_name]
            .filter(Boolean)
            .join(' ') ||
        user.username ||
        'Unbekanntes Mitglied';

    const orgName =
        user.organization_name?.trim() ||
        user.business_partner_name?.trim() ||
        'Nicht angegeben';

    const expertise = Array.from(new Set(
        (user.tags || []).map((tag) => String(tag || '').trim()).filter(Boolean)
    ));
    const memberSinceLabel = formatMemberSince(user.member_since);

    const linkedinUrl = normalizeExternalUrl(
        user.linkedin_url
    );

    const publicProfileUrl =
        typeof window !== 'undefined'
            ? `${window.location.origin}/p/${user.id}`
            : `/p/${user.id}`;

    const handleCopyProfileUrl = async () => {
        try {
            await navigator.clipboard.writeText(
                publicProfileUrl
            );

            setCopied(true);

            window.setTimeout(() => {
                setCopied(false);
            }, 2000);
        } catch (error) {
            console.error(
                'Profil-Link konnte nicht kopiert werden:',
                error
            );
        }
    };

    return (
        <>
            <Box
                sx={{
                    width: '100%',
                    p: 0,
                    overflow: 'hidden',
                }}
            >
                {/* Banner */}
                <Box
                    sx={{
                        height: 80,
                        width: '100%',
                        position: 'relative',
                        background: `linear-gradient(
                            135deg,
                            ${theme.palette.primary.main} 0%,
                            ${theme.palette.primary.dark} 100%
                        )`,
                    }}
                />

                <Box
                    sx={{
                        px: 3,
                        pb: 3,
                        mt: -5,
                    }}
                >
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-end',
                        }}
                    >
                        <Box
                            sx={{
                                border: `4px solid ${theme.palette.background.paper}`,
                                borderRadius: '50%',
                                bgcolor: 'background.paper',
                                position: 'relative',
                                zIndex: 1,
                            }}
                        >
                            <UserAvatarWithStatus
                                user={user}
                                size={80}
                            />
                        </Box>

                        {user.membership_level && (
                            <Chip
                                label={user.membership_level}
                                size="small"
                                color="secondary"
                                sx={{
                                    height: 24,
                                    fontWeight: 'bold',
                                    mb: 1,
                                }}
                            />
                        )}
                    </Box>

                    <Box sx={{ mt: 1.5 }}>
                        <Typography
                            variant="h6"
                            fontWeight={900}
                            lineHeight={1.2}
                        >
                            {displayName}
                        </Typography>

                        <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mt: 0.5 }}
                        >
                            {getRoleLabel(user.role)}
                        </Typography>

                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mt: 1 }}>
                            <BusinessIcon sx={{ fontSize: 17, color: 'text.secondary', mt: '2px' }} />
                            <Typography variant="body2" color="text.primary">
                                Organisation: <strong>{orgName}</strong>
                            </Typography>
                        </Box>

                        <Typography
                            variant="caption"
                            sx={{
                                display: 'block',
                                mt: 0.5,
                                color:
                                    status === 'online'
                                        ? 'success.main'
                                        : status === 'active_today'
                                            ? 'warning.main'
                                            : 'text.disabled',
                                fontWeight: 600,
                            }}
                        >
                            • {getStatusText(status)}
                        </Typography>
                    </Box>

                    {/* Kompetenzen */}
                    {expertise.length > 0 && (
                        <Box sx={{ mt: 2 }}>
                            <Typography
                                variant="caption"
                                fontWeight="bold"
                                color="text.secondary"
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 0.5,
                                    mb: 1,
                                }}
                            >
                                <LocalOfferIcon fontSize="inherit" />
                                Experte für
                            </Typography>

                            <Box
                                sx={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: 0.5,
                                }}
                            >
                                {expertise.map((tag, index) => (
                                    <Chip
                                        key={`${tag}-${index}`}
                                        label={tag}
                                        size="small"
                                        sx={{
                                            fontSize: '0.7rem',
                                            height: 20,
                                        }}
                                    />
                                ))}
                            </Box>
                        </Box>
                    )}

                    <Divider sx={{ my: 2 }} />

                    <Grid container spacing={1}>
                        <Grid item xs={6}>
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 0.5,
                                    color: 'text.secondary',
                                }}
                            >
                                <EventIcon fontSize="inherit" />

                                <Typography variant="caption">
                                    {memberSinceLabel
                                        ? `Angemeldet seit ${memberSinceLabel}`
                                        : 'Anmeldedatum nicht verfügbar'}
                                </Typography>
                            </Box>
                        </Grid>

                        <Grid item xs={6}>
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 0.5,
                                    color: 'text.secondary',
                                }}
                            >
                                <StarsIcon
                                    fontSize="inherit"
                                    color="warning"
                                />

                                <Typography
                                    variant="caption"
                                    fontWeight="bold"
                                >
                                    {user.contribution_score || 0}{' '}
                                    Punkte
                                </Typography>
                            </Box>
                        </Grid>
                    </Grid>

                    {/* Visitenkarte */}
                    <Button
                        variant="outlined"
                        startIcon={<QrCodeIcon />}
                        fullWidth
                        size="small"
                        onClick={() => setQrOpen(true)}
                        sx={{
                            mt: 2.5,
                            boxShadow: 'none',
                        }}
                    >
                        Visitenkarte
                    </Button>

                    {/* Kontakt-Buttons */}
                    {(user.email || linkedinUrl) && (
                        <Box
                            sx={{
                                display: 'flex',
                                gap: 1,
                                mt: 1,
                            }}
                        >
                            {user.email && (
                                <Button
                                    variant="contained"
                                    startIcon={<EmailIcon />}
                                    fullWidth
                                    size="small"
                                    href={`mailto:${user.email}`}
                                    sx={{ boxShadow: 'none' }}
                                >
                                    Nachricht
                                </Button>
                            )}

                            {linkedinUrl && (
                                <Button
                                    variant={
                                        user.email
                                            ? 'outlined'
                                            : 'contained'
                                    }
                                    startIcon={<LinkedInIcon />}
                                    fullWidth
                                    size="small"
                                    href={linkedinUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    sx={{
                                        color: user.email
                                            ? '#0077b5'
                                            : 'white',
                                        bgcolor: user.email
                                            ? 'transparent'
                                            : '#0077b5',
                                        borderColor: '#0077b5',
                                        boxShadow: 'none',
                                        '&:hover': {
                                            bgcolor: '#005885',
                                            color: 'white',
                                            borderColor: '#005885',
                                        },
                                    }}
                                >
                                    LinkedIn
                                </Button>
                            )}
                        </Box>
                    )}
                </Box>
            </Box>

            {/* QR-Code-Dialog */}
            <Dialog
                open={qrOpen}
                onClose={() => setQrOpen(false)}
                maxWidth="xs"
                fullWidth
                aria-labelledby="profile-qr-dialog-title"
                PaperProps={{
                    sx: {
                        borderRadius: 3,
                    },
                }}
            >
                <DialogTitle
                    id="profile-qr-dialog-title"
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        pb: 1,
                    }}
                >
                    <Typography
                        component="span"
                        variant="h6"
                        fontWeight="bold"
                    >
                        Kontakt teilen
                    </Typography>

                    <IconButton
                        onClick={() => setQrOpen(false)}
                        size="small"
                        aria-label="Dialog schließen"
                        sx={{ bgcolor: 'action.hover' }}
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>

                <DialogContent
                    sx={{
                        textAlign: 'center',
                        pb: 4,
                        pt: 2,
                    }}
                >
                    <Typography
                        variant="body2"
                        color="text.secondary"
                    >
                        Scannen Sie den QR-Code, um das öffentliche
                        Profil von {displayName} zu öffnen.
                    </Typography>

                    <Box
                        sx={{
                            mt: 3,
                            bgcolor: 'white',
                            p: 2,
                            display: 'inline-block',
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'divider',
                            boxShadow: 1,
                        }}
                    >
                        <QRCodeSVG
                            value={publicProfileUrl}
                            size={200}
                            level="H"
                            fgColor="#111827"
                            bgColor="#ffffff"
                        />
                    </Box>

                    <Typography
                        variant="subtitle1"
                        fontWeight="bold"
                        sx={{ mt: 2 }}
                    >
                        {displayName}
                    </Typography>

                    {orgName && (
                        <Typography
                            variant="body2"
                            color="text.secondary"
                        >
                            {orgName}
                        </Typography>
                    )}

                    <Stack
                        direction={{
                            xs: 'column',
                            sm: 'row',
                        }}
                        spacing={1}
                        sx={{ mt: 3 }}
                    >
                        <Button
                            variant="contained"
                            startIcon={<VisibilityIcon />}
                            href={publicProfileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            fullWidth
                            sx={{ boxShadow: 'none' }}
                        >
                            Profil öffnen
                        </Button>

                        <Tooltip
                            title={
                                copied
                                    ? 'Link wurde kopiert'
                                    : 'Profil-Link kopieren'
                            }
                        >
                            <Button
                                variant="outlined"
                                startIcon={<ContentCopyIcon />}
                                onClick={handleCopyProfileUrl}
                                fullWidth
                            >
                                {copied
                                    ? 'Kopiert'
                                    : 'Link kopieren'}
                            </Button>
                        </Tooltip>
                    </Stack>
                </DialogContent>
            </Dialog>
        </>
    );
};
