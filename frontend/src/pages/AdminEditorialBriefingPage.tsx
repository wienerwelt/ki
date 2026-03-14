// ===================================================================
// DATEI: frontend/src/pages/AdminEditorialBriefingPage.tsx
// ===================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
    Container, Typography, Box, Paper, TextField, Button, Grid, 
    Divider, Stack, IconButton, Card, CardContent, Alert, CircularProgress,
    Fab, Tooltip, MenuItem, Select, FormControl, InputLabel, Table, 
    TableBody, TableCell, TableHead, TableRow, Chip, useTheme, Dialog, DialogTitle, DialogContent
} from '@mui/material';
import { 
    Save as SaveIcon, 
    AutoAwesome as AutoAwesomeIcon,
    Storage as StorageIcon,
    Refresh as RefreshIcon,
    HistoryEdu as HistoryEduIcon,
    SettingsSuggest as SettingsIcon,
    People as PeopleIcon,
    History as HistoryIcon,
    CheckCircle as CheckCircleIcon,
    Visibility as VisibilityIcon,
    Send as SendIcon,
    Close as CloseIcon
} from '@mui/icons-material';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';
import { useAuth } from '../context/AuthContext';

// --- SUB-KOMPONENTE: VORSCHAU DIALOG ---
const BriefingPreviewDialog = ({ open, onClose, items, partnerName }: any) => (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'primary.main', color: '#fff' }}>
            Vorschau: {partnerName}
            <IconButton onClick={onClose} color="inherit"><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0, bgcolor: '#f4f6f8' }}>
            <Box sx={{ p: 3 }}>
                <Paper sx={{ overflow: 'hidden', borderRadius: 2, boxShadow: 3 }}>
                    <Box sx={{ p: 3, textAlign: 'center', bgcolor: '#fff', borderBottom: '1px solid #eee' }}>
                        <Typography variant="overline" sx={{ fontWeight: 'bold', color: 'primary.main' }}>BRANCHEN NEWS</Typography>
                        <Typography variant="h5" sx={{ fontWeight: 800 }}>Tägliches Markt-Briefing</Typography>
                        <Typography variant="caption" color="text.secondary">{new Date().toLocaleDateString('de-AT', { weekday: 'long', day: '2-digit', month: 'long' })}</Typography>
                    </Box>
                    <Box sx={{ p: 3, bgcolor: '#fff' }}>
                        {items.map((item: any, i: number) => (
                            <Box key={i} sx={{ mb: 4 }}>
                                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, lineHeight: 1.2 }}>{item.headline}</Typography>
                                <Typography variant="body2" sx={{ color: '#444', mb: 2 }}>{item.analysis_summary}</Typography>
                                <Box sx={{ pl: 2, borderLeft: '3px solid', borderColor: 'primary.main', mb: 2 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'primary.main' }}>PROGNOSE</Typography>
                                    <Typography variant="body2" sx={{ fontStyle: 'italic' }}>{item.prognosis}</Typography>
                                </Box>
                                <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#f8f9fa', borderStyle: 'dashed' }}>
                                    <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block' }}>💡 EMPFEHLUNG</Typography>
                                    <Typography variant="body2">{item.talking_point}</Typography>
                                </Paper>
                                {i < items.length - 1 && <Divider sx={{ mt: 4 }} />}
                            </Box>
                        ))}
                    </Box>
                </Paper>
            </Box>
        </DialogContent>
    </Dialog>
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
    const [previewOpen, setPreviewOpen] = useState(false);
    
    const [briefingItems, setBriefingItems] = useState<any[]>([]);
    const [debugInfo, setDebugInfo] = useState<any>(null);

    // Initialisierung
    useEffect(() => {
        const init = async () => {
            if (user?.role === 'admin') {
                try {
                    const res = await apiClient.get('/api/admin/briefing/partners');
                    setPartners(res.data);
                    setSelectedBpId(user.business_partner_id || res.data[0]?.id);
                } catch (e) { showSnackbar('Partner-Ladefehler', 'error'); }
            } else { setSelectedBpId(user?.business_partner_id || ''); }
        };
        init();
    }, [user, showSnackbar]);

    const loadData = useCallback(async () => {
        if (!selectedBpId) return;
        setLoading(true);
        try {
            const [briefingRes, debugRes] = await Promise.all([
                apiClient.get(`/api/admin/briefing/draft?bpId=${selectedBpId}`).catch(() => ({ data: [] })),
                apiClient.get(`/api/admin/briefing/debug-status?bpId=${selectedBpId}`)
            ]);
            setBriefingItems(Array.isArray(briefingRes.data) ? briefingRes.data : []);
            setDebugInfo(debugRes.data);
        } catch (e) { showSnackbar('Datenfehler', 'error'); }
        finally { setLoading(false); }
    }, [selectedBpId, showSnackbar]);

    useEffect(() => { loadData(); }, [loadData]);

    // Handlers
    const handleManualTrigger = async () => {
        setIsGenerating(true);
        showSnackbar('KI wird gestartet...', 'info');
        try {
            await apiClient.post('/api/admin/briefing/trigger-manual', { bpId: selectedBpId });
            showSnackbar('Briefing generiert!', 'success');
            await loadData();
        } catch (e) { showSnackbar('Generierung fehlgeschlagen', 'error'); }
        finally { setIsGenerating(false); }
    };

    const handleSaveItem = async (item: any) => {
        setIsSaving(item.id);
        try {
            await apiClient.put(`/api/admin/briefing/${item.id}`, item);
            showSnackbar('Eintrag gespeichert.', 'success');
        } catch (e) { showSnackbar('Fehler beim Speichern.', 'error'); }
        finally { setIsSaving(null); }
    };

    const handlePublishAll = async () => {
        if (!window.confirm(`Soll das Briefing für ${debugInfo?.potentialRecipients || 0} Empfänger freigegeben und versendet werden?`)) return;
        try {
            await apiClient.post(`/api/admin/briefing/publish-bulk`, { bpId: selectedBpId, itemIds: briefingItems.map(i => i.id) });
            showSnackbar('Versand erfolgreich gestartet!', 'success');
            loadData();
        } catch (e) { showSnackbar('Fehler beim Versand.', 'error'); }
    };

    if (loading && partners.length === 0) return <DashboardLayout><Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box></DashboardLayout>;

    return (
        <DashboardLayout>
            <Container maxWidth="lg" sx={{ mt: 4, mb: 10 }}>
                
                {/* HEADER */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                    <Box>
                        <Typography variant="h4" sx={{ fontWeight: 800 }}>Briefing Redaktion</Typography>
                        <Typography color="text.secondary">{partners.find(p => p.id === selectedBpId)?.name || 'Mandant'}</Typography>
                    </Box>
                    <Stack direction="row" spacing={2}>
                        {user?.role === 'admin' && (
                            <Select size="small" value={selectedBpId} onChange={(e) => setSelectedBpId(e.target.value)} sx={{ minWidth: 200, bgcolor: 'background.paper' }}>
                                {partners.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                            </Select>
                        )}
                        <Button variant="outlined" startIcon={<VisibilityIcon />} onClick={() => setPreviewOpen(true)}>Vorschau</Button>
                        <Button variant="contained" color="success" startIcon={<SendIcon />} onClick={handlePublishAll} disabled={briefingItems.length === 0}>Jetzt Versenden</Button>
                    </Stack>
                </Box>

                <Grid container spacing={3}>
                    {/* DIAGNOSE */}
                    <Grid item xs={12} md={4}>
                        <Stack spacing={2}>
                            <Card variant="outlined" sx={{ borderRadius: 2 }}>
                                <CardContent>
                                    <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}><SettingsIcon fontSize="small" /> Konfiguration</Typography>
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                        {debugInfo?.categories?.map((c: string) => <Chip key={c} label={c} size="small" color="primary" variant="outlined" />)}
                                    </Box>
                                    <Divider sx={{ my: 2 }} />
                                    <Stack direction="row" justifyContent="space-between">
                                        <Box><Typography variant="h6">{debugInfo?.newsCount3d || 0}</Typography><Typography variant="caption">News (3d)</Typography></Box>
                                        <Box sx={{ textAlign: 'right' }}><Typography variant="h6">{debugInfo?.potentialRecipients || 0}</Typography><Typography variant="caption">Empfänger</Typography></Box>
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Stack>
                    </Grid>

                    {/* HISTORIE */}
                    <Grid item xs={12} md={8}>
                        <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid #eee' }}>
                            <Typography variant="subtitle2" sx={{ mb: 2 }}><HistoryIcon fontSize="small" /> Letzte 5 Einträge</Typography>
                            <Table size="small">
                                <TableBody>
                                    {debugInfo?.history?.slice(0, 5).map((h: any, i: number) => (
                                        <TableRow key={i}><TableCell>{new Date(h.created_at).toLocaleDateString()}</TableCell><TableCell>{h.headline}</TableCell><TableCell align="right"><Chip label={h.briefing_type} size="small" /></TableCell></TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </Paper>
                    </Grid>

                    {/* EDITOR */}
                    <Grid item xs={12}>
                        <Divider sx={{ my: 4 }} />
                        {briefingItems.length > 0 ? (
                            briefingItems.map((item, idx) => (
                                <Paper key={item.id} sx={{ p: 3, mb: 4, borderRadius: 3, borderLeft: '8px solid', borderLeftColor: theme.palette.primary.main, boxShadow: 2 }}>
                                    <Grid container spacing={3}>
                                        <Grid item xs={12} md={9}>
                                            <Stack spacing={2}>
                                                <TextField fullWidth label="Headline" variant="standard" value={item.headline || ''} onChange={(e) => { const upd = [...briefingItems]; upd[idx].headline = e.target.value; setBriefingItems(upd); }} inputProps={{ style: { fontSize: 22, fontWeight: 700 } }} />
                                                <TextField fullWidth multiline rows={3} label="Zusammenfassung" value={item.analysis_summary || ''} onChange={(e) => { const upd = [...briefingItems]; upd[idx].analysis_summary = e.target.value; setBriefingItems(upd); }} />
                                                <Grid container spacing={2}>
                                                    <Grid item xs={12} sm={6}><TextField fullWidth multiline rows={2} label="Prognose" value={item.prognosis || ''} onChange={(e) => { const upd = [...briefingItems]; upd[idx].prognosis = e.target.value; setBriefingItems(upd); }} /></Grid>
                                                    <Grid item xs={12} sm={6}><TextField fullWidth multiline rows={2} label="Handlungsempfehlung" value={item.talking_point || ''} onChange={(e) => { const upd = [...briefingItems]; upd[idx].talking_point = e.target.value; setBriefingItems(upd); }} /></Grid>
                                                </Grid>
                                            </Stack>
                                        </Grid>
                                        <Grid item xs={12} md={3}>
                                            <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                                <Typography variant="caption" color="text.secondary">TYP: {item.briefing_type}</Typography>
                                                <Button fullWidth variant="contained" startIcon={isSaving === item.id ? <CircularProgress size={20} color="inherit" /> : <CheckCircleIcon />} onClick={() => handleSaveItem(item)} disabled={isSaving === item.id}>Speichern</Button>
                                            </Box>
                                        </Grid>
                                    </Grid>
                                </Paper>
                            ))
                        ) : (
                            <Paper sx={{ p: 8, textAlign: 'center', border: '2px dashed #ccc' }}>
                                <HistoryEduIcon sx={{ fontSize: 60, color: 'text.disabled', mb: 2 }} />
                                <Typography variant="h6">Keine heutigen Analysen vorhanden</Typography>
                                <Button variant="contained" sx={{ mt: 3 }} startIcon={isGenerating ? <CircularProgress size={20} color="inherit" /> : <AutoAwesomeIcon />} onClick={handleManualTrigger} disabled={isGenerating}>KI jetzt starten</Button>
                            </Paper>
                        )}
                    </Grid>
                </Grid>

                <BriefingPreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)} items={briefingItems} partnerName={partners.find(p => p.id === selectedBpId)?.name} />
            </Container>
        </DashboardLayout>
    );
};

export default AdminEditorialBriefingPage;