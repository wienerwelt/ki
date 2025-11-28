// frontend/src/pages/AdminLegalMonitorPage.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, TextField, Button, Chip,
    Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip,
    FormControl, InputLabel, Select, MenuItem,
    SelectChangeEvent, Checkbox, FormControlLabel,
    Pagination 
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DownloadIcon from '@mui/icons-material/Download';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

// Annahme: Diese Import-Pfade sind korrekt für Ihre Ordnerstruktur
import apiClient from '../apiClient'; 
import { MonitorTemplate, MonitorEntry, BusinessPartner } from '../types/dashboard.types';
import DashboardLayout from '../components/DashboardLayout'; 
import { useSnackbar } from '../context/SnackbarContext'; 

// Lokale Typ-Definitionen
interface MonitorFieldLocal {
    name: string;
    label: string;
    type: 'text' | 'textarea' | 'date';
}

type MonitorEntryWithTemplate = MonitorEntry & {
    template_name: string;
    fields_definition: MonitorFieldLocal[];
    business_partner_id: string; 
};

type FormState = {
    id?: string;
    template_id: string;
    business_partner_id: string;
    is_published: boolean;
    content_data: Record<string, any>;
    source_document_url: string | null;
};
type TemplateFormState = {
    template_name: string;
    business_partner_id: string; 
    industry: string;
    fields_definition_str: string;
};
const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// --- Hauptkomponente ---
const AdminLegalMonitorPage: React.FC = () => {
    const { showSnackbar } = useSnackbar();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Data States
    const [entries, setEntries] = useState<MonitorEntryWithTemplate[] | null>(null);
    const [templates, setTemplates] = useState<MonitorTemplate[] | null>(null);
    const [businessPartners, setBusinessPartners] = useState<BusinessPartner[] | null>(null);

    // Pagination
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    
    // Filter States
    const [activeBpFilter, setActiveBpFilter] = useState<string>("all");
    const [activeTemplateFilter, setActiveTemplateFilter] = useState<string>("all");

    // Dialog States
    const [entryDialog, setEntryDialog] = useState(false);
    const [templateDialog, setTemplateDialog] = useState(false);

    // Form States
    const [formState, setFormState] = useState<FormState>({
        template_id: '',
        business_partner_id: '',
        is_published: true,
        content_data: {},
        source_document_url: null
    });
    const [templateFormState, setTemplateFormState] = useState<TemplateFormState>({
        template_name: '',
        business_partner_id: '',
        industry: '',
        fields_definition_str: '[\n  {\n    "name": "ueberschrift",\n    "label": "Überschrift",\n    "type": "text"\n  },\n  {\n    "name": "kennung",\n    "label": "Kennung (z.B. BGBI)",\n    "type": "text"\n  },\n  {\n    "name": "zusammenfassung",\n    "label": "Zusammenfassung",\n    "type": "textarea"\n  }\n]'
    });

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<MonitorTemplate | null>(null);

    const fetchEntries = useCallback(async (pageNum = 1) => {
        setLoading(true);
        console.log('[Frontend] fetchEntries: Starte API-Anfrage...');
        try {
            const params = {
                page: pageNum,
                limit: 10,
                bpId: activeBpFilter === 'all' ? undefined : activeBpFilter,
                templateId: activeTemplateFilter === 'all' ? undefined : activeTemplateFilter
            };
            // KORREKTUR: /api Präfix hinzugefügt
            const response = await apiClient.get('/api/admin-legal-monitor/entries', { params });
            
            console.log('[Frontend] fetchEntries: API-Roh-Antwort (response.data) empfangen:', response.data); 
            
            const entriesData = response.data.entries; 
            const totalCount = response.data.totalCount || 0;

            if (Array.isArray(entriesData)) {
                console.log(`[Frontend] fetchEntries: ERFOLG. Verarbeite ${entriesData.length} Einträge.`);
                setEntries(entriesData as MonitorEntryWithTemplate[]);
                setTotalPages(Math.ceil(totalCount / 10));
                setPage(pageNum);
            } else {
                console.warn("[Frontend] FEHLER: response.data.entries ist kein Array!", response.data);
                setEntries([]); 
            }
            setError(null);
        } catch (err: any) {
            console.error('[Frontend] FEHLER bei fetchEntries:', err.response?.data?.message || err.message);
            setError('Fehler beim Laden der Einträge.');
        } finally {
            setLoading(false);
        }
    }, [activeBpFilter, activeTemplateFilter]);

const fetchTemplates = useCallback(async () => {
        console.log('[Frontend] fetchTemplates: Starte API-Anfrage...');
        try {
            // KORREKTUR: /api Präfix hinzugefügt
            const response = await apiClient.get('/api/admin-legal-monitor/templates');
            
            console.log('[Frontend] fetchTemplates: API-Roh-Antwort (response.data) empfangen:', response.data); 
            
            const templatesData = response.data.data; 
            let templatesArray: MonitorTemplate[] = []; 

            if (Array.isArray(templatesData)) {
                console.log(`[Frontend] fetchTemplates: ERFOLG. Verarbeite ${templatesData.length} Templates.`);
                templatesArray = templatesData;
            } else {
                 console.warn("[Frontend] FEHLER: response.data.data ist kein Array!", templatesData);
            }
            
            setTemplates(templatesArray); 
        } catch (err: any) {
            console.error('[Frontend] FEHLER bei fetchTemplates:', err.response?.data?.message || err.message);
            setError('Fehler beim Laden der Vorlagen.');
           // setTemplates([]); // <-- *** HIER IST DIE KORREKTUR ***
        }
    }, []); 

const fetchBusinessPartners = useCallback(async () => {
        console.log('[Frontend] fetchBusinessPartners: Starte API-Anfrage...');
        try {
            // KORREKTUR: /api Präfix hinzugefügt
            const response = await apiClient.get('/api/admin-legal-monitor/business-partners'); 
            
            console.log('[Frontend] fetchBusinessPartners: API-Roh-Antwort (response.data) empfangen:', response.data); 
            
            const partnersData = response.data.data; 
            let partnersArray: BusinessPartner[] = [];

            if (Array.isArray(partnersData)) {
                console.log(`[Frontend] fetchBusinessPartners: ERFOLG. Verarbeite ${partnersData.length} Partner.`);
                partnersArray = partnersData;
            } else {
                console.warn("[Frontend] FEHLER: response.data.data ist kein Array!", partnersData);
            }
            
            setBusinessPartners(partnersArray); 
            
        } catch (err: any) {
            console.error("[Frontend] FEHLER bei fetchBusinessPartners:", err.response?.data?.message || err.message);
            setError('Fehler beim Laden der Business Partner.'); // <-- Bessere Fehlermeldung
            // setBusinessPartners([]); // <-- *** HIER IST DIE KORREKTUR ***
        }
    }, []); 


    useEffect(() => {
        fetchEntries(1); 
    }, [fetchEntries]);

    useEffect(() => {
        // Starte das Laden von Templates und BPs parallel
        Promise.all([fetchTemplates(), fetchBusinessPartners()]);
    }, [fetchTemplates, fetchBusinessPartners]); // Diese Abhängigkeiten sind jetzt stabil

    // NEU: Separater Hook zum Setzen der Standardwerte, NACHDEM die Daten geladen wurden
    useEffect(() => {
        if (businessPartners && businessPartners.length > 0 && !formState.business_partner_id) {
            setFormState(prev => ({ ...prev, business_partner_id: businessPartners[0].id }));
            setTemplateFormState(prev => ({ ...prev, business_partner_id: businessPartners[0].id }));
        }
    }, [businessPartners, formState.business_partner_id]); // Reagiert auf das Laden der BPs

    // NEU: Separater Hook für Templates
    useEffect(() => {
        if (templates && templates.length > 0 && !formState.template_id) {
            setFormState(prev => ({ ...prev, template_id: templates[0].id }));
        }
    }, [templates, formState.template_id]); // Reagiert auf das Laden der Templates

    const handlePageChange = (event: React.ChangeEvent<unknown>, value: number) => {
        fetchEntries(value);
    };

    const handleOpenTemplateDialog = () => setTemplateDialog(true);
    const handleCloseTemplateDialog = () => {
            setTemplateDialog(false);
            setEditingTemplate(null);
            setTemplateFormState({
                template_name: '',
                business_partner_id: businessPartners?.[0]?.id || '',
                industry: '',
                fields_definition_str: '[\n  {\n    "name": "ueberschrift",\n    "label": "Überschrift",\n    "type": "text"\n  },\n  {\n    "name": "kennung",\n    "label": "Kennung (z.B. BGBI)",\n    "type": "text"\n  },\n  {\n    "name": "zusammenfassung",\n    "label": "Zusammenfassung",\n    "type": "textarea"\n  }\n]'
            });
    };

    const handleOpenEntryDialog = (entry: MonitorEntryWithTemplate | null = null) => {
        if (entry) {
            // Edit-Modus
            setFormState({
                id: entry.id,
                template_id: templates?.find(t => t.template_name === entry.template_name)?.id || '',
                business_partner_id: businessPartners?.find(bp => bp.id === entry.business_partner_id)?.id || '', 
                is_published: entry.is_published,
                content_data: entry.content_data,
                source_document_url: entry.source_document_url
            });
        } else {
            // Neu-Modus (Reset)
            const defaultBpId = businessPartners && businessPartners.length > 0 ? businessPartners[0].id : '';
            const defaultTemplateId = templates && templates.length > 0 ? templates[0].id : '';
            setFormState({
                template_id: defaultTemplateId,
                business_partner_id: defaultBpId,
                is_published: true,
                content_data: {},
                source_document_url: null
            });
        }
        setEntryDialog(true);
    };
    const handleCloseEntryDialog = () => setEntryDialog(false);


    const handleSaveTemplate = async () => {
        if (!templateFormState.business_partner_id) {
            showSnackbar('Fehler: Ein Business Partner muss ausgewählt werden.', 'error');
            return;
        }
        
        let fields_definition_obj;
        try {
            fields_definition_obj = JSON.parse(templateFormState.fields_definition_str);
        } catch (e) {
            showSnackbar('Fehler: Felddefinition ist kein gültiges JSON.', 'error');
            return;
        }

        const dataToSave = {
            ...templateFormState,
            fields_definition: fields_definition_obj
        };

        try {
            if (editingTemplate) {
                // --- UPDATE (BEARBEITEN) ---
                await apiClient.put(`/api/admin-legal-monitor/templates/${editingTemplate.id}`, dataToSave);
                showSnackbar('Vorlage erfolgreich aktualisiert.', 'success');
            } else {
                // --- CREATE (ERSTELLEN) ---
                await apiClient.post('/api/admin-legal-monitor/templates', dataToSave);
                showSnackbar('Vorlage erfolgreich erstellt.', 'success');
            }
            fetchTemplates();
            handleCloseTemplateDialog(); // Schließt Dialog und setzt Formular zurück
        } catch (err: any) {
            showSnackbar(err.response?.data?.message || 'Fehler beim Speichern der Vorlage.', 'error');
        }
    };

    const handleSaveEntry = async () => {
        if (!formState.business_partner_id || !formState.template_id) {
             showSnackbar('Fehler: Business Partner und Template müssen ausgewählt werden.', 'error');
             return;
        }
        try {
            const dataToSave = {
                ...formState,
                content_data: JSON.stringify(formState.content_data)
            };
            if (formState.id) {
                // KORREKTUR: /api Präfix hinzugefügt
                await apiClient.put(`/api/admin-legal-monitor/entries/${formState.id}`, dataToSave);
                showSnackbar('Eintrag erfolgreich aktualisiert.', 'success');
            } else {
                // KORREKTUR: /api Präfix hinzugefügt
                await apiClient.post('/api/admin-legal-monitor/entries', dataToSave);
                showSnackbar('Eintrag erfolgreich erstellt.', 'success');
            }
            fetchEntries(page);
            handleCloseEntryDialog();
        } catch (err: any) {
            showSnackbar(err.response?.data?.message || 'Fehler beim Speichern des Eintrags.', 'error');
        }
    };

     const handleDeleteEntry = async (id: string) => {
        if (window.confirm('Möchten Sie diesen Eintrag wirklich löschen?')) {
            try {
                // KORREKTUR: /api Präfix hinzugefügt
                await apiClient.delete(`/api/admin-legal-monitor/entries/${id}`);
                showSnackbar('Eintrag gelöscht.', 'success');
                fetchEntries(page);
            } catch (err: any) {
                showSnackbar(err.response?.data?.message || 'Fehler beim Löschen.', 'error');
            }
        }
    };
    
    const handleDeleteTemplate = async (id: string) => {
        if (window.confirm('Möchten Sie diese Vorlage wirklich löschen? Alle zugehörigen Einträge werden ebenfalls gelöscht!')) {
            try {
                // KORREKTUR: /api Präfix hinzugefügt
                await apiClient.delete(`/api/admin-legal-monitor/templates/${id}`);
                showSnackbar('Vorlage gelöscht.', 'success');
                fetchTemplates();
                fetchEntries(1);
            } catch (err: any) {
                showSnackbar(err.response?.data?.message || 'Fehler beim Löschen.', 'error');
            }
        }
    };

    // --- PDF-Upload-Handler (MIT /api PRÄFIX) ---
    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            setSelectedFile(event.target.files[0]);
        }
    };

    const handleFileUpload = async () => {
        if (!selectedFile) {
            showSnackbar('Bitte zuerst eine PDF-Datei auswählen.', 'warning');
            return;
        }
        if (!formState.template_id || !formState.business_partner_id) {
             showSnackbar('Bitte einen Partner UND ein Template für den Import auswählen.', 'warning');
            return;
        }
        setIsUploading(true);
        setError(null);
        const formData = new FormData();
        formData.append('pdfFile', selectedFile);
        formData.append('template_id', formState.template_id);
        formData.append('business_partner_id', formState.business_partner_id);

        try {
            const response = await apiClient.post('/api/admin-legal-monitor/entries/parse-pdf', formData);
            showSnackbar(response.data.message, 'success');
            fetchEntries(1); 
            setSelectedFile(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
            handleCloseEntryDialog(); 
        } catch (err: any) {
            console.error("Fehler beim PDF-Upload:", err);
            const errMsg = err.response?.data?.message || 'Fehler beim PDF-Upload.';
            setError(errMsg);
            showSnackbar(errMsg, 'error');
        } finally {
            setIsUploading(false);
        }
    };
    
    const handleDownloadSource = async (id: string) => {
        try {
            // KORREKTUR: /api Präfix hinzugefügt
            const response = await apiClient.get(`/api/admin-legal-monitor/entries/${id}/download-source`);
            window.open(response.data.downloadUrl, '_blank');
        } catch (err: any) {
             showSnackbar(err.response?.data?.message || 'Fehler beim Abrufen der Download-URL.', 'error');
        }
    };


    const handleOpenEditTemplate = (template: MonitorTemplate) => {
        setEditingTemplate(template); // Setzt die zu bearbeitende Vorlage
        setTemplateFormState({ // Füllt das Formular
            template_name: template.template_name,
            business_partner_id: template.business_partner_id,
            industry: template.industry || '',
            fields_definition_str: JSON.stringify(template.fields_definition, null, 2)
        });
        setTemplateDialog(true); // Öffnet den Dialog
    };

    const handleCopyTemplate = (template: MonitorTemplate) => {
        setEditingTemplate(null); // Wichtig: Wir erstellen eine NEUE Vorlage
        setTemplateFormState({ // Füllt das Formular mit Kopie-Daten
            template_name: `Kopie von: ${template.template_name}`,
            business_partner_id: template.business_partner_id,
            industry: template.industry || '',
            fields_definition_str: JSON.stringify(template.fields_definition, null, 2)
        });
        setTemplateDialog(true); // Öffnet den Dialog
    };


    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }> | SelectChangeEvent) => {
        const { name, value, type } = e.target as HTMLInputElement;
        
        if (type === 'checkbox') {
             setFormState(prev => ({ ...prev, is_published: (e.target as HTMLInputElement).checked }));
        } else {
            setFormState(prev => ({ ...prev, [name as string]: value }));
        }
    };
    
    const handleContentDataChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormState(prev => ({
            ...prev,
            content_data: {
                ...prev.content_data,
                [name]: value
            }
        }));
    };

    const handleTemplateFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setTemplateFormState(prev => ({ ...prev, [name]: value }));
    };

    // --- Render-Funktionen ---
    const renderFormFields = () => {
        if (!templates) return <CircularProgress size={20} />; // Warten auf Templates
        const template = templates.find(t => t.id === formState.template_id);
        if (!template) return <Typography>Bitte ein Template auswählen.</Typography>;

        if (!Array.isArray(template.fields_definition)) {
            return <Typography color="error">Template-Felder sind fehlerhaft.</Typography>;
        }

        return template.fields_definition.map((field: MonitorFieldLocal) => (
            <TextField
                key={field.name}
                name={field.name}
                label={field.label}
                value={formState.content_data[field.name] || ''}
                onChange={handleContentDataChange}
                fullWidth
                margin="normal"
                multiline={field.type === 'textarea'}
                rows={field.type === 'textarea' ? 5 : 1}
                type={field.type === 'date' ? 'date' : 'text'}
                InputLabelProps={field.type === 'date' ? { shrink: true } : {}}
            />
        ));
    };

