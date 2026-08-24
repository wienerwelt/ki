import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Avatar,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  IconButton,
  Link,
  useTheme,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
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
import { resolveAssetUrl } from '../utils/assetUrl';

// --- Interfaces (unverändert) ---
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
  user_id: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  organization_name: string | null;
  profile_image_url: string | null;
  activity_count: number;
  business_partner_name: string | null;
}

interface AdminUserProfile {
  id: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  organization_name?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  login_count?: number | null;
  contribution_score?: number | null;
  membership_level?: string | null;
  role?: string | null;
  is_active?: boolean;
  active_until?: string | null;
  created_at?: string | null;
  last_login_at?: string | null;
  profile_image_url?: string | null;
  newsletter_opt_in?: boolean;
  business_partner_name?: string | null;
  tags?: string[];
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

// --- Hilfsfunktionen für Zahlen & Formate ---
const num = (v: any) => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0;
  return Number.isFinite(n) ? n : 0;
};

const fmtInt = (v: any) => Math.round(num(v)).toLocaleString('de-AT');
const fmtTokens = (v: any) => Math.round(num(v)).toLocaleString('de-AT');

// Hilfsfunktion: 10000 -> 10k, 1000000 -> 1M
const fmtAxis = (tickItem: any) => {
  const v = Number(tickItem);
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
  return v.toString();
};

const safeExternalUrl = (value?: string | null) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
};

const getUserDisplayName = (user: {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email?: string | null;
}) => [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || user.email || 'Unbekannter Nutzer';

const formatProfileDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' });
};

function deltaPct(current: any, previous: any) {
  const c = num(current);
  const p = num(previous);
  if (p === 0 && c === 0) return null;
  if (p === 0) return Infinity;
  return ((c - p) / p) * 100;
}

// --- Verbesserte StatCard (Farben für Deltas) ---
const StatCard: React.FC<{
  title: string;
  value: string | number;
  description?: string;
  deltaValue?: number | null;
  inverseColors?: boolean; // True = Positives Wachstum ist schlecht (Kosten)
}> = ({ title, value, description, deltaValue, inverseColors = false }) => {
  let deltaLabel = null;
  let color: 'default' | 'success' | 'error' | 'primary' = 'default';
  let icon = null;

  if (deltaValue !== null && deltaValue !== undefined) {
    if (deltaValue === Infinity) {
      deltaLabel = '+∞%';
      color = inverseColors ? 'error' : 'success';
      icon = <TrendingUpIcon fontSize="small" />;
    } else {
      const sign = deltaValue >= 0 ? '+' : '';
      deltaLabel = `${sign}${deltaValue.toFixed(0)}%`;

      if (deltaValue > 0) {
        color = inverseColors ? 'error' : 'success';
        icon = <TrendingUpIcon fontSize="small" />;
      } else if (deltaValue < 0) {
        color = inverseColors ? 'success' : 'error';
        icon = <TrendingDownIcon fontSize="small" />;
      }
    }
  }

  return (
    <Paper sx={{ p: 2.5, display: 'flex', flexDirection: 'column', height: '100%', borderRadius: 2, transition: 'box-shadow 0.3s ease', '&:hover': { boxShadow: 4 } }}>
      <Typography variant="subtitle2" color="text.secondary" fontWeight="bold">
        {title}
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 1.5, mb: 1 }}>
        <Typography component="p" variant="h4" fontWeight="bold">
          {value}
        </Typography>
        {deltaLabel && (
          <Chip
            size="small"
            label={deltaLabel}
            icon={icon!}
            color={color}
            variant={color === 'default' ? 'outlined' : 'filled'}
            sx={{ fontWeight: 'bold', fontSize: '0.75rem' }}
          />
        )}
      </Box>

      {description && (
        <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1, mt: 'auto', lineHeight: 1.3 }}>
          {description}
        </Typography>
      )}
    </Paper>
  );
};

