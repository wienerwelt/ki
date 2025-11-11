import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Alert, Divider, Link as MuiLink,
    Stack, Tooltip, Paper, Button, ToggleButton, ToggleButtonGroup, IconButton
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';

import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import CommodityChart from '../CommodityChart';
// ANGEPASST: Korrekter Import-Pfad und Name für die Konfigurationsdatei
import { commoditiesConfig } from '../CommoditiesConfig';

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
    countryCode?: string | null;
    is_trusted_source: boolean;
    historical: HistoricalData;
}

interface ApiData {
    [key: string]: CommodityData;
}

const sourceUrls: { [key: string]: string } = {
    'oilpriceapi.com': 'https://oilpriceapi.com/',
    'metalpriceapi.com': 'https://metalpriceapi.com/',
    'ecb.europa.eu': 'https://www.ecb.europa.eu/stats/financial_markets_and_interest_rates/money_market/html/index.en.html',
    'commodities-api.com': 'https://commodities-api.com/',
    'statistik.at': 'https://www.statistik.at/statistiken/volkswirtschaft-und-oeffentliche-finanzen/preise-und-preisindizes/kraftfahrzeughaftpflicht-versicherungsleistungspreisindex-kvlpi',
    'tradingeconomics.com': 'https://tradingeconomics.com/commodity/carbon',
};

// --- Hilfskomponenten ---
const TrendIndicator: React.FC<{ trend: 'up' | 'down' | 'stable' }> = ({ trend }) => {
    if (trend === 'up') return <ArrowUpwardIcon color="success" sx={{ fontSize: '1.2rem' }} />;
    if (trend === 'down') return <ArrowDownwardIcon color="error" sx={{ fontSize: '1.2rem' }} />;
    return <TrendingFlatIcon color="action" sx={{ fontSize: '1.2rem' }} />;
};

const CommodityItem: React.FC<{ indicatorKey: string; data: CommodityData }> = ({ indicatorKey, data }) => {
    const navigate = useNavigate();
    const displayInfo = commoditiesConfig[indicatorKey] || { name: indicatorKey, formatOptions: { style: 'decimal' } };
    const sourceUrl = sourceUrls[data.source] || '#';

    const flagCode = data.countryCode ? data.countryCode.toLowerCase() : 'eu';
    const flagUrl = `https://flagcdn.com/w20/${flagCode}.png`; // 20px breite Flagge
    // -----------------------------    

    const formatPrice = (price: number | null | undefined) => {
        if (price == null) return 'N/A';
        if (data.unit === '%') {
            return `${price.toLocaleString('de-DE', displayInfo.formatOptions)}%`;
        }
        return new Intl.NumberFormat('de-DE', displayInfo.formatOptions).format(price);
    };

    return (
        <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <img 
                    src={flagUrl} 
                    width="20" 
                    alt={`${flagCode} flag`} 
                    style={{ borderRadius: '2px', boxShadow: '0 0 1px rgba(0,0,0,0.5)' }}
                />
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                    {displayInfo.name}
                </Typography>
            </Box>
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
                {data.historical.yearAgo != null && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">-1 Jahr:</Typography>
                        <Typography variant="body2">{formatPrice(data.historical.yearAgo)}</Typography>
                    </Box>
                )}
            </Stack>

<Box sx={{ textAlign: 'center' }}>
    <Typography variant="caption" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        Quelle: <MuiLink href={sourceUrl} target="_blank" rel="noopener">{data.source}</MuiLink>
        {data.is_trusted_source && (
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
    <Typography variant="caption" sx={{ display: 'block' }}>
        (Stand: {new Date(data.lastUpdate).toLocaleDateString('de-DE')})
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

    const [viewMode, setViewMode] = useState<'cards' | 'chart'>('cards');
    const [chartData, setChartData] = useState(null);
    const [chartTimeframe, setChartTimeframe] = useState('6M');
    const [isChartLoading, setIsChartLoading] = useState(false);

    // useEffect zum Laden der Kartendaten
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

    // useEffect zum Laden der Chart-Daten
    useEffect(() => {
        const fetchChartData = async () => {
            if (viewMode === 'chart') {
                setIsChartLoading(true);
                setError(null);
                try {
                    const token = localStorage.getItem('jwt_token');
                    const response = await apiClient.get(`/api/data/commodities/history?timeframe=${chartTimeframe}`, {
                        headers: { 'x-auth-token': token },
                    });
                    if (response.data.ok) {
                        setChartData(response.data.data);
                    } else {
                       throw new Error(response.data.message || 'Historische Daten konnten nicht geladen werden.');
                    }
                } catch (err: any) {
                    setError(err?.response?.data?.message || 'Historische Daten konnten nicht geladen werden.');
                } finally {
                    setIsChartLoading(false);
                }
            }
        };
        fetchChartData();
    }, [viewMode, chartTimeframe]);

    const handleReportError = () => {
        navigate('/feedback', {
            state: { type: 'bug', widget: title, error: error, widgetKey: widgetTypeKey }
        });
    };
    
    const handleViewChange = (_event: React.MouseEvent<HTMLElement>, newView: 'cards' | 'chart') => {
        if (newView !== null) {
            setViewMode(newView);
        }
    };

    const sortedDataEntries = data ? Object.entries(data).sort(([keyA], [keyB]) => {
        const order = ['BRENT_OIL', 'EUR_USD', 'EURIBOR_3M', 'CO2_PRICE', 'KVLPI_GESAMT'];
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
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1, mt: -1 }}>
                 <ToggleButtonGroup
                    value={viewMode}
                    exclusive
                    onChange={handleViewChange}
                    aria-label="Ansicht wechseln"
                    size="small"
                >
                    <ToggleButton value="cards" aria-label="Kartenansicht">
                        <Tooltip title="Kartenansicht">
                            <ViewModuleIcon />
                        </Tooltip>
                    </ToggleButton>
                    <ToggleButton value="chart" aria-label="Grafikansicht">
                        <Tooltip title="Grafikansicht">
                            <ShowChartIcon />
                        </Tooltip>
                    </ToggleButton>
                </ToggleButtonGroup>
            </Box>

            {error && (
                 <Alert
                    severity="error"
                    action={
                        <Button color="inherit" size="small" onClick={handleReportError} startIcon={<ReportProblemOutlinedIcon />}>
                            Fehler Melden
                        </Button>
                    }
                >
                    {error}
                </Alert>
            )}

            {viewMode === 'cards' && (
                <>
                    {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>}
                    {!isLoading && !error && sortedDataEntries.length > 0 ? (
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 2 }}>
                            {sortedDataEntries.map(([key, value]) => (
                               <CommodityItem key={key} indicatorKey={key} data={value} />
                            ))}
                        </Box>
                    ) : (
                        !isLoading && !error && <Typography sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>Keine Daten verfügbar.</Typography>
                    )}
                </>
            )}
            
            {viewMode === 'chart' && (
                <>
                    {/* KORREKTUR: Die Lade-Logik (CircularProgress) wird entfernt 
                      und an die CommodityChart-Komponente übergeben, 
                      die jetzt ein Skeleton anzeigt.
                    */}
                    {!error && (
                        <CommodityChart 
                            historicalData={chartData} 
                            latestData={data}
                            timeframe={chartTimeframe}
                            setTimeframe={setChartTimeframe}
                            isLoading={isChartLoading} // NEU: isLoading-Prop übergeben
                        />
                    )}
                </>
            )}
            
        </WidgetPaper>
    );
};

export default CommodityPricesWidget;