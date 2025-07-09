import React, { useState, useEffect, useMemo } from 'react';
import { Box, Typography, CircularProgress, Alert, FormControl, Select, MenuItem, SelectChangeEvent, Link as MuiLink } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelProps, Cell } from 'recharts';
import apiClient from '../../apiClient';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';

const VIGNETTE_COUNTRIES = [
    { code: 'AT', name: 'Österreich' },
    { code: 'BE', name: 'Belgien' },
    { code: 'CH', name: 'Schweiz' },
    { code: 'CZ', name: 'Tschechien' },
    { code: 'DE', name: 'Deutschland' },
    { code: 'DK', name: 'Dänemark' },
    { code: 'FR', name: 'Frankreich' },
    { code: 'HR', name: 'Kroatien' },
    { code: 'HU', name: 'Ungarn' },
    { code: 'IT', name: 'Italien' },
    { code: 'LI', name: 'Liechtenstein' },
    { code: 'LU', name: 'Luxemburg' },
    { code: 'NL', name: 'Niederlande' },
    { code: 'PL', name: 'Polen' },
    { code: 'RO', name: 'Rumänien' },
    { code: 'SI', name: 'Slowenien' },
    { code: 'SK', name: 'Slowakei' },
];

const getCurrencySymbol = (currencyCode: string | null): string => {
    if (currencyCode === 'EUR') return '€';
    if (currencyCode === 'CHF') return 'CHF';
    return currencyCode || '';
}

const CustomBarLabel: React.FC<LabelProps & { currency: string; percentageDiff?: number }> = (props) => {
    const { x, y, width, height, value, currency, percentageDiff } = props;
    if (x == null || y == null || width == null || height == null || value == null) return null;
    const numX = Number(x), numY = Number(y), numHeight = Number(height), numWidth = Number(width), numValue = Number(value);
    if (numHeight < 25) return null; 
    const yPos = numY + numHeight / 2;
    const xPos = numX + numWidth / 2;

    return (
        <g>
            <text x={xPos} y={yPos - (percentageDiff ? 7 : 0)} fill="#fff" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight="bold">
                {`${numValue.toLocaleString('de-DE')} ${getCurrencySymbol(currency)}`}
            </text>
            {percentageDiff != null && (
                <text x={xPos} y={yPos + 9} fill="#fff" textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="500">
                    ({percentageDiff > 0 ? '+' : ''}{percentageDiff.toFixed(1)}%)
                </text>
            )}
        </g>
    );
};

