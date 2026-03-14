import React, { useState, useMemo, useRef } from 'react';
import {
    Box, Grid, Typography, TextField, Slider, ToggleButtonGroup, ToggleButton,
    Paper, Tabs, Tab, Divider, Alert, Button, CircularProgress
} from '@mui/material';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import ForestIcon from '@mui/icons-material/Forest';
import EuroIcon from '@mui/icons-material/Euro';
import DownloadIcon from '@mui/icons-material/Download';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import { useAuth } from '../../context/AuthContext'; // WICHTIG für Logo & User im PDF

// --- Konstanten & Faktoren ---
// CO2-Faktoren (kg CO2 pro Liter) - Quelle: Umweltbundesamt / Standardwerte
const EMISSION_FACTORS = {
    diesel: 2.65,
    petrol: 2.37
};

// Szenarien für CO2-Preise (in Euro pro Tonne)
const CO2_PRICE_SCENARIOS = {
    2024: 45,   // Aktueller Fixpreis (ca.)
    2025: 55,   // Nächste Stufe
    2027: 85,   // Start ETS II (Schätzung konservativ)
    2030: 120,  // ETS II Marktpreis (Prognose)
    2035: 180   // Langfristziel
};

// Hilfsfunktion für Bild-zu-Base64 (für PDF Logo)
const imageToBase64 = async (url: string): Promise<string | null> => {
    try {
        const resp = await fetch(url, { mode: 'cors' });
        if (!resp.ok) return null;
        const blob = await resp.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
};

interface Co2FleetWidgetProps extends BaseWidgetProps {
    icon?: React.ReactNode;
    title: string;
}

const Co2FleetCalculatorWidget: React.FC<Co2FleetWidgetProps> = ({ 
    widgetId, onDelete, isRemovable, icon, title, widgetTypeKey 
}) => {
    const { user, businessPartner } = useAuth(); // Für PDF Footer & Logo
    const [tabIndex, setTabIndex] = useState(0);
    const widgetRef = useRef<HTMLDivElement>(null); // Ref für Screenshot

    // --- State für Eingaben ---
    const [fleetSize, setFleetSize] = useState<number>(10);
    const [annualMileage, setAnnualMileage] = useState<number>(20000); // km pro Fahrzeug
    const [consumption, setConsumption] = useState<number>(7.5); // l/100km
    const [fuelType, setFuelType] = useState<'diesel' | 'petrol'>('diesel');
    
    // --- State für Simulation ---
    const [selectedYear, setSelectedYear] = useState<number>(2024);
    const co2PricePerTon = CO2_PRICE_SCENARIOS[selectedYear as keyof typeof CO2_PRICE_SCENARIOS] || 45;

    // --- State für PDF Export ---
    const [isDownloading, setIsDownloading] = useState(false);
    const [pdfError, setPdfError] = useState<string | null>(null);

    // --- Berechnungen ---
    const results = useMemo(() => {
        const totalKm = fleetSize * annualMileage;
        const totalLiters = (totalKm / 100) * consumption;
        const factor = EMISSION_FACTORS[fuelType];
        
        const totalTonsCo2 = (totalLiters * factor) / 1000;
        
        // Kostenberechnung NUR für den CO2-Anteil
        const co2CostYear = totalTonsCo2 * co2PricePerTon;
        
        // Cent pro Liter Aufschlag (Mathematisch: (Preis/Tonne * Faktor) / 1000 * 100 für Cent)
        const centsPerLiterSurcharge = (co2PricePerTon * factor) / 10; 

        // Wald-Äquivalent: 1 Hektar Wald bindet ca. 11.5 Tonnen CO2 pro Jahr
        const forestHectares = totalTonsCo2 / 11.5;

        return {
            totalKm,
            totalLiters,
            totalTonsCo2,
            co2CostYear,
            centsPerLiterSurcharge,
            forestHectares,
            currentFactor: factor
        };
    }, [fleetSize, annualMileage, consumption, fuelType, co2PricePerTon]);

    // --- Chart Daten für Education Tab ---
    const chartData = useMemo(() => {
        // Basispreis Annahme (Netto Produkt + Energiesteuer + MwSt auf Basis)
        const basePrice = fuelType === 'diesel' ? 1.55 : 1.60; 
        
        return Object.entries(CO2_PRICE_SCENARIOS).map(([year, price]) => {
            const surcharge = (price * EMISSION_FACTORS[fuelType]) / 1000; // in Euro
            return {
                name: year,
                Basispreis: basePrice,
                'CO2-Steuer': surcharge,
                pricePerTon: price
            };
        });
    }, [fuelType]);

    // Formatierer
    const currency = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
    const numberFmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

    // --- PDF Export Funktion ---
    const handleDownloadPdf = async () => {
        const input = widgetRef.current;
        if (!input) return;

        setPdfError(null);
        setIsDownloading(true);

        // Styling für Screenshot anpassen (Schwarze Schrift erzwingen)
        const originalColor = input.style.color;
        input.style.color = '#000000';

        try {
            const canvas = await html2canvas(input, { 
                scale: 2, 
                useCORS: true, 
                backgroundColor: '#ffffff'
            });
            
            input.style.color = originalColor; // Reset

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 15;
            let yPos = 15;

            // 1. Header
            pdf.setFontSize(22);
            pdf.text('CO2-Flotten-Analyse', margin, yPos);
            yPos += 7;
            pdf.setFontSize(10);
            pdf.text(new Date().toLocaleDateString('de-DE'), margin, yPos);

            // 2. Logo einfügen (wenn vorhanden)
            if (businessPartner?.logo_url) {
                const logoBase64 = await imageToBase64(businessPartner.logo_url);
                if (logoBase64) {
                    const logoWidth = 40;
                    const img = new Image();
                    img.src = logoBase64;
                    await new Promise(resolve => { img.onload = resolve; });
                    const logoHeight = (img.height * logoWidth) / img.width;
                    pdf.addImage(logoBase64, 'PNG', pdfWidth - logoWidth - margin, 15, logoWidth, logoHeight);
                }
            }
            yPos += 15;

            // 3. Parameter Tabelle
            pdf.setFontSize(14);
            pdf.text('Berechnungsgrundlagen', margin, yPos);
            yPos += 5;

            const tableBody = [
                ['Anzahl Fahrzeuge', fleetSize.toString()],
                ['Antriebsart', fuelType === 'diesel' ? 'Diesel' : 'Benzin'],
                ['Verbrauch', `${consumption} l/100km`],
                ['Fahrleistung p.a.', `${numberFmt.format(annualMileage)} km`],
                ['CO2-Faktor', `${results.currentFactor} kg/Liter`],
                ['Angenommener CO2-Preis', `${co2PricePerTon} €/Tonne (${selectedYear})`]
            ];

            autoTable(pdf, {
                startY: yPos,
                head: [['Parameter', 'Wert']],
                body: tableBody,
                theme: 'grid',
                margin: { left: margin, right: margin }
            });

            yPos = (pdf as any).lastAutoTable.finalY + 15;

            // 4. Screenshot des Widgets
            pdf.setFontSize(14);
            pdf.text('Ergebnis & Visualisierung', margin, yPos);
            yPos += 5;

            const maxImageHeight = pageHeight - yPos - 30;
            const scaledHeight = (canvas.height * (pdfWidth - 2 * margin)) / canvas.width;
            const drawHeight = Math.min(scaledHeight, maxImageHeight);
            
            pdf.addImage(imgData, 'PNG', margin, yPos, pdfWidth - 2 * margin, drawHeight);

            // 5. Footer
            const footerY = pageHeight - 15;
            pdf.setLineWidth(0.5);
            pdf.line(margin, footerY, pdfWidth - margin, footerY);
            pdf.setFontSize(8);
            pdf.text(`Erstellt von: ${user?.username || 'User'}`, margin, footerY + 5);
            pdf.text(`Analyse für: ${businessPartner?.name || 'Fuhrpark'}`, pdfWidth / 2, footerY + 5, { align: 'center' });
            
            pdf.save(`CO2-Analyse-${new Date().toISOString().split('T')[0]}.pdf`);

        } catch (e: any) {
            console.error(e);
            input.style.color = originalColor;
            setPdfError(e?.message || 'PDF Fehler');
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <WidgetPaper
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {icon || <ForestIcon />}
                    <Typography variant="h6">{title}</Typography>
                </Box>
            }
            widgetTitle={title}
            widgetTypeKey={widgetTypeKey || 'co2_fleet_calculator'}
            widgetId={widgetId}
            onDelete={onDelete}
            isRemovable={isRemovable}
        >
            <div ref={widgetRef} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Tabs 
                    value={tabIndex} 
                    onChange={(_, v) => setTabIndex(v)} 
                    variant="fullWidth" 
                    sx={{ mb: 2, borderBottom: 1, borderColor: 'divider', minHeight: 40 }}
                    indicatorColor="primary"
                >
                    <Tab label="Flotten-Check" sx={{ py: 1, minHeight: 40 }} />
                    <Tab label="Analyse & Preis" sx={{ py: 1, minHeight: 40 }} />
                </Tabs>

                {/* --- TAB 1: CALCULATOR --- */}
                {tabIndex === 0 && (
                    <Box sx={{ flexGrow: 1 }}>
                        {/* Info Banner mit aktuellen Faktoren */}
                        <Alert 
                            severity="info" 
                            icon={<InfoOutlinedIcon fontSize="inherit" />}
                            sx={{ mb: 2, py: 0, '& .MuiAlert-message': { fontSize: '0.75rem' } }}
                        >
                            Berechnungsbasis: <strong>{co2PricePerTon} €/t</strong> CO2-Preis.<br/>
                            Faktoren: Diesel <strong>{EMISSION_FACTORS.diesel} kg/l</strong>, Benzin <strong>{EMISSION_FACTORS.petrol} kg/l</strong>.
                        </Alert>

                        <Grid container spacing={2} sx={{ mb: 2 }}>
                            <Grid item xs={12} sm={6}>
                                <ToggleButtonGroup
                                    value={fuelType}
                                    exclusive
                                    onChange={(_, v) => v && setFuelType(v)}
                                    fullWidth
                                    size="small"
                                    color="primary"
                                >
                                    <ToggleButton value="diesel">
                                        <LocalGasStationIcon sx={{ mr: 1, fontSize: '1rem' }} /> Diesel
                                    </ToggleButton>
                                    <ToggleButton value="petrol">
                                        <LocalGasStationIcon sx={{ mr: 1, fontSize: '1rem' }} /> Benzin
                                    </ToggleButton>
                                </ToggleButtonGroup>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField 
                                    label="Verbrauch (l/100km)" 
                                    type="number" 
                                    size="small" 
                                    fullWidth
                                    value={consumption}
                                    onChange={(e) => setConsumption(Number(e.target.value))}
                                    InputProps={{ inputProps: { min: 0, step: 0.1 } }}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField 
                                    label="Anzahl Fahrzeuge" 
                                    type="number" 
                                    size="small" 
                                    fullWidth
                                    value={fleetSize}
                                    onChange={(e) => setFleetSize(Number(e.target.value))}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField 
                                    label="km pro Jahr/Fzg." 
                                    type="number" 
                                    size="small" 
                                    fullWidth
                                    value={annualMileage}
                                    onChange={(e) => setAnnualMileage(Number(e.target.value))}
                                    InputProps={{ endAdornment: <Typography variant="caption" color="text.secondary">km</Typography> }}
                                />
                            </Grid>
                        </Grid>

                        <Divider sx={{ my: 2 }} />

                        {/* Simulation Slider */}
                        <Box sx={{ px: 1, mb: 3 }}>
                            <Typography variant="body2" gutterBottom sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Preisszenario: <strong>{selectedYear}</strong></span>
                                {selectedYear > 2026 && <span style={{ color: '#d32f2f', fontSize: '0.8em' }}>ETS II Phase (Prognose)</span>}
                            </Typography>
                            <Slider
                                value={selectedYear}
                                min={2024}
                                max={2035}
                                step={null}
                                marks={Object.keys(CO2_PRICE_SCENARIOS).map(y => ({ value: Number(y), label: y === '2024' || y === '2035' ? y : '' }))}
                                onChange={(_, v) => setSelectedYear(v as number)}
                                sx={{ 
                                    color: selectedYear > 2026 ? 'error.main' : 'primary.main',
                                    '& .MuiSlider-markLabel': { fontSize: '0.7rem' }
                                }}
                            />
                        </Box>

                        {/* Ergebnisse als Cards */}
                        <Grid container spacing={2}>
                            <Grid item xs={6}>
                                <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', bgcolor: 'rgba(255, 0, 0, 0.04)', height: '100%' }}>
                                    <Typography variant="caption" color="text.secondary" display="block">
                                        <ForestIcon sx={{ fontSize: '1rem', verticalAlign: 'text-bottom', mr: 0.5 }} />
                                        CO2-Ausstoß p.a.
                                    </Typography>
                                    <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                                        {numberFmt.format(results.totalTonsCo2)} t
                                    </Typography>
                                    <Typography variant="caption" sx={{ mt: 0.5, display: 'block', lineHeight: 1.2 }}>
                                        Entspricht ca. <strong>{numberFmt.format(results.forestHectares)} Hektar</strong> Wald zur Kompensation.
                                    </Typography>
                                </Paper>
                            </Grid>
                            <Grid item xs={6}>
                                <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', height: '100%' }}>
                                    <Typography variant="caption" color="text.secondary" display="block">
                                        <EuroIcon sx={{ fontSize: '1rem', verticalAlign: 'text-bottom', mr: 0.5 }} />
                                        Reine CO2-Steuerkosten
                                    </Typography>
                                    <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                                        {currency.format(results.co2CostYear)}
                                    </Typography>
                                    <Typography variant="caption" sx={{ mt: 0.5, display: 'block', lineHeight: 1.2, color: 'text.secondary' }}>
                                        Das sind <strong>+{results.centsPerLiterSurcharge.toFixed(1)} ct</strong> pro Liter "Aufschlag".
                                    </Typography>
                                </Paper>
                            </Grid>
                        </Grid>
                    </Box>
                )}

                {/* --- TAB 2: EDUCATION --- */}
                {tabIndex === 1 && (
                    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                        <Alert severity="info" sx={{ mb: 2, py: 0, '& .MuiAlert-message': { fontSize: '0.8rem' } }}>
                            Die CO2-Steuer ist keine willkürliche Gebühr, sondern eine <strong>Lenkungsabgabe</strong>.
                            Sie soll fossile Brennstoffe schrittweise verteuern, damit sich grüne Alternativen rechnen.
                        </Alert>

                        <Typography variant="subtitle2" align="center" gutterBottom>
                            Entwicklung des CO2-Aufschlags pro Liter
                        </Typography>

                        <Box sx={{ flexGrow: 1, minHeight: 200, width: '100%' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                    <YAxis tickFormatter={(val) => `${val.toFixed(2)}€`} tick={{ fontSize: 11 }} />
                                    <RechartsTooltip 
                                        formatter={(value: number, name: string) => [`${value.toFixed(2)} €`, name]}
                                        labelStyle={{ color: '#000' }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                                    <Bar dataKey="Basispreis" stackId="a" fill="#e0e0e0" name="Produkt + Steuer" />
                                    <Bar dataKey="CO2-Steuer" stackId="a" fill="#ff5252" name="CO2-Aufschlag" />
                                    <ReferenceLine y={chartData[0].Basispreis + chartData[0]['CO2-Steuer']} stroke="red" strokeDasharray="3 3" label={{ value: 'Heute', position: 'insideTopLeft', fontSize: 10, fill: 'red' }} />
                                </BarChart>
                            </ResponsiveContainer>
                        </Box>

                        <Box sx={{ mt: 2, p: 1.5, bgcolor: 'background.default', borderRadius: 1 }}>
                            <Typography variant="caption" color="text.secondary" display="block">
                                <strong>Info:</strong> Ab 2027 (ETS II) bestimmt der Markt den Preis. 
                                Wir rechnen konservativ mit 85€/t, Experten halten bis zu 200€/t für möglich.
                            </Typography>
                        </Box>
                    </Box>
                )}
            </div>

            {/* --- PDF Button (Immer sichtbar) --- */}
            <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 {pdfError ? (
                    <Typography variant="caption" color="error">{pdfError}</Typography>
                 ) : (
                    <Typography variant="caption" color="text.secondary">Export als PDF inkl. Report</Typography>
                 )}
                 <Button 
                    variant="outlined" 
                    size="small" 
                    startIcon={isDownloading ? <CircularProgress size={16} /> : <DownloadIcon />}
                    onClick={handleDownloadPdf}
                    disabled={isDownloading}
                 >
                    {isDownloading ? 'Exportiere...' : 'PDF Report'}
                 </Button>
            </Box>

        </WidgetPaper>
    );
};

export default Co2FleetCalculatorWidget;