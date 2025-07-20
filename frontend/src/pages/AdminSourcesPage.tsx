// frontend/src/pages/AdminSourcesPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Chip, Tooltip, Tabs, Tab, Rating, Link as MuiLink
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import DeleteIcon from '@mui/icons-material/Delete';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

// --- Interfaces ---
interface Source {
    id: string;
    url: string;
    description: string | null;
    status: 'pending_review' | 'approved' | 'rejected';
    average_rating: number;
    vote_count: number;
    suggested_by: string | null;
    category_name: string | null;
    created_at: string;
}

const statusMapping = {
    pending_review: { label: 'Ausstehend', color: 'warning', icon: <HourglassEmptyIcon /> },
    approved: { label: 'Genehmigt', color: 'success', icon: <CheckCircleIcon /> },
    rejected: { label: 'Abgelehnt', color: 'error', icon: <CancelIcon /> },
};

const AdminSourcesPage: React.FC = () => {
    const [sources, setSources] = useState<Source[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<'all' | 'pending_review' | 'approved' | 'rejected'>('all');

    const fetchSources = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.get('/api/admin/sources', {
                headers: { 'x-auth-token': token }
            });
            setSources(response.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Quellen.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSources();
    }, []);

    const filteredSources = useMemo(() => {
        if (filterStatus === 'all') {
            return sources;
        }
        return sources.filter(s => s.status === filterStatus);
    }, [sources, filterStatus]);

    const handleStatusChange = async (id: string, newStatus: 'approved' | 'rejected') => {
        if (!window.confirm(`Sind Sie sicher, dass Sie diese Quelle ${newStatus === 'approved' ? 'genehmigen' : 'ablehnen'} möchten?`)) return;
        
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.put(`/api/admin/sources/${id}/status`, { status: newStatus }, {
                headers: { 'x-auth-token': token }
            });
            fetchSources(); // Daten neu laden, um die Änderungen anzuzeigen
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler beim Ändern des Status.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Sind Sie sicher, dass Sie diese Quelle endgültig löschen möchten? Alle zugehörigen Stimmen werden ebenfalls entfernt.')) return;
        
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.delete(`/api/admin/sources/${id}`, { headers: { 'x-auth-token': token } });
            fetchSources();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler beim Löschen.');
        }
    };

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    Verwaltung Vertrauenswürdiger Quellen
                </Typography>
                
                <Paper>
                    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                        <Tabs value={filterStatus} onChange={(e, newValue) => setFilterStatus(newValue)}>
                            <Tab label="Alle" value="all" />
                            <Tab label="Ausstehend" value="pending_review" />
                            <Tab label="Genehmigt" value="approved" />
                            <Tab label="Abgelehnt" value="rejected" />
                        </Tabs>
                    </Box>

                    {loading ? <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress /></Box> : 
                     error ? <Alert severity="error" sx={{ m: 2 }}>{error}</Alert> : (
                        <TableContainer sx={{ maxHeight: '75vh' }}>
                            <Table stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ width: '30%' }}>URL</TableCell>
                                        <TableCell sx={{ width: '15%' }}>Status</TableCell>
                                        <TableCell sx={{ width: '15%' }}>Community-Rating</TableCell>
                                        <TableCell sx={{ width: '10%' }}>Kategorie</TableCell>
                                        <TableCell sx={{ width: '10%' }}>Vorgeschlagen von</TableCell>
                                        <TableCell sx={{ width: '10%' }}>Eingereicht am</TableCell>
                                        <TableCell sx={{ width: '10%' }} align="right">Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredSources.map((source) => (
                                        <TableRow key={source.id} hover>
                                            <TableCell>
                                                <MuiLink href={source.url} target="_blank" rel="noopener noreferrer" sx={{ display: 'flex', alignItems: 'center' }}>
                                                    {source.url.length > 60 ? `${source.url.substring(0, 60)}...` : source.url}
                                                    <OpenInNewIcon sx={{ ml: 0.5, fontSize: '1rem' }} />
                                                </MuiLink>
                                                <Typography variant="body2" color="text.secondary">{source.description}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    icon={statusMapping[source.status].icon}
                                                    label={statusMapping[source.status].label}
                                                    color={statusMapping[source.status].color as any}
                                                    size="small"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                    <Rating value={source.average_rating} precision={0.1} readOnly size="small" />
                                                    <Typography variant="body2" sx={{ ml: 1 }}>({source.vote_count})</Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell>{source.category_name || '-'}</TableCell>
                                            <TableCell>{source.suggested_by || 'System'}</TableCell>
                                            <TableCell>{new Date(source.created_at).toLocaleDateString('de-AT')}</TableCell>
                                            <TableCell align="right">
                                                {source.status === 'pending_review' && (
                                                    <>
                                                        <Tooltip title="Genehmigen">
                                                            <IconButton color="success" onClick={() => handleStatusChange(source.id, 'approved')}>
                                                                <CheckCircleIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title="Ablehnen">
                                                            <IconButton color="warning" onClick={() => handleStatusChange(source.id, 'rejected')}>
                                                                <CancelIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </>
                                                )}
                                                <Tooltip title="Endgültig löschen">
                                                    <IconButton color="error" onClick={() => handleDelete(source.id)}>
                                                        <DeleteIcon />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                     )}
                </Paper>
            </Container>
        </DashboardLayout>
    );
};

export default AdminSourcesPage;