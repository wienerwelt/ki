import React, { useState, useEffect, useCallback } from 'react';
import {
    Container, Typography, Box, Button, Paper, CircularProgress, Alert,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, Tooltip,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, Grid, Select, MenuItem,
    FormControl, InputLabel, Chip, SelectChangeEvent
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import BarChartIcon from '@mui/icons-material/BarChart';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CloseIcon from '@mui/icons-material/Close';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { useAuth } from '../context/AuthContext';
import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';

interface Survey {
    id: string;
    business_partner_id: string;
    business_partner_name: string;
    title: string;
    description?: string;
    status: 'draft' | 'active' | 'closed';
    start_date?: string;
    end_date?: string;
    created_at: string;
}

interface Question {
    id?: string;
    question_text: string;
    question_type: 'multiple-choice' | 'free-text';
    options: string[];
}

interface SurveyResult {
    id: string;
    question_text: string;
    question_type: 'multiple-choice' | 'free-text';
    options: string[];
    results: any[];
}

interface BusinessPartner {
    id: string;
    name: string;
}

const AdminSurveysPage: React.FC = () => {
    const { user } = useAuth();
    const { showSnackbar } = useSnackbar();
    const [surveys, setSurveys] = useState<Survey[]>([]);
    const [businessPartners, setBusinessPartners] = useState<BusinessPartner[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [resultsOpen, setResultsOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [currentSurvey, setCurrentSurvey] = useState<Partial<Survey> & { questions: Question[] }>({ title: '', description: '', status: 'draft', questions: [], business_partner_id: '' });
    const [currentResults, setCurrentResults] = useState<SurveyResult[]>([]);
    
    const isAssistant = user?.role === 'assistenz';

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // KORREKTUR: API-URL für Assistenten angepasst
            const surveyUrl = isAssistant ? `/api/surveys/admin?business_partner_id=${user.business_partner_id}` : '/api/surveys/admin';
            const [surveysRes, bpRes] = await Promise.all([
                apiClient.get(surveyUrl),
                user?.role === 'admin' ? apiClient.get('/api/admin/business-partners') : Promise.resolve({ data: [] })
            ]);
            setSurveys(surveysRes.data);
            setBusinessPartners(bpRes.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Daten.');
        } finally {
            setLoading(false);
        }
    }, [user?.role, user?.business_partner_id, isAssistant]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);
    
    const handleOpenDialog = async (survey: Survey | null = null) => {
        if (survey) {
            setIsEditMode(true);
            try {
                const response = await apiClient.get(`/api/surveys/admin/${survey.id}`);
                const surveyData = response.data;
                
                const formatDateTime = (dateStr: string | undefined) => dateStr ? new Date(dateStr).toISOString().slice(0, 16) : '';
                
                setCurrentSurvey({
                    ...surveyData,
                    start_date: formatDateTime(surveyData.start_date),
                    end_date: formatDateTime(surveyData.end_date)
                });
            } catch (err) {
                showSnackbar('Fehler beim Laden der Umfragedaten.', 'error');
                return;
            }
        } else {
            setIsEditMode(false);
            setCurrentSurvey({
                title: '', description: '', status: 'draft', questions: [{ question_text: '', question_type: 'multiple-choice', options: [''] }],
                business_partner_id: user?.role === 'admin' ? '' : (user?.business_partner_id ?? '')
            });
        }
        setDialogOpen(true);
    };

    const handleQuestionChange = (qIndex: number, field: keyof Question, value: any) => {
        const updatedQuestions = [...currentSurvey.questions];
        (updatedQuestions[qIndex] as any)[field] = value;
        if (field === 'question_type' && value === 'free-text') {
            updatedQuestions[qIndex].options = [];
        }
        setCurrentSurvey(prev => ({ ...prev, questions: updatedQuestions }));
    };

    const handleOptionChange = (qIndex: number, oIndex: number, value: string) => {
        const updatedQuestions = [...currentSurvey.questions];
        updatedQuestions[qIndex].options[oIndex] = value;
        setCurrentSurvey(prev => ({ ...prev, questions: updatedQuestions }));
    };

    const handleAddOption = (qIndex: number) => {
        const updatedQuestions = [...currentSurvey.questions];
        updatedQuestions[qIndex].options.push('');
        setCurrentSurvey(prev => ({ ...prev, questions: updatedQuestions }));
    };
    
    const handleRemoveOption = (qIndex: number, oIndex: number) => {
        const updatedQuestions = [...currentSurvey.questions];
        updatedQuestions[qIndex].options.splice(oIndex, 1);
        setCurrentSurvey(prev => ({ ...prev, questions: updatedQuestions }));
    };

    const handleAddQuestion = () => {
        setCurrentSurvey(prev => ({
            ...prev,
            questions: [...prev.questions, { question_text: '', question_type: 'multiple-choice', options: [''] }]
        }));
    };
    
    const handleRemoveQuestion = (qIndex: number) => {
        const updatedQuestions = [...currentSurvey.questions];
        updatedQuestions.splice(qIndex, 1);
        setCurrentSurvey(prev => ({ ...prev, questions: updatedQuestions }));
    };

    const handleSubmit = async () => {
        try {
            const payload = {
                ...currentSurvey,
                start_date: currentSurvey.start_date || null,
                end_date: currentSurvey.end_date || null
            };

            if (isEditMode) {
                await apiClient.put(`/api/surveys/admin/${currentSurvey.id}`, payload);
                showSnackbar('Umfrage erfolgreich aktualisiert.', 'success');
            } else {
                await apiClient.post('/api/surveys/admin', {
                    ...payload,
                    target_bp_id: currentSurvey.business_partner_id
                });
                showSnackbar('Umfrage erfolgreich erstellt.', 'success');
            }
            setDialogOpen(false);
            fetchData();
        } catch (err: any) {
            showSnackbar(err.response?.data?.message || 'Fehler beim Speichern der Umfrage.', 'error');
        }
    };

    const handleShowResults = async (survey: Survey) => {
        try {
            const response = await apiClient.get(`/api/surveys/admin/${survey.id}/results`);
            setCurrentSurvey({ ...survey, questions: [] });
            setCurrentResults(response.data);
            setResultsOpen(true);
        } catch (err: any) {
            showSnackbar('Fehler beim Laden der Ergebnisse.', 'error');
        }
    };
    
    const copyResultsToClipboard = () => {
        let clipboardText = `Auswertung der Umfrage: ${currentSurvey.title}\n\n`;
        currentResults.forEach((q, index) => {
            clipboardText += `Frage ${index + 1}: ${q.question_text}\n`;
            if (q.question_type === 'multiple-choice') {
                const totalVotes = q.results.reduce((acc, r) => acc + parseInt(r.count, 10), 0);
                q.results.forEach(res => {
                    const percentage = totalVotes > 0 ? ((parseInt(res.count, 10) / totalVotes) * 100).toFixed(1) : "0.0";
                    clipboardText += `- ${res.response_text}: ${res.count} Stimme(n) (${percentage}%)\n`;
                });
            } else {
                q.results.forEach(res => {
                    clipboardText += `- "${res.response_text}"\n`;
                });
            }
            clipboardText += "\n";
        });
        navigator.clipboard.writeText(clipboardText);
        showSnackbar('Ergebnisse in die Zwischenablage kopiert.', 'success');
    };

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4">Umfragen verwalten</Typography>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>Neue Umfrage</Button>
            </Box>

            {loading ? <CircularProgress /> : error ? <Alert severity="error">{error}</Alert> :
                <Paper><TableContainer><Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Titel</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell>Gültigkeit</TableCell>
                            {user?.role === 'admin' && <TableCell>Business Partner</TableCell>}
                            <TableCell align="right">Aktionen</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {surveys.map(s => (
                            <TableRow key={s.id}>
                                <TableCell>{s.title}</TableCell>
                                <TableCell><Chip label={s.status} color={s.status === 'active' ? 'success' : 'default'} size="small" /></TableCell>
                                <TableCell>{s.start_date ? new Date(s.start_date).toLocaleDateString() : 'Unbegrenzt'} - {s.end_date ? new Date(s.end_date).toLocaleDateString() : 'Unbegrenzt'}</TableCell>
                                {user?.role === 'admin' && <TableCell>{s.business_partner_name}</TableCell>}
                                <TableCell align="right">
                                    <Tooltip title="Ergebnisse anzeigen"><IconButton onClick={() => handleShowResults(s)}><BarChartIcon /></IconButton></Tooltip>
                                    <Tooltip title="Bearbeiten"><IconButton onClick={() => handleOpenDialog(s)}><EditIcon /></IconButton></Tooltip>
                                    <Tooltip title="Löschen"><IconButton color="error"><DeleteIcon /></IconButton></Tooltip>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table></TableContainer></Paper>
            }

            <Dialog open={resultsOpen} onClose={() => setResultsOpen(false)} fullWidth maxWidth="md">
                <DialogTitle>
                    Ergebnisse für "{currentSurvey.title}"
                    <IconButton onClick={() => setResultsOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {currentResults.map((q, index) => (
                        <Box key={q.id} sx={{ mb: 3 }}>
                            <Typography variant="h6">{index + 1}. {q.question_text}</Typography>
                            {q.question_type === 'multiple-choice' && (<Box>{q.results.map((res: any) => <Typography key={res.response_text}>- {res.response_text}: <strong>{res.count}</strong></Typography>)}</Box>)}
                            {q.question_type === 'free-text' && (<Box component="ul" sx={{ pl: 2 }}>{q.results.map((res: any, i) => <li key={i}><Typography variant="body2">"{res.response_text}"</Typography></li>)}</Box>)}
                        </Box>
                    ))}
                </DialogContent>
                <DialogActions>
                    <Button onClick={copyResultsToClipboard} startIcon={<ContentCopyIcon />}>Ergebnisse kopieren</Button>
                    <Button onClick={() => setResultsOpen(false)}>Schließen</Button>
                </DialogActions>
            </Dialog>
            
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="md">
                <DialogTitle>{isEditMode ? 'Umfrage bearbeiten' : 'Neue Umfrage erstellen'}</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        {user?.role === 'admin' && (
                             <Grid item xs={12}>
                                <FormControl fullWidth required>
                                    <InputLabel>Business Partner</InputLabel>
                                    <Select
                                        value={currentSurvey.business_partner_id || ''}
                                        label="Business Partner"
                                        onChange={(e: SelectChangeEvent) => setCurrentSurvey(p => ({...p, business_partner_id: e.target.value}))}
                                    >
                                        {businessPartners.map(bp => (
                                            <MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                        )}
                        <Grid item xs={12}><TextField label="Titel der Umfrage" fullWidth value={currentSurvey.title || ''} onChange={e => setCurrentSurvey(p => ({...p, title: e.target.value}))} /></Grid>
                        <Grid item xs={12}><TextField label="Beschreibung (optional)" fullWidth multiline rows={2} value={currentSurvey.description || ''} onChange={e => setCurrentSurvey(p => ({...p, description: e.target.value}))} /></Grid>
                        <Grid item xs={6}><TextField label="Start-Datum (optional)" type="datetime-local" fullWidth value={currentSurvey.start_date || ''} onChange={e => setCurrentSurvey(p => ({...p, start_date: e.target.value}))} InputLabelProps={{ shrink: true }} /></Grid>
                        <Grid item xs={6}><TextField label="End-Datum (optional)" type="datetime-local" fullWidth value={currentSurvey.end_date || ''} onChange={e => setCurrentSurvey(p => ({...p, end_date: e.target.value}))} InputLabelProps={{ shrink: true }} /></Grid>
                        <Grid item xs={12}>
                            <FormControl fullWidth>
                                <InputLabel>Status</InputLabel>
                                <Select value={currentSurvey.status || 'draft'} label="Status" onChange={e => setCurrentSurvey(p => ({...p, status: e.target.value as any}))}>
                                    <MenuItem value="draft">Entwurf</MenuItem>
                                    <MenuItem value="active">Aktiv</MenuItem>
                                    <MenuItem value="closed">Geschlossen</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        
                        <Grid item xs={12}><Typography variant="h6" sx={{ mt: 2 }}>Fragen</Typography></Grid>
                        
                        {currentSurvey.questions.map((q, qIndex) => (
                            <Grid item xs={12} component={Paper} variant="outlined" sx={{ p: 2, mt: 2, ml: 2 }} key={qIndex}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                    <Typography>Frage {qIndex + 1}</Typography>
                                    <Tooltip title="Frage entfernen"><IconButton size="small" onClick={() => handleRemoveQuestion(qIndex)}><RemoveCircleOutlineIcon/></IconButton></Tooltip>
                                </Box>
                                <TextField fullWidth label="Frage-Text" value={q.question_text} onChange={e => handleQuestionChange(qIndex, 'question_text', e.target.value)} sx={{ mb: 2 }} />
                                <FormControl fullWidth>
                                    <InputLabel>Frage-Typ</InputLabel>
                                    <Select value={q.question_type} label="Frage-Typ" onChange={e => handleQuestionChange(qIndex, 'question_type', e.target.value as 'multiple-choice' | 'free-text')}>
                                        <MenuItem value="multiple-choice">Multiple-Choice</MenuItem>
                                        <MenuItem value="free-text">Freitext</MenuItem>
                                    </Select>
                                </FormControl>
                                {q.question_type === 'multiple-choice' && (
                                    <Box sx={{ mt: 2, pl: 2 }}>
                                        {q.options.map((opt, oIndex) => (
                                            <Box key={oIndex} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                                <TextField fullWidth size="small" label={`Option ${oIndex + 1}`} value={opt} onChange={e => handleOptionChange(qIndex, oIndex, e.target.value)} />
                                                <Tooltip title="Option entfernen"><IconButton size="small" onClick={() => handleRemoveOption(qIndex, oIndex)}><CloseIcon fontSize="small" /></IconButton></Tooltip>
                                            </Box>
                                        ))}
                                        <Button size="small" startIcon={<AddCircleOutlineIcon />} onClick={() => handleAddOption(qIndex)}>Option hinzufügen</Button>
                                    </Box>
                                )}
                            </Grid>
                        ))}
                        <Grid item xs={12}><Button startIcon={<AddIcon />} onClick={handleAddQuestion}>Frage hinzufügen</Button></Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)}>Abbrechen</Button>
                    <Button onClick={handleSubmit} variant="contained">Speichern</Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
};

export default AdminSurveysPage;