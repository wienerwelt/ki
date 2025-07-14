import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Box, Typography, CircularProgress, MenuItem, Alert, List, ListItem, ListItemText, Divider,
    Dialog, DialogTitle, DialogContent, IconButton, Tooltip, Link as MuiLink,
    Pagination, Select, FormControl, InputLabel, SelectChangeEvent, Badge, Chip,
    TextField, InputAdornment, Card, CardMedia, CardContent
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import StarsIcon from '@mui/icons-material/Stars';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import ClickAwayListener from '@mui/material/ClickAwayListener';

// --- Interfaces ---
interface Action {
    id: string;
    layout_type: 'layout_1' | 'layout_2';
    title: string;
    content_text: string;
    link_url: string;
    image_url: string;
    is_read: boolean;
    created_at: string;
}

interface BpActionsWidgetProps extends BaseWidgetProps {
    icon?: React.ReactNode;
    title: string;
}

const AnimatedSearchBar: React.FC<{ onSearch: (term: string) => void }> = ({ onSearch }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { if (isExpanded) { setTimeout(() => inputRef.current?.focus(), 50); } }, [isExpanded]);
    const handleToggle = () => { if (isExpanded) { setSearchTerm(''); onSearch(''); } setIsExpanded((prev) => !prev); };
    const handleClickAway = () => { if (isExpanded && !searchTerm) setIsExpanded(false); };

    return (
        <ClickAwayListener onClickAway={handleClickAway}>
            <Box sx={{ display: 'flex', alignItems: 'center', height: '40px' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: isExpanded ? 'action.hover' : 'transparent', borderRadius: 40, width: isExpanded ? 180 : 32, transition: 'width 0.3s, background-color 0.3s' }}>
                    <Tooltip title={isExpanded ? "Suche schließen" : "Suchen"}><IconButton onClick={handleToggle} size="small" sx={{ ml: '4px' }}>{isExpanded ? <CloseIcon fontSize="small" /> : <SearchIcon />}</IconButton></Tooltip>
                    <Box sx={{ width: '100%', overflow: 'hidden' }}>
                        <TextField variant="standard" fullWidth value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); onSearch(e.target.value); }} placeholder="Suchen..." inputRef={inputRef} sx={{ opacity: isExpanded ? 1 : 0, transition: 'opacity 0.2s', pl: 1, pr: 1 }} InputProps={{ disableUnderline: true }} />
                    </Box>
                </Box>
            </Box>
        </ClickAwayListener>
    );
};

