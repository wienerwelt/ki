import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Chip, Tooltip, MenuItem, TableSortLabel, Checkbox, Grid, FormControl, InputLabel, Select, SelectChangeEvent,
    DialogContentText, TablePagination
} from '@mui/material';
import { Autocomplete } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';

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
    const { showSnackbar } = useSnackbar();
    const [content, setContent] = useState<AIContent[]>([]);
    const [allCategories, setAllCategories] = useState<Category[]>([]);
    const [allTags, setAllTags] = useState<Tag[]>([]);
    const [allRegions, setAllRegions] = useState<Region[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingContent, setEditingContent] = useState<AIContent | null>(null);

    const [filters, setFilters] = useState({ search: '', region: 'all' });
    const [selected, setSelected] = useState<string[]>([]);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [totalItems, setTotalItems] = useState(0);

    const [order, setOrder] = useState<Order>('desc');
    const [orderBy, setOrderBy] = useState<keyof AIContent>('created_at');

    const [formState, setFormState] = useState({ title: '', generated_output: '', category: null as Category | null, tags: [] as Tag[], region: '' });

    const fetchContent = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: (page + 1).toString(),
                limit: rowsPerPage.toString(),
                search: filters.search,
                region: filters.region,
            });
            // KORRIGIERT: Ruft den korrekten Admin-Endpunkt auf
            const { data } = await apiClient.get(`/api/admin/ai-content?${params.toString()}`);
            setContent(data.data || []);
            setTotalItems(data.totalItems || 0);
        } catch (err) {
            setError('Inhalte konnten nicht geladen werden.');
        } finally {
            setLoading(false);
        }
    }, [page, rowsPerPage, filters]);

    const fetchStaticData = useCallback(async () => {
        try {
            const [categoriesRes, tagsRes, regionsRes] = await Promise.all([
                apiClient.get('/api/admin/categories'),
                apiClient.get('/api/admin/tags'),
                apiClient.get('/api/data/regions')
            ]);
            setAllCategories(categoriesRes.data);
            setAllTags(tagsRes.data);
            setAllRegions(regionsRes.data);
        } catch (err) {
            showSnackbar('Stammdaten konnten nicht geladen werden.', 'error');
        }
    }, [showSnackbar]);

    useEffect(() => {
        fetchStaticData();
    }, [fetchStaticData]);

    useEffect(() => {
        fetchContent();
    }, [fetchContent]);

    const handleSortRequest = (property: keyof AIContent) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const sortedContent = useMemo(() => {
        return [...content].sort(getComparator(order, orderBy));
    }, [content, order, orderBy]);

    const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.checked) {
            const newSelecteds = sortedContent.map((n) => n.id);
            setSelected(newSelecteds);
            return;
        }
        setSelected([]);
    };

    const handleRowClick = (id: string) => {
        const selectedIndex = selected.indexOf(id);
        let newSelected: string[] = [];
        if (selectedIndex === -1) newSelected = newSelected.concat(selected, id);
        else if (selectedIndex === 0) newSelected = newSelected.concat(selected.slice(1));
        else if (selectedIndex === selected.length - 1) newSelected = newSelected.concat(selected.slice(0, -1));
        else if (selectedIndex > 0) newSelected = newSelected.concat(selected.slice(0, selectedIndex), selected.slice(selectedIndex + 1));
        setSelected(newSelected);
    };

    const isSelected = (id: string) => selected.indexOf(id) !== -1;
    
    const handleOpenEditDialog = (item: AIContent) => {
        setEditingContent(item);
        setFormState({
            title: item.title,
            generated_output: item.generated_output,
            category: allCategories.find(c => c.id === item.category_id) || null,
            tags: allTags.filter(t => item.tags?.includes(t.name)),
            region: item.region || ''
        });
        setOpenDialog(true);
    };
    
    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingContent(null);
    };

    const handleSubmit = async () => {
        if (!editingContent) return;
        const payload = {
            title: formState.title,
            generated_output: formState.generated_output,
            category_id: formState.category?.id || null,
            tags: formState.tags.map(t => t.id),
            region: formState.region || null,
        };
        try {
            await apiClient.put(`/api/admin/ai-content/${editingContent.id}`, payload);
            showSnackbar('Inhalt erfolgreich aktualisiert.', 'success');
            handleCloseDialog();
            fetchContent();
        } catch (err) {
            showSnackbar('Fehler beim Speichern.', 'error');
        }
    };

