// frontend/src/pages/AdminCategoriesPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, InputAdornment, TableSortLabel, Chip, MenuItem
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

interface Category {
    id: string;
    name: string;
    name_lang: string | null;
    name_lang_en: string | null;
    description: string | null;
    category_type: 'industry' | 'content';
    created_at: string;
    updated_at: string;
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

function getComparator<Key extends keyof any>(
    order: Order,
    orderBy: Key,
): (a: { [key in Key]: any }, b: { [key in Key]: any }) => number {
    return order === 'desc'
        ? (a, b) => descendingComparator(a, b, orderBy)
        : (a, b) => -descendingComparator(a, b, orderBy);
}
// --- Ende ---

const AdminCategoriesPage: React.FC = () => {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [formState, setFormState] = useState({ name: '', name_lang: '', name_lang_en: '', description: '', category_type: 'content' as 'industry' | 'content' });
    const [dialogError, setDialogError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<keyof Category>('name');

    const fetchCategories = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const res = await apiClient.get('/api/admin/categories', { headers: { 'x-auth-token': token } });
            setCategories(res.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Kategorien.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCategories();
    }, []);

    const handleOpenDialog = (category: Category | null = null) => {
        setEditingCategory(category);
        if (category) {
            setFormState({ 
                name: category.name, 
                name_lang: category.name_lang || '',
                name_lang_en: category.name_lang_en || '',
                description: category.description || '',
                category_type: category.category_type || 'content'
            });
        } else {
            setFormState({ name: '', name_lang: '', name_lang_en: '', description: '', category_type: 'content' });
        }
        setDialogError(null);
        setDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setDialogOpen(false);
        setEditingCategory(null);
        setDialogError(null);
    };

    const handleFormChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        setFormState(prevState => ({ ...prevState, [name]: value }));
    };

    const handleSubmit = async () => {
        const token = localStorage.getItem('jwt_token');
        const headers = { 'x-auth-token': token };
        const data = { 
            name: formState.name, 
            name_lang: formState.name_lang || null,
            name_lang_en: formState.name_lang_en || null,
            description: formState.description || null,
            category_type: formState.category_type
        };

        try {
            if (editingCategory) {
                await apiClient.put(`/api/admin/categories/${editingCategory.id}`, data, { headers });
            } else {
                await apiClient.post('/api/admin/categories', data, { headers });
            }
            fetchCategories();
            handleCloseDialog();
        } catch (err: any) {
            setDialogError(err.response?.data?.message || 'Fehler beim Speichern der Kategorie.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Sind Sie sicher, dass Sie diese Kategorie löschen möchten?')) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.delete(`/api/admin/categories/${id}`, { headers: { 'x-auth-token': token } });
            fetchCategories();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler beim Löschen.');
        }
    };
    
    const handleSortRequest = (property: keyof Category) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const sortedAndFilteredCategories = useMemo(() => {
        let filtered = categories.filter(category =>
            category.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (category.name_lang || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (category.name_lang_en || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (category.description || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
        return filtered.sort(getComparator(order, orderBy));
    }, [categories, searchTerm, order, orderBy]);

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                    <Typography variant="h4" component="h1">
                        Kategorien-Verwaltung ({categories.length})
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField
                            variant="outlined" size="small" placeholder="Suchen..."
                            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                            InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) }}
                        />
                        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
                            Kategorie hinzufügen
                        </Button>
                    </Box>
                </Box>
                {loading ? <CircularProgress /> : error ? <Alert severity="error">{error}</Alert> : (
                    <Paper>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sortDirection={orderBy === 'name' ? order : false}>
                                            <TableSortLabel active={orderBy === 'name'} direction={order} onClick={() => handleSortRequest('name')}>Name (Primär)</TableSortLabel>
                                        </TableCell>
                                        <TableCell sortDirection={orderBy === 'name_lang' ? order : false}>
                                            <TableSortLabel active={orderBy === 'name_lang'} direction={order} onClick={() => handleSortRequest('name_lang')}>Name (DE)</TableSortLabel>
                                        </TableCell>
                                        <TableCell sortDirection={orderBy === 'name_lang_en' ? order : false}>
                                            <TableSortLabel active={orderBy === 'name_lang_en'} direction={order} onClick={() => handleSortRequest('name_lang_en')}>Name (EN)</TableSortLabel>
                                        </TableCell>
                                        <TableCell>Beschreibung</TableCell>
                                        <TableCell align="right">Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortedAndFilteredCategories.map((category) => (
                                        <TableRow key={category.id} hover>
                                            <TableCell sx={{ fontWeight: 'bold' }}>{category.name}</TableCell>
                                            <TableCell>{category.name_lang || '-'}</TableCell>
                                            <TableCell>{category.name_lang_en || '-'}</TableCell>
                                            <TableCell>
                                                <Chip label={category.category_type === 'industry' ? 'Branche' : 'Content'} size="small" color={category.category_type === 'industry' ? 'primary' : 'default'} />
                                            </TableCell>                                            
                                            <TableCell>{category.description || '-'}</TableCell>
                                            <TableCell align="right">
                                                <IconButton onClick={() => handleOpenDialog(category)}><EditIcon /></IconButton>
                                                <IconButton color="error" onClick={() => handleDelete(category.id)}><DeleteIcon /></IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                )}
            </Container>

            <Dialog open={dialogOpen} onClose={handleCloseDialog} fullWidth maxWidth="sm">
                <DialogTitle>{editingCategory ? 'Kategorie bearbeiten' : 'Neue Kategorie hinzufügen'}</DialogTitle>
                <DialogContent>
                    {dialogError && <Alert severity="error" sx={{ mb: 2 }}>{dialogError}</Alert>}
                    <TextField autoFocus margin="dense" name="name" label="Name (Primär, Eindeutig)" type="text" fullWidth variant="outlined" value={formState.name} onChange={handleFormChange} sx={{ mt: 1 }} required />
                    <TextField margin="dense" name="name_lang" label="Name (Deutsch)" type="text" fullWidth variant="outlined" value={formState.name_lang} onChange={handleFormChange} />
                    <TextField margin="dense" name="name_lang_en" label="Name (Englisch)" type="text" fullWidth variant="outlined" value={formState.name_lang_en} onChange={handleFormChange} />
                    <TextField select margin="dense" name="category_type" label="Kategorie-Typ" fullWidth value={formState.category_type} onChange={handleFormChange}>
                        <MenuItem value="content">Content-Kategorie</MenuItem>
                        <MenuItem value="industry">Branche (für Business Partner)</MenuItem>
                    </TextField>                    
                    <TextField margin="dense" name="description" label="Beschreibung" type="text" fullWidth multiline rows={3} variant="outlined" value={formState.description} onChange={handleFormChange} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Abbrechen</Button>
                    <Button onClick={handleSubmit} variant="contained">
                        {editingCategory ? 'Speichern' : 'Hinzufügen'}
                    </Button>
                </DialogActions>
            </Dialog>
        </DashboardLayout>
    );
};

export default AdminCategoriesPage;
