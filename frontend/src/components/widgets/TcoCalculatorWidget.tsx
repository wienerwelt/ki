import React, { useState, useRef, useCallback } from 'react';
import {
  Box, Button, Grid, Paper, TextField, Typography, ToggleButtonGroup, ToggleButton,
  InputAdornment, Slider, Alert, FormControlLabel, Switch, useTheme, useMediaQuery
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import BarChartIcon from '@mui/icons-material/BarChart';
import PieChartIcon from '@mui/icons-material/PieChart';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import EvStationIcon from '@mui/icons-material/EvStation';
import PowerIcon from '@mui/icons-material/Power';
import AirIcon from '@mui/icons-material/Air';
import PropaneTankIcon from '@mui/icons-material/PropaneTank';
import Tooltip from '@mui/material/Tooltip';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import { useAuth } from '../../context/AuthContext';

type DriveType = 'Benzin' | 'Diesel' | 'Elektro' | 'Plugin Hybrid' | 'Wasserstoff' | 'Gas';

interface VehicleInputState {
  id: number; name: string; driveType: DriveType; purchasePrice: string; subsidy: string; holdingPeriod: string;
  annualMileage: string; residualValue: string; fuelConsumption: string; fuelPrice: string; electricConsumption: string;
  electricPrice: string; electricShare: number; insurance: string; taxes: string; maintenance: string;
}

const driveTypeIcons: { [key in DriveType]: { icon: React.ReactElement; tooltip: string } } = {
  'Benzin': { icon: <LocalGasStationIcon />, tooltip: 'Benzin' },
  'Diesel': { icon: <LocalGasStationIcon />, tooltip: 'Diesel' },
  'Elektro': { icon: <EvStationIcon />, tooltip: 'Elektro' },
  'Plugin Hybrid': { icon: <PowerIcon />, tooltip: 'Plugin Hybrid' },
  'Wasserstoff': { icon: <AirIcon />, tooltip: 'Wasserstoff' },
  'Gas': { icon: <PropaneTankIcon />, tooltip: 'Gas (LPG/CNG)' },
};

interface TcoResult {
  vehicleName: string; totalTco: number; costPerMonth: number; costPerKm: number;
  breakdown: { wertverlust: number; energie: number; fixkosten: number; };
}

interface TcoWidgetProps extends BaseWidgetProps {
  icon?: React.ReactNode;
  title: string;
}

const INITIAL_VEHICLE_STATE: VehicleInputState = {
  id: Date.now(), name: 'Fahrzeug 1', driveType: 'Benzin', purchasePrice: '35000', subsidy: '0', holdingPeriod: '5',
  annualMileage: '15000', residualValue: '15000', fuelConsumption: '7.5', fuelPrice: '1.85', electricConsumption: '20',
  electricPrice: '0.35', electricShare: 70, insurance: '800', taxes: '250', maintenance: '600',
};

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

const TcoCalculatorWidget: React.FC<TcoWidgetProps> = ({ widgetId, onDelete, isRemovable, icon, title, widgetTypeKey }) => {
  const { user, businessPartner } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  const [vehicles, setVehicles] = useState<VehicleInputState[]>([INITIAL_VEHICLE_STATE]);
  const [results, setResults] = useState<TcoResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chartType, setChartType] = useState<'bar' | 'pie'>('bar');
  const [includeLogo, setIncludeLogo] = useState<boolean>(true);
  const resultsRef = useRef<HTMLDivElement>(null);

  const integerFormatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

  const handleInputChange = useCallback((index: number, field: keyof VehicleInputState, value: any) => {
    const newVehicles = [...vehicles];
    newVehicles[index] = { ...newVehicles[index], [field]: value };
    setVehicles(newVehicles);
  }, [vehicles]);

  const toggleCompareVehicle = () => {
    if (vehicles.length === 1) {
      setVehicles([...vehicles, { ...INITIAL_VEHICLE_STATE, id: Date.now(), name: 'Fahrzeug 2' }]);
    } else {
      setVehicles(vehicles.slice(0, 1));
      setResults(null);
    }
  };

  const handleCalculate = () => {
    setError(null);
    const calculatedResults: TcoResult[] = [];
    for (const vehicle of vehicles) {
      const p = (str: string) => parseFloat(str.replace(',', '.')) || 0;
      const purchasePrice = p(vehicle.purchasePrice);
      const subsidy = p(vehicle.subsidy);
      const holdingPeriod = p(vehicle.holdingPeriod);
      const annualMileage = p(vehicle.annualMileage);
      const residualValue = p(vehicle.residualValue);
      if (purchasePrice <= 0 || holdingPeriod <= 0 || annualMileage <= 0) {
        setError('Bitte füllen Sie Kaufpreis, Haltedauer und Fahrleistung für alle Fahrzeuge aus.');
        return;
      }
      const wertverlust = purchasePrice - subsidy - residualValue;
      let energie = 0;
      const totalMileage = annualMileage * holdingPeriod;
      switch (vehicle.driveType) {
        case 'Benzin': case 'Diesel': case 'Gas': case 'Wasserstoff':
          energie = (totalMileage / 100) * p(vehicle.fuelConsumption) * p(vehicle.fuelPrice); break;
        case 'Elektro':
          energie = (totalMileage / 100) * p(vehicle.electricConsumption) * p(vehicle.electricPrice); break;
        case 'Plugin Hybrid':
          const electricKm = totalMileage * (vehicle.electricShare / 100);
          const fuelKm = totalMileage - electricKm;
          const electricCost = (electricKm / 100) * p(vehicle.electricConsumption) * p(vehicle.electricPrice);
          const fuelCost = (fuelKm / 100) * p(vehicle.fuelConsumption) * p(vehicle.fuelPrice);
          energie = electricCost + fuelCost; break;
      }
      const fixkosten = (p(vehicle.insurance) + p(vehicle.taxes) + p(vehicle.maintenance)) * holdingPeriod;
      const totalTco = wertverlust + energie + fixkosten;
      calculatedResults.push({
        vehicleName: vehicle.name, totalTco,
        costPerMonth: totalTco > 0 && holdingPeriod > 0 ? totalTco / (holdingPeriod * 12) : 0,
        costPerKm: totalTco > 0 && totalMileage > 0 ? totalTco / totalMileage : 0,
        breakdown: { wertverlust, energie, fixkosten },
      });
    }
    setResults(calculatedResults);
  };

  const handleDownloadPdf = async () => {
    const input = resultsRef.current;
    if (!input || !results) return;

    // OPTIMIERUNG: Vorübergehendes Styling für PDF-Generierung im Dark Mode
    const originalColor = input.style.color;
    input.style.color = '#000000'; // Text schwarz machen für Screenshot

    try {
        const canvas = await html2canvas(input, { 
            scale: 2, 
            useCORS: true, 
            allowTaint: true, 
            backgroundColor: '#ffffff' // Zwingend weißer Hintergrund
        });
        
        // Farbe zurücksetzen
        input.style.color = originalColor;

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 15;
        let yPos = 15;

        pdf.setFontSize(22);
        pdf.text('TCO-Analyse', margin, yPos);
        yPos += 7;
        pdf.setFontSize(10);
        pdf.text(new Date().toLocaleDateString('de-DE'), margin, yPos);

        if (includeLogo && businessPartner?.logo_url) {
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
        yPos += 10;

        pdf.setFontSize(14);
        pdf.text('Eingabeparameter', margin, yPos);
        yPos += 2;

        const v1 = vehicles[0];
        const v2 = vehicles.length > 1 ? vehicles[1] : null;

        const tableHead: string[] = ['Parameter', v1.name];
        if (v2) tableHead.push(v2.name);

        const rawRows: (string | undefined)[][] = [
        ['Antriebsart', v1.driveType, v2 ? v2.driveType : undefined],
        ['Kaufpreis', `${integerFormatter.format(Number(v1.purchasePrice))} €`, v2 ? `${integerFormatter.format(Number(v2.purchasePrice))} €` : undefined],
        ['Förderungen', `${integerFormatter.format(Number(v1.subsidy))} €`, v2 ? `${integerFormatter.format(Number(v2.subsidy))} €` : undefined],
        ['Haltedauer', `${v1.holdingPeriod} Jahre`, v2 ? `${v2.holdingPeriod} Jahre` : undefined],
        ['Fahrleistung p.a.', `${integerFormatter.format(Number(v1.annualMileage))} km`, v2 ? `${integerFormatter.format(Number(v2.annualMileage))} km` : undefined],
        ['Restwert', `${integerFormatter.format(Number(v1.residualValue))} €`, v2 ? `${integerFormatter.format(Number(v2.residualValue))} €` : undefined],
        ];
        const tableBody: string[][] = rawRows.map(row => (v2 ? row : row.slice(0, 2)).map(c => c ?? ''));

        autoTable(pdf, {
        startY: yPos,
        head: [tableHead],
        body: tableBody,
        theme: 'grid',
        margin: { left: margin, right: margin }
        });

        yPos = (pdf as any).lastAutoTable.finalY + 10;

        pdf.setFontSize(14);
        pdf.text('Ergebnis-Übersicht', margin, yPos);
        yPos += 2;

        const maxImageHeight = pageHeight - yPos - 30;
        const scaledHeight = (canvas.height * (pdfWidth - 2 * margin)) / canvas.width;
        const drawHeight = Math.min(scaledHeight, maxImageHeight);
        pdf.addImage(imgData, 'PNG', margin, yPos, pdfWidth - 2 * margin, drawHeight);

        const footerY = pageHeight - 20;
        pdf.setLineWidth(0.5);
        pdf.line(margin, footerY, pdfWidth - margin, footerY);
        pdf.setFontSize(8);
        pdf.text(`Erstellt von: ${user?.username || 'N/A'}`, margin, footerY + 8);
        pdf.text(`Analyse für: ${businessPartner?.name || 'N/A'}`, pdfWidth / 2, footerY + 8, { align: 'center' });
        pdf.text(`Seite 1 von 1`, pdfWidth - margin, footerY + 8, { align: 'right' });

        pdf.save(`TCO-Analyse-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (e) {
        console.error(e);
        // Reset color in case of error
        input.style.color = originalColor;
    }
  };

  const renderDriveSpecificFields = (vehicle: VehicleInputState, index: number) => {
    const field = (name: keyof VehicleInputState, label: string, unit: string) => (
      <TextField label={label} type="number" value={vehicle[name] as string}
        onChange={(e) => handleInputChange(index, name, e.target.value)}
        fullWidth margin="dense" size="small"
        InputProps={{ endAdornment: <InputAdornment position="end">{unit}</InputAdornment> }} />
    );
    switch (vehicle.driveType) {
      case 'Benzin': return <>{field('fuelConsumption', 'Verbrauch', 'L/100km')}{field('fuelPrice', 'Kraftstoffpreis', '€/L')}</>;
      case 'Diesel': return <>{field('fuelConsumption', 'Verbrauch', 'L/100km')}{field('fuelPrice', 'Kraftstoffpreis', '€/L')}</>;
      case 'Elektro': return <>{field('electricConsumption', 'Verbrauch', 'kWh/100km')}{field('electricPrice', 'Energiepreis', '€/kWh')}</>;
      case 'Wasserstoff': return <>{field('fuelConsumption', 'Verbrauch', 'kg/100km')}{field('fuelPrice', 'Preis', '€/kg')}</>;
      case 'Gas': return <>{field('fuelConsumption', 'Verbrauch', 'kg/100km')}{field('fuelPrice', 'Preis', '€/kg')}</>;
      case 'Plugin Hybrid': return (
        <>
          {field('fuelConsumption', 'Verbrauch Benzin', 'L/100km')}{field('fuelPrice', 'Kraftstoffpreis', '€/L')}
          {field('electricConsumption', 'Verbrauch Strom', 'kWh/100km')}{field('electricPrice', 'Energiepreis', '€/kWh')}
          <Typography gutterBottom sx={{ mt: 1 }}>Elektrischer Fahranteil</Typography>
          <Slider value={vehicle.electricShare} onChange={(_, val) => handleInputChange(index, 'electricShare', val)}
            aria-labelledby="electric-share-slider" valueLabelDisplay="auto"
            marks step={5} min={0} max={100} valueLabelFormat={v => `${v}%`} />
        </>
      );
      default: return null;
    }
  };

  const chartData = results ? [
    { name: 'Wertverlust', [results[0].vehicleName]: results[0].breakdown.wertverlust, [results[1]?.vehicleName || '']: results[1]?.breakdown.wertverlust },
    { name: 'Energie', [results[0].vehicleName]: results[0].breakdown.energie, [results[1]?.vehicleName || '']: results[1]?.breakdown.energie },
    { name: 'Fixkosten', [results[0].vehicleName]: results[0].breakdown.fixkosten, [results[1]?.vehicleName || '']: results[1]?.breakdown.fixkosten },
  ] : [];

  const pieChartData = results ? results.map(r => ({
    name: r.vehicleName,
    data: Object.entries(r.breakdown).map(([key, value]) => ({ name: key.charAt(0).toUpperCase() + key.slice(1), value }))
  })) : [];
  const COLORS = ['#8884d8', '#82ca9d', '#ffc658'];
  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (<text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central">{`${(percent * 100).toFixed(0)}%`}</text>);
  };

  // --- Theme Anpassungen für Charts ---
  const chartTextColor = theme.palette.text.primary;
  const chartGridColor = theme.palette.divider;

  return (
    <WidgetPaper title={<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, overflow: 'hidden' }}>{icon}<Typography variant="h6" noWrap>{title}</Typography></Box>}
      widgetTitle={title} widgetTypeKey={widgetTypeKey || 'tco_calculator'} widgetId={widgetId} onDelete={onDelete} isRemovable={isRemovable}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      {/* KORREKTUR: Grid Spacing angepasst für Mobile */}
      <Grid container spacing={isMobile ? 2 : 4}>
        {vehicles.map((vehicle, index) => (
          <Grid item xs={12} md={vehicles.length > 1 ? 6 : 12} key={vehicle.id}>
            <TextField label={`Bezeichnung`} value={vehicle.name} onChange={(e) => handleInputChange(index, 'name', e.target.value)} fullWidth size="small" />
            <ToggleButtonGroup
              value={vehicle.driveType}
              exclusive
              fullWidth
              size="small"
              sx={{ mt: 2 }}
              onChange={(_, val) => { if (val) handleInputChange(index, 'driveType', val); }}
            >
              {Object.entries(driveTypeIcons).map(([type, { icon, tooltip }]) => (
                <Tooltip title={tooltip} key={type}>
                  <ToggleButton value={type as DriveType}>
                    {icon}
                  </ToggleButton>
                </Tooltip>
              ))}
            </ToggleButtonGroup>
            <TextField label="Kaufpreis" type="number" value={vehicle.purchasePrice} onChange={(e) => handleInputChange(index, 'purchasePrice', e.target.value)} fullWidth margin="dense" size="small" InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }} />
            <TextField label="Förderungen / Bonus" type="number" value={vehicle.subsidy} onChange={(e) => handleInputChange(index, 'subsidy', e.target.value)} fullWidth margin="dense" size="small" InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }} />
            <TextField label="Haltedauer" type="number" value={vehicle.holdingPeriod} onChange={(e) => handleInputChange(index, 'holdingPeriod', e.target.value)} fullWidth margin="dense" size="small" InputProps={{ endAdornment: <InputAdornment position="end">Jahre</InputAdornment> }} />
            <TextField label="Jährliche Fahrleistung" type="number" value={vehicle.annualMileage} onChange={(e) => handleInputChange(index, 'annualMileage', e.target.value)} fullWidth margin="dense" size="small" InputProps={{ endAdornment: <InputAdornment position="end">km</InputAdornment> }} />
            {renderDriveSpecificFields(vehicle, index)}
            <TextField label="Versicherung p.a." type="number" value={vehicle.insurance} onChange={(e) => handleInputChange(index, 'insurance', e.target.value)} fullWidth margin="dense" size="small" InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }} />
            <TextField label="Steuern p.a." type="number" value={vehicle.taxes} onChange={(e) => handleInputChange(index, 'taxes', e.target.value)} fullWidth margin="dense" size="small" InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }} />
            <TextField label="Wartung p.a." type="number" value={vehicle.maintenance} onChange={(e) => handleInputChange(index, 'maintenance', e.target.value)} fullWidth margin="dense" size="small" InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }} />
            <TextField label="Verkaufswert (Restwert)" type="number" value={vehicle.residualValue} onChange={(e) => handleInputChange(index, 'residualValue', e.target.value)} fullWidth margin="dense" size="small" InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }} />
          </Grid>
        ))}
      </Grid>

      <Box sx={{ mt: 3, display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: isMobile ? 'center' : 'flex-start' }}>
        <Button variant="contained" onClick={handleCalculate} size="large" fullWidth={isMobile}>Berechnen</Button>
        <Button variant="outlined" onClick={toggleCompareVehicle} startIcon={vehicles.length === 1 ? <AddIcon /> : <RemoveIcon />} fullWidth={isMobile}>
          {vehicles.length === 1 ? 'Fahrzeug zum Vergleich' : 'Vergleich entfernen'}
        </Button>
      </Box>

      {results && (
        <Box mt={4}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" gutterBottom>Ergebnis-Übersicht</Typography>
            <ToggleButtonGroup value={chartType} exclusive size="small" onChange={(_, val) => { if (val) setChartType(val); }}>
              <ToggleButton value="bar"><BarChartIcon /></ToggleButton>
              <ToggleButton value="pie"><PieChartIcon /></ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Paper variant="outlined">
            <Box ref={resultsRef} sx={{ p: 2, bgcolor: 'background.paper', color: 'text.primary' }}>
              <Grid container spacing={2}>
                {results.map((res, i) => (
                  <Grid item xs={12} md={6} key={i}>
                    <Typography variant="h5" align="center">{res.vehicleName}</Typography>
                    <Typography variant="h4" align="center" color="primary" sx={{ my: 1 }}>{res.costPerMonth.toFixed(2)} €</Typography>
                    <Typography variant="body1" align="center" gutterBottom>pro Monat</Typography>
                    <Typography variant="body1" align="center"><b>{res.costPerKm.toFixed(2)} €</b> / km</Typography>
                    <Typography variant="body2" align="center">Gesamtkosten: {integerFormatter.format(res.totalTco)} €</Typography>
                  </Grid>
                ))}
              </Grid>
              <Box sx={{ height: 300, mt: 3 }}>
                {chartType === 'bar' ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                      <XAxis dataKey="name" stroke={chartTextColor} />
                      <YAxis tickFormatter={(tick) => `${integerFormatter.format(tick)} €`} stroke={chartTextColor} />
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, border: `1px solid ${theme.palette.divider}` }}
                        formatter={(value: number) => `${integerFormatter.format(value)} €`} 
                      />
                      <Legend />
                      <Bar dataKey={results[0].vehicleName} fill="#8884d8" />
                      {results.length > 1 && <Bar dataKey={results[1].vehicleName} fill="#82ca9d" />}
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Grid container spacing={1} sx={{ height: '100%' }}>
                    {pieChartData.map((chart, index) => (
                      <Grid item xs={12} md={6} key={index} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <Typography variant="subtitle2">{chart.name}</Typography>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={chart.data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} labelLine={false} label={renderCustomizedLabel}>
                              {chart.data.map((_, i) => <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <RechartsTooltip 
                                contentStyle={{ backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary }}
                                formatter={(value: number) => `${integerFormatter.format(value)} €`} 
                            />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </Grid>
                    ))}
                  </Grid>
                )}
              </Box>
            </Box>
          </Paper>
          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2, flexDirection: isMobile ? 'column' : 'row' }}>
            <Button startIcon={<DownloadIcon />} onClick={handleDownloadPdf} fullWidth={isMobile}>
              Ergebnis als PDF speichern
            </Button>
            <FormControlLabel control={<Switch checked={includeLogo} onChange={(e) => setIncludeLogo(e.target.checked)} />}
              label="Logo im PDF" />
          </Box>
        </Box>
      )}
    </WidgetPaper>
  );
};

export default TcoCalculatorWidget;