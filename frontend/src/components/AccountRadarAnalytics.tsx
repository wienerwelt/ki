import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, ButtonGroup, Chip, CircularProgress, Collapse, IconButton, LinearProgress, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import EuroOutlinedIcon from '@mui/icons-material/EuroOutlined';
import SpeedOutlinedIcon from '@mui/icons-material/SpeedOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import apiClient from '../apiClient';

interface RadarAnalytics {
  periodDays: number;
  isSampled: boolean;
  metrics: {
    signals: number; tasks: number; contacts: number; meetings: number; offers: number;
    wins: number; losses: number; signalToContactPercent: number; winRatePercent: number;
    averageResponseHours: number | null; irrelevant: number; irrelevantPercent: number;
    openPipelineValueEur: number; weightedPipelineValueEur: number; wonRevenueEur: number;
  };
  topSources: Array<{ source: string; signals: number; contacts: number; wins: number; contactConversionPercent: number }>;
  signalTypes: Array<{ signalType: string; signals: number; contacts: number; wins: number; contactConversionPercent: number }>;
  irrelevantReasons: Array<{ reason: string; label: string; count: number }>;
  timeline: Array<{ date: string; signals: number; contacts: number; wins: number; wonRevenueEur: number }>;
}

const euro = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const dateLabel = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });

interface AccountRadarAnalyticsProps {
  tenantName?: string | null;
}

