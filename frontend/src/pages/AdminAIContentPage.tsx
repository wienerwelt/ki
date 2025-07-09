import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Chip, Tooltip, MenuItem, TableSortLabel, InputAdornment
} from '@mui/material';
import { Autocomplete } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

// --- Interfaces ---
interface AIContent {
    id: string;
    title: string;
    generated_output: string;
    rule_name: string | null;
    category_name: string | null;
    category_id: string | null;
    region: string | null;
    tags: string[] | null;
    created_at: string;
}

interface Category { id: string; name: string; }
interface Tag { id: string; name: string; }
interface Region { id: string; name: string; code: string; }

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

const AdminAIContentPage: React.FC = () => {
    const [content, setContent] = useState<AIContent[]>([]);
    const [allCategories, setAllCategories] = useState<Category[]>([]);
    const [allTags, setAllTags] = useState<Tag[]>([]);
    const [allRegions, setAllRegions] = useState<Region[]>([]); // State für Regionen
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingContent, setEditingContent] = useState<AIContent | null>(null);

    // States für Suche und Sortierung
    const [searchTerm, setSearchTerm] = useState('');
    const [order, setOrder] = useState<Order>('desc');
    const [orderBy, setOrderBy] = useState<keyof AIContent>('created_at');

    // Formular-State für den Dialog
    const [formTitle, setFormTitle] = useState('');
    const [formGeneratedOutput, setFormGeneratedOutput] = useState('');
    const [formCategory, setFormCategory] = useState<Category | null>(null);
    const [formTags, setFormTags] = useState<Tag[]>([]);
    const [formRegion, setFormRegion] = useState('');

    const fetchInitialData = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            // Die Regionen werden jetzt mit den anderen Daten zusammen geladen
            const [contentRes, categoriesRes, tagsRes, regionsRes] = await Promise.all([
                apiClient.get('/api/admin/ai-content', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/categories', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/tags', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/data/regions', { headers: { 'x-auth-token': token } }) // API-Aufruf für Regionen
            ]);
            setContent(contentRes.data);
            setAllCategories(categoriesRes.data);
            setAllTags(tagsRes.data);
            setAllRegions(regionsRes.data); // Regionen im State speichern
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Daten.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchInitialData(); }, []);
    
    const handleSortRequest = (property: keyof AIContent) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const sortedAndFilteredContent = useMemo(() => {
        let filtered = [...content];
        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            filtered = content.filter(item =>
                item.title.toLowerCase().includes(lowercasedFilter) ||
                (item.category_name?.toLowerCase() || '').includes(lowercasedFilter) ||
                (item.region?.toLowerCase() || '').includes(lowercasedFilter) ||
                (item.rule_name?.toLowerCase() || '').includes(lowercasedFilter) ||
                (item.tags?.some(tag => tag.toLowerCase().includes(lowercasedFilter)))
            );
        }
        return filtered.sort(getComparator(order, orderBy));
    }, [content, searchTerm, order, orderBy]);

    const handleOpenEditDialog = (item: AIContent) => {
        setEditingContent(item);
        setFormTitle(item.title);
        setFormGeneratedOutput(item.generated_output);
        setFormCategory(allCategories.find(c => c.id === item.category_id) || null);
        setFormTags(allTags.filter(t => item.tags?.includes(t.name)));
        setFormRegion(item.region || '');
        setError(null);
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingContent(null);
    };

    const handleSubmit = async () => {
        if (!editingContent) return;
        const token = localStorage.getItem('jwt_token');
        const payload = {
            title: formTitle,
            generated_output: formGeneratedOutput,
            category_id: formCategory?.id || null,
            tags: formTags.map(t => t.id),
            region: formRegion || null,
        };

        try {
            await apiClient.put(`/api/admin/ai-content/${editingContent.id}`, payload, { headers: { 'x-auth-token': token } });
            handleCloseDialog();
            fetchInitialData();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Speichern.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Sind Sie sicher, dass Sie diesen KI-Inhalt löschen möchten?')) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.delete(`/api/admin/ai-content/${id}`, { headers: { 'x-auth-token': token } });
            fetchInitialData();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler beim Löschen.');
        }
    };

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                    <Typography variant="h4" component="h1">KI-Inhalte Verwaltung ({sortedAndFilteredContent.length})</Typography>
                    <TextField 
                        variant="outlined" 
                        size="small" 
                        placeholder="Suchen..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                        InputProps={{ 
                            startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>), 
                        }} 
                    />
                </Box>

                {loading ? <CircularProgress /> : error ? <Alert severity="error">{error}</Alert> : (
                    <Paper>
                        <TableContainer sx={{ maxHeight: '75vh' }}>
                            <Table stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ width: '25%' }} sortDirection={orderBy === 'title' ? order : false}>
                                            <TableSortLabel active={orderBy === 'title'} direction={order} onClick={() => handleSortRequest('title')}>Titel</TableSortLabel>
                                        </TableCell>
                                        <TableCell sx={{ width: '15%' }} sortDirection={orderBy === 'category_name' ? order : false}>
                                            <TableSortLabel active={orderBy === 'category_name'} direction={order} onClick={() => handleSortRequest('category_name')}>Kategorie</TableSortLabel>
                                        </TableCell>
                                        <TableCell sx={{ width: '10%' }} sortDirection={orderBy === 'region' ? order : false}>
                                            <TableSortLabel active={orderBy === 'region'} direction={order} onClick={() => handleSortRequest('region')}>Region</TableSortLabel>
                                        </TableCell>
                                        <TableCell sx={{ width: '20%' }}>Tags</TableCell>
                                        <TableCell sx={{ width: '15%' }} sortDirection={orderBy === 'created_at' ? order : false}>
                                            <TableSortLabel active={orderBy === 'created_at'} direction={order} onClick={() => handleSortRequest('created_at')}>Erstellt am</TableSortLabel>
                                        </TableCell>
                                        <TableCell sx={{ width: '10%' }} sortDirection={orderBy === 'rule_name' ? order : false}>
                                            <TableSortLabel active={orderBy === 'rule_name'} direction={order} onClick={() => handleSortRequest('rule_name')}>Ursprungsregel</TableSortLabel>
                                        </TableCell>
                                        <TableCell sx={{ width: '5%' }} align="right">Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortedAndFilteredContent.map((item) => (
                                        <TableRow key={item.id} hover>
                                            <TableCell sx={{ fontWeight: 'bold' }}>{item.title}</TableCell>
                                            <TableCell><Chip label={item.category_name || '-'} size="small" /></TableCell>
                                            <TableCell>{item.region || '-'}</TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                    {(item.tags || []).map(tag => (<Chip key={tag} label={tag} size="small" variant="outlined" />))}
                                                </Box>
                                            </TableCell>
                                            <TableCell>{new Date(item.created_at).toLocaleString('de-AT')}</TableCell>
                                            <TableCell>{item.rule_name || 'Unbekannt'}</TableCell>
                                            <TableCell align="right">
                                                <Tooltip title="Inhalt bearbeiten"><IconButton onClick={() => handleOpenEditDialog(item)}><EditIcon /></IconButton></Tooltip>
                                                <Tooltip title="Löschen"><IconButton color="error" onClick={() => handleDelete(item.id)}><DeleteIcon /></IconButton></Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                )}
            </Container>

            <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md">
                <DialogTitle>KI-Inhalt bearbeiten</DialogTitle>
                <DialogContent>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    <TextField label="Titel" fullWidth value={formTitle} onChange={(e) => setFormTitle(e.target.value)} margin="normal" />
                    <TextField label="Generierter Inhalt" fullWidth multiline rows={8} value={formGeneratedOutput} onChange={(e) => setFormGeneratedOutput(e.target.value)} margin="normal" />
                    
                    {/* Das Dropdown verwendet jetzt die dynamisch geladenen Regionen */}
                    <TextField select label="Region" fullWidth value={formRegion} onChange={(e) => setFormRegion(e.target.value)} margin="normal">
                        <MenuItem value=""><em>Keine Region</em></MenuItem>
                        {allRegions.map((region) => (<MenuItem key={region.id} value={region.name}>{region.name}</MenuItem>))}
                    </TextField>

                    <Autocomplete
                        options={allCategories}
                        getOptionLabel={(option) => option.name}
                        value={formCategory}
                        onChange={(event, newValue) => { setFormCategory(newValue); }}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        renderInput={(params) => <TextField {...params} label="Kategorie" margin="normal" />}
                    />
                    <Autocomplete
                        multiple
                        options={allTags}
                        getOptionLabel={(option) => option.name}
                        value={formTags}
                        onChange={(event, newValue) => { setFormTags(newValue); }}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        renderTags={(value, getTagProps) => value.map((option, index) => (<Chip label={option.name} {...getTagProps({ index })} />))}
                        renderInput={(params) => <TextField {...params} label="Tags" margin="normal" placeholder="Tags auswählen" />}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Abbrechen</Button>
                    <Button onClick={handleSubmit} variant="contained">Änderungen speichern</Button>
                </DialogActions>
            </Dialog>
        </DashboardLayout>
    );
};

export default AdminAIContentPage;
