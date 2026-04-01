import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, CircularProgress, Alert, Button, Radio, RadioGroup,
    FormControlLabel, TextField, Tabs, Tab, List, ListItem, 
    ListItemText, ListItemButton, Checkbox, FormGroup, LinearProgress, Card, CardContent, Fade
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import BarChartIcon from '@mui/icons-material/BarChart';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import SendIcon from '@mui/icons-material/Send';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import WordCloud from 'react-d3-cloud';

import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useSnackbar } from '../../context/SnackbarContext';

// --- Interfaces ---
interface Question { id: string; question_text: string; question_type: 'single-choice' | 'multiple-choice' | 'free-text'; options: string[]; }
interface Survey { id: string; title: string; description?: string; questions: Question[]; completed_at?: string; }
interface SurveyResult { id: string; question_text: string; question_type: 'single-choice' | 'multiple-choice' | 'free-text'; results: any[]; }
interface SurveyWidgetProps extends BaseWidgetProps { icon?: React.ReactNode; title: string; }

// --- Ergebnis-Komponente ---
const SurveyResultsCard: React.FC<{ survey: Survey; results: SurveyResult[]; userResponses: any }> = ({ survey, results, userResponses }) => {
    return (
        <Box>
            <Typography variant="h6" gutterBottom>{survey.title}</Typography>
            
            {results.map(res => {
                // NEU: Berechne die Gesamtstimmen für diese Frage, um die Prozente zu ermitteln
                const totalVotes = res.question_type !== 'free-text' 
                    ? res.results.reduce((acc: number, curr: any) => acc + parseInt(curr.count, 10), 0)
                    : 0;

                return (
                    <Card key={res.id} variant="outlined" sx={{ mb: 3, borderRadius: 2 }}>
                        <CardContent>
                            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2 }}>{res.question_text}</Typography>
                            
                            {(res.question_type === 'single-choice' || res.question_type === 'multiple-choice') && (
                                <Box sx={{ height: 180 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        {/* right-margin erhöht, damit die Prozentzahlen Platz haben */}
                                        <BarChart data={res.results} layout="vertical" margin={{ top: 5, right: 60, left: 10, bottom: 5 }}>
                                            <XAxis type="number" hide />
                                            <YAxis type="category" dataKey="response_text" width={130} tick={{ fontSize: 12 }} />
                                            
                                            {/* NEU: Tooltip zeigt jetzt auch Prozent an */}
                                            <Tooltip 
                                                cursor={{ fill: 'rgba(0,0,0,0.05)' }} 
                                                formatter={(value: number) => {
                                                    const pct = totalVotes > 0 ? ((value / totalVotes) * 100).toFixed(1) : "0.0";
                                                    return [`${value} Stimme(n) (${pct}%)`, 'Anzahl'];
                                                }} 
                                            />
                                            
                                            <Bar dataKey="count" fill="#8884d8" barSize={25} radius={[0, 4, 4, 0]}>
                                                {/* NEU: LabelList rendert den Wert direkt neben den Balken */}
                                                <LabelList 
                                                    dataKey="count" 
                                                    position="right" 
                                                    formatter={(value: number) => {
                                                        const pct = totalVotes > 0 ? ((value / totalVotes) * 100).toFixed(1) : "0.0";
                                                        return `${value} (${pct}%)`;
                                                    }}
                                                    style={{ fontSize: '12px', fontWeight: 'bold', fill: '#64748b' }}
                                                />
                                                {res.results.map((entry: any) => {
                                                    // Überprüfe, ob der User diese Antwort gegeben hat (für Highlighting)
                                                    const isSelected = Array.isArray(userResponses[res.id]) 
                                                        ? userResponses[res.id].includes(entry.response_text)
                                                        : userResponses[res.id] === entry.response_text;
                                                    return <Cell key={`cell-${entry.response_text}`} fill={isSelected ? '#4caf50' : '#1976d2'} />;
                                                })}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </Box>
                            )}

                            {res.question_type === 'free-text' && (
                                <Box sx={{ height: 200, mt: 1, backgroundColor: '#f9f9f9', borderRadius: 2, overflow: 'hidden' }}>
                                    {res.results.length > 0 ? (
                                        <WordCloud
                                            data={res.results} rotate={0} padding={2}
                                            fontSize={(word) => Math.log2(word.value) * 15 + 12} 
                                        />
                                    ) : <Typography sx={{ p: 2 }} color="text.secondary">Keine Freitext-Antworten.</Typography>}
                                </Box>
                            )}
                        </CardContent>
                    </Card>
                );
            })}
        </Box>
    );
};

