// frontend/src/components/AdminFundingStatsTab.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Paper, CircularProgress, Alert, Grid, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import apiClient from '../apiClient';

interface FundingTimeSeries {
    period: string;
    total_tokens: string;
}
interface FundingKpi {
    total_processed_opportunities: string;
    total_tokens: string;
}
interface FundingSourceUsage {
    source_name: string;
    total_tokens: string;
    opportunities_processed: string;
}

const StatCard: React.FC<{ title: string; value: string | number; description?: string }> = ({ title, value, description }) => (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Typography variant="h6" color="text.secondary">{title}</Typography>
        <Typography component="p" variant="h4">{value}</Typography>
        {description && <Typography color="text.secondary" sx={{ flexGrow: 1 }}>{description}</Typography>}
    </Paper>
);

const AdminFundingStatsTab: React.FC = () => {
    const [stats, setStats] = useState<{ kpis: FundingKpi, timeSeries: FundingTimeSeries[], sourceUsage: FundingSourceUsage[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [timespan, setTimespan] = useState<'week' | 'month' | 'year'>('month');

    const fetchStats = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.get('/api/admin/funding/usage-stats', {
                headers: { 'x-auth-token': token },
                params: { timespan }
            });
            setStats(response.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Statistiken.');
        } finally {
            setLoading(false);
        }
    }, [timespan]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    const handleTimespanChange = (_event: React.MouseEvent<HTMLElement>, newTimespan: 'week' | 'month' | 'year' | null) => {
        if (newTimespan !== null) {
            setTimespan(newTimespan);
        }
    };

    if (loading) return <CircularProgress />;
    if (error) return <Alert severity="error">{error}</Alert>;
    if (!stats || !stats.kpis) return <Alert severity="info">Keine Statistikdaten für den Förderungs-Prozess verfügbar.</Alert>;

    const estimatedCost = (parseInt(stats.kpis.total_tokens || '0') / 1000000 * 5.00).toFixed(2);

    return (
        <Grid container spacing={3}>
            <Grid item xs={12}>
                <Box sx={{display: 'flex', justifyContent: 'flex-end'}}>
                    <ToggleButtonGroup value={timespan} exclusive onChange={handleTimespanChange}>
                        <ToggleButton value="week">7 Tage</ToggleButton>
                        <ToggleButton value="month">Monat</ToggleButton>
                        <ToggleButton value="year">Jahr</ToggleButton>
                    </ToggleButtonGroup>
                </Box>
            </Grid>
            <Grid item xs={12} md={4}><StatCard title="Verarbeitete Förderungen" value={parseInt(stats.kpis.total_processed_opportunities || '0').toLocaleString('de-DE')} /></Grid>
            <Grid item xs={12} md={4}><StatCard title="Verbrauchte Tokens" value={parseInt(stats.kpis.total_tokens || '0').toLocaleString('de-DE')} /></Grid>
            <Grid item xs={12} md={4}><StatCard title="Geschätzte KI-Kosten" value={`~ ${estimatedCost} USD`} description={`Im Zeitraum (${timespan})`} /></Grid>

            <Grid item xs={12} lg={8}>
                <Paper sx={{ p: 2, height: 300 }}>
                    <Typography variant="h6">Token-Verbrauch über Zeit</Typography>
                    <ResponsiveContainer>
                        <LineChart data={stats.timeSeries}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="period" tickFormatter={(tick) => new Date(tick).toLocaleDateString('de-AT')} />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="total_tokens" name="Tokens" stroke="#8884d8" />
                        </LineChart>
                    </ResponsiveContainer>
                </Paper>
            </Grid>
            <Grid item xs={12} lg={4}>
                <Paper sx={{ p: 2, height: 300 }}>
                    <Typography variant="h6">Top Kostenverursacher (Quellen)</Typography>
                    <ResponsiveContainer>
                        <BarChart data={stats.sourceUsage} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis type="category" dataKey="source_name" width={150} tick={{ fontSize: 12 }}/>
                            <Tooltip />
                            <Bar dataKey="total_tokens" name="Tokens" fill="#82ca9d" />
                        </BarChart>
                    </ResponsiveContainer>
                </Paper>
            </Grid>
        </Grid>
    );
};

export default AdminFundingStatsTab;