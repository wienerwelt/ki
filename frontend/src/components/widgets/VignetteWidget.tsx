import React, { useState, useEffect, useMemo } from 'react';
import { 
    Box, Typography, CircularProgress, FormControl, Select, MenuItem, SelectChangeEvent, 
    Link as MuiLink, Paper, Stack, Divider, Tooltip, IconButton, useTheme 
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../apiClient';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import { BarChart, Bar, XAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';

interface Region {
    code: string;
    name: string;
}

interface VignetteWidgetProps extends BaseWidgetProps {
    icon?: React.ReactNode;
    title: string;
    widgetTypeKey: string;
}

const getCurrencySymbol = (currencyCode: string | null): string => {
    if (currencyCode === 'EUR') return '€';
    if (currencyCode === 'CHF') return 'CHF';
    return currencyCode || '';
};

const VignetteWidget: React.FC<VignetteWidgetProps> = ({ onDelete, widgetId, isRemovable, icon, title, widgetTypeKey }) => {
    const navigate = useNavigate();
    const theme = useTheme();
    const [availableCountries, setAvailableCountries] = useState<Region[]>([]);
    const [selectedCountry, setSelectedCountry] = useState('AT');
    const [rawData, setRawData] = useState<any[]>([]);
    const [systemInfo, setSystemInfo] = useState({ car: '', truck: '' });
    const [providerUrl, setProviderUrl] = useState<string>('#');
    const [isTrusted, setIsTrusted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // NEU: State für das ausgewählte Jahr
    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());

    useEffect(() => {
        const fetchCountries = async () => {
            try {
                const token = localStorage.getItem('jwt_token');
                const response = await apiClient.get('/api/data/vignette-countries', { headers: { 'x-auth-token': token } });
                setAvailableCountries(response.data);
            } catch (err) {
                console.error("Fehler beim Laden der Länderliste für Vignetten.");
                setError('Länderliste konnte nicht geladen werden.');
            }
        };
        fetchCountries();
    }, []);

    useEffect(() => {
        if (!selectedCountry) return;
        const fetchVignetteData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const token = localStorage.getItem('jwt_token');
                const response = await apiClient.get(`/api/data/vignettes?country=${selectedCountry}`, { headers: { 'x-auth-token': token } });
                
                const data = response.data.chart_data || [];
                // Sortieren nach Jahr aufsteigend für das Diagramm
                data.sort((a: any, b: any) => parseInt(a.year) - parseInt(b.year));
                
                setRawData(data);
                setSystemInfo({ car: response.data.vignette_system_car || 'N/A', truck: response.data.toll_system_truck || 'N/A' });
                setProviderUrl(response.data.provider_url || '#');
                setIsTrusted(response.data.is_trusted_source || false);

                // Wenn Daten vorhanden sind, setze das Jahr auf das aktuellste verfügbare
                if (data.length > 0) {
                    const latestYear = data[data.length - 1].year;
                    setSelectedYear(latestYear);
                }

            } catch (err: any) {
                setError(err.response?.data?.message || 'Daten konnten nicht geladen werden.');
                setRawData([]);
                setSystemInfo({ car: '-', truck: '-' });
                setProviderUrl('#');
                setIsTrusted(false);
            } finally {
                setIsLoading(false);
            }
        };
        fetchVignetteData();
    }, [selectedCountry]);

    const handleCountryChange = (event: SelectChangeEvent<string>) => {
        setSelectedCountry(event.target.value);
    };
    
    // Berechne Preisvergleich dynamisch basierend auf selectedYear
    const priceComparison = useMemo(() => {
        const currentData = rawData.find(d => d.year === selectedYear);
        
        // Finde das Jahr davor für den Vergleich
        const prevYearInt = parseInt(selectedYear) - 1;
        const previousData = rawData.find(d => d.year === prevYearInt.toString());

        if (!currentData?.price) {
            return null;
        }

        const currency = currentData.currency || 'EUR';

        // Wenn kein Vorjahr vorhanden ist, zeige nur aktuellen Preis ohne Trend
        if (!previousData?.price) {
            return {
                currentPrice: currentData.price,
                previousPrice: null,
                absoluteDiff: 0,
                percentageDiff: 0,
                currency
            };
        }

        const absoluteDiff = currentData.price - previousData.price;
        const percentageDiff = (absoluteDiff / previousData.price) * 100;
        
        return {
            currentPrice: currentData.price,
            previousPrice: previousData.price,
            absoluteDiff,
            percentageDiff,
            currency
        };
    }, [rawData, selectedYear]);

    const hasPriceData = rawData.some(d => d.price !== null);
    const displayUrl = providerUrl.replace(/^(?:https?:\/\/)?(?:www\.)?/i, '').replace(/\/$/, '');
    
    const getTrendColor = (diff: number) => {
        if (diff > 0) return 'error.main';
        if (diff < 0) return 'success.main';
        return 'text.secondary';
    };
    
    const getTrendIcon = (diff: number) => {
        if (diff > 0) return <ArrowUpwardIcon fontSize="small" />;
        if (diff < 0) return <ArrowDownwardIcon fontSize="small" />;
        return <TrendingFlatIcon fontSize="small" />;
    };

    return (
        <WidgetPaper 
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {icon}
                    <Typography variant="h6">{title}</Typography>
                </Box>
            }
            widgetTitle={title}
            widgetTypeKey={widgetTypeKey}
            widgetId={widgetId} 
            onDelete={onDelete} 
            isRemovable={isRemovable} 
            loading={isLoading && availableCountries.length === 0} 
            error={error}
        >
            <Stack spacing={2} sx={{ height: '100%' }}>
                <FormControl fullWidth size="small" onMouseDown={(e) => e.stopPropagation()}>
                    <Select value={selectedCountry} onChange={handleCountryChange} renderValue={(value) => (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <img loading="lazy" width="20" src={`https://flagcdn.com/w20/${value.toLowerCase()}.png`} alt={`Flagge ${value}`} />
                            {availableCountries.find(c => c.code === value)?.name}
                        </Box>
                    )}>
                        {availableCountries.map(c => ( 
                            <MenuItem key={c.code} value={c.code}>
                                <img loading="lazy" width="20" src={`https://flagcdn.com/w20/${c.code.toLowerCase()}.png`} alt={`Flagge ${c.name}`} style={{ marginRight: '12px' }} />
                                {c.name}
                            </MenuItem> 
                        ))}
                    </Select>
                </FormControl>

                {isLoading ? <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box> :
                 !error && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                        <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover', mb: 2 }}>
                            <Stack spacing={1} divider={<Divider flexItem />}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Tooltip title="PKW/Motorrad (bis 3,5t)"><DirectionsCarIcon color="action" /></Tooltip>
                                    <Typography variant="body2">{systemInfo.car}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Tooltip title="LKW (über 3,5t)"><LocalShippingIcon color="action" /></Tooltip>
                                    <Typography variant="body2">{systemInfo.truck}</Typography>
                                </Box>
                            </Stack>
                        </Paper>

                        {/* Hauptanzeige & Chart */}
                        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                            {hasPriceData && priceComparison ? (
                                <>
                                    <Box sx={{ textAlign: 'center', mb: 2 }}>
                                        <Typography variant="overline" color="text.secondary">Jahresvignette {selectedYear}</Typography>
                                        <Typography variant="h3" component="div" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                                            {priceComparison.currentPrice.toLocaleString('de-DE', { minimumFractionDigits: 2 })} {getCurrencySymbol(priceComparison.currency)}
                                        </Typography>
                                        
                                        {priceComparison.previousPrice !== null && (
                                            <Box
                                                sx={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: 1,
                                                    mt: 1,
                                                    px: 1.5,
                                                    py: 0.5,
                                                    borderRadius: '12px',
                                                    bgcolor: 'action.hover',
                                                    color: getTrendColor(priceComparison.absoluteDiff),
                                                }}
                                            >
                                                {getTrendIcon(priceComparison.absoluteDiff)}
                                                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                                    {priceComparison.absoluteDiff.toLocaleString('de-DE', { signDisplay: 'always', minimumFractionDigits: 2 })} {getCurrencySymbol(priceComparison.currency)}
                                                    ({priceComparison.percentageDiff.toLocaleString('de-DE', { signDisplay: 'always', minimumFractionDigits: 1 })}%)
                                                </Typography>
                                            </Box>
                                        )}
                                    </Box>

<Box sx={{ height: 120, width: '100%', mt: 'auto' }}> {/* Höhe leicht erhöht für Labels */}
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart 
                                                data={rawData} 
                                                // Unten Platz für die Jahreszahlen schaffen (bottom: 20)
                                                margin={{ top: 0, right: 0, left: 0, bottom: 20 }} 
                                            >
                                                <RechartsTooltip 
                                                    cursor={{ fill: theme.palette.action.hover }}
                                                    contentStyle={{ borderRadius: 8, border: 'none', boxShadow: theme.shadows[2] }}
                                                    formatter={(value: number) => [`${value} ${getCurrencySymbol(rawData[0]?.currency)}`, 'Preis']}
                                                />
                                                {/* KORREKTUR: X-Achse sichtbar gemacht und gestylt */}
                                                <XAxis 
                                                    dataKey="year" 
                                                    axisLine={false} 
                                                    tickLine={false} 
                                                    tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
                                                    dy={10} // Abstand nach unten
                                                />
                                                <Bar 
                                                    dataKey="price" 
                                                    onClick={(data) => setSelectedYear(data.year)} 
                                                    cursor="pointer"
                                                    radius={[4, 4, 0, 0]} 
                                                >
                                                    {rawData.map((entry, index) => (
                                                        <Cell 
                                                            key={`cell-${index}`} 
                                                            fill={entry.year === selectedYear ? theme.palette.primary.main : theme.palette.action.disabled} 
                                                        />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                        {/* Den Text "Klicken für Historie" habe ich entfernt oder verkleinert, da die Jahre jetzt selbsterklärend sind */}
                                    </Box>
                                </>
                            ) : (
                                <Typography sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>Keine Preisdaten verfügbar.</Typography>
                            )}
                        </Box>
                        
                        <Box sx={{ mt: 1, textAlign: 'right' }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                Quelle:
                                <MuiLink href={providerUrl} target="_blank" rel="noopener noreferrer" onMouseDown={(e) => e.stopPropagation()}>
                                    {displayUrl}
                                </MuiLink>
                                {isTrusted && (
                                    <Tooltip title="Info zu geprüften Quellen">
                                        <IconButton
                                            size="small"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate('/trusted-sources');
                                            }}
                                            sx={{ p: 0, ml: 0.25 }}
                                        >
                                            <VerifiedUserIcon sx={{ fontSize: 14, color: 'success.main' }} />
                                        </IconButton>
                                    </Tooltip>
                                )}
                            </Typography>
                        </Box>
                    </Box>
                )}
            </Stack>
        </WidgetPaper>
    );
};

export default VignetteWidget;