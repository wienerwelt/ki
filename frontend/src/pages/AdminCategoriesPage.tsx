import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Container,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Stack,
    Switch,
    Tab,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    Tabs,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import AppsOutlinedIcon from '@mui/icons-material/AppsOutlined';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

type Order = 'asc' | 'desc';
type CategoryArea = 'general' | 'software';

interface Category {
    id: string;
    name: string;
    name_lang: string | null;
    name_lang_en: string | null;
    description: string | null;
    category_type: 'industry' | 'content' | 'community' | 'directory_service';
}

interface SoftwareCategory {
    id: string;
    slug: string;
    name: string;
    sort_order: number;
    is_active: boolean;
    usage_count: number;
}

const CATEGORY_TYPE_LABELS: Record<Category['category_type'], string> = {
    content: 'Content',
    industry: 'Branche',
    community: 'Community',
    directory_service: 'Dienstleistung',
};

const emptyCategoryForm = {
    name: '',
    name_lang: '',
    name_lang_en: '',
    description: '',
    category_type: 'content' as Category['category_type'],
};

const emptySoftwareCategoryForm = {
    name: '',
    slug: '',
    sort_order: 10,
    is_active: true,
};

const toSlug = (value: string) => value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);

const getApiError = (response: any, fallback: string) => response?.data?.message || fallback;

