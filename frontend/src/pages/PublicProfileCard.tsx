import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
    Box, Card, CardContent, Typography, Avatar, CircularProgress, 
    Alert, Stack, Button, Divider, useTheme, Chip, Link
} from '@mui/material';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import BusinessIcon from '@mui/icons-material/Business';
import ContactPhoneIcon from '@mui/icons-material/ContactPhone';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
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
    const theme = useTheme();

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await apiClient.get(`/api/users/public/${userId}`);
                setUser(res.data);
            } catch (err) {
                setError("Profil konnte nicht geladen werden.");
            } finally {
                setLoading(false);
            }
        };
        if (userId) fetchProfile();
    }, [userId]);

    const downloadVCard = () => {
        if (!user) return;
        
        const vCardData = [
            'BEGIN:VCARD',
            'VERSION:3.0',
            `N:${user.last_name || ''};${user.first_name || ''};;;`,
            `FN:${user.first_name} ${user.last_name}`,
            `ORG:${user.organization_name || user.bp_name || 'Mobiliti Dashboard'}`,
            `EMAIL;type=INTERNET;type=WORK:${user.email || ''}`,
            `TEL;type=CELL:${user.phone || ''}`,
            `URL:${user.linkedin_url || ''}`,
            'END:VCARD'
        ].join('\n');

        const blob = new Blob([vCardData], { type: "text/vcard;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `${user.first_name || 'Kontakt'}_${user.last_name || ''}.vcf`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) return <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress /></Box>;
    if (error || !user) return <Box sx={{ p: 4, textAlign: 'center' }}><Alert severity="error">{error || "User nicht gefunden"}</Alert></Box>;

    const displayName = (user.first_name && user.last_name) ? `${user.first_name} ${user.last_name}` : user.username;
    const memberSinceYear = new Date(user.member_since).getFullYear();

    return (
        <Box sx={{ 
            minHeight: '100vh', 
            bgcolor: 'grey.100', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            p: 2 
        }}>
            <Card sx={{ maxWidth: 400, width: '100%', borderRadius: 4, boxShadow: theme.shadows[10], overflow: 'visible', mt: 6 }}>
                
                {/* Header mit Avatar */}
                <Box sx={{ position: 'relative', height: 100, bgcolor: 'primary.main', borderRadius: '16px 16px 0 0' }}>
                    <Box sx={{ position: 'absolute', bottom: -50, left: '50%', transform: 'translate(-50%, 0)' }}>
                        <Avatar 
                            src={user.profile_image_url || undefined} 
                            sx={{ width: 100, height: 100, border: '4px solid white', boxShadow: 2, fontSize: '2.5rem' }}
                        >
                            {!user.profile_image_url && displayName.charAt(0)}
                        </Avatar>
                    </Box>
                </Box>
                
                <CardContent sx={{ pt: 7, textAlign: 'center', pb: 4 }}>
                    <Typography variant="h5" fontWeight="bold" gutterBottom>{displayName}</Typography>
                    
                    {/* Business Partner Logo oder Text */}
                    <Box sx={{ minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
                        {user.bp_logo_url ? (
                            <img 
                                src={user.bp_logo_url} 
                                alt={user.bp_name || 'Partner'} 
                                style={{ maxHeight: 40, maxWidth: '80%', objectFit: 'contain' }} 
                            />
                        ) : (
                            user.organization_name && (
                                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: 'text.secondary' }}>
                                    <BusinessIcon fontSize="small" />
                                    <Typography variant="body1">{user.organization_name}</Typography>
                                </Stack>
                            )
                        )}
                    </Box>

                    {/* Kombinierte Info: Level & Mitglied seit */}
                    <Stack direction="row" justifyContent="center" alignItems="center" spacing={1} sx={{ mb: 4 }}>
                        {user.membership_level ? (
                            <Chip 
                                icon={<VerifiedUserIcon />} 
                                label={`${user.membership_level} • Seit ${memberSinceYear}`} 
                                color="primary" 
                                variant="outlined" 
                                sx={{ fontWeight: 'medium' }}
                            />
                        ) : (
                            <Chip label={`Mitglied seit ${memberSinceYear}`} variant="outlined" size="small" />
                        )}
                    </Stack>

                    {/* Aktions-Buttons */}
                    <Stack spacing={2}>
                        <Button 
                            variant="contained" 
                            size="large" 
                            startIcon={<ContactPhoneIcon />} 
                            onClick={downloadVCard}
                            fullWidth
                            sx={{ borderRadius: 2 }}
                        >
                            Kontakt speichern
                        </Button>

                        <Stack direction="row" spacing={2} justifyContent="center">
                            {user.email && (
                                <Button 
                                    variant="outlined" 
                                    startIcon={<EmailIcon />} 
                                    href={`mailto:${user.email}`}
                                    fullWidth
                                    sx={{ borderRadius: 2 }}
                                >
                                    E-Mail
                                </Button>
                            )}
                            {user.phone && (
                                <Button 
                                    variant="outlined" 
                                    startIcon={<PhoneIcon />} 
                                    href={`tel:${user.phone}`}
                                    fullWidth
                                    sx={{ borderRadius: 2 }}
                                >
                                    Anruf
                                </Button>
                            )}
                        </Stack>

                        {user.linkedin_url && (
                            <Button 
                                variant="text" 
                                startIcon={<LinkedInIcon />} 
                                href={user.linkedin_url} 
                                target="_blank"
                                fullWidth
                                sx={{ borderRadius: 2, color: '#0077b5' }}
                            >
                                LinkedIn
                            </Button>
                        )}
                    </Stack>

                    <Divider sx={{ my: 3 }} />
                    
                    <Typography variant="caption" color="text.disabled">
                        Virtuelle Visitenkarte • {' '}
                        <Link 
                            href="https://www.mobiliti.at" 
                            target="_blank" 
                            rel="noopener" 
                            color="inherit" 
                            underline="hover"
                        >
                            Mobiliti Dashboard
                        </Link>
                    </Typography>
                </CardContent>
            </Card>
        </Box>
    );
};

export default PublicProfileCard;