// frontend/src/pages/AdminCategoriesPage.tsx

import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

interface Category {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
}

const initialFormState = {
    name: '',
    description: '',
};

const AdminCategoriesPage: React.FC = () => {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [formState, setFormState] = useState(initialFormState);

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
            setFormState({ name: category.name, description: category.description || '' });
        } else {
            setFormState(initialFormState);
        }
        setDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setDialogOpen(false);
        setEditingCategory(null);
        setError(null);
    };

    const handleFormChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        setFormState(prevState => ({ ...prevState, [name]: value }));
    };

    const handleSubmit = async () => {
        const token = localStorage.getItem('jwt_token');
        const headers = { 'x-auth-token': token };
        const data = { name: formState.name, description: formState.description || null };

        try {
            if (editingCategory) {
                await apiClient.put(`/api/admin/categories/${editingCategory.id}`, data, { headers });
            } else {
                await apiClient.post('/api/admin/categories', data, { headers });
            }
            fetchCategories();
            handleCloseDialog();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Speichern der Kategorie.');
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

    return (
        <DashboardLayout>
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h4" component="h1">Kategorien-Verwaltung ({categories.length})</Typography>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
                        Kategorie hinzufügen
                    </Button>
                </Box>
                {loading ? <CircularProgress /> : error && !dialogOpen ? <Alert severity="error">{error}</Alert> : (
                    <Paper>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Name</TableCell>
                                        <TableCell>Beschreibung</TableCell>
                                        <TableCell align="right">Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {categories.map((category) => (
                                        <TableRow key={category.id} hover>
                                            <TableCell sx={{ fontWeight: 'bold' }}>{category.name}</TableCell>
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
                    {error && dialogOpen && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    <TextField
                        autoFocus
                        margin="dense"
                        name="name"
                        label="Name der Kategorie"
                        type="text"
                        fullWidth
                        variant="outlined"
                        value={formState.name}
                        onChange={handleFormChange}
                    />
                    <TextField
                        margin="dense"
                        name="description"
                        label="Beschreibung"
                        type="text"
                        fullWidth
                        multiline
                        rows={3}
                        variant="outlined"
                        value={formState.description}
                        onChange={handleFormChange}
                    />
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