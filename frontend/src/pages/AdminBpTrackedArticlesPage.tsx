// frontend/src/pages/AdminBpTrackedArticlesPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Typography, Container, Paper, CircularProgress, Alert, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Link as MuiLink, IconButton, Tooltip, TextField, Button, Grid, Checkbox, TableSortLabel, Autocomplete, Pagination } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import FilterListIcon from '@mui/icons-material/FilterList';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';

// --- Interfaces ---
interface TrackedArticle {
    id: string;
    article_title: string;
    article_url: string;
    source_name: string;
    published_at: string;
    account_name: string;
    competitor_name: string | null;
}
type Order = 'asc' | 'desc';
type ArticleKey = keyof TrackedArticle;

const formatTimestamp = (timestamp: string | null): string => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' });
};

const headCells: { id: ArticleKey; label: string; }[] = [
    { id: 'article_title', label: 'Titel / Quelle' },
    { id: 'account_name', label: 'Zugeordneter Account' },
    { id: 'competitor_name', label: 'Wettbewerber' },
    { id: 'published_at', label: 'Veröffentlicht am' },
];

const AdminTrackedArticlesPage: React.FC = () => {
    const [articles, setArticles] = useState<TrackedArticle[]>([]);
    const [accountOptions, setAccountOptions] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);

    // Filter & Sort State
    const [searchTerm, setSearchTerm] = useState('');
    const [accountFilter, setAccountFilter] = useState<string | null>(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [order, setOrder] = useState<Order>('desc');
    const [orderBy, setOrderBy] = useState<ArticleKey>('published_at');

    const { showSnackbar } = useSnackbar();

    const fetchArticles = useCallback(async (currentPage = 1) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(currentPage), limit: '50',
                sortBy: orderBy, sortOrder: order
            });
            if (searchTerm) params.append('searchTerm', searchTerm);
            if (accountFilter) params.append('accountName', accountFilter);
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);

            const res = await apiClient.get(`/api/admin/cronjobs/tracked-articles?${params.toString()}`);
            setArticles(res.data.articles);
            setTotalPages(res.data.totalPages);
            setPage(res.data.currentPage);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Artikel.');
        } finally {
            setLoading(false);
        }
    }, [orderBy, order, searchTerm, accountFilter, startDate, endDate]);

    useEffect(() => {
        fetchArticles(1);
    }, [fetchArticles]);

    useEffect(() => {
        apiClient.get('/api/admin/cronjobs/tracked-articles/accounts').then(res => setAccountOptions(res.data));
    }, []);

    const handleSortRequest = (property: ArticleKey) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.checked) {
            setSelected(articles.map((n) => n.id));
            return;
        }
        setSelected([]);
    };

    const handleClick = (_: React.MouseEvent<unknown>, id: string) => {
        const selectedIndex = selected.indexOf(id);
        let newSelected: string[] = [];
        if (selectedIndex === -1) newSelected = newSelected.concat(selected, id);
        else if (selectedIndex === 0) newSelected = newSelected.concat(selected.slice(1));
        else if (selectedIndex === selected.length - 1) newSelected = newSelected.concat(selected.slice(0, -1));
        else if (selectedIndex > 0) newSelected = newSelected.concat(selected.slice(0, selectedIndex), selected.slice(selectedIndex + 1));
        setSelected(newSelected);
    };

    
const handleBulkDelete = async () => {
    if (selected.length === 0 || !window.confirm(`Sind Sie sicher, dass Sie ${selected.length} Artikel löschen möchten?`)) return;
    try {
        // KORREKTUR: Fügen Sie 'as any' hinzu, um den TypeScript-Fehler zu umgehen.
        await apiClient.delete('/api/admin/cronjobs/tracked-articles', { data: { ids: selected } } as any);
        showSnackbar(`${selected.length} Artikel gelöscht.`, 'success');
        setSelected([]);
        fetchArticles(1);
    } catch (err) {
        showSnackbar('Fehler beim Löschen der Artikel.', 'error');
    }
};
    
    const isSelected = (id: string) => selected.indexOf(id) !== -1;

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h4" component="h1">Gefundene Account Intelligence Artikel</Typography>
                    {selected.length > 0 && (
                        <Button color="error" variant="contained" startIcon={<DeleteIcon />} onClick={handleBulkDelete}>
                            {selected.length} Auswahl löschen
                        </Button>
                    )}
                </Box>
                
                <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                    <TextField label="Titel/Wettbewerber suchen..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} size="small" sx={{ flexGrow: 1, minWidth: '200px' }} />
                    <Autocomplete
                        options={accountOptions}
                        value={accountFilter}
                        onChange={(_, newValue) => setAccountFilter(newValue)}
                        renderInput={(params) => <TextField {...params} label="Account filtern" size="small" />}
                        sx={{ minWidth: 220 }}
                    />
                    <TextField label="Start-Datum" type="date" size="small" InputLabelProps={{ shrink: true }} value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <TextField label="End-Datum" type="date" size="small" InputLabelProps={{ shrink: true }} value={endDate} onChange={e => setEndDate(e.target.value)} />
                    <Button variant="contained" startIcon={<FilterListIcon />} onClick={() => fetchArticles(1)}>Filtern</Button>
                </Paper>

                <Paper>
                    {loading && articles.length === 0 ? <CircularProgress sx={{ m: 4 }} /> : error ? <Alert severity="error">{error}</Alert> : (
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell padding="checkbox">
                                            <Checkbox
                                                indeterminate={selected.length > 0 && selected.length < articles.length}
                                                checked={articles.length > 0 && selected.length === articles.length}
                                                onChange={handleSelectAllClick}
                                            />
                                        </TableCell>
                                        {headCells.map(headCell => (
                                            <TableCell key={headCell.id} sortDirection={orderBy === headCell.id ? order : false}>
                                                <TableSortLabel active={orderBy === headCell.id} direction={order} onClick={() => handleSortRequest(headCell.id)}>
                                                    {headCell.label}
                                                </TableSortLabel>
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {articles.map((article) => {
                                        const isItemSelected = isSelected(article.id);
                                        return(
                                            <TableRow key={article.id} hover onClick={(event) => handleClick(event, article.id)} role="checkbox" tabIndex={-1} selected={isItemSelected}>
                                                <TableCell padding="checkbox"><Checkbox checked={isItemSelected} /></TableCell>
                                                <TableCell>
                                                    <MuiLink href={article.article_url} target="_blank" rel="noopener noreferrer" sx={{ fontWeight: 'bold' }}>{article.article_title}</MuiLink>
                                                    <Typography variant="body2" color="text.secondary">{article.source_name}</Typography>
                                                </TableCell>
                                                <TableCell>{article.account_name}</TableCell>
                                                <TableCell>{article.competitor_name || '-'}</TableCell>
                                                <TableCell>{formatTimestamp(article.published_at)}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Paper>
                <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2 }}>
                    <Pagination count={totalPages} page={page} onChange={(_, value) => fetchArticles(value)} color="primary" />
                </Box>
            </Container>
        </DashboardLayout>
    );
};

export default AdminTrackedArticlesPage;