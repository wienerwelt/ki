import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Switch, FormControlLabel, Chip, Select, MenuItem, InputLabel, FormControl
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

// Interfaces
interface Advertisement {
    id: string;
    business_partner_id: string | null;
    business_partner_name?: string;
    content: string;
    is_active: boolean;
    start_date: string | null;
    end_date: string | null;
}
interface BusinessPartner {
    id: string;
    name: string;
}

const AdminAdvertisementsPage: React.FC = () => {
    const [ads, setAds] = useState<Advertisement[]>([]);
    const [businessPartners, setBusinessPartners] = useState<BusinessPartner[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingAd, setEditingAd] = useState<Advertisement | null>(null);
    const [formState, setFormState] = useState<Partial<Advertisement>>({
        content: '',
        is_active: true,
        business_partner_id: null,
        start_date: null,
        end_date: null,
    });

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('jwt_token');
            const [adsRes, bpRes] = await Promise.all([
                apiClient.get('/api/admin/advertisements', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/business-partners', { headers: { 'x-auth-token': token } })
            ]);
            setAds(adsRes.data);
            setBusinessPartners(bpRes.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Daten.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInitialData();
    }, []);

    const handleOpenDialog = (ad: Advertisement | null = null) => {
        setEditingAd(ad);
        setFormState(ad ? {
            ...ad,
            start_date: ad.start_date ? new Date(ad.start_date).toISOString().slice(0, 16) : '',
            end_date: ad.end_date ? new Date(ad.end_date).toISOString().slice(0, 16) : ''
        } : { content: '', is_active: true });
        setOpenDialog(true);
    };

    const handleCloseDialog = () => setOpenDialog(false);

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        setFormState(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleSubmit = async () => {
        const token = localStorage.getItem('jwt_token');
        const data = {
            ...formState,
            business_partner_id: formState.business_partner_id || null,
            start_date: formState.start_date || null,
            end_date: formState.end_date || null,
        };
        try {
            if (editingAd) {
                await apiClient.put(`/api/admin/advertisements/${editingAd.id}`, data, { headers: { 'x-auth-token': token } });
            } else {
                await apiClient.post('/api/admin/advertisements', data, { headers: { 'x-auth-token': token } });
            }
            fetchInitialData();
            handleCloseDialog();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Speichern.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Sind Sie sicher?')) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.delete(`/api/admin/advertisements/${id}`, { headers: { 'x-auth-token': token } });
            fetchInitialData();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler beim Löschen.');
        }
    };

    return (
        <DashboardLayout>
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h4">Werbeanzeigen verwalten</Typography>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>Anzeige hinzufügen</Button>
                </Box>
                {loading ? <CircularProgress /> : error ? <Alert severity="error">{error}</Alert> : (
                    <Paper>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Inhalt (Text/HTML)</TableCell>
                                        <TableCell>Business Partner</TableCell>
                                        <TableCell>Gültigkeit</TableCell>
                                        <TableCell>Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {ads.map((ad) => (
                                        <TableRow key={ad.id}>
                                            <TableCell><Chip label={ad.is_active ? 'Aktiv' : 'Inaktiv'} color={ad.is_active ? 'success' : 'default'} size="small" /></TableCell>
                                            <TableCell sx={{ maxWidth: 400, wordBreak: 'break-all' }}>{ad.content}</TableCell>
                                            <TableCell>{ad.business_partner_name || <Chip label="Global" size="small" variant="outlined" />}</TableCell>
                                            <TableCell>
                                                {ad.start_date ? new Date(ad.start_date).toLocaleDateString('de-AT') : 'Ab sofort'} - {ad.end_date ? new Date(ad.end_date).toLocaleDateString('de-AT') : 'Unbegrenzt'}
                                            </TableCell>
                                            <TableCell>
                                                <IconButton onClick={() => handleOpenDialog(ad)}><EditIcon /></IconButton>
                                                <IconButton onClick={() => handleDelete(ad.id)}><DeleteIcon color="error" /></IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                )}
                <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth>
                    <DialogTitle>{editingAd ? 'Anzeige bearbeiten' : 'Neue Anzeige erstellen'}</DialogTitle>
                    <DialogContent>
                        <TextField
                            name="content"
                            label="Anzeigentext (Links mit <a>-Tag möglich)"
                            fullWidth multiline rows={4}
                            value={formState.content}
                            onChange={handleFormChange}
                            margin="normal"
                        />
                        <FormControl fullWidth margin="normal">
                            <InputLabel>Business Partner (Optional)</InputLabel>
                            <Select
                                name="business_partner_id"
                                value={formState.business_partner_id || ''}
                                label="Business Partner (Optional)"
                                onChange={(e) => setFormState(prev => ({ ...prev, business_partner_id: e.target.value || null }))}
                            >
                                <MenuItem value=""><em>Global für alle</em></MenuItem>
                                {businessPartners.map(bp => <MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <TextField
                            name="start_date"
                            label="Start-Datum (Optional)"
                            type="datetime-local"
                            fullWidth
                            value={formState.start_date || ''}
                            onChange={handleFormChange}
                            margin="normal"
                            InputLabelProps={{ shrink: true }}
                        />
                        <TextField
                            name="end_date"
                            label="End-Datum (Optional)"
                            type="datetime-local"
                            fullWidth
                            value={formState.end_date || ''}
                            onChange={handleFormChange}
                            margin="normal"
                            InputLabelProps={{ shrink: true }}
                        />
                        <FormControlLabel
                            control={<Switch checked={formState.is_active} onChange={handleFormChange} name="is_active" />}
                            label="Anzeige ist aktiv"
                        />
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseDialog}>Abbrechen</Button>
                        <Button onClick={handleSubmit} variant="contained">Speichern</Button>
                    </DialogActions>
                </Dialog>
            </Container>
        </DashboardLayout>
    );
};

export default AdminAdvertisementsPage;
