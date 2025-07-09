// frontend/src/pages/AdminTagsPage.tsx

import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Chip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

interface Tag {
    id: string;
    name: string;
    description: string | null;
    usage_count: number;
}

const initialFormState = {
    name: '',
    description: '',
};

const AdminTagsPage: React.FC = () => {
    const [tags, setTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingTag, setEditingTag] = useState<Tag | null>(null);
    const [formState, setFormState] = useState(initialFormState);

    const fetchTags = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const res = await apiClient.get('/api/admin/tags', { headers: { 'x-auth-token': token } });
            setTags(res.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Tags.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTags();
    }, []);

    const handleOpenDialog = (tag: Tag | null = null) => {
        setEditingTag(tag);
        if (tag) {
            setFormState({ name: tag.name, description: tag.description || '' });
        } else {
            setFormState(initialFormState);
        }
        setError(null);
        setDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setDialogOpen(false);
        setEditingTag(null);
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
            if (editingTag) {
                await apiClient.put(`/api/admin/tags/${editingTag.id}`, data, { headers });
            } else {
                await apiClient.post('/api/admin/tags', data, { headers });
            }
            fetchTags();
            handleCloseDialog();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Speichern des Tags.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Sind Sie sicher, dass Sie diesen Tag löschen möchten? Alle Zuordnungen zu Inhalten werden ebenfalls entfernt.')) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.delete(`/api/admin/tags/${id}`, { headers: { 'x-auth-token': token } });
            fetchTags();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler beim Löschen.');
        }
    };

    return (
        <DashboardLayout>
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h4" component="h1">Tag-Verwaltung</Typography>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
                        Tag hinzufügen
                    </Button>
                </Box>
                {loading ? <CircularProgress /> : error && !dialogOpen ? <Alert severity="error">{error}</Alert> : (
                    <Paper>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Tag-Name</TableCell>
                                        <TableCell>Beschreibung</TableCell>
                                        <TableCell align="center">Verwendungen</TableCell>
                                        <TableCell align="right">Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {tags.map((tag) => (
                                        <TableRow key={tag.id} hover>
                                            <TableCell><Chip label={tag.name} /></TableCell>
                                            <TableCell>{tag.description || '-'}</TableCell>
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
                    {error && dialogOpen && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    <TextField autoFocus margin="dense" name="name" label="Name des Tags" type="text" fullWidth variant="outlined" value={formState.name} onChange={handleFormChange} />
                    <TextField margin="dense" name="description" label="Beschreibung" type="text" fullWidth multiline rows={3} variant="outlined" value={formState.description} onChange={handleFormChange} />
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