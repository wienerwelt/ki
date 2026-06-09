import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Container, Typography, Box, Button, Paper, CircularProgress, Alert,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, Tooltip,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, Grid, Select, MenuItem,
    FormControl, InputLabel, Chip, SelectChangeEvent, TableSortLabel, ToggleButton, ToggleButtonGroup
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    BarChart as BarChartIcon,
    ContentCopy as ContentCopyIcon,
    Close as CloseIcon,
    AddCircleOutline as AddCircleOutlineIcon,
    RemoveCircleOutline as RemoveCircleOutlineIcon,
    Download as DownloadIcon,
    PieChart as PieChartIcon,
    BarChartOutlined as BarChartOutlinedIcon,
    PictureAsPdf as PictureAsPdfIcon
} from '@mui/icons-material';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

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
    participant_count?: number; 
}

interface Question {
    id?: string;
    question_text: string;
    question_type: 'single-choice' | 'multiple-choice' | 'free-text';
    options: string[];
}

interface SurveyResult {
    id: string;
    question_text: string;
    question_type: 'single-choice' | 'multiple-choice' | 'free-text';
    options: string[];
    results: any[];
    unique_users?: number; 
}

interface BusinessPartner {
    id: string;
    name: string;
}

type SortConfig = {
    key: keyof Survey;
    direction: 'asc' | 'desc';
};

const PIE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ff6666', '#a3e635', '#f472b6'];

const getEffectiveStatus = (survey: Survey): 'draft' | 'active' | 'closed' => {
    if (survey.status === 'active' && survey.end_date) {
        if (new Date(survey.end_date) < new Date()) {
            return 'closed'; 
        }
    }
    return survey.status;
};

