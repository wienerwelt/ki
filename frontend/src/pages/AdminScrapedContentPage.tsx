import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell, 
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, 
    TextField, MenuItem, Chip, Grid, TableSortLabel, InputAdornment, Tooltip,
    Checkbox, Avatar
} from '@mui/material';
import { Autocomplete } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import LinkIcon from '@mui/icons-material/Link';
import FilterListIcon from '@mui/icons-material/FilterList';
import ScienceIcon from '@mui/icons-material/Science';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';

interface UnifiedContent {
    id: string;
    source_identifier: string;
    rule_name: string | null;
    title: string;
    original_url: string;
    category: string | null;
    category_id?: string | null;
    published_date: string | null;
    event_date: string | null;
    region: string | null;
    relevance_score: number | null;
    scraped_at: string;
    data_type: 'content' | 'traffic';
    tags: string[] | null;
    summary?: string | null;
    full_text?: string | null;
    thumbnail_url?: string | null;
}

interface ScrapingRuleOption { id: string; source_identifier: string; name?: string; }
interface Category { id: string; name: string; }
interface Tag { id: string; name: string; }
interface Region { id: string; name: string; }
type Order = 'asc' | 'desc';

function descendingComparator(a: UnifiedContent, b: UnifiedContent, orderBy: keyof UnifiedContent) {
    const valA = a[orderBy] ?? '';
    const valB = b[orderBy] ?? '';
    if (valB < valA) return -1;
    if (valB > valA) return 1;
    return 0;
}

function getComparator(order: Order, orderBy: keyof UnifiedContent): (a: UnifiedContent, b: UnifiedContent) => number {
    return order === 'desc' ? (a, b) => descendingComparator(a, b, orderBy) : (a, b) => -descendingComparator(a, b, orderBy);
}

function useQuery() { return new URLSearchParams(useLocation().search); }

const initialFormState = {
    source_identifier: '',
    original_url: '',
    title: '',
    summary: '',
    full_text: '',
    published_date: '',
    event_date: '',
    category_id: '' as string | null,
    tags: [] as Tag[],
    relevance_score: '' as number | '',
    region: '',
    thumbnail_url: '',
};

const PAGE_SIZE = 50;

