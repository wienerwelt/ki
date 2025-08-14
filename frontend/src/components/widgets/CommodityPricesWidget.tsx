import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Alert, Divider, Link as MuiLink,
    Stack, Tooltip, Paper, Button
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import PublicIcon from '@mui/icons-material/Public';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';

import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';

// --- Interfaces & Mappings ---

interface CommodityPricesWidgetProps extends BaseWidgetProps {
    icon?: React.ReactNode;
    title: string;
    widgetTypeKey: string;
}

interface HistoricalData {
    weekAgo?: number | null;
    monthAgo?: number | null;
    yearAgo?: number | null;
}

interface CommodityData {
    currentPrice: number;
    unit: string;
    lastUpdate: string;
    source: string;
    trend: 'up' | 'down' | 'stable';
    historical: HistoricalData;
}

interface ApiData {
    [key: string]: CommodityData;
}

const indicatorDisplayInfo: { [key: string]: { name: string; formatOptions: Intl.NumberFormatOptions } } = {
    'BRENT_OIL': { name: 'Brent Rohöl', formatOptions: { style: 'currency', currency: 'USD', minimumFractionDigits: 2 } },
    'EUR_USD': { name: 'Wechselkurs EUR/USD', formatOptions: { style: 'currency', currency: 'USD', minimumFractionDigits: 4 } },
    'EURIBOR_3M': { name: 'Euribor 3M', formatOptions: { style: 'decimal', minimumFractionDigits: 3, maximumFractionDigits: 3 } },
    'CO2_PRICE': { name: 'CO2-Emissionspreis', formatOptions: { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 } },
    'NICKEL': { name: 'Nickel', formatOptions: { style: 'currency', currency: 'USD', minimumFractionDigits: 0 } },
    'COBALT': { name: 'Kobalt', formatOptions: { style: 'currency', currency: 'USD', minimumFractionDigits: 0 } },
};

const sourceUrls: { [key: string]: string } = {
    'oilpriceapi.com': 'https://oilpriceapi.com/',
    'metalpriceapi.com': 'https://metalpriceapi.com/',
    'ecb.europa.eu': 'https://www.ecb.europa.eu/stats/financial_markets_and_interest_rates/euro_area_yield_curves/html/index.en.html',
    'commodities-api.com': 'https://commodities-api.com/',
};

// --- Hilfskomponenten ---
const TrendIndicator: React.FC<{ trend: 'up' | 'down' | 'stable' }> = ({ trend }) => {
    if (trend === 'up') return <ArrowUpwardIcon color="success" sx={{ fontSize: '1.2rem' }} />;
    if (trend === 'down') return <ArrowDownwardIcon color="error" sx={{ fontSize: '1.2rem' }} />;
    return <TrendingFlatIcon color="action" sx={{ fontSize: '1.2rem' }} />;
};

const CommodityItem: React.FC<{ indicatorKey: string; data: CommodityData }> = ({ indicatorKey, data }) => {
    const displayInfo = indicatorDisplayInfo[indicatorKey] || { name: indicatorKey, formatOptions: { style: 'decimal' } };
    const sourceUrl = sourceUrls[data.source] || '#';

    const formatPrice = (price: number | null | undefined) => {
        if (price == null) return 'N/A';
        if (data.unit === '%') {
            return `${price.toLocaleString('de-DE', displayInfo.formatOptions)}%`;
        }
        return new Intl.NumberFormat('de-DE', displayInfo.formatOptions).format(price);
    };

    return (
        <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>{displayInfo.name}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 1 }}>
                <Typography variant="h4">{formatPrice(data.currentPrice)}</Typography>
                <Tooltip title={`Trend seit letzter Woche`}>
                    <Box sx={{ alignSelf: 'center' }}>
                        <TrendIndicator trend={data.trend} />
                    </Box>
                </Tooltip>
            </Box>
            <Typography variant="caption" color="text.secondary">
                {data.unit !== '%' ? `pro ${data.unit}` : 'Zinssatz'}
            </Typography>
            
            <Divider sx={{ my: 1.5 }} />

            <Stack spacing={0.5} sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">-1 Woche:</Typography>
                    <Typography variant="body2">{formatPrice(data.historical.weekAgo)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">-1 Monat:</Typography>
                    <Typography variant="body2">{formatPrice(data.historical.monthAgo)}</Typography>
                </Box>
                {/* === NEU: Zeigt den Jahreswert nur an, wenn er existiert === */}
                {data.historical.yearAgo != null && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">-1 Jahr:</Typography>
                        <Typography variant="body2">{formatPrice(data.historical.yearAgo)}</Typography>
                    </Box>
                )}
            </Stack>

            <Box sx={{ mt: 2, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="caption">
                    Quelle: <MuiLink href={sourceUrl} target="_blank" rel="noopener">{data.source}</MuiLink> (Stand: {new Date(data.lastUpdate).toLocaleDateString('de-DE')})
                </Typography>
            </Box>
        </Paper>
    );
};

// --- Hauptkomponente ---
const CommodityPricesWidget: React.FC<CommodityPricesWidgetProps> = ({ onDelete, widgetId, isRemovable, icon, title, widgetTypeKey }) => {
    const [data, setData] = useState<ApiData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const token = localStorage.getItem('jwt_token');
                const response = await apiClient.get('/api/data/commodities', { headers: { 'x-auth-token': token } });
                if (response.data.ok) {
                    setData(response.data.data);
                } else {
                    throw new Error(response.data.message || 'Daten konnten nicht geladen werden.');
                }
            } catch (err: any) {
                setError(err?.response?.data?.message || 'Ein Fehler ist aufgetreten.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleReportError = () => {
        navigate('/feedback', {
            state: {
                type: 'bug',
                widget: title,
                error: error,
                widgetKey: widgetTypeKey
            }
        });
    };

    const sortedDataEntries = data ? Object.entries(data).sort(([keyA], [keyB]) => {
        const order = ['BRENT_OIL', 'EUR_USD', 'EURIBOR_3M', 'CO2_PRICE'];
        return order.indexOf(keyA) - order.indexOf(keyB);
    }) : [];

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
        >
            {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>}

            {error && (
                 <Alert
                    severity="error"
                    action={
                        <Button 
                            color="inherit" 
                            size="small" 
                            onClick={handleReportError}
                            startIcon={<ReportProblemOutlinedIcon />}
                        >
                            Fehler Melden
                        </Button>
                    }
                >
                    {error}
                </Alert>
            )}

            {!isLoading && !error && sortedDataEntries.length > 0 ? (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 2, height: '100%' }}>
                    {sortedDataEntries.map(([key, value]) => (
                       <CommodityItem key={key} indicatorKey={key} data={value} />
                    ))}
                </Box>
            ) : (
                !isLoading && !error && <Typography sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>Keine Daten verfügbar.</Typography>
            )}
        </WidgetPaper>
    );
};

export default CommodityPricesWidget;
