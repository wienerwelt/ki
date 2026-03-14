import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
    Box, Typography, ToggleButton, ToggleButtonGroup, FormGroup,
    FormControlLabel, Checkbox, Paper,
    Skeleton, Button, Alert, CircularProgress
} from '@mui/material';
import { Download as DownloadIcon } from '@mui/icons-material';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Brush
} from 'recharts';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

// ✅ FIXED: Pfad korrigiert (nur eine Ebene hoch zu src/context)
import { useAuth } from '../context/AuthContext';

// ✅ FIXED: Pfad korrigiert (gleiche Ebene wie Chart component)
import { commoditiesConfig } from './CommoditiesConfig';

// --- Typen ---
interface ChartDataPoint { date: string; value: number; }
interface HistoricalData { [key: string]: ChartDataPoint[]; }
interface LatestData { [key: string]: { source: string; lastUpdate: string; }; }

interface CommodityChartProps {
    historicalData: HistoricalData | null;
    latestData: LatestData | null;
    timeframe: string;
    setTimeframe: (tf: string) => void;
    isLoading: boolean;
}

// --- Hilfskomponenten ---
const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }, originalData: HistoricalData | null) => {
    if (active && payload && payload.length) { 
        const date = new Date(label || '').toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const isPercentView = !originalData; 
        return (
            <Paper elevation={3} sx={{ p: 1.5, bgcolor: 'background.paper', minWidth: 150 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>{`Datum: ${date}`}</Typography>
                {payload.map((entry: { dataKey: string; value: number | null; color: string }) => { 
                    const config = commoditiesConfig[entry.dataKey]; 
                    let formattedValue = '';
                    if (entry.value === null) {
                        formattedValue = 'N/A';
                    } else if (config && !isPercentView) {
                        formattedValue = new Intl.NumberFormat('de-DE', config.formatOptions).format(entry.value);
                    } else {
                        formattedValue = `${entry.value.toFixed(2)} %`;
                    }
                    return (
                        <Typography key={entry.dataKey} variant="body2" sx={{ color: entry.color, fontWeight: 'bold' }}>
                            {config?.name || entry.dataKey}: {formattedValue}
                        </Typography>
                    );
                })}
            </Paper>
        );
    }
    return null;
};

// --- Hauptkomponente ---
const CommodityChart: React.FC<CommodityChartProps> = ({
    historicalData, latestData, timeframe, setTimeframe, isLoading
}) => {
    const { businessPartner } = useAuth();
    const chartRef = useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [pdfError, setPdfError] = useState<string | null>(null);
    const [brushRange, setBrushRange] = useState<{ startIndex?: number; endIndex?: number } | null>(null);
    const [selectedIndicators, setSelectedIndicators] = useState<string[]>([]);
    
    // Logo Logik: Partner-Logo oder Fallback
    const watermarkUrl = businessPartner?.logo_url || '/logos/de-mobiliti.png';

    useEffect(() => {
        if (historicalData) {
            const historicalKeys = Object.keys(historicalData);
            if (selectedIndicators.length === 0) {
                // Filtere nur Keys, die wir auch in der Config kennen
                const initialSelection = historicalKeys.filter(key => commoditiesConfig[key]); 
                setSelectedIndicators(initialSelection.slice(0, 10));
            } else {
                 setSelectedIndicators(prev => prev.filter(key => historicalKeys.includes(key)));
            }
        }
    }, [historicalData]);

    const { processedData } = useMemo(() => { 
        if (!historicalData || selectedIndicators.length === 0) return { processedData: [] };
        const allDatesSet = new Set<string>();
        selectedIndicators.forEach(key => {
            if (historicalData[key]) {
                historicalData[key].forEach(dp => allDatesSet.add(dp.date));
            }
        });
        const allDates = Array.from(allDatesSet).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        const baseValues: Record<string, number> = {};
        if (selectedIndicators.length > 1) {
            selectedIndicators.forEach(key => {
                const firstValidValue = historicalData[key]?.find(dp => dp.value != null)?.value;
                baseValues[key] = firstValidValue || 1; 
            });
        }
        const processedData = allDates.map(date => {
            const dataPoint: { [key: string]: any } = { date };
            selectedIndicators.forEach(key => {
                const dp = historicalData[key]?.find(d => d.date === date);
                if (dp && dp.value != null) { 
                    if (selectedIndicators.length > 1) {
                        dataPoint[key] = (dp.value / baseValues[key] - 1) * 100;
                    } else {
                        dataPoint[key] = dp.value;
                    }
                } else {
                    dataPoint[key] = null;
                }
            });
            return dataPoint;
        });
        return { processedData };
    }, [historicalData, selectedIndicators]);

    const handleTimeframeChange = (_: React.MouseEvent<HTMLElement>, newTimeframe: string | null) => {
        if (newTimeframe) {
            setTimeframe(newTimeframe);
            setBrushRange(null); 
        }
    };

    const handleIndicatorChange = (key: string) => {
        setSelectedIndicators(prev =>
            prev.includes(key) ? prev.filter(i => i !== key) : [...prev, key]
        );
    };

    const activeIndicatorConfig = selectedIndicators.length === 1 ? commoditiesConfig[selectedIndicators[0]] : null;

    const handleDownloadPdf = async () => {
        setPdfError(null);
        setIsDownloading(true);

        if (!chartRef.current) {
            setIsDownloading(false);
            return;
        }

        try {
            const doc = new jsPDF({ orientation: 'landscape', unit: 'px', format: 'a4' });
            const margin = 20;
            const docWidth = doc.internal.pageSize.getWidth() - margin * 2;
            
            // PDF Header
            doc.setFontSize(18);
            doc.text('Rohstoff-Chart Analyse', margin, margin + 10);
            doc.setFontSize(10);
            doc.text(`Zeitraum: ${timeframe} | Datum: ${new Date().toLocaleDateString('de-DE')}`, margin, margin + 25);

            // Logo im PDF
            if (watermarkUrl) {
                 try {
                    const imgResponse = await fetch(watermarkUrl);
                    const imgBlob = await imgResponse.blob();
                    const imgData = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(imgBlob);
                    });
                    const imgProps = doc.getImageProperties(imgData);
                    const imgHeight = 40;
                    const imgWidth = (imgProps.width * imgHeight) / imgProps.height;
                    doc.addImage(imgData, 'PNG', doc.internal.pageSize.getWidth() - imgWidth - margin, margin, imgWidth, imgHeight);
                } catch (e) { console.error("Fehler beim Laden des PDF-Logos:", e); }
            }

            // Watermark für Screenshot ausblenden
            const watermark = (chartRef.current.querySelector('.chart-watermark') as HTMLElement);
            if (watermark) watermark.style.display = 'none';

            const canvas = await html2canvas(chartRef.current, { scale: 2, logging: false, useCORS: true, backgroundColor: null });

            // Watermark wieder einblenden
            if (watermark) watermark.style.display = 'block';

            const imgData = canvas.toDataURL('image/png');
            const imgProps = doc.getImageProperties(imgData);
            const imgWidth = docWidth;
            const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
            let yPos = margin + 40;
            doc.addImage(imgData, 'PNG', margin, yPos, imgWidth, imgHeight);
            yPos += imgHeight + 10;

            const tableHead = [['Datum', ...selectedIndicators.map(k => commoditiesConfig[k]?.name || k)]];
            const tableBody = processedData.map(row => {
                return [
                    new Date(row.date).toLocaleDateString('de-DE'),
                    ...selectedIndicators.map(key => {
                        if (row[key] === null) return 'N/A';
                        const config = commoditiesConfig[key]; 
                        return activeIndicatorConfig 
                            ? (config?.formatOptions ? new Intl.NumberFormat('de-DE', config.formatOptions).format(row[key]) : row[key].toFixed(2))
                            : `${row[key].toFixed(2)} %`;
                    })
                ];
            });

            autoTable(doc, {
                head: tableHead,
                body: tableBody,
                startY: yPos > doc.internal.pageSize.getHeight() - 60 ? (doc.addPage(), margin) : yPos, 
                theme: 'grid',
                styles: { fontSize: 8 },
                headStyles: { fillColor: '#333', textColor: '#fff' },
            });

            doc.save(`Rohstoff-Analyse_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (err: any) {
            console.error("Fehler bei PDF-Generierung:", err);
            setPdfError(err.message || "PDF konnte nicht erstellt werden.");
        } finally {
            setIsDownloading(false);
        }
    };

    const formatSliderDate = (dateStr: string | undefined): string => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    };

    const brushStartDate = brushRange?.startIndex != null ? processedData[brushRange.startIndex]?.date : null;
    const brushEndDate = brushRange?.endIndex != null ? processedData[brushRange.endIndex]?.date : null;

    if (isLoading) {
        return (
            <Box sx={{ width: '100%' }}>
                <Skeleton variant="rectangular" width="100%" height={450} sx={{ borderRadius: 1 }} />
            </Box>
        );
    }
    if (!historicalData || Object.keys(historicalData).length === 0) {
         return <Alert severity="info">Keine historischen Daten für den Chart verfügbar.</Alert>;
    }

    return (
        <Box sx={{ width: '100%' }}>
            <ToggleButtonGroup
                value={timeframe}
                exclusive
                onChange={handleTimeframeChange}
                aria-label="Zeitraum"
                size="small"
                sx={{ display: 'flex', width: '100%', mb: 2 }} 
            >
                <ToggleButton value="1M" aria-label="1 Monat" sx={{ flex: 1 }}>1M</ToggleButton>
                <ToggleButton value="6M" aria-label="6 Monate" sx={{ flex: 1 }}>6M</ToggleButton>
                <ToggleButton value="1Y" aria-label="1 Jahr" sx={{ flex: 1 }}>1J</ToggleButton>
                <ToggleButton value="max" aria-label="Maximum" sx={{ flex: 1 }}>Max</ToggleButton> 
            </ToggleButtonGroup>
            
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <FormGroup row sx={{ mt: 1, flexWrap: 'wrap', maxHeight: 50, overflowY: 'auto' }}>
                    {Object.keys(commoditiesConfig).map(key => (
                        historicalData[key] && (
                            <FormControlLabel
                                key={key}
                                control={
                                    <Checkbox
                                        checked={selectedIndicators.includes(key)}
                                        onChange={() => handleIndicatorChange(key)}
                                        name={key}
                                        size="small"
                                        sx={{ color: commoditiesConfig[key]?.color, '&.Mui-checked': { color: commoditiesConfig[key]?.color } }}
                                    />
                                }
                                label={<Typography variant="body2">{commoditiesConfig[key]?.name || key}</Typography>}
                            />
                        )
                    ))}
                </FormGroup>
            </Box>

            {/* ✅ FIXED: latestData verwenden, um Quellen anzuzeigen */}
            {latestData && selectedIndicators.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', fontStyle: 'italic', textAlign: 'center' }}>
                    Quellen: {
                        [...new Set(selectedIndicators
                            .map(key => latestData[key]?.source) 
                            .filter(Boolean))
                        ].join(', ')
                    }
                </Typography>
            )}

            <Box 
                ref={chartRef} 
                sx={{ height: 350, mt: 1, position: 'relative' }}
            >
                {/* Watermark Rendering */}
                {watermarkUrl && (
                    <Box 
                        className="chart-watermark"
                        sx={{
                            content: '""',
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: { xs: '60%', md: '40%' },
                            height: { xs: '60%', md: '70%' },
                            backgroundImage: `url(${watermarkUrl})`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'center',
                            backgroundSize: 'contain',
                            opacity: 0.08,
                            pointerEvents: 'none',
                        }} 
                    />
                )}
                
                <ResponsiveContainer>
                    <LineChart data={processedData} margin={{ top: 5, right: 20, left: 15, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        
                        <XAxis 
                            dataKey="date" 
                            tickFormatter={date => new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })} 
                            interval="preserveStartEnd" 
                        />
                        <YAxis
                            tickFormatter={activeIndicatorConfig ? (val) => new Intl.NumberFormat('de-DE', { ...activeIndicatorConfig.formatOptions, style: 'decimal', currency: undefined }).format(val) : (val) => `${Number(val).toFixed(0)}%`}
                            label={{ value: activeIndicatorConfig ? activeIndicatorConfig.unit : 'Veränderung in %', angle: -90, position: 'insideLeft', offset: -5 }}
                            domain={['auto', 'auto']} width={70} 
                        />
                        <Tooltip content={(props) => CustomTooltip(props, (selectedIndicators.length === 1 ? historicalData : null))} />
                        {selectedIndicators.map(key => (
                            <Line key={key} type="monotone" dataKey={key} stroke={commoditiesConfig[key]?.color || '#000'} strokeWidth={2} dot={false} connectNulls />
                        ))}
                        <Brush 
                            dataKey="date" 
                            height={30} 
                            stroke={commoditiesConfig[selectedIndicators[0]]?.color || '#8884d8'} 
                            tickFormatter={date => new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}
                            startIndex={brushRange?.startIndex ?? undefined} 
                            endIndex={brushRange?.endIndex ?? undefined} 
                            onChange={(range) => setBrushRange(range)}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </Box>

            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-start', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                {brushStartDate && brushEndDate && (
                    <Typography variant="body2" color="text.secondary">
                        Angezeigter Zeitraum: <strong>{formatSliderDate(brushStartDate)}</strong> - <strong>{formatSliderDate(brushEndDate)}</strong>
                    </Typography>
                )}
            </Box>

            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1 }}>
                {pdfError && <Alert severity="error" sx={{py: 0.5, mr: 1}}>{pdfError}</Alert>}
                <Button
                    variant="outlined"
                    size="small"
                    startIcon={isDownloading ? <CircularProgress size={16} /> : <DownloadIcon />}
                    onClick={handleDownloadPdf}
                    disabled={isDownloading}
                >
                    {isDownloading ? 'Exportiere...' : 'PDF Export'}
                </Button>
            </Box>
        </Box>
    );
};

export default CommodityChart;