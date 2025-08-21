import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
    Box, Typography, ToggleButton, ToggleButtonGroup, FormGroup,
    FormControlLabel, Checkbox, Paper
} from '@mui/material';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { commoditiesConfig, CommodityConfig } from './CommoditiesConfig';

// --- Hilfskomponenten ---

const CustomizedLastPointLabel = (props: any) => {
    const { x, y, stroke, value, dataKey, index, data, isSingleMode, originalData } = props;

    if (index !== data.length - 1 || value === null || value === undefined) {
        return null;
    }

    let displayValue = '';
    let percentageChangeText = '';
    const config = commoditiesConfig[dataKey]; // Hole die Konfiguration

    // FEHLERBEHEBUNG: Prüfe, ob eine Konfiguration existiert, bevor sie verwendet wird
    if (!config) {
        // Fallback, wenn keine Konfiguration gefunden wird, um Absturz zu verhindern
        displayValue = typeof value === 'number' ? value.toFixed(2) : ''; 
    } else if (isSingleMode) {
        const series = originalData[dataKey];
        const firstValue = series?.[0]?.value;
        const lastValue = series?.[series.length - 1]?.value;

        if (typeof firstValue === 'number' && typeof lastValue === 'number' && firstValue !== 0) {
            const percentageChange = ((lastValue / firstValue) - 1) * 100;
            percentageChangeText = ` (${percentageChange.toFixed(1)}%)`;
        }
        displayValue = new Intl.NumberFormat('de-DE', config.formatOptions).format(value);
    } else {
        displayValue = `${value.toFixed(1)}%`;
    }

    return (
        <text x={x} y={y} dy={-8} fill={stroke} fontSize={12} textAnchor="middle">
            {displayValue}{percentageChangeText}
        </text>
    );
};


const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const date = new Date(label).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

        return (
            <Paper elevation={3} sx={{ p: 1.5, bgcolor: 'background.paper' }}>
                <Typography variant="body2" sx={{ mb: 1 }}>{`Datum: ${date}`}</Typography>
                {payload.map((pld: any) => {
                    const config: CommodityConfig | undefined = commoditiesConfig[pld.dataKey];
                    if (pld.value === null || pld.value === undefined) return null;
                    
                    const value = pld.value;
                    const isNormalized = typeof value === 'number' && pld.unit === '%';
                    
                    // Fallback, falls keine Konfiguration für den Tooltip vorhanden ist
                    const formattedValue = config 
                        ? (isNormalized 
                            ? `${value.toFixed(2)}%`
                            : new Intl.NumberFormat('de-DE', config.formatOptions).format(value))
                        : value.toString();

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

// --- Hauptkomponente ---

const CommodityChart: React.FC<{ data: any; timeframe: string; setTimeframe: (tf: string) => void; }> = ({ data, timeframe, setTimeframe }) => {
    const [selectedIndicators, setSelectedIndicators] = useState<string[]>([]);
    const initialLoadDone = useRef(false);

    useEffect(() => {
        if (data && !initialLoadDone.current) {
            setSelectedIndicators(Object.keys(data));
            initialLoadDone.current = true;
        }
    }, [data]);

    const processedData = useMemo(() => {
        if (!data || Object.keys(data).length === 0) return [];
        const isSingleMode = selectedIndicators.length === 1;

        if (isSingleMode) {
            const singleKey = selectedIndicators[0];
            if (!data[singleKey]) return []; // Sicherstellen, dass die Daten existieren
            return data[singleKey].map((p: any) => ({ date: p.date, [singleKey]: p.value }));
        }

        const allDates = new Set<string>();
        selectedIndicators.forEach(key => data[key]?.forEach((p: any) => allDates.add(p.date)));
        const sortedDates = Array.from(allDates).sort();
        const firstValues: { [key: string]: number } = {};
        selectedIndicators.forEach(key => {
            firstValues[key] = data[key]?.[0]?.value;
        });

        return sortedDates.map(date => {
            const entry: { [key: string]: string | number | null } = { date };
            selectedIndicators.forEach(key => {
                const point = data[key]?.find((p: any) => p.date === date);
                entry[key] = (point && firstValues[key]) ? ((point.value / firstValues[key]) - 1) * 100 : null;
            });
            return entry;
        });
    }, [data, selectedIndicators]);
    
    const xAxisTickFormatter = (date: string) => {
        const d = new Date(date);
        return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
    };

    const isSingleMode = selectedIndicators.length === 1;
    const singleSelectedConfig = isSingleMode ? commoditiesConfig[selectedIndicators[0]] : null;

    if (!data) return <Typography sx={{ textAlign: 'center', p: 2 }}>Lade historische Daten...</Typography>;

    return (
        <Box sx={{ width: '100%' }}>
            <FormGroup row sx={{ justifyContent: 'center', mb: 1, flexWrap: 'wrap' }}>
                {Object.keys(data).map(key => ( // Iteriere über die Daten-Keys, um nur verfügbare Rohstoffe anzuzeigen
                    <FormControlLabel
                        key={key}
                        control={<Checkbox checked={selectedIndicators.includes(key)} onChange={(e) => {
                            const { name, checked } = e.target;
                            setSelectedIndicators(prev => checked ? [...prev, name] : prev.filter(item => item !== name));
                        }} name={key} sx={{ color: commoditiesConfig[key]?.color, '&.Mui-checked': { color: commoditiesConfig[key]?.color } }} />}
                        label={commoditiesConfig[key]?.name || key}
                    />
                ))}
            </FormGroup>
            
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                <ToggleButtonGroup value={timeframe} exclusive onChange={(e, val) => val && setTimeframe(val)} size="small">
                    <ToggleButton value="1M">1M</ToggleButton>
                    <ToggleButton value="6M">6M</ToggleButton>
                    <ToggleButton value="1Y">1J</ToggleButton>
                </ToggleButtonGroup>
            </Box>

            <Box sx={{ height: 350 }}>
                <ResponsiveContainer>
                    <LineChart data={processedData} margin={{ top: 20, right: 30, left: 15, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        
                        <XAxis 
                            dataKey="date" 
                            tickFormatter={xAxisTickFormatter} 
                            angle={-45} 
                            textAnchor="end" 
                            height={50}
                            interval="preserveStartEnd"
                        />
                        
                        <YAxis
                            tickFormatter={isSingleMode && singleSelectedConfig ? (val) => new Intl.NumberFormat('de-DE', { ...singleSelectedConfig.formatOptions, style: 'decimal', currency: undefined }).format(val) : (val) => `${Number(val).toFixed(0)}%`}
                            label={{ value: isSingleMode ? singleSelectedConfig?.unit : 'Veränderung', angle: -90, position: 'insideLeft' }}
                            domain={['auto', 'auto']} width={70}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        {selectedIndicators.map(key => (
                            <Line key={key} type="monotone" dataKey={key} stroke={commoditiesConfig[key]?.color || '#000'} strokeWidth={2} dot={false} connectNulls name={commoditiesConfig[key]?.name} unit={isSingleMode ? undefined : '%'} 
                                label={<CustomizedLastPointLabel data={processedData} isSingleMode={isSingleMode} originalData={data} />}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </Box>
        </Box>
    );
};

export default CommodityChart;