const VignetteWidget: React.FC<BaseWidgetProps> = ({ onDelete, widgetId, isRemovable }) => {
    const [selectedCountry, setSelectedCountry] = useState('AT');
    const [rawData, setRawData] = useState<any[]>([]);
    const [systemInfo, setSystemInfo] = useState({ car: '', truck: '' });
    const [countryName, setCountryName] = useState('Österreich');
    const [providerUrl, setProviderUrl] = useState<string>('#');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchVignetteData = async () => {
            if (!selectedCountry) return;
            setIsLoading(true);
            setError(null);
            try {
                const token = localStorage.getItem('jwt_token');
                const response = await apiClient.get(`/api/data/vignettes?country=${selectedCountry}`, { headers: { 'x-auth-token': token } });
                setRawData(response.data.chart_data || []);
                setSystemInfo({ car: response.data.vignette_system_car || 'N/A', truck: response.data.toll_system_truck || 'N/A' });
                setCountryName(response.data.country_name);
                setProviderUrl(response.data.provider_url || '#');
            } catch (err: any) {
                setError(err.response?.data?.message || 'Daten konnten nicht geladen werden.');
                setRawData([]);
                setSystemInfo({ car: '-', truck: '-' });
                setProviderUrl('#');
            } finally {
                setIsLoading(false);
            }
        };
        fetchVignetteData();
    }, [selectedCountry]);

    const handleCountryChange = (event: SelectChangeEvent<string>) => {
        setSelectedCountry(event.target.value);
    };

    const processedChartData = useMemo(() => {
        const currentYearString = new Date().getFullYear().toString();
        const previousYearString = (new Date().getFullYear() - 1).toString();
        const currentYearData = rawData.find(d => d.year === currentYearString);
        const previousYearData = rawData.find(d => d.year === previousYearString);
        let dataWithDiff = rawData;
        if (currentYearData?.price && previousYearData?.price) {
            const diff = ((currentYearData.price - previousYearData.price) / previousYearData.price) * 100;
            dataWithDiff = rawData.map(d => d.year === currentYearString ? { ...d, percentageDiff: diff } : d);
        }
        return dataWithDiff.sort((a, b) => Number(b.year) - Number(a.year));
    }, [rawData]);

    const hasPriceData = processedChartData.some(d => d.price !== null);
    const currency = hasPriceData ? processedChartData.find(d => d.price !== null)?.currency || 'EUR' : 'EUR';
    const flagCode = selectedCountry.toLowerCase();

    // NEU: Bereinigt die URL für die Anzeige
    const displayUrl = providerUrl
        .replace(/^(?:https?:\/\/)?(?:www\.)?/i, '') // Entfernt http, https, www
        .replace(/\/$/, ''); // Entfernt einen Schrägstrich am Ende

    return (
        <WidgetPaper title="Vignetten- & Mautsysteme" widgetId={widgetId} onDelete={onDelete} isRemovable={isRemovable} loading={isLoading} error={error}>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <Select value={selectedCountry} onChange={handleCountryChange} onMouseDown={(e) => e.stopPropagation()}>
                    {VIGNETTE_COUNTRIES.map(c => ( <MenuItem key={c.code} value={c.code}>{c.name}</MenuItem> ))}
                </Select>
            </FormControl>

            {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress /></Box>}
            {error && <Alert severity="error" sx={{ m: 1 }}>{error}</Alert>}
            
            {!isLoading && !error && (
                <Box>
                    <Box sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                        <Typography variant="body2"><strong>PKW/Motorrad (bis 3,5t):</strong> {systemInfo.car}</Typography>
                        <Typography variant="body2" sx={{mt: 0.5}}><strong>LKW (mehr 3,5t):</strong> {systemInfo.truck}</Typography>
                    </Box>

                    {hasPriceData ? (
                        <>
                            {/* KORREKTUR: Überschrift wird zentriert */}
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>PKW/Motorrad Jahresvignette</Typography>
                                <img src={`https://flagcdn.com/w20/${flagCode}.png`} width="18" height="12" alt={`Flagge ${countryName}`} />
                            </Box>
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={processedChartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="year" />
                                    <YAxis unit={getCurrencySymbol(currency)} />
                                    <Tooltip formatter={(value: number) => `${value.toLocaleString('de-DE')} ${getCurrencySymbol(currency)}`} />
                                    <Bar dataKey="price" label={<CustomBarLabel currency={currency} />}>
                                        {processedChartData.map((entry) => (
                                            <Cell 
                                                key={`cell-${entry.year}`} 
                                                fill={entry.year === new Date().getFullYear().toString() ? '#8884d8' : '#a9a9a9'} 
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </>
                    ) : (
                        <Typography sx={{p: 2, textAlign: 'center'}}>Keine Preisdaten für Jahresvignette verfügbar.</Typography>
                    )}
                    
                    <Typography variant="caption" sx={{ mt: 1, display: 'block', textAlign: 'right' }}>
                        {/* KORREKTUR: Link-Text zeigt die bereinigte URL an */}
                        Quelle: <MuiLink href={providerUrl} target="_blank" rel="noopener noreferrer" onMouseDown={(e) => e.stopPropagation()}>{displayUrl}</MuiLink>
                    </Typography>
                </Box>
            )}
        </WidgetPaper>
    );
};

export default VignetteWidget;