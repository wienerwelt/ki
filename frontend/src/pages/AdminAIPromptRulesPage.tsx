// src/pages/AdminAIPromptRulesPage.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Grid, List, ListItem,
    ListItemButton, ListItemText, TextField, MenuItem, Divider, LinearProgress,
    CircularProgress as ButtonSpinner, Tooltip, IconButton, Tabs, Tab, Autocomplete, Chip, Snackbar, Stack
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import ScheduleSendIcon from '@mui/icons-material/ScheduleSend';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import DashboardLayout from '../components/DashboardLayout';
import AdminScheduleSelector from '../components/AdminScheduleSelector';
import apiClient from '../apiClient';

// --- Interfaces ---
interface AIPromptRule { id: string; name: string; prompt_template: string; ai_provider: string | null; output_format: string | null; }
interface Category { id: string; name: string; }
interface UserOption { id: string; email: string; business_partner_name: string | null; role: string; }
interface Region { id: string; name: string; }

// --- Konstanten & Initialer Zustand ---
const PROMPT_SEPARATOR = '<!--PROMPT_PART_SEPARATOR-->';
const placeholders = ['{{data}}', '{{category}}', '{{region}}', '{{focus_page}}'];

const initialWorkspaceState = {
    ruleId: null as string | null,
    ruleName: '',
    promptPersona: '',
    promptTask: '',
    promptFormat: '',
    ai_provider: '',
    output_format: 'text',
    inputText: '',
    region: '',
    categoryId: '',
    focus_page: '',
};

const formatCronToGerman = (cron: string | null): string => {
    if (!cron) return "Nicht geplant";
    try {
        const parts = cron.split(' ');
        if (parts.length !== 5) return "Ungültiges Format";
        const [minute, hour, dayOfMonth, , dayOfWeek] = parts;
        const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        const weekDays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
        if (dayOfMonth !== '*' && dayOfWeek === '*') return `Jeden ${dayOfMonth}. des Monats um ${time} Uhr`;
        if (dayOfWeek !== '*' && dayOfMonth === '*') return `Jeden ${weekDays[parseInt(dayOfWeek, 10)]} um ${time} Uhr`;
        if (dayOfMonth === '*' && dayOfWeek === '*') return `Täglich um ${time} Uhr`;
        return cron;
    } catch { return "Ungültiges Format"; }
};

