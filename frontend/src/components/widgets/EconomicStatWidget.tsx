import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  const initialLoadDone = useRef(false);

  useEffect(() => {
    const fetchCountries = async () => {
        if (!category) return;
        try {
            const response = await apiClient.get('/api/data/economic-statistics/countries', {
                params: { statisticType: category }
            });
            setAvailableCountries(response.data);
        } catch (err) {
            console.error("Länder für Statistik-Widget konnten nicht geladen werden:", err);
        }
    };
    fetchCountries();
  }, [category]);

  useEffect(() => {
    if (availableCountries.length > 0 && user?.regions && !initialLoadDone.current) {
        const userDefaultRegion = user.regions.find(r => r.is_default);
        const availableCountryCodes = availableCountries.map(c => c.code);

        if (userDefaultRegion && availableCountryCodes.includes(userDefaultRegion.code)) {
            setSelectedCountry(userDefaultRegion.code);
            } else if (availableCountryCodes.length > 0) {
                setSelectedCountry(availableCountryCodes[0]);
            }
        initialLoadDone.current = true;
    }
  }, [availableCountries, user?.regions]);
  
  useEffect(() => {
    const fetchData = async () => {
        if (!category || !selectedCountry) {
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const params = { statisticType: category, countryCode: selectedCountry };
            const response = await apiClient.get('/api/data/economic-statistics', { params });
            
            if (response.data.ok) {
                setData(response.data.data || []);
                setSource(response.data.source || null);
                const subtypes = response.data.subtypes || [];
                setAvailableSubtypes(subtypes);
                // Subtypen nur zurücksetzen, wenn sie leer sind oder wenn sich das Land geändert hat (wird im onChange gehandhabt)
                if(selectedSubtypes.length === 0) {
                    setSelectedSubtypes(subtypes);
                }
            } else {
                throw new Error(response.data.message);
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Daten konnten nicht geladen werden.');
            setData([]);
        } finally {
            setLoading(false);
        }
    };
    fetchData();
  }, [category, selectedCountry]);

  const latestTotal = useMemo(() => {
    if (!data || data.length === 0) return 0;
    const lastEntry = data[data.length - 1];
    return selectedSubtypes.reduce((sum, key) => sum + (Number(lastEntry[key]) || 0), 0);
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
            {format(new Date(data[data.length - 1].date), "'(Stand:' dd.MM.yyyy')'", { locale: de })}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <ToggleButtonGroup value={selectedSubtypes} onChange={(_, newSubtypes) => setSelectedSubtypes(newSubtypes)} aria-label="Statistik-Subtypen">
                {availableSubtypes.map(subtype => (
                    <Tooltip title={subtype} key={subtype}>
                        <ToggleButton value={subtype} aria-label={subtype}>
                            {(subtypeIcons[subtype] || subtypeIcons.default).icon}
                        </ToggleButton>
                    </Tooltip>
                ))}
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
              {selectedSubtypes.map((subtype, index) => (
                  <Bar key={subtype} dataKey={subtype} stackId="a" name={subtype} fill={COLORS[index % COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Box>
        {source && (
            // ERWEITERT: Layout für Link und Icon angepasst
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
                      setSelectedSubtypes([]);
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