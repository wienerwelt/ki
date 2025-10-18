import React, { useState, useEffect, useMemo } from 'react'; // useRef entfernt
import {
    Box, Typography, CircularProgress, Alert, ToggleButton,
    ToggleButtonGroup, Link as MuiLink, Tooltip, FormControl,
    Select, MenuItem, SelectChangeEvent, Paper, Divider, IconButton
} from '@mui/material';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from 'recharts';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import EvStationIcon from '@mui/icons-material/EvStation';
import PowerIcon from '@mui/icons-material/Power';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';

import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps, Region } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';

// ... (Interfaces und Helper-Komponenten bleiben gleich, ca. Zeile 20-102)
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
const subtypeIcons: { [key: string]: { icon: React.ReactElement; tooltip: string } } = {
  'Benzin': { icon: <LocalGasStationIcon />, tooltip: 'Benzin' },
  'Diesel': { icon: <LocalGasStationIcon />, tooltip: 'Diesel' },
  'Hybrid (ohne Plug-in)': { icon: <PowerIcon />, tooltip: 'Hybrid' },
  'Plug-in-Hybrid': { icon: <PowerIcon />, tooltip: 'Plug-in-Hybrid' },
  'Hybrid': { icon: <PowerIcon />, tooltip: 'Hybrid' },
  'Elektro (BEV)': { icon: <EvStationIcon />, tooltip: 'Elektro' },
  'Elektro': { icon: <EvStationIcon />, tooltip: 'Elektro' },
  'default': { icon: <HelpOutlineIcon />, tooltip: 'Unbekannt' },
};
const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088FE', '#00C49F'];
const integerFormatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const Flag: React.FC<{ code?: string; alt?: string; size?: number }> = ({ code, alt, size = 20 }) => {
  if (!code) return null;
  const c = code.toUpperCase();
  if (c === 'EU') { return ( <svg width={size} height={(size * 2) / 3} viewBox="0 0 12 8" xmlns="http://www.w3.org/2000/svg" aria-label={alt || 'EU'}><rect width="12" height="8" fill="#003399" />{Array.from({ length: 12 }).map((_, i) => { const angle = (i * 30 * Math.PI) / 180; const cx = 6 + Math.cos(angle) * 2.2; const cy = 4 + Math.sin(angle) * 2.2; return (<g key={i} transform={`translate(${cx},${cy})`}><polygon points="0,-0.6 0.17,-0.1 0.6,-0.1 0.26,0.16 0.39,0.6 0,0.35 -0.39,0.6 -0.26,0.16 -0.6,-0.1 -0.17,-0.1" fill="#FFCC00" /></g>);})}</svg> );}
  return <img loading="lazy" width={size} src={`https://flagcdn.com/w20/${c.toLowerCase()}.png`} alt={alt || c} />;
};
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const date = format(new Date(label), 'MMMM yyyy', { locale: de });
    const total = payload.reduce((sum: number, entry: { value: number }) => sum + (entry.value || 0), 0);
    return (
      <Paper elevation={3} sx={{ p: 1.5, bgcolor: 'background.paper', minWidth: 200 }}>
        <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>{date}</Typography>
        {payload.map((pld: any) => {
            const percentage = total > 0 ? ((pld.value / total) * 100).toFixed(1) : 0;
            return (
                 <Box key={pld.dataKey} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', my: 0.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Box sx={{ width: 10, height: 10, bgcolor: pld.fill, mr: 1, borderRadius: '50%' }} />
                        <Typography variant="body2">{`${pld.name}:`}</Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                        {`${integerFormatter.format(pld.value)} (${percentage}%)`}
                    </Typography>
                </Box>
            );
        })}
        <Divider sx={{ my: 1 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2">Gesamt:</Typography>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{integerFormatter.format(total)}</Typography>
        </Box>
      </Paper>
    );
  }
  return null;
};
// ... (Ende der Helper)