const AdminScrapedContentPage: React.FC = () => {
    const [content, setContent] = useState<UnifiedContent[]>([]);
    const [sourceIdentifierOptions, setSourceIdentifierOptions] = useState<ScrapingRuleOption[]>([]);
    const [allCategories, setAllCategories] = useState<Category[]>([]);
    const [allTags, setAllTags] = useState<Tag[]>([]);
    const [allRegions, setAllRegions] = useState<Region[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingContent, setEditingContent] = useState<UnifiedContent | null>(null);
    const [selected, setSelected] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [order, setOrder] = useState<Order>('desc');
    const [orderBy, setOrderBy] = useState<keyof UnifiedContent>('scraped_at');
    const [formState, setFormState] = useState(initialFormState);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const query = useQuery();
    const sourceIdentifierFilter = query.get('source_identifier');
    const navigate = useNavigate();
    const { showSnackbar } = useSnackbar();

    const fetchStaticData = useCallback(async () => {
        try {
            const token = localStorage.getItem('jwt_token');
            const [rulesRes, categoriesRes, tagsRes, regionsRes] = await Promise.all([
                apiClient.get('/api/admin/scraping-rules', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/categories', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/tags', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/scraped-content/regions', { headers: { 'x-auth-token': token } })
            ]);
            setSourceIdentifierOptions(rulesRes.data);
            setAllCategories(categoriesRes.data);
            setAllTags(tagsRes.data);
            setAllRegions(regionsRes.data);
        } catch (err: any) {
             setError(err.response?.data?.message || 'Fehler beim Laden der Stammdaten.');
        }
    }, []);

    const fetchContent = useCallback(async (currentPage: number, replace = false) => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const params = new URLSearchParams({
                limit: String(PAGE_SIZE),
                offset: String((currentPage - 1) * PAGE_SIZE)
            });
            if (sourceIdentifierFilter) params.append('source_identifier', sourceIdentifierFilter);
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);

            const contentRes = await apiClient.get(`/api/admin/scraped-content?${params.toString()}`, { headers: { 'x-auth-token': token } });
            
            setContent(prev => replace ? contentRes.data : [...prev, ...contentRes.data]);
            setHasMore(contentRes.data.length === PAGE_SIZE);
            setPage(currentPage);

        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Inhalte.');
        } finally {
            setLoading(false);
        }
    }, [sourceIdentifierFilter, startDate, endDate]);

    useEffect(() => {
        fetchStaticData();
    }, [fetchStaticData]);

    useEffect(() => {
        fetchContent(1, true);
    }, [fetchContent]);

    const handleApplyFilter = () => {
        setContent([]);
        fetchContent(1, true);
    };
    
    const handleLoadMore = () => {
        fetchContent(page + 1, false);
    };

    const handleFormChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = event.target;
        setFormState(prevState => ({ ...prevState, [name]: value }));
    };

    const handleOpenAddDialog = () => {
        setEditingContent(null);
        setFormState(initialFormState);
        setOpenDialog(true);
    };

    const handleOpenEditDialog = (item: UnifiedContent) => {
        if (item.data_type === 'traffic') {
            alert('Verkehrsmeldungen können hier nicht direkt bearbeitet werden.');
            return;
        }
        setEditingContent(item);
        setFormState({
            source_identifier: item.source_identifier,
            original_url: item.original_url,
            title: item.title,
            summary: item.summary || '',
            full_text: item.full_text || '',
            published_date: item.published_date ? new Date(item.published_date).toISOString().split('T')[0] : '',
            event_date: item.event_date ? new Date(item.event_date).toISOString().split('T')[0] : '',
            category_id: allCategories.find(c => c.name === item.category)?.id || null,
            tags: allTags.filter(t => item.tags?.includes(t.name)),
            relevance_score: item.relevance_score ?? '',
            region: item.region || '',
            thumbnail_url: item.thumbnail_url || '',
        });
        setOpenDialog(true);
    };

    const handleCloseDialog = () => { setOpenDialog(false); setEditingContent(null); setError(null); };

    const handleSubmit = async () => {
        setLoading(true);
        setError(null);
        const token = localStorage.getItem('jwt_token');
        const contentData = {
            ...formState,
            tags: formState.tags.map(t => t.id),
            summary: formState.summary || null,
            full_text: formState.full_text || null,
            published_date: formState.published_date || null,
            event_date: formState.event_date || null,
            relevance_score: formState.relevance_score === '' ? null : Number(formState.relevance_score),
            region: formState.region || null,
            thumbnail_url: formState.thumbnail_url || null,
        };

        try {
            if (editingContent) {
                await apiClient.put(`/api/admin/scraped-content/${editingContent.id}`, contentData, { headers: { 'x-auth-token': token } });
            } else {
                await apiClient.post('/api/admin/scraped-content', contentData, { headers: { 'x-auth-token': token } });
            }
            handleCloseDialog();
            handleApplyFilter();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Speichern des Inhalts.');
        } finally {
            setLoading(false);
        }
    };
    
    const handleDelete = async (id: string, dataType: 'content' | 'traffic') => {
        if (!window.confirm('Sind Sie sicher, dass Sie diesen Inhalt löschen möchten?')) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.delete(`/api/admin/scraped-content/${id}?dataType=${dataType}`, { headers: { 'x-auth-token': token } });
            handleApplyFilter();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler beim Löschen des Inhalts.');
        }
    };

    const handleBulkDelete = async () => {
        if (!window.confirm(`Sind Sie sicher, dass Sie ${selected.length} Einträge löschen möchten?`)) return;
        setLoading(true);
        const token = localStorage.getItem('jwt_token');
        try {
            for (const id of selected) {
                const item = content.find(c => c.id === id);
                if (item) {
                    await apiClient.delete(`/api/admin/scraped-content/${item.id}?dataType=${item.data_type}`, { headers: { 'x-auth-token': token } });
                }
            }
            setSelected([]);
            handleApplyFilter();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler beim Löschen der Inhalte.');
            setLoading(false);
        }
    };

    const handleSortRequest = (property: keyof UnifiedContent) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const handleClearFilter = () => { navigate('/admin/scraped-content'); };

    const sortedAndFilteredContent = useMemo(() => {
        let filtered = [...content];
        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            filtered = content.filter(item =>
                item.title.toLowerCase().includes(lowercasedFilter) ||
                item.source_identifier.toLowerCase().includes(lowercasedFilter) ||
                (item.summary?.toLowerCase() || '').includes(lowercasedFilter) ||
                (item.category?.toLowerCase() || '').includes(lowercasedFilter)
            );
        }
        return filtered.sort(getComparator(order, orderBy));
    }, [content, searchTerm, order, orderBy]);

    const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.checked) {
            const newSelecteds = sortedAndFilteredContent.map((n) => n.id);
            setSelected(newSelecteds);
            return;
        }
        setSelected([]);
    };

    const handleClick = (_event: React.MouseEvent<unknown>, id: string) => {
        const selectedIndex = selected.indexOf(id);
        let newSelected: string[] = [];

        if (selectedIndex === -1) {
            newSelected = newSelected.concat(selected, id);
        } else if (selectedIndex === 0) {
            newSelected = newSelected.concat(selected.slice(1));
        } else if (selectedIndex === selected.length - 1) {
            newSelected = newSelected.concat(selected.slice(0, -1));
        } else if (selectedIndex > 0) {
            newSelected = newSelected.concat(
                selected.slice(0, selectedIndex),
                selected.slice(selectedIndex + 1),
            );
        }
        setSelected(newSelected);
    };
    
    const isSelected = (id: string) => selected.indexOf(id) !== -1;

    const handleDeepDive = async (contentId: string) => {
        if (!window.confirm('Möchten Sie diesen Inhalt als potenzielle Förderung analysieren? Dies verbraucht KI-Tokens.')) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.post(`/api/admin/scraped-content/${contentId}/deep-dive`, {}, { headers: { 'x-auth-token': token } });
            showSnackbar('Deep Dive gestartet. Das Ergebnis erscheint in Kürze im Funding Cockpit.', 'success');
        } catch (err) {
            showSnackbar('Fehler beim Starten des Deep Dive.', 'error');
        }
    };

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 2 }}>
                    <Box>
                        <Typography variant="h4" component="h1">Alle Inhalte</Typography>
                        {sourceIdentifierFilter && <Chip label={`Filter: ${sourceIdentifierFilter}`} onDelete={handleClearFilter} sx={{ mt: 1 }} />}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {selected.length > 0 ? (
                            <Button variant="contained" color="error" startIcon={<DeleteIcon />} onClick={handleBulkDelete}>
                                {selected.length} Auswahl löschen
                            </Button>
                        ) : (
                            <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAddDialog}>Inhalt hinzufügen</Button>
                        )}
                    </Box>
                </Box>
                
                <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
                    <TextField variant="outlined" size="small" placeholder="Suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>), }} sx={{ flexGrow: 1 }} />
                    <TextField label="Start-Datum" type="date" size="small" InputLabelProps={{ shrink: true }} value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <TextField label="End-Datum" type="date" size="small" InputLabelProps={{ shrink: true }} value={endDate} onChange={e => setEndDate(e.target.value)} />
                    <Button variant="contained" startIcon={<FilterListIcon />} onClick={handleApplyFilter}>Filtern</Button>
                </Paper>

                {loading && content.length === 0 ? <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box> 
                : error ? <Alert severity="error">{error}</Alert> 
                : (
                    <>
                    <Paper>
                        <TableContainer sx={{ maxHeight: '70vh' }}>
                            <Table stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell padding="checkbox">
                                            <Checkbox
                                                indeterminate={selected.length > 0 && selected.length < sortedAndFilteredContent.length}
                                                checked={sortedAndFilteredContent.length > 0 && selected.length === sortedAndFilteredContent.length}
                                                onChange={handleSelectAllClick}
                                            />
                                        </TableCell>
                                        <TableCell>Bild</TableCell>
                                        <TableCell sortDirection={orderBy === 'source_identifier' ? order : false}><TableSortLabel active={orderBy === 'source_identifier'} direction={order} onClick={() => handleSortRequest('source_identifier')}>Quelle</TableSortLabel></TableCell>
                                        <TableCell sortDirection={orderBy === 'title' ? order : false}><TableSortLabel active={orderBy === 'title'} direction={order} onClick={() => handleSortRequest('title')}>Titel</TableSortLabel></TableCell>
                                        <TableCell sortDirection={orderBy === 'category' ? order : false}><TableSortLabel active={orderBy === 'category'} direction={order} onClick={() => handleSortRequest('category')}>Kategorie</TableSortLabel></TableCell>
                                        <TableCell>Tags</TableCell>
                                        <TableCell align="center" sortDirection={orderBy === 'relevance_score' ? order : false}><TableSortLabel active={orderBy === 'relevance_score'} direction={order} onClick={() => handleSortRequest('relevance_score')}>Relevanz</TableSortLabel></TableCell>
                                        <TableCell sortDirection={orderBy === 'published_date' ? order : false}><TableSortLabel active={orderBy === 'published_date'} direction={order} onClick={() => handleSortRequest('published_date')}>Datum</TableSortLabel></TableCell>
                                        <TableCell>Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortedAndFilteredContent.map((item) => {
                                        const isItemSelected = isSelected(item.id);
                                        return (
                                            <TableRow key={`${item.data_type}-${item.id}`} hover onClick={(event) => handleClick(event, item.id)} role="checkbox" aria-checked={isItemSelected} selected={isItemSelected}>
                                                <TableCell padding="checkbox">
                                                    <Checkbox checked={isItemSelected} />
                                                </TableCell>
                                                <TableCell>
                                                    {item.thumbnail_url && <Avatar variant="rounded" src={item.thumbnail_url} />}
                                                </TableCell>
                                                <TableCell><Chip label={item.source_identifier} size="small" variant="outlined" color={item.data_type === 'traffic' ? 'secondary' : 'default'} /><Typography variant="caption" display="block" sx={{ mt: 0.5 }}>{item.rule_name || ''}</Typography></TableCell>
                                                <TableCell sx={{ maxWidth: 350, wordBreak: 'break-word' }}>{item.title}</TableCell>
                                                <TableCell><Chip label={item.category || '-'} size="small" /></TableCell>
                                                <TableCell><Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{(item.tags || []).map(tag => (<Chip key={tag} label={tag} size="small" variant="filled" />))}</Box></TableCell>
                                                <TableCell align="center">{item.relevance_score ?? '-'}</TableCell>
                                                <TableCell>{new Date(item.published_date || item.scraped_at).toLocaleDateString('de-AT')}</TableCell>
                                                <TableCell>
                                                    <Tooltip title="Original-URL öffnen"><IconButton component="a" href={item.original_url} target="_blank" rel="noopener noreferrer"><LinkIcon /></IconButton></Tooltip>
                                                    <Tooltip title="Inhalt bearbeiten"><span><IconButton onClick={() => handleOpenEditDialog(item)} disabled={item.data_type === 'traffic'}><EditIcon /></IconButton></span></Tooltip>
                                                    <Tooltip title="KI Deep Dive: Als Förderung analysieren">
                                                        <span>
                                                            <IconButton onClick={() => handleDeepDive(item.id)} disabled={item.data_type === 'traffic'}>
                                                                <ScienceIcon />
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                    <Tooltip title="Löschen"><span><IconButton onClick={() => handleDelete(item.id, item.data_type)}><DeleteIcon color="error" /></IconButton></span></Tooltip>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                    {hasMore && (
                        <Box sx={{ textAlign: 'center', mt: 2 }}>
                            <Button onClick={handleLoadMore} disabled={loading}>
                                {loading ? <CircularProgress size={24} /> : 'Mehr laden'}
                            </Button>
                        </Box>
                    )}
                    </>
                )}
                
                <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md">
                    <DialogTitle>{editingContent ? 'Inhalt bearbeiten' : 'Neuen Inhalt hinzufügen'}</DialogTitle>
                    <DialogContent>
                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                        <TextField select name="source_identifier" label="Source Identifier" fullWidth value={formState.source_identifier} onChange={handleFormChange} margin="dense" required disabled={!!editingContent}>
                            <MenuItem value=""><em>Wählen Sie eine Quellen-ID</em></MenuItem>
                            {sourceIdentifierOptions.map((opt) => ( <MenuItem key={opt.id} value={opt.source_identifier}>{opt.name || opt.source_identifier}</MenuItem>))}
                        </TextField>
                        <TextField name="title" label="Titel" fullWidth value={formState.title} onChange={handleFormChange} margin="dense" required />
                        <TextField name="original_url" label="Original URL" fullWidth value={formState.original_url} onChange={handleFormChange} margin="dense" required />
                        <TextField name="thumbnail_url" label="Thumbnail URL" fullWidth value={formState.thumbnail_url} onChange={handleFormChange} margin="dense" />
                        <TextField name="summary" label="Zusammenfassung" fullWidth multiline rows={3} value={formState.summary} onChange={handleFormChange} margin="dense" />
                        <TextField name="full_text" label="Volltext" fullWidth multiline rows={5} value={formState.full_text} onChange={handleFormChange} margin="dense" />
                        <Grid container spacing={2}>
                            <Grid item xs={6}><TextField name="published_date" label="Veröffentlichungsdatum" type="date" fullWidth InputLabelProps={{ shrink: true }} value={formState.published_date} onChange={handleFormChange} margin="dense" /></Grid>
                            <Grid item xs={6}><TextField name="event_date" label="Veranstaltungsdatum" type="date" fullWidth InputLabelProps={{ shrink: true }} value={formState.event_date} onChange={handleFormChange} margin="dense" /></Grid>
                        </Grid>
                        <Grid container spacing={2}>
                            <Grid item xs={6}>
                                 <Autocomplete
                                    options={allCategories}
                                    getOptionLabel={(option) => option.name}
                                    value={allCategories.find(c => c.id === formState.category_id) || null}
                                    onChange={(_, newValue) => { setFormState(p => ({...p, category_id: newValue?.id || null})); }}
                                    isOptionEqualToValue={(option, value) => option.id === value.id}
                                    renderInput={(params) => <TextField {...params} label="Kategorie" margin="dense" />}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <Autocomplete
                                    multiple
                                    options={allTags}
                                    getOptionLabel={(option) => option.name}
                                    value={formState.tags}
                                    onChange={(_, newValue) => { setFormState(p => ({...p, tags: newValue})); }}
                                    isOptionEqualToValue={(option, value) => option.id === value.id}
                                    renderTags={(value, getTagProps) => value.map((option, index) => (<Chip label={option.name} {...getTagProps({ index })} />))}
                                    renderInput={(params) => <TextField {...params} label="Tags" margin="dense" placeholder="Tags auswählen" />}
                                />
                            </Grid>
                        </Grid>
                        <Grid container spacing={2}>
                            <Grid item xs={6}><TextField name="relevance_score" label="Relevanz Score" type="number" fullWidth value={formState.relevance_score} onChange={handleFormChange} margin="dense" /></Grid>
                            <Grid item xs={6}>
                                <TextField select name="region" label="Region" fullWidth value={formState.region} onChange={handleFormChange} margin="dense">
                                    <MenuItem value=""><em>Alle Regionen</em></MenuItem>
                                    {(allRegions || []).map((region) => (
                                        <MenuItem key={region.id} value={region.name}>{region.name}</MenuItem>
                                    ))}
                                </TextField>
                            </Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseDialog}>Abbrechen</Button>
                        <Button onClick={handleSubmit} disabled={loading}>{editingContent ? 'Speichern' : 'Hinzufügen'}</Button>
                    </DialogActions>
                </Dialog>
            </Container>
        </DashboardLayout>
    );
};

export default AdminScrapedContentPage;