import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Container,
  Paper,
  CircularProgress,
  Alert,
  Grid,
  ToggleButtonGroup,
  ToggleButton,
  TextField,
  MenuItem,
  Chip,
  Divider,
  FormControlLabel,
  Switch,
} from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

interface TimeSeriesData {
  period: string;
  login_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  funding_tokens: number;
  new_posts: number;
  new_comments: number;
}

interface KpiData {
  total_logins: number | string;
  unique_login_users: number | string;
  total_ai_content: number | string;
  total_scraped_content: number | string;
  total_scraping_jobs_completed: number | string;

  total_redactional_tokens: number | string | null;
  total_usage_log_tokens: number | string | null;
  total_funding_tokens: number | string | null;
  total_tokens_overall: number | string | null;

  total_processed_opportunities: number | string;
  total_ai_requests: number | string;

  total_community_posts: number | string;
  total_community_comments: number | string;
  total_community_likes: number | string;
}

interface ProviderUsageData {
  model: string;
  requests: number | string;
  prompt_tokens: number | string;
  completion_tokens: number | string;
}
interface BusinessPartner {
  id: string;
  name: string;
}
interface CostPerBpData {
  name: string;
  total_tokens: number | string;
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

type Timespan = 'day' | 'week' | 'month' | 'year';

type AdminStatsResponse = {
  timeframe: {
    start: string;
    end: string;
    previousStart: string;
    previousEnd: string;
  };
  timeSeries: TimeSeriesData[];
  kpis: KpiData;
  comparisonKpis: KpiData | null;
  providerUsage: ProviderUsageData[];
  availableModels: string[];
  businessPartners: BusinessPartner[];
  costPerBusinessPartner: CostPerBpData[];
  categoryDistribution: CategoryDistributionData[];
  topUserActivity: TopUserData[];
};

const num = (v: any) => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0;
  return Number.isFinite(n) ? n : 0;
};

const fmtInt = (v: any) => Math.round(num(v)).toLocaleString('de-AT');
const fmtTokens = (v: any) => Math.round(num(v)).toLocaleString('de-AT');

function deltaPct(current: any, previous: any) {
  const c = num(current);
  const p = num(previous);
  if (p === 0 && c === 0) return null;
  if (p === 0) return Infinity;
  return ((c - p) / p) * 100;
}

const StatCard: React.FC<{
  title: string;
  value: string | number;
  description?: string;
  delta?: string | null;
}> = ({ title, value, description, delta }) => (
  <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
    <Typography variant="h6" color="text.secondary" sx={{ fontSize: '0.9rem' }}>
      {title}
    </Typography>

    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 1 }}>
      <Typography component="p" variant="h4">
        {value}
      </Typography>
      {delta ? <Chip size="small" label={delta} variant="outlined" /> : null}
    </Box>

    {description ? (
      <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1, mt: 0.5 }}>
        {description}
      </Typography>
    ) : null}
  </Paper>
);

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF1943'];