const BpActionsWidget: React.FC<BpActionsWidgetProps> = ({ onDelete, widgetId, isRemovable, icon, title }) => {
    const [items, setItems] = useState<Action[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedAction, setSelectedAction] = useState<Action | null>(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [sortBy, setSortBy] = useState('date');
    const [counts, setCounts] = useState({ unread: 0, new: 0 });
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

    useEffect(() => { const handler = setTimeout(() => { setDebouncedSearchTerm(searchTerm); }, 500); return () => { clearTimeout(handler); }; }, [searchTerm]);

    const fetchData = useCallback(async (currentPage: number, currentSortBy: string, search: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const params = new URLSearchParams({ page: String(currentPage), limit: '10', sortBy: currentSortBy });
            if (search) params.append('search', search);

            // KORRIGIERT: Die URL wurde von /api/dashboard/actions auf /api/data/actions geändert.
            const response = await apiClient.get(`/api/data/actions?${params.toString()}`, { headers: { 'x-auth-token': token } });
            setItems(response.data?.data || []);
            setTotalPages(response.data?.totalPages || 0);
            setCounts(response.data?.counts || { unread: 0, new: 0 });
        } catch (err: any) {
            setError(err.response?.data?.message || `Aktionen konnten nicht geladen werden.`);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { setPage(1); }, [sortBy, debouncedSearchTerm]);
    useEffect(() => { fetchData(page, sortBy, debouncedSearchTerm); }, [fetchData, page, sortBy, debouncedSearchTerm]);

    const handleOpenAction = async (action: Action) => {
        setSelectedAction(action);
        if (!action.is_read) {
            try {
                const token = localStorage.getItem('jwt_token');
                // KORRIGIERT: Die URL für "als gelesen markieren" wurde angepasst.
                await apiClient.post(`/api/data/actions/${action.id}/mark-as-read`, {}, { headers: { 'x-auth-token': token } });
                setItems(prev => prev.map(n => n.id === action.id ? { ...n, is_read: true } : n));
                setCounts(prev => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
            } catch (err) { console.error("Fehler beim Markieren als gelesen:", err); }
        }
    };

    const handleCloseDialog = () => setSelectedAction(null);

    const renderActionInDialog = (action: Action) => {
        const isLayout1 = action.layout_type === 'layout_1';
        return (
            <Card elevation={0} sx={{ display: 'flex', flexDirection: isLayout1 ? 'row' : 'column', backgroundColor: 'transparent' }}>
                <CardMedia component="img" sx={isLayout1 ? { width: '40%', flexShrink: 0 } : { width: '100%', height: 180 }} image={action.image_url} alt={action.title} />
                <CardContent sx={{ flex: '1 1 auto', p: 2 }}>
                    <Typography gutterBottom variant="h5" component="div">{action.title}</Typography>
                    <Typography variant="body1" color="text.secondary">{action.content_text}</Typography>
                    {action.link_url && <MuiLink href={action.link_url} target="_blank" rel="noopener" variant="body2" sx={{ mt: 2, display: 'block' }}>Mehr erfahren</MuiLink>}
                </CardContent>
            </Card>
        );
    };

    return (
        <WidgetPaper
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', width: '100%' }}>
                    {icon}
                    <Typography variant="h6">{title}</Typography>
                    <Badge badgeContent={counts.new} color="primary"><Chip label="Neu" size="small" variant="outlined" /></Badge>
                    <Badge badgeContent={counts.unread} color="secondary"><Chip label="Ungelesen" size="small" variant="outlined" /></Badge>
                    <Box sx={{ flexGrow: 1 }} />
                    <AnimatedSearchBar onSearch={setSearchTerm} />
                    <FormControl size="small" variant="outlined" sx={{ minWidth: 120 }}>
                        <InputLabel>Sortieren</InputLabel>
                        <Select value={sortBy} onChange={(e: SelectChangeEvent) => setSortBy(e.target.value)} label="Sortieren">
                            <MenuItem value="date">Neueste</MenuItem>
                            <MenuItem value="title">Titel</MenuItem>
                        </Select>
                    </FormControl>
                </Box>
            }
            widgetId={widgetId || ''} onDelete={onDelete} isRemovable={isRemovable} loading={isLoading} error={error}
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                    {items.length > 0 ? (
                        <List dense>
                            {items.map((item, index) => (
                                <React.Fragment key={item.id}>
                                    <ListItem button onClick={() => handleOpenAction(item)}>
                                        <ListItemText primary={<Typography variant="body2" sx={{ fontWeight: item.is_read ? 'normal' : 'bold' }}>{item.title}</Typography>} secondary={`Aktion vom ${new Date(item.created_at).toLocaleDateString('de-AT')}`} />
                                    </ListItem>
                                    {index < items.length - 1 && <Divider component="li" />}
                                </React.Fragment>
                            ))}
                        </List>
                    ) : ( <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>Keine Aktionen für Ihre Auswahl gefunden.</Typography> )}
                </Box>
                {totalPages > 1 && <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1, borderTop: 1, borderColor: 'divider' }}><Pagination count={totalPages} page={page} onChange={(e, value) => setPage(value)} size="small" /></Box>}
            </Box>

            <Dialog open={!!selectedAction} onClose={handleCloseDialog} fullWidth maxWidth="md">
                <DialogTitle sx={{ m: 0, p: 2 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>{selectedAction?.title}</Typography>
                        <IconButton aria-label="close" onClick={handleCloseDialog} sx={{ ml: 2 }}><CloseIcon /></IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent dividers>
                    {selectedAction && renderActionInDialog(selectedAction)}
                </DialogContent>
            </Dialog>
        </WidgetPaper>
    );
};

export default BpActionsWidget;