const AdminStatisticsPage: React.FC = () => {
  const theme = useTheme();

  // Themenfarben für die Diagramme (passt sich dem Dark/Light Mode an)
  const COLORS = [
    theme.palette.primary.main,
    theme.palette.secondary.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    theme.palette.info.main,
    theme.palette.error.main,
  ];

  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showPromptLines, setShowPromptLines] = useState<boolean>(true);
  const [showCompletionLines, setShowCompletionLines] = useState<boolean>(true);
  const [showLoginLines, setShowLoginLines] = useState<boolean>(true);

  const [timespan, setTimespan] = useState<Timespan>('week');
  const [modelFilter, setModelFilter] = useState<string>('');
  const [bpFilter, setBpFilter] = useState<string>('');
  const [selectedTopUser, setSelectedTopUser] = useState<TopUserData | null>(null);
  const [selectedTopUserProfile, setSelectedTopUserProfile] = useState<AdminUserProfile | null>(null);
  const [selectedTopUserLoading, setSelectedTopUserLoading] = useState(false);
  const [selectedTopUserError, setSelectedTopUserError] = useState<string | null>(null);
  const selectedTopUserRequest = useRef(0);

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
      const token = 'cookie-session';

      const params = new URLSearchParams({ timespan, compare: String(compare) });
      if (modelFilter) params.append('model', modelFilter);
      if (bpFilter) params.append('businessPartnerId', bpFilter);

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

  const handleOpenTopUser = async (user: TopUserData) => {
    if (!user?.user_id) return;

    const requestId = ++selectedTopUserRequest.current;
    setSelectedTopUser(user);
    setSelectedTopUserProfile(null);
    setSelectedTopUserError(null);
    setSelectedTopUserLoading(true);

    try {
      const response = await apiClient.get<AdminUserProfile>(`/api/admin/users/${encodeURIComponent(user.user_id)}`);
      if (requestId !== selectedTopUserRequest.current) return;

      if (!response.res.ok || !response.data?.id) {
        setSelectedTopUserError(
          response.res.status === 404
            ? 'Das Benutzerprofil ist nicht mehr verfügbar.'
            : (response.data as any)?.message || 'Das Benutzerprofil konnte nicht geladen werden.'
        );
        return;
      }

      setSelectedTopUserProfile(response.data);
    } catch (err: any) {
      if (requestId === selectedTopUserRequest.current) {
        setSelectedTopUserError(err?.message || 'Das Benutzerprofil konnte nicht geladen werden.');
      }
    } finally {
      if (requestId === selectedTopUserRequest.current) {
        setSelectedTopUserLoading(false);
      }
    }
  };

  const handleCloseTopUser = () => {
    selectedTopUserRequest.current += 1;
    setSelectedTopUser(null);
    setSelectedTopUserProfile(null);
    setSelectedTopUserError(null);
    setSelectedTopUserLoading(false);
  };

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
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}>
          <CircularProgress />
        </Box>
      );
    if (error) return <Alert severity="error">{error}</Alert>;
    if (!stats) return <Alert severity="info">Keine Daten verfügbar.</Alert>;

    const k = stats.kpis;
    const pk = stats.comparisonKpis;

    const getDelta = (current: any, previous: any) => {
      if (!compare || !pk) return null;
      return deltaPct(current, previous);
    };

    const totalTokens = num(k.total_tokens_overall);
    const fundingTokens = num(k.total_funding_tokens);
    const estimatedFundingCost = (fundingTokens / 1_000_000 * 5.0).toFixed(2);
    const topUsersForChart = stats.topUserActivity.slice(0, 10).map((user) => ({
      ...user,
      display_name: getUserDisplayName(user),
    }));

    return (
      <Grid container spacing={3}>
        {/* Kontext Box */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'background.default' }} variant="outlined">
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
              <Typography variant="body2" color="text.secondary" fontWeight="bold">Zeitraum:</Typography>
              <Chip label={timeframeLabel} size="small" color="primary" variant="outlined" />
              
              {compare && pk && (
                <>
                  <Typography variant="body2" color="text.secondary" fontWeight="bold" sx={{ ml: 2 }}>Vergleich:</Typography>
                  <Chip
                    label={`${new Date(stats.timeframe.previousStart).toLocaleDateString('de-AT')} – ${new Date(stats.timeframe.previousEnd).toLocaleDateString('de-AT')}`}
                    size="small"
                    variant="outlined"
                  />
                </>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Zeile 1: System KPIs */}
        <Grid item xs={6} sm={4} md={2}>
          <StatCard title="Logins" value={fmtInt(k.total_logins)} deltaValue={getDelta(k.total_logins, pk?.total_logins)} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard title="Unique Login-User" value={fmtInt(k.unique_login_users)} deltaValue={getDelta(k.unique_login_users, pk?.unique_login_users)} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard title="KI-Inhalte" value={fmtInt(k.total_ai_content)} deltaValue={getDelta(k.total_ai_content, pk?.total_ai_content)} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard title="AI Requests" value={fmtInt(k.total_ai_requests)} deltaValue={getDelta(k.total_ai_requests, pk?.total_ai_requests)} description="Alle Aufrufe" />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard title="Gescrapte Inhalte" value={fmtInt(k.total_scraped_content)} deltaValue={getDelta(k.total_scraped_content, pk?.total_scraped_content)} description="Seiten/Artikel" />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard title="Scraping Jobs" value={fmtInt(k.total_scraping_jobs_completed)} deltaValue={getDelta(k.total_scraping_jobs_completed, pk?.total_scraping_jobs_completed)} description="Abgeschlossen" />
        </Grid>

        {/* Zeile 2: Tokens & Funding */}
        <Grid item xs={12} md={4}>
          <StatCard
            title="Tokens (Gesamt)"
            value={fmtTokens(totalTokens)}
            deltaValue={getDelta(k.total_tokens_overall, pk?.total_tokens_overall)}
            inverseColors={true} // Mehr Tokens = Mehr Kosten (Rot)
            description={`Anteil Funding: ${fmtTokens(k.total_funding_tokens)} (~${estimatedFundingCost} USD)`}
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <StatCard
            title="Tokens (Redactional)"
            value={fmtTokens(k.total_redactional_tokens)}
            deltaValue={getDelta(k.total_redactional_tokens, pk?.total_redactional_tokens)}
            inverseColors={true}
            description="Aktivitäten in der App (AI_SUCCESS)"
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <StatCard
            title="Tokens (Background)"
            value={fmtTokens(k.total_usage_log_tokens)}
            deltaValue={getDelta(k.total_usage_log_tokens, pk?.total_usage_log_tokens)}
            inverseColors={true}
            description="Worker / Hintergund-Jobs"
          />
        </Grid>

        {/* Zeile 3: Community */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom fontWeight="bold">Community & Interaktion</Typography>
            <Divider sx={{ mb: 2 }} />
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <StatCard title="Beiträge" value={fmtInt(k.total_community_posts)} deltaValue={getDelta(k.total_community_posts, pk?.total_community_posts)} />
              </Grid>
              <Grid item xs={12} md={4}>
                <StatCard title="Kommentare" value={fmtInt(k.total_community_comments)} deltaValue={getDelta(k.total_community_comments, pk?.total_community_comments)} />
              </Grid>
              <Grid item xs={12} md={4}>
                <StatCard title="Likes" value={fmtInt(k.total_community_likes)} deltaValue={getDelta(k.total_community_likes, pk?.total_community_likes)} />
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Time Series Chart */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, height: 500, borderRadius: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
              <Typography variant="h6" fontWeight="bold">Aktivität & Token-Verlauf</Typography>
              
              {/* Neue Filter-Auswahl */}
              <Box sx={{ display: 'flex', gap: 2, bgcolor: 'background.default', p: 0.5, px: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                <FormControlLabel
                  control={<Checkbox checked={showPromptLines} onChange={(e) => setShowPromptLines(e.target.checked)} color="primary" size="small" />}
                  label={<Typography variant="body2" fontWeight="bold">Prompt Tokens</Typography>}
                />
                <FormControlLabel
                  control={<Checkbox checked={showCompletionLines} onChange={(e) => setShowCompletionLines(e.target.checked)} color="secondary" size="small" />}
                  label={<Typography variant="body2" fontWeight="bold">Completion Tokens</Typography>}
                />
                <FormControlLabel
                  control={<Checkbox checked={showLoginLines} onChange={(e) => setShowLoginLines(e.target.checked)} color="success" size="small" />}
                  label={<Typography variant="body2" fontWeight="bold">Logins</Typography>}
                />
              </Box>
            </Box>

            <ResponsiveContainer width="100%" height="90%">
              <LineChart data={stats.timeSeries} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" tickFormatter={formatXAxis} tickMargin={10} minTickGap={30} />
                
                {/* Linke Achse: Tokens */}
                <YAxis yAxisId="left" tickFormatter={fmtAxis} label={{ value: 'Tokens', angle: -90, position: 'insideLeft', offset: -5 }} />
                
                {/* Rechte Achse: Nutzeraktionen */}
                <YAxis yAxisId="right" orientation="right" tickFormatter={fmtAxis} label={{ value: 'Aktionen', angle: 90, position: 'insideRight', offset: -5 }} />
                
                <Tooltip formatter={(value: number) => new Intl.NumberFormat('de-AT').format(value)} labelFormatter={formatXAxis} />
                <Legend verticalAlign="top" height={36} />
                
                {showPromptLines && (
                  <Line yAxisId="left" type="monotone" dataKey="prompt_tokens" name="Prompt Tokens" stroke={theme.palette.primary.main} strokeWidth={2} dot={false} />
                )}
                {showCompletionLines && (
                  <Line yAxisId="left" type="monotone" dataKey="completion_tokens" name="Completion Tokens" stroke={theme.palette.secondary.main} strokeWidth={2} dot={false} />
                )}
                {showLoginLines && (
                  <Line yAxisId="right" type="monotone" dataKey="login_count" name="Logins" stroke={theme.palette.success.main} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Cost per BP (Top Limit für Skalierbarkeit) */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: 450, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom fontWeight="bold">Token-Verbrauch nach Partner (Top 10)</Typography>
            <ResponsiveContainer>
              <BarChart data={stats.costPerBusinessPartner.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={fmtAxis} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number) => new Intl.NumberFormat('de-AT').format(value)} />
                <Bar dataKey="total_tokens" name="Tokens Gesamt" fill={theme.palette.primary.main} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Category distribution */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: 450, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom fontWeight="bold">KI-Inhalte nach Kategorie</Typography>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={stats.categoryDistribution} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={80} outerRadius={130} labelLine={false} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {stats.categoryDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => new Intl.NumberFormat('de-AT').format(value)} />
                <Legend verticalAlign="bottom" />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Top users */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, height: 480, borderRadius: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2, mb: 1 }}>
              <Typography variant="h6" fontWeight="bold">Aktivste Nutzer (Top 10)</Typography>
              <Typography variant="caption" color="text.secondary">Balken anklicken, um Profildaten zu öffnen</Typography>
            </Box>
            <ResponsiveContainer width="100%" height="92%">
              <BarChart data={topUsersForChart} layout="vertical" margin={{ top: 5, right: 30, left: 220, bottom: 5 }} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={fmtAxis} />
                <YAxis
                  type="category"
                  dataKey="display_name"
                  width={210}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => (String(value).length > 30 ? String(value).substring(0, 27) + '…' : value)}
                />
                <Tooltip
                  cursor={{ fill: theme.palette.action.hover }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const user = payload[0].payload as TopUserData & { display_name: string };
                    return (
                      <Paper elevation={5} sx={{ p: 1.5, minWidth: 260, borderRadius: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                          <Avatar src={resolveAssetUrl(user.profile_image_url)} sx={{ width: 42, height: 42 }}>
                            {(user.first_name?.[0] || user.username?.[0] || '?').toUpperCase()}
                          </Avatar>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="subtitle2" fontWeight="bold">{user.display_name}</Typography>
                            <Typography variant="caption" color="text.secondary" display="block">{user.email}</Typography>
                          </Box>
                        </Box>
                        {(user.organization_name || user.business_partner_name) && (
                          <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                            {user.organization_name || user.business_partner_name}
                          </Typography>
                        )}
                        <Typography variant="body2" fontWeight="bold" color="secondary.main" sx={{ mt: 0.75 }}>
                          {fmtInt(user.activity_count)} Gesamt-Aktionen
                        </Typography>
                      </Paper>
                    );
                  }}
                />
                <Bar
                  dataKey="activity_count"
                  name="Gesamt-Aktionen"
                  fill={theme.palette.secondary.main}
                  radius={[0, 4, 4, 0]}
                  barSize={22}
                  maxBarSize={22}
                  minPointSize={3}
                  style={{ cursor: 'pointer' }}
                  onClick={(entry: any) => handleOpenTopUser((entry?.payload || entry) as TopUserData)}
                />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Provider Usage Table */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="h6" fontWeight="bold">Model- / API-Kostenaufstellung</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Übersicht der Requests und Token-Typen pro Modell für eine genauere Kostenkalkulation.
            </Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: theme.typography.fontFamily }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '12px 16px', borderBottom: `2px solid ${theme.palette.divider}` }}>Künstliche Intelligenz Model</th>
                    <th style={{ textAlign: 'right', padding: '12px 16px', borderBottom: `2px solid ${theme.palette.divider}` }}>API Requests</th>
                    <th style={{ textAlign: 'right', padding: '12px 16px', borderBottom: `2px solid ${theme.palette.divider}` }}>Prompt Tokens (Input)</th>
                    <th style={{ textAlign: 'right', padding: '12px 16px', borderBottom: `2px solid ${theme.palette.divider}` }}>Completion Tokens (Output)</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.providerUsage.map((r) => (
                    <tr key={r.model} style={{ transition: 'background-color 0.2s' }} onMouseOver={e => e.currentTarget.style.backgroundColor = theme.palette.action.hover} onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                      <td style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.palette.divider}`, fontWeight: 'bold' }}>{r.model}</td>
                      <td style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.palette.divider}`, textAlign: 'right' }}>{fmtInt(r.requests)}</td>
                      <td style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.palette.divider}`, textAlign: 'right', color: theme.palette.primary.main }}>{fmtTokens(r.prompt_tokens)}</td>
                      <td style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.palette.divider}`, textAlign: 'right', color: theme.palette.secondary.main }}>{fmtTokens(r.completion_tokens)}</td>
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
      <Container maxWidth="xl" sx={{ mt: 4, mb: 6 }}>
        {/* Header und Filter */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 3 }}>
          <Box>
            <Typography variant="h4" component="h1" fontWeight="bold" gutterBottom>
              System & Analytics Dashboard
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Globale Performance-, KI-Nutzungs- und Community-Metriken im Überblick.
            </Typography>
          </Box>

          <Paper variant="outlined" sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', borderRadius: 2, bgcolor: 'background.paper' }}>
            <FormControlLabel
              control={<Switch checked={compare} onChange={(e) => setCompare(e.target.checked)} color="primary" />}
              label={<Typography variant="body2" fontWeight="bold">Zeitraum-Vergleich</Typography>}
              sx={{ mr: 1 }}
            />
            <Divider orientation="vertical" flexItem />

            <TextField select label="Business Partner" value={bpFilter} onChange={(e) => setBpFilter(e.target.value)} size="small" sx={{ minWidth: 200 }}>
              <MenuItem value=""><em>Alle Mandanten</em></MenuItem>
              {stats?.businessPartners.map((bp) => (
                <MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>
              ))}
            </TextField>

            <TextField select label="KI-Modell" value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} size="small" sx={{ minWidth: 180 }}>
              <MenuItem value=""><em>Alle Modelle</em></MenuItem>
              {stats?.availableModels.map((m) => (
                <MenuItem key={m} value={m}>{m}</MenuItem>
              ))}
            </TextField>

            <Divider orientation="vertical" flexItem />

            <ToggleButtonGroup value={timespan} exclusive onChange={handleTimespanChange} size="small" color="primary">
              <ToggleButton value="day" sx={{ px: 2, fontWeight: 'bold' }}>24h</ToggleButton>
              <ToggleButton value="week" sx={{ px: 2, fontWeight: 'bold' }}>7 Tage</ToggleButton>
              <ToggleButton value="month" sx={{ px: 2, fontWeight: 'bold' }}>Monat</ToggleButton>
              <ToggleButton value="year" sx={{ px: 2, fontWeight: 'bold' }}>Jahr</ToggleButton>
            </ToggleButtonGroup>

            {timespan === 'month' && (
              <TextField
                label="Kalendermonat"
                type="month"
                size="small"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                sx={{ minWidth: 160 }}
                InputLabelProps={{ shrink: true }}
              />
            )}
          </Paper>
        </Box>

        {renderDashboard()}

        <Dialog open={!!selectedTopUser} onClose={handleCloseTopUser} fullWidth maxWidth="sm">
          <DialogTitle sx={{ pr: 6 }}>
            Nutzerprofil
            <IconButton aria-label="Schließen" onClick={handleCloseTopUser} sx={{ position: 'absolute', right: 8, top: 8 }}>
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers>
            {selectedTopUserLoading && (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, py: 5 }}>
                <CircularProgress size={24} />
                <Typography variant="body2" color="text.secondary">Profildaten werden geladen …</Typography>
              </Box>
            )}

            {!selectedTopUserLoading && selectedTopUserError && <Alert severity="info">{selectedTopUserError}</Alert>}

            {!selectedTopUserLoading && selectedTopUserProfile && (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2.5 }}>
                  <Avatar
                    src={resolveAssetUrl(selectedTopUserProfile.profile_image_url)}
                    alt={getUserDisplayName(selectedTopUserProfile)}
                    sx={{ width: 72, height: 72 }}
                  >
                    {(selectedTopUserProfile.first_name?.[0] || selectedTopUserProfile.username?.[0] || '?').toUpperCase()}
                  </Avatar>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="h6" fontWeight="bold">{getUserDisplayName(selectedTopUserProfile)}</Typography>
                    <Typography variant="body2" color="text.secondary">@{selectedTopUserProfile.username}</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
                      {selectedTopUserProfile.role && <Chip label={`Rolle: ${selectedTopUserProfile.role}`} size="small" />}
                      <Chip
                        label={selectedTopUserProfile.is_active ? 'Aktiv' : 'Inaktiv'}
                        color={selectedTopUserProfile.is_active ? 'success' : 'default'}
                        variant="outlined"
                        size="small"
                      />
                      {selectedTopUserProfile.membership_level && <Chip label={selectedTopUserProfile.membership_level} size="small" variant="outlined" />}
                    </Box>
                  </Box>
                </Box>

                <Grid container spacing={1.5}>
                  {selectedTopUserProfile.organization_name && (
                    <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Organisation:</strong> {selectedTopUserProfile.organization_name}</Typography></Grid>
                  )}
                  {selectedTopUserProfile.business_partner_name && (
                    <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Mandant:</strong> {selectedTopUserProfile.business_partner_name}</Typography></Grid>
                  )}
                  {selectedTopUserProfile.email && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body2"><strong>E-Mail:</strong> <Link href={`mailto:${selectedTopUserProfile.email}`}>{selectedTopUserProfile.email}</Link></Typography>
                    </Grid>
                  )}
                  {selectedTopUserProfile.phone && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body2"><strong>Telefon:</strong> <Link href={`tel:${selectedTopUserProfile.phone}`}>{selectedTopUserProfile.phone}</Link></Typography>
                    </Grid>
                  )}
                  {formatProfileDate(selectedTopUserProfile.created_at) && (
                    <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Registriert seit:</strong> {formatProfileDate(selectedTopUserProfile.created_at)}</Typography></Grid>
                  )}
                  {formatProfileDate(selectedTopUserProfile.last_login_at) && (
                    <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Letzter Login:</strong> {formatProfileDate(selectedTopUserProfile.last_login_at)}</Typography></Grid>
                  )}
                  {formatProfileDate(selectedTopUserProfile.active_until) && (
                    <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Aktiv bis:</strong> {formatProfileDate(selectedTopUserProfile.active_until)}</Typography></Grid>
                  )}
                  {selectedTopUserProfile.login_count != null && (
                    <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Logins:</strong> {fmtInt(selectedTopUserProfile.login_count)}</Typography></Grid>
                  )}
                  {selectedTopUserProfile.contribution_score != null && (
                    <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Community-Punkte:</strong> {fmtInt(selectedTopUserProfile.contribution_score)}</Typography></Grid>
                  )}
                  {selectedTopUser && (
                    <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Aktivitäten im Zeitraum:</strong> {fmtInt(selectedTopUser.activity_count)}</Typography></Grid>
                  )}
                </Grid>

                {!!selectedTopUserProfile.tags?.length && (
                  <Box sx={{ mt: 2.5 }}>
                    <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.75 }}>Experte für</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                      {selectedTopUserProfile.tags.map((tag) => <Chip key={tag} label={tag} size="small" color="primary" variant="outlined" />)}
                    </Box>
                  </Box>
                )}

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2.5 }}>
                  <Button
                    component="a"
                    href={`/p/${selectedTopUserProfile.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="outlined"
                    size="small"
                    endIcon={<OpenInNewIcon />}
                  >
                    Visitenkarte öffnen
                  </Button>
                  {safeExternalUrl(selectedTopUserProfile.linkedin_url) && (
                    <Button
                      component="a"
                      href={safeExternalUrl(selectedTopUserProfile.linkedin_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      size="small"
                      endIcon={<OpenInNewIcon />}
                    >
                      LinkedIn
                    </Button>
                  )}
                </Box>
              </Box>
            )}
          </DialogContent>
          <DialogActions><Button onClick={handleCloseTopUser}>Schließen</Button></DialogActions>
        </Dialog>
      </Container>
    </DashboardLayout>
  );
};

export default AdminStatisticsPage;
