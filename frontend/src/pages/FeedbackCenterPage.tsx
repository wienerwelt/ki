// frontend/src/pages/FeedbackCenterPage.tsx
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    Box, Typography, Button, CircularProgress, Alert, Paper, Tabs, Tab,
    Stack, Card, CardContent, CardActions, Chip, Tooltip, TextField,
    Select, MenuItem, FormControl, InputLabel, Grid, Container, Dialog, DialogTitle, DialogContent, IconButton
} from '@mui/material';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import CloseIcon from '@mui/icons-material/Close';
import SortIcon from '@mui/icons-material/Sort';
import apiClient from '../apiClient';
import { useAuth } from '../context/AuthContext';

// --- Interfaces & Hilfskomponenten ---

interface FeedbackItem {
    id: string;
    author_username: string;
    organization_name: string | null;
    type: 'bug' | 'suggestion' | 'idea';
    title: string;
    description: string;
    status: 'new' | 'in_review' | 'planned' | 'done' | 'rejected';
    votes: number;
    has_voted: boolean;
    created_at: string;
    widget_type_key?: string;
}

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

function TabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;
    return (
        <div role="tabpanel" hidden={value !== index} {...other}>
            {value === index && <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>{children}</Box>}
        </div>
    );
}

const getStatusChip = (status: FeedbackItem['status']) => {
    const statusMap = {
        new: { label: 'Neu', color: 'info' },
        in_review: { label: 'In Prüfung', color: 'secondary' },
        planned: { label: 'Geplant', color: 'primary' },
        done: { label: 'Umgesetzt', color: 'success' },
        rejected: { label: 'Abgelehnt', color: 'error' }
    };
    const { label, color } = statusMap[status] || { label: status, color: 'default' };
    return <Chip label={label} color={color as any} size="small" />;
};


// --- Hauptkomponente ---