const EconomicStatWidget: React.FC<EconomicStatWidgetProps> = ({
  widgetId, onDelete, isRemovable, icon, title, widgetTypeKey,
  category, countryCode = 'DE'
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<StatDataPoint[]>([]);
  const [source, setSource] = useState<StatSource | null>(null);
  const [availableSubtypes, setAvailableSubtypes] = useState<string[]>([]);
  const [selectedSubtypes, setSelectedSubtypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCountry, setSelectedCountry] = useState(countryCode);
  const [availableCountries, setAvailableCountries] = useState<Region[]>([]);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Hook 1: Lädt die verfügbaren Länder für den Dropdown-Filter
  useEffect(() => {
    const fetchCountries = async () => {
        if (!category) return;
        try {
            const response = await apiClient.get('/api/data/economic-statistics/countries', {
                params: { statisticType: category }
            });
            setAvailableCountries(response.data || []); // Sicherstellen, dass es ein Array ist
        } catch (err) {
            console.error("Länder für Statistik-Widget konnten nicht geladen werden:", err);
            setAvailableCountries([]); // Im Fehlerfall leeres Array setzen
        }
    };
    fetchCountries();
  }, [category]);

  // Hook 2: Stellt die Standard-Region ein (KORRIGIERT, um Schleifen zu vermeiden)
  useEffect(() => {
    // Dieser Hook läuft nur, wenn Länder geladen sind UND die Initialisierung noch nicht erfolgt ist.
    if (initialLoadDone || availableCountries.length === 0) {
        return; // Entweder schon initialisiert oder Länder sind noch nicht geladen
    }

    const availableCountryCodes = availableCountries.map(c => c.code);
    let countryToSet = availableCountryCodes.length > 0 ? availableCountryCodes[0] : countryCode; // Fallback 1: erstes Land oder Prop

    if (user?.regions) {
        const userDefaultRegion = user.regions.find(r => r.is_default);
        if (userDefaultRegion && availableCountryCodes.includes(userDefaultRegion.code)) {
            countryToSet = userDefaultRegion.code; // Bevorzuge User-Region
        }
    }

    setSelectedCountry(countryToSet);
    setInitialLoadDone(true); // Initialisierung abschließen (löst Hook 3 aus)

  }, [availableCountries, user, initialLoadDone, countryCode]); // Abhängigkeiten sind korrekt


  // Hook 3: Lädt die Chart-Daten (DIESER BLOCK HAT GEFEHLT)
  useEffect(() => {
    const fetchData = async () => {
      if (!category) {
        setError("Keine Kategorie im Widget-Typ konfiguriert.");
        setLoading(false);
        return;
      }
      
      console.log(`[StatWidget] Fetching data for: ${category} / ${selectedCountry}`);
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
          // Wähle alle Subtypen standardmäßig aus, wenn neue Daten geladen werden
          setSelectedSubtypes(subtypes); 
        } else {
          setData([]);
          setSource(null);
          setAvailableSubtypes([]);
          setSelectedSubtypes([]);
          setError(response.data?.message || "Unbekannter Fehler beim Laden der Daten.");
        }
      } catch (err: any) {
        console.error("Fehler beim Laden der Statistikdaten:", err);
        setData([]);
        setSource(null);
        setAvailableSubtypes([]);
        setSelectedSubtypes([]);
        setError(err?.response?.data?.message || "Daten konnten nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    };

    // Nur ausführen, wenn die Initialisierung abgeschlossen ist
    // und wir eine Kategorie UND ein Land haben.
    if (initialLoadDone && category && selectedCountry) {
      fetchData();
    }
  }, [category, selectedCountry, initialLoadDone]); // Abhängig von diesen Werten


  // ... (Rest der Datei: useMemo, renderContent, widgetTitleComponent, etc. bleiben gleich)
  const latestTotal = useMemo(() => {
    if (!data || data.length === 0 || selectedSubtypes.length === 0) return 0;
    // KORREKTUR: Berechne nur die Summe des *letzten* Datums, nicht aller Daten
    const latestDataPoint = data[data.length - 1];
    if (!latestDataPoint) return 0;
    
    return selectedSubtypes.reduce((subSum, key) => {
        return subSum + (Number(latestDataPoint[key]) || 0);
    }, 0);
  }, [data, selectedSubtypes]);

  const renderContent = () => {
    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
    if (error) return <Alert severity="error">{error}</Alert>;
    if (data.length === 0) return <Typography sx={{ p: 2, textAlign: 'center' }} color="text.secondary">Keine Daten für das gewählte Land verfügbar.</Typography>;

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ p: 2, textAlign: 'center' }}>
          <Typography variant="h4" color="primary">{integerFormatter.format(latestTotal)}</Typography>
          <Typography variant="body2" color="text.secondary">
            {data.length > 0 ? format(new Date(data[data.length - 1].date), "'(Stand:' dd.MM.yyyy')'", { locale: de }) : ''}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2, px: 1, flexWrap: 'wrap', gap: 1 }}>
            <ToggleButtonGroup value={selectedSubtypes} onChange={(_, newSubtypes) => setSelectedSubtypes(newSubtypes)} aria-label="Statistik-Subtypen">
                {availableSubtypes.map((subtype, index) => {
                    const color = COLORS[index % COLORS.length];
                    return (
                        <Tooltip title={subtype} key={subtype}>
                            <ToggleButton
                                value={subtype}
                                aria-label={subtype}
                                sx={{
                                    color: color,
                                    '&.Mui-selected, &.Mui-selected:hover': {
                                        color: color,
                                    },
                                    border: `1px solid ${color} !important`,
                                    m: 0.25
                                }}
                            >
                                {(subtypeIcons[subtype] || subtypeIcons.default).icon}
                            </ToggleButton>
                        </Tooltip>
                    );
                })}
            </ToggleButtonGroup>
        </Box>

        <Box sx={{ flexGrow: 1, height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 45 }}>
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
              <Legend wrapperStyle={{ bottom: 0 }}/>
              {selectedSubtypes.map((subtype) => {
                  const originalIndex = availableSubtypes.indexOf(subtype);
                  const color = COLORS[originalIndex % COLORS.length];
                  return (
                    <Bar key={subtype} dataKey={subtype} stackId="a" name={subtype} fill={color} />
                  );
              })}
            </BarChart>
          </ResponsiveContainer>
        </Box>
        {source && (
            <Typography variant="caption" sx={{ textAlign: 'center', p: 1, pt: 2, color: 'text.secondary', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.5 }}>
                Quelle: <MuiLink href={source.url} target="_blank" rel="noopener">{source.name}</MuiLink>
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
    );
  };

  const widgetTitleComponent = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
        {icon}
        <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>{title}</Typography>
        {availableCountries.length > 1 && (
            <FormControl size="small" sx={{ minWidth: 100, '.MuiOutlinedInput-notchedOutline': { border: 'none' } }} onMouseDown={(e) => e.stopPropagation()}>
                <Select
                    value={selectedCountry}
                    onChange={(e: SelectChangeEvent) => {
                      setSelectedCountry(e.target.value);
                      // Hinweis: setSelectedSubtypes([]); wird jetzt im fetchData-Hook gehandhabt
                    }}
                    renderValue={(value) => {
                        const country = availableCountries.find(c => c.code === value);
                        return (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Flag code={value as string} alt={country?.name} />
                                {country?.code}
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