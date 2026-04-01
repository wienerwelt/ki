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
import { commoditiesConfig } from '../CommoditiesConfig';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';


interface CommodityPricesWidgetProps extends Partial<BaseWidgetProps> {
    icon?: React.ReactNode;
    title: string;
    widgetTypeKey: string;
    widgetId: string;
    isPublic?: boolean;
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
    'ecb.europa.eu': 'https://www.ecb.europa.eu/',
    'commodities-api.com': 'https://commodities-api.com/',
    'statistik.at': 'https://www.statistik.at/',
    'tradingeconomics.com': 'https://tradingeconomics.com/',
};

// --- Helper Components ---
const TrendIndicator: React.FC<{ trend: 'up' | 'down' | 'stable' }> = ({ trend }) => {
    if (trend === 'up') return <ArrowUpwardIcon color="success" sx={{ fontSize: '1.2rem' }} />;
    if (trend === 'down') return <ArrowDownwardIcon color="error" sx={{ fontSize: '1.2rem' }} />;
    return <TrendingFlatIcon color="action" sx={{ fontSize: '1.2rem' }} />;
};

const CommodityItem: React.FC<{ indicatorKey: string; data: CommodityData; isPublic?: boolean }> = ({ indicatorKey, data, isPublic }) => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const displayInfo = commoditiesConfig[indicatorKey] || { name: indicatorKey, formatOptions: { style: 'decimal' } };
    const sourceUrl = sourceUrls[data.source] || '#';

    const flagCode = data.countryCode ? data.countryCode.toLowerCase() : 'eu';
    const flagUrl = `https://flagcdn.com/w20/${flagCode}.png`;

    const formatPrice = (price: number | null | undefined) => {
        if (price == null) return 'N/A';
        if (data.unit === '%') {
            return `${price.toLocaleString(i18n.language, displayInfo.formatOptions)}%`;
        }
        return new Intl.NumberFormat(i18n.language, displayInfo.formatOptions).format(price);
    };

    return (
        <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'transparent' }}>
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
                <Tooltip title={t('widgets.commodities.trendTooltip')}>
                    <Box sx={{ alignSelf: 'center' }}>
                        <TrendIndicator trend={data.trend} />
                    </Box>
                </Tooltip>
            </Box>
            <Typography variant="caption" color="text.secondary">
                {data.unit !== '%' ? `${t('widgets.commodities.perUnit')} ${data.unit}` : t('widgets.commodities.interestRate')}
            </Typography>
            
            <Divider sx={{ my: 1.5 }} />

            <Stack spacing={0.5} sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">{t('widgets.commodities.weekAgo')}:</Typography>
                    <Typography variant="body2">{formatPrice(data.historical.weekAgo)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">{t('widgets.commodities.monthAgo')}:</Typography>
                    <Typography variant="body2">{formatPrice(data.historical.monthAgo)}</Typography>
                </Box>
            </Stack>

            <Box sx={{ textAlign: 'center', mt: 1 }}>
                <Typography variant="caption" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    {t('widgets.commodities.source')}: <MuiLink href={isPublic ? undefined : sourceUrl} target={isPublic ? undefined : "_blank"} rel="noopener" sx={{ cursor: isPublic ? 'default' : 'pointer', textDecoration: isPublic ? 'none' : 'underline' }}>{data.source}</MuiLink>
                    {data.is_trusted_source && !isPublic && (
                        <Tooltip title={t('widgets.commodities.trustedTooltip')}>
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
            </Box>
        </Paper>
    );
};

// --- Hauptkomponente ---
const CommodityPricesWidget: React.FC<CommodityPricesWidgetProps> = ({ 
    onDelete, widgetId, isRemovable, icon, title, widgetTypeKey, isPublic = false 
}) => {
    const { t } = useTranslation();
    const [data, setData] = useState<ApiData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const [viewMode, setViewMode] = useState<'cards' | 'chart'>('cards');
    const [chartData, setChartData] = useState(null);
    const [chartTimeframe, setChartTimeframe] = useState('6M');
    const [isChartLoading, setIsChartLoading] = useState(false);

    // Daten laden (Mock oder API)
// Daten laden (Dynamisch: Public-Wrapper oder geschützte API)
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            setError(null);

            try {
                // 1. Pfad wählen: Public-Wrapper für Landingpage, sonst geschützte Route
                const endpoint = isPublic ? '/api/public/commodities' : '/api/data/commodities';
                
                // 2. Auth-Header nur setzen, wenn wir nicht im Public-Mode sind
                const config = !isPublic ? {
                    headers: { 'x-auth-token': localStorage.getItem('jwt_token') }
                } : {};

                const response = await apiClient.get(endpoint, config);

                if (response.data.ok) {
                    setData(response.data.data);
                } else {
                    throw new Error(response.data.message || t('widgets.commodities.errorLoad'));
                }
            } catch (err: any) {
                console.error('Fehler beim Laden der Commodities:', err);
                setError(err?.response?.data?.message || t('widgets.commodities.errorGeneral'));
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [isPublic, t]);

    // Chart Daten laden
    useEffect(() => {
        if (isPublic || viewMode !== 'chart') return;

        const fetchChartData = async () => {
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
                   throw new Error(response.data.message || t('widgets.commodities.errorHistory'));
                }
            } catch (err: any) {
                setError(err?.response?.data?.message || t('widgets.commodities.errorHistory'));
            } finally {
                setIsChartLoading(false);
            }
        };
        fetchChartData();
    }, [viewMode, chartTimeframe, isPublic, t]);

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
        const order = ['BRENT_OIL', 'EUR_USD', 'EURIBOR_3M', 'SWAP_10Y', 'CO2_PRICE', 'KVLPI_GESAMT'];
        return order.indexOf(keyA) - order.indexOf(keyB);
    }) : [];

    // Finde das aktuellste Datum für die Footer-Anzeige
    const latestUpdate = data ? Object.values(data).reduce((latest, item) => {
        const itemDate = new Date(item.lastUpdate);
        return itemDate > latest ? itemDate : latest;
    }, new Date(0)) : null;

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
            isPublic={isPublic}
        >
            {!isPublic && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1, mt: -1 }}>
                     <ToggleButtonGroup
                        value={viewMode}
                        exclusive
                        onChange={handleViewChange}
                        aria-label="Ansicht wechseln"
                        size="small"
                    >
                        <ToggleButton value="cards" aria-label="Kartenansicht">
                            <Tooltip title={t('widgets.commodities.viewCards')}>
                                <ViewModuleIcon />
                            </Tooltip>
                        </ToggleButton>
                        <ToggleButton value="chart" aria-label="Grafikansicht">
                            <Tooltip title={t('widgets.commodities.viewChart')}>
                                <ShowChartIcon />
                            </Tooltip>
                        </ToggleButton>
                    </ToggleButtonGroup>
                </Box>
            )}

            {error && (
                 <Alert
                    severity="error"
                    action={!isPublic && (
                        <Button color="inherit" size="small" onClick={handleReportError} startIcon={<ReportProblemOutlinedIcon />}>
                            {t('widgets.commodities.reportError')}
                        </Button>
                    )}
                >
                    {error}
                </Alert>
            )}

            {(viewMode === 'cards' || isPublic) && (
                <>
                    {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>}
                    {!isLoading && !error && sortedDataEntries.length > 0 ? (
                        <>
                            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 2 }}>
                                {sortedDataEntries.map(([key, value]) => (
                                <CommodityItem key={key} indicatorKey={key} data={value} isPublic={isPublic} />
                                ))}
                            </Box>
                            
                            {/* NEU: Zeitstempel-Footer */}
                            {latestUpdate && latestUpdate.getTime() > 0 && (
                                <Box sx={{ mt: 2, textAlign: 'right' }}>
                                    <Typography variant="caption" color="text.secondary">
                                        {t('widgets.commodities.lastUpdate')}: {format(latestUpdate, 'dd.MM.yyyy HH:mm')}
                                    </Typography>
                                </Box>
                            )}
                        </>
                    ) : (
                        !isLoading && !error && <Typography sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>{t('widgets.commodities.noData')}</Typography>
                    )}
                </>
            )}
            
            {viewMode === 'chart' && !isPublic && (
                <>
                    {!error && (
                        <CommodityChart 
                            historicalData={chartData} 
                            latestData={data}
                            timeframe={chartTimeframe}
                            setTimeframe={setChartTimeframe}
                            isLoading={isChartLoading}
                        />
                    )}
                </>
            )}
            
        </WidgetPaper>
    );
};

export default CommodityPricesWidget;