if (!businessPartners || !templates) {
         return (
            <DashboardLayout>
                <Container maxWidth="xl" sx={{ mt: 4, mb: 4, textAlign: 'center' }}>
                    {error ? (
                        <Alert severity="error">{error}</Alert>
                    ) : (
                        <>
                            <CircularProgress />
                            <Typography>Lade Konfiguration...</Typography>
                        </>
                    )}
                </Container>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Paper sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h5" gutterBottom>
                            Monitor-Einträge
                        </Typography>
                        <Box>
                             <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={() => handleOpenEntryDialog(null)}
                            >
                                Neuer Eintrag / Import
                            </Button>
                            <Button
                                variant="outlined"
                                startIcon={<EditIcon />}
                                onClick={handleOpenTemplateDialog}
                                sx={{ ml: 2 }}
                            >
                                Vorlagen verwalten
                            </Button>
                        </Box>
                    </Box>

                    {/* --- Filter --- */}
                    <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                        <FormControl size="small" sx={{ minWidth: 200 }}>
                            <InputLabel>Business Partner</InputLabel>
                            <Select
                                value={activeBpFilter}
                                label="Business Partner"
                                onChange={(e) => setActiveBpFilter(e.target.value)}
                            >
                                <MenuItem value="all">Alle Partner</MenuItem>
                                {businessPartners.map(bp => (
                                    <MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControl size="small" sx={{ minWidth: 200 }}>
                            <InputLabel>Template</InputLabel>
                            <Select
                                value={activeTemplateFilter}
                                label="Template"
                                onChange={(e) => setActiveTemplateFilter(e.target.value)}
                            >
                                <MenuItem value="all">Alle Templates</MenuItem>
                                {templates.map(t => (
                                    <MenuItem key={t.id} value={t.id}>{t.template_name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>

                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    
                    {/* --- Tabelle der Einträge --- */}
                    <TableContainer>
                        {loading || !entries ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
                        ) : (
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Inhalt</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Template</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Erstellt am</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {entries.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} align="center">Keine Einträge gefunden.</TableCell>
                                        </TableRow>
                                    ) : (
                                        entries.map(entry => {
                                            const firstField = (Array.isArray(entry.fields_definition) && entry.fields_definition[0]?.name) ? entry.fields_definition[0].name : '...';
                                            const title = entry.content_data[firstField] || '(Kein Titel)';
                                            return (
                                                <TableRow key={entry.id} hover>
                                                    <TableCell sx={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        <Tooltip title={title}>
                                                            <Typography variant="body2">{title}</Typography>
                                                        </Tooltip>
                                                    </TableCell>
                                                    <TableCell><Chip label={entry.template_name} size="small" /></TableCell>
                                                    <TableCell>
                                                        <Chip 
                                                            label={entry.is_published ? 'Veröffentlicht' : 'Entwurf'} 
                                                            size="small" 
                                                            color={entry.is_published ? 'success' : 'default'}
                                                        />
                                                    </TableCell>
                                                    <TableCell>{formatDate(entry.created_at)}</TableCell>
                                                    <TableCell>
                                                        <Tooltip title="Manuell bearbeiten">
                                                            <span>
                                                                <IconButton size="small" onClick={() => handleOpenEntryDialog(entry)}>
                                                                    <EditIcon fontSize="small" />
                                                                </IconButton>
                                                            </span>
                                                        </Tooltip>
                                                        <Tooltip title="Eintrag löschen">
                                                            <span>
                                                                <IconButton 
                                                                    size="small" 
                                                                    onClick={() => handleDeleteEntry(entry.id)}
                                                                >
                                                                    <DeleteIcon fontSize="small" />
                                                                </IconButton>
                                                            </span>
                                                        </Tooltip>
                                                        {entry.source_document_url && (
                                                            <Tooltip title="Quelldokument herunterladen">
                                                                <span>
                                                                    <IconButton size="small" onClick={() => handleDownloadSource(entry.id)}>
                                                                        <DownloadIcon fontSize="small" />
                                                                    </IconButton>
                                                                </span>
                                                            </Tooltip>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </TableContainer>
                     <Pagination 
                        count={totalPages} 
                        page={page} 
                        onChange={handlePageChange} 
                        sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}
                    />
                </Paper>
            </Container>

            {/* --- Dialog für NEU / PDF-IMPORT / BEARBEITEN --- */}
            <Dialog open={entryDialog} onClose={handleCloseEntryDialog} maxWidth="md" fullWidth>
                <DialogTitle>{formState.id ? 'Eintrag bearbeiten' : 'Neuer Eintrag / PDF-Import'}</DialogTitle>
                <DialogContent>
                    <FormControl fullWidth margin="normal">
                        <InputLabel>Business Partner</InputLabel>
                        <Select
                            name="business_partner_id"
                            value={formState.business_partner_id}
                            label="Business Partner"
                            onChange={handleFormChange}
                        >
                            {businessPartners.map(bp => (
                                <MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl fullWidth margin="normal">
                        <InputLabel>Template</InputLabel>
                        <Select
                            name="template_id"
                            value={formState.template_id}
                            label="Template"
                            onChange={handleFormChange}
                        >
                            {templates.map(t => (
                                <MenuItem key={t.id} value={t.id}>{t.template_name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    {!formState.id && (
                        <Paper variant="outlined" sx={{ p: 2, mt: 2, mb: 1, backgroundColor: 'grey.50' }}>
                             <Typography variant="h6" gutterBottom>Automatischer PDF-Import</Typography>
                             <Typography variant="body2" color="text.secondary" sx={{mb: 2}}>
                                Laden Sie hier den "iusbote Rechtsmonitor" hoch. Das System versucht, 
                                alle "Bundesgesetzblätter"-Artikel automatisch zu extrahieren und zu speichern.
                             </Typography>
                             <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Button
                                    variant="outlined"
                                    component="label"
                                    startIcon={<UploadFileIcon />}
                                >
                                    PDF auswählen
                                    <input
                                        type="file"
                                        hidden
                                        accept="application/pdf"
                                        ref={fileInputRef}
                                        onChange={handleFileSelect}
                                    />
                                </Button>
                                {selectedFile && <Typography variant="body2" sx={{flexGrow: 1}}>{selectedFile.name}</Typography>}
                                <Button
                                    variant="contained"
                                    color="secondary"
                                    onClick={handleFileUpload}
                                    disabled={isUploading || !selectedFile}
                                    startIcon={isUploading ? <CircularProgress size={16} /> : <DownloadIcon />}
                                >
                                    {isUploading ? 'Importiere...' : 'Import starten'}
                                </Button>
                             </Box>
                        </Paper>
                    )}
                    
                    <Typography variant="h6" sx={{ mt: 3, mb: 1, borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
                        {formState.id ? 'Eintrag bearbeiten' : 'Manuelle Eingabe'}
                    </Typography>

                    <FormControlLabel
                        control={<Checkbox checked={formState.is_published} onChange={handleFormChange} name="is_published" />}
                        label="Veröffentlicht"
                    />
                    
                    {renderFormFields()}
                    
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseEntryDialog}>Abbrechen</Button>
                    <Button 
                        onClick={handleSaveEntry} 
                        variant="contained"
                        disabled={isUploading} 
                    >
                        {formState.id ? 'Änderungen speichern' : 'Manuell speichern'}
                    </Button>
                </DialogActions>
            </Dialog>


<Dialog open={templateDialog} onClose={handleCloseTemplateDialog} maxWidth="md" fullWidth>
                <DialogTitle>{editingTemplate ? 'Vorlage bearbeiten' : 'Vorlagen verwalten'}</DialogTitle>
                <DialogContent>
                    
                    {/* KORREKTUR: Nur anzeigen, wenn NICHT editiert wird */}
                    {!editingTemplate && (
                        <>
                            <Typography variant="h6">Bestehende Vorlagen</Typography>
                            <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                                <Table size="small">
                                    <TableBody>
                                        {templates.map(t => (
                                            <TableRow key={t.id}>
                                                <TableCell>{t.template_name}</TableCell>
                                                <TableCell>{t.industry || 'Allgemein'}</TableCell>
                                                <TableCell>{businessPartners.find(bp => bp.id === t.business_partner_id)?.name || 'Fehler'}</TableCell>
                                                <TableCell align="right">
                                                    {/* +++ NEUE BUTTONS +++ */}
                                                    <Tooltip title="Bearbeiten">
                                                        <span>
                                                            <IconButton size="small" onClick={() => handleOpenEditTemplate(t)}>
                                                                <EditIcon fontSize="small" />
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                    <Tooltip title="Kopieren">
                                                        <span>
                                                            <IconButton size="small" onClick={() => handleCopyTemplate(t)}>
                                                                <ContentCopyIcon fontSize="small" />
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                    {/* +++ ENDE NEUE BUTTONS +++ */}
                                                    <span>
                                                        <IconButton size="small" onClick={() => handleDeleteTemplate(t.id)}>
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                            <Typography variant="h6" sx={{mt: 3}}>Neue Vorlage erstellen</Typography>
                        </>
                    )}
                    <TextField
                        name="template_name"
                        label="Name der Vorlage"
                        value={templateFormState.template_name}
                        onChange={handleTemplateFormChange}
                        fullWidth
                        margin="normal"
                        required
                    />
                    <FormControl fullWidth margin="normal">
                        <InputLabel>Business Partner</InputLabel>
                        <Select
                            name="business_partner_id"
                            value={templateFormState.business_partner_id}
                            label="Business Partner"
                            onChange={(e) => setTemplateFormState(prev => ({ ...prev, business_partner_id: e.target.value }))}
                            required
                        >
                            {businessPartners.length === 0 ? (
                                <MenuItem value="" disabled>
                                    Keine Business Partner gefunden.
                                </MenuItem>
                            ) : (
                                businessPartners.map(bp => (
                                    <MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>
                                ))
                            )}
                        </Select>
                    </FormControl>
                    <TextField
                        name="industry"
                        label="Industrie (Optional)"
                        value={templateFormState.industry}
                        onChange={handleTemplateFormChange}
                        fullWidth
                        margin="normal"
                    />
                    <TextField
                        name="fields_definition_str"
                        label="Felddefinition (JSON-Array)"
                        value={templateFormState.fields_definition_str}
                        onChange={handleTemplateFormChange}
                        fullWidth
                        margin="normal"
                        multiline
                        rows={12}
                        required
                        helperText="Muss ein gültiges JSON-Array sein, das die Formularfelder definiert."
                        sx={{ 
                            '& .MuiInputBase-input': { 
                                fontFamily: 'monospace',
                                fontSize: '0.9rem' 
                            } 
                        }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseTemplateDialog}>Abbrechen</Button>
                    <Button 
                        onClick={handleSaveTemplate} 
                        variant="contained"
                    >
                        {/* KORREKTUR: Button-Text dynamisch anpassen */}
                        {editingTemplate ? 'Änderungen speichern' : 'Vorlage erstellen'}
                    </Button>
                </DialogActions>
            </Dialog>

        </DashboardLayout>
    );
};

export default AdminLegalMonitorPage;