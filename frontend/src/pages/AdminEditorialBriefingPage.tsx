// frontend/src/pages/AdminEditorialBriefingPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    Container, Typography, Box, Paper, TextField, Button, Grid, 
    Stack, IconButton, Card, CircularProgress, AccordionSummary, Accordion, TableCell, Table, AccordionDetails, TableRow, TableBody,
    MenuItem, Select, Chip, useTheme, Dialog, DialogContent,
    DialogTitle, DialogActions, RadioGroup, FormControlLabel, Radio, 
    Switch, Backdrop, Avatar, Alert,
    // NEU: Diese Imports haben gefehlt
    List, ListItem, ListItemText
} from '@mui/material';
import { 
    AutoAwesome as AutoAwesomeIcon, HistoryEdu as HistoryEduIcon, Email as EmailIcon, 
    KeyboardArrowUp as UpIcon, KeyboardArrowDown as DownIcon,
    History as HistoryIcon,
    Business as BusinessIcon, 
    Send as SendIcon, Close as CloseIcon, DataUsage as DataUsageIcon, 
    PrecisionManufacturing as RobotIcon, EditNote as EditIcon, 
    MarkEmailRead as PublishIcon, Storage as StorageIcon,
    ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';
import { useAuth } from '../context/AuthContext';

// --- HELPER: Nächsten Versandzeitpunkt berechnen ---
const getNextRunText = (frequency: string) => {
    if (frequency === 'never') return 'Pausiert';
    const now = new Date();
    const next = new Date(now);
    next.setHours(8, 0, 0, 0);
    if (now.getHours() >= 8) next.setDate(next.getDate() + 1); 
    if (frequency === 'weekly') {
        const diff = (5 - next.getDay() + 7) % 7 || 7; 
        next.setDate(next.getDate() + (next.getDay() === 5 && now.getHours() < 8 ? 0 : diff));
    } else if (frequency === 'biweekly') {
        const diff = (5 - next.getDay() + 7) % 7; 
        next.setDate(next.getDate() + diff + (next.getDay() === 5 && now.getHours() < 8 ? 14 : 7));
    } else if (frequency === 'monthly') {
        next.setMonth(next.getMonth() + 1);
        next.setDate(1);
    }
    const diffMs = next.getTime() - now.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `in ${days}T ${hours}h (ca. ${next.toLocaleDateString('de-DE')})`;
    return `in ${hours}h ${minutes}m`;
};

// --- SUB-KOMPONENTE: VORSCHAU DIALOG ---
const BriefingPreviewDialog = ({ open, onClose, items, partner }: any) => {
    const primaryColor = partner?.color_scheme?.primary_color || '#1e293b';
    
    const topInsights = items.filter((i: any) => i.briefing_type === 'top_insight');
    const regulations = items.filter((i: any) => i.briefing_type === 'regulation');
    const actionPlans = items.filter((i: any) => i.briefing_type === 'action_plan');

    const renderSources = (relatedArticlesData: any) => {
        if (!relatedArticlesData || relatedArticlesData === '[]') return null;
        let links: string[] = [];
        if (Array.isArray(relatedArticlesData)) links = relatedArticlesData;
        else if (typeof relatedArticlesData === 'string') {
            try {
                const parsed = JSON.parse(relatedArticlesData);
                links = Array.isArray(parsed) ? parsed : [parsed];
            } catch (e) {
                if (relatedArticlesData.trim().startsWith('http')) links = [relatedArticlesData.trim()];
            }
        }
        links = links.filter(l => typeof l === 'string' && l.trim().startsWith('http'));

        if (links.length > 0) {
            return (
                <Box sx={{ mt: 1.5, pt: 1, borderTop: '1px dashed #e2e8f0' }}>
                    {links.map((url: string, i: number) => (
                        <Typography key={i} variant="caption" sx={{ display: 'block', mt: 0.5, wordBreak: 'break-all' }}>
                            <span style={{ color: '#64748b', fontWeight: 'bold' }}>Quelle: </span>
                            <a href={url.trim()} target="_blank" rel="noopener noreferrer" style={{ color: primaryColor, textDecoration: 'none', fontWeight: 500 }}>
                                {url.trim()}
                            </a>
                        </Typography>
                    ))}
                </Box>
            );
        }
        return null;
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
            <DialogContent sx={{ p: 0, bgcolor: '#f4f6f8' }}>
                <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8, color: '#9ca3af' }}><CloseIcon /></IconButton>
                <Box sx={{ p: { xs: 2, sm: 4 } }}>
                    <Paper sx={{ overflow: 'hidden', borderRadius: 3, boxShadow: '0 4px 6px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
                        <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f3f4f6', bgcolor: '#fff' }}>
                            <Box sx={{ height: 40, minWidth: 40, display: 'flex', alignItems: 'center' }}>
                                {partner?.logo_url ? <Box component="img" src={partner.logo_url} sx={{ height: 40, objectFit: 'contain' }} /> : <BusinessIcon sx={{ color: '#cbd5e1', fontSize: 32 }} />}
                            </Box>
                        </Box>
                        <Box sx={{ p: 4, bgcolor: '#fff' }}>
                            <Typography variant="h5" sx={{ fontWeight: 800, mb: 3 }}>Tages-Briefing</Typography>
                            
                            {topInsights.length > 0 && (
                                <Box sx={{ mb: 4 }}>
                                    <Typography variant="h6" sx={{ color: primaryColor, borderBottom: `2px solid ${primaryColor}20`, pb: 1, mb: 2 }}>Top Insights</Typography>
                                    {topInsights.map((x: any, idx: number) => (
                                        <Box key={idx} sx={{ my: 2, p: 2, bgcolor: '#f8fafc', borderLeft: `4px solid ${primaryColor}` }}>
                                            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>{idx + 1}. {x.headline}</Typography>
                                            <Typography variant="body2" sx={{ mb: 1 }}><strong>Analyse:</strong> {x.analysis_summary}</Typography>
                                            <Typography variant="body2" sx={{ mb: 1 }}><strong>Bedeutung:</strong> {x.prognosis}</Typography>
                                            <Typography variant="body2"><strong>Empfehlung:</strong> {x.talking_point}</Typography>
                                            {renderSources(x.related_articles)}
                                        </Box>
                                    ))}
                                </Box>
                            )}

                            {regulations.length > 0 && (
                                <Box sx={{ mb: 4 }}>
                                    <Typography variant="h6" sx={{ color: primaryColor, borderBottom: `2px solid ${primaryColor}20`, pb: 1, mb: 2 }}>Regulatorik & Förderungen</Typography>
                                    {regulations.map((x: any, idx: number) => (
                                        <Box key={idx} sx={{ my: 2, p: 2, bgcolor: '#fffbed', borderLeft: `4px solid #16a34a` }}>
                                            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>{x.headline}</Typography>
                                            <Typography variant="body2" sx={{ mb: 1 }}>{x.analysis_summary}</Typography>
                                            {x.talking_point && <Typography variant="body2"><strong>Aktion:</strong> {x.talking_point}</Typography>}
                                            {renderSources(x.related_articles)}
                                        </Box>
                                    ))}
                                </Box>
                            )}

                            {actionPlans.length > 0 && (
                                <Box sx={{ mb: 4 }}>
                                    <Typography variant="h6" sx={{ color: primaryColor, borderBottom: `2px solid ${primaryColor}20`, pb: 1, mb: 2 }}>Empfohlene Aktionen (Events)</Typography>
                                    {actionPlans.map((x: any, idx: number) => (
                                        <Box key={idx} sx={{ my: 2, p: 2, bgcolor: '#f1f5f9', borderLeft: `4px solid #64748b` }}>
                                            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0 }}>{x.headline}</Typography>
                                            {renderSources(x.related_articles)}
                                        </Box>
                                    ))}
                                </Box>
                            )}
                        </Box>
                    </Paper>
                </Box>
            </DialogContent>
        </Dialog>
    );
};