const AdminAIPromptRulesPage: React.FC = () => {
    const navigate = useNavigate();
    const [rules, setRules] = useState<AIPromptRule[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [aiProviders, setAiProviders] = useState<string[]>([]);
    const [users, setUsers] = useState<UserOption[]>([]);
    const [regions, setRegions] = useState<Region[]>([]);
    const [workspaceState, setWorkspaceState] = useState(initialWorkspaceState);
    const [logModalOpen, setLogModalOpen] = useState(false);
    const [currentJobId, setCurrentJobId] = useState<string | null>(null);
    const [jobLogs, setJobLogs] = useState<{ log_level: string, message: string, created_at: string }[]>([]);
    const [jobStatus, setJobStatus] = useState<string | null>(null);
    const [finalJobResult, setFinalJobResult] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [snackbar, setSnackbar] = useState<{ open: boolean, message: string }>({ open: false, message: '' });

    const [executionType, setExecutionType] = useState<'once' | 'scheduled'>('once');
    const [scheduleKeywords, setScheduleKeywords] = useState<string[]>([]);
    const [scheduleUserId, setScheduleUserId] = useState('');
    const [scheduleCategoryId, setScheduleCategoryId] = useState('');
    const [scheduleCron, setScheduleCron] = useState<string | null>('0 8 * * *');
    
    const [activePromptField, setActivePromptField] = useState<keyof typeof initialWorkspaceState | null>(null);
    const inputRefs = {
        promptPersona: useRef<HTMLInputElement>(null),
        promptTask: useRef<HTMLInputElement>(null),
        promptFormat: useRef<HTMLInputElement>(null),
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const [rulesRes, categoriesRes, providersRes, usersRes, regionsRes] = await Promise.all([
                apiClient.get('/api/admin/ai-prompt-rules', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/categories', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/ai-prompt-rules/providers', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/users', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/data/regions', { headers: { 'x-auth-token': token } })
            ]);
            setRules(rulesRes.data);
            setCategories(categoriesRes.data);
            setAiProviders(providersRes.data);
            setUsers(usersRes.data.map((u: any) => ({ id: u.id, email: u.email, business_partner_name: u.business_partner_name, role: u.role })));
            setRegions(regionsRes.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Initialdaten.');
        } finally {
            setLoading(false);
        }
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

    const handleSelectRule = (rule: AIPromptRule) => {
        const [promptPersona = '', promptTask = '', promptFormat = ''] = rule.prompt_template.split(PROMPT_SEPARATOR);
        setWorkspaceState(prev => ({
            ...prev,
            ruleId: rule.id,
            ruleName: rule.name,
            promptPersona,
            promptTask,
            promptFormat,
            ai_provider: rule.ai_provider || '',
            output_format: rule.output_format || 'text',
        }));
        setError(null);
    };
    
    const handleNewRule = () => {
        setWorkspaceState(prev => ({
            ...initialWorkspaceState,
            inputText: prev.inputText,
            region: prev.region,
            categoryId: prev.categoryId,
            focus_page: prev.focus_page,
        }));
        setError(null);
    };

    const handleWorkspaceChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = event.target;
        setWorkspaceState(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveRule = async () => {
        if (!workspaceState.ruleName || !workspaceState.promptPersona || !workspaceState.promptTask || !workspaceState.ai_provider) {
            setError("Name, Persona, Aufgabe und KI-Provider sind Pflichtfelder.");
            return;
        }
        setIsSaving(true);
        setError(null);
        const token = localStorage.getItem('jwt_token');
        const ruleData = {
            name: workspaceState.ruleName,
            prompt_persona: workspaceState.promptPersona,
            prompt_task: workspaceState.promptTask,
            prompt_format: workspaceState.promptFormat,
            ai_provider: workspaceState.ai_provider,
            output_format: workspaceState.output_format,
        };
        try {
            if (workspaceState.ruleId) {
                await apiClient.put(`/api/admin/ai-prompt-rules/${workspaceState.ruleId}`, ruleData, { headers: { 'x-auth-token': token } });
            } else {
                const res = await apiClient.post('/api/admin/ai-prompt-rules', ruleData, { headers: { 'x-auth-token': token } });
                handleSelectRule(res.data);
            }
            await fetchData();
            setSnackbar({ open: true, message: 'Regel erfolgreich gespeichert.' });
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Speichern der Regel.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleExecution = async () => {
        setError(null);
        setIsExecuting(true);
        const token = localStorage.getItem('jwt_token');

        if (executionType === 'once') {
            if (!workspaceState.promptPersona || !workspaceState.promptTask || !workspaceState.ai_provider || !workspaceState.inputText) {
                setError("Für die Generierung sind eine Persona, eine Aufgabe, ein KI-Provider und ein Eingabetext erforderlich.");
                setIsExecuting(false);
                return;
            }
            setJobLogs([{ log_level: 'INFO', message: 'Initialisiere KI-Job...', created_at: new Date().toISOString() }]);
            setFinalJobResult(null);
            setLogModalOpen(true);
            setJobStatus('pending');

            const payload = {
                ruleId: workspaceState.ruleId,
                ruleData: {
                    name: workspaceState.ruleName,
                    prompt_template: [workspaceState.promptPersona, workspaceState.promptTask, workspaceState.promptFormat].join(PROMPT_SEPARATOR),
                    ai_provider: workspaceState.ai_provider,
                    output_format: workspaceState.output_format,
                },
                inputText: workspaceState.inputText,
                region: workspaceState.region || null,
                categoryId: workspaceState.categoryId || null,
                focus_page: workspaceState.focus_page || null,
            };

            try {
                const res = await apiClient.post('/api/admin/ai-prompt-rules/execute', payload, { headers: { 'x-auth-token': token } });
                setCurrentJobId(res.data.jobId);
                setJobStatus('running');
            } catch (err: any) {
                const errorMessage = err.response?.data?.message || 'Fehler bei der Job-Initialisierung.';
                setJobLogs(prev => [...prev, { log_level: 'ERROR', message: errorMessage, created_at: new Date().toISOString() }]);
                setJobStatus('failed');
            }
        } else {
            if (!workspaceState.ruleId || !scheduleUserId || scheduleKeywords.length === 0 || !scheduleCron) {
                setError("Für ein geplantes Abo müssen eine Regel, ein Benutzer, Keywords und ein Zeitplan ausgewählt sein.");
                setIsExecuting(false);
                return;
            }
            try {
                await apiClient.post(`/api/admin/ai-prompt-rules/${workspaceState.ruleId}/schedule`, {
                    userId: scheduleUserId,
                    keywords: scheduleKeywords,
                    region: workspaceState.region,
                    schedule: scheduleCron,
                    categoryId: scheduleCategoryId || null,
                }, { headers: { 'x-auth-token': token } });
                setSnackbar({ open: true, message: 'Geplantes Abonnement erfolgreich erstellt!' });
                setScheduleKeywords([]);
                setScheduleUserId('');
                setScheduleCategoryId('');
            } catch (err: any) {
                setError(err.response?.data?.message || 'Fehler beim Erstellen des Abonnements.');
            }
        }
        setIsExecuting(false);
    };
    
    const handleInsertPlaceholder = (placeholder: string) => {
        if (!activePromptField || !inputRefs[activePromptField]) return;
        const ref = inputRefs[activePromptField];
        if (ref.current) {
            const start = ref.current.selectionStart || 0;
            const end = ref.current.selectionEnd || 0;
            const text = workspaceState[activePromptField] || '';
            const newText = text.substring(0, start) + placeholder + text.substring(end);
            
            setWorkspaceState(prev => ({ ...prev, [activePromptField]: newText }));
            
            setTimeout(() => {
                ref.current?.focus();
                ref.current!.selectionStart = ref.current!.selectionEnd = start + placeholder.length;
            }, 0);
        }
    };

    const handleDuplicateRule = async (ruleId: string, event: React.MouseEvent) => {
        event.stopPropagation();
        if (!window.confirm('Möchten Sie diese Regel wirklich duplizieren?')) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.post(`/api/admin/ai-prompt-rules/${ruleId}/duplicate`, {}, { headers: { 'x-auth-token': token } });
            await fetchData();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Duplizieren der Regel.');
        }
    };

    const handleDeleteRule = async (ruleId: string, event: React.MouseEvent) => {
        event.stopPropagation();
        if (!window.confirm('Sind Sie sicher, dass Sie diese Regel endgültig löschen möchten?')) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.delete(`/api/admin/ai-prompt-rules/${ruleId}`, { headers: { 'x-auth-token': token } });
            if (workspaceState.ruleId === ruleId) handleNewRule();
            await fetchData();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Löschen der Regel.');
        }
    };
    
    const handleCloseLogModal = () => {
        setLogModalOpen(false);
        setCurrentJobId(null);
        setJobLogs([]);
        setJobStatus(null);
        setFinalJobResult(null);
    };

    const selectedUser = users.find(u => u.id === scheduleUserId);

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    KI Prompt-Regeln
                </Typography>
                <Grid container spacing={3}>
                    <Grid item xs={12} md={4}>
                        <Paper sx={{ p: 2, height: '100%' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                <Typography variant="h6">Regelvorlagen</Typography>
                                <Button size="small" startIcon={<AddIcon />} onClick={handleNewRule}>Neue Regel</Button>
                            </Box>
                            <Divider />
                            {loading ? <CircularProgress /> : (
                                <List sx={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
                                    {rules.map(rule => (
                                        <ListItem key={rule.id} disablePadding secondaryAction={
                                            <>
                                                <Tooltip title="Regel kopieren"><IconButton edge="end" onClick={(e) => handleDuplicateRule(rule.id, e)}><ContentCopyIcon fontSize="small" /></IconButton></Tooltip>
                                                <Tooltip title="Regel löschen"><IconButton edge="end" onClick={(e) => handleDeleteRule(rule.id, e)}><DeleteIcon fontSize="small" color="error" /></IconButton></Tooltip>
                                            </>
                                        }>
                                            <ListItemButton selected={workspaceState.ruleId === rule.id} onClick={() => handleSelectRule(rule)}>
                                                <ListItemText primary={rule.name} secondary={rule.ai_provider} />
                                            </ListItemButton>
                                        </ListItem>
                                    ))}
                                </List>
                            )}
                        </Paper>
                    </Grid>
                    <Grid item xs={12} md={8}>
                        <Paper sx={{ p: 2 }}>
                             <Typography variant="h6" gutterBottom>Regel-Editor</Typography>
                            <TextField name="ruleName" label="Name der Regelvorlage" value={workspaceState.ruleName} onChange={handleWorkspaceChange} fullWidth required sx={{ mb: 2 }}/>
                            <TextField select name="ai_provider" label="KI-Provider" value={workspaceState.ai_provider} onChange={handleWorkspaceChange} fullWidth required sx={{ mb: 2 }}>
                                {aiProviders.map((p) => (<MenuItem key={p} value={p}>{p}</MenuItem>))}
                            </TextField>

                            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2, mb: 2 }}>
                                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>System-Prompt / Rolle der KI</Typography>
                                <TextField name="promptPersona" value={workspaceState.promptPersona} onChange={handleWorkspaceChange} fullWidth multiline rows={3} required
                                    inputRef={inputRefs.promptPersona} onFocus={() => setActivePromptField('promptPersona')} helperText="z.B. Du bist ein Experte für die Automobilbranche..."
                                />

                                <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2, mb: 1 }}>Haupt-Aufgabe</Typography>
                                <TextField name="promptTask" value={workspaceState.promptTask} onChange={handleWorkspaceChange} fullWidth multiline rows={4} required
                                    inputRef={inputRefs.promptTask} onFocus={() => setActivePromptField('promptTask')} helperText="z.B. Fasse die folgenden Recherche-Ergebnisse in 5 Stichpunkten zusammen."
                                />

                                <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2, mb: 1 }}>Formatierungs-Anweisung (optional)</Typography>
                                <TextField name="promptFormat" value={workspaceState.promptFormat} onChange={handleWorkspaceChange} fullWidth multiline rows={2}
                                    inputRef={inputRefs.promptFormat} onFocus={() => setActivePromptField('promptFormat')} helperText="z.B. Antworte NUR als valides JSON-Objekt mit den Schlüsseln 'titel' und 'zusammenfassung'."
                                />
                            </Box>

                            <Box sx={{ mb: 2 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>Platzhalter einfügen:</Typography>
                                <Stack direction="row" spacing={1} component="span">
                                    {placeholders.map(p => (
                                        <Chip key={p} label={p} onClick={() => handleInsertPlaceholder(p)} size="small" variant="outlined" clickable />
                                    ))}
                                </Stack>
                            </Box>
                            
                            <TextField select name="output_format" label="Erwartetes Output-Format" value={workspaceState.output_format} onChange={handleWorkspaceChange} fullWidth margin="dense" helperText="Gibt an, ob die KI reinen Text oder strukturiertes JSON zurückgeben soll." sx={{ mb: 2 }}>
                                <MenuItem value="text">Text</MenuItem>
                                <MenuItem value="json">JSON</MenuItem>
                            </TextField>
                            <Button variant="outlined" startIcon={isSaving ? <ButtonSpinner size={20} /> : <SaveIcon />} onClick={handleSaveRule} disabled={isSaving || !workspaceState.ruleName || !workspaceState.promptPersona || !workspaceState.promptTask || !workspaceState.ai_provider}>
                                {workspaceState.ruleId ? 'Änderungen speichern' : 'Neue Regel speichern'}
                            </Button>
                        </Paper>

                        <Paper sx={{ p: 2, mt: 3 }}>
                            <Typography variant="h6" gutterBottom>Ausführung & Planung</Typography>
                            <Tabs value={executionType} onChange={(e, newValue) => setExecutionType(newValue)} sx={{ mb: 2 }}>
                                <Tab value="once" label="Einmalig generieren & testen" />
                                <Tab value="scheduled" label="Als Abonnement planen" />
                            </Tabs>

                            <TextField select fullWidth label="Region (wird zu {{region}})" name="region" value={workspaceState.region} onChange={handleWorkspaceChange} sx={{ mb: 2 }}>
                                <MenuItem value=""><em>Keine</em></MenuItem>
                                {regions.map(r => <MenuItem key={r.id} value={r.name}>{r.name}</MenuItem>)}
                            </TextField>

                            {executionType === 'once' && (
                                <Box>
                                    <TextField name="inputText" label="Eingabetext (wird zu {{data}})" placeholder="Fügen Sie hier den Text ein..." value={workspaceState.inputText} onChange={handleWorkspaceChange} fullWidth multiline rows={8} required sx={{ mb: 2 }}/>
                                    <TextField name="focus_page" label="Fokus-Seite (wird zu {{focus_page}})" value={workspaceState.focus_page} onChange={handleWorkspaceChange} fullWidth helperText="z.B. eine Produkt-URL" sx={{ mb: 2 }}/>
                                     <TextField select fullWidth label="Kategorie (wird zu {{category}})" name="categoryId" value={workspaceState.categoryId} onChange={handleWorkspaceChange}>
                                        <MenuItem value=""><em>Keine / KI vorschlagen lassen</em></MenuItem>
                                        {categories.map(cat => (<MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>))}
                                    </TextField>
                                </Box>
                            )}

                            {executionType === 'scheduled' && (
                                <Box>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                        Erstellt ein wiederkehrendes Abonnement für einen Benutzer basierend auf der oben ausgewählten Regel.
                                    </Typography>
                                    <Autocomplete multiple freeSolo options={[]} value={scheduleKeywords} onChange={(e, newValue) => setScheduleKeywords(newValue)} renderTags={(val, props) => val.map((opt, i) => <Chip label={opt} {...props({ index: i })} />)} renderInput={(params) => <TextField {...params} label="Hot Topics / Keywords" required />} sx={{ mb: 2 }}/>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                        <TextField select fullWidth label="Benutzer für das Abo auswählen" value={scheduleUserId} onChange={(e) => setScheduleUserId(e.target.value)}>
                                            {users.map(user => (
                                                <MenuItem key={user.id} value={user.id}>
                                                    {user.email} ({user.business_partner_name || 'Kein Partner'} - {user.role})
                                                </MenuItem>
                                            ))}
                                        </TextField>
                                        <Tooltip title="Benutzerdetails anzeigen">
                                            <span>
                                                <IconButton disabled={!scheduleUserId} onClick={() => navigate('/admin/users', { state: { prefillSearch: selectedUser?.email } })}>
                                                    <PersonSearchIcon />
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </Box>
                                    <TextField select fullWidth label="Kategorie (optional)" value={scheduleCategoryId} onChange={(e) => setScheduleCategoryId(e.target.value)} sx={{ mb: 2 }}>
                                        <MenuItem value=""><em>Keine / Standard der Regel</em></MenuItem>
                                        {categories.map(cat => (<MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>))}
                                    </TextField>
                                    <AdminScheduleSelector value={scheduleCron} onChange={setScheduleCron} />
                                    <Tooltip title={formatCronToGerman(scheduleCron)}>
                                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                            Geplant: {formatCronToGerman(scheduleCron)}
                                        </Typography>
                                    </Tooltip>
                                </Box>
                            )}

                            <Button variant="contained" size="large" sx={{ mt: 2 }} startIcon={isExecuting ? <ButtonSpinner size={24} color="inherit" /> : executionType === 'once' ? <AutoFixHighIcon /> : <ScheduleSendIcon />} onClick={handleExecution} disabled={isExecuting || !workspaceState.ruleId}>
                                {executionType === 'once' ? 'Generieren & Testen' : 'Abonnement erstellen & planen'}
                            </Button>
                            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
                        </Paper>
                    </Grid>
                </Grid>
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
