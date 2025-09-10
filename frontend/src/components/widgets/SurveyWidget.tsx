// frontend/src/components/widgets/SurveyWidget.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, CircularProgress, Alert, Button, Radio, RadioGroup,
    FormControlLabel, FormControl, FormLabel, TextField, Card, CardContent, CardActions,
    MobileStepper, LinearProgress
} from '@mui/material';
import KeyboardArrowLeft from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useSnackbar } from '../../context/SnackbarContext';

interface Question {
    id: string;
    question_text: string;
    question_type: 'multiple-choice' | 'free-text';
    options: string[];
}

interface Survey {
    id: string;
    title: string;
    description?: string;
    questions: Question[];
}

interface SurveyResult {
    id: string;
    question_text: string;
    question_type: 'multiple-choice' | 'free-text';
    results: { response_text: string, count: string }[] | { response_text: string }[];
}

interface SurveyWidgetProps extends BaseWidgetProps {
    icon?: React.ReactNode;
    title: string;
}

const SurveyResultsCard: React.FC<{ survey: Survey; results: SurveyResult[]; userResponses: { [key: string]: string } }> = ({ survey, results, userResponses }) => {
    const totalParticipants = results.length > 0 && results[0].results.length > 0
        ? results[0].results.reduce((acc, r: any) => acc + (parseInt(r.count, 10) || 1), 0)
        : 0;

    return (
        <Card variant="outlined" sx={{ minHeight: 280 }}>
            <CardContent>
                <Typography variant="h6" gutterBottom>{survey.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Ergebnisse (basierend auf {totalParticipants} Teilnehmern)
                </Typography>
                {results.map(questionResult => {
                    if (questionResult.question_type === 'multiple-choice') {
                        const totalVotes = questionResult.results.reduce((sum, result: any) => sum + parseInt(result.count, 10), 0);
                        return (
                            <Box key={questionResult.id} sx={{ mb: 3 }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>{questionResult.question_text}</Typography>
                                {(questionResult.results as { response_text: string, count: string }[]).map(res => {
                                    const percentage = totalVotes > 0 ? (parseInt(res.count, 10) / totalVotes) * 100 : 0;
                                    const isUserChoice = userResponses[questionResult.id] === res.response_text;
                                    return (
                                        <Box key={res.response_text} sx={{ mt: 1 }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                                <Typography variant="body2" sx={{ fontWeight: isUserChoice ? 'bold' : 'normal' }}>{res.response_text}</Typography>
                                                <Typography variant="body2" color="text.secondary">{percentage.toFixed(1)}%</Typography>
                                            </Box>
                                            <LinearProgress
                                                variant="determinate"
                                                value={percentage}
                                                color={isUserChoice ? 'primary' : 'inherit'}
                                                sx={{ height: 8, borderRadius: 2 }}
                                            />
                                        </Box>
                                    );
                                })}
                            </Box>
                        );
                    }
                    return null;
                })}
            </CardContent>
        </Card>
    );
};


const SurveyWidget: React.FC<SurveyWidgetProps> = ({ onDelete, widgetId, isRemovable, icon, title, widgetTypeKey }) => {
    const { showSnackbar } = useSnackbar();
    const [surveys, setSurveys] = useState<Survey[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeSurveyIndex, setActiveSurveyIndex] = useState(0);
    const [responses, setResponses] = useState<{ [key: string]: string }>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [completedSurveyData, setCompletedSurveyData] = useState<{ [surveyId: string]: { results: SurveyResult[], userResponses: { [key: string]: string } } }>({});

    const fetchSurveys = useCallback(async () => {
        setLoading(true);
        try {
            const response = await apiClient.get('/api/surveys/active');
            setSurveys(response.data);
            setError(null);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Umfragen.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSurveys();
    }, [fetchSurveys]);

    const fetchResults = async (surveyId: string, userResponses: { [key: string]: string }) => {
        try {
            const response = await apiClient.get(`/api/surveys/admin/${surveyId}/results`);
            setCompletedSurveyData(prev => ({
                ...prev,
                [surveyId]: { results: response.data, userResponses }
            }));
        } catch (err) {
            console.error("Fehler beim Laden der Umfrage-Ergebnisse:", err);
        }
    };

    const handleResponseChange = (questionId: string, value: string) => {
        setResponses(prev => ({ ...prev, [questionId]: value }));
    };

    const handleSubmit = async () => {
        const currentSurvey = surveys[activeSurveyIndex];
        if (!currentSurvey) return;

        if (currentSurvey.questions.length > Object.keys(responses).length) {
            showSnackbar('Bitte beantworten Sie alle Fragen.', 'warning');
            return;
        }

        setIsSubmitting(true);
        try {
            await apiClient.post('/api/surveys/submit', {
                surveyId: currentSurvey.id,
                responses: responses,
            });
            showSnackbar('Vielen Dank für Ihre Teilnahme!', 'success');
            await fetchResults(currentSurvey.id, responses);
            setResponses({});
        } catch (err: any) {
            showSnackbar(err.response?.data?.message || 'Fehler beim Senden der Antworten.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleNext = () => {
        setActiveSurveyIndex((prev) => prev + 1);
    };

    const handleBack = () => {
        setActiveSurveyIndex((prev) => prev - 1);
    };
    
    const visibleSurveys = surveys.filter(s => !completedSurveyData[s.id]);
    const currentSurvey = visibleSurveys[activeSurveyIndex];
    const completedSurveyIds = Object.keys(completedSurveyData);
    const allSurveysCompleted = surveys.length > 0 && surveys.every(s => completedSurveyIds.includes(s.id));
    
    const renderContent = () => {
        if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
        if (error) return <Alert severity="error">{error}</Alert>;
        if (surveys.length === 0 || allSurveysCompleted) {
             return (
                <Box sx={{ textAlign: 'center', p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <CheckCircleOutlineIcon color="success" sx={{ fontSize: 40 }}/>
                    <Typography color="text.secondary">
                        {surveys.length > 0 ? 'Sie haben an allen verfügbaren Umfragen teilgenommen. Vielen Dank!' : 'Aktuell gibt es keine neuen Umfragen.'}
                    </Typography>
                </Box>
            );
        }
        
        const alreadyCompletedSurvey = surveys[activeSurveyIndex];
        if (completedSurveyData[alreadyCompletedSurvey?.id]) {
            return <SurveyResultsCard 
                        survey={alreadyCompletedSurvey} 
                        results={completedSurveyData[alreadyCompletedSurvey.id].results} 
                        userResponses={completedSurveyData[alreadyCompletedSurvey.id].userResponses}
                   />;
        }
        
        return (
            <Card variant="outlined" sx={{ minHeight: 280, display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" gutterBottom>{currentSurvey.title}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{currentSurvey.description}</Typography>
                    
                    {currentSurvey.questions.map(q => (
                        <Box key={q.id} sx={{ mt: 2 }}>
                            <FormControl fullWidth>
                                <FormLabel>{q.question_text}</FormLabel>
                                {q.question_type === 'multiple-choice' ? (
                                    <RadioGroup value={responses[q.id] || ''} onChange={(e) => handleResponseChange(q.id, e.target.value)}>
                                        {q.options.map(opt => <FormControlLabel key={opt} value={opt} control={<Radio />} label={opt} />)}
                                    </RadioGroup>
                                ) : (
                                    <TextField
                                        fullWidth multiline rows={2} variant="outlined" size="small"
                                        value={responses[q.id] || ''}
                                        onChange={(e) => handleResponseChange(q.id, e.target.value)}
                                    />
                                )}
                            </FormControl>
                        </Box>
                    ))}
                </CardContent>
                <CardActions sx={{ display: 'flex', justifyContent: 'space-between', p: 2 }}>
                     <MobileStepper
                        variant="dots"
                        steps={surveys.length}
                        position="static"
                        activeStep={activeSurveyIndex}
                        sx={{ flexGrow: 1, bgcolor: 'transparent', p: 0 }}
                        nextButton={ <Button size="small" onClick={handleNext} disabled={activeSurveyIndex === surveys.length - 1}><KeyboardArrowRight /></Button> }
                        backButton={ <Button size="small" onClick={handleBack} disabled={activeSurveyIndex === 0}><KeyboardArrowLeft /></Button> }
                    />
                    <Button variant="contained" onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? <CircularProgress size={24} color="inherit"/> : 'Antworten Senden'}
                    </Button>
                </CardActions>
            </Card>
        );
    };

    return (
        <WidgetPaper
            title={<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>{icon}<Typography variant="h6" noWrap>{title}</Typography></Box>}
            widgetTitle={title}
            widgetId={widgetId}
            onDelete={onDelete}
            isRemovable={isRemovable}
            widgetTypeKey={widgetTypeKey || ''}
        >
            {renderContent()}
        </WidgetPaper>
    );
};

export default SurveyWidget;