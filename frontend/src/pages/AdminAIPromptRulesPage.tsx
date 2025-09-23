import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Grid, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Tooltip, Chip, Snackbar, Stack, TextField, MenuItem,
    Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, FormControlLabel, Switch, Tabs, Tab, LinearProgress
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DashboardLayout from '../components/DashboardLayout';
import AdminScheduleSelector from '../components/AdminScheduleSelector';
import apiClient from '../apiClient';
import { Autocomplete } from '@mui/material';

interface AIPromptRule {
    id: string; name: string; prompt_template: string; ai_provider: string | null; output_format: string | null;
    keywords: string[] | null; region: string | null; schedule: string | null; is_active: boolean;
    default_category_id: string | null;
    purpose: 'content_generation' | 'funding_discovery';
}
interface Region { id: string; name: string; }
interface Category { id: string; name: string; }
interface FormState {
    name: string; promptPersona: string; promptTask: string; promptFormat: string; ai_provider: string;
    output_format: string; keywords: string[]; region: string; schedule: string | null; is_active: boolean;
    category_id: string;
    purpose: string;
}
interface TestState { inputText: string; focus_page: string; }

const PROMPT_SEPARATOR = '+++';
const placeholders = ['{{data}}', '{{category}}', '{{region}}', '{{focus_page}}'];
const initialFormState: FormState = {
    name: '', promptPersona: '', promptTask: '', promptFormat: '', ai_provider: '',
    output_format: 'text', keywords: [], region: '', schedule: null, is_active: true, category_id: '',
    purpose: 'content_generation'
};
const initialTestState: TestState = { inputText: '', focus_page: '' };