const FeedbackCenterPage: React.FC = () => {
const { user, refreshUser } = useAuth();
    const isAdmin = user?.role === 'admin';
    const location = useLocation();
    const navigate = useNavigate();

    const [items, setItems] = React.useState<FeedbackItem[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [tabIndex, setTabIndex] = React.useState(0);
    const [selectedItem, setSelectedItem] = React.useState<FeedbackItem | null>(null);
    const [sortBy, setSortBy] = React.useState<'created_at' | 'type'>('created_at');

    const [formType, setFormType] = React.useState<'bug' | 'suggestion' | 'idea'>('idea');
    const [formTitle, setFormTitle] = React.useState('');
    const [formDescription, setFormDescription] = React.useState('');
    const [formWidgetKey, setFormWidgetKey] = React.useState('');
    const [submitLoading, setSubmitLoading] = React.useState(false);

    React.useEffect(() => {
        const { state } = location;
        if (state?.widget) {
            setTabIndex(2);
            setFormType(state.type || 'suggestion');
            setFormTitle(state.type === 'bug' ? `Fehler im Widget: ${state.widget}` : `Vorschlag für Widget: ${state.widget}`);
            setFormDescription(state.error ? `Fehlermeldung: ${state.error}\n\nBitte beschreiben Sie, was Sie getan haben:` : '');
            setFormWidgetKey(state.widgetKey || '');
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate]);

    const fetchData = React.useCallback(async () => {
        // setLoading(true); // Nur beim ersten Mal voll laden
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.get('/api/feedback', { headers: { 'x-auth-token': token } });
            setItems(response.data);
        } catch (err) {
            setError('Feedback konnte nicht geladen werden.');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleVote = async (itemId: string) => {
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.post(`/api/feedback/${itemId}/vote`, {}, { headers: { 'x-auth-token': token } });
            fetchData();
        } catch (err) {
            alert('Fehler bei der Stimmabgabe.');
        }
    };

    const handleStatusChange = async (itemId: string, newStatus: FeedbackItem['status']) => {
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.put(`/api/feedback/${itemId}/status`, { status: newStatus }, { headers: { 'x-auth-token': token } });
            fetchData();
        } catch (err) {
            alert('Fehler beim Ändern des Status.');
        }
    };

    const handleSubmitFeedback = async () => {
        if (!formTitle || !formDescription) {
            alert('Bitte füllen Sie Titel und Beschreibung aus.');
            return;
        }
        setSubmitLoading(true);
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.post('/api/feedback', {
                type: formType, title: formTitle, description: formDescription, widget_type_key: formWidgetKey
            }, { headers: { 'x-auth-token': token } });

            // NEU: Nach dem erfolgreichen Senden stoßen wir die Aktualisierung an
            await refreshUser();
            
            // Bisherige Aktionen nach Erfolg:
            setFormTitle(''); setFormDescription(''); setFormWidgetKey('');
            setTabIndex(0);
            fetchData();

        } catch (err) {
            alert('Fehler beim Senden des Feedbacks.');
        } finally {
            setSubmitLoading(false);
        }
    };
    
    const myItems = items.filter(item => item.author_username === user?.username);
    const newItems = React.useMemo(() => {
        const filtered = items.filter(item => item.status === 'new');
        if (sortBy === 'type') {
            return filtered.sort((a, b) => a.type.localeCompare(b.type));
        }
        return filtered; // Standard ist nach Datum (kommt von API)
    }, [items, sortBy]);
    
    const boardColumns: { status: FeedbackItem['status']; title: string }[] = [
        { status: 'in_review', title: 'In Prüfung' },
        { status: 'planned', title: 'Geplant' },
        { status: 'done', title: 'Umgesetzt' }
    ];

    return (
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            <Typography variant="h4" sx={{ mb: 2 }}>Feedback & Ideen-Center</Typography>
            <Paper>
                <Tabs value={tabIndex} onChange={(e, newValue) => setTabIndex(newValue)} centered variant="scrollable" scrollButtons="auto">
                    <Tab label="Ideen-Board" />
                    <Tab label={`Meine Meldungen (${myItems.length})`} />
                    <Tab label="Neue Meldung erstellen" />
                </Tabs>

                <TabPanel value={tabIndex} index={0}>
                    {loading ? <CircularProgress /> : 
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={6} lg={3} key="new">
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: 2, borderColor: 'divider', pb: 1, mb: 1 }}>
                                <Typography variant="h6">Neue Ideen</Typography>
                                <Tooltip title="Sortieren">
                                    <IconButton size="small" onClick={() => setSortBy(prev => prev === 'created_at' ? 'type' : 'created_at')}>
                                        <SortIcon />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                            <Stack spacing={2}>
                                {newItems.map(item => (
                                    <FeedbackCard key={item.id} item={item} onVote={handleVote} onClick={() => setSelectedItem(item)} isAdmin={isAdmin} onStatusChange={handleStatusChange} />
                                ))}
                            </Stack>
                        </Grid>
                        {boardColumns.map(col => (
                            <Grid item xs={12} md={6} lg={3} key={col.status}>
                                <Typography variant="h6" sx={{ textTransform: 'capitalize', mb: 1, borderBottom: 2, borderColor: 'divider', pb: 1 }}>
                                    {col.title}
                                </Typography>
                                <Stack spacing={2}>
                                    {items.filter(item => item.status === col.status).map(item => (
                                        <FeedbackCard key={item.id} item={item} onVote={handleVote} onClick={() => setSelectedItem(item)} isAdmin={isAdmin} onStatusChange={handleStatusChange} />
                                    ))}
                                </Stack>
                            </Grid>
                        ))}
                    </Grid>}
                </TabPanel>

                <TabPanel value={tabIndex} index={1}>
                     {loading ? <CircularProgress /> : myItems.length > 0 ? (
                        <Stack spacing={2}>
                            {myItems.map(item => (
                                <FeedbackCard key={item.id} item={item} onVote={handleVote} onClick={() => setSelectedItem(item)} isAdmin={isAdmin} onStatusChange={handleStatusChange} />
                            ))}
                        </Stack>
                    ) : (
                        <Typography sx={{ textAlign: 'center', p: 3 }}>Sie haben noch keine Meldungen erstellt.</Typography>
                    )}
                </TabPanel>

                <TabPanel value={tabIndex} index={2}>
                    <Box sx={{ maxWidth: 600, mx: 'auto' }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>Was möchten Sie uns mitteilen?</Typography>
                        <Stack spacing={2}>
                            <FormControl fullWidth>
                                <InputLabel>Art der Meldung</InputLabel>
                                <Select value={formType} label="Art der Meldung" onChange={(e) => setFormType(e.target.value as any)}>
                                    <MenuItem value="idea">🚀 Idee</MenuItem>
                                    <MenuItem value="suggestion">💡 Vorschlag</MenuItem>
                                    <MenuItem value="bug">🐞 Fehler</MenuItem>
                                </Select>
                            </FormControl>
                            <TextField autoFocus label="Titel / Kurzbeschreibung" fullWidth value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
                            <TextField label="Beschreibung" fullWidth multiline rows={8} value={formDescription} onChange={(e) => setFormDescription(e.target.value)} />
                            <Button onClick={handleSubmitFeedback} variant="contained" disabled={submitLoading} sx={{ alignSelf: 'flex-end' }}>
                                {submitLoading ? <CircularProgress size={24} /> : 'Meldung absenden'}
                            </Button>
                        </Stack>
                    </Box>
                </TabPanel>
            </Paper>

            <Dialog open={!!selectedItem} onClose={() => setSelectedItem(null)} fullWidth maxWidth="sm">
                <DialogTitle>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6">{selectedItem?.title}</Typography>
                        <IconButton onClick={() => setSelectedItem(null)}><CloseIcon /></IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent dividers>
                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                        {selectedItem?.description}
                    </Typography>
                </DialogContent>
            </Dialog>
        </Container>
    );
};

