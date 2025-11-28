import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
    Container, Typography, Box, Paper, CircularProgress, Alert,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, Tooltip,
    Select, MenuItem, FormControl, InputLabel, Chip, Button, Link, TableSortLabel,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField
} from '@mui/material';

// Icons
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ImageIcon from '@mui/icons-material/Image';
import MovieIcon from '@mui/icons-material/Movie';
import RefreshIcon from '@mui/icons-material/Refresh';
import ForumIcon from '@mui/icons-material/Forum';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ReportProblemIcon from '@mui/icons-material/ReportProblem'; // Für Meldungen

import { useAuth } from '../context/AuthContext';
import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

// --- Interfaces ---
interface AdminPost {
    id: string;
    content: string;
    image_url: string | null;
    created_at: string;
    user_id: string;
    first_name: string;
    last_name: string;
    email: string;
    user_role: string;
    business_partner_id: string;
    business_partner_name: string;
    category_name: string | null;
    like_count: number;
    comment_count: number;
    report_count: number; // ✅ NEU: Anzahl der Meldungen
}

interface BusinessPartner {
    id: string;
    name: string;
}

interface Category {
    id: string;
    name: string;
}

// --- Sortier-Logik ---
type Order = 'asc' | 'desc';

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
    const valA = (a as any)[orderBy] ?? '';
    const valB = (b as any)[orderBy] ?? '';
    
    if (typeof valA === 'number' && typeof valB === 'number') {
        if (valB < valA) return -1;
        if (valB > valA) return 1;
        return 0;
    }

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