const AdminStatisticsPage: React.FC = () => {
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [timespan, setTimespan] = useState<Timespan>('week');
  const [modelFilter, setModelFilter] = useState<string>('');
  const [bpFilter, setBpFilter] = useState<string>('');

  // NEU: Kalendermonat-Auswahl + Vergleich
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
  const [compare, setCompare] = useState<boolean>(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('jwt_token');

      const params = new URLSearchParams({ timespan, compare: String(compare) });
      if (modelFilter) params.append('model', modelFilter);
      if (bpFilter) params.append('businessPartnerId', bpFilter);

      // Wenn timespan=month: nutze echten Kalendermonat (YYYY-MM)
      if (timespan === 'month') {
        params.append('month', selectedMonth);
      }

      const response = await apiClient.get(`/api/admin/stats/usage?${params.toString()}`, {
        headers: { 'x-auth-token': token },
      });

      setStats(response.data);
    } catch (err: any) {
      setError((typeof err.response?.data === 'string' ? err.response.data : err.response?.data?.message) || err.message || 'Fehler beim Laden der Statistiken.');
    } finally {
      setLoading(false);
    }
  }, [timespan, modelFilter, bpFilter, selectedMonth, compare]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleTimespanChange = (_event: React.MouseEvent<HTMLElement>, newTimespan: Timespan | null) => {
    if (newTimespan !== null) setTimespan(newTimespan);
  };

  const formatXAxis = (tickItem: string) => {
    const date = new Date(tickItem);
    if (timespan === 'day') return date.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
    if (timespan === 'year') return date.toLocaleString('de-AT', { month: 'short' });
    return date.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });
  };

  const timeframeLabel = useMemo(() => {
    const startIso = stats?.timeframe?.start;
    const endIso = stats?.timeframe?.end;
    if (!startIso || !endIso) return '';
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';
    return `${start.toLocaleDateString('de-AT')} – ${end.toLocaleDateString('de-AT')}`;
  }, [stats]);

  const renderDashboard = () => {
    if (loading)
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
          <CircularProgress />
        </Box>
      );
    if (error) return <Alert severity="error">{error}</Alert>;
    if (!stats) return <Alert severity="info">Keine Daten verfügbar.</Alert>;

    const k = stats.kpis;
    const pk = stats.comparisonKpis;

    const deltaLabel = (current: any, previous: any) => {
      if (!compare || !pk) return null;
      const d = deltaPct(current, previous);
      if (d === null) return null;
      if (d === Infinity) return '+∞%';
      const sign = d >= 0 ? '+' : '';
      return `${sign}${d.toFixed(0)}%`;
    };

    const totalTokens = num(k.total_tokens_overall);
    const fundingTokens = num(k.total_funding_tokens);
    const estimatedFundingCost = (fundingTokens / 1_000_000 * 5.0).toFixed(2);

    return (
      <Grid container spacing={3}>
        {/* Kontext */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="subtitle1" color="text.secondary">
                Zeitraum:
              </Typography>
              <Chip label={timeframeLabel} size="small" />
              {compare && pk ? (
                <>
                  <Typography variant="subtitle1" color="text.secondary" sx={{ ml: 1 }}>
                    Vergleich:
                  </Typography>
                  <Chip
                    label={`${new Date(stats.timeframe.previousStart).toLocaleDateString('de-AT')} – ${new Date(
                      stats.timeframe.previousEnd
                    ).toLocaleDateString('de-AT')}`}
                    size="small"
                    variant="outlined"
                  />
                </>
              ) : null}
            </Box>
          </Paper>
        </Grid>

        {/* Zeile 1: System KPIs */}
        <Grid item xs={6} sm={4} md={2}>
          <StatCard title="Logins" value={fmtInt(k.total_logins)} delta={deltaLabel(k.total_logins, pk?.total_logins)} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            title="Unique Login-User"
            value={fmtInt(k.unique_login_users)}
            delta={deltaLabel(k.unique_login_users, pk?.unique_login_users)}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            title="KI-Inhalte"
            value={fmtInt(k.total_ai_content)}
            delta={deltaLabel(k.total_ai_content, pk?.total_ai_content)}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            title="AI Requests"
            value={fmtInt(k.total_ai_requests)}
            delta={deltaLabel(k.total_ai_requests, pk?.total_ai_requests)}
            description="activity_log + ai_usage_logs"
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            title="Gescrapte Inhalte"
            value={fmtInt(k.total_scraped_content)}
            delta={deltaLabel(k.total_scraped_content, pk?.total_scraped_content)}
            description="Rows in scraped_content"
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            title="Scraping Jobs"
            value={fmtInt(k.total_scraping_jobs_completed)}
            delta={deltaLabel(k.total_scraping_jobs_completed, pk?.total_scraping_jobs_completed)}
            description="completed"
          />
        </Grid>

        {/* Zeile 2: Tokens & Funding */}
        <Grid item xs={12} md={4}>
          <StatCard
            title="Tokens (Gesamt)"
            value={fmtTokens(totalTokens)}
            delta={deltaLabel(k.total_tokens_overall, pk?.total_tokens_overall)}
            description={`Redactional + UsageLogs • Funding-Anteil: ${fmtTokens(k.total_funding_tokens)} (~${estimatedFundingCost} USD)`}
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <StatCard
            title="Tokens (Redactional)"
            value={fmtTokens(k.total_redactional_tokens)}
            delta={deltaLabel(k.total_redactional_tokens, pk?.total_redactional_tokens)}
            description="activity_log: AI_%_SUCCESS"
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <StatCard
            title="Tokens (Usage Logs)"
            value={fmtTokens(k.total_usage_log_tokens)}
            delta={deltaLabel(k.total_usage_log_tokens, pk?.total_usage_log_tokens)}
            description="ai_usage_logs"
          />
        </Grid>

        <Grid item xs={12} md={4}>
          <StatCard
            title="Verarbeitete Förderungen"
            value={fmtInt(k.total_processed_opportunities)}
            delta={deltaLabel(k.total_processed_opportunities, pk?.total_processed_opportunities)}
            description="funding rule_type"
          />
        </Grid>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6">Community</Typography>
            <Divider sx={{ my: 1 }} />
            <Grid container spacing={2}>
              <Grid item xs={4}>
                <StatCard
                  title="Beiträge"
                  value={fmtInt(k.total_community_posts)}
                  delta={deltaLabel(k.total_community_posts, pk?.total_community_posts)}
                  description="Community"
                />
              </Grid>
              <Grid item xs={4}>
                <StatCard
                  title="Kommentare"
                  value={fmtInt(k.total_community_comments)}
                  delta={deltaLabel(k.total_community_comments, pk?.total_community_comments)}
                  description="Community"
                />
              </Grid>
              <Grid item xs={4}>
                <StatCard
                  title="Likes"
                  value={fmtInt(k.total_community_likes)}
                  delta={deltaLabel(k.total_community_likes, pk?.total_community_likes)}
                  description="Community"
                />
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Time Series */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2, height: 420 }}>
            <Typography variant="h6">Aktivität & Token-Verbrauch</Typography>
            <ResponsiveContainer>
              <LineChart data={stats.timeSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tickFormatter={formatXAxis} />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="prompt_tokens" name="Tokens (Anfrage)" dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="completion_tokens" name="Tokens (Antwort)" dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="login_count" name="Logins" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="new_posts" name="Neue Beiträge" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="new_comments" name="Neue Kommentare" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Cost per BP */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 400 }}>
            <Typography variant="h6">KI-Tokens pro Business Partner</Typography>
            <ResponsiveContainer>
              <BarChart data={stats.costPerBusinessPartner} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number) => value.toLocaleString('de-AT')} />
                <Bar dataKey="total_tokens" name="Tokens" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Category distribution */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 400 }}>
            <Typography variant="h6">KI-Inhalte nach Kategorie</Typography>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={stats.categoryDistribution} dataKey="count" nameKey="name" outerRadius={140} label>
                  {stats.categoryDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Top users */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2, height: 420 }}>
            <Typography variant="h6">Top 10 Benutzer-Aktivität (System & Community)</Typography>
            <ResponsiveContainer>
              <BarChart data={stats.topUserActivity} layout="vertical" margin={{ top: 5, right: 30, left: 220, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="email"
                  width={220}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) => (String(value).length > 30 ? String(value).substring(0, 27) + '…' : value)}
                />
                <Tooltip />
                <Bar dataKey="activity_count" name="Aktionen (Logins, KI, Posts/Comments)" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Provider Usage */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6">Model-/Provider-Nutzung</Typography>
            <Typography variant="caption" color="text.secondary">
              Kombiniert aus activity_log (AI_%_SUCCESS) und ai_usage_logs.
            </Typography>
            <Box sx={{ mt: 1, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #eee' }}>Model</th>
                    <th style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #eee' }}>Requests</th>
                    <th style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #eee' }}>Prompt Tokens</th>
                    <th style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #eee' }}>Completion Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.providerUsage.map((r) => (
                    <tr key={r.model}>
                      <td style={{ padding: 8, borderBottom: '1px solid #f4f4f4' }}>{r.model}</td>
                      <td style={{ padding: 8, borderBottom: '1px solid #f4f4f4', textAlign: 'right' }}>{fmtInt(r.requests)}</td>
                      <td style={{ padding: 8, borderBottom: '1px solid #f4f4f4', textAlign: 'right' }}>{fmtTokens(r.prompt_tokens)}</td>
                      <td style={{ padding: 8, borderBottom: '1px solid #f4f4f4', textAlign: 'right' }}>{fmtTokens(r.completion_tokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    );
  };

  return (
    <DashboardLayout>
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 2,
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="h4" component="h1">
              System-Statistiken
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Harmonisiert: Logins = LOGIN_SUCCESS (plus Legacy), Tokens = Redactional + UsageLogs, Scraping = Jobs + Rows.
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <FormControlLabel
              control={<Switch checked={compare} onChange={(e) => setCompare(e.target.checked)} />}
              label="Vergleich"
            />

            <TextField
              select
              label="Business Partner"
              value={bpFilter}
              onChange={(e) => setBpFilter(e.target.value)}
              size="small"
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">
                <em>Alle Partner</em>
              </MenuItem>
              {stats?.businessPartners.map((bp) => (
                <MenuItem key={bp.id} value={bp.id}>
                  {bp.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Model"
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              size="small"
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">
                <em>Alle Modelle</em>
              </MenuItem>
              {stats?.availableModels.map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </TextField>

            <ToggleButtonGroup value={timespan} exclusive onChange={handleTimespanChange} size="small">
              <ToggleButton value="day">24h</ToggleButton>
              <ToggleButton value="week">7T</ToggleButton>
              <ToggleButton value="month">Monat</ToggleButton>
              <ToggleButton value="year">Jahr</ToggleButton>
            </ToggleButtonGroup>

            {timespan === 'month' ? (
              <TextField
                label="Monat"
                type="month"
                size="small"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                sx={{ minWidth: 160 }}
                InputLabelProps={{ shrink: true }}
              />
            ) : null}
          </Box>
        </Box>

        {renderDashboard()}
      </Container>
    </DashboardLayout>
  );
};

export default AdminStatisticsPage;