const AdminCategoriesPage: React.FC = () => {
    const [area, setArea] = useState<CategoryArea>('general');
    const [categories, setCategories] = useState<Category[]>([]);
    const [softwareCategories, setSoftwareCategories] = useState<SoftwareCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<keyof Category>('name');

    const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
    const [categoryDialogError, setCategoryDialogError] = useState<string | null>(null);
    const [categorySaving, setCategorySaving] = useState(false);

    const [softwareDialogOpen, setSoftwareDialogOpen] = useState(false);
    const [editingSoftwareCategory, setEditingSoftwareCategory] = useState<SoftwareCategory | null>(null);
    const [softwareForm, setSoftwareForm] = useState(emptySoftwareCategoryForm);
    const [softwareSlugTouched, setSoftwareSlugTouched] = useState(false);
    const [softwareDialogError, setSoftwareDialogError] = useState<string | null>(null);
    const [softwareSaving, setSoftwareSaving] = useState(false);

    const fetchCategories = async () => {
        setLoading(true);
        setError(null);
        try {
            const [generalResponse, softwareResponse] = await Promise.all([
                apiClient.get('/api/admin/categories'),
                apiClient.get('/api/admin/categories/software'),
            ]);
            if (!generalResponse.res.ok) throw new Error(getApiError(generalResponse, 'Kategorien konnten nicht geladen werden.'));
            if (!softwareResponse.res.ok) throw new Error(getApiError(softwareResponse, 'Software-Kategorien konnten nicht geladen werden.'));
            setCategories(Array.isArray(generalResponse.data) ? generalResponse.data : []);
            setSoftwareCategories(Array.isArray(softwareResponse.data) ? softwareResponse.data : []);
        } catch (requestError: any) {
            setError(requestError?.message || 'Kategorien konnten nicht geladen werden.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCategories();
    }, []);

    const filteredCategories = useMemo(() => {
        const needle = searchTerm.trim().toLocaleLowerCase('de');
        return categories
            .filter((category) => {
                const matchesSearch = !needle || [category.name, category.name_lang, category.name_lang_en, category.description]
                    .some((value) => String(value || '').toLocaleLowerCase('de').includes(needle));
                return matchesSearch && (typeFilter === 'all' || category.category_type === typeFilter);
            })
            .sort((left, right) => {
                const leftValue = String(left[orderBy] || '');
                const rightValue = String(right[orderBy] || '');
                return leftValue.localeCompare(rightValue, 'de') * (order === 'asc' ? 1 : -1);
            });
    }, [categories, order, orderBy, searchTerm, typeFilter]);

    const filteredSoftwareCategories = useMemo(() => {
        const needle = searchTerm.trim().toLocaleLowerCase('de');
        return softwareCategories.filter((category) => !needle
            || category.name.toLocaleLowerCase('de').includes(needle)
            || category.slug.includes(needle));
    }, [searchTerm, softwareCategories]);

    const openCategoryDialog = (category: Category | null = null) => {
        setEditingCategory(category);
        setCategoryForm(category ? {
            name: category.name,
            name_lang: category.name_lang || '',
            name_lang_en: category.name_lang_en || '',
            description: category.description || '',
            category_type: category.category_type || 'content',
        } : emptyCategoryForm);
        setCategoryDialogError(null);
        setCategoryDialogOpen(true);
    };

    const saveCategory = async () => {
        setCategorySaving(true);
        setCategoryDialogError(null);
        const payload = {
            ...categoryForm,
            name_lang: categoryForm.name_lang || null,
            name_lang_en: categoryForm.name_lang_en || null,
            description: categoryForm.description || null,
        };
        try {
            const response = editingCategory
                ? await apiClient.put(`/api/admin/categories/${editingCategory.id}`, payload)
                : await apiClient.post('/api/admin/categories', payload);
            if (!response.res.ok) throw new Error(getApiError(response, 'Kategorie konnte nicht gespeichert werden.'));
            setCategoryDialogOpen(false);
            await fetchCategories();
        } catch (requestError: any) {
            setCategoryDialogError(requestError?.message || 'Kategorie konnte nicht gespeichert werden.');
        } finally {
            setCategorySaving(false);
        }
    };

    const deleteCategory = async (category: Category) => {
        if (!window.confirm(`Kategorie „${category.name}“ wirklich löschen?`)) return;
        try {
            const response = await apiClient.delete(`/api/admin/categories/${category.id}`);
            if (!response.res.ok) {
                setError(getApiError(response, 'Kategorie konnte nicht gelöscht werden.'));
                return;
            }
            await fetchCategories();
        } catch (requestError: any) {
            setError(requestError?.message || 'Kategorie konnte nicht gelöscht werden.');
        }
    };

    const openSoftwareDialog = (category: SoftwareCategory | null = null) => {
        setEditingSoftwareCategory(category);
        setSoftwareForm(category ? {
            name: category.name,
            slug: category.slug,
            sort_order: Number(category.sort_order || 0),
            is_active: category.is_active,
        } : {
            ...emptySoftwareCategoryForm,
            sort_order: softwareCategories.length > 0
                ? Math.ceil((Math.max(...softwareCategories.map((item) => Number(item.sort_order || 0))) + 10) / 10) * 10
                : 10,
        });
        setSoftwareSlugTouched(Boolean(category));
        setSoftwareDialogError(null);
        setSoftwareDialogOpen(true);
    };

    const saveSoftwareCategory = async () => {
        setSoftwareSaving(true);
        setSoftwareDialogError(null);
        try {
            const response = editingSoftwareCategory
                ? await apiClient.put(`/api/admin/categories/software/${editingSoftwareCategory.id}`, softwareForm)
                : await apiClient.post('/api/admin/categories/software', softwareForm);
            if (!response.res.ok) throw new Error(getApiError(response, 'Software-Kategorie konnte nicht gespeichert werden.'));
            setSoftwareDialogOpen(false);
            await fetchCategories();
        } catch (requestError: any) {
            setSoftwareDialogError(requestError?.message || 'Software-Kategorie konnte nicht gespeichert werden.');
        } finally {
            setSoftwareSaving(false);
        }
    };

    const deleteSoftwareCategory = async (category: SoftwareCategory) => {
        if (category.usage_count > 0) return;
        if (!window.confirm(`Unbenutzte Software-Kategorie „${category.name}“ endgültig löschen?`)) return;
        try {
            const response = await apiClient.delete(`/api/admin/categories/software/${category.id}`);
            if (!response.res.ok) {
                setError(getApiError(response, 'Software-Kategorie konnte nicht gelöscht werden.'));
                return;
            }
            await fetchCategories();
        } catch (requestError: any) {
            setError(requestError?.message || 'Software-Kategorie konnte nicht gelöscht werden.');
        }
    };

    const handleSort = (property: keyof Category) => {
        const isAscending = orderBy === property && order === 'asc';
        setOrder(isAscending ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const resultCount = area === 'general' ? filteredCategories.length : filteredSoftwareCategories.length;

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: { xs: 2, md: 4 }, mb: 4 }}>
                <Stack spacing={2.5}>
                    <Box>
                        <Typography variant="h4" component="h1" fontWeight={800}>Kategorien verwalten</Typography>
                        <Typography color="text.secondary">
                            Zentrale Pflege – fachlich getrennt für Inhalte, Branchen und den Software-Katalog.
                        </Typography>
                    </Box>

                    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                        <Tabs
                            value={area}
                            onChange={(_, value: CategoryArea) => { setArea(value); setSearchTerm(''); }}
                            variant="scrollable"
                            scrollButtons="auto"
                            aria-label="Kategorie-Bereiche"
                        >
                            <Tab icon={<CategoryOutlinedIcon />} iconPosition="start" value="general" label={`Allgemeine Kategorien (${categories.length})`} />
                            <Tab icon={<AppsOutlinedIcon />} iconPosition="start" value="software" label={`Software-Kategorien (${softwareCategories.length})`} />
                        </Tabs>
                    </Paper>

                    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 1.5, alignItems: { md: 'center' } }}>
                        <TextField
                            size="small"
                            placeholder={area === 'general' ? 'Kategorien durchsuchen …' : 'Name oder Slug suchen …'}
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            sx={{ flex: 1, minWidth: { md: 300 } }}
                            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
                        />
                        {area === 'general' && (
                            <TextField
                                select
                                size="small"
                                label="Typ"
                                value={typeFilter}
                                onChange={(event) => setTypeFilter(event.target.value)}
                                sx={{ minWidth: { xs: '100%', md: 210 } }}
                            >
                                <MenuItem value="all">Alle Typen</MenuItem>
                                {Object.entries(CATEGORY_TYPE_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                            </TextField>
                        )}
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => area === 'general' ? openCategoryDialog() : openSoftwareDialog()}
                            sx={{ whiteSpace: 'nowrap', minHeight: 40 }}
                        >
                            {area === 'general' ? 'Kategorie hinzufügen' : 'Software-Kategorie hinzufügen'}
                        </Button>
                    </Box>

                    {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

                    {loading ? (
                        <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 240 }}><CircularProgress /></Box>
                    ) : (
                        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                            <Box sx={{ px: 2, py: 1.25, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
                                <Typography variant="body2" fontWeight={700}>{resultCount} Einträge</Typography>
                            </Box>
                            <TableContainer>
                                {area === 'general' ? (
                                    <Table sx={{ minWidth: 900 }}>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell><TableSortLabel active={orderBy === 'name'} direction={order} onClick={() => handleSort('name')}>Name</TableSortLabel></TableCell>
                                                <TableCell>Name DE</TableCell>
                                                <TableCell>Name EN</TableCell>
                                                <TableCell><TableSortLabel active={orderBy === 'category_type'} direction={order} onClick={() => handleSort('category_type')}>Typ</TableSortLabel></TableCell>
                                                <TableCell>Beschreibung</TableCell>
                                                <TableCell align="right">Aktionen</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {filteredCategories.map((category) => (
                                                <TableRow key={category.id} hover>
                                                    <TableCell sx={{ fontWeight: 700 }}>{category.name}</TableCell>
                                                    <TableCell>{category.name_lang || '—'}</TableCell>
                                                    <TableCell>{category.name_lang_en || '—'}</TableCell>
                                                    <TableCell><Chip size="small" label={CATEGORY_TYPE_LABELS[category.category_type] || category.category_type} /></TableCell>
                                                    <TableCell sx={{ maxWidth: 360 }}>{category.description || '—'}</TableCell>
                                                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                                        <Tooltip title="Bearbeiten"><IconButton onClick={() => openCategoryDialog(category)}><EditIcon /></IconButton></Tooltip>
                                                        <Tooltip title="Löschen"><IconButton color="error" onClick={() => deleteCategory(category)}><DeleteIcon /></IconButton></Tooltip>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                ) : (
                                    <Table sx={{ minWidth: 760 }}>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Reihenfolge</TableCell>
                                                <TableCell>Name</TableCell>
                                                <TableCell>Technischer Slug</TableCell>
                                                <TableCell align="center">Verwendung</TableCell>
                                                <TableCell>Status</TableCell>
                                                <TableCell align="right">Aktionen</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {filteredSoftwareCategories.map((category) => (
                                                <TableRow key={category.id} hover sx={{ opacity: category.is_active ? 1 : 0.62 }}>
                                                    <TableCell>{category.sort_order}</TableCell>
                                                    <TableCell sx={{ fontWeight: 700 }}>{category.name}</TableCell>
                                                    <TableCell><Typography component="code" variant="body2">{category.slug}</Typography></TableCell>
                                                    <TableCell align="center"><Chip size="small" variant="outlined" label={`${category.usage_count} Software-Einträge`} /></TableCell>
                                                    <TableCell><Chip size="small" color={category.is_active ? 'success' : 'default'} label={category.is_active ? 'Aktiv' : 'Inaktiv'} /></TableCell>
                                                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                                        <Tooltip title="Bearbeiten"><IconButton onClick={() => openSoftwareDialog(category)}><EditIcon /></IconButton></Tooltip>
                                                        <Tooltip title={category.usage_count > 0 ? 'Wird verwendet – zum Ausblenden deaktivieren' : 'Endgültig löschen'}>
                                                            <span><IconButton color="error" disabled={category.usage_count > 0} onClick={() => deleteSoftwareCategory(category)}><DeleteIcon /></IconButton></span>
                                                        </Tooltip>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </TableContainer>
                        </Paper>
                    )}
                </Stack>
            </Container>

            <Dialog open={categoryDialogOpen} onClose={() => !categorySaving && setCategoryDialogOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>{editingCategory ? 'Kategorie bearbeiten' : 'Kategorie hinzufügen'}</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2}>
                        {categoryDialogError && <Alert severity="error">{categoryDialogError}</Alert>}
                        <TextField autoFocus label="Name (intern)" value={categoryForm.name} required onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} />
                        <TextField label="Name (Deutsch)" value={categoryForm.name_lang} onChange={(event) => setCategoryForm((current) => ({ ...current, name_lang: event.target.value }))} />
                        <TextField label="Name (Englisch)" value={categoryForm.name_lang_en} onChange={(event) => setCategoryForm((current) => ({ ...current, name_lang_en: event.target.value }))} />
                        <TextField select label="Kategorie-Typ" value={categoryForm.category_type} onChange={(event) => setCategoryForm((current) => ({ ...current, category_type: event.target.value as Category['category_type'] }))}>
                            {Object.entries(CATEGORY_TYPE_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                        </TextField>
                        <TextField label="Beschreibung" multiline minRows={3} value={categoryForm.description} onChange={(event) => setCategoryForm((current) => ({ ...current, description: event.target.value }))} />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCategoryDialogOpen(false)} disabled={categorySaving}>Abbrechen</Button>
                    <Button variant="contained" onClick={saveCategory} disabled={categorySaving || !categoryForm.name.trim()} sx={{ whiteSpace: 'nowrap' }}>
                        {categorySaving ? 'Wird gespeichert …' : 'Speichern'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={softwareDialogOpen} onClose={() => !softwareSaving && setSoftwareDialogOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>{editingSoftwareCategory ? 'Software-Kategorie bearbeiten' : 'Software-Kategorie hinzufügen'}</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2}>
                        {softwareDialogError && <Alert severity="error">{softwareDialogError}</Alert>}
                        <Alert severity="info">Diese Kategorien stehen global im Formular „Software eintragen“ zur Verfügung.</Alert>
                        <TextField
                            autoFocus
                            label="Name"
                            value={softwareForm.name}
                            required
                            onChange={(event) => {
                                const name = event.target.value;
                                setSoftwareForm((current) => ({ ...current, name, slug: softwareSlugTouched ? current.slug : toSlug(name) }));
                            }}
                        />
                        <TextField
                            label="Technischer Slug"
                            value={softwareForm.slug}
                            required
                            disabled={Boolean(editingSoftwareCategory && editingSoftwareCategory.usage_count > 0)}
                            onChange={(event) => { setSoftwareSlugTouched(true); setSoftwareForm((current) => ({ ...current, slug: toSlug(event.target.value) })); }}
                            helperText={editingSoftwareCategory && editingSoftwareCategory.usage_count > 0
                                ? 'Bleibt stabil, weil diese Kategorie bereits verwendet wird.'
                                : 'Eindeutiger technischer Schlüssel, z. B. fleetmanagement-verwaltung.'}
                        />
                        <TextField
                            label="Sortierreihenfolge"
                            type="number"
                            inputProps={{ min: 0, max: 100000, step: 10 }}
                            value={softwareForm.sort_order}
                            onChange={(event) => setSoftwareForm((current) => ({ ...current, sort_order: Number(event.target.value) }))}
                        />
                        <FormControlLabel
                            control={<Switch checked={softwareForm.is_active} onChange={(event) => setSoftwareForm((current) => ({ ...current, is_active: event.target.checked }))} />}
                            label={softwareForm.is_active ? 'Aktiv – im Softwareformular auswählbar' : 'Inaktiv – nicht mehr neu auswählbar'}
                        />
                        {editingSoftwareCategory && editingSoftwareCategory.usage_count > 0 && (
                            <Alert severity="warning">
                                Bereits {editingSoftwareCategory.usage_count} Software-Eintrag{editingSoftwareCategory.usage_count === 1 ? '' : 'e'} zugeordnet. Deaktivieren bewahrt bestehende Zuordnungen.
                            </Alert>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSoftwareDialogOpen(false)} disabled={softwareSaving}>Abbrechen</Button>
                    <Button
                        variant="contained"
                        onClick={saveSoftwareCategory}
                        disabled={softwareSaving || !softwareForm.name.trim() || !softwareForm.slug.trim()}
                        sx={{ whiteSpace: 'nowrap' }}
                    >
                        {softwareSaving ? 'Wird gespeichert …' : 'Speichern'}
                    </Button>
                </DialogActions>
            </Dialog>
        </DashboardLayout>
    );
};

export default AdminCategoriesPage;
