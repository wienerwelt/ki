import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Stack, Skeleton, Fade } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import apiClient from '../../apiClient';
import WidgetPaper from './WidgetPaper'; 
import { BaseWidgetProps } from '../../types/dashboard.types';

const SentimentWidget: React.FC<BaseWidgetProps> = ({ widgetId, onDelete, isRemovable, title, widgetTypeKey }) => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [animating, setAnimating] = useState(false);

    const fetchData = async () => {
        try {
            const res = await apiClient.get('/api/data/sentiment');
            setData(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleVote = async (vote: 'bullish' | 'bearish') => {
        setAnimating(true);
        try {
            await apiClient.post('/api/data/sentiment/vote', { questionId: data.questionId, vote });
            await fetchData(); 
        } catch (e) {
            console.error(e);
        } finally {
            setAnimating(false);
        }
    };

    // Helper für widgetTitle (muss string sein)
    const displayTitle = typeof title === 'string' ? title : "Markt-Puls";

    if (loading) {
        return (
            <WidgetPaper 
                widgetId={widgetId} 
                // KORREKTUR: widgetTitle und widgetTypeKey hinzugefügt
                widgetTitle={displayTitle} 
                widgetTypeKey={widgetTypeKey || 'sentiment_widget'}
                title={<Typography variant="h6">{displayTitle}</Typography>}
                onDelete={onDelete} 
                isRemovable={isRemovable}
                loading={true}
                error={null}
            >
                <Skeleton height={150} />
            </WidgetPaper>
        );
    }

    if (!data?.active) return null; 

    const isBullish = data.userVote === 'bullish';
    const isBearish = data.userVote === 'bearish';

    return (
        <WidgetPaper 
            widgetId={widgetId} 
            widgetTitle={displayTitle} 
            widgetTypeKey={widgetTypeKey || 'sentiment_widget'}
            title={<Typography variant="h6">{displayTitle}</Typography>}
            onDelete={onDelete} 
            isRemovable={isRemovable} 
            noPadding
            loading={false}
            error={null}
        >
            <Box sx={{ p: 3, textAlign: 'center' }}>
                
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom sx={{ lineHeight: 1.3 }}>
                    {data.questionText || "Wie ist die Marktstimmung?"}
                </Typography>

                {!data.hasVoted ? (
                    <Fade in={!data.hasVoted}>
                        <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 2 }}>
                            <Button 
                                variant="contained" 
                                color="success" 
                                size="large"
                                startIcon={<TrendingUpIcon />}
                                onClick={() => handleVote('bullish')}
                                disabled={animating} // KORREKTUR: animating genutzt
                                sx={{ 
                                    flex: 1, 
                                    py: 2, 
                                    fontSize: '1.1rem',
                                    background: 'linear-gradient(45deg, #2e7d32 30%, #4caf50 90%)'
                                }}
                            >
                                Positiv
                            </Button>
                            <Button 
                                variant="contained" 
                                color="error" 
                                size="large"
                                startIcon={<TrendingDownIcon />}
                                onClick={() => handleVote('bearish')}
                                disabled={animating} // KORREKTUR: animating genutzt
                                sx={{ 
                                    flex: 1, 
                                    py: 2, 
                                    fontSize: '1.1rem',
                                    background: 'linear-gradient(45deg, #c62828 30%, #ef5350 90%)'
                                }}
                            >
                                Negativ
                            </Button>
                        </Stack>
                    </Fade>
                ) : (
                    <Fade in={data.hasVoted}>
                        <Box sx={{ mt: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="h4" color="success.main" fontWeight="bold">
                                    {data.stats.bullishPercent}%
                                </Typography>
                                <Typography variant="h4" color="error.main" fontWeight="bold">
                                    {data.stats.bearishPercent}%
                                </Typography>
                            </Box>
                            
                            <Box sx={{ height: 24, width: '100%', bgcolor: '#ef5350', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                                <Box sx={{ 
                                    width: `${data.stats.bullishPercent}%`, 
                                    height: '100%', 
                                    bgcolor: '#4caf50',
                                    transition: 'width 1s ease-in-out'
                                }} />
                                <Box sx={{ 
                                    position: 'absolute', 
                                    top: 0, bottom: 0, 
                                    left: isBullish ? '10px' : 'auto', 
                                    right: isBearish ? '10px' : 'auto',
                                    display: 'flex', alignItems: 'center', 
                                    color: 'white', fontWeight: 'bold', fontSize: '0.8rem', textShadow: '0px 0px 4px rgba(0,0,0,0.5)'
                                }}>
                                    {isBullish ? 'Deine Wahl' : (isBearish ? 'Deine Wahl' : '')}
                                </Box>
                            </Box>

                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                                Basierend auf {data.stats.total} Stimmen aus der Community
                            </Typography>
                        </Box>
                    </Fade>
                )}
            </Box>
        </WidgetPaper>
    );
};

export default SentimentWidget;