// --- Haupt-Widget ---
const SurveyWidget: React.FC<SurveyWidgetProps> = ({ onDelete, widgetId, isRemovable, icon, title, widgetTypeKey }) => {
    const { showSnackbar } = useSnackbar();
    const [view, setView] = useState<'loading' | 'active' | 'archive' | 'taking' | 'results' | 'empty' | 'error'>('loading');
    const [error, setError] = useState<string | null>(null);
    
    const [activeSurveys, setActiveSurveys] = useState<Survey[]>([]);
    const [archivedSurveys, setArchivedSurveys] = useState<Survey[]>([]);
    
    // Für die Durchführung der Umfrage
    const [currentSurvey, setCurrentSurvey] = useState<Survey | null>(null);
    const [currentStep, setCurrentStep] = useState(0); // Wizard-Schritt
    const [responses, setResponses] = useState<{ [key: string]: string | string[] }>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [currentResults, setCurrentResults] = useState<{ survey: Survey, results: SurveyResult[], userResponses: any } | null>(null);

    // Lade-Funktionen
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

    const handleStartSurvey = (survey: Survey) => {
        setCurrentSurvey(survey);
        setCurrentStep(0);
        setResponses({});
        setView('taking');
    };

    const handleViewArchivedResults = async (survey: Survey) => {
        setView('loading');
        try {
            const res = await apiClient.get(`/api/surveys/${survey.id}/results`);
            setCurrentResults({ survey, results: res.data, userResponses: {} });
            setView('results');
        } catch (err) {
            showSnackbar("Ergebnisse konnten nicht geladen werden.", "error");
            setView('archive');
        }
    };

    // --- Antwort-Handler ---
    const handleRadioChange = (questionId: string, value: string) => {
        setResponses(p => ({ ...p, [questionId]: value }));
    };

    const handleCheckboxChange = (questionId: string, value: string, checked: boolean) => {
        setResponses(p => {
            const currentAnswers = (p[questionId] as string[]) || [];
            if (checked) {
                return { ...p, [questionId]: [...currentAnswers, value] };
            } else {
                return { ...p, [questionId]: currentAnswers.filter(a => a !== value) };
            }
        });
    };

    const handleTextChange = (questionId: string, value: string) => {
        setResponses(p => ({ ...p, [questionId]: value }));
    };

    const handleSubmit = async () => {
        if (!currentSurvey) return;
        setIsSubmitting(true);
        try {
            await apiClient.post('/api/surveys/submit', { surveyId: currentSurvey.id, responses });
            const res = await apiClient.get(`/api/surveys/${currentSurvey.id}/results`);
            setCurrentResults({ survey: currentSurvey, results: res.data, userResponses: responses });
            setView('results');
            showSnackbar('Vielen Dank für Ihre Teilnahme!', 'success');
        } catch (err: any) {
            showSnackbar(err.response?.data?.message || 'Fehler beim Senden.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

const renderTakingSurvey = () => {
        if (!currentSurvey) return null;
        const currentQ = currentSurvey.questions[currentStep];
        const progress = ((currentStep) / currentSurvey.questions.length) * 100;
        const isLastStep = currentStep === currentSurvey.questions.length - 1;
        
        // Validierung für "Weiter"-Button
        const currentAnswer = responses[currentQ.id];
        const hasAnsweredCurrent = currentAnswer !== undefined && 
                                  (typeof currentAnswer === 'string' ? currentAnswer.trim() !== '' : currentAnswer.length > 0);

        // NEU: Logik für den Zurück-Button
        const handleBack = () => {
            if (currentStep > 0) {
                // Gehe zur vorherigen Frage
                setCurrentStep(prev => prev - 1);
            } else {
                // Wir sind bei Frage 1 -> Umfrage abbrechen und zurück zur Übersicht
                setCurrentSurvey(null);
                setView('active');
            }
        };

        const handleNext = () => {
            if (currentStep < currentSurvey.questions.length - 1) {
                setCurrentStep(prev => prev + 1);
            }
        };

        return (
            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Typography variant="h6" gutterBottom>{currentSurvey.title}</Typography>
                <LinearProgress variant="determinate" value={progress} sx={{ mb: 3, height: 8, borderRadius: 4 }} />
                <Typography variant="caption" color="text.secondary" sx={{ mb: 2 }}>
                    Frage {currentStep + 1} von {currentSurvey.questions.length}
                </Typography>

                <Fade in={true} key={currentStep}>
                    <Card variant="outlined" sx={{ flexGrow: 1, p: 3, borderRadius: 2 }}>
                        <Typography variant="h6" sx={{ mb: 3 }}>{currentQ.question_text}</Typography>
                        
                        {currentQ.question_type === 'single-choice' && (
                            <RadioGroup 
                                value={responses[currentQ.id] || ''} 
                                onChange={(e) => handleRadioChange(currentQ.id, e.target.value)}
                            >
                                {currentQ.options.map(opt => (
                                    <FormControlLabel key={opt} value={opt} control={<Radio />} label={opt} sx={{ mb: 1 }} />
                                ))}
                            </RadioGroup>
                        )}

                        {currentQ.question_type === 'multiple-choice' && (
                            <FormGroup>
                                {currentQ.options.map(opt => {
                                    const isChecked = ((responses[currentQ.id] as string[]) || []).includes(opt);
                                    return (
                                        <FormControlLabel 
                                            key={opt} 
                                            control={<Checkbox checked={isChecked} onChange={(e) => handleCheckboxChange(currentQ.id, opt, e.target.checked)} />} 
                                            label={opt} 
                                            sx={{ mb: 1 }}
                                        />
                                    );
                                })}
                            </FormGroup>
                        )}

                        {currentQ.question_type === 'free-text' && (
                            <TextField 
                                fullWidth multiline rows={4} variant="outlined" placeholder="Ihre Antwort..."
                                value={responses[currentQ.id] || ''}
                                onChange={(e) => handleTextChange(currentQ.id, e.target.value)}
                            />
                        )}
                    </Card>
                </Fade>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
                    {/* ZURÜCK BUTTON: Ist jetzt nie komplett deaktiviert (außer beim Laden) */}
                    <Button 
                        disabled={isSubmitting} 
                        onClick={handleBack}
                        startIcon={<ArrowBackIosNewIcon />}
                        color={currentStep === 0 ? "inherit" : "primary"}
                    >
                        {currentStep === 0 ? 'Abbrechen' : 'Zurück'}
                    </Button>
                    
                    {/* WEITER / ABSENDEN BUTTON */}
                    {isLastStep ? (
                        <Button 
                            variant="contained" 
                            color="primary" 
                            onClick={handleSubmit} 
                            disabled={!hasAnsweredCurrent || isSubmitting}
                            endIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
                        >
                            Absenden
                        </Button>
                    ) : (
                        <Button 
                            variant="contained" 
                            onClick={handleNext}
                            disabled={!hasAnsweredCurrent || isSubmitting}
                            endIcon={<ArrowForwardIosIcon />}
                        >
                            Weiter
                        </Button>
                    )}
                </Box>
            </Box>
        );
    };

    const renderContent = () => {
        switch(view) {
            case 'loading': return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
            case 'error': return <Alert severity="error">{error}</Alert>;
            case 'empty': return (
                <Box sx={{ textAlign: 'center', p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <CheckCircleOutlineIcon color="success" sx={{ fontSize: 60 }}/>
                    <Typography variant="h6">Alles erledigt!</Typography>
                    <Typography color="text.secondary">Aktuell gibt es keine neuen Umfragen für Sie.</Typography>
                </Box>
            );
            case 'active': return (
                <List sx={{ p: 2 }}>
                    {activeSurveys.map(s => (
                        <Card key={s.id} variant="outlined" sx={{ mb: 2, borderRadius: 2, transition: '0.2s', '&:hover': { borderColor: 'primary.main', boxShadow: 1 } }}>
                            <ListItem disablePadding>
                                <ListItemButton onClick={() => handleStartSurvey(s)} sx={{ p: 2 }}>
                                    <ListItemText 
                                        primary={<Typography variant="h6" color="primary">{s.title}</Typography>} 
                                        secondary={s.description || 'Klicken Sie hier, um teilzunehmen.'} 
                                    />
                                    <ArrowForwardIosIcon color="action" />
                                </ListItemButton>
                            </ListItem>
                        </Card>
                    ))}
                </List>
            );
            case 'archive': return (
                 <List sx={{ p: 2 }}>
                    {archivedSurveys.length > 0 ? archivedSurveys.map(s => (
                        <Card key={s.id} variant="outlined" sx={{ mb: 2, borderRadius: 2 }}>
                            <ListItem disablePadding>
                                <ListItemButton onClick={() => handleViewArchivedResults(s)} sx={{ p: 2 }}>
                                    <ListItemText 
                                        primary={s.title} 
                                        secondary={`Abgeschlossen am: ${new Date(s.completed_at!).toLocaleDateString('de-DE')}`} 
                                    />
                                    <BarChartIcon color="action" />
                                </ListItemButton>
                            </ListItem>
                        </Card>
                    )) : <Typography color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>Keine abgeschlossenen Umfragen im Archiv.</Typography>}
                </List>
            );
            case 'taking': return renderTakingSurvey();
            case 'results':
                if (!currentResults) return null;
                return (
                    <Box sx={{ p: 2 }}>
                        <SurveyResultsCard {...currentResults} />
                        <Button variant="outlined" sx={{ mt: 3 }} onClick={fetchActiveSurveys} fullWidth>
                            Zurück zur Übersicht
                        </Button>
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
                    <Tab label="Neue Umfragen" disabled={view === 'taking' || view === 'results'} />
                    <Tab label="Archiv" disabled={view === 'taking' || view === 'results'} />
                </Tabs>
            </Box>
            <Box sx={{ minHeight: '350px', position: 'relative' }}>
                {renderContent()}
            </Box>
        </WidgetPaper>
    );
};

export default SurveyWidget;