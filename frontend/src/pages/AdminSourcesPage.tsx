// frontend/src/pages/AdminSourcesPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Chip, Tooltip, Tabs, Tab, Rating, Link as MuiLink,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, FormControl, InputLabel, Select, MenuItem, Avatar, Button,
    InputAdornment
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import UndoIcon from '@mui/icons-material/Undo';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';
import { resolveAssetUrl } from '../utils/assetUrl';

interface Source {
    id: string;
    url: string;
    description: string | null;
    status: 'pending_review' | 'approved' | 'rejected';
    average_rating: number;
    vote_count: number;
    suggested_by: string | null;
    category_id: string | null;
    category_name: string | null;
    logo_url: string | null;
    created_at: string;
}

interface Category {
    id: string;
    name: string;
}

const statusMapping = {
    pending_review: { label: 'Ausstehend', color: 'warning', icon: <HourglassEmptyIcon fontSize="small" /> },
    approved: { label: 'Genehmigt', color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
    rejected: { label: 'Abgelehnt', color: 'error', icon: <CancelIcon fontSize="small" /> },
};

const AdminSourcesPage: React.FC = () => {
    const { showSnackbar } = useSnackbar();
    const [sources, setSources] = useState<Source[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<'all' | 'pending_review' | 'approved' | 'rejected'>('all');
    const [searchTerm, setSearchTerm] = useState('');

    // Dialog State
    const [dialogOpen, setDialogOpen] = useState(false);
    const [isAddMode, setIsAddMode] = useState(false);
    const [editingSource, setEditingSource] = useState<Source | null>(null);
    const [formState, setFormState] = useState<{ url: string, description: string, category_id: string, logo: File | null, deleteLogo: boolean }>({ 
        url: '', description: '', category_id: '', logo: null, deleteLogo: false 
    });

    const getImageUrl = (url: string | null) => {
        return resolveAssetUrl(url);
    };

    const handleCopyUrl = (url: string) => {
        const fullUrl = getImageUrl(url);
        navigator.clipboard.writeText(fullUrl);
        showSnackbar('Logo-URL kopiert!', 'success');
    };

    const fetchAllData = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const [sourcesRes, catRes] = await Promise.all([
                apiClient.get('/api/admin/sources', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/data/categories', { headers: { 'x-auth-token': token } })
            ]);
            setSources(sourcesRes.data);
            setCategories(catRes.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Daten.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllData();
    }, []);

    const filteredSources = useMemo(() => {
        let filtered = sources;
        
        if (filterStatus !== 'all') {
            filtered = filtered.filter(s => s.status === filterStatus);
        }

        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            filtered = filtered.filter(s => 
                s.url.toLowerCase().includes(q) || 
                (s.description && s.description.toLowerCase().includes(q)) ||
                (s.category_name && s.category_name.toLowerCase().includes(q))
            );
        }
        
        return filtered;
    }, [sources, filterStatus, searchTerm]);

    const handleStatusChange = async (id: string, newStatus: 'approved' | 'rejected') => {
        if (!window.confirm(`Möchten Sie diese Quelle wirklich ${newStatus === 'approved' ? 'genehmigen' : 'ablehnen'}?`)) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.put(`/api/admin/sources/${id}/status`, { status: newStatus }, { headers: { 'x-auth-token': token } });
            fetchAllData();
            showSnackbar('Status erfolgreich geändert.', 'success');
        } catch (err: any) {
            showSnackbar(err.response?.data?.message || 'Fehler beim Ändern des Status.', 'error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Möchten Sie diese Quelle endgültig löschen? Alle zugehörigen Stimmen werden ebenfalls entfernt.')) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.delete(`/api/admin/sources/${id}`, { headers: { 'x-auth-token': token } });
            fetchAllData();
            showSnackbar('Quelle erfolgreich gelöscht.', 'success');
        } catch (err: any) {
            showSnackbar(err.response?.data?.message || 'Fehler beim Löschen.', 'error');
        }
    };

    const handleOpenEdit = (source: Source) => {
        setIsAddMode(false);
        setEditingSource(source);
        setFormState({ 
            url: source.url, 
            description: source.description || '', 
            category_id: source.category_id || '', 
            logo: null, 
            deleteLogo: false 
        });
        setDialogOpen(true);
    };

    const handleOpenAdd = () => {
        setIsAddMode(true);
        setEditingSource(null);
        setFormState({ 
            url: '', description: '', category_id: '', logo: null, deleteLogo: false 
        });
        setDialogOpen(true);
    };

    const handleFormChange = (event: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }>) => {
        const { name, value } = event.target;
        setFormState(prevState => ({ ...prevState, [name as string]: value }));
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            setFormState(prevState => ({ ...prevState, logo: event.target.files![0], deleteLogo: false }));
        }
    };

    const handleEditSubmit = async () => {
        if (!formState.url.trim()) {
            showSnackbar("Die URL ist ein Pflichtfeld.", "error");
            return;
        }

        const token = localStorage.getItem('jwt_token');
        const headers = { 'x-auth-token': token }; 

        const formData = new FormData();
        formData.append('url', formState.url.trim()); 
        if (formState.description) formData.append('description', formState.description.trim());
        if (formState.category_id) formData.append('category_id', formState.category_id);
        if (formState.logo) formData.append('logo', formState.logo);
        if (formState.deleteLogo && !isAddMode) formData.append('delete_logo', 'true');
        
        if (isAddMode) {
            formData.append('status', 'approved');
        }

        try {
            if (isAddMode) {
                await apiClient.post(`/api/admin/sources`, formData, { headers });
                showSnackbar('Neue Quelle erfolgreich hinzugefügt.', 'success');
            } else {
                if (!editingSource) return;
                await apiClient.put(`/api/admin/sources/${editingSource.id}`, formData, { headers });
                showSnackbar('Quelle erfolgreich aktualisiert.', 'success');
            }
            fetchAllData();
            setDialogOpen(false);
        } catch (err: any) {
            showSnackbar(err.response?.data?.message || 'Fehler beim Speichern.', 'error');
        }
    };

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                    <Typography variant="h4" component="h1">
                        Vertrauenswürdige Quellen
                    </Typography>
                    
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        <TextField 
                            variant="outlined" 
                            size="small" 
                            placeholder="Suchen..." 
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.target.value)} 
                            InputProps={{ 
                                startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) 
                            }} 
                        />
                        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAdd}>
                            Neue Quelle
                        </Button>
                    </Box>
                </Box>
                
                <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                    <Tabs value={filterStatus} onChange={(_e, newValue) => setFilterStatus(newValue)} variant="scrollable">
                        <Tab label={`Alle (${sources.length})`} value="all" />
                        <Tab label={`Ausstehend (${sources.filter(s => s.status === 'pending_review').length})`} value="pending_review" />
                        <Tab label={`Genehmigt (${sources.filter(s => s.status === 'approved').length})`} value="approved" />
                        <Tab label={`Abgelehnt (${sources.filter(s => s.status === 'rejected').length})`} value="rejected" />
                    </Tabs>
                </Box>

                {loading ? <Box sx={{ p: 5, textAlign: 'center' }}><CircularProgress /></Box> : 
                    error ? <Alert severity="error" sx={{ m: 2 }}>{error}</Alert> : (
                    <Paper sx={{ overflow: 'hidden' }}>
                        <TableContainer sx={{ maxHeight: '75vh', overflowX: 'auto' }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ width: '8%', minWidth: 60 }}>Logo</TableCell>
                                        <TableCell sx={{ width: '35%', minWidth: 200 }}>URL & Beschreibung</TableCell>
                                        <TableCell sx={{ width: '12%', minWidth: 100 }}>Status</TableCell>
                                        <TableCell sx={{ width: '15%', minWidth: 120 }}>Rating</TableCell>
                                        <TableCell sx={{ width: '15%', minWidth: 120 }}>Kategorie</TableCell>
                                        <TableCell sx={{ width: '15%', minWidth: 100 }} align="right">Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredSources.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                                Keine Quellen gefunden.
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredSources.map((source) => (
                                        <TableRow key={source.id} hover>
                                            <TableCell>
                                                {source.logo_url ? (
                                                    <Tooltip title="Logo kopieren">
                                                        <Box 
                                                            component="img" 
                                                            src={getImageUrl(source.logo_url)} 
                                                            alt="Logo" 
                                                            onClick={() => handleCopyUrl(source.logo_url!)}
                                                            sx={{ height: 32, width: 32, objectFit: 'contain', cursor: 'pointer', borderRadius: 1, border: '1px solid', borderColor: 'divider' }} 
                                                        />
                                                    </Tooltip>
                                                ) : (
                                                    <Avatar variant="rounded" sx={{ width: 32, height: 32, bgcolor: 'grey.200', color: 'text.secondary', fontSize: '0.8rem' }}>-</Avatar>
                                                )}
                                            </TableCell>
                                            <TableCell sx={{ maxWidth: 300 }}>
                                                <MuiLink href={source.url} target="_blank" rel="noopener noreferrer" sx={{ display: 'flex', alignItems: 'center', mb: 0.5, fontWeight: 'bold' }}>
                                                    <Typography noWrap sx={{ fontSize: '0.9rem' }}>
                                                        {source.url.replace(/^https?:\/\//, '')}
                                                    </Typography>
                                                    <OpenInNewIcon sx={{ ml: 0.5, fontSize: '0.9rem' }} />
                                                </MuiLink>
                                                <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.2 }}>
                                                    {source.description || <span style={{fontStyle: 'italic', opacity: 0.5}}>Keine Beschreibung</span>}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip icon={statusMapping[source.status].icon} label={statusMapping[source.status].label} color={statusMapping[source.status].color as any} size="small" variant="outlined" sx={{ fontWeight: 'bold' }} />
                                            </TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                    <Rating value={parseFloat(source.average_rating as any)} precision={0.1} readOnly size="small" />
                                                    <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>({source.vote_count})</Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" noWrap>
                                                    {source.category_name || '-'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Box sx={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                                                    <Tooltip title="Bearbeiten">
                                                        <IconButton color="primary" onClick={() => handleOpenEdit(source)} size="small">
                                                            <EditIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    {source.status === 'pending_review' && (
                                                        <>
                                                            <Tooltip title="Genehmigen">
                                                                <IconButton color="success" onClick={() => handleStatusChange(source.id, 'approved')} size="small"><CheckCircleIcon fontSize="small" /></IconButton>
                                                            </Tooltip>
                                                            <Tooltip title="Ablehnen">
                                                                <IconButton color="warning" onClick={() => handleStatusChange(source.id, 'rejected')} size="small"><CancelIcon fontSize="small" /></IconButton>
                                                            </Tooltip>
                                                        </>
                                                    )}
                                                    <Tooltip title="Endgültig löschen">
                                                        <IconButton color="error" onClick={() => handleDelete(source.id)} size="small"><DeleteIcon fontSize="small" /></IconButton>
                                                    </Tooltip>
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                )}
            </Container>

            {/* ADD / EDIT DIALOG */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>{isAddMode ? 'Neue Quelle hinzufügen' : 'Quelle bearbeiten'}</DialogTitle>
                <DialogContent dividers>
                    <TextField 
                        margin="dense" 
                        label="URL (z.B. https://domain.de)" 
                        name="url"
                        value={formState.url} 
                        onChange={handleFormChange}
                        fullWidth 
                        variant="outlined" 
                        required
                        sx={{ mt: 1 }}
                    />
                    
                    <Box sx={{ mt: 3, mb: 1, p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            Quellen-Logo (wird auf 50px Höhe formatiert & als WebP gespeichert)
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1, mb: 2 }}>
                            <Button variant="outlined" component="label" startIcon={<UploadFileIcon />} disabled={formState.deleteLogo}>
                                {formState.logo ? 'Anderes Bild' : 'Bild auswählen'}
                                <input type="file" hidden accept="image/*" onChange={handleFileChange} />
                            </Button>
                            
                            {formState.deleteLogo && !isAddMode ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="body2" color="error" sx={{ fontStyle: 'italic' }}>Wird gelöscht</Typography>
                                    <IconButton size="small" onClick={() => setFormState(p => ({ ...p, deleteLogo: false }))} color="primary"><UndoIcon /></IconButton>
                                </Box>
                            ) : formState.logo ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="body2" color="primary" noWrap sx={{ maxWidth: 150 }}>{formState.logo.name}</Typography>
                                    <IconButton size="small" onClick={() => setFormState(p => ({ ...p, logo: null }))} color="error"><DeleteOutlineIcon /></IconButton>
                                </Box>
                            ) : editingSource?.logo_url && !isAddMode ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box component="img" src={getImageUrl(editingSource.logo_url)} alt="Current Logo" sx={{ height: 40, objectFit: 'contain', bgcolor: 'grey.100', p: 0.5, borderRadius: 1 }} />
                                    <IconButton size="small" onClick={() => setFormState(p => ({ ...p, deleteLogo: true }))} color="error"><DeleteOutlineIcon /></IconButton>
                                </Box>
                            ) : null}
                        </Box>
                        
                        {editingSource?.logo_url && !formState.deleteLogo && !formState.logo && !isAddMode && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                                <TextField size="small" value={getImageUrl(editingSource.logo_url)} InputProps={{ readOnly: true }} variant="standard" fullWidth sx={{ input: { fontSize: '0.75rem' } }} />
                                <Tooltip title="Link kopieren">
                                    <IconButton size="small" onClick={() => handleCopyUrl(editingSource.logo_url!)}><ContentCopyIcon fontSize="small" /></IconButton>
                                </Tooltip>
                            </Box>
                        )}
                    </Box>

                    <TextField margin="dense" name="description" label="Beschreibung (Optional)" fullWidth multiline rows={3} variant="outlined" value={formState.description} onChange={handleFormChange} sx={{ mt: 2 }} />
                    
                    <FormControl fullWidth margin="dense" sx={{ mt: 2 }}>
                        <InputLabel>Kategorie</InputLabel>
                        <Select name="category_id" value={formState.category_id} label="Kategorie" onChange={handleFormChange as any}>
                            <MenuItem value=""><em>Keine Kategorie</em></MenuItem>
                            {categories.map(cat => <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>)}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setDialogOpen(false)} color="inherit">Abbrechen</Button>
                    <Button onClick={handleEditSubmit} variant="contained">Speichern</Button>
                </DialogActions>
            </Dialog>
        </DashboardLayout>
    );
};

export default AdminSourcesPage;
