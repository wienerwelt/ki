// frontend/src/pages/PublicBpCard.tsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
    Box, Card, CardContent, Typography, CircularProgress, 
    Alert, Button, Stack, useTheme, Fade, Container
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { QRCodeCanvas } from 'qrcode.react';
import apiClient from '../apiClient';

interface PublicPartner {
    id: string;
    name: string;
    slug?: string | null; // NEU: Optionales Slug-Feld
    logo_url: string | null;
    dashboard_title: string | null;
    primary_color: string | null;
    voucher_code: string;
}

const PublicBpCard: React.FC = () => {
    const { bpId } = useParams<{ bpId: string }>();
    const [partner, setPartner] = useState<PublicPartner | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const theme = useTheme();

    useEffect(() => {
        const fetchPartner = async () => {
            try {
                const res = await apiClient.get(`/api/public/partner-card/${bpId}`);
                setPartner(res.data);
            } catch (err) {
                setError("Partner-Daten konnten nicht geladen werden.");
            } finally {
                setLoading(false);
            }
        };
        if (bpId) fetchPartner();
    }, [bpId]);

    if (loading) return <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress /></Box>;
    if (error || !partner) return <Box sx={{ p: 4, textAlign: 'center' }}><Alert severity="error">{error || "Partner nicht gefunden"}</Alert></Box>;

    // NEU: Logik für den sauberen Link. Priorisiert den Slug, fällt auf den Voucher-Code zurück
    const accessCode = partner.slug || partner.voucher_code;
    
    // NEU: Der Link ist jetzt sauber (z.B. mobiliti.at/vfa statt mobiliti.at/register?partner=12345678)
    const registerUrl = `${window.location.origin}/${accessCode}`;

    const handleCopyCode = () => {
        // NEU: Wir kopieren direkt den ganzen Link in die Zwischenablage, das ist nutzerfreundlicher!
        navigator.clipboard.writeText(registerUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <Box sx={{ 
            minHeight: '100vh', 
            bgcolor: 'grey.100', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            p: 2,
            '@media print': {
                bgcolor: 'white',
                p: 0,
                alignItems: 'flex-start'
            }
        }}>
            <Fade in={true} timeout={800}>
                <Container maxWidth="sm">
                    <Card sx={{ 
                        borderRadius: 4, 
                        boxShadow: theme.shadows[10], 
                        overflow: 'hidden',
                        position: 'relative',
                        '@media print': {
                            boxShadow: 'none',
                            border: '1px solid #ccc'
                        }
                    }}>
                        {/* Header Branding */}
                        <Box sx={{ 
                            height: 120, 
                            bgcolor: partner.primary_color || 'primary.main',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative'
                        }}>
                            {/* Logo Overlay */}
                            <Box sx={{ 
                                position: 'absolute', 
                                bottom: -40, 
                                left: '50%', 
                                transform: 'translate(-50%, 0)',
                                bgcolor: 'white',
                                p: 2,
                                borderRadius: '50%',
                                boxShadow: 3,
                                width: 100,
                                height: 100,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                {partner.logo_url ? (
                                    <img src={partner.logo_url} alt={partner.name} style={{ maxWidth: '80%', maxHeight: '80%', objectFit: 'contain' }} />
                                ) : (
                                    <Typography variant="h4" fontWeight="bold" color="primary">
                                        {partner?.name ? partner.name.charAt(0).toUpperCase() : '?'}
                                    </Typography>
                                )}
                            </Box>
                        </Box>

                        <CardContent sx={{ pt: 7, textAlign: 'center', pb: 5 }}>
                            <Typography variant="h5" fontWeight="bold" gutterBottom>
                                Willkommen bei {partner.name}
                            </Typography>
                            <Typography variant="body1" color="text.secondary" paragraph>
                                Scannen Sie den QR-Code oder nutzen Sie den Link, um Ihrem Team-Dashboard beizutreten.
                            </Typography>

                            {/* QR Code Section */}
                            <Box sx={{ my: 4, display: 'flex', justifyContent: 'center' }}>
                                <Box sx={{ p: 2, border: '1px solid #eee', borderRadius: 2, bgcolor: 'white' }}>
                                    <QRCodeCanvas 
                                        value={registerUrl}
                                        size={220}
                                        level="H"
                                        includeMargin={true}
                                    />
                                </Box>
                            </Box>

                            {/* Access Code Display */}
                            <Box sx={{ 
                                bgcolor: 'grey.50', 
                                p: 3, 
                                borderRadius: 3, 
                                border: '1px dashed #ccc',
                                mb: 4,
                                position: 'relative'
                            }}>
                                <Typography variant="overline" color="text.secondary" display="block">
                                    Ihr Zugangs-Code
                                </Typography>
                                {/* NEU: Letter-Spacing dynamisch, da Slugs besser enger zusammenstehen als die alten 8-stelligen Codes */}
                                <Typography variant="h3" fontWeight="900" sx={{ letterSpacing: partner.slug ? 1 : 4, color: 'primary.main' }}>
                                    {accessCode}
                                </Typography>
                                
                                <Button 
                                    size="small" 
                                    startIcon={copied ? <CheckCircleIcon /> : <ContentCopyIcon />}
                                    onClick={handleCopyCode}
                                    sx={{ mt: 1, '@media print': { display: 'none' } }}
                                >
                                    {copied ? 'Link kopiert!' : 'Link kopieren'}
                                </Button>
                            </Box>

                            <Typography variant="body2" color="text.disabled">
                                Registrierung unter:<br/>
                                <strong>{registerUrl}</strong>
                            </Typography>

                            {/* Actions (Hidden on Print) */}
                            <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 4, '@media print': { display: 'none' } }}>
                                <Button variant="outlined" startIcon={<PrintIcon />} onClick={handlePrint}>
                                    Karte drucken
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