const FeedbackCard: React.FC<{ 
    item: FeedbackItem; 
    onVote: (id: string) => void; 
    onClick: () => void;
    isAdmin: boolean;
    onStatusChange: (id: string, status: FeedbackItem['status']) => void;
}> = ({ item, onVote, onClick, isAdmin, onStatusChange }) => {
    const typeMap = {
        bug: { label: 'Fehler', icon: '🐞' },
        suggestion: { label: 'Vorschlag', icon: '💡' },
        idea: { label: 'Idee', icon: '🚀' }
    };
    const { label, icon } = typeMap[item.type] || { label: item.type, icon: '' };
    
    return (
        <Card variant="outlined" sx={{ '&:hover': { boxShadow: 3 } }}>
            <CardContent onClick={onClick} sx={{ cursor: 'pointer' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Chip label={label} size="small" variant="outlined" icon={<span>{icon}</span>} />
                    {isAdmin ? (
                        <Select
                            value={item.status}
                            size="small"
                            sx={{'.MuiOutlinedInput-notchedOutline': { border: 0 }}}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => onStatusChange(item.id, e.target.value as FeedbackItem['status'])}
                        >
                            <MenuItem value="new">Neu</MenuItem>
                            <MenuItem value="in_review">In Prüfung</MenuItem>
                            <MenuItem value="planned">Geplant</MenuItem>
                            <MenuItem value="done">Umgesetzt</MenuItem>
                            <MenuItem value="rejected">Abgelehnt</MenuItem>
                        </Select>
                    ) : getStatusChip(item.status)}
                </Box>
                <Typography variant="body1" sx={{ fontWeight: 'bold' }}>{item.title}</Typography>
                <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 1 }}>
                    {item.description}
                </Typography>
            </CardContent>
            <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
                <Box>
                    <Typography variant="caption" color="text.secondary">
                        von {item.author_username} 
                        {item.organization_name && ` (${item.organization_name})`}
                    </Typography>
                    {isAdmin && (
                        <Typography variant="caption" display="block" color="text.disabled">
                           {new Date(item.created_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short'})}
                        </Typography>
                    )}
                </Box>
                <Tooltip title="Zustimmen">
                    <Button 
                        size="small" 
                        variant={item.has_voted ? "contained" : "outlined"}
                        color={item.has_voted ? "success" : "inherit"}
                        startIcon={item.has_voted ? <ThumbUpIcon /> : <ThumbUpOutlinedIcon />} 
                        onClick={(e) => { e.stopPropagation(); onVote(item.id); }}
                    >
                        {item.votes}
                    </Button>
                </Tooltip>
            </CardActions>
        </Card>
    );
};

export default FeedbackCenterPage;
