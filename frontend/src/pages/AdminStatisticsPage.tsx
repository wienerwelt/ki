import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Container, Paper, CircularProgress, Alert, Grid, ToggleButtonGroup, ToggleButton, TextField, MenuItem } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

// --- Interfaces ---
interface TimeSeriesData {
    period: string;
    login_count: number;
    openai_requests: number;
    gemini_requests: number;
    prompt_tokens: number;
    completion_tokens: number;
}

interface KpiData {
    total_logins: string;
    total_ai_content: string;
    total_scraped_content: string;
    total_prompt_tokens: string | null;
    total_completion_tokens: string | null;
}

interface ProviderUsageData {
    provider: string;
    model: string;
    requests: string;
    prompt_tokens: string;
    completion_tokens: string;
}

interface BusinessPartner {
    id: string;
    name: string;
}

// --- Stat Card Komponente ---
const StatCard: React.FC<{ title: string; value: string | number; description?: string }> = ({ title, value, description }) => (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Typography variant="h6" color="text.secondary">{title}</Typography>
        <Typography component="p" variant="h4">{value}</Typography>
        {description && <Typography color="text.secondary" sx={{ flexGrow: 1 }}>{description}</Typography>}
    </Paper>
);

const AdminStatisticsPage: React.FC = () => {
    const [stats, setStats] = useState<{ timeSeries: TimeSeriesData[], kpis: KpiData, providerUsage: ProviderUsageData[], availableModels: string[], businessPartners: BusinessPartner[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [timespan, setTimespan] = useState<'day' | 'week' | 'month' | 'year'>('week');
    const [modelFilter, setModelFilter] = useState<string>('');
    const [bpFilter, setBpFilter] = useState<string>('');

    const fetchStats = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const params = new URLSearchParams({ timespan });
            if (modelFilter) params.append('model', modelFilter);
            if (bpFilter) params.append('businessPartnerId', bpFilter);
            
            const response = await apiClient.get(`/api/admin/stats/usage?${params.toString()}`, {
                headers: { 'x-auth-token': token }
            });
            setStats(response.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Statistiken.');
        } finally {
            setLoading(false);
        }
    }, [timespan, modelFilter, bpFilter]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    const handleTimespanChange = (event: React.MouseEvent<HTMLElement>, newTimespan: 'day' | 'week' | 'month' | 'year' | null) => {
        if (newTimespan !== null) {
            setTimespan(newTimespan);
        }
    };

    const formatXAxis = (tickItem: string) => {
        const date = new Date(tickItem);
        if (timespan === 'day') return date.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
        if (timespan === 'year') return date.toLocaleString('de-AT', { month: 'short' });
        return date.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });
    };

    const totalTokens = (parseInt(stats?.kpis.total_prompt_tokens || '0') + parseInt(stats?.kpis.total_completion_tokens || '0')).toLocaleString('de-DE');

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                    <Typography variant="h4" component="h1">
                        System-Statistiken
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                        <TextField select label="Business Partner" value={bpFilter} onChange={(e) => setBpFilter(e.target.value)} size="small" sx={{ minWidth: 200 }}>
                            <MenuItem value=""><em>Alle Partner</em></MenuItem>
                            {stats?.businessPartners.map(bp => <MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>)}
                        </TextField>
                        <TextField select label="Modell filtern" value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} size="small" sx={{ minWidth: 180 }}>
                            <MenuItem value=""><em>Alle Modelle</em></MenuItem>
                            {stats?.availableModels.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                        </TextField>
                        <ToggleButtonGroup value={timespan} exclusive onChange={handleTimespanChange}>
                            <ToggleButton value="day">24h</ToggleButton>
                            <ToggleButton value="week">7 Tage</ToggleButton>
                            <ToggleButton value="month">Monat</ToggleButton>
                            <ToggleButton value="year">Jahr</ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                </Box>

                {loading ? <Box sx={{display: 'flex', justifyContent: 'center', p: 5}}><CircularProgress /></Box> : error ? <Alert severity="error">{error}</Alert> : stats && (
                    <Grid container spacing={3}>
                        {/* KPI Cards */}
                        <Grid item xs={12} sm={6} md={3}><StatCard title="Logins" value={stats.kpis.total_logins} description={`im Zeitraum`} /></Grid>
                        <Grid item xs={12} sm={6} md={3}><StatCard title="Verbrauchte Tokens" value={totalTokens} description="Anfrage + Ergebnis" /></Grid>
                        <Grid item xs={12} sm={6} md={3}><StatCard title="KI-Inhalte" value={stats.kpis.total_ai_content} description="Neu generiert" /></Grid>
                        <Grid item xs={12} sm={6} md={3}><StatCard title="Gescrapte Inhalte" value={stats.kpis.total_scraped_content} description="Neu gesammelt" /></Grid>

                        {/* Charts */}
                        <Grid item xs={12} lg={8}>
                            <Paper sx={{ p: 2, height: 300 }}>
                                <Typography variant="h6">Aktivität im Zeitverlauf</Typography>
                                <ResponsiveContainer>
                                    <LineChart data={stats.timeSeries}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="period" tickFormatter={formatXAxis} />
                                        <YAxis yAxisId="left" />
                                        <YAxis yAxisId="right" orientation="right" />
                                        <Tooltip />
                                        <Legend />
                                        <Line yAxisId="left" type="monotone" dataKey="openai_requests" name="OpenAI Anfragen" stroke="#8884d8" />
                                        <Line yAxisId="left" type="monotone" dataKey="gemini_requests" name="Gemini Anfragen" stroke="#82ca9d" />
                                        <Line yAxisId="right" type="monotone" dataKey="prompt_tokens" name="Anfrage-Tokens" stroke="#ffc658" />
                                        <Line yAxisId="right" type="monotone" dataKey="completion_tokens" name="Ergebnis-Tokens" stroke="#ff7300" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} lg={4}>
                             <Paper sx={{ p: 2, height: 300 }}>
                                <Typography variant="h6">Token-Nutzung nach Modell</Typography>
                                <ResponsiveContainer>
                                    <BarChart data={stats.providerUsage}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="model" />
                                        <YAxis />
                                        <Tooltip />
                                        <Legend />
                                        <Bar dataKey="prompt_tokens" stackId="a" name="Anfrage Tokens" fill="#8884d8" />
                                        <Bar dataKey="completion_tokens" stackId="a" name="Ergebnis Tokens" fill="#82ca9d" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </Paper>
                        </Grid>
                    </Grid>
                )}
            </Container>
        </DashboardLayout>
    );
};

export default AdminStatisticsPage;
