import React, { useState, useEffect, useMemo } from 'react';
import { 
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell, 
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, 
    TextField, MenuItem, Switch, FormControlLabel, Chip, Grid, TableSortLabel, InputAdornment 
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

// --- Interfaces ---
interface WidgetType {
    id: string;
    name: string;
    type_key: string;
    description: string | null;
    icon_name: string | null;
    is_removable: boolean;
    is_resizable: boolean;
    is_draggable: boolean;
    default_width: number;
    default_height: number;
    default_min_width: number;
    default_min_height: number;
    allowed_roles: string[] | null;
    config: object | null;
    component_key: string | null;
}

interface RoleOption {
    name: string;
    description: string;
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

const AdminWidgetTypesPage: React.FC = () => {
    const [widgetTypes, setWidgetTypes] = useState<WidgetType[]>([]);
    const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dialogError, setDialogError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingWt, setEditingWt] = useState<WidgetType | null>(null);

    // Form states
    const [formName, setFormName] = useState('');
    const [formTypeKey, setFormTypeKey] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formIconName, setFormIconName] = useState('');
    const [formIsRemovable, setFormIsRemovable] = useState(true);
    const [formIsResizable, setFormIsResizable] = useState(true);
    const [formIsDraggable, setFormIsDraggable] = useState(true);
    const [formDefaultWidth, setFormDefaultWidth] = useState(4);
    const [formDefaultHeight, setFormDefaultHeight] = useState(6);
    const [formDefaultMinWidth, setFormDefaultMinWidth] = useState(3);
    const [formDefaultMinHeight, setFormDefaultMinHeight] = useState(4);
    const [formAllowedRoles, setFormAllowedRoles] = useState<string[]>([]);
    const [formComponentKey, setFormComponentKey] = useState('');
    const [formConfig, setFormConfig] = useState('');

    // States für Suche und Sortierung
    const [searchTerm, setSearchTerm] = useState('');
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<keyof WidgetType>('name');

    const fetchInitialData = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const [widgetRes, rolesRes] = await Promise.all([
                apiClient.get('/api/admin/widget-types', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/roles', { headers: { 'x-auth-token': token } })
            ]);
            setWidgetTypes(widgetRes.data);
            setRoleOptions(rolesRes.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Daten.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInitialData();
    }, []);

    const handleOpenAddDialog = () => {
        setEditingWt(null);
        setFormName('');
        setFormTypeKey('');
        setFormDescription('');
        setFormIconName('');
        setFormIsRemovable(true);
        setFormIsResizable(true);
        setFormIsDraggable(true);
        setFormDefaultWidth(4);
        setFormDefaultHeight(6);
        setFormDefaultMinWidth(3);
        setFormDefaultMinHeight(4);
        setFormAllowedRoles([]);
        setFormComponentKey('');
        setFormConfig('');
        setOpenDialog(true);
    };

    const handleOpenEditDialog = (wt: WidgetType) => {
        setEditingWt(wt);
        setFormName(wt.name);
        setFormTypeKey(wt.type_key);
        setFormDescription(wt.description || '');
        setFormIconName(wt.icon_name || '');
        setFormIsRemovable(wt.is_removable);
        setFormIsResizable(wt.is_resizable);
        setFormIsDraggable(wt.is_draggable);
        setFormDefaultWidth(wt.default_width);
        setFormDefaultHeight(wt.default_height);
        setFormDefaultMinWidth(wt.default_min_width);
        setFormDefaultMinHeight(wt.default_min_height);
        setFormAllowedRoles(wt.allowed_roles || []);
        setFormComponentKey(wt.component_key || '');
        setFormConfig(wt.config ? JSON.stringify(wt.config, null, 2) : '');
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingWt(null);
        setDialogError(null);
    };

    const handleSubmit = async () => {
        setDialogError(null);
        let configObject = null;
        if (formConfig) {
            try {
                configObject = JSON.parse(formConfig);
            } catch (e) {
                setDialogError('Das "Config"-Feld enthält ungültiges JSON.');
                return;
            }
        }

        const token = localStorage.getItem('jwt_token');
        const wtData = {
            name: formName,
            type_key: formTypeKey,
            description: formDescription || null,
            icon_name: formIconName || null,
            is_removable: formIsRemovable,
            is_resizable: formIsResizable,
            is_draggable: formIsDraggable,
            default_width: formDefaultWidth,
            default_height: formDefaultHeight,
            default_min_width: formDefaultMinWidth,
            default_min_height: formDefaultMinHeight,
            allowed_roles: formAllowedRoles.length > 0 ? formAllowedRoles : null,
            component_key: formComponentKey || null,
            config: configObject,
        };

        try {
            if (editingWt) {
                await apiClient.put(`/api/admin/widget-types/${editingWt.id}`, wtData, { headers: { 'x-auth-token': token } });
            } else {
                await apiClient.post('/api/admin/widget-types', wtData, { headers: { 'x-auth-token': token } });
            }
            handleCloseDialog();
            fetchInitialData();
        } catch (err: any) {
            setDialogError(err.response?.data?.message || 'Fehler beim Speichern.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Sind Sie sicher?')) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.delete(`/api/admin/widget-types/${id}`, { headers: { 'x-auth-token': token } });
            fetchInitialData();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler beim Löschen.');
        }
    };

    const handleSortRequest = (property: keyof WidgetType) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const sortedAndFilteredTypes = useMemo(() => {
        let filtered = [...widgetTypes];
        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            filtered = widgetTypes.filter(wt =>
                wt.name.toLowerCase().includes(lowercasedFilter) ||
                wt.type_key.toLowerCase().includes(lowercasedFilter) ||
                (wt.description?.toLowerCase() || '').includes(lowercasedFilter) ||
                (wt.component_key?.toLowerCase() || '').includes(lowercasedFilter)
            );
        }
        return filtered.sort(getComparator(order, orderBy));
    }, [widgetTypes, searchTerm, order, orderBy]);

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                    <Typography variant="h4" component="h1">Widget-Typen ({sortedAndFilteredTypes.length})</Typography>
                     <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <TextField variant="outlined" size="small" placeholder="Suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) }}/>
                        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAddDialog}>Hinzufügen</Button>
                    </Box>
                </Box>

                {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box> 
                : error ? <Alert severity="error">{error}</Alert> 
                : (
                    <Paper>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sortDirection={orderBy === 'name' ? order : false}><TableSortLabel active={orderBy === 'name'} direction={order} onClick={() => handleSortRequest('name')}>Name</TableSortLabel></TableCell>
                                        <TableCell sortDirection={orderBy === 'type_key' ? order : false}><TableSortLabel active={orderBy === 'type_key'} direction={order} onClick={() => handleSortRequest('type_key')}>Type Key</TableSortLabel></TableCell>
                                        <TableCell sortDirection={orderBy === 'component_key' ? order : false}><TableSortLabel active={orderBy === 'component_key'} direction={order} onClick={() => handleSortRequest('component_key')}>Component Key</TableSortLabel></TableCell>
                                        <TableCell>Beschreibung</TableCell>
                                        <TableCell>Config</TableCell>
                                        <TableCell>Rollen</TableCell>
                                        <TableCell>Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortedAndFilteredTypes.map((wt) => (
                                        <TableRow key={wt.id} hover>
                                            <TableCell sx={{ fontWeight: 'bold' }}>{wt.name}</TableCell>
                                            <TableCell><code>{wt.type_key}</code></TableCell>
                                            <TableCell><code>{wt.component_key || '-'}</code></TableCell>
                                            <TableCell sx={{ maxWidth: 250 }}>{wt.description || '-'}</TableCell>
                                            <TableCell>
                                                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, fontSize: '0.75rem', backgroundColor: '#f5f5f5', padding: '4px', borderRadius: '4px' }}>
                                                    {wt.config ? JSON.stringify(wt.config, null, 2) : '-'}
                                                </pre>
                                            </TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                    {(wt.allowed_roles || []).map((role) => (<Chip key={role} label={role} size="small" />))}
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <IconButton color="primary" onClick={() => handleOpenEditDialog(wt)}><EditIcon /></IconButton>
                                                <IconButton color="error" onClick={() => handleDelete(wt.id)}><DeleteIcon /></IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                )}

                <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md">
                    <DialogTitle>{editingWt ? 'Widget-Typ bearbeiten' : 'Neuen Widget-Typ hinzufügen'}</DialogTitle>
                    <DialogContent>
                        {dialogError && <Alert severity="error" sx={{ mb: 2 }}>{dialogError}</Alert>}
                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={6}><TextField margin="dense" label="Name" fullWidth value={formName} onChange={(e) => setFormName(e.target.value)} /></Grid>
                            <Grid item xs={12} sm={6}><TextField margin="dense" label="Type Key (Eindeutig)" fullWidth value={formTypeKey} onChange={(e) => setFormTypeKey(e.target.value)} disabled={!!editingWt} /></Grid>
                            <Grid item xs={12}><TextField margin="dense" label="Beschreibung" fullWidth multiline rows={2} value={formDescription} onChange={(e) => setFormDescription(e.target.value)} /></Grid>
                            <Grid item xs={12} sm={6}><TextField margin="dense" label="Icon Name (Material-UI)" fullWidth value={formIconName} onChange={(e) => setFormIconName(e.target.value)} /></Grid>
                            <Grid item xs={12} sm={6}><TextField margin="dense" label="Component Key (z.B. GenericAI)" fullWidth value={formComponentKey} onChange={(e) => setFormComponentKey(e.target.value)} /></Grid>
                            <Grid item xs={12}><TextField margin="dense" label="Config (als JSON)" fullWidth multiline rows={4} value={formConfig} onChange={(e) => setFormConfig(e.target.value)} placeholder='{ "title": "Mein Titel", "category": "meine_kategorie" }' /></Grid>
                            <Grid item xs={6} md={3}><TextField margin="dense" label="Standardbreite" type="number" fullWidth value={formDefaultWidth} onChange={(e) => setFormDefaultWidth(parseInt(e.target.value))} /></Grid>
                            <Grid item xs={6} md={3}><TextField margin="dense" label="Standardhöhe" type="number" fullWidth value={formDefaultHeight} onChange={(e) => setFormDefaultHeight(parseInt(e.target.value))} /></Grid>
                            <Grid item xs={6} md={3}><TextField margin="dense" label="Min. Breite" type="number" fullWidth value={formDefaultMinWidth} onChange={(e) => setFormDefaultMinWidth(parseInt(e.target.value))} /></Grid>
                            <Grid item xs={6} md={3}><TextField margin="dense" label="Min. Höhe" type="number" fullWidth value={formDefaultMinHeight} onChange={(e) => setFormDefaultMinHeight(parseInt(e.target.value))} /></Grid>
                            <Grid item xs={4}><FormControlLabel control={<Switch checked={formIsRemovable} onChange={(e) => setFormIsRemovable(e.target.checked)} />} label="Entfernbar" /></Grid>
                            <Grid item xs={4}><FormControlLabel control={<Switch checked={formIsResizable} onChange={(e) => setFormIsResizable(e.target.checked)} />} label="Größe änderbar" /></Grid>
                            <Grid item xs={4}><FormControlLabel control={<Switch checked={formIsDraggable} onChange={(e) => setFormIsDraggable(e.target.checked)} />} label="Verschiebbar" /></Grid>
                            <Grid item xs={12}>
                                <TextField select margin="dense" label="Erlaubte Rollen" fullWidth SelectProps={{ multiple: true, renderValue: (selected) => (<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{(selected as string[]).map(role => <Chip key={role} label={role} size="small" />)}</Box>) }} value={formAllowedRoles} onChange={(e) => setFormAllowedRoles(e.target.value as unknown as string[])}>
                                    {roleOptions.map((role) => (<MenuItem key={role.name} value={role.name} title={role.description}>{role.name}</MenuItem>))}
                                </TextField>
                            </Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseDialog}>Abbrechen</Button>
                        <Button onClick={handleSubmit} disabled={loading}>{editingWt ? 'Speichern' : 'Hinzufügen'}</Button>
                    </DialogActions>
                </Dialog>
            </Container>
        </DashboardLayout>
    );
};

export default AdminWidgetTypesPage;
