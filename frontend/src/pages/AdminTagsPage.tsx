// frontend/src/pages/AdminTagsPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Chip, TableSortLabel, InputAdornment, Select, MenuItem, FormControl, InputLabel
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

interface Tag {
    id: string;
    name: string;
    description: string | null;
    usage_count: number;
    category_id: string | null;
    category_name: string | null;
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
    const [tags, setTags] = useState<Tag[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingTag, setEditingTag] = useState<Tag | null>(null);
    const [formState, setFormState] = useState({ name: '', description: '', category_id: '' });
    const [dialogError, setDialogError] = useState<string | null>(null);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<keyof Tag>('name');

    const fetchAllData = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
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
            setFormState({ name: tag.name, description: tag.description || '', category_id: tag.category_id || '' });
        } else {
            setFormState({ name: '', description: '', category_id: '' });
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

    const handleSubmit = async () => {
        const token = localStorage.getItem('jwt_token');
        const headers = { 'x-auth-token': token };
        const data = { 
            name: formState.name, 
            description: formState.description || null,
            category_id: formState.category_id || null
        };

        try {
            if (editingTag) {
                await apiClient.put(`/api/admin/tags/${editingTag.id}`, data, { headers });
            } else {
                await apiClient.post('/api/admin/tags', data, { headers });
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
            const token = localStorage.getItem('jwt_token');
            await apiClient.delete(`/api/admin/tags/${id}`, { headers: { 'x-auth-token': token } });
            // KORREKTUR: Der Funktionsname wurde von fetchTags zu fetchAllData geändert.
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
                                        <TableCell sortDirection={orderBy === 'name' ? order : false}><TableSortLabel active={orderBy === 'name'} direction={order} onClick={() => handleSortRequest('name')}>Tag-Name</TableSortLabel></TableCell>
                                        <TableCell>Beschreibung</TableCell>
                                        <TableCell sortDirection={orderBy === 'category_name' ? order : false}><TableSortLabel active={orderBy === 'category_name'} direction={order} onClick={() => handleSortRequest('category_name')}>Kategorie</TableSortLabel></TableCell>
                                        <TableCell align="center" sortDirection={orderBy === 'usage_count' ? order : false}><TableSortLabel active={orderBy === 'usage_count'} direction={order} onClick={() => handleSortRequest('usage_count')}>Verwendungen</TableSortLabel></TableCell>
                                        <TableCell align="right">Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortedAndFilteredTags.map((tag) => (
                                        <TableRow key={tag.id} hover>
                                            <TableCell><Chip label={tag.name} /></TableCell>
                                            <TableCell>{tag.description || '-'}</TableCell>
                                            <TableCell>{tag.category_name || '-'}</TableCell>
                                            <TableCell align="center">{tag.usage_count}</TableCell>
                                            <TableCell align="right">
                                                <IconButton onClick={() => handleOpenDialog(tag)}><EditIcon /></IconButton>
                                                <IconButton color="error" onClick={() => handleDelete(tag.id)}><DeleteIcon /></IconButton>
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
                <DialogTitle>{editingTag ? 'Tag bearbeiten' : 'Neuen Tag hinzufügen'}</DialogTitle>
                <DialogContent>
                    {dialogError && <Alert severity="error" sx={{ mb: 2 }}>{dialogError}</Alert>}
                    <TextField autoFocus margin="dense" name="name" label="Name des Tags" type="text" fullWidth variant="outlined" value={formState.name} onChange={handleFormChange} sx={{mt: 1}}/>
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