const handleDeleteMultiple = async () => {
    setDeleteDialogOpen(false);
    try {
        // KORREKTUR: Wir verwenden wieder die korrekte .delete() Methode
        // und fügen `as any` hinzu, um den fehlerhaften TypeScript-Check zu umgehen.
        // Die Funktionalität bleibt exakt dieselbe.
        const response = await apiClient.delete('/api/admin/ai-content', { data: { ids: selected } } as any);

        showSnackbar(response.data.message, 'success');
        fetchContent(); // oder fetchInitialData(), je nachdem, wie Ihre Funktion heißt
        setSelected([]);
    } catch (err) {
        showSnackbar('Fehler beim Löschen der Inhalte.', 'error');
    }
};
    
    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Typography variant="h4" component="h1" gutterBottom>KI-Inhalte Verwaltung</Typography>
                
                <Paper sx={{ p: 2, mb: 2 }}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={6}>
                            <TextField fullWidth label="Inhalte durchsuchen..." variant="outlined" size="small"
                                value={filters.search} onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Region</InputLabel>
                                <Select value={filters.region} label="Region"
                                    onChange={(e: SelectChangeEvent) => setFilters(prev => ({ ...prev, region: e.target.value }))}
                                >
                                    <MenuItem value="all">Alle Regionen</MenuItem>
                                    {allRegions.map(r => <MenuItem key={r.id} value={r.name}>{r.name}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} sm={2}>
                            {selected.length > 0 && (
                                <Button variant="contained" color="error" startIcon={<DeleteIcon />}
                                    onClick={() => setDeleteDialogOpen(true)}
                                >
                                    Löschen ({selected.length})
                                </Button>
                            )}
                        </Grid>
                    </Grid>
                </Paper>

                {loading ? <CircularProgress /> : error ? <Alert severity="error">{error}</Alert> : (
                    <Paper>
                        <TableContainer sx={{ maxHeight: '75vh' }}>
                            <Table stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell padding="checkbox">
                                            <Checkbox
                                                indeterminate={selected.length > 0 && selected.length < content.length}
                                                checked={content.length > 0 && selected.length === content.length}
                                                onChange={handleSelectAllClick}
                                            />
                                        </TableCell>
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
                                    {sortedContent.map((item) => {
                                        const isItemSelected = isSelected(item.id);
                                        return (
                                            <TableRow 
                                                key={item.id} 
                                                hover 
                                                onClick={() => handleRowClick(item.id)}
                                                role="checkbox" 
                                                aria-checked={isItemSelected} 
                                                selected={isItemSelected}
                                            >
                                                <TableCell padding="checkbox"><Checkbox checked={isItemSelected} /></TableCell>
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
                                                    <Tooltip title="Inhalt bearbeiten"><IconButton onClick={(e) => { e.stopPropagation(); handleOpenEditDialog(item); }}><EditIcon /></IconButton></Tooltip>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <TablePagination
                            rowsPerPageOptions={[5, 10, 25]}
                            component="div"
                            count={totalItems}
                            rowsPerPage={rowsPerPage}
                            page={page}
                            onPageChange={(_event: unknown, newPage: number) => setPage(newPage)}
                            onRowsPerPageChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                                setRowsPerPage(parseInt(event.target.value, 10));
                                setPage(0);
                            }}
                        />
                    </Paper>
                )}
            </Container>
            
            <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
                <DialogTitle>Löschen bestätigen</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Sind Sie sicher, dass Sie die ausgewählten {selected.length} KI-Inhalte endgültig löschen möchten?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)}>Abbrechen</Button>
                    <Button onClick={handleDeleteMultiple} color="error" autoFocus>Löschen</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md">
                <DialogTitle>KI-Inhalt bearbeiten</DialogTitle>
                <DialogContent>
                    <TextField label="Titel" fullWidth value={formState.title} onChange={(e) => setFormState(p => ({...p, title: e.target.value}))} margin="normal" />
                    <TextField label="Generierter Inhalt" fullWidth multiline rows={8} value={formState.generated_output} onChange={(e) => setFormState(p => ({...p, generated_output: e.target.value}))} margin="normal" />
                    <TextField select label="Region" fullWidth value={formState.region} onChange={(e) => setFormState(p => ({...p, region: e.target.value}))} margin="normal">
                        <MenuItem value=""><em>Keine Region</em></MenuItem>
                        {allRegions.map((region) => (<MenuItem key={region.id} value={region.name}>{region.name}</MenuItem>))}
                    </TextField>
                    <Autocomplete
                        options={allCategories}
                        getOptionLabel={(option) => option.name}
                        value={formState.category}
                        onChange={(_, newValue) => { setFormState(p => ({...p, category: newValue})); }}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        renderInput={(params) => <TextField {...params} label="Kategorie" margin="normal" />}
                    />
                    <Autocomplete
                        multiple
                        options={allTags}
                        getOptionLabel={(option) => option.name}
                        value={formState.tags}
                        onChange={(_, newValue) => { setFormState(p => ({...p, tags: newValue})); }}
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