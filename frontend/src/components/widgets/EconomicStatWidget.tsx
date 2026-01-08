import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Link as MuiLink,
  Tooltip,
  FormControl,
  Select,
  MenuItem,
  SelectChangeEvent,
  Paper,
  Divider,
  IconButton
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import EvStationIcon from '@mui/icons-material/EvStation';
import PowerIcon from '@mui/icons-material/Power';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import DownloadIcon from '@mui/icons-material/Download';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps, Region } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';

// --- Types ---
interface StatDataPoint {
  date: string;
  [key: string]: string | number;
}
interface StatSource {
  name: string;
  url: string;
  is_trusted: boolean;
}
interface EconomicStatWidgetProps extends BaseWidgetProps {
  icon?: React.ReactNode;
  title: string;
  category: string;
  countryCode?: string;
}

// --- Constants & Helpers ---
const subtypeIcons: { [key: string]: { icon: React.ReactElement; tooltip: string } } = {
  Benzin: { icon: <LocalGasStationIcon />, tooltip: 'Benzin' },
  Diesel: { icon: <LocalGasStationIcon />, tooltip: 'Diesel' },
  'Hybrid (ohne Plug-in)': { icon: <PowerIcon />, tooltip: 'Hybrid' },
  'Plug-in-Hybrid': { icon: <PowerIcon />, tooltip: 'Plug-in-Hybrid' },
  Hybrid: { icon: <PowerIcon />, tooltip: 'Hybrid' },
  'Elektro (BEV)': { icon: <EvStationIcon />, tooltip: 'Elektro' },
  Elektro: { icon: <EvStationIcon />, tooltip: 'Elektro' },
  default: { icon: <HelpOutlineIcon />, tooltip: 'Unbekannt' }
};

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088FE', '#00C49F'];
const integerFormatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

const Flag: React.FC<{ code?: string; alt?: string; size?: number }> = ({ code, alt, size = 20 }) => {
  if (!code) return null;
  const c = code.toUpperCase();
  if (c === 'EU') {
    return (
      <svg
        width={size}
        height={(size * 2) / 3}
        viewBox="0 0 12 8"
        xmlns="http://www.w3.org/2000/svg"
        aria-label={alt || 'EU'}
      >
        <rect width="12" height="8" fill="#003399" />
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i * 30 * Math.PI) / 180;
          const cx = 6 + Math.cos(angle) * 2.2;
          const cy = 4 + Math.sin(angle) * 2.2;
          return (
            <g key={i} transform={`translate(${cx},${cy})`}>
              <polygon
                points="0,-0.6 0.17,-0.1 0.6,-0.1 0.26,0.16 0.39,0.6 0,0.35 -0.39,0.6 -0.26,0.16 -0.6,-0.1 -0.17,-0.1"
                fill="#FFCC00"
              />
            </g>
          );
        })}
      </svg>
    );
  }
  return (
    <img
      loading="lazy"
      width={size}
      src={`https://flagcdn.com/w20/${c.toLowerCase()}.png`}
      alt={alt || c}
    />
  );
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const date = format(new Date(label), 'MMMM yyyy', { locale: de });
    const total = payload.reduce((sum: number, entry: { value: number }) => sum + (entry.value || 0), 0);
    return (
      <Paper elevation={3} sx={{ p: 1.5, bgcolor: 'background.paper', minWidth: 200 }}>
        <Typography variant="body2" component="div" sx={{ mb: 1, fontWeight: 'bold' }}>
          {date}
        </Typography>
        {payload.map((pld: any) => {
          const percentage = total > 0 ? ((pld.value / total) * 100).toFixed(1) : 0;
          return (
            <Box
              key={pld.dataKey}
              sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', my: 0.5 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Box sx={{ width: 10, height: 10, bgcolor: pld.fill, mr: 1, borderRadius: '50%' }} />
                <Typography variant="body2" component="span">{`${pld.name}:`}</Typography>
              </Box>
              <Typography variant="body2" component="span" sx={{ fontWeight: 'bold' }}>
                {`${integerFormatter.format(pld.value)} (${percentage}%)`}
              </Typography>
            </Box>
          );
        })}
        <Divider sx={{ my: 1 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="body2" component="span">
            Gesamt:
          </Typography>
          <Typography variant="body2" component="span" sx={{ fontWeight: 'bold' }}>
            {integerFormatter.format(total)}
          </Typography>
        </Box>
      </Paper>
    );
  }
  return null;
};