const AccountRadarAnalytics: React.FC<AccountRadarAnalyticsProps> = ({ tenantName }) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [periodDays, setPeriodDays] = useState(30);
  const [data, setData] = useState<RadarAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded) return;
    let active = true;
    setLoading(true);
    setError(null);
    apiClient.get<RadarAnalytics>('/api/account-radar/analytics', { params: { periodDays } })
      .then(({ res, data: response }) => {
        if (!active) return;
        if (!res.ok) throw new Error((response as any)?.message || 'Erfolgsmessung konnte nicht geladen werden.');
        setData(response);
      })
      .catch((requestError) => active && setError(requestError?.message || 'Erfolgsmessung konnte nicht geladen werden.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [expanded, periodDays]);

  return (
    <Paper elevation={0} sx={{ p: { xs: 2, md: 2.6 }, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1.5}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center"><InsightsOutlinedIcon color="primary" /><Typography variant="h6" fontWeight={950}>Sales-Erfolg</Typography></Stack>
          <Typography variant="body2" color="text.secondary">
            Vom Signal bis zum Abschluss – ausschließlich für {tenantName || 'Ihren Mandanten'}.
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.8} alignItems="center" sx={{ flexShrink: 0 }}>
          <Chip size="small" variant="outlined" label={periodDays === 365 ? '12 Monate' : `${periodDays} Tage`} sx={{ display: { xs: 'none', sm: 'inline-flex' }, fontWeight: 800 }} />
          <Tooltip title={expanded ? 'Sales-Erfolg einklappen' : 'Sales-Erfolg anzeigen'}>
            <IconButton
              onClick={() => setExpanded((current) => !current)}
              aria-label={expanded ? 'Sales-Erfolg einklappen' : 'Sales-Erfolg anzeigen'}
              aria-expanded={expanded}
              sx={{ border: '1px solid', borderColor: 'divider' }}
            >
              <ExpandMoreIcon sx={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 180ms ease' }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Stack direction="row" justifyContent={{ xs: 'stretch', sm: 'flex-end' }} sx={{ mt: 2 }}>
          <ButtonGroup size="small" fullWidth={false} aria-label="Auswertungszeitraum" sx={{ width: { xs: '100%', sm: 'auto' }, '& .MuiButton-root': { flex: { xs: 1, sm: 'initial' }, whiteSpace: 'nowrap' } }}>
            {[30, 90, 365].map((value) => <Button key={value} variant={periodDays === value ? 'contained' : 'outlined'} onClick={() => setPeriodDays(value)}>{value === 365 ? '12 Monate' : `${value} Tage`}</Button>)}
          </ButtonGroup>
        </Stack>

        {loading ? <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}><CircularProgress size={30} /></Box> : error ? <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert> : data && (
          <Stack spacing={2.2} sx={{ mt: 2.2 }}>
          {data.isSampled && <Alert severity="info">Sehr großer Datenbestand: Die Detailauswertung basiert auf den neuesten 50.000 Signalen.</Alert>}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.2 }}>
            {[
              { icon: <SpeedOutlinedIcon />, value: data.metrics.averageResponseHours === null ? '–' : `${data.metrics.averageResponseHours} h`, label: 'Ø Signal → Kontakt' },
              { icon: <TaskAltOutlinedIcon />, value: `${data.metrics.signalToContactPercent}%`, label: `${data.metrics.contacts} Kontakte aus ${data.metrics.signals} Signalen` },
              { icon: <InsightsOutlinedIcon />, value: `${data.metrics.meetings} / ${data.metrics.offers} / ${data.metrics.wins}`, label: 'Meetings / Angebote / Gewonnen' },
              { icon: <EuroOutlinedIcon />, value: euro.format(data.metrics.weightedPipelineValueEur), label: `Gewichtet · ${euro.format(data.metrics.openPipelineValueEur)} offen` },
            ].map((item) => <Box key={item.label} sx={{ p: 1.5, minWidth: 0, borderRadius: 2.5, bgcolor: alpha(theme.palette.primary.main, 0.055), border: `1px solid ${alpha(theme.palette.primary.main, 0.13)}` }}><Box sx={{ color: 'primary.main' }}>{item.icon}</Box><Typography variant="h6" fontWeight={950} sx={{ overflowWrap: 'anywhere' }}>{item.value}</Typography><Typography variant="caption" color="text.secondary" fontWeight={750}>{item.label}</Typography></Box>)}
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.65fr) minmax(280px, 1fr)' }, gap: 2 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" fontWeight={950} sx={{ mb: 1 }}>Pipeline-Entwicklung</Typography>
              {data.timeline.length ? <Box sx={{ height: 260, width: '100%' }}><ResponsiveContainer><ComposedChart data={data.timeline}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={dateLabel} fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><RechartsTooltip labelFormatter={dateLabel} /><Legend /><Bar dataKey="signals" name="Signale" fill={alpha(theme.palette.primary.main, 0.35)} radius={[4, 4, 0, 0]} /><Line type="monotone" dataKey="contacts" name="Kontakte" stroke={theme.palette.info.main} strokeWidth={2.5} /><Line type="monotone" dataKey="wins" name="Gewonnen" stroke={theme.palette.success.main} strokeWidth={2.5} /></ComposedChart></ResponsiveContainer></Box> : <Alert severity="info">Noch keine Daten in diesem Zeitraum.</Alert>}
            </Box>
            <Box>
              <Typography variant="subtitle2" fontWeight={950} sx={{ mb: 1 }}>Erfolgreichste Quellen</Typography>
              <Stack spacing={1.1}>{data.topSources.slice(0, 5).map((source) => <Box key={source.source}><Stack direction="row" justifyContent="space-between" spacing={1}><Typography variant="body2" fontWeight={850} noWrap>{source.source}</Typography><Typography variant="caption" color="text.secondary">{source.contacts}/{source.signals} · {source.contactConversionPercent}%</Typography></Stack><LinearProgress variant="determinate" value={Math.min(100, source.contactConversionPercent)} sx={{ mt: 0.45, height: 7, borderRadius: 9 }} /></Box>)}</Stack>
            </Box>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <Box><Typography variant="subtitle2" fontWeight={950} sx={{ mb: 1 }}>Conversion nach Signalart</Typography><Stack spacing={0.7}>{data.signalTypes.slice(0, 6).map((item) => <Stack key={item.signalType} direction="row" justifyContent="space-between" spacing={1}><Typography variant="body2">{item.signalType}</Typography><Chip size="small" label={`${item.contacts}/${item.signals} · ${item.contactConversionPercent}%`} /></Stack>)}</Stack></Box>
            <Box><Typography variant="subtitle2" fontWeight={950} sx={{ mb: 1 }}>Qualität der Treffer</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{data.metrics.irrelevant} irrelevante Treffer ({data.metrics.irrelevantPercent}%). Die Gründe verbessern Quellen und Suchprofile.</Typography><Stack direction="row" spacing={0.7} useFlexGap flexWrap="wrap">{data.irrelevantReasons.map((item) => <Chip key={item.reason} size="small" variant="outlined" label={`${item.label}: ${item.count}`} />)}</Stack></Box>
          </Box>
          <Alert severity="success" icon={<EuroOutlinedIcon />}>Gewonnener Umsatz im aktuellen Bestand: <strong>{euro.format(data.metrics.wonRevenueEur)}</strong> · Abschlussquote: <strong>{data.metrics.winRatePercent}%</strong></Alert>
          </Stack>
        )}
      </Collapse>
    </Paper>
  );
};

export default AccountRadarAnalytics;
