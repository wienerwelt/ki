import React, { useState, useEffect, useMemo } from 'react';
import { 
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell, 
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, 
    TextField, MenuItem, Switch, FormControlLabel, Tooltip, Chip, Grid, TableSortLabel, InputAdornment,
    List, ListItem, ListItemAvatar, ListItemText, Avatar
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import BusinessIcon from '@mui/icons-material/Business';
import PersonIcon from '@mui/icons-material/Person';
import ScienceIcon from '@mui/icons-material/Science';
import CloseIcon from '@mui/icons-material/Close';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { WIDGET_COMPONENTS } from '../components/widgetMapping'; 
import { getIcon, ICON_MAP } from '../components/iconMapping';
import { BusinessPartner } from '../types/dashboard.types';

// --- Interfaces & Hilfskomponenten ---
interface WidgetType {
    id: string; name: string; type_key: string; description: string | null; icon_name: string | null; is_removable: boolean; is_resizable: boolean; is_draggable: boolean; default_width: number; default_height: number; default_min_width: number; default_min_height: number; allowed_roles: string[] | null; config: any; component_key: string | null; business_partner_install_count: number; user_install_count: number;
}
interface RoleOption { name: string; description: string; }
interface InstallData { id: string; name: string; detail?: string; }

type Order = 'asc' | 'desc';
function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
    if (orderBy === 'user_install_count' || orderBy === 'business_partner_install_count') {
        return Number(b[orderBy]) - Number(a[orderBy]);
    }
    const valA = a[orderBy] ?? ''; const valB = b[orderBy] ?? '';
    if (valB < valA) return -1; if (valB > valA) return 1; return 0;
}
function getComparator<Key extends keyof any>(order: Order, orderBy: Key): (a: { [key in Key]: any }, b: { [key in Key]: any }) => number {
    return order === 'desc' ? (a, b) => descendingComparator(a, b, orderBy) : (a, b) => -descendingComparator(a, b, orderBy);
}

const ResponsiveGridLayout = WidthProvider(Responsive);

const dummyBusinessPartner: BusinessPartner = {
    id: 'preview-bp-id', name: 'Vorschau Partner GmbH', dashboard_title: 'Partner Dashboard Vorschau', logo_url: 'https://placehold.co/90x60/6c63ff/FFF?text=Logo', primary_color: '#6c63ff', secondary_color: '#5249d9', regions: [{ id: 'at', name: 'Österreich', code: 'AT', is_default: true }]
};