const imageToBase64 = async (url: string): Promise<string | null> => {
  try {
    const resp = await fetch(url, { mode: 'cors' });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

const EconomicStatWidget: React.FC<EconomicStatWidgetProps> = ({
  widgetId,
  onDelete,
  isRemovable,
  icon,
  title,
  widgetTypeKey,
  category,
  countryCode = 'DE'
}) => {
  const navigate = useNavigate();
  const { user, businessPartner } = useAuth();

  const [data, setData] = useState<StatDataPoint[]>([]);
  const [source, setSource] = useState<StatSource | null>(null);
  const [availableSubtypes, setAvailableSubtypes] = useState<string[]>([]);
  const [selectedSubtypes, setSelectedSubtypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCountry, setSelectedCountry] = useState(countryCode);
  const [availableCountries, setAvailableCountries] = useState<Region[]>([]);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const exportRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);


  useEffect(() => {
    const fetchCountries = async () => {
      if (!category) return;
      try {
        const response = await apiClient.get('/api/data/economic-statistics/countries', {
          params: { statisticType: category }
        });
        setAvailableCountries(response.data || []);
      } catch (err) {
        console.error('Länder konnten nicht geladen werden:', err);
        setAvailableCountries([]);
      }
    };
    fetchCountries();
  }, [category]);

  useEffect(() => {
    if (initialLoadDone || availableCountries.length === 0) return;

    const availableCountryCodes = availableCountries.map((c) => c.code);
    let countryToSet = availableCountryCodes.length > 0 ? availableCountryCodes[0] : countryCode;

    if (user?.regions) {
      const userDefaultRegion = user.regions.find((r) => r.is_default);
      if (userDefaultRegion && availableCountryCodes.includes(userDefaultRegion.code)) {
        countryToSet = userDefaultRegion.code;
      }
    }

    setSelectedCountry(countryToSet);
    setInitialLoadDone(true);
  }, [availableCountries, user, initialLoadDone, countryCode]);

  useEffect(() => {
    const fetchData = async () => {
      if (!category) {
        setError('Keine Kategorie konfiguriert.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await apiClient.get('/api/data/economic-statistics', {
          params: {
            statisticType: category,
            countryCode: selectedCountry
          }
        });

        if (response.data?.ok) {
          const subtypes = response.data.subtypes || [];
          setData(response.data.data || []);
          setSource(response.data.source || null);
          setAvailableSubtypes(subtypes);
          setSelectedSubtypes(subtypes);
        } else {
          setData([]);
          setError(response.data?.message || 'Fehler beim Laden.');
        }
      } catch (err: any) {
        console.error('Fehler beim Laden der Statistikdaten:', err);
        setError(err?.response?.data?.message || 'Datenfehler.');
      } finally {
        setLoading(false);
      }
    };

    if (initialLoadDone && category && selectedCountry) {
      fetchData();
    }
  }, [category, selectedCountry, initialLoadDone]);

  const latestTotal = useMemo(() => {
    if (!data || data.length === 0 || selectedSubtypes.length === 0) return 0;
    const latestDataPoint = data[data.length - 1];
    return selectedSubtypes.reduce((subSum, key) => subSum + (Number(latestDataPoint[key]) || 0), 0);
  }, [data, selectedSubtypes]);

  const chartData = useMemo(() => {
    if (data.length > 150) {
      return data.slice(data.length - 150);
    }
    return data;
  }, [data]);

  const handleDownloadPdf = async () => {
    if (loading || error || data.length === 0) return;
    if (!exportRef.current) return;

    setPdfError(null);
    setIsDownloading(true);
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const margin = 14;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const reportTitle = title || 'Economic Statistics';
      const latestDate = data.length > 0 ? new Date(data[data.length - 1].date) : null;
      const latestDateLabel = latestDate ? format(latestDate, 'dd.MM.yyyy', { locale: de }) : '-';

      // Header
      doc.setFontSize(16);
      doc.text(reportTitle, margin, 16);

      doc.setFontSize(10);
      doc.text(
        `Land: ${selectedCountry} | Typ: ${category} | Stand: ${latestDateLabel}`,
        margin,
        22
      );
      doc.text(`Export: ${new Date().toLocaleDateString('de-DE')}`, margin, 27);

      // Optional Logo
      if (businessPartner?.logo_url) {
        const logo = await imageToBase64(businessPartner.logo_url);
        if (logo) {
          const logoW = 26;
          doc.addImage(logo, 'PNG', pageWidth - logoW - margin, 10, logoW, 0);
        }
      }

      // Screenshot (Chart + KPIs + Quelle, ohne abgeschnittenen WidgetPaper-Container)
      const canvas = await html2canvas(exportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/png');

      const imgW = pageWidth - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;

      let y = 32;
      doc.addImage(imgData, 'PNG', margin, y, imgW, imgH);
      y += imgH + 6;

      // Daten-Tabelle (letzte 12 Monate aus kompletter Zeitreihe)
      const last = data.slice(Math.max(0, data.length - 12));
      const cols = ['Monat', ...selectedSubtypes];

      const rows = last.map((dp) => {
        const monthLabel = dp.date ? format(new Date(dp.date), 'MMM yyyy', { locale: de }) : '';
        return [
          monthLabel,
          ...selectedSubtypes.map((st) => {
            const v = dp[st];
            const n = typeof v === 'string' ? Number(v) : (v as number);
            return Number.isFinite(n) ? integerFormatter.format(n) : '';
          })
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [cols],
        body: rows,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fontSize: 8 },
        margin: { left: margin, right: margin }
      });

      const finalY = (doc as any).lastAutoTable?.finalY ?? y;

      // Footer: Source (wenn vorhanden)
      const srcLine = source?.name ? `${source.name}${source.url ? ` (${source.url})` : ''}` : '';
      doc.setFontSize(9);
      const footerY = Math.min(finalY + 10, pageHeight - 10);
      if (srcLine) doc.text(`Quelle: ${srcLine}`, margin, footerY);

      // Save
      doc.save(`economic-stats_${category}_${selectedCountry}.pdf`);
      } catch (e: any) {
        console.error('PDF Export fehlgeschlagen:', e);
        setPdfError(e?.message || 'PDF konnte nicht erstellt werden.');
      } finally {
        setIsDownloading(false);
      }
  };

  const renderContent = () => {
    if (loading) return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
    if (error) return <Alert severity="error">{error}</Alert>;
    if (data.length === 0) {
      return (
        <Typography sx={{ p: 2, textAlign: 'center' }} color="text.secondary">
          Keine Daten verfügbar.
        </Typography>
      );
    }

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Export-Bereich: bewusst ein innerer Container, damit html2canvas nicht an WidgetPaper maxHeight/overflow scheitert */}
        <Box
          ref={exportRef}
          sx={{
            px: 2,
            pt: 2,
            pb: 1,
            bgcolor: 'background.paper'
          }}
        >
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h4" color="primary">
              {integerFormatter.format(latestTotal)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {data.length > 0
                ? format(new Date(data[data.length - 1].date), "'(Stand:' dd.MM.yyyy')'", { locale: de })
                : ''}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, mb: 2, px: 1, flexWrap: 'wrap', gap: 1 }}>
            <ToggleButtonGroup
              value={selectedSubtypes}
              onChange={(_, newSubtypes) => setSelectedSubtypes(newSubtypes)}
              aria-label="Statistik-Subtypen"
              sx={{ flexWrap: 'wrap', justifyContent: 'center' }}
            >
              {availableSubtypes.map((subtype, index) => {
                const color = COLORS[index % COLORS.length];
                const isSelected = selectedSubtypes.includes(subtype);

                return (
                  <Tooltip title={subtype} key={subtype}>
                    <ToggleButton
                      value={subtype}
                      size="small"
                      sx={{
                        color: isSelected ? color : 'text.secondary',
                        borderColor: isSelected ? color : 'action.disabled',
                        bgcolor: isSelected ? alpha(color, 0.25) : 'transparent',
                        '&:hover': {
                          bgcolor: isSelected ? alpha(color, 0.35) : alpha(color, 0.1),
                          borderColor: color,
                          color: color
                        },
                        '&.Mui-selected': {
                          color: color,
                          borderColor: color,
                          bgcolor: alpha(color, 0.25)
                        },
                        margin: '4px !important',
                        border: `1px solid ${isSelected ? color : 'rgba(0, 0, 0, 0.12)'} !important`,
                        borderRadius: '8px !important',
                        '&.MuiToggleButtonGroup-grouped': {
                          border: `1px solid ${isSelected ? color : 'rgba(0, 0, 0, 0.12)'} !important`,
                          borderRadius: '8px !important',
                          margin: '4px !important',
                          borderLeft: `1px solid ${isSelected ? color : 'rgba(0, 0, 0, 0.12)'} !important`
                        },
                        '&.MuiToggleButtonGroup-grouped:not(:first-of-type)': {
                          borderLeft: `1px solid ${isSelected ? color : 'rgba(0, 0, 0, 0.12)'} !important`,
                          marginLeft: '4px !important',
                          borderRadius: '8px !important'
                        },
                        p: 0.8,
                        minWidth: 45,
                        transition: 'all 0.2s ease-in-out'
                      }}
                    >
                      {subtypeIcons[subtype]?.icon || subtypeIcons.default.icon}
                    </ToggleButton>
                  </Tooltip>
                );
              })}
            </ToggleButtonGroup>
          </Box>

          <Box sx={{ height: 320, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 45 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(dateStr) => format(new Date(dateStr), "MMM ''yy", { locale: de })}
                  angle={-45}
                  textAnchor="end"
                  interval="preserveStartEnd"
                />
                <YAxis tickFormatter={(tick) => integerFormatter.format(tick)} />
                <RechartsTooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ bottom: 0 }} />
                {selectedSubtypes.map((subtype) => {
                  const originalIndex = availableSubtypes.indexOf(subtype);
                  const color = COLORS[originalIndex % COLORS.length];
                  return <Bar key={subtype} dataKey={subtype} stackId="a" name={subtype} fill={color} />;
                })}
              </BarChart>
            </ResponsiveContainer>
          </Box>

          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1 }}>
            {pdfError && <Alert severity="error" sx={{ py: 0.5, mr: 1 }}>{pdfError}</Alert>}
            <Button
              variant="outlined"
              size="small"
              startIcon={isDownloading ? <CircularProgress size={16} /> : <DownloadIcon />}
              onClick={handleDownloadPdf}
              disabled={isDownloading || loading || !!error || data.length === 0}
            >
              {isDownloading ? 'Exportiere...' : 'PDF Export'}
            </Button>
          </Box>          

          {source && (
            <Typography
              variant="caption"
              component="div"
              sx={{
                textAlign: 'center',
                p: 1,
                pt: 2,
                color: 'text.secondary',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 0.5
              }}
            >
              Quelle:{' '}
              <MuiLink href={source.url} target="_blank" rel="noopener">
                {source.name}
              </MuiLink>
              {source.is_trusted && (
                <Tooltip title="Info zu geprüften Quellen">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate('/trusted-sources');
                    }}
                    sx={{ p: 0 }}
                  >
                    <VerifiedUserIcon sx={{ fontSize: 14, color: 'success.main' }} />
                  </IconButton>
                </Tooltip>
              )}
            </Typography>
          )}
        </Box>
      </Box>
    );
  };

  const widgetTitleComponent = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
      {icon}
      <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
        {title}
      </Typography>

      {availableCountries.length > 1 && (
        <FormControl size="small" sx={{ minWidth: 100 }} onMouseDown={(e) => e.stopPropagation()}>
          <Select
            value={selectedCountry}
            variant="standard"
            disableUnderline
            onChange={(e: SelectChangeEvent) => setSelectedCountry(e.target.value)}
            renderValue={(value) => {
              const country = availableCountries.find((c) => c.code === value);
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Flag code={value as string} alt={country?.name} />
                  <Typography variant="body2">{country?.code}</Typography>
                </Box>
              );
            }}
          >
            {availableCountries.map((country) => (
              <MenuItem key={country.code} value={country.code}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Flag code={country.code} alt={country.name} />
                  {country.name}
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
    </Box>
  );

  return (
    <WidgetPaper
      title={widgetTitleComponent}
      widgetTitle={title}
      widgetId={widgetId}
      onDelete={onDelete}
      isRemovable={isRemovable}
      widgetTypeKey={widgetTypeKey || ''}
      noPadding
    >
      {renderContent()}
    </WidgetPaper>
  );
};

export default EconomicStatWidget;
