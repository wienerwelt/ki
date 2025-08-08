import React, { useState, useEffect, useMemo } from 'react';
import { Box, Typography, CircularProgress, Alert, FormControl, Select, MenuItem, SelectChangeEvent, Link as MuiLink, Paper, Stack, Divider, Tooltip } from '@mui/material';
import apiClient from '../../apiClient';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';

// Icons
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PublicIcon from '@mui/icons-material/Public';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';

interface Region {
    code: string;
    name: string;
}

const getCurrencySymbol = (currencyCode: string | null): string => {
    if (currencyCode === 'EUR') return '€';
    if (currencyCode === 'CHF') return 'CHF';
    return currencyCode || '';
};

const VignetteWidget: React.FC<BaseWidgetProps> = ({ onDelete, widgetId, isRemovable }) => {
    const [availableCountries, setAvailableCountries] = useState<Region[]>([]);
    const [selectedCountry, setSelectedCountry] = useState('AT');
    const [rawData, setRawData] = useState<any[]>([]);
    const [systemInfo, setSystemInfo] = useState({ car: '', truck: '' });
    const [providerUrl, setProviderUrl] = useState<string>('#');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
                setRawData(response.data.chart_data || []);
                setSystemInfo({ car: response.data.vignette_system_car || 'N/A', truck: response.data.toll_system_truck || 'N/A' });
                setProviderUrl(response.data.provider_url || '#');
            } catch (err: any) {
                // === KORREKTUR: Fehlende Klammern im catch-Block hinzugefügt ===
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
    
    const priceComparison = useMemo(() => {
        const currentYearString = new Date().getFullYear().toString();
        const previousYearString = (new Date().getFullYear() - 1).toString();
        
        const currentData = rawData.find(d => d.year === currentYearString);
        const previousData = rawData.find(d => d.year === previousYearString);

        if (!currentData?.price || !previousData?.price) {
            return null;
        }

        const absoluteDiff = currentData.price - previousData.price;
        const percentageDiff = (absoluteDiff / previousData.price) * 100;
        
        return {
            currentPrice: currentData.price,
            previousPrice: previousData.price,
            absoluteDiff,
            percentageDiff,
            currency: currentData.currency || 'EUR'
        };
    }, [rawData]);

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
                    <ConfirmationNumberIcon />
                    <Typography variant="h6">Vignetten & Maut</Typography>
                </Box>
            }
            widgetTitle="Vignetten & Maut"
            widgetTypeKey="vignette-prices"
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
                        <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
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

                        <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', py: 2 }}>
                            {hasPriceData && priceComparison ? (
                                <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                                    <Typography variant="overline" color="text.secondary">Jahresvignette {new Date().getFullYear()}</Typography>
                                    <Typography variant="h3" component="div" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                                        {priceComparison.currentPrice.toLocaleString('de-DE')} {getCurrencySymbol(priceComparison.currency)}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                        vs. {priceComparison.previousPrice.toLocaleString('de-DE')} {getCurrencySymbol(priceComparison.currency)} im Vorjahr
                                    </Typography>
                                    <Box
                                        sx={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 1,
                                            mx: 'auto',
                                            px: 1.5,
                                            py: 0.5,
                                            borderRadius: '12px',
                                            bgcolor: 'action.hover',
                                            color: getTrendColor(priceComparison.absoluteDiff),
                                        }}
                                    >
                                        {getTrendIcon(priceComparison.absoluteDiff)}
                                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                            {priceComparison.absoluteDiff.toLocaleString('de-DE', { signDisplay: 'always' })} {getCurrencySymbol(priceComparison.currency)}
                                            ({priceComparison.percentageDiff.toLocaleString('de-DE', { signDisplay: 'always', minimumFractionDigits: 1 })}%)
                                        </Typography>
                                    </Box>
                                </Paper>
                            ) : (
                                <Typography sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>Keine Preisdaten für Jahresvignette verfügbar.</Typography>
                            )}
                        </Box>
                        
                        <Box sx={{ mt: 'auto', pt: 1, textAlign: 'right' }}>
                             <MuiLink href={providerUrl} target="_blank" rel="noopener noreferrer" onMouseDown={(e) => e.stopPropagation()} variant="caption" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                <PublicIcon sx={{ fontSize: '0.9rem' }} />
                                Offizielle Quelle: {displayUrl}
                            </MuiLink>
                        </Box>
                    </Box>
                )}
            </Stack>
        </WidgetPaper>
    );
};

export default VignetteWidget;