const StepHeader: React.FC<{ stepNumber: number; title: string; subtitle: string; icon: React.ReactNode }> = ({ stepNumber, title, subtitle, icon }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40, fontWeight: 900, fontSize: '1.2rem' }}>{stepNumber}</Avatar>
        <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                {title} {icon}
            </Typography>
            <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
        </Box>
    </Box>
);

const AdminEditorialBriefingPage: React.FC = () => {
    const { user } = useAuth();
    const { showSnackbar } = useSnackbar();
    const theme = useTheme();
    
    const [partners, setPartners] = useState<any[]>([]);
    const [selectedBpId, setSelectedBpId] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState<string | null>(null); 
    const [isGenerating, setIsGenerating] = useState(false);
    const [prevGenerating, setPrevGenerating] = useState(false);
    
    const [previewOpen, setPreviewOpen] = useState(false);
    const [historyPreviewOpen, setHistoryPreviewOpen] = useState(false);
    const [historyPreviewItems, setHistoryPreviewItems] = useState<any[]>([]);
    
    const [testEmailOpen, setTestEmailOpen] = useState(false);
    const [testEmailAddress, setTestEmailAddress] = useState(user?.email || '');
    const [countdown, setCountdown] = useState<string>('');

    const [briefingItems, setBriefingItems] = useState<any[]>([]);
    const [debugInfo, setDebugInfo] = useState<any>(null);
    const [briefingFrequency, setBriefingFrequency] = useState<string>('never');
    const [autoApprove, setAutoApprove] = useState<boolean>(false);

    const [rawDataOpen, setRawDataOpen] = useState(false);
    const [rawDataItems, setRawDataItems] = useState<any[]>([]);
    const [loadingRawData, setLoadingRawData] = useState(false);

    const [recipientsOpen, setRecipientsOpen] = useState(false);
    const [recipientsList, setRecipientsList] = useState<any[]>([]);
    const [loadingRecipients, setLoadingRecipients] = useState(false);

    const handleOpenRecipients = async () => {
        setRecipientsOpen(true);
        setLoadingRecipients(true);
        setRecipientsList([]); // <--- WICHTIG: Zuerst leeren
        try {
            const res = await apiClient.get(`/api/admin/briefing/recipients?bpId=${selectedBpId}`);
            // Sicherstellen, dass wir nur ein Array setzen
            setRecipientsList(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            console.error(e);
            showSnackbar('Fehler beim Laden der Empfänger', 'error');
            setRecipientsList([]); // <--- Falls Fehler, leeres Array behalten
        } finally {
            setLoadingRecipients(false);
        }
    };

    const [newsletterFrequency, setNewsletterFrequency] = useState<string>('never');
    const [newsletterDeliveryMode, setNewsletterDeliveryMode] = useState<'mobiliti' | 'export' | 'external'>('mobiliti');
    const [newsletterExportEmail, setNewsletterExportEmail] = useState('');
    const [newsletterExternalSignupUrl, setNewsletterExternalSignupUrl] = useState('');
    const [newsletterRecipientLimit, setNewsletterRecipientLimit] = useState(250);

    useEffect(() => {
        const init = async () => {
            if (user?.role === 'admin') {
                try {
                    const res = await apiClient.get('/api/admin/briefing/partners');
                    setPartners(res.data);
                    const firstActive = res.data.find((p: any) => p.is_active !== false);
                    setSelectedBpId(user.business_partner_id || (firstActive ? firstActive.id : res.data[0]?.id));
                } catch (e) { showSnackbar('Partner-Ladefehler', 'error'); }
            } else { setSelectedBpId(user?.business_partner_id || ''); }
        };
        init();
    }, [user, showSnackbar]);

    const handleOpenRawData = async () => {
        setRawDataOpen(true);
        setLoadingRawData(true);
        try {
            const res = await apiClient.get(`/api/admin/briefing/raw-data?bpId=${selectedBpId}`);
            setRawDataItems(res.data);
        } catch (e) {
            showSnackbar('Fehler beim Laden der Rohdaten', 'error');
        } finally {
            setLoadingRawData(false);
        }
    };

    const loadData = useCallback(async () => {
        if (!selectedBpId) return;
        try {
            const timestamp = Date.now();
            const [briefingRes, debugRes] = await Promise.all([
                apiClient.get(`/api/admin/briefing/draft?bpId=${selectedBpId}&t=${timestamp}`).catch(() => ({ data: [] })),
                apiClient.get(`/api/admin/briefing/debug-status?bpId=${selectedBpId}&t=${timestamp}`)
            ]);
            setBriefingItems(Array.isArray(briefingRes.data) ? briefingRes.data : []);
            setDebugInfo(debugRes.data);
            setBriefingFrequency(debugRes.data.briefing_frequency || 'never');
            setNewsletterFrequency(debugRes.data.newsletter_frequency || 'never');
            setNewsletterDeliveryMode(debugRes.data.newsletter_delivery_mode || 'mobiliti');
            setNewsletterExportEmail(debugRes.data.newsletter_export_email || '');
            setNewsletterExternalSignupUrl(debugRes.data.newsletter_external_signup_url || '');
            setNewsletterRecipientLimit(Number(debugRes.data.newsletter_recipient_limit) || 250);
            setAutoApprove(debugRes.data.auto_approve_briefings || false);
            setIsGenerating(debugRes.data.is_generating || false);
        } catch (e) { showSnackbar('Datenfehler', 'error'); }
        finally { setLoading(false); }
    }, [selectedBpId, showSnackbar]);

    useEffect(() => { loadData(); }, [loadData]);
    
    useEffect(() => {
        let interval: any;
        if (isGenerating) interval = setInterval(loadData, 3000);
        return () => clearInterval(interval);
    }, [isGenerating, loadData]);

    useEffect(() => {
        if (prevGenerating && !isGenerating) {
            showSnackbar('KI-Prozess abgeschlossen!', 'success');
        }
        setPrevGenerating(isGenerating);
    }, [isGenerating, prevGenerating, showSnackbar]);

    useEffect(() => {
        setCountdown(getNextRunText(briefingFrequency));
        const timer = setInterval(() => setCountdown(getNextRunText(briefingFrequency)), 60000);
        return () => clearInterval(timer);
    }, [briefingFrequency]);

    const saveSettings = async (dashFreq: string, mailFreq: string, auto: boolean) => {
        try {
            await apiClient.put('/api/admin/briefing/settings', { 
                bpId: selectedBpId, 
                frequency: dashFreq, 
                newsletterFrequency: mailFreq, 
                autoApprove: auto,
                newsletterDeliveryMode,
                newsletterExportEmail: newsletterExportEmail || null,
                newsletterExternalSignupUrl: newsletterExternalSignupUrl || null,
                newsletterRecipientLimit
            });
            showSnackbar('Einstellungen gespeichert.', 'success');
            loadData(); 
        } catch (e) { showSnackbar('Fehler beim Speichern.', 'error'); }
    };

    const handleSaveDeliverySettings = () => saveSettings(briefingFrequency, newsletterFrequency, autoApprove);

    const handleNewsletterFreqChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewsletterFrequency(val);
    saveSettings(briefingFrequency, val, autoApprove); 
    };

    const handleDashboardFreqChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setBriefingFrequency(val);
    saveSettings(val, newsletterFrequency, autoApprove); 
    };

    const handleAutoApproveChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.checked;
        if (val && !window.confirm('WARNUNG: Die KI veröffentlicht dann ohne Ihre Freigabe im Dashboard. Fortfahren?')) return;
        setAutoApprove(val);
        saveSettings(briefingFrequency, newsletterFrequency, val);
    };

    const handleManualTrigger = async () => {
        setIsGenerating(true); 
        try {
            await apiClient.post('/api/admin/briefing/trigger-manual', { bpId: selectedBpId });
        } catch (e) { setIsGenerating(false); showSnackbar('Fehler beim KI-Start', 'error'); }
    };

    const handleSaveItem = async (item: any) => {
        setIsSaving(item.id);
        try {
            await apiClient.put(`/api/admin/briefing/${item.id}`, item);
            showSnackbar('Gespeichert.', 'success');
        } catch (e) { showSnackbar('Fehler.', 'error'); }
        finally { setIsSaving(null); }
    };

    const handleDeleteItem = async (id: string) => {
        if(!window.confirm('Block löschen?')) return;
        try {
            await apiClient.delete(`/api/admin/briefing/${id}`);
            setBriefingItems(prev => prev.filter(i => i.id !== id));
            showSnackbar('Gelöscht.', 'info');
        } catch (e) { showSnackbar('Fehler.', 'error'); }
    };

    const handleMoveItem = (index: number, direction: 'up' | 'down') => {
        const newItems = [...briefingItems];
        if (direction === 'up' && index > 0) [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
        else if (direction === 'down' && index < newItems.length - 1) [newItems[index + 1], newItems[index]] = [newItems[index], newItems[index + 1]];
        setBriefingItems(newItems);
    };

    const handleSendTestEmail = async () => {
        if(!testEmailAddress) return;
        try {
            await apiClient.post(`/api/admin/briefing/test-email`, { bpId: selectedBpId, email: testEmailAddress, items: briefingItems });
            showSnackbar(`Test E-Mail gesendet an ${testEmailAddress}`, 'success');
            setTestEmailOpen(false);
        } catch (e) { showSnackbar('Fehler.', 'error'); }
    };

    const handlePublishAll = async () => {
        if (!window.confirm(`Jetzt an ${debugInfo?.potentialRecipients || 0} Empfänger versenden?`)) return;
        try {
            await apiClient.post(`/api/admin/briefing/publish-bulk`, { bpId: selectedBpId, itemIds: briefingItems.map(i => i.id) });
            showSnackbar('Versand gestartet!', 'success');
            setBriefingItems([]); 
            loadData();
        } catch (e) { showSnackbar('Fehler beim Versand.', 'error'); }
    };

    if (loading && partners.length === 0) return <DashboardLayout><Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box></DashboardLayout>;

    const currentPartnerData = partners.find(p => p.id === selectedBpId);

    const groupedHistory = (debugInfo?.history || []).reduce((acc: any, curr: any) => {
        const dateStr = new Date(curr.created_at).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });
        if (!acc[dateStr]) acc[dateStr] = [];
        acc[dateStr].push(curr);
        return acc;
    }, {});

    const getFriendlyTypeName = (type: string) => {
        switch (type) {
            case 'top_insight': return 'Top Insight';
            case 'regulation': return 'Regulatorik';
            case 'action_plan': return 'Action Plan (Event)';
            default: return type.toUpperCase();
        }
    };

    return (
        <DashboardLayout>
            <Container maxWidth="lg" sx={{ mt: 4, mb: 10 }}>
                
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between', alignItems: 'center', mb: 5, pb: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Box>
                        <Typography variant="h4" sx={{ fontWeight: 800 }}>Briefing Workflow</Typography>
                        <Typography color="text.secondary">Erstellen und Verwalten der KI-News für {currentPartnerData?.name || 'Mandant'}</Typography>
                    </Box>
                    {user?.role === 'admin' && (
                        <Select size="small" value={selectedBpId} onChange={(e) => setSelectedBpId(e.target.value)} sx={{ minWidth: 200, bgcolor: 'background.paper' }}>
                            {partners.map(p => {
                                const isDisabled = p.is_active === false || p.allow_automated_newsletter === false;
                                return (
                                    <MenuItem key={p.id} value={p.id} disabled={isDisabled} sx={{ opacity: isDisabled ? 0.6 : 1 }}>
                                        {p.name} 
                                        {p.is_active === false && ' (Inaktiv)'}
                                        {(p.is_active !== false && p.allow_automated_newsletter === false) && ' (Newsletter deaktiviert)'}
                                    </MenuItem>
                                );
                            })}
                        </Select>
                    )}
                </Box>

                <Grid container spacing={4} sx={{ mb: 6 }}>
                    <Grid item xs={12} md={6}>
                        <Paper sx={{ p: 3, height: '100%', borderRadius: 3, border: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
                            <StepHeader stepNumber={1} title="Daten-Check" subtitle="Rohmaterial, auf das die KI aktuell zugreifen kann." icon={<DataUsageIcon color="primary" />} />
                            
                            <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
                                <Box onClick={handleOpenRawData} sx={{ flex: 1, p: 2, bgcolor: '#fff', borderRadius: 2, border: '1px solid #e2e8f0', textAlign: 'center', cursor: 'pointer', '&:hover': { bgcolor: '#f1f5f9', borderColor: 'primary.main' }, transition: 'all 0.2s' }}>
                                    <Typography variant="h4" sx={{ fontWeight: 900, color: 'primary.main' }}>{debugInfo?.newsCount3d || 0}</Typography>
                                    <Typography variant="caption" color="text.secondary" fontWeight="bold">Relevante News & Events (Klicken zum Ansehen)</Typography>
                                </Box>
                                <Box 
                                    onClick={handleOpenRecipients} 
                                    sx={{ 
                                        flex: 1, p: 2, bgcolor: '#fff', borderRadius: 2, border: '1px solid #e2e8f0', 
                                        textAlign: 'center', cursor: 'pointer', 
                                        '&:hover': { bgcolor: '#f1f5f9', borderColor: 'primary.main' }, transition: 'all 0.2s' 
                                    }}
                                >
                                    <Typography variant="h4" sx={{ fontWeight: 900, color: 'primary.main' }}>{debugInfo?.potentialRecipients || 0}</Typography>
                                    <Typography variant="caption" color="text.secondary" fontWeight="bold">Aktive E-Mail Empfänger (Klicken)</Typography>
                                </Box>
                            </Stack>
                            <Typography variant="body2" color="text.secondary">Die KI analysiert diese Daten, um Muster zu erkennen und das Briefing zu generieren.</Typography>

                            {user?.role === 'admin' && (
                                <Box sx={{ mt: 3, p: 2, bgcolor: '#e2e8f0', borderRadius: 2 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                                        <StorageIcon fontSize="small" /> System-Tabellen (Nur Admin-Ansicht)
                                    </Typography>
                                    <Stack direction="row" flexWrap="wrap" gap={1}>
                                        <Chip label="scraped_content" size="small" variant="outlined" sx={{ bgcolor: '#fff', fontFamily: 'monospace', fontSize: '0.7rem' }} />
                                        <Chip label="economic_indicators" size="small" variant="outlined" sx={{ bgcolor: '#fff', fontFamily: 'monospace', fontSize: '0.7rem' }} />
                                        <Chip label="business_partner_categories" size="small" variant="outlined" sx={{ bgcolor: '#fff', fontFamily: 'monospace', fontSize: '0.7rem' }} />
                                    </Stack>
                                </Box>
                            )}
                        </Paper>
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <Paper sx={{ p: 3, height: '100%', borderRadius: 3, border: '1px solid #e2e8f0' }}>
                            <StepHeader stepNumber={2} title="Automatisierung" subtitle="Wann und wie soll die KI tätig werden?" icon={<RobotIcon color="primary" />} />
                            
<Grid container spacing={3}>
    <Grid item xs={12} sm={4}>
        <Typography variant="caption" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>Dashboard Update</Typography>
        <RadioGroup value={briefingFrequency} onChange={handleDashboardFreqChange}>
            <FormControlLabel value="daily" control={<Radio size="small" />} label={<Typography variant="body2">Täglich</Typography>} />
            <FormControlLabel value="weekly" control={<Radio size="small" />} label={<Typography variant="body2">Wöchentlich</Typography>} />
            <FormControlLabel value="never" control={<Radio size="small" />} label={<Typography variant="body2" color="error">Pausiert</Typography>} />
</RadioGroup>
    
    {/* DIESER BLOCK HAT GEFEHLT: */}
    <Typography variant="caption" color={briefingFrequency === 'never' ? 'error' : 'success.main'} sx={{ fontWeight: 'bold', display: 'block', mt: 1 }}>
        Nächster Lauf: {countdown}
    </Typography>
</Grid>

    <Grid item xs={12} sm={4}>
        <Typography variant="caption" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>E-Mail Versand</Typography>
        <RadioGroup value={newsletterFrequency} onChange={handleNewsletterFreqChange}>
            <FormControlLabel value="daily" control={<Radio size="small" />} label={<Typography variant="body2">Täglich</Typography>} />
            <FormControlLabel value="weekly" control={<Radio size="small" />} label={<Typography variant="body2">Wöchentlich (Fr.)</Typography>} />
            <FormControlLabel value="monthly" control={<Radio size="small" />} label={<Typography variant="body2">Monatlich (1.)</Typography>} />
            <FormControlLabel value="never" control={<Radio size="small" />} label={<Typography variant="body2" color="error">Nur Manuell</Typography>} />
        </RadioGroup>
    </Grid>

    <Grid item xs={12} sm={4}>
        <Typography variant="caption" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>Autopilot (Dashboard)</Typography>
        <Box sx={{ p: 1.5, bgcolor: autoApprove ? '#f0fdf4' : '#f1f5f9', border: '1px solid', borderColor: autoApprove ? '#86efac' : '#cbd5e1', borderRadius: 2 }}>
            <FormControlLabel
                control={<Switch checked={autoApprove} onChange={handleAutoApproveChange} color="success" disabled={briefingFrequency === 'never'} />}
                label={<Typography variant="body2" sx={{ fontWeight: 'bold' }}>Aktiviert</Typography>}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.3 }}>
                {autoApprove ? 'KI publiziert direkt ins Dashboard.' : 'KI erstellt nur Entwürfe für Schritt 3.'}
            </Typography>
        </Box>
    </Grid>
</Grid>
                            <Box sx={{ mt: 3, pt: 3, borderTop: '1px solid #e2e8f0' }}>
                                <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>Verteilung des Branchenbriefings</Typography>
                                <Alert severity="info" sx={{ mb: 2 }}>
                                    Direkt über Mobiliti ist für kleinere Verteiler gedacht. Ab dem Empfängerlimit wird das fertige Briefing nur an die zentrale Adresse exportiert. Im externen Modus versendet Mobiliti keine Mitglieder-E-Mails.
                                </Alert>
                                <Grid container spacing={2}>
                                    <Grid item xs={12} md={4}>
                                        <TextField select fullWidth size="small" label="Versandmodus" value={newsletterDeliveryMode} onChange={(e) => setNewsletterDeliveryMode(e.target.value as 'mobiliti' | 'export' | 'external')}>
                                            <MenuItem value="mobiliti">Direkt über Mobiliti</MenuItem>
                                            <MenuItem value="export">Export an zentrale Adresse</MenuItem>
                                            <MenuItem value="external">Externes Newsletter-System</MenuItem>
                                        </TextField>
                                    </Grid>
                                    <Grid item xs={12} md={4}>
                                        <TextField fullWidth size="small" type="email" label="Zentrale Newsletter-Adresse" value={newsletterExportEmail} onChange={(e) => setNewsletterExportEmail(e.target.value)} helperText="Pflicht für Export bzw. Rückfall oberhalb des Limits." />
                                    </Grid>
                                    <Grid item xs={12} md={4}>
                                        <TextField fullWidth size="small" type="number" label="Max. direkte Empfänger" value={newsletterRecipientLimit} onChange={(e) => setNewsletterRecipientLimit(Math.max(1, Number(e.target.value) || 250))} disabled={newsletterDeliveryMode !== 'mobiliti'} inputProps={{ min: 1, max: 100000 }} helperText="Empfehlung: 250" />
                                    </Grid>
                                    {newsletterDeliveryMode === 'external' && <Grid item xs={12} md={8}>
                                        <TextField fullWidth size="small" type="url" label="Externe Newsletter-Anmeldung" value={newsletterExternalSignupUrl} onChange={(e) => setNewsletterExternalSignupUrl(e.target.value)} required placeholder="https://…" />
                                    </Grid>}
                                    <Grid item xs={12} md={newsletterDeliveryMode === 'external' ? 4 : 12} sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start' }}>
                                        <Button variant="contained" onClick={handleSaveDeliverySettings} disabled={newsletterDeliveryMode === 'external' && !newsletterExternalSignupUrl.trim()}>
                                            Versandeinstellungen speichern
                                        </Button>
                                    </Grid>
                                </Grid>
                            </Box>
                        </Paper>
                    </Grid>
                </Grid>

                <Paper sx={{ p: 3, mb: 6, borderRadius: 3, border: '1px solid #e2e8f0' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                        <StepHeader stepNumber={3} title="Redaktion (Entwürfe)" subtitle="Prüfen und bearbeiten Sie die Texte der KI." icon={<EditIcon color="primary" />} />
                        <Button variant="outlined" startIcon={<AutoAwesomeIcon />} onClick={handleManualTrigger} disabled={isGenerating}>
                            KI manuell starten
                        </Button>
                    </Box>

                    {briefingItems.length > 0 ? (
                        <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2 }}>
                            {briefingItems.map((item, idx) => (
                                <Card key={item.id} sx={{ p: { xs: 2, md: 3 }, mb: 2, borderRadius: 2, borderLeft: '6px solid', borderLeftColor: theme.palette.primary.main, overflow: 'visible' }}>
                                    <Grid container spacing={3}>
                                        <Grid item xs={12} md={10}>
                                            <Stack spacing={2}>
                                                <TextField fullWidth label="Headline" variant="standard" value={item.headline || ''} onChange={(e) => { const upd = [...briefingItems]; upd[idx].headline = e.target.value; setBriefingItems(upd); }} inputProps={{ style: { fontSize: 20, fontWeight: 700 } }} />
                                                <TextField fullWidth multiline rows={3} label="Zusammenfassung (Analyse)" value={item.analysis_summary || ''} onChange={(e) => { const upd = [...briefingItems]; upd[idx].analysis_summary = e.target.value; setBriefingItems(upd); }} />
                                                <Grid container spacing={2}>
                                                    <Grid item xs={12} sm={6}><TextField fullWidth multiline rows={2} label="Bedeutung / Prognose" value={item.prognosis || ''} onChange={(e) => { const upd = [...briefingItems]; upd[idx].prognosis = e.target.value; setBriefingItems(upd); }} /></Grid>
                                                    <Grid item xs={12} sm={6}><TextField fullWidth multiline rows={2} label="Handlungsempfehlung" value={item.talking_point || ''} onChange={(e) => { const upd = [...briefingItems]; upd[idx].talking_point = e.target.value; setBriefingItems(upd); }} /></Grid>
                                                </Grid>
                                                <TextField fullWidth variant="filled" label="🔗 Quellen (URLs als Array)" value={typeof item.related_articles === 'string' ? item.related_articles : JSON.stringify(item.related_articles || [])} onChange={(e) => { const upd = [...briefingItems]; upd[idx].related_articles = e.target.value; setBriefingItems(upd); }} InputProps={{ style: { fontSize: 13, fontFamily: 'monospace' } }} />
                                            </Stack>
                                        </Grid>
                                        <Grid item xs={12} md={2}>
                                            <Stack spacing={1} sx={{ height: '100%', justifyContent: 'center' }}>
                                                <Chip label={item.briefing_type.toUpperCase()} size="small" color="primary" variant="outlined" sx={{ mb: 2, fontWeight: 'bold' }} />
                                                <Button fullWidth variant="contained" size="small" onClick={() => handleSaveItem(item)} disabled={isSaving === item.id}>{isSaving === item.id ? 'Speichert...' : 'Speichern'}</Button>
                                                <Button fullWidth variant="outlined" size="small" color="error" onClick={() => handleDeleteItem(item.id)}>Löschen</Button>
                                                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 2 }}>
                                                    <IconButton size="small" disabled={idx === 0} onClick={() => handleMoveItem(idx, 'up')} sx={{ border: '1px solid #ccc' }}><UpIcon fontSize="small" /></IconButton>
                                                    <IconButton size="small" disabled={idx === briefingItems.length - 1} onClick={() => handleMoveItem(idx, 'down')} sx={{ border: '1px solid #ccc' }}><DownIcon fontSize="small" /></IconButton>
                                                </Box>
                                            </Stack>
                                        </Grid>
                                    </Grid>
                                </Card>
                            ))}
                        </Box>
                    ) : (
                        <Box sx={{ p: 6, textAlign: 'center', border: '2px dashed #cbd5e1', borderRadius: 2 }}>
                            <HistoryEduIcon sx={{ fontSize: 48, color: '#94a3b8', mb: 2 }} />
                            <Typography variant="h6" color="text.secondary">Keine ausstehenden Entwürfe gefunden.</Typography>
                        </Box>
                    )}
                </Paper>

                <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid #e2e8f0', bgcolor: briefingItems.length > 0 ? '#f0fdf4' : '#fff' }}>
                    <StepHeader stepNumber={4} title="Freigabe & Versand" subtitle="Das Briefing an die User ausliefern." icon={<PublishIcon color="success" />} />
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" justifyContent="center" sx={{ mt: 3 }}>
                        <Button variant="outlined" size="large" onClick={() => setPreviewOpen(true)} disabled={briefingItems.length === 0} sx={{ width: { xs: '100%', sm: 'auto' } }}>Dashboard Vorschau</Button>
                        <Button variant="outlined" size="large" color="secondary" startIcon={<EmailIcon />} onClick={() => setTestEmailOpen(true)} disabled={briefingItems.length === 0} sx={{ width: { xs: '100%', sm: 'auto' } }}>Test-Mail senden</Button>
                        <Button variant="contained" size="large" color="success" startIcon={<SendIcon />} onClick={handlePublishAll} disabled={briefingItems.length === 0} sx={{ width: { xs: '100%', sm: 'auto' }, fontWeight: 'bold' }}>
                            Jetzt an {debugInfo?.potentialRecipients || 0} Personen versenden
                        </Button>
                    </Stack>
                </Paper>

                <Paper sx={{ p: 3, mt: 6, borderRadius: 3, border: '1px solid #e2e8f0' }}>
                    <StepHeader stepNumber={5} title="Historie" subtitle="Bisher versendete Briefings." icon={<HistoryIcon color="primary" />} />
                    {Object.keys(groupedHistory).length === 0 ? (
                        <Box sx={{ p: 4, textAlign: 'center', bgcolor: '#f8fafc', borderRadius: 2, border: '1px dashed #cbd5e1' }}>
                            <Typography variant="body2" color="text.secondary">Bisher wurden keine Briefings versendet.</Typography>
                        </Box>
                    ) : (
                        Object.entries(groupedHistory).map(([dateStr, items]: [string, any], accordionIdx: number) => (
                            <Accordion key={dateStr} defaultExpanded={accordionIdx === 0} disableGutters sx={{ mb: 1, border: '1px solid #f3f4f6', borderRadius: '8px !important', overflow: 'hidden' }}>
                                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: '#f8fafc' }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>Briefing vom {dateStr} ({items.length})</Typography>
                                </AccordionSummary>
                                <AccordionDetails sx={{ p: 0 }}>
                                    <Box sx={{ p: 2, bgcolor: '#fff', borderBottom: '1px solid #f1f5f9' }}>
                                        <Button size="small" variant="outlined" startIcon={<EmailIcon />} onClick={() => { setHistoryPreviewItems(items); setHistoryPreviewOpen(true); }}>Vorschau ansehen</Button>
                                    </Box>
                                    <Table size="small">
                                        <TableBody>
                                            {items.map((h: any, i: number) => (
                                                <TableRow key={i} hover>
                                                    <TableCell sx={{ pl: 3 }}><Typography variant="body2">{h.headline}</Typography></TableCell>
                                                    <TableCell align="right"><Chip label={getFriendlyTypeName(h.briefing_type)} size="small" variant="outlined" /></TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </AccordionDetails>
                            </Accordion>
                        ))
                    )}
                </Paper>

                {/* Dialoge */}
                <BriefingPreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)} items={briefingItems} partner={currentPartnerData} />
                <BriefingPreviewDialog open={historyPreviewOpen} onClose={() => setHistoryPreviewOpen(false)} items={historyPreviewItems} partner={currentPartnerData} />
                
                <Dialog open={testEmailOpen} onClose={() => setTestEmailOpen(false)} maxWidth="xs" fullWidth>
                    <DialogTitle>Test-Mail versenden</DialogTitle>
                    <DialogContent>
                        <TextField fullWidth label="Ihre E-Mail Adresse" type="email" value={testEmailAddress} onChange={(e) => setTestEmailAddress(e.target.value)} sx={{ mt: 1 }} />
                    </DialogContent>
                    <DialogActions sx={{ p: 2 }}>
                        <Button onClick={() => setTestEmailOpen(false)} color="inherit">Abbrechen</Button>
                        <Button onClick={handleSendTestEmail} variant="contained" color="secondary">Senden</Button>
                    </DialogActions>
                </Dialog>

                <Backdrop sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1, display: 'flex', flexDirection: 'column', gap: 3, bgcolor: 'rgba(15, 23, 42, 0.85)' }} open={isGenerating}>
                    <CircularProgress color="primary" size={60} thickness={4} />
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1 }}>KI analysiert und generiert...</Typography>
                        <Typography variant="body1" sx={{ opacity: 0.8 }}>Dieser Vorgang dauert ca. 15–30 Sekunden.</Typography>
                    </Box>
                </Backdrop>

                {/* --- NEUER RECIPIENTS DIALOG --- */}
                <Dialog open={recipientsOpen} onClose={() => setRecipientsOpen(false)} maxWidth="xs" fullWidth>
                    <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <Typography variant="h6" component="span" sx={{ fontWeight: 'bold' }}>Aktive Empfänger</Typography>
                        <IconButton onClick={() => setRecipientsOpen(false)} size="small"><CloseIcon /></IconButton>
                    </DialogTitle>
                    <DialogContent sx={{ p: 0 }}>
                        {loadingRecipients ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
                        ) : (
                                <List>
                                    {/* Das "Array.isArray" verhindert den Absturz, falls doch mal kein Array kommt */}
                                    {Array.isArray(recipientsList) && recipientsList.length === 0 ? (
                                        <Typography sx={{ p: 3, textAlign: 'center' }} color="text.secondary">
                                            Keine Empfänger mit aktivem Opt-In gefunden.
                                        </Typography>
                                    ) : (
                                        Array.isArray(recipientsList) && recipientsList.map((r, i) => (
                                            <ListItem key={i} divider={i !== recipientsList.length - 1}>
                                                <ListItemText 
                                                    primary={`${r.first_name || ''} ${r.last_name || ''}`} 
                                                    secondary={r.email} 
                                                />
                                                <Chip label="Opt-In" size="small" color="success" variant="outlined" />
                                            </ListItem>
                                        ))
                                    )}
                                </List>
                        )}
                    </DialogContent>
                </Dialog>

                {/* Raw Data Dialog */}
                <Dialog open={rawDataOpen} onClose={() => setRawDataOpen(false)} maxWidth="md" fullWidth>
                    <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <Typography variant="h6" component="span" sx={{ fontWeight: 'bold' }}>Rohdaten (Letzte 3 Tage)</Typography>
                        <IconButton onClick={() => setRawDataOpen(false)} size="small"><CloseIcon /></IconButton>
                    </DialogTitle>
                    <DialogContent sx={{ p: 0, bgcolor: '#f4f6f8' }}>
                        {loadingRawData ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
                        ) : (
                            <Box sx={{ p: 2 }}>
                                {rawDataItems.map((item, i) => (
                                    <Paper key={i} sx={{ mb: 2, p: 2, borderLeft: '4px solid', borderLeftColor: item.event_date ? 'secondary.main' : 'primary.main' }}>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>{item.title}</Typography>
                                        <Typography variant="body2">{item.summary}</Typography>
                                    </Paper>
                                ))}
                            </Box>
                        )}
                    </DialogContent>
                </Dialog>

            </Container>
        </DashboardLayout>
    );
};

export default AdminEditorialBriefingPage;
