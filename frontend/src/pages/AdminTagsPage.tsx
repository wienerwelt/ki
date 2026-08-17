// frontend/src/pages/AdminTagsPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Chip, TableSortLabel, InputAdornment, Select, MenuItem, FormControl, InputLabel, Avatar, Tooltip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import UndoIcon from '@mui/icons-material/Undo';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';

interface Tag {
    id: string;
    name: string;
    description: string | null;
    usage_count: number;
    category_id: string | null;
    category_name: string | null;
    logo_url: string | null; 
}

interface Category {
    id: string;
    name: string;
}

// --- Sortier-Helferfunktionen ---
type Order = 'asc' | 'desc';

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
    const valA = a[orderBy] ?? '';
    const valB = b[orderBy] ?? '';
    if (valB < valA) return -1;
    if (valB > valA) return 1;
    return 0;
}

function getComparator<Key extends keyof any>(order: Order, orderBy: Key,): (a: { [key in Key]: any }, b: { [key in Key]: any }) => number {
    return order === 'desc' ? (a, b) => descendingComparator(a, b, orderBy) : (a, b) => -descendingComparator(a, b, orderBy);
}
// --- Ende ---

const AdminTagsPage: React.FC = () => {
    const { showSnackbar } = useSnackbar();
    const [tags, setTags] = useState<Tag[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingTag, setEditingTag] = useState<Tag | null>(null);
    
    const [formState, setFormState] = useState<{ name: string, description: string, category_id: string, logo: File | null, deleteLogo: boolean }>({ 
        name: '', description: '', category_id: '', logo: null, deleteLogo: false 
    });
    
    const [dialogError, setDialogError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<keyof Tag>('name');

    // Generiert die vollständige URL für das Frontend
    const getImageUrl = (url: string | null) => {
        if (!url) return '';
        if (url.startsWith('http')) return url; // Falls es schon eine volle URL von z.B. AWS S3 ist
        
        let baseUrl = import.meta.env.VITE_API_URL || '';
        // Falls die baseUrl mit einem Slash endet, entfernen wir ihn zur Sicherheit
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
        
        // Sicherstellen, dass der Pfad mit einem Slash beginnt
        let cleanUrl = url.startsWith('/') ? url : `/${url}`;
        
        // Verhindern von doppeltem "/api", falls es schon in der Datenbank steht!
        if (cleanUrl.startsWith('/api/')) {
            cleanUrl = cleanUrl.substring(4); // Macht aus "/api/logos..." -> "/logos..."
        }
        
        // Wir setzen "/api" davor, damit Nginx die Anfrage zum Backend durchlässt
        const apiPrefix = baseUrl.endsWith('/api') ? '' : '/api';
        
        return `${baseUrl}${apiPrefix}${cleanUrl}`;
    };

    // Kopier-Funktion (Nutzt jetzt direkt die sichere getImageUrl Funktion!)
    const handleCopyUrl = (url: string) => {
        const fullUrl = getImageUrl(url);
        
        // Fallback, falls getImageUrl nur einen relativen Pfad zurückgibt
        const finalUrl = fullUrl.startsWith('http') 
            ? fullUrl 
            : `${window.location.origin}${fullUrl}`;
            
        navigator.clipboard.writeText(finalUrl);
        showSnackbar('Logo-URL kopiert!', 'success');
    };

    const fetchAllData = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = 'cookie-session';
            const [tagsRes, categoriesRes] = await Promise.all([
                apiClient.get('/api/admin/tags', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/data/categories', { headers: { 'x-auth-token': token } })
            ]);
            setTags(tagsRes.data);
            setCategories(categoriesRes.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Daten.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllData();
    }, []);

    const handleOpenDialog = (tag: Tag | null = null) => {
        setEditingTag(tag);
        if (tag) {
            setFormState({ name: tag.name, description: tag.description || '', category_id: tag.category_id || '', logo: null, deleteLogo: false });
        } else {
            setFormState({ name: '', description: '', category_id: '', logo: null, deleteLogo: false });
        }
        setDialogError(null);
        setDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setDialogOpen(false);
        setEditingTag(null);
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

    const handleDeleteLogoToggle = () => {
        setFormState(prev => ({ ...prev, deleteLogo: !prev.deleteLogo, logo: null }));
    };

    const handleSubmit = async () => {
        const token = 'cookie-session';
        const headers = { 'x-auth-token': token }; 

        const formData = new FormData();
        formData.append('name', formState.name);
        if (formState.description) formData.append('description', formState.description);
        if (formState.category_id) formData.append('category_id', formState.category_id);
        if (formState.logo) formData.append('logo', formState.logo);
        
        if (formState.deleteLogo) formData.append('delete_logo', 'true');

        try {
            if (editingTag) {
                await apiClient.put(`/api/admin/tags/${editingTag.id}`, formData, { headers });
            } else {
                await apiClient.post('/api/admin/tags', formData, { headers });
            }
            fetchAllData();
            handleCloseDialog();
        } catch (err: any) {
            setDialogError(err.response?.data?.message || 'Fehler beim Speichern des Tags.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Sind Sie sicher, dass Sie diesen Tag löschen möchten? Alle Zuordnungen zu Inhalten werden ebenfalls entfernt.')) return;
        try {
            const token = 'cookie-session';
            await apiClient.delete(`/api/admin/tags/${id}`, { headers: { 'x-auth-token': token } });
            fetchAllData();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler beim Löschen.');
        }
    };

    const handleSortRequest = (property: keyof Tag) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const sortedAndFilteredTags = useMemo(() => {
        let filtered = tags.filter(tag =>
            tag.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (tag.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (tag.category_name || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
        return filtered.sort(getComparator(order, orderBy));
    }, [tags, searchTerm, order, orderBy]);

    return (
        <DashboardLayout>
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                    <Typography variant="h4" component="h1">Tag-Verwaltung</Typography>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField
                            size="small"
                            placeholder="Suchen..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            InputProps={{
                                startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>)
                            }}
                        />
                        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
                            Tag hinzufügen
                        </Button>
                    </Box>
                </Box>
                {loading ? <CircularProgress /> : error && !dialogOpen ? <Alert severity="error">{error}</Alert> : (
                    <Paper>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sortDirection={orderBy === 'logo_url' ? order : false}>
                                            <TableSortLabel active={orderBy === 'logo_url'} direction={order} onClick={() => handleSortRequest('logo_url')}>
                                                Logo
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell sortDirection={orderBy === 'name' ? order : false}>
                                            <TableSortLabel active={orderBy === 'name'} direction={order} onClick={() => handleSortRequest('name')}>
                                                Tag-Name
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell sortDirection={orderBy === 'description' ? order : false}>
                                            <TableSortLabel active={orderBy === 'description'} direction={order} onClick={() => handleSortRequest('description')}>
                                                Beschreibung
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell sortDirection={orderBy === 'category_name' ? order : false}><TableSortLabel active={orderBy === 'category_name'} direction={order} onClick={() => handleSortRequest('category_name')}>Kategorie</TableSortLabel></TableCell>
                                        <TableCell align="center" sortDirection={orderBy === 'usage_count' ? order : false}><TableSortLabel active={orderBy === 'usage_count'} direction={order} onClick={() => handleSortRequest('usage_count')}>Verwendungen</TableSortLabel></TableCell>
                                        <TableCell align="right">Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
<TableBody>
                                    {sortedAndFilteredTags.map((tag) => {
                                        // Format aus der Dateiendung auslesen
                                        const format = tag.logo_url?.split('.').pop()?.toUpperCase() || '';
                                        const formatColor = format === 'SVG' ? 'secondary' : 'primary';

                                        return (
                                            <TableRow key={tag.id} hover>
                                                <TableCell>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        {tag.logo_url ? (
                                                            <>
                                                                <Box 
                                                                    component="img" 
                                                                    src={getImageUrl(tag.logo_url)} 
                                                                    alt={tag.name} 
                                                                    sx={{ height: 30, maxWidth: 60, objectFit: 'contain', display: 'block' }} 
                                                                />
                                                                <Chip 
                                                                    label={format} 
                                                                    size="small" 
                                                                    color={formatColor} 
                                                                    sx={{ fontSize: '0.6rem', height: 16 }} 
                                                                />
                                                                <Tooltip title="Externe URL kopieren">
                                                                    <IconButton size="small" onClick={() => handleCopyUrl(tag.logo_url!)} sx={{ ml: 1 }}>
                                                                        <ContentCopyIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
                                                                    </IconButton>
                                                                </Tooltip>
                                                            </>
                                                        ) : (
                                                            <Avatar variant="rounded" sx={{ width: 30, height: 30, bgcolor: 'grey.200' }}>
                                                                <Typography variant="caption" color="text.secondary">-</Typography>
                                                            </Avatar>
                                                        )}
                                                    </Box>
                                                </TableCell>
                                                <TableCell><Chip label={tag.name} /></TableCell>
                                                <TableCell>{tag.description || '-'}</TableCell>
                                                <TableCell>{tag.category_name || '-'}</TableCell>
                                                <TableCell align="center">{tag.usage_count}</TableCell>
                                                <TableCell align="right">
                                                    <IconButton onClick={() => handleOpenDialog(tag)}><EditIcon /></IconButton>
                                                    <IconButton color="error" onClick={() => handleDelete(tag.id)}><DeleteIcon /></IconButton>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                )}
            </Container>

            <Dialog open={dialogOpen} onClose={handleCloseDialog} fullWidth maxWidth="sm">
                <DialogTitle>{editingTag ? 'Tag bearbeiten' : 'Neuen Tag hinzufügen'}</DialogTitle>
                <DialogContent>
                    {dialogError && <Alert severity="error" sx={{ mb: 2 }}>{dialogError}</Alert>}
                    
                    <TextField autoFocus margin="dense" name="name" label="Name des Tags" type="text" fullWidth variant="outlined" value={formState.name} onChange={handleFormChange} sx={{mt: 1}}/>
                    
                    <Box sx={{ mt: 2, mb: 1, p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            Markenlogo (wird auf 50px Höhe formatiert & als PNG gespeichert)
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1, mb: 2 }}>
                            <Button variant="outlined" component="label" startIcon={<UploadFileIcon />} disabled={formState.deleteLogo}>
                                {formState.logo ? 'Anderes Bild wählen' : 'Bild auswählen'}
                                <input type="file" hidden accept="image/*" onChange={handleFileChange} />
                            </Button>
                            
                            {formState.deleteLogo ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="body2" color="error" sx={{ fontStyle: 'italic' }}>Wird beim Speichern gelöscht</Typography>
                                    <IconButton size="small" onClick={handleDeleteLogoToggle} color="primary" title="Rückgängig"><UndoIcon /></IconButton>
                                </Box>
                            ) : formState.logo ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="body2" color="primary" noWrap sx={{ maxWidth: 150 }}>{formState.logo.name}</Typography>
                                    <IconButton size="small" onClick={handleDeleteLogoToggle} color="error" title="Auswahl verwerfen"><DeleteOutlineIcon /></IconButton>
                                </Box>
                            ) : editingTag?.logo_url ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box component="img" src={getImageUrl(editingTag.logo_url)} alt="Current Logo" sx={{ height: 40, objectFit: 'contain', bgcolor: 'grey.100', p: 0.5, borderRadius: 1 }} />
                                    <IconButton size="small" onClick={handleDeleteLogoToggle} color="error" title="Aktuelles Logo löschen"><DeleteOutlineIcon /></IconButton>
                                </Box>
                            ) : null}
                        </Box>

                        {/* URL Anzeige und Kopier-Funktion im Edit-Modus (vereinfacht auf 1 Format) */}
                        {editingTag?.logo_url && !formState.deleteLogo && !formState.logo && (
                            <Box sx={{ bgcolor: 'action.hover', p: 1.5, borderRadius: 1 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 'bold' }}>
                                    Abrufbare URL für externe Systeme:
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <TextField 
                                        size="small" 
                                        value={getImageUrl(editingTag.logo_url)} 
                                        InputProps={{ readOnly: true }} 
                                        variant="standard" 
                                        fullWidth 
                                        sx={{ input: { fontSize: '0.75rem', color: 'text.secondary' } }}
                                    />
                                    <Tooltip title="Link kopieren">
                                        <IconButton size="small" onClick={() => handleCopyUrl(editingTag.logo_url!)}>
                                            <ContentCopyIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                            </Box>
                        )}
                    </Box>

                    <TextField margin="dense" name="description" label="Beschreibung" type="text" fullWidth multiline rows={3} variant="outlined" value={formState.description} onChange={handleFormChange} />
                    
                    <FormControl fullWidth margin="dense">
                        <InputLabel>Kategorie (Optional)</InputLabel>
                        <Select
                            name="category_id"
                            value={formState.category_id}
                            label="Kategorie (Optional)"
                            onChange={handleFormChange as any}
                        >
                            <MenuItem value=""><em>Keine Kategorie</em></MenuItem>
                            {categories.map(cat => (
                                <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Abbrechen</Button>
                    <Button onClick={handleSubmit} variant="contained">{editingTag ? 'Speichern' : 'Hinzufügen'}</Button>
                </DialogActions>
            </Dialog>
        </DashboardLayout>
    );
};

export default AdminTagsPage;