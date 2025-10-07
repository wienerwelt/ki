import React, { useMemo, useState, useEffect } from 'react';
import {
    Box, Typography, ToggleButton, ToggleButtonGroup, FormGroup,
    FormControlLabel, Checkbox, Paper, Link as MuiLink
} from '@mui/material';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { commoditiesConfig } from './CommoditiesConfig';

// --- Interfaces ---
interface ChartDataPoint { date: string; value: number; }
interface HistoricalData { [key: string]: ChartDataPoint[]; }
interface LatestData { [key: string]: { source: string; lastUpdate: string; }; }
interface CommodityChartProps {
    historicalData: HistoricalData | null;
    latestData: LatestData | null;
    timeframe: string;
    setTimeframe: (tf: string) => void;
}

// --- Hilfskomponenten (angepasst) ---
const CustomTooltip = ({ active, payload, label }: any, originalData: HistoricalData | null) => {
    if (active && payload && payload.length && originalData) {
        const date = new Date(label).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return (
            <Paper elevation={3} sx={{ p: 1.5, bgcolor: 'background.paper', minWidth: 150 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>{`Datum: ${date}`}</Typography>
                {payload.map((pld: any) => {
                    const config = commoditiesConfig[pld.dataKey];
                    const originalPoint = originalData[pld.dataKey]?.find(d => d.date === label);
                    if (!originalPoint) return null;

                    const formattedValue = new Intl.NumberFormat('de-DE', config.formatOptions).format(originalPoint.value);
                    return (
                        <Typography key={pld.dataKey} sx={{ color: pld.color, fontWeight: 'bold' }} variant="body2">
                            {`${config?.name || pld.dataKey}: ${formattedValue}`}
                        </Typography>
                    );
                })}
            </Paper>
        );
    }
    return null;
};

// --- Hauptkomponente (überarbeitet) ---
const CommodityChart: React.FC<CommodityChartProps> = ({ historicalData, latestData, timeframe, setTimeframe }) => {
    const [displayMode, setDisplayMode] = useState<'relative' | 'absolute'>('relative');
    const [selectedIndicators, setSelectedIndicators] = useState<string[]>([]);

    useEffect(() => {
        // Initiales Setzen der Indikatoren, wenn die Daten zum ersten Mal geladen werden.
        // Dies stellt sicher, dass die Auswahl beim Wechsel des Zeitraums erhalten bleibt.
        if (historicalData && selectedIndicators.length === 0) {
            setSelectedIndicators(Object.keys(historicalData));
        }
    }, [historicalData]);

    const handleIndicatorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = event.target;
        if (displayMode === 'absolute') {
            // Im Absolut-Modus ist nur eine Auswahl erlaubt
            setSelectedIndicators(checked ? [name] : []);
        } else {
            setSelectedIndicators(prev => checked ? [...prev, name] : prev.filter(item => item !== name));
        }
    };

    const handleDisplayModeChange = (_: React.MouseEvent<HTMLElement>, newMode: 'relative' | 'absolute') => {
        if (newMode) {
            setDisplayMode(newMode);
            // Wenn in den Absolut-Modus gewechselt wird und mehr als ein Indikator aktiv ist,
            // wird die Auswahl auf den ersten reduziert.
            if (newMode === 'absolute' && selectedIndicators.length > 1) {
                setSelectedIndicators(prev => [prev[0]]);
            }
        }
    };

    const processedData = useMemo(() => {
        if (!historicalData || selectedIndicators.length === 0) return [];

        if (displayMode === 'absolute') {
            const key = selectedIndicators[0];
            return historicalData[key]?.map(p => ({ date: p.date, [key]: p.value })) || [];
        }

        // Relative Darstellung
        const allDates = new Set<string>();
        selectedIndicators.forEach(key => historicalData[key]?.forEach(p => allDates.add(p.date)));
        const sortedDates = Array.from(allDates).sort();
        
        const firstValues: { [key: string]: number } = {};
        selectedIndicators.forEach(key => {
            firstValues[key] = historicalData[key]?.[0]?.value;
        });

        return sortedDates.map(date => {
            const entry: { [key: string]: any } = { date };
            selectedIndicators.forEach(key => {
                const point = historicalData[key]?.find(p => p.date === date);
                entry[key] = (point && firstValues[key]) ? ((point.value / firstValues[key]) - 1) * 100 : null;
            });
            return entry;
        });
    }, [historicalData, selectedIndicators, displayMode]);
    
    const activeIndicatorConfig = (displayMode === 'absolute' && selectedIndicators.length === 1) ? commoditiesConfig[selectedIndicators[0]] : null;
    const activeLatestData = (latestData && activeIndicatorConfig) ? latestData[selectedIndicators[0]] : null;

    if (!historicalData) return <Typography sx={{ textAlign: 'center', p: 2 }}>Lade historische Daten...</Typography>;

    return (
        <Box sx={{ width: '100%' }}>
            <FormGroup row sx={{ justifyContent: 'center', mb: 1, flexWrap: 'wrap' }}>
                {Object.keys(commoditiesConfig).map(key => historicalData[key] && (
                    <FormControlLabel
                        key={key}
                        control={<Checkbox checked={selectedIndicators.includes(key)} onChange={handleIndicatorChange} name={key} sx={{ color: commoditiesConfig[key]?.color, '&.Mui-checked': { color: commoditiesConfig[key]?.color } }} />}
                        label={commoditiesConfig[key]?.name || key}
                    />
                ))}
            </FormGroup>
            
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 2 }}>
                <ToggleButtonGroup value={timeframe} exclusive onChange={(_, val) => val && setTimeframe(val)} size="small">
                    <ToggleButton value="1M">1M</ToggleButton>
                    <ToggleButton value="6M">6M</ToggleButton>
                    <ToggleButton value="1Y">1J</ToggleButton>
                </ToggleButtonGroup>
                <ToggleButtonGroup value={displayMode} exclusive onChange={handleDisplayModeChange} size="small">
                    <ToggleButton value="relative">Relativ (%)</ToggleButton>
                    <ToggleButton value="absolute">Absolut</ToggleButton>
                </ToggleButtonGroup>
            </Box>
            
            {/* NEU: Anzeige für Quelle und Stand im Absolut-Modus */}
            {displayMode === 'absolute' && activeLatestData && (
                 <Typography variant="caption" color="text.secondary" textAlign="center" display="block">
                    Quelle: <MuiLink href="#" target="_blank" rel="noopener">{activeLatestData.source}</MuiLink> (Stand: {new Date(activeLatestData.lastUpdate).toLocaleDateString('de-DE')})
                </Typography>
            )}

            <Box sx={{ height: 350, mt: 1 }}>
                <ResponsiveContainer>
                    <LineChart data={processedData} margin={{ top: 5, right: 20, left: 15, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tickFormatter={date => new Date(date).toLocaleDateString('de-DE', { month: 'short' })} interval="preserveStartEnd" />
                        <YAxis
                            tickFormatter={activeIndicatorConfig ? (val) => new Intl.NumberFormat('de-DE', { ...activeIndicatorConfig.formatOptions, style: 'decimal', currency: undefined }).format(val) : (val) => `${Number(val).toFixed(0)}%`}
                            label={{ value: activeIndicatorConfig ? activeIndicatorConfig.unit : 'Veränderung in %', angle: -90, position: 'insideLeft' }}
                            domain={['auto', 'auto']} width={70}
                        />
                        <Tooltip content={(props) => CustomTooltip(props, historicalData)} />
                        {selectedIndicators.map(key => (
                            <Line key={key} type="monotone" dataKey={key} stroke={commoditiesConfig[key]?.color || '#000'} strokeWidth={2} dot={false} connectNulls />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </Box>
        </Box>
    );
};

export default CommodityChart;