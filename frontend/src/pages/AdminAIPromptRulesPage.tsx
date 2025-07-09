import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Grid, List, ListItem,
    ListItemButton, ListItemText, TextField, MenuItem, Divider, LinearProgress,
    CircularProgress as ButtonSpinner,
    Tooltip,
    IconButton
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

// --- Interfaces ---
interface AIPromptRule {
    id: string;
    name: string;
    prompt_template: string;
    ai_provider: string | null;
    output_format: string | null;
}
interface Category { id:string; name: string; }

// --- Konstanten & Initialer Zustand ---
const initialWorkspaceState = {
    ruleId: null as string | null,
    ruleName: '',
    promptTemplate: '',
    ai_provider: '',
    output_format: 'text',
    inputText: '',
    region: '',
    categoryId: '',
    focus_page: '',
};

const europeanCountries = ["EU", "Albanien", "Andorra", "Belgien", "Bosnien und Herzegowina", "Bulgarien", "Dänemark", "Deutschland", "Estland", "Finnland", "Frankreich", "Griechenland", "Irland", "Island", "Italien", "Kosovo", "Kroatien", "Lettland", "Liechtenstein", "Litauen", "Luxemburg", "Malta", "Moldau", "Monaco", "Montenegro", "Niederlande", "Nordmazedonien", "Norwegen", "Österreich", "Polen", "Portugal", "Rumänien", "San Marino", "Schweden", "Schweiz", "Serbien", "Slowakei", "Slowenien", "Spanien", "Tschechien", "Ukraine", "Ungarn", "Vatikanstadt", "Vereinigtes Königreich", "Weißrussland", "Zypern"];

