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

interface LogoSuggestion {
    url: string;
    label: string;
    source: string;
    match: 'domain' | 'name';
    matchLabel: string;
}

interface SourceFormState {
    url: string;
    description: string;
    category_id: string;
    logo: File | null;
    deleteLogo: boolean;
    selectedLogo: LogoSuggestion | null;
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
    const [formState, setFormState] = useState<SourceFormState>({
        url: '', description: '', category_id: '', logo: null, deleteLogo: false, selectedLogo: null
    });
    const [logoSuggestions, setLogoSuggestions] = useState<LogoSuggestion[]>([]);
    const [logoSuggestionsLoading, setLogoSuggestionsLoading] = useState(false);
    const [logoPreviewUrl, setLogoPreviewUrl] = useState('');

    const getImageUrl = (url: string | null) => {
        return resolveAssetUrl(url);
    };

    useEffect(() => {
        if (!formState.logo) {
            setLogoPreviewUrl('');
            return undefined;
        }

        const objectUrl = URL.createObjectURL(formState.logo);
        setLogoPreviewUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [formState.logo]);

    useEffect(() => {
        if (!dialogOpen) {
            setLogoSuggestions([]);
            setLogoSuggestionsLoading(false);
            return undefined;
        }

        const rawUrl = formState.url.trim();
        try {
            const parsed = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
            if (!parsed.hostname || !rawUrl.includes('.')) throw new Error('incomplete');
        } catch {
            setLogoSuggestions([]);
            setLogoSuggestionsLoading(false);
            return undefined;
        }

        let active = true;
        const timer = window.setTimeout(async () => {
            setLogoSuggestionsLoading(true);
            try {
                const { res, data } = await apiClient.get<{ suggestions?: LogoSuggestion[]; message?: string }>('/api/admin/sources/logo-suggestions', {
                    params: {
                        url: rawUrl,
                        sourceId: editingSource?.id || undefined,
                    },
                });
                if (!res.ok) throw new Error(data?.message || 'Logo-Vorschläge konnten nicht geladen werden.');
                if (active) setLogoSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
            } catch {
                if (active) setLogoSuggestions([]);
            } finally {
                if (active) setLogoSuggestionsLoading(false);
            }
        }, 450);

        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [dialogOpen, editingSource?.id, formState.url]);

    const handleCopyUrl = (url: string) => {
        const fullUrl = getImageUrl(url);
        navigator.clipboard.writeText(fullUrl);
        showSnackbar('Logo-URL kopiert!', 'success');
    };

    const fetchAllData = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = 'cookie-session';
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
            const token = 'cookie-session';
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
            const token = 'cookie-session';
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
            deleteLogo: false,
            selectedLogo: null,
        });
        setDialogOpen(true);
    };

    const handleOpenAdd = () => {
        setIsAddMode(true);
        setEditingSource(null);
        setFormState({ 
            url: '', description: '', category_id: '', logo: null, deleteLogo: false, selectedLogo: null
        });
        setDialogOpen(true);
    };

    const handleFormChange = (event: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }>) => {
        const { name, value } = event.target;
        setFormState(prevState => ({
            ...prevState,
            [name as string]: value,
            ...(name === 'url' ? { selectedLogo: null } : {}),
        }));
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            setFormState(prevState => ({
                ...prevState,
                logo: event.target.files![0],
                deleteLogo: false,
                selectedLogo: null,
            }));
        }
    };

    const handleSelectSuggestedLogo = (suggestion: LogoSuggestion) => {
        setFormState((previous) => ({
            ...previous,
            logo: null,
            deleteLogo: false,
            selectedLogo: suggestion,
        }));
    };

    const handleEditSubmit = async () => {
        if (!formState.url.trim()) {
            showSnackbar("Die URL ist ein Pflichtfeld.", "error");
            return;
        }

        const token = 'cookie-session';
        const headers = { 'x-auth-token': token }; 

        const formData = new FormData();
        formData.append('url', formState.url.trim()); 
        if (formState.description) formData.append('description', formState.description.trim());
        if (formState.category_id) formData.append('category_id', formState.category_id);
        if (formState.logo) formData.append('logo', formState.logo);
        if (!formState.logo && formState.selectedLogo) formData.append('logo_reference_url', formState.selectedLogo.url);
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
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1, mb: 2, flexWrap: 'wrap' }}>
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
                                    {logoPreviewUrl && (
                                        <Box component="img" src={logoPreviewUrl} alt="Logo-Vorschau" sx={{ width: 52, height: 40, objectFit: 'contain', bgcolor: 'grey.50', p: 0.5, borderRadius: 1, border: '1px solid', borderColor: 'divider' }} />
                                    )}
                                    <Typography variant="body2" color="primary" noWrap sx={{ maxWidth: 150 }}>{formState.logo.name}</Typography>
                                    <IconButton size="small" onClick={() => setFormState(p => ({ ...p, logo: null }))} color="error"><DeleteOutlineIcon /></IconButton>
                                </Box>
                            ) : formState.selectedLogo ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                                    <Box
                                        component="img"
                                        src={getImageUrl(formState.selectedLogo.url)}
                                        alt={formState.selectedLogo.label}
                                        onError={(event: React.SyntheticEvent<HTMLImageElement>) => {
                                            event.currentTarget.onerror = null;
                                            event.currentTarget.src = '/logos/default-company.svg';
                                        }}
                                        sx={{ width: 52, height: 40, objectFit: 'contain', bgcolor: 'grey.50', p: 0.5, borderRadius: 1, border: '1px solid', borderColor: 'success.light' }}
                                    />
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="body2" color="success.main" fontWeight={700} noWrap>{formState.selectedLogo.label}</Typography>
                                        <Typography variant="caption" color="text.secondary">Wird beim Speichern übernommen</Typography>
                                    </Box>
                                    <IconButton size="small" onClick={() => setFormState(p => ({ ...p, selectedLogo: null }))} color="error"><DeleteOutlineIcon /></IconButton>
                                </Box>
                            ) : editingSource?.logo_url && !isAddMode ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box
                                        component="img"
                                        src={getImageUrl(editingSource.logo_url)}
                                        alt="Aktuelles Logo"
                                        onError={(event: React.SyntheticEvent<HTMLImageElement>) => {
                                            event.currentTarget.onerror = null;
                                            event.currentTarget.src = '/logos/default-company.svg';
                                        }}
                                        sx={{ height: 40, width: 52, objectFit: 'contain', bgcolor: 'grey.100', p: 0.5, borderRadius: 1 }}
                                    />
                                    <Chip label="Direkt bei der Quelle hinterlegt" size="small" color="success" variant="outlined" />
                                    <IconButton size="small" onClick={() => setFormState(p => ({ ...p, deleteLogo: true, selectedLogo: null }))} color="error"><DeleteOutlineIcon /></IconButton>
                                </Box>
                            ) : null}
                        </Box>

                        {editingSource?.logo_url && !formState.deleteLogo && !formState.logo && !formState.selectedLogo && !isAddMode && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                                <TextField size="small" value={getImageUrl(editingSource.logo_url)} InputProps={{ readOnly: true }} variant="standard" fullWidth sx={{ input: { fontSize: '0.75rem' } }} />
                                <Tooltip title="Link kopieren">
                                    <IconButton size="small" onClick={() => handleCopyUrl(editingSource.logo_url!)}><ContentCopyIcon fontSize="small" /></IconButton>
                                </Tooltip>
                            </Box>
                        )}

                        <Box sx={{ mt: 2 }}>
                            <Typography variant="subtitle2" fontWeight={700}>
                                Passende vorhandene Logos
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Die Vorschläge werden aus der eingegebenen Domain ermittelt und erst nach Ihrer Auswahl gespeichert.
                            </Typography>

                            {logoSuggestionsLoading ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
                                    <CircularProgress size={18} />
                                    <Typography variant="body2" color="text.secondary">Vorhandene Logos werden geprüft …</Typography>
                                </Box>
                            ) : logoSuggestions.length > 0 ? (
                                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1, mt: 1.5 }}>
                                    {logoSuggestions.map((suggestion) => {
                                        const isSelected = formState.selectedLogo?.url === suggestion.url;
                                        const isCurrent = !formState.selectedLogo && !formState.logo && !formState.deleteLogo && editingSource?.logo_url === suggestion.url;
                                        return (
                                            <Paper key={suggestion.url} variant="outlined" sx={{ p: 1.25, display: 'flex', gap: 1.25, alignItems: 'center', minWidth: 0, borderColor: isSelected ? 'success.main' : 'divider' }}>
                                                <Box
                                                    component="img"
                                                    src={getImageUrl(suggestion.url)}
                                                    alt={suggestion.label}
                                                    onError={(event: React.SyntheticEvent<HTMLImageElement>) => {
                                                        event.currentTarget.onerror = null;
                                                        event.currentTarget.src = '/logos/default-company.svg';
                                                    }}
                                                    sx={{ width: 56, height: 44, objectFit: 'contain', bgcolor: 'grey.50', borderRadius: 1, p: 0.5, flexShrink: 0 }}
                                                />
                                                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                                    <Typography variant="body2" fontWeight={700} noWrap title={suggestion.label}>{suggestion.label}</Typography>
                                                    <Typography variant="caption" color="text.secondary" display="block" noWrap>{suggestion.source}</Typography>
                                                    <Chip label={suggestion.matchLabel} size="small" variant="outlined" sx={{ mt: 0.5, height: 20, maxWidth: '100%', '& .MuiChip-label': { px: 0.75 } }} />
                                                </Box>
                                                <Button
                                                    size="small"
                                                    variant={isSelected ? 'contained' : 'outlined'}
                                                    color={isSelected ? 'success' : 'primary'}
                                                    disabled={isSelected || isCurrent}
                                                    onClick={() => handleSelectSuggestedLogo(suggestion)}
                                                    sx={{ flexShrink: 0, minWidth: 0 }}
                                                >
                                                    {isSelected ? 'Ausgewählt' : isCurrent ? 'Aktiv' : 'Übernehmen'}
                                                </Button>
                                            </Paper>
                                        );
                                    })}
                                </Box>
                            ) : formState.url.trim().includes('.') ? (
                                <Alert severity="info" sx={{ mt: 1.5, py: 0 }}>
                                    Für diese Domain wurde noch kein passendes Logo gefunden. Sie können ein neues Bild hochladen.
                                </Alert>
                            ) : (
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                                    Geben Sie zuerst die vollständige Quellen-URL ein.
                                </Typography>
                            )}
                        </Box>
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