const AdminCommunityPage: React.FC = () => {
    const { user } = useAuth();
    const { showSnackbar } = useSnackbar();
    const navigate = useNavigate();
    
    const [posts, setPosts] = useState<AdminPost[]>([]);
    const [businessPartners, setBusinessPartners] = useState<BusinessPartner[]>([]);
    const [categories, setCategories] = useState<Category[]>([]); 
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Filter & Sortierung
    const [selectedBp, setSelectedBp] = useState<string>('');
    const [order, setOrder] = useState<Order>('desc');
    const [orderBy, setOrderBy] = useState<keyof AdminPost>('created_at');

    // Edit State
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editingPostId, setEditingPostId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');
    const [editCategoryId, setEditCategoryId] = useState('');

    const isAdmin = user?.role === 'admin';

    // Daten laden
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            let query = '/api/community/admin/posts';
            if (isAdmin && selectedBp) {
                query += `?businessPartnerId=${selectedBp}`;
            }

            const promises = [
                apiClient.get(query),
                apiClient.get('/api/community/categories')
            ];
            
            if (isAdmin && businessPartners.length === 0) {
                promises.push(apiClient.get('/api/admin/business-partners'));
            }

            const [postsRes, catRes, bpRes] = await Promise.all(promises);
            
            setPosts(postsRes.data);
            setCategories(catRes.data);

            if (bpRes) {
                setBusinessPartners(bpRes.data.partners || bpRes.data || []);
            }

        } catch (err: any) {
            console.error(err);
            setError('Fehler beim Laden der Community-Daten.');
        } finally {
            setLoading(false);
        }
    }, [isAdmin, selectedBp, businessPartners.length]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // --- Actions ---

    const handleDeletePost = async (postId: string) => {
        if (!window.confirm('Möchten Sie diesen Beitrag und alle zugehörigen Kommentare wirklich unwiderruflich löschen?')) {
            return;
        }
        try {
            await apiClient.delete(`/api/community/feed/${postId}`);
            setPosts(prev => prev.filter(p => p.id !== postId));
            showSnackbar('Beitrag erfolgreich gelöscht.', 'success');
        } catch (err) {
            showSnackbar('Fehler beim Löschen des Beitrags.', 'error');
        }
    };

    // Editieren öffnen
    const handleEditClick = (post: AdminPost) => {
        setEditingPostId(post.id);
        setEditContent(post.content || '');
        
        // Versuchen, die Category ID anhand des Namens zu finden
        const cat = categories.find(c => c.name === post.category_name);
        setEditCategoryId(cat ? cat.id : '');
        
        setEditDialogOpen(true);
    };

    // Speichern
    const handleSaveEdit = async () => {
        if (!editingPostId) return;
        try {
            await apiClient.put(`/api/community/feed/${editingPostId}`, {
                content: editContent,
                categoryId: editCategoryId
            });
            
            // Lokales Update
            setPosts(prev => prev.map(p => {
                if (p.id === editingPostId) {
                    const newCatName = categories.find(c => c.id === editCategoryId)?.name || null;
                    return { ...p, content: editContent, category_name: newCatName };
                }
                return p;
            }));

            showSnackbar('Beitrag aktualisiert.', 'success');
            setEditDialogOpen(false);
        } catch (err) {
            showSnackbar('Fehler beim Speichern.', 'error');
        }
    };


    const handleSortRequest = (property: keyof AdminPost) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const sortedPosts = useMemo(() => {
        return posts.sort(getComparator(order, orderBy));
    }, [posts, order, orderBy]);

    const handleUserClick = (bpId: string) => {
        navigate(`/admin/users?business_partner_id=${bpId}`);
    };

    return (
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <ForumIcon fontSize="large" color="primary" />
                    <Typography variant="h4">Community Moderation</Typography>
                </Box>
                <Button startIcon={<RefreshIcon />} onClick={() => fetchData()}>Aktualisieren</Button>
            </Box>

            {isAdmin && (
                <Paper sx={{ p: 2, mb: 3 }}>
                    <FormControl fullWidth size="small">
                        <InputLabel>Business Partner filtern</InputLabel>
                        <Select
                            value={selectedBp}
                            label="Business Partner filtern"
                            onChange={(e) => setSelectedBp(e.target.value)}
                        >
                            <MenuItem value=""><em>Alle anzeigen</em></MenuItem>
                            {businessPartners.map(bp => (
                                <MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Paper>
            )}

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
            ) : error ? (
                <Alert severity="error">{error}</Alert>
            ) : (
                <Paper>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>
                                        <TableSortLabel active={orderBy === 'created_at'} direction={order} onClick={() => handleSortRequest('created_at')}>
                                            Datum
                                        </TableSortLabel>
                                    </TableCell>
                                    <TableCell>
                                        <TableSortLabel active={orderBy === 'last_name'} direction={order} onClick={() => handleSortRequest('last_name')}>
                                            Autor
                                        </TableSortLabel>
                                    </TableCell>
                                    {isAdmin && (
                                        <TableCell>
                                            <TableSortLabel active={orderBy === 'business_partner_name'} direction={order} onClick={() => handleSortRequest('business_partner_name')}>
                                                Business Partner
                                            </TableSortLabel>
                                        </TableCell>
                                    )}
                                    <TableCell>
                                        <TableSortLabel active={orderBy === 'category_name'} direction={order} onClick={() => handleSortRequest('category_name')}>
                                            Kategorie
                                        </TableSortLabel>
                                    </TableCell>
                                    <TableCell>Inhalt / Medien</TableCell>
                                    <TableCell align="center">
                                        <TableSortLabel active={orderBy === 'report_count'} direction={order} onClick={() => handleSortRequest('report_count')}>
                                            Status
                                        </TableSortLabel>
                                    </TableCell>
                                    <TableCell align="right">Aktionen</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {sortedPosts.length === 0 ? (
                                    <TableRow><TableCell colSpan={8} align="center">Keine Beiträge gefunden.</TableCell></TableRow>
                                ) : (
                                    sortedPosts.map((post) => {
                                        const isVideo = post.image_url?.match(/\.(mp4|webm|mov)$/i);
                                        // Wenn Meldungen vorliegen, rot markieren
                                        const hasReports = post.report_count > 0;

                                        return (
                                        <TableRow 
                                            key={post.id} 
                                            hover
                                            sx={{ backgroundColor: hasReports ? 'rgba(211, 47, 47, 0.08)' : 'inherit' }}
                                        >
                                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                                <Tooltip title={new Date(post.created_at).toLocaleString()}>
                                                    <span>{formatDistanceToNow(new Date(post.created_at), { locale: de, addSuffix: true })}</span>
                                                </Tooltip>
                                            </TableCell>
                                            
                                            <TableCell>
                                                <Box>
                                                    {isAdmin ? (
                                                        <Link 
                                                            component="button" 
                                                            variant="body2" 
                                                            fontWeight="bold" 
                                                            onClick={() => handleUserClick(post.business_partner_id)}
                                                            sx={{ textAlign: 'left' }}
                                                        >
                                                            {post.first_name} {post.last_name}
                                                        </Link>
                                                    ) : (
                                                        <Typography variant="body2" fontWeight="bold">
                                                            {post.first_name} {post.last_name}
                                                        </Typography>
                                                    )}
                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                        {post.email} ({post.user_role})
                                                    </Typography>
                                                </Box>
                                            </TableCell>
                                            
                                            {isAdmin && (
                                                <TableCell>
                                                    <Link component={RouterLink} to="/admin/business-partners" color="inherit" underline="hover">
                                                        <Chip label={post.business_partner_name} size="small" variant="outlined" clickable />
                                                    </Link>
                                                </TableCell>
                                            )}

                                            <TableCell>
                                                {post.category_name ? <Chip label={post.category_name} size="small" color="primary" variant="outlined" /> : '-'}
                                            </TableCell>

                                            <TableCell sx={{ maxWidth: 350 }}>
                                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                                    {post.image_url && (
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'background.paper', p: 0.5, borderRadius: 1, width: 'fit-content', border: '1px solid #eee' }}>
                                                            {isVideo ? <MovieIcon color="action" /> : <ImageIcon color="action" />}
                                                            <Link href={post.image_url} target="_blank" rel="noopener" sx={{ display: 'flex', alignItems: 'center', fontSize: '0.8rem' }}>
                                                                Anhang ansehen <OpenInNewIcon sx={{ fontSize: 12, ml: 0.5 }}/>
                                                            </Link>
                                                        </Box>
                                                    )}
                                                    <Typography variant="body2" noWrap title={post.content}>
                                                        {post.content ? post.content.substring(0, 80) + (post.content.length > 80 ? '...' : '') : <em>(Kein Text)</em>}
                                                    </Typography>
                                                </Box>
                                            </TableCell>

                                            <TableCell align="center">
                                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'center' }}>
                                                    {hasReports && (
                                                         <Chip 
                                                            size="small" 
                                                            label={`${post.report_count} Meldung(en)`} 
                                                            color="error" 
                                                            icon={<ReportProblemIcon />} 
                                                            sx={{ fontWeight: 'bold' }}
                                                         />
                                                    )}
                                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                                        <Chip size="small" label={`${post.like_count} 👍`} variant="outlined" />
                                                        <Chip size="small" label={`${post.comment_count} 💬`} variant="outlined" />
                                                    </Box>
                                                </Box>
                                            </TableCell>

                                            <TableCell align="right">
                                                <Tooltip title="Beitrag bearbeiten">
                                                    <IconButton color="primary" onClick={() => handleEditClick(post)}>
                                                        <EditIcon />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Beitrag löschen">
                                                    <IconButton color="error" onClick={() => handleDeletePost(post.id)}>
                                                        <DeleteIcon />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}

            {/* Edit Dialog */}
            <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>Beitrag bearbeiten</DialogTitle>
                <DialogContent>
                    <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <TextField
                            label="Inhalt"
                            multiline
                            minRows={4}
                            fullWidth
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                        />
                        
                        <FormControl fullWidth>
                            <InputLabel>Kategorie</InputLabel>
                            <Select
                                value={editCategoryId}
                                label="Kategorie"
                                onChange={(e) => setEditCategoryId(e.target.value)}
                            >
                                {categories.map(c => (
                                    <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditDialogOpen(false)}>Abbrechen</Button>
                    <Button onClick={handleSaveEdit} variant="contained" color="primary">Speichern</Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
};

export default AdminCommunityPage;