const AdminAIPromptRulesPage: React.FC = () => {
    const [rules, setRules] = useState<AIPromptRule[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [aiProviders, setAiProviders] = useState<string[]>([]); // NEU: State für Provider
    const [workspaceState, setWorkspaceState] = useState(initialWorkspaceState);
    const [logModalOpen, setLogModalOpen] = useState(false);
    const [currentJobId, setCurrentJobId] = useState<string | null>(null);
    const [jobLogs, setJobLogs] = useState<{ log_level: string, message: string, created_at: string }[]>([]);
    const [jobStatus, setJobStatus] = useState<string | null>(null);
    const [finalJobResult, setFinalJobResult] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            // NEU: Ruft alle Daten parallel ab, inklusive der neuen Provider-Liste
            const [rulesRes, categoriesRes, providersRes] = await Promise.all([
                apiClient.get('/api/admin/ai-prompt-rules', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/categories', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/ai-prompt-rules/providers', { headers: { 'x-auth-token': token } })
            ]);
            setRules(rulesRes.data);
            setCategories(categoriesRes.data);
            setAiProviders(providersRes.data);
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
        setWorkspaceState(prev => ({
            ...prev,
            ruleId: rule.id,
            ruleName: rule.name,
            promptTemplate: rule.prompt_template,
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
        if (!workspaceState.ruleName || !workspaceState.promptTemplate || !workspaceState.ai_provider) {
            setError("Regelname, Vorlage und KI-Provider sind Pflichtfelder.");
            return;
        }
        setIsSaving(true);
        setError(null);
        const token = localStorage.getItem('jwt_token');
        const ruleData = {
            name: workspaceState.ruleName,
            prompt_template: workspaceState.promptTemplate,
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
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Speichern der Regel.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleGenerate = async () => {
        if (!workspaceState.promptTemplate || !workspaceState.ai_provider) {
            setError("Eine Prompt-Vorlage und ein KI-Provider sind für die Generierung erforderlich.");
            return;
        }
        if (!workspaceState.inputText) {
            setError("Bitte geben Sie einen Text für die Generierung ein.");
            return;
        }
        
        setError(null);
        setIsGenerating(true);
        setJobLogs([{ log_level: 'INFO', message: 'Initialisiere KI-Job...', created_at: new Date().toISOString() }]);
        setFinalJobResult(null);
        setLogModalOpen(true);
        setJobStatus('pending');

        const token = localStorage.getItem('jwt_token');
        
        const payload = {
            ruleId: workspaceState.ruleId,
            ruleData: {
                name: workspaceState.ruleName,
                prompt_template: workspaceState.promptTemplate,
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
        } finally {
            setIsGenerating(false);
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
            
            if (workspaceState.ruleId === ruleId) {
                handleNewRule();
            }
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

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    KI Prompt
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
                                        <ListItem 
                                            key={rule.id} 
                                            disablePadding
                                            secondaryAction={
                                                <>
                                                    <Tooltip title="Regel kopieren">
                                                        <IconButton edge="end" aria-label="copy" onClick={(e) => handleDuplicateRule(rule.id, e)}>
                                                            <ContentCopyIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Regel löschen">
                                                        <IconButton edge="end" aria-label="delete" onClick={(e) => handleDeleteRule(rule.id, e)}>
                                                            <DeleteIcon fontSize="small" color="error" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </>
                                            }
                                        >
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
                            <TextField name="promptTemplate" label="Prompt-Vorlage" value={workspaceState.promptTemplate} onChange={handleWorkspaceChange} fullWidth multiline rows={6} required sx={{ mb: 2 }} helperText="Verwenden Sie {{data}}, {{category}}, {{region}} und {{focus_page}} als Platzhalter."/>
                            
                            <TextField
                                select
                                name="output_format"
                                label="Erwartetes Output-Format"
                                value={workspaceState.output_format}
                                onChange={handleWorkspaceChange}
                                fullWidth
                                margin="dense"
                                helperText="Gibt an, ob die KI reinen Text oder strukturiertes JSON zurückgeben soll."
                                sx={{ mb: 2 }}
                            >
                                <MenuItem value="text">Text</MenuItem>
                                <MenuItem value="json">JSON</MenuItem>
                            </TextField>

                            <Button
                                variant="outlined"
                                startIcon={isSaving ? <ButtonSpinner size={20} /> : <SaveIcon />}
                                onClick={handleSaveRule}
                                disabled={isSaving || !workspaceState.ruleName || !workspaceState.promptTemplate || !workspaceState.ai_provider}
                            >
                                {workspaceState.ruleId ? 'Änderungen speichern' : 'Neue Regel speichern'}
                            </Button>
                            <Divider sx={{ my: 3 }} />
                            <Typography variant="h6" gutterBottom>Inhalt generieren</Typography>
                            <TextField name="inputText" label="Eingabetext (wird zu {{data}})" placeholder="Fügen Sie hier den Text ein..." value={workspaceState.inputText} onChange={handleWorkspaceChange} fullWidth multiline rows={8} required sx={{ mb: 2 }}/>
                            <Grid container spacing={2} sx={{ mb: 2 }}>
                                <Grid item xs={12} sm={4}>
                                    <TextField name="focus_page" label="Fokus-Seite (wird zu {{focus_page}})" value={workspaceState.focus_page} onChange={handleWorkspaceChange} fullWidth helperText="z.B. eine Produkt-URL"/>
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                    <TextField select fullWidth label="Region (wird zu {{region}})" name="region" value={workspaceState.region} onChange={handleWorkspaceChange}>
                                        <MenuItem value=""><em>Keine</em></MenuItem>
                                        {europeanCountries.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                                    </TextField>
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                     <TextField select fullWidth label="Kategorie (wird zu {{category}})" name="categoryId" value={workspaceState.categoryId} onChange={handleWorkspaceChange}>
                                        <MenuItem value=""><em>Keine / KI vorschlagen lassen</em></MenuItem>
                                        {categories.map(cat => (<MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>))}
                                    </TextField>
                                </Grid>
                            </Grid>
                            <Button
                                variant="contained"
                                size="large"
                                startIcon={isGenerating ? <ButtonSpinner size={24} color="inherit" /> : <AutoFixHighIcon />}
                                onClick={handleGenerate}
                                disabled={isGenerating || !workspaceState.promptTemplate || !workspaceState.ai_provider || !workspaceState.inputText}
                            >
                                Generieren & Log anzeigen
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
            </Container>
        </DashboardLayout>
    );
};

export default AdminAIPromptRulesPage;
