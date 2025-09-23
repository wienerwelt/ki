import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Container, Paper, CircularProgress, Alert, Grid, ToggleButtonGroup, ToggleButton, TextField, MenuItem } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

interface TimeSeriesData {
    period: string;
    login_count: number;
    prompt_tokens: number;
    completion_tokens: number;
    funding_tokens: number;
}
interface KpiData {
    total_logins: string;
    total_ai_content: string;
    total_scraped_content: string;
    total_redactional_tokens: string | null;
    total_funding_tokens: string | null;
    total_processed_opportunities: string;
}
interface ProviderUsageData {
    model: string;
    requests: string;
    prompt_tokens: string;
    completion_tokens: string;
}
interface BusinessPartner {
    id: string;
    name: string;
}
interface CostPerBpData {
    name: string;
    total_tokens: string;
}
interface CategoryDistributionData {
    name: string;
    count: number;
}
interface TopUserData {
    email: string;
    activity_count: number;
    business_partner_name: string | null;
}

const StatCard: React.FC<{ title: string; value: string | number; description?: string }> = ({ title, value, description }) => (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Typography variant="h6" color="text.secondary">{title}</Typography>
        <Typography component="p" variant="h4">{value}</Typography>
        {description && <Typography color="text.secondary" sx={{ flexGrow: 1 }}>{description}</Typography>}
    </Paper>
);

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF1943'];

const AdminStatisticsPage: React.FC = () => {
    const [stats, setStats] = useState<{ 
        timeSeries: TimeSeriesData[], kpis: KpiData, providerUsage: ProviderUsageData[], 
        availableModels: string[], businessPartners: BusinessPartner[],
        costPerBusinessPartner: CostPerBpData[], categoryDistribution: CategoryDistributionData[], topUserActivity: TopUserData[]
    } | null>(null);
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

    const handleTimespanChange = (_event: React.MouseEvent<HTMLElement>, newTimespan: 'day' | 'week' | 'month' | 'year' | null) => {
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

    const renderDashboard = () => {
        if (loading) return <Box sx={{display: 'flex', justifyContent: 'center', p: 5}}><CircularProgress /></Box>;
        if (error) return <Alert severity="error">{error}</Alert>;
        if (!stats) return <Alert severity="info">Keine Daten verfügbar.</Alert>;

        const totalRedactionalTokens = parseInt(stats.kpis.total_redactional_tokens || '0');
        const totalFundingTokens = parseInt(stats.kpis.total_funding_tokens || '0');
        const totalTokensOverall = totalRedactionalTokens + totalFundingTokens;
        const estimatedFundingCost = (totalFundingTokens / 1000000 * 5.00).toFixed(2);

        return (
            <Grid container spacing={3}>
                <Grid item xs={6} sm={4} md={2}><StatCard title="Logins" value={stats.kpis.total_logins} /></Grid>
                <Grid item xs={6} sm={4} md={2}><StatCard title="KI-Inhalte" value={stats.kpis.total_ai_content} /></Grid>
                <Grid item xs={6} sm={4} md={2}><StatCard title="Gescrapte Inhalte" value={stats.kpis.total_scraped_content} /></Grid>
                <Grid item xs={6} sm={6} md={3}><StatCard title="Verarbeitete Förderungen" value={stats.kpis.total_processed_opportunities} description="durch KI analysiert" /></Grid>
                <Grid item xs={12} sm={6} md={3}><StatCard title="Gesamte Tokens" value={totalTokensOverall.toLocaleString('de-DE')} description={`davon Förderungen: ${totalFundingTokens.toLocaleString('de-DE')} (~${estimatedFundingCost} USD)`} /></Grid>
                
                <Grid item xs={12}>
                    <Paper sx={{ p: 2, height: 350 }}>
                        <Typography variant="h6">Token-Verbrauch im Zeitverlauf</Typography>
                        <ResponsiveContainer>
                            <LineChart data={stats.timeSeries}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="period" tickFormatter={formatXAxis} />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="prompt_tokens" name="Redaktionell (Anfrage)" stroke="#8884d8" />
                                <Line type="monotone" dataKey="completion_tokens" name="Redaktionell (Antwort)" stroke="#ffc658" />
                                <Line type="monotone" dataKey="funding_tokens" name="Förderungen (Gesamt)" stroke="#82ca9d" />
                            </LineChart>
                        </ResponsiveContainer>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={6}>
                     <Paper sx={{ p: 2, height: 400 }}>
                        <Typography variant="h6">KI-Kosten pro Business Partner</Typography>
                        <ResponsiveContainer>
                            <BarChart data={stats.costPerBusinessPartner} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" />
                                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }}/>
                                <Tooltip formatter={(value: number) => value.toLocaleString('de-DE')} />
                                <Bar dataKey="total_tokens" name="Tokens" fill="#8884d8" />
                            </BarChart>
                        </ResponsiveContainer>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={6}>
                     <Paper sx={{ p: 2, height: 400 }}>
                        <Typography variant="h6">Verteilung der KI-Inhalte nach Kategorie</Typography>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={stats.categoryDistribution} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={100} labelLine={false} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                                    {stats.categoryDistribution.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </Paper>
                </Grid>
                
                <Grid item xs={12}>
                     <Paper sx={{ p: 2, height: 400 }}>
                        <Typography variant="h6">Top 10 Benutzer-Aktivität</Typography>
                        <ResponsiveContainer>
                            <BarChart data={stats.topUserActivity} layout="vertical" margin={{ top: 5, right: 30, left: 250, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" />
                                <YAxis
                                    type="category"
                                    dataKey="email"
                                    width={250}
                                    tick={{ fontSize: 12 }}
                                    tickFormatter={(value, index) => {
                                        const user = stats.topUserActivity[index];
                                        return `${user.email} (${user.business_partner_name || 'N/A'})`;
                                    }}
                                />
                                <Tooltip />
                                <Bar dataKey="activity_count" name="Aktionen (Logins, KI-Nutzung)" fill="#82ca9d" />
                            </BarChart>
                        </ResponsiveContainer>
                    </Paper>
                </Grid>
            </Grid>
        );
    };

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
                {renderDashboard()}
            </Container>
        </DashboardLayout>
    );
};

export default AdminStatisticsPage;