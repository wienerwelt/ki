import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
    Box, Typography, Paper, CircularProgress, Alert, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, IconButton, Tooltip, Link as MuiLink, Chip, TextField, InputAdornment, Snackbar,
    Dialog, DialogTitle, DialogContent, DialogActions, Button, TableSortLabel, Autocomplete, MenuItem, Container,
    Grid, Checkbox
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SettingsIcon from '@mui/icons-material/Settings';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

interface FundingOpportunity {
    id: string;
    title: string;
    original_url: string;
    deadline_end: string | null;
    status: 'active' | 'expired';
    region: string | null;
    source_name: string;
    categories: string[] | null;
    created_at: string;
}

interface StatItem { name: string; count: number; }
interface FundingStats { categoryCounts: StatItem[]; regionCounts: StatItem[]; sourceCounts: StatItem[]; }
interface FundingCategory { id: number; name: string; }
interface SourceRule { id: string; name: string; }

type Order = 'asc' | 'desc';
type SortableKeys = 'title' | 'source_name' | 'region' | 'deadline_end' | 'created_at';

const formatTimestamp = (timestamp: string | null): string => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleDateString('de-AT');
};

const AdminFundingPage: React.FC = () => {
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const [opportunities, setOpportunities] = useState<FundingOpportunity[]>([]);
    const [allCategories, setAllCategories] = useState<FundingCategory[]>([]);
    const [allRegions, setAllRegions] = useState<string[]>([]);
    const [sourceRules, setSourceRules] = useState<SourceRule[]>([]);
    const [stats, setStats] = useState<FundingStats>({ categoryCounts: [], regionCounts: [], sourceCounts: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState(location.state?.prefillSearch || '');
    const [sourceFilter, setSourceFilter] = useState(searchParams.get('sourceRuleId') || '');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [snackbar, setSnackbar] = useState<{ open: boolean, message: string }>({ open: false, message: '' });
    const [order, setOrder] = useState<Order>('desc');
    const [orderBy, setOrderBy] = useState<SortableKeys>('created_at');
    const [editingOpp, setEditingOpp] = useState<FundingOpportunity | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selected, setSelected] = useState<string[]>([]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const [oppsRes, catsRes, regionsRes, sourcesRes, statsRes] = await Promise.all([
                apiClient.get('/api/admin/funding', { 
                    headers: { 'x-auth-token': token },
                    params: { q: searchTerm, orderBy, order, sourceRuleId: sourceFilter, categoryId: categoryFilter }
                }),
                apiClient.get('/api/admin/funding/categories', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/funding/regions', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/funding/source-rules', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/funding/stats', { headers: { 'x-auth-token': token } })
            ]);
            setOpportunities(oppsRes.data);
            setAllCategories(catsRes.data);
            setAllRegions(regionsRes.data);
            setSourceRules(sourcesRes.data);
            setStats(statsRes.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Daten.');
        } finally {
            setLoading(false);
        }
    }, [searchTerm, order, orderBy, sourceFilter, categoryFilter]);

    useEffect(() => {
        const timer = setTimeout(() => { fetchData(); }, 500);
        return () => clearTimeout(timer);
    }, [fetchData]);

    const handleSortRequest = (property: SortableKeys) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const handleOpenEdit = (opp: FundingOpportunity) => {
        setEditingOpp(opp);
        setIsEditModalOpen(true);
    };

    const handleCloseEdit = () => {
        setIsEditModalOpen(false);
        setEditingOpp(null);
    };

    const handleSaveChanges = async () => {
        if (!editingOpp) return;
        try {
            const token = localStorage.getItem('jwt_token');
            const selectedCategories = allCategories.filter(cat => editingOpp.categories?.includes(cat.name));
            const payload = {
                title: editingOpp.title,
                deadline_end: editingOpp.deadline_end,
                status: editingOpp.status,
                region: editingOpp.region,
                category_ids: selectedCategories.map(c => c.id)
            };
            await apiClient.put(`/api/admin/funding/${editingOpp.id}`, payload, { headers: { 'x-auth-token': token } });
            setSnackbar({ open: true, message: 'Änderungen gespeichert.' });
            handleCloseEdit();
            fetchData();
        } catch (err: any) {
             setSnackbar({ open: true, message: 'Fehler beim Speichern.' });
        }
    };
    
    const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.checked) {
            const newSelecteds = opportunities.map((n) => n.id);
            setSelected(newSelecteds);
            return;
        }
        setSelected([]);
    };
    
    const handleSelectClick = (id: string) => {
        const selectedIndex = selected.indexOf(id);
        let newSelected: string[] = [];
        if (selectedIndex === -1) { newSelected = newSelected.concat(selected, id); }
        else if (selectedIndex === 0) { newSelected = newSelected.concat(selected.slice(1)); } 
        else if (selectedIndex === selected.length - 1) { newSelected = newSelected.concat(selected.slice(0, -1)); } 
        else if (selectedIndex > 0) { newSelected = newSelected.concat(selected.slice(0, selectedIndex), selected.slice(selectedIndex + 1)); }
        setSelected(newSelected);
    };

    const isSelected = (id: string) => selected.indexOf(id) !== -1;

    const handleDelete = async (id: string) => {
        if (!window.confirm('Sind Sie sicher, dass Sie diese Förderung löschen möchten?')) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.delete(`/api/admin/funding/${id}`, { headers: { 'x-auth-token': token } });
            setSnackbar({ open: true, message: 'Förderung gelöscht.' });
            fetchData();
        } catch (err: any) {
            setSnackbar({ open: true, message: 'Fehler beim Löschen.' });
        }
    };

    const handleBulkDelete = async () => {
        if (!window.confirm(`Sind Sie sicher, dass Sie ${selected.length} Förderungen löschen möchten?`)) return;
        try {
            const token = localStorage.getItem('jwt_token');
            
            // @ts-ignore - Wir ignorieren diesen Typ-Fehler, da die Syntax für Axios korrekt ist.
            await apiClient.delete('/api/admin/funding', { 
                headers: { 'x-auth-token': token },
                data: { ids: selected } 
            });

            setSnackbar({ open: true, message: `${selected.length} Förderungen gelöscht.` });
            setSelected([]);
            fetchData();
        } catch (err: any) {
            setSnackbar({ open: true, message: 'Fehler beim Löschen.' });
        }
    };
    
    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                    <Box>
                        <Typography variant="h4" component="h1">Förderungen verwalten ({opportunities.length})</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button component={RouterLink} to="/admin/scraping-rules" startIcon={<SettingsIcon />} variant="outlined">Regeln verwalten</Button>
                        {selected.length > 0 && (
                            <Button color="error" variant="contained" startIcon={<DeleteIcon />} onClick={handleBulkDelete}>
                                {selected.length} löschen
                            </Button>
                        )}
                    </Box>
                </Box>
                
                <Paper>
                    <Box sx={{ p: 2 }}>
                        <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} sm={4}><TextField fullWidth variant="outlined" size="small" placeholder="Titel suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) }}/></Grid>
                            <Grid item xs={12} sm={4}>
                                <TextField fullWidth select size="small" label="Quelle" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
                                    <MenuItem value=""><em>Alle Quellen</em></MenuItem>
                                    {sourceRules.map(rule => {
                                        const count = stats.sourceCounts.find(s => s.name === rule.name)?.count || 0;
                                        return <MenuItem key={rule.id} value={rule.id}>{rule.name} ({count})</MenuItem>
                                    })}
                                </TextField>
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <TextField fullWidth select size="small" label="Kategorie" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                                     <MenuItem value=""><em>Alle Kategorien</em></MenuItem>
                                     {allCategories.map(cat => {
                                         const count = stats.categoryCounts.find(c => c.name === cat.name)?.count || 0;
                                         return <MenuItem key={cat.id} value={cat.id}>{cat.name} ({count})</MenuItem>
                                     })}
                                </TextField>
                            </Grid>
                        </Grid>
                    </Box>
                    
                    {loading ? <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box> : error ? <Alert severity="error">{error}</Alert> : (
                        <TableContainer>
                            <Table stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell padding="checkbox"><Checkbox indeterminate={selected.length > 0 && selected.length < opportunities.length} checked={opportunities.length > 0 && selected.length === opportunities.length} onChange={handleSelectAllClick} /></TableCell>
                                        <TableCell sortDirection={orderBy === 'title' ? order : false}><TableSortLabel active={orderBy === 'title'} direction={order} onClick={() => handleSortRequest('title')}>Titel</TableSortLabel></TableCell>
                                        <TableCell sortDirection={orderBy === 'source_name' ? order : false}><TableSortLabel active={orderBy === 'source_name'} direction={order} onClick={() => handleSortRequest('source_name')}>Quelle</TableSortLabel></TableCell>
                                        <TableCell sortDirection={orderBy === 'region' ? order : false}><TableSortLabel active={orderBy === 'region'} direction={order} onClick={() => handleSortRequest('region')}>Region</TableSortLabel></TableCell>
                                        <TableCell sortDirection={orderBy === 'deadline_end' ? order : false}><TableSortLabel active={orderBy === 'deadline_end'} direction={order} onClick={() => handleSortRequest('deadline_end')}>Einreichfrist</TableSortLabel></TableCell>
                                        <TableCell sortDirection={orderBy === 'created_at' ? order : false}><TableSortLabel active={orderBy === 'created_at'} direction={order} onClick={() => handleSortRequest('created_at')}>Erstellt am</TableSortLabel></TableCell>
                                        <TableCell>Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {opportunities.map(opp => {
                                        const isItemSelected = isSelected(opp.id);
                                        return (
                                            <TableRow key={opp.id} hover role="checkbox" aria-checked={isItemSelected} selected={isItemSelected} onClick={() => handleSelectClick(opp.id)}>
                                                <TableCell padding="checkbox"><Checkbox checked={isItemSelected} /></TableCell>
                                                <TableCell sx={{ fontWeight: 'bold' }}>
                                                    <MuiLink component={RouterLink} to={`/funding-detail/${opp.id}`} underline="hover" onClick={(e) => e.stopPropagation()}>{opp.title}</MuiLink>
                                                </TableCell>
                                                <TableCell>{opp.source_name}</TableCell>
                                                <TableCell>{opp.region || '-'}</TableCell>
                                                <TableCell>{formatTimestamp(opp.deadline_end)}</TableCell>
                                                <TableCell>{formatTimestamp(opp.created_at)}</TableCell>
                                                <TableCell>
                                                    <Tooltip title="Daten bearbeiten"><IconButton onClick={(e) => { e.stopPropagation(); handleOpenEdit(opp); }}><EditIcon /></IconButton></Tooltip>
                                                    <Tooltip title="Original-Quelle öffnen"><IconButton component="a" href={opp.original_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}><OpenInNewIcon /></IconButton></Tooltip>
                                                    <Tooltip title="Löschen"><IconButton onClick={(e) => { e.stopPropagation(); handleDelete(opp.id); }}><DeleteIcon color="error" /></IconButton></Tooltip>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Paper>

                <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} message={snackbar.message} />
                
                <Dialog open={isEditModalOpen} onClose={handleCloseEdit} fullWidth maxWidth="sm">
                    <DialogTitle>Förderung bearbeiten</DialogTitle>
                    <DialogContent>
                        {editingOpp && (
                            <Box component="form" sx={{ pt: 1 }}>
                                <TextField margin="dense" label="Titel" fullWidth value={editingOpp.title} onChange={(e) => setEditingOpp({...editingOpp, title: e.target.value })} />
                                <Autocomplete multiple options={allCategories.map(c => c.name)} value={editingOpp.categories || []}
                                    onChange={(_event, newValue) => setEditingOpp({...editingOpp, categories: newValue })}
                                    renderTags={(value, getTagProps) => value.map((option, index) => (<Chip variant="outlined" label={option} {...getTagProps({ index })} />))}
                                    renderInput={(params) => (<TextField {...params} margin="dense" label="Kategorien" />)}
                                />
                                <TextField select margin="dense" label="Region" fullWidth value={editingOpp.region || ''} onChange={(e) => setEditingOpp({...editingOpp, region: e.target.value })}>
                                    <MenuItem value=""><em>Keine Region</em></MenuItem>
                                    {allRegions.map((regionName) => (<MenuItem key={regionName} value={regionName}>{regionName}</MenuItem>))}
                                </TextField>
                                <TextField margin="dense" label="Einreichfrist" type="date" fullWidth value={editingOpp.deadline_end ? editingOpp.deadline_end.split('T')[0] : ''}
                                    onChange={(e) => setEditingOpp({...editingOpp, deadline_end: e.target.value })} InputLabelProps={{ shrink: true }} />
                                <TextField select margin="dense" label="Status" fullWidth value={editingOpp.status} onChange={(e) => setEditingOpp({...editingOpp, status: e.target.value as 'active' | 'expired' })}>
                                    <MenuItem value="active">Aktiv</MenuItem>
                                    <MenuItem value="expired">Abgelaufen</MenuItem>
                                </TextField>
                            </Box>
                        )}
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseEdit}>Abbrechen</Button>
                        <Button onClick={handleSaveChanges} variant="contained">Speichern</Button>
                    </DialogActions>
                </Dialog>
            </Container>
        </DashboardLayout>
    );
};

export default AdminFundingPage;