const AdminWidgetTypesPage: React.FC = () => {
    // --- States ---
    const [widgetTypes, setWidgetTypes] = useState<WidgetType[]>([]);
    const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dialogError, setDialogError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingWt, setEditingWt] = useState<WidgetType | null>(null);
    
    // Form States
    const [formName, setFormName] = useState(''); const [formTypeKey, setFormTypeKey] = useState(''); const [formDescription, setFormDescription] = useState(''); const [formIconName, setFormIconName] = useState(''); const [formIsRemovable, setFormIsRemovable] = useState(true); const [formIsResizable, setFormIsResizable] = useState(true); const [formIsDraggable, setFormIsDraggable] = useState(true); const [formDefaultWidth, setFormDefaultWidth] = useState(4); const [formDefaultHeight, setFormDefaultHeight] = useState(6); const [formDefaultMinWidth, setFormDefaultMinWidth] = useState(3); const [formDefaultMinHeight, setFormDefaultMinHeight] = useState(4); const [formAllowedRoles, setFormAllowedRoles] = useState<string[]>([]); const [formComponentKey, setFormComponentKey] = useState(''); const [formConfig, setFormConfig] = useState('');
    
    const [searchTerm, setSearchTerm] = useState(''); const [order, setOrder] = useState<Order>('asc'); const [orderBy, setOrderBy] = useState<keyof WidgetType>('name');
    
    // Test Layout States
    const [testWidget, setTestWidget] = useState<WidgetType | null>(null);
    const [testLayout, setTestLayout] = useState<Layout>({ i: 'test', w: 6, h: 8, x: 0, y: 0 });

    // NEU: States für Installations-Details
    const [installModal, setInstallModal] = useState<{ open: boolean; widget: WidgetType | null; type: 'bp' | 'user' }>({ open: false, widget: null, type: 'bp' });
    const [installData, setInstallData] = useState<InstallData[]>([]);
    const [installLoading, setInstallLoading] = useState(false);

    const fetchInitialData = async () => {
        setLoading(true); 
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const [widgetRes, rolesRes] = await Promise.all([
                apiClient.get('/api/admin/widget-types', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/roles', { headers: { 'x-auth-token': token } })
            ]);
            setWidgetTypes(Array.isArray(widgetRes.data) ? widgetRes.data : []);
            setRoleOptions(Array.isArray(rolesRes.data) ? rolesRes.data : []);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Daten.');
            setWidgetTypes([]); setRoleOptions([]);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { fetchInitialData(); }, []);

const handleOpenInstallDetails = async (wt: WidgetType, type: 'bp' | 'user') => {
        if (type === 'bp' && wt.business_partner_install_count === 0) return;
        if (type === 'user' && wt.user_install_count === 0) return;

        setInstallModal({ open: true, widget: wt, type });
        setInstallLoading(true);
        setInstallData([]);

        try {
            // Echter API Call an das Backend!
            const token = localStorage.getItem('jwt_token');
            const res = await apiClient.get(`/api/admin/widget-types/${wt.id}/installations?type=${type}`, { 
                headers: { 'x-auth-token': token } 
            });
            setInstallData(res.data);
        } catch (err) {
            console.error("Fehler beim Laden der Installationsdaten", err);
        } finally {
            setInstallLoading(false);
        }
    };

    const handleCloseInstallDetails = () => setInstallModal({ ...installModal, open: false });

    const handleOpenAddDialog = () => {
        setEditingWt(null); setFormName(''); setFormTypeKey(''); setFormDescription(''); setFormIconName(''); setFormIsRemovable(true); setFormIsResizable(true); setFormIsDraggable(true); setFormDefaultWidth(4); setFormDefaultHeight(6); setFormDefaultMinWidth(3); setFormDefaultMinHeight(4); setFormAllowedRoles([]); setFormComponentKey(''); setFormConfig(''); setOpenDialog(true);
    };
    const handleOpenEditDialog = (wt: WidgetType) => {
        setEditingWt(wt); setFormName(wt.name); setFormTypeKey(wt.type_key); setFormDescription(wt.description || ''); setFormIconName(wt.icon_name || ''); setFormIsRemovable(wt.is_removable); setFormIsResizable(wt.is_resizable); setFormIsDraggable(wt.is_draggable); setFormDefaultWidth(wt.default_width); setFormDefaultHeight(wt.default_height); setFormDefaultMinWidth(wt.default_min_width); setFormDefaultMinHeight(wt.default_min_height); setFormAllowedRoles(wt.allowed_roles || []); setFormComponentKey(wt.component_key || ''); setFormConfig(wt.config ? JSON.stringify(wt.config, null, 2) : ''); setOpenDialog(true);
    };
    const handleCloseDialog = () => { setOpenDialog(false); setEditingWt(null); setDialogError(null); };
    
    const handleSubmit = async () => {
        setDialogError(null); let configObject = null; if (formConfig && formConfig.trim() !== '') { try { configObject = JSON.parse(formConfig); } catch (e) { setDialogError('Das "Config"-Feld enthält ungültiges JSON.'); return; } }
        const token = localStorage.getItem('jwt_token'); const wtData = { name: formName, type_key: formTypeKey, description: formDescription || null, icon_name: formIconName || null, is_removable: formIsRemovable, is_resizable: formIsResizable, is_draggable: formIsDraggable, default_width: formDefaultWidth, default_height: formDefaultHeight, default_min_width: formDefaultMinWidth, default_min_height: formDefaultMinHeight, allowed_roles: formAllowedRoles.length > 0 ? formAllowedRoles : null, component_key: formComponentKey || null, config: configObject, };
        try { if (editingWt) { await apiClient.put(`/api/admin/widget-types/${editingWt.id}`, wtData, { headers: { 'x-auth-token': token } }); } else { await apiClient.post('/api/admin/widget-types', wtData, { headers: { 'x-auth-token': token } }); } handleCloseDialog(); fetchInitialData(); } catch (err: any) { setDialogError(err.response?.data?.message || 'Fehler beim Speichern.'); }
    };
    
    const handleDelete = async (id: string) => { if (!window.confirm('Sind Sie sicher?')) return; try { const token = localStorage.getItem('jwt_token'); await apiClient.delete(`/api/admin/widget-types/${id}`, { headers: { 'x-auth-token': token } }); fetchInitialData(); } catch (err: any) { alert(err.response?.data?.message || 'Fehler beim Löschen.'); } };
    const handleCopy = async (wt: WidgetType) => {
        if (!window.confirm(`Widget-Typ "${wt.name}" kopieren? Zugriffsrechte und bestehende Installationen werden nicht mitkopiert.`)) return;
        try {
            const token = localStorage.getItem('jwt_token');
            const res = await apiClient.post(`/api/admin/widget-types/${wt.id}/copy`, {}, { headers: { 'x-auth-token': token } });
            const copiedWidget: WidgetType = {
                ...res.data,
                business_partner_install_count: res.data.business_partner_install_count ?? 0,
                user_install_count: res.data.user_install_count ?? 0,
            };
            await fetchInitialData();
            handleOpenEditDialog(copiedWidget);
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler beim Kopieren.');
        }
    };
    const handleSortRequest = (property: keyof WidgetType) => { const isAsc = orderBy === property && order === 'asc'; setOrder(isAsc ? 'desc' : 'asc'); setOrderBy(property); };
    
    const sortedAndFilteredTypes = useMemo(() => {
        let filtered = [...widgetTypes]; if (searchTerm) { const lowercasedFilter = searchTerm.toLowerCase(); filtered = widgetTypes.filter(wt => wt.name.toLowerCase().includes(lowercasedFilter) || wt.type_key.toLowerCase().includes(lowercasedFilter) || (wt.description?.toLowerCase() || '').includes(lowercasedFilter) || (wt.component_key?.toLowerCase() || '').includes(lowercasedFilter)); } return filtered.sort(getComparator(order, orderBy));
    }, [widgetTypes, searchTerm, order, orderBy]);

    const handleOpenTestModal = (wt: WidgetType) => {
        setTestWidget(wt);
        setTestLayout({ i: 'test-widget', x: 0, y: 0, w: wt.default_width, h: wt.default_height });
    };
    const handleCloseTestModal = () => setTestWidget(null);
    const handleTestLayoutChange = (layout: Layout[]) => { if (layout[0]) { setTestLayout(layout[0]); } };
    
    const WidgetToTest = testWidget?.type_key ? WIDGET_COMPONENTS[testWidget.type_key] : null;

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h4" component="h1">Widget-Typen ({sortedAndFilteredTypes.length})</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <TextField variant="outlined" size="small" placeholder="Suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) }}/>
                        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAddDialog}>Hinzufügen</Button>
                    </Box>
                </Box>
                
                {loading ? <CircularProgress /> : error ? <Alert severity="error">{error}</Alert> : (
                    <Paper><TableContainer><Table>
                        <TableHead><TableRow>
                            <TableCell>Icon</TableCell>
                            <TableCell sortDirection={orderBy === 'name' ? order : false}><TableSortLabel active={orderBy === 'name'} direction={orderBy === 'name' ? order : 'asc'} onClick={() => handleSortRequest('name')}>Name / Type Key</TableSortLabel></TableCell>
                            <TableCell sortDirection={orderBy === 'component_key' ? order : false}><TableSortLabel active={orderBy === 'component_key'} direction={orderBy === 'component_key' ? order : 'asc'} onClick={() => handleSortRequest('component_key')}>Component Key</TableSortLabel></TableCell>
                            <TableCell>Dimensionen (B/H)</TableCell>
                            <TableCell align="center" sortDirection={orderBy === 'user_install_count' ? order : false}><TableSortLabel active={orderBy === 'user_install_count'} direction={orderBy === 'user_install_count' ? order : 'asc'} onClick={() => handleSortRequest('user_install_count')}>Installationen</TableSortLabel></TableCell>
                            <TableCell>Rollen</TableCell>
                            <TableCell>Aktionen</TableCell>
                        </TableRow></TableHead>
                        <TableBody>{sortedAndFilteredTypes.map((wt) => {
                            const IconComponent = getIcon(wt.icon_name);
                            return (
                                <TableRow key={wt.id} hover>
                                    <TableCell><IconComponent /></TableCell>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{wt.name}</Typography>
                                        <Typography variant="caption" color="text.secondary" component="code">{wt.type_key}</Typography>
                                    </TableCell>
                                    <TableCell><code>{wt.component_key || '-'}</code></TableCell>
                                    <TableCell>
                                        <Typography variant="body2" component="div">Default: <strong>{wt.default_width} / {wt.default_height}</strong></Typography>
                                        <Typography variant="caption" color="text.secondary" component="div">Min: {wt.default_min_width} / {wt.default_min_height}</Typography>
                                    </TableCell>
                                    
                                    {/* NEU: Klickbare Installation Chips */}
                                    <TableCell align="center">
                                        <Tooltip title={wt.business_partner_install_count > 0 ? "Partner-Installationen ansehen" : "Keine Partner-Installationen"}>
                                            <Chip 
                                                icon={<BusinessIcon fontSize="small" />} 
                                                label={wt.business_partner_install_count} 
                                                size="small" 
                                                sx={{ mr: 0.5, mb: 0.5, cursor: wt.business_partner_install_count > 0 ? 'pointer' : 'default' }} 
                                                color={wt.business_partner_install_count > 0 ? "primary" : "default"}
                                                variant="outlined" 
                                                onClick={() => handleOpenInstallDetails(wt, 'bp')}
                                            />
                                        </Tooltip>
                                        <Tooltip title={wt.user_install_count > 0 ? "Nutzer-Installationen ansehen" : "Keine Nutzer-Installationen"}>
                                            <Chip 
                                                icon={<PersonIcon fontSize="small" />} 
                                                label={wt.user_install_count} 
                                                size="small" 
                                                sx={{ mb: 0.5, cursor: wt.user_install_count > 0 ? 'pointer' : 'default' }} 
                                                color={wt.user_install_count > 0 ? "secondary" : "default"}
                                                variant="outlined" 
                                                onClick={() => handleOpenInstallDetails(wt, 'user')}
                                            />
                                        </Tooltip>
                                    </TableCell>

                                    <TableCell>
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxWidth: 180 }}>
                                            {(wt.allowed_roles || []).map((role) => (<Chip key={role} label={role} size="small" />))}
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Tooltip title="Bearbeiten"><IconButton size="small" color="primary" onClick={() => handleOpenEditDialog(wt)}><EditIcon /></IconButton></Tooltip>
                                        <Tooltip title="Kopieren"><IconButton size="small" onClick={() => handleCopy(wt)}><ContentCopyIcon /></IconButton></Tooltip>
                                        <Tooltip title="Widget Test">
                                            <span>
                                                <IconButton size="small" color="secondary" onClick={() => handleOpenTestModal(wt)} disabled={!wt.type_key || !WIDGET_COMPONENTS[wt.type_key]}>
                                                    <ScienceIcon />
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                        <Tooltip title="Löschen"><IconButton size="small" color="error" onClick={() => handleDelete(wt.id)}><DeleteIcon /></IconButton></Tooltip>
                                    </TableCell>
                                </TableRow>
                            );
                        })}</TableBody>
                    </Table></TableContainer></Paper>
                )}
                
                {/* --- Dialog: Formular --- */}
                <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md">
                    <DialogTitle>{editingWt ? 'Widget-Typ bearbeiten' : 'Neuen Widget-Typ hinzufügen'}</DialogTitle>
                    <DialogContent>
                        {dialogError && <Alert severity="error" sx={{ mb: 2 }}>{dialogError}</Alert>}
                        <Grid container spacing={2} sx={{pt: 1}}>
                            <Grid item xs={12} sm={6}><TextField label="Name" fullWidth value={formName} onChange={(e) => setFormName(e.target.value)} /></Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField select label="Icon Name" fullWidth value={formIconName} onChange={(e) => setFormIconName(e.target.value)}>
                                    <MenuItem value=""><em>Kein Icon</em></MenuItem>
                                    {Object.keys(ICON_MAP).sort().map(iconKey => {
                                        const IconComponent = ICON_MAP[iconKey];
                                        return (
                                            <MenuItem key={iconKey} value={iconKey}>
                                                <Box sx={{ display: 'flex', alignItems: 'center' }}><IconComponent sx={{ mr: 1.5 }} />{iconKey}</Box>
                                            </MenuItem>
                                        );
                                    })}
                                </TextField>
                            </Grid>
                            <Grid item xs={12} sm={6}><TextField label="Type Key (Eindeutig)" fullWidth value={formTypeKey} onChange={(e) => setFormTypeKey(e.target.value)} disabled={!!editingWt} /></Grid>
                            <Grid item xs={12} sm={6}><TextField label="Component Key" helperText="Muss Key aus widgetMapping.ts sein" fullWidth value={formComponentKey} onChange={(e) => setFormComponentKey(e.target.value)} /></Grid>
                            <Grid item xs={12}><TextField label="Beschreibung" fullWidth multiline rows={2} value={formDescription} onChange={(e) => setFormDescription(e.target.value)} /></Grid>
                            <Grid item xs={12}><TextField label="Config (als JSON)" fullWidth multiline rows={4} value={formConfig} onChange={(e) => setFormConfig(e.target.value)} placeholder='{ "title": "Mein Titel", "category": "meine_kategorie" }' /></Grid>
                            <Grid item xs={6} md={3}><TextField label="Standardbreite" type="number" fullWidth value={formDefaultWidth} onChange={(e) => setFormDefaultWidth(parseInt(e.target.value))} /></Grid>
                            <Grid item xs={6} md={3}><TextField label="Standardhöhe" type="number" fullWidth value={formDefaultHeight} onChange={(e) => setFormDefaultHeight(parseInt(e.target.value))} /></Grid>
                            <Grid item xs={6} md={3}><TextField label="Min. Breite" type="number" fullWidth value={formDefaultMinWidth} onChange={(e) => setFormDefaultMinWidth(parseInt(e.target.value))} /></Grid>
                            <Grid item xs={6} md={3}><TextField label="Min. Höhe" type="number" fullWidth value={formDefaultMinHeight} onChange={(e) => setFormDefaultMinHeight(parseInt(e.target.value))} /></Grid>
                            <Grid item xs={4}><FormControlLabel control={<Switch checked={formIsRemovable} onChange={(e) => setFormIsRemovable(e.target.checked)} />} label="Entfernbar" /></Grid>
                            <Grid item xs={4}><FormControlLabel control={<Switch checked={formIsResizable} onChange={(e) => setFormIsResizable(e.target.checked)} />} label="Größe änderbar" /></Grid>
                            <Grid item xs={4}><FormControlLabel control={<Switch checked={formIsDraggable} onChange={(e) => setFormIsDraggable(e.target.checked)} />} label="Verschiebbar" /></Grid>
                            <Grid item xs={12}><TextField select label="Erlaubte Rollen" fullWidth SelectProps={{ multiple: true, renderValue: (selected) => (<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{(selected as string[]).map(role => <Chip key={role} label={role} size="small" />)}</Box>) }} value={formAllowedRoles} onChange={(e) => setFormAllowedRoles(e.target.value as unknown as string[])}>
                                {roleOptions.map((role) => (<MenuItem key={role.name} value={role.name} title={role.description}>{role.name}</MenuItem>))}
                            </TextField></Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseDialog}>Abbrechen</Button>
                        <Button onClick={handleSubmit} disabled={loading}>{editingWt ? 'Speichern' : 'Hinzufügen'}</Button>
                    </DialogActions>
                </Dialog>

                {/* --- Dialog: Test Layout --- */}
                <Dialog open={!!testWidget} onClose={handleCloseTestModal} fullWidth maxWidth="lg">
                    <DialogTitle>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            Widget Test: "{testWidget?.name}"
                            <Paper elevation={2} sx={{ p: '4px 12px' }}>
                                <Typography variant="h6">
                                    w: <Box component="span" sx={{ color: 'primary.main', fontWeight: 'bold' }}>{testLayout.w}</Box> / h: <Box component="span" sx={{ color: 'primary.main', fontWeight: 'bold' }}>{testLayout.h}</Box>
                                </Typography>
                            </Paper>
                        </Box>
                    </DialogTitle>
                    <DialogContent sx={{ bgcolor: 'grey.200', minHeight: '60vh', p: 1 }}>
                        {WidgetToTest ? (
                            <ResponsiveGridLayout
                                className="layout" layouts={{ lg: [testLayout] }} breakpoints={{ lg: 1200 }} cols={{ lg: 12 }} rowHeight={30}
                                onResizeStop={handleTestLayoutChange} onDragStop={handleTestLayoutChange} draggableHandle=".widget-header"
                            >
                                <div key={testLayout.i}>
                                    <WidgetToTest 
                                        widgetId="test-widget"
                                        isRemovable={false}
                                        onDelete={() => {}}
                                        title={testWidget?.config?.title || testWidget?.name}
                                        icon={React.createElement(getIcon(testWidget?.icon_name))}
                                        widgetTypeKey={testWidget?.type_key}
                                        businessPartner={dummyBusinessPartner}
                                        {...testWidget?.config}
                                    />
                                </div>
                            </ResponsiveGridLayout>
                        ) : <Alert severity="warning">Widget mit Type Key "{testWidget?.type_key}" kann nicht getestet werden (nicht in `widgetMapping.ts` gefunden).</Alert>}
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseTestModal}>Schließen</Button>
                    </DialogActions>
                </Dialog>

                {/* --- NEU: Dialog: Installations-Details --- */}
                <Dialog open={installModal.open} onClose={handleCloseInstallDetails} fullWidth maxWidth="sm">
                    <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6">
                            Installationen: {installModal.widget?.name}
                        </Typography>
                        <IconButton onClick={handleCloseInstallDetails} size="small"><CloseIcon /></IconButton>
                    </DialogTitle>
                    <DialogContent dividers sx={{ minHeight: 200 }}>
                        {installLoading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
                        ) : installData.length === 0 ? (
                            <Typography color="text.secondary" align="center" sx={{ py: 4 }}>Keine Einträge gefunden.</Typography>
                        ) : (
                            <List>
                                {installData.map((item) => (
                                    <ListItem key={item.id} divider>
                                        <ListItemAvatar>
                                            <Avatar sx={{ bgcolor: installModal.type === 'bp' ? 'primary.main' : 'secondary.main' }}>
                                                {installModal.type === 'bp' ? <BusinessIcon /> : <PersonIcon />}
                                            </Avatar>
                                        </ListItemAvatar>
                                        <ListItemText 
                                            primary={item.name} 
                                            secondary={item.detail || `ID: ${item.id}`} 
                                        />
                                    </ListItem>
                                ))}
                            </List>
                        )}
                    </DialogContent>
                </Dialog>

            </Container>
        </DashboardLayout>
    );
};

export default AdminWidgetTypesPage;