const AdminSurveysPage: React.FC = () => {
    const { user } = useAuth();
    const { showSnackbar } = useSnackbar();
    
    const [surveys, setSurveys] = useState<Survey[]>([]);
    const [businessPartners, setBusinessPartners] = useState<BusinessPartner[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const [bpFilter, setBpFilter] = useState<string>('all');
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'created_at', direction: 'desc' });

    const [dialogOpen, setDialogOpen] = useState(false);
    const [resultsOpen, setResultsOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [currentSurvey, setCurrentSurvey] = useState<Partial<Survey> & { questions: Question[] }>({ title: '', description: '', status: 'draft', questions: [], business_partner_id: '' });
    const [currentResults, setCurrentResults] = useState<SurveyResult[]>([]);
    const [chartTypes, setChartTypes] = useState<Record<string, 'bar' | 'pie'>>({});
    
    const isAssistant = user?.role === 'assistenz';

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const surveyUrl = isAssistant ? `/api/surveys/admin?business_partner_id=${user.business_partner_id}` : '/api/surveys/admin';
            const [surveysRes, bpRes] = await Promise.all([
                apiClient.get(surveyUrl),
                user?.role === 'admin' ? apiClient.get('/api/admin/business-partners') : Promise.resolve({ data: [] })
            ]);
            setSurveys(surveysRes.data);
            setBusinessPartners(bpRes.data.partners || bpRes.data || []);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Daten.');
        } finally {
            setLoading(false);
        }
    }, [user?.role, user?.business_partner_id, isAssistant]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSort = (key: keyof Survey) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const sortedAndFilteredSurveys = useMemo(() => {
        let filtered = surveys;
        if (bpFilter !== 'all') {
            filtered = filtered.filter(s => s.business_partner_id === bpFilter);
        }
        return filtered.sort((a, b) => {
            const valA = a[sortConfig.key] || '';
            const valB = b[sortConfig.key] || '';
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [surveys, bpFilter, sortConfig]);

    const handleOpenDialog = async (survey: Survey | null = null, isCopy: boolean = false) => {
        if (survey) {
            setIsEditMode(!isCopy);
            try {
                const response = await apiClient.get(`/api/surveys/admin/${survey.id}`);
                const surveyData = response.data;
                const formatDateTime = (dateStr: string | undefined) => dateStr ? new Date(dateStr).toISOString().slice(0, 16) : '';
                
                setCurrentSurvey({
                    ...surveyData,
                    id: isCopy ? undefined : surveyData.id,
                    title: isCopy ? `${surveyData.title} (Kopie)` : surveyData.title,
                    status: isCopy ? 'draft' : getEffectiveStatus(survey), 
                    start_date: isCopy ? '' : formatDateTime(surveyData.start_date),
                    end_date: isCopy ? '' : formatDateTime(surveyData.end_date)
                });
            } catch (err) {
                showSnackbar('Fehler beim Laden der Umfragedaten.', 'error');
                return;
            }
        } else {
            setIsEditMode(false);
            setCurrentSurvey({
                title: '', description: '', status: 'draft', questions: [{ question_text: '', question_type: 'single-choice', options: [''] }],
                business_partner_id: user?.role === 'admin' ? '' : (user?.business_partner_id ?? '')
            });
        }
        setDialogOpen(true);
    };

    const handleQuestionChange = (qIndex: number, field: keyof Question, value: any) => {
        const updatedQuestions = [...currentSurvey.questions];
        (updatedQuestions[qIndex] as any)[field] = value;
        if (field === 'question_type' && value === 'free-text') updatedQuestions[qIndex].options = [];
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
        setCurrentSurvey(prev => ({ ...prev, questions: [...prev.questions, { question_text: '', question_type: 'single-choice', options: [''] }] }));
    };
    
    const handleRemoveQuestion = (qIndex: number) => {
        const updatedQuestions = [...currentSurvey.questions];
        updatedQuestions.splice(qIndex, 1);
        setCurrentSurvey(prev => ({ ...prev, questions: updatedQuestions }));
    };

    const handleSubmit = async () => {
        try {
            if (!isEditMode && !currentSurvey.business_partner_id) {
                showSnackbar('Die Zuordnung zu einem Business Partner fehlt.', 'error');
                return;
            }            
            const payload = { ...currentSurvey, start_date: currentSurvey.start_date || null, end_date: currentSurvey.end_date || null };

            if (isEditMode) {
                await apiClient.put(`/api/surveys/admin/${currentSurvey.id}`, payload);
                showSnackbar('Umfrage erfolgreich aktualisiert.', 'success');
            } else {
                await apiClient.post('/api/surveys/admin', { ...payload, target_bp_id: currentSurvey.business_partner_id });
                showSnackbar('Umfrage erfolgreich erstellt.', 'success');
            }
            setDialogOpen(false);
            fetchData();
        } catch (err: any) {
            showSnackbar(err.response?.data?.message || 'Fehler beim Speichern der Umfrage.', 'error');
        }
    };

    const handleDelete = async (id: string) => {
        if(!window.confirm('Umfrage und alle zugehörigen Antworten unwiderruflich löschen?')) return;
        try {
            await apiClient.delete(`/api/surveys/admin/${id}`);
            showSnackbar('Umfrage gelöscht.', 'success');
            fetchData();
        } catch(e) {
            showSnackbar('Fehler beim Löschen.', 'error');
        }
    };

    const handleShowResults = async (survey: Survey) => {
        try {
            const response = await apiClient.get(`/api/surveys/admin/${survey.id}/results`);
            setCurrentSurvey({ ...survey, questions: [] });
            setCurrentResults(response.data);
            
            const initialChartTypes: Record<string, 'bar'|'pie'> = {};
            response.data.forEach((q: SurveyResult) => { initialChartTypes[q.id] = 'bar'; });
            setChartTypes(initialChartTypes);
            
            setResultsOpen(true);
        } catch (err: any) {
            showSnackbar('Fehler beim Laden der Ergebnisse.', 'error');
        }
    };
    
    const copyResultsToClipboard = () => {
        let clipboardText = `Auswertung der Umfrage: ${currentSurvey.title}\n\n`;
        currentResults.forEach((q, index) => {
            clipboardText += `Frage ${index + 1}: ${q.question_text}\n`;
            if (q.question_type !== 'free-text') {
                const totalVotes = q.results.reduce((acc, r) => acc + parseInt(r.count, 10), 0);
                const uniqueUsers = q.unique_users || '?';
                clipboardText += `[${totalVotes} Antworten von ${uniqueUsers} Teilnehmern]\n`;
                
                q.results.forEach(res => {
                    const percentage = totalVotes > 0 ? ((parseInt(res.count, 10) / totalVotes) * 100).toFixed(1) : "0.0";
                    clipboardText += `- ${res.response_text}: ${res.count} Stimme(n) (${percentage}%)\n`;
                });
            } else {
                clipboardText += `[${q.results.length} Freitext-Antwort(en)]\n`;
                q.results.forEach(res => { clipboardText += `- "${res.response_text}"\n`; });
            }
            clipboardText += "\n";
        });
        navigator.clipboard.writeText(clipboardText);
        showSnackbar('Ergebnisse in die Zwischenablage kopiert.', 'success');
    };

    const handleDownloadCSV = () => {
        let csvContent = "Frage,Typ,Antwort,Anzahl\n";
        currentResults.forEach(q => {
            const safeQuestion = q.question_text.replace(/"/g, '""'); 
            if (q.question_type === 'free-text') {
                q.results.forEach(res => {
                    const safeResponse = res.response_text.replace(/"/g, '""');
                    csvContent += `"${safeQuestion}","Freitext","${safeResponse}",1\n`;
                });
            } else {
                q.results.forEach(res => {
                    const safeResponse = res.response_text.replace(/"/g, '""');
                    csvContent += `"${safeQuestion}","Auswahl","${safeResponse}",${res.count}\n`;
                });
            }
        });
        
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Umfrage_Ergebnisse_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDownloadPDF = async () => {
        try {
            showSnackbar('PDF wird generiert (Diagramme werden geladen)...', 'info');
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const margin = 15;
            const pageWidth = doc.internal.pageSize.getWidth();
            let yPos = margin;

            // Header
            doc.setFontSize(16);
            doc.text(`Auswertung: ${currentSurvey.title || 'Umfrage'}`, margin, yPos);
            yPos += 8;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(`${currentSurvey.business_partner_name || ''}`, margin, yPos);
            yPos += 6;
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100);
            doc.text(`Umfrage ID: ${currentSurvey.id || ''} | Datum: ${new Date().toLocaleDateString('de-DE')}`, margin, yPos);
            yPos += 15;
            doc.setTextColor(0);

            for (let index = 0; index < currentResults.length; index++) {
                const q = currentResults[index];
                const isChoice = q.question_type !== 'free-text';
                const totalVotes = isChoice ? q.results.reduce((acc, r) => acc + parseInt(r.count, 10), 0) : q.results.length;
                const uniqueUsers = q.unique_users || '-';

                // Seitenumbruch prüfen für Fragen-Titel
                if (yPos > doc.internal.pageSize.getHeight() - 40) {
                    doc.addPage();
                    yPos = margin;
                }

                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                const titleLines = doc.splitTextToSize(`${index + 1}. ${q.question_text}`, pageWidth - 2 * margin);
                doc.text(titleLines, margin, yPos);
                yPos += (titleLines.length * 5) + 2;

                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(100);
                doc.text(isChoice ? `Teilnehmer: ${uniqueUsers} | Stimmen: ${totalVotes}` : `Freitext-Antworten: ${totalVotes}`, margin, yPos);
                yPos += 8;
                doc.setTextColor(0);

                // --- DIAGRAMM EXPORT ---
                if (isChoice) {
                    const chartElem = document.getElementById(`chart-pdf-${q.id}`);
                    if (chartElem) {
                        try {
                            const canvas = await html2canvas(chartElem, { 
                                scale: 2, 
                                logging: false, 
                                useCORS: true, 
                                backgroundColor: '#ffffff' 
                            });
                            const imgData = canvas.toDataURL('image/png');
                            const imgWidth = pageWidth - 2 * margin;
                            const imgHeight = (canvas.height * imgWidth) / canvas.width;

                            // Prüfen ob Diagramm auf Seite passt
                            if (yPos + imgHeight > doc.internal.pageSize.getHeight() - margin) {
                                doc.addPage();
                                yPos = margin;
                            }

                            doc.addImage(imgData, 'PNG', margin, yPos, imgWidth, imgHeight);
                            yPos += imgHeight + 10;
                        } catch (e) {
                            console.error("Diagramm konnte nicht gerendert werden", e);
                        }
                    }
                }

                // --- TABELLE ---
                if (isChoice) {
                    const tableData = q.results.map(res => [
                        res.response_text, 
                        res.count.toString(), 
                        totalVotes > 0 ? `${((parseInt(res.count, 10) / totalVotes) * 100).toFixed(1)} %` : "0.0 %"
                    ]);

                    autoTable(doc, {
                        startY: yPos,
                        head: [['Antwort', 'Stimmen', 'Anteil']],
                        body: tableData,
                        margin: { left: margin, right: margin },
                        theme: 'grid',
                        styles: { fontSize: 8 },
                        headStyles: { fillColor: [59, 130, 246] }
                    });
                    yPos = (doc as any).lastAutoTable.finalY + 15;
                } else {
                    const tableData = q.results.map(res => [res.response_text]);
                    autoTable(doc, {
                        startY: yPos,
                        head: [['Antworten']],
                        body: tableData,
                        margin: { left: margin, right: margin },
                        theme: 'grid',
                        styles: { fontSize: 8 },
                        headStyles: { fillColor: [100, 116, 139] }
                    });
                    yPos = (doc as any).lastAutoTable.finalY + 15;
                }
            }

            const safeTitle = (currentSurvey.title || 'Umfrage').substring(0, 20).replace(/[^a-zA-Z0-9]/g, '_');
            doc.save(`Auswertung_${safeTitle}_${new Date().toISOString().split('T')[0]}.pdf`);
            showSnackbar('PDF erfolgreich erstellt.', 'success');
        } catch (err: any) {
            console.error(err);
            showSnackbar('Fehler bei der PDF-Erstellung', 'error');
        }
    };

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4">Umfragen verwalten</Typography>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    {user?.role === 'admin' && businessPartners.length > 0 && (
                        <FormControl size="small" sx={{ minWidth: 200, bgcolor: 'background.paper' }}>
                            <InputLabel>Partner filtern</InputLabel>
                            <Select value={bpFilter} label="Partner filtern" onChange={(e) => setBpFilter(e.target.value)}>
                                <MenuItem value="all"><em>Alle anzeigen</em></MenuItem>
                                {businessPartners.map(bp => (
                                    <MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}
                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>Neue Umfrage</Button>
                </Box>
            </Box>

            {loading ? <CircularProgress /> : error ? <Alert severity="error">{error}</Alert> :
                <Paper><TableContainer><Table>
                    <TableHead>
                        <TableRow>
                            <TableCell><TableSortLabel active={sortConfig.key === 'title'} direction={sortConfig.key === 'title' ? sortConfig.direction : 'asc'} onClick={() => handleSort('title')}>Titel</TableSortLabel></TableCell>
                            <TableCell><TableSortLabel active={sortConfig.key === 'status'} direction={sortConfig.key === 'status' ? sortConfig.direction : 'asc'} onClick={() => handleSort('status')}>Status</TableSortLabel></TableCell>
                            <TableCell>Gültigkeit</TableCell>
                            <TableCell align="center"><TableSortLabel active={sortConfig.key === 'participant_count'} direction={sortConfig.key === 'participant_count' ? sortConfig.direction : 'asc'} onClick={() => handleSort('participant_count')}>Teilnahmen</TableSortLabel></TableCell>
                            {user?.role === 'admin' && (<TableCell><TableSortLabel active={sortConfig.key === 'business_partner_name'} direction={sortConfig.key === 'business_partner_name' ? sortConfig.direction : 'asc'} onClick={() => handleSort('business_partner_name')}>Business Partner</TableSortLabel></TableCell>)}
                            <TableCell align="right">Aktionen</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {sortedAndFilteredSurveys.map(s => {
                            const effectiveStatus = getEffectiveStatus(s);
                            return (
                                <TableRow key={s.id}>
                                    <TableCell>
                                        <Box>
                                            <Typography variant="body2">{s.title}</Typography>
                                            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', fontSize: '0.7rem' }}>{s.id}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Chip label={effectiveStatus === 'closed' && s.status === 'active' ? 'Geschlossen (Auto)' : effectiveStatus} color={effectiveStatus === 'active' ? 'success' : effectiveStatus === 'closed' ? 'error' : 'default'} size="small" />
                                    </TableCell>
                                    <TableCell>{s.start_date ? new Date(s.start_date).toLocaleDateString() : 'Unbegrenzt'} - {s.end_date ? new Date(s.end_date).toLocaleDateString() : 'Unbegrenzt'}</TableCell>
                                    <TableCell align="center"><Typography variant="body2" fontWeight="bold">{s.participant_count || 0}</Typography></TableCell>
                                    {user?.role === 'admin' && <TableCell>{s.business_partner_name}</TableCell>}
                                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                        <Tooltip title="Ergebnisse anzeigen"><IconButton onClick={() => handleShowResults(s)} color="primary"><BarChartIcon /></IconButton></Tooltip>
                                        <Tooltip title="Bearbeiten"><IconButton onClick={() => handleOpenDialog(s)}><EditIcon /></IconButton></Tooltip>
                                        <Tooltip title="Kopieren/Duplizieren"><IconButton onClick={() => handleOpenDialog(s, true)}><ContentCopyIcon /></IconButton></Tooltip>
                                        <Tooltip title="Löschen"><IconButton color="error" onClick={() => handleDelete(s.id)}><DeleteIcon /></IconButton></Tooltip>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table></TableContainer></Paper>
            }

            {/* --- RESULTS DIALOG --- */}
            <Dialog open={resultsOpen} onClose={() => setResultsOpen(false)} fullWidth maxWidth="md" scroll="paper">
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pb: 1 }}>
                    <Box>
                        <Typography variant="h6">Ergebnisse für "{currentSurvey.title}"</Typography>
                        <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 'bold' }}>{currentSurvey.business_partner_name}</Typography>
                        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>Umfrage ID: {currentSurvey.id}</Typography>
                    </Box>
                    <IconButton onClick={() => setResultsOpen(false)} size="small"><CloseIcon /></IconButton>
                </DialogTitle>
                <DialogContent dividers sx={{ bgcolor: '#f8fafc' }}>
                    {currentResults.map((q, index) => {
                        const isChoice = q.question_type !== 'free-text';
                        const totalVotes = isChoice ? q.results.reduce((acc, r) => acc + parseInt(r.count, 10), 0) : q.results.length;
                        const uniqueUsers = q.unique_users || '-'; 
                        const isMulti = q.question_type === 'multiple-choice';

                        return (
                            <Paper key={q.id} sx={{ mb: 4, p: 3, borderRadius: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                    <Box>
                                        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>{index + 1}. {q.question_text}</Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                            {isChoice ? (isMulti ? `Insgesamt ${totalVotes} Antwort(en) von ${uniqueUsers} Teilnehmern. (Mehrfachauswahl)` : `Insgesamt ${totalVotes} Antwort(en) abgegeben.`) : `Insgesamt ${totalVotes} Freitext-Antwort(en).`}
                                        </Typography>
                                    </Box>
                                    {isChoice && (
                                        <ToggleButtonGroup value={chartTypes[q.id] || 'bar'} exclusive onChange={(_, val) => val && setChartTypes(prev => ({...prev, [q.id]: val}))} size="small">
                                            <ToggleButton value="bar"><BarChartOutlinedIcon fontSize="small" /></ToggleButton>
                                            <ToggleButton value="pie"><PieChartIcon fontSize="small" /></ToggleButton>
                                        </ToggleButtonGroup>
                                    )}
                                </Box>

                                {isChoice && (
                                    <Box id={`chart-pdf-${q.id}`} sx={{ height: 400, mt: 3, mb: 2, bgcolor: 'white' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            {chartTypes[q.id] === 'pie' ? (
                                                <PieChart>
                                                    <Pie data={q.results} dataKey="count" nameKey="response_text" cx="50%" cy="45%" outerRadius={100} innerRadius={50} paddingAngle={2} label={({ percent }) => percent > 0 ? `${(percent * 100).toFixed(0)}%` : ''}>
                                                        {q.results.map((_, idx) => (<Cell key={`cell-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />))}
                                                    </Pie>
                                                    <RechartsTooltip formatter={(value: number) => [`${value} Stimmen`, 'Anzahl']} />
                                                    <Legend verticalAlign="bottom" align="center" layout="horizontal" wrapperStyle={{ paddingTop: '30px', fontSize: '12px' }} />
                                                </PieChart>
                                            ) : (
                                                <BarChart data={q.results} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                                    <XAxis type="number" allowDecimals={false} />
                                                    <YAxis type="category" dataKey="response_text" width={180} tick={{ fontSize: 12 }} />
                                                    <RechartsTooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} formatter={(value: number) => [`${value} Stimmen`, 'Anzahl']} />
                                                    <Bar dataKey="count" fill="#3b82f6" barSize={25} radius={[0, 4, 4, 0]}>
                                                        {q.results.map((_, idx) => (<Cell key={`cell-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />))}
                                                    </Bar>
                                                </BarChart>
                                            )}
                                        </ResponsiveContainer>
                                    </Box>
                                )}

                                {!isChoice && (
                                    <Box component="ul" sx={{ pl: 2, maxHeight: 200, overflowY: 'auto', bgcolor: '#f1f5f9', p: 2, borderRadius: 1 }}>
                                        {q.results.length === 0 ? <Typography variant="body2" color="text.secondary">Keine Antworten vorhanden.</Typography> : 
                                            q.results.map((res: any, i) => (<li key={i} style={{ marginBottom: '8px' }}><Typography variant="body2">"{res.response_text}"</Typography></li>))
                                        }
                                    </Box>
                                )}
                            </Paper>
                        );
                    })}
                </DialogContent>
                <DialogActions sx={{ p: 2, bgcolor: '#f8fafc', gap: 1 }}>
                    <Button onClick={copyResultsToClipboard} startIcon={<ContentCopyIcon />} variant="outlined">Kopieren</Button>
                    <Button onClick={handleDownloadCSV} startIcon={<DownloadIcon />} variant="outlined" color="success">CSV</Button>
                    <Button onClick={handleDownloadPDF} startIcon={<PictureAsPdfIcon />} variant="contained" color="primary">PDF Export</Button>
                    <Button onClick={() => setResultsOpen(false)} sx={{ ml: 'auto' }}>Schließen</Button>
                </DialogActions>
            </Dialog>
            
            {/* --- EDIT/CREATE DIALOG --- */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="md">
                <DialogTitle>{isEditMode ? 'Umfrage bearbeiten' : 'Neue Umfrage erstellen'}</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        {user?.role === 'admin' && (
                             <Grid item xs={12}>
                                <FormControl fullWidth required>
                                    <InputLabel>Business Partner</InputLabel>
                                    <Select value={currentSurvey.business_partner_id || ''} label="Business Partner" onChange={(e: SelectChangeEvent) => setCurrentSurvey(p => ({...p, business_partner_id: e.target.value}))}>
                                        {businessPartners.map(bp => (<MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>))}
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
                                    <Select value={q.question_type} label="Frage-Typ" onChange={e => handleQuestionChange(qIndex, 'question_type', e.target.value as 'single-choice' | 'multiple-choice' | 'free-text')}>
                                        <MenuItem value="single-choice">Single-Choice (1 Antwort)</MenuItem>
                                        <MenuItem value="multiple-choice">Multiple-Choice (Mehrere Antworten)</MenuItem>
                                        <MenuItem value="free-text">Freitext</MenuItem>
                                    </Select>
                                </FormControl>
                                {q.question_type !== 'free-text' && (
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