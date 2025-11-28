import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, CircularProgress, Alert, Button, Radio, RadioGroup,
    FormControlLabel, FormControl, FormLabel, TextField, Tabs, Tab, List, ListItem, ListItemText, ListItemButton
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import WordCloud from 'react-d3-cloud';

import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useSnackbar } from '../../context/SnackbarContext';

// --- Interfaces (unverändert) ---
interface Question { id: string; question_text: string; question_type: 'multiple-choice' | 'free-text'; options: string[]; }
interface Survey { id: string; title: string; description?: string; questions: Question[]; completed_at?: string; }
interface SurveyResult { id: string; question_text: string; question_type: 'multiple-choice' | 'free-text'; results: any[]; }
interface SurveyWidgetProps extends BaseWidgetProps { icon?: React.ReactNode; title: string; }

const SurveyResultsCard: React.FC<{ survey: Survey; results: SurveyResult[]; userResponses: { [key: string]: string } }> = ({ survey, results, userResponses }) => {
    const totalParticipants = results.length > 0 && results[0].results.length > 0 && results[0].question_type === 'multiple-choice'
        ? results[0].results.reduce((acc: number, r: any) => acc + (parseInt(r.count, 10) || 0), 0) : 0;

    return (
        <Box>
            <Typography variant="h6" gutterBottom>{survey.title}</Typography>
            {totalParticipants > 0 && <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Ergebnisse (basierend auf {totalParticipants} Teilnehmern)</Typography>}
            
            {results.map(res => (
                <Box key={res.id} sx={{ mb: 4 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>{res.question_text}</Typography>
                    {res.question_type === 'multiple-choice' && (
                        <Box sx={{ height: 150, mt: 2 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={res.results} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <XAxis type="number" hide />
                                    <YAxis type="category" dataKey="response_text" width={120} tick={{ fontSize: 12 }} />
                                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} formatter={(value: number) => [`${value} Stimmen`, 'Anzahl']} />
                                    <Bar dataKey="count" fill="#8884d8" barSize={20}>
                                        {res.results.map((entry: any) => (
                                            <Cell key={`cell-${entry.response_text}`} fill={userResponses[res.id] === entry.response_text ? '#82ca9d' : '#8884d8'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </Box>
                    )}
                    {res.question_type === 'free-text' && (
                        <Box sx={{ height: 200, mt: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                            {res.results.length > 0 ? (
                                <WordCloud
                                    data={res.results}
                                    rotate={0}
                                    padding={2}
                                    fontSize={(word) => Math.log2(word.value) * 15 + 12} 
                                />
                            ) : <Typography sx={{ p: 2 }} color="text.secondary">Keine Freitext-Antworten.</Typography>}
                        </Box>
                    )}
                </Box>
            ))}
        </Box>
    );
};

const SurveyWidget: React.FC<SurveyWidgetProps> = ({ onDelete, widgetId, isRemovable, icon, title, widgetTypeKey }) => {
    const { showSnackbar } = useSnackbar();
    const [view, setView] = useState<'loading' | 'active' | 'archive' | 'taking' | 'results' | 'empty' | 'error'>('loading');
    const [error, setError] = useState<string | null>(null);
    
    const [activeSurveys, setActiveSurveys] = useState<Survey[]>([]);
    const [archivedSurveys, setArchivedSurveys] = useState<Survey[]>([]);
    const [currentSurvey, setCurrentSurvey] = useState<Survey | null>(null);
    
    const [responses, setResponses] = useState<{ [key: string]: string }>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentResults, setCurrentResults] = useState<{ survey: Survey, results: SurveyResult[], userResponses: { [key: string]: string } } | null>(null);

    useEffect(() => {
        if (currentSurvey) {
            localStorage.setItem(`survey-progress-${currentSurvey.id}`, JSON.stringify(responses));
        }
    }, [responses, currentSurvey]);

    const handleStartSurvey = (survey: Survey) => {
        setCurrentSurvey(survey);
        const savedProgress = localStorage.getItem(`survey-progress-${survey.id}`);
        if (savedProgress) {
            setResponses(JSON.parse(savedProgress));
        } else {
            setResponses({});
        }
        setView('taking');
    };

    const fetchActiveSurveys = useCallback(async () => {
        setView('loading');
        try {
            const response = await apiClient.get('/api/surveys/active');
            const surveysData: Survey[] = response.data;
            setActiveSurveys(surveysData);
            
            if (surveysData.length === 1) {
                handleStartSurvey(surveysData[0]);
            } else if (surveysData.length > 1) {
                setView('active');
            } else {
                setView('empty');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Umfragen.');
            setView('error');
        }
    }, []); 

    const fetchArchivedSurveys = useCallback(async () => {
        setView('loading');
        try {
            const response = await apiClient.get('/api/surveys/archive');
            setArchivedSurveys(response.data);
            setView('archive');
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden des Archivs.');
            setView('error');
        }
    }, []);

    useEffect(() => { fetchActiveSurveys(); }, [fetchActiveSurveys]);
    
    const handleViewArchivedResults = async (survey: Survey) => {
        setView('loading');
        try {
            // KORREKTUR: Nutze den öffentlichen Endpunkt statt /admin
            const res = await apiClient.get(`/api/surveys/${survey.id}/results`);
            setCurrentResults({ survey, results: res.data, userResponses: {} });
            setView('results');
        } catch (err) {
            showSnackbar("Ergebnisse konnten nicht geladen werden.", "error");
            setView('archive');
        }
    };
    
    const handleSubmit = async () => {
        if (!currentSurvey) return;
        setIsSubmitting(true);
        try {
            await apiClient.post('/api/surveys/submit', { surveyId: currentSurvey.id, responses });
            
            // KORREKTUR: Nutze den öffentlichen Endpunkt statt /admin
            const res = await apiClient.get(`/api/surveys/${currentSurvey.id}/results`);
            
            setCurrentResults({ survey: currentSurvey, results: res.data, userResponses: responses });
            setView('results');
            localStorage.removeItem(`survey-progress-${currentSurvey.id}`);
            showSnackbar('Vielen Dank für Ihre Teilnahme!', 'success');
        } catch (err: any) {
            showSnackbar(err.response?.data?.message || 'Fehler beim Senden.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const renderContent = () => {
        switch(view) {
            case 'loading': return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
            case 'error': return <Alert severity="error">{error}</Alert>;
            case 'empty': return (
                <Box sx={{ textAlign: 'center', p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <CheckCircleOutlineIcon color="success" sx={{ fontSize: 40 }}/>
                    <Typography color="text.secondary">Aktuell gibt es keine neuen Umfragen.</Typography>
                </Box>
            );
            case 'active': return (
                <List>
                    {activeSurveys.map(s => (
                        <ListItem key={s.id} disablePadding>
                            <ListItemButton onClick={() => handleStartSurvey(s)}>
                                <ListItemText primary={s.title} secondary={s.description} />
                            </ListItemButton>
                        </ListItem>
                    ))}
                </List>
            );
            case 'archive': return (
                 <List>
                    {archivedSurveys.length > 0 ? archivedSurveys.map(s => (
                        <ListItem key={s.id} disablePadding>
                            <ListItemButton onClick={() => handleViewArchivedResults(s)}>
                                <ListItemText primary={s.title} secondary={`Teilgenommen am: ${new Date(s.completed_at!).toLocaleDateString('de-DE')}`} />
                            </ListItemButton>
                        </ListItem>
                    )) : <Typography color="text.secondary" sx={{ p: 2 }}>Keine abgeschlossenen Umfragen im Archiv.</Typography>}
                </List>
            );
            case 'taking':
                if (!currentSurvey) return null;
                return (
                    <Box sx={{ p: 2 }}>
                        <Typography variant="h6">{currentSurvey.title}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{currentSurvey.description}</Typography>
                        {currentSurvey.questions.map(q => (
                            <Box key={q.id} sx={{ mt: 2 }}>
                                <FormControl fullWidth>
                                    <FormLabel>{q.question_text}</FormLabel>
                                    {q.question_type === 'multiple-choice' ? (
                                        <RadioGroup value={responses[q.id] || ''} onChange={(e) => setResponses(p => ({ ...p, [q.id]: e.target.value }))}>
                                            {q.options.map(opt => <FormControlLabel key={opt} value={opt} control={<Radio />} label={opt} />)}
                                        </RadioGroup>
                                    ) : (
                                        <TextField fullWidth multiline rows={2} variant="outlined" size="small" value={responses[q.id] || ''}
                                            onChange={(e) => setResponses(p => ({ ...p, [q.id]: e.target.value }))}
                                        />
                                    )}
                                </FormControl>
                            </Box>
                        ))}
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mt: 3 }}>
                            {activeSurveys.length > 1 && (
                                <Button onClick={fetchActiveSurveys} sx={{ mr: 'auto' }}>
                                    Zurück zur Übersicht
                                </Button>
                            )}
                            <Button variant="contained" onClick={handleSubmit} disabled={isSubmitting}>
                                {isSubmitting ? <CircularProgress size={24} color="inherit"/> : 'Antworten Senden'}
                            </Button>
                        </Box>
                    </Box>
                );
            case 'results':
                if (!currentResults) return null;
                return (
                    <Box sx={{ p: 2 }}>
                        <SurveyResultsCard {...currentResults} />
                        <Button sx={{ mt: 2 }} onClick={fetchActiveSurveys}>Zurück zur Übersicht</Button>
                    </Box>
                );
        }
    };

    return (
        <WidgetPaper
            title={<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>{icon}<Typography variant="h6" noWrap>{title}</Typography></Box>}
            widgetTitle={title} widgetId={widgetId} onDelete={onDelete} isRemovable={isRemovable} widgetTypeKey={widgetTypeKey || ''}
            noPadding
        >
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={view === 'archive' ? 1 : 0} onChange={(_, newValue) => newValue === 1 ? fetchArchivedSurveys() : fetchActiveSurveys()} variant="fullWidth">
                    <Tab label="Neue Umfragen" />
                    <Tab label="Archiv" />
                </Tabs>
            </Box>
            <Box sx={{ minHeight: '280px', position: 'relative' }}>
                {renderContent()}
            </Box>
        </WidgetPaper>
    );
};

export default SurveyWidget;