const AdminAIPromptRulesPage: React.FC = () => {
    const [rules, setRules] = useState<AIPromptRule[]>([]);
    const [regions, setRegions] = useState<Region[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [aiProviders, setAiProviders] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingRule, setEditingRule] = useState<AIPromptRule | null>(null);
    const [formState, setFormState] = useState(initialFormState);
    const [testState, setTestState] = useState(initialTestState);
    const [snackbar, setSnackbar] = useState<{ open: boolean, message: string }>({ open: false, message: '' });
    const [searchTerm, setSearchTerm] = useState('');
    const [dialogTab, setDialogTab] = useState(0);
    const [logModalOpen, setLogModalOpen] = useState(false);
    const [currentJobId, setCurrentJobId] = useState<string | null>(null);
    const [jobLogs, setJobLogs] = useState<{ log_level: string, message: string, created_at: string }[]>([]);
    const [jobStatus, setJobStatus] = useState<string | null>(null);
    const [finalJobResult, setFinalJobResult] = useState<string | null>(null);
    const [activePromptField, setActivePromptField] = useState<keyof FormState | null>(null);
    const inputRefs = {
        promptPersona: useRef<HTMLInputElement>(null),
        promptTask: useRef<HTMLInputElement>(null),
        promptFormat: useRef<HTMLInputElement>(null),
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('jwt_token');
            const [rulesRes, regionsRes, providersRes, categoriesRes] = await Promise.all([
                apiClient.get('/api/admin/ai-prompt-rules', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/data/regions', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/ai-prompt-rules/providers', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/categories', { headers: { 'x-auth-token': token } })
            ]);
            setRules(rulesRes.data);
            setRegions(regionsRes.data);
            setAiProviders(providersRes.data);
            setCategories(categoriesRes.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Daten.');
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        if (!currentJobId || !logModalOpen || (jobStatus !== 'running' && jobStatus !== 'pending')) return;
        const interval = setInterval(async () => {
             try {
                const token = localStorage.getItem('jwt_token');
                const res = await apiClient.get(`/api/admin/ai/logs/${currentJobId}`, { headers: { 'x-auth-token': token } });
                setJobLogs(res.data.logs);
                setJobStatus(res.data.status);
                if (res.data.status === 'completed' && res.data.result) {
                    setFinalJobResult(res.data.result);
                }
            } catch (e) {
                console.error("Fehler beim Log-Polling:", e);
                setJobStatus('failed');
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [currentJobId, logModalOpen, jobStatus]);

    const handleOpenDialog = (rule: AIPromptRule | null = null) => {
        if (rule) {
            const [promptPersona = '', promptTask = '', promptFormat = ''] = rule.prompt_template.split(PROMPT_SEPARATOR);
            setEditingRule(rule);
            setFormState({
                name: rule.name, promptPersona, promptTask, promptFormat,
                ai_provider: rule.ai_provider || '',
                output_format: rule.output_format || 'text',
                keywords: rule.keywords || [],
                region: rule.region || '',
                schedule: rule.schedule || null,
                is_active: rule.is_active,
                category_id: rule.default_category_id || '',
                purpose: rule.purpose || 'content_generation'
            });
        } else {
            setEditingRule(null);
            setFormState(initialFormState);
        }
        setTestState(initialTestState);
        setDialogTab(0);
        setOpenDialog(true);
    };
    
    const handleCloseDialog = () => setOpenDialog(false);
    
    const handleCloseLogModal = () => {
        setLogModalOpen(false);
        setCurrentJobId(null);
        setJobLogs([]);
        setJobStatus(null);
        setFinalJobResult(null);
    };

    const handleSubmit = async () => {
        const { name, promptPersona, promptTask, ...rest } = formState;
        if (!name || !promptPersona || !promptTask || !rest.ai_provider) {
            alert('Name, Persona, Aufgabe und KI-Provider sind Pflichtfelder.');
            return;
        }
        const ruleData = {
            ...rest,
            name,
            prompt_persona: promptPersona,
            prompt_task: promptTask,
            prompt_format: rest.promptFormat,
            category_id: rest.category_id || null
        };
        try {
            const token = localStorage.getItem('jwt_token');
            const method = editingRule?.id ? 'put' : 'post';
            const url = editingRule?.id ? `/api/admin/ai-prompt-rules/${editingRule.id}` : '/api/admin/ai-prompt-rules';
            
            await apiClient[method](url, ruleData, { headers: { 'x-auth-token': token } });
            setSnackbar({ open: true, message: 'Regel erfolgreich gespeichert.' });
            handleCloseDialog();
            fetchData();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler beim Speichern.');
        }
    };
    
    const handleTriggerRule = async (rule: AIPromptRule) => {
        if (!window.confirm(`Möchten Sie die Regel "${rule.name}" jetzt einmalig ausführen? Es werden die gespeicherten Keywords und die Region verwendet.`)) return;
        
        setJobLogs([{ log_level: 'INFO', message: `Starte manuellen Job für Regel "${rule.name}"...`, created_at: new Date().toISOString() }]);
        setFinalJobResult(null);
        setCurrentJobId(null);
        setJobStatus('pending');
        setLogModalOpen(true);

        try {
            const token = localStorage.getItem('jwt_token');
            const res = await apiClient.post(`/api/admin/ai-prompt-rules/${rule.id}/trigger`, {}, { headers: { 'x-auth-token': token } });
            
            if (res.data.jobId) {
                setCurrentJobId(res.data.jobId);
                setJobStatus('running');
            } else {
                 throw new Error("Server hat keine Job-ID zurückgegeben.");
            }
        } catch (err: any) {
            const message = err.response?.data?.message || 'Fehler beim Starten des Jobs.';
            setJobLogs(prev => [...prev, { log_level: 'ERROR', message: message, created_at: new Date().toISOString() }]);
            setSnackbar({ open: true, message: message });
            setJobStatus('failed');
        }
    };
    
    const handleManualExecution = async () => {
        if (!editingRule || !testState.inputText) {
            alert("Es muss eine Regel ausgewählt und ein Eingabetext (data) vorhanden sein, um einen Testlauf zu starten.");
            return;
        }
        handleCloseDialog();
        setLogModalOpen(true);
        setJobStatus('pending');
        try {
            const token = localStorage.getItem('jwt_token');
            const [prompt_persona, prompt_task, prompt_format] = editingRule.prompt_template.split(PROMPT_SEPARATOR);
            const payload = {
                ruleId: editingRule.id,
                ruleData: {
                    name: editingRule.name,
                    prompt_template: [prompt_persona, prompt_task, prompt_format].join(PROMPT_SEPARATOR),
                    ai_provider: editingRule.ai_provider,
                    output_format: editingRule.output_format,
                },
                inputText: testState.inputText,
                region: formState.region || null,
                categoryId: formState.category_id || null,
                focus_page: testState.focus_page || null,
            };
            const res = await apiClient.post('/api/admin/ai-prompt-rules/execute', payload, { headers: { 'x-auth-token': token } });
            setCurrentJobId(res.data.jobId);
            setJobStatus('running');
        } catch (err: any) {
            setJobStatus('failed');
        }
    };

    const handleDuplicateRule = async (ruleId: string) => {
        if (!window.confirm('Möchten Sie diese Regel wirklich duplizieren?')) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.post(`/api/admin/ai-prompt-rules/${ruleId}/duplicate`, {}, { headers: { 'x-auth-token': token } });
            setSnackbar({ open: true, message: 'Regel erfolgreich dupliziert.' });
            fetchData();
            handleCloseDialog();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler beim Duplizieren der Regel.');
        }
    };

    const handleDeleteRule = async (ruleId: string) => {
        if (!window.confirm('Sind Sie sicher, dass Sie diese Regel endgültig löschen möchten?')) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.delete(`/api/admin/ai-prompt-rules/${ruleId}`, { headers: { 'x-auth-token': token } });
            setSnackbar({ open: true, message: 'Regel erfolgreich gelöscht.' });
            fetchData();
            handleCloseDialog();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler beim Löschen der Regel.');
        }
    };

    const handleInsertPlaceholder = (placeholder: string) => {
        if (!activePromptField || !inputRefs[activePromptField as keyof typeof inputRefs]) return;
        const ref = inputRefs[activePromptField as keyof typeof inputRefs];
        if (ref.current) {
            const start = ref.current.selectionStart || 0;
            const end = ref.current.selectionEnd || 0;
            const text = (formState[activePromptField as keyof FormState] as string) || '';
            const newText = text.substring(0, start) + placeholder + text.substring(end);
            setFormState(prev => ({ ...prev, [activePromptField!]: newText }));
            setTimeout(() => {
                ref.current?.focus();
                ref.current!.selectionStart = ref.current!.selectionEnd = start + placeholder.length;
            }, 0);
        }
    };

    const filteredRules = useMemo(() => {
        return rules.filter(rule =>
            (rule.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (rule.keywords?.join(' ').toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [rules, searchTerm]);

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h4" component="h1">Redaktionelle KI-Regeln</Typography>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField
                            size="small"
                            placeholder="Suchen..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) }}
                        />
                        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
                            Neue KI-Regel
                        </Button>
                    </Box>
                </Box>
                {loading ? <CircularProgress /> : error ? <Alert severity="error">{error}</Alert> : (
                    <Paper>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Name</TableCell>
                                        <TableCell>Keywords</TableCell>
                                        <TableCell>Region</TableCell>
                                        <TableCell>Zeitplan</TableCell>
                                        <TableCell>Aktiv</TableCell>
                                        <TableCell>Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredRules.map((rule) => (
                                        <TableRow key={rule.id} hover>
                                            <TableCell>{rule.name}</TableCell>
                                            <TableCell><Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', maxWidth: 300 }}>{rule.keywords?.map(kw => <Chip key={kw} label={kw} size="small" />)}</Box></TableCell>
                                            <TableCell>{rule.region || '-'}</TableCell>
                                            <TableCell>{rule.schedule || 'Deaktiviert'}</TableCell>
                                            <TableCell><Switch checked={rule.is_active} disabled /></TableCell>
                                            <TableCell>
                                                <Tooltip title="Regel bearbeiten"><IconButton onClick={() => handleOpenDialog(rule)}><EditIcon /></IconButton></Tooltip>
                                                <Tooltip title="Jetzt ausführen"><IconButton onClick={() => handleTriggerRule(rule)}><PlayArrowIcon /></IconButton></Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                )}
                <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md">
                    <DialogTitle>{editingRule ? `KI-Regel: ${editingRule.name}` : 'Neue KI-Regel erstellen'}</DialogTitle>
                    <DialogContent>
                        <Tabs value={dialogTab} onChange={(_event, newValue) => setDialogTab(newValue)} sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                            <Tab label="Konfiguration & Planung" />
                            <Tab label="Prompt-Struktur" />
                            <Tab label="Sonstiges" />
                        </Tabs>
                        {dialogTab === 0 && (
                             <Grid container spacing={2}>
                                <Grid item xs={12}><TextField name="name" label="Name der Regel" fullWidth value={formState.name} onChange={e => setFormState(p => ({...p, name: e.target.value}))} required /></Grid>
                                <Grid item xs={12} sm={6}><TextField select name="ai_provider" label="KI-Provider" fullWidth value={formState.ai_provider} onChange={e => setFormState(p => ({...p, ai_provider: e.target.value}))} required>{aiProviders.map((p) => (<MenuItem key={p} value={p}>{p}</MenuItem>))}</TextField></Grid>
                                <Grid item xs={12} sm={6}>
                                    <TextField select name="purpose" label="Zweck der Regel" fullWidth value={formState.purpose} onChange={e => setFormState(p => ({...p, purpose: e.target.value}))} helperText="Bestimmt, wie das KI-Ergebnis verarbeitet wird.">
                                        <MenuItem value="content_generation">Inhalt generieren</MenuItem>
                                        <MenuItem value="funding_discovery">Förderung entdecken</MenuItem>
                                    </TextField>
                                </Grid>
                                <Grid item xs={12}><Autocomplete multiple freeSolo options={[]} value={formState.keywords} onChange={(_event, val) => setFormState(p => ({...p, keywords: val}))} renderInput={(params) => <TextField {...params} label="Keywords für Recherche" />} /></Grid>
                                <Grid item xs={6}><TextField select name="region" label="Region" fullWidth value={formState.region} onChange={e => setFormState(p => ({...p, region: e.target.value}))}>{regions.map(r => <MenuItem key={r.id} value={r.name}>{r.name}</MenuItem>)}</TextField></Grid>
                                <Grid item xs={6}><TextField select name="category_id" label="Standard-Kategorie" fullWidth value={formState.category_id || ''} onChange={e => setFormState(p => ({...p, category_id: e.target.value}))}><MenuItem value=""><em>Keine</em></MenuItem>{categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}</TextField></Grid>
                                <Grid item xs={12}><AdminScheduleSelector value={formState.schedule} onChange={(cron) => setFormState(p => ({...p, schedule: cron}))} /></Grid>
                                <Grid item xs={12}><FormControlLabel control={<Switch checked={formState.is_active} name="is_active" onChange={(e) => setFormState(p => ({...p, is_active: e.target.checked}))} />} label="Cronjob aktiv" /></Grid>
                            </Grid>
                        )}
                        {dialogTab === 1 && (
                            <Box>
                                <TextField name="promptPersona" label="Rolle der KI" fullWidth multiline rows={4} value={formState.promptPersona} onChange={e => setFormState(p => ({...p, promptPersona: e.target.value}))} onFocus={() => setActivePromptField('promptPersona')} inputRef={inputRefs.promptPersona} required />
                                <TextField name="promptTask" label="Haupt-Aufgabe" fullWidth multiline rows={5} value={formState.promptTask} onChange={e => setFormState(p => ({...p, promptTask: e.target.value}))} onFocus={() => setActivePromptField('promptTask')} inputRef={inputRefs.promptTask} sx={{mt: 2}} required />
                                <TextField name="promptFormat" label="Formatierung (optional)" fullWidth multiline rows={3} value={formState.promptFormat} onChange={e => setFormState(p => ({...p, promptFormat: e.target.value}))} onFocus={() => setActivePromptField('promptFormat')} inputRef={inputRefs.promptFormat} sx={{mt: 2}} />
                                <Box sx={{ mt: 1 }}>
                                    <Stack direction="row" spacing={1} component="span">
                                        {placeholders.map(p => (<Chip key={p} label={p} onClick={() => handleInsertPlaceholder(p)} size="small" variant="outlined" clickable />))}
                                    </Stack>
                                </Box>
                            </Box>
                        )}
                        {dialogTab === 2 && (
                            <Box>
                                <Typography variant="h6" gutterBottom>Manueller Testlauf</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{mb: 2}}>
                                    Führen Sie diese Regel mit spezifischen Test-Daten aus. Der generierte Inhalt wird nicht dauerhaft gespeichert. Die oben gespeicherte Konfiguration (Keywords, Region) wird für diesen Test ignoriert.
                                </Typography>
                                <TextField label="Eingabetext ({{data}})" fullWidth multiline rows={8} value={testState.inputText} onChange={e => setTestState(p => ({...p, inputText: e.target.value}))} />
                                <TextField label="Fokus-Seite ({{focus_page}})" fullWidth value={testState.focus_page} onChange={e => setTestState(p => ({...p, focus_page: e.target.value}))} sx={{mt: 2}} />
                                <Button startIcon={<PlayArrowIcon />} sx={{mt:2}} variant="contained" onClick={handleManualExecution} disabled={!editingRule}>Testlauf starten</Button>
                            </Box>
                        )}
                    </DialogContent>
                    <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
                        <Box>
                            {editingRule && (
                                <>
                                    <Button startIcon={<ContentCopyIcon />} onClick={() => handleDuplicateRule(editingRule.id)}>Kopieren</Button>
                                    <Button startIcon={<DeleteIcon />} color="error" onClick={() => handleDeleteRule(editingRule.id)}>Löschen</Button>
                                </>
                            )}
                        </Box>
                        <Box>
                            <Button onClick={handleCloseDialog}>Abbrechen</Button>
                            <Button onClick={handleSubmit} variant="contained" startIcon={<SaveIcon/>}>Regel speichern</Button>
                        </Box>
                    </DialogActions>
                </Dialog>
                <Dialog open={logModalOpen} onClose={handleCloseLogModal} fullWidth maxWidth="md">
                    <DialogTitle>KI-Fortschritt</DialogTitle>
                    <DialogContent>
                        {(jobStatus === 'running' || jobStatus === 'pending') && <LinearProgress sx={{ mb: 2 }} />}
                        <Box component="pre" sx={{ maxHeight: 400, overflowY: 'auto', bgcolor: '#f5f5f5', p: 2, borderRadius: 1, whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>
                            {jobLogs.map((log, index) => (
                                <Typography key={index} component="div" variant="body2" sx={{ color: log.log_level === 'ERROR' ? 'red' : 'inherit' }}>
                                    <span style={{ color: 'gray' }}>[{new Date(log.created_at).toLocaleTimeString('de-AT')}]</span>
                                    <span style={{ fontWeight: 'bold', margin: '0 8px' }}>[{log.log_level}]</span>
                                    {log.message}
                                </Typography>
                            ))}
                        </Box>
                        {jobStatus === 'completed' && <Alert severity="success" sx={{mt: 2}}>Job erfolgreich abgeschlossen.</Alert>}
                        {finalJobResult && (
                            <Box sx={{ mt: 2 }}>
                                <Typography variant="h6" gutterBottom>Ergebnis</Typography>
                                <Paper variant="outlined" sx={{ p: 2, whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' }}>
                                    {finalJobResult}
                                </Paper>
                            </Box>
                        )}
                        {jobStatus === 'failed' && <Alert severity="error" sx={{mt: 2}}>Job mit Fehlern abgebrochen.</Alert>}
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseLogModal}>Schließen</Button>
                    </DialogActions>
                </Dialog>
                <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} message={snackbar.message} />
            </Container>
        </DashboardLayout>
    );
};

export default AdminAIPromptRulesPage;