import React, { useState, useEffect } from 'react';
import { Box, Typography, CircularProgress, Alert, ToggleButtonGroup, ToggleButton, Chip, Divider } from '@mui/material';
import axios from 'axios';
import { FuelPricesWidgetProps } from '../../types/dashboard.types';
import WidgetPaper from './WidgetPaper';

// Importieren des API-Schlüssels aus der zentralen Konfigurationsdatei
import { TANKERKOENIG_API_KEY } from '../../apiConfig'; 

const FuelPricesWidget: React.FC<FuelPricesWidgetProps> = ({ onDelete, widgetId, isRemovable }) => {
    // State für die Länderauswahl
    const [countryFilter, setCountryFilter] = useState<'DE' | 'AT' | 'EU'>('DE');
    
    // Lokaler State für Daten, Ladezustand und Fehler
    const [fuelData, setFuelData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchFuelPrices = async () => {
            // Logik für nicht implementierte Länder
            if (countryFilter !== 'DE') {
                setFuelData([]);
                setError(null);
                setIsLoading(false);
                return;
            }

            // Überprüfung, ob der API-Schlüssel in der apiConfig.ts eingetragen wurde
            if (TANKERKOENIG_API_KEY === '26eccd70-56eb-753c-1c36-c874ec82172a' || !TANKERKOENIG_API_KEY) {
                setError('Bitte tragen Sie Ihren Tankerkönig API-Schlüssel in der Datei src/apiConfig.ts ein.');
                return;
            }

            setIsLoading(true);
            setError(null);
            
            try {
                // Beispiel-API-Aufruf für den Umkreis von Berlin (lat, lng).
                const lat = 52.520; // Berlin Latitude
                const lng = 13.405; // Berlin Longitude
                const rad = 5;      // 5km Radius
                
                const response = await axios.get(
                    `https://creativecommons.tankerkoenig.de/json/list.php?lat=${lat}&lng=${lng}&rad=${rad}&sort=dist&type=all&apikey=${TANKERKOENIG_API_KEY}`
                );

                if (response.data.ok) {
                    setFuelData(response.data.stations);
                } else {
                    setError(response.data.message);
                }
            } catch (err: any) {
                setError('Fehler bei der Abfrage der Kraftstoffpreise.');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchFuelPrices();
    }, [countryFilter]); // Effekt wird bei Änderung des Filters neu ausgeführt

    const handleFilterChange = (event: React.MouseEvent<HTMLElement>, newFilter: 'DE' | 'AT' | 'EU' | null) => {
        if (newFilter !== null) {
            setCountryFilter(newFilter);
        }
    };

    // Helfer-Funktion, um den Inhalt basierend auf dem Zustand zu rendern
    const renderContent = () => {
        if (isLoading) {
            return <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={24} /></Box>;
        }
        if (error) {
            return <Alert severity="error" sx={{ m: 1 }}>{error}</Alert>;
        }
        if (countryFilter !== 'DE') {
            return <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>Daten für {countryFilter} sind noch nicht verfügbar.</Typography>;
        }
        if (fuelData.length > 0) {
            return (
                <Box sx={{ maxHeight: 260, overflowY: 'auto' }}>
                    {fuelData.map((station) => (
                        <Box key={station.id} sx={{ mb: 1.5, px: 1 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{station.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{station.street}, {station.place}</Typography>
                            <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                                {station.e5 > 0 && <Chip label={`E5: ${station.e5} €`} color="success" size="small" />}
                                {station.e10 > 0 && <Chip label={`E10: ${station.e10} €`} color="info" size="small" />}
                                {station.diesel > 0 && <Chip label={`Diesel: ${station.diesel} €`} color="warning" size="small" />}
                            </Box>
                             <Typography variant="caption" color={station.isOpen ? 'green' : 'red'}>{station.isOpen ? 'Geöffnet' : 'Geschlossen'}</Typography>
                        </Box>
                    ))}
                </Box>
            );
        }
        return <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>Keine Tankstellen im Umkreis gefunden.</Typography>;
    };

    return (
        <WidgetPaper title="Kraftstoffpreise" widgetId={widgetId} onDelete={onDelete} isRemovable={isRemovable} loading={isLoading} error={error}>
             <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-start' }}>
                <ToggleButtonGroup
                    value={countryFilter}
                    exclusive
                    onChange={handleFilterChange}
                    aria-label="Länderfilter"
                    size="small"
                >
                    <ToggleButton value="DE" aria-label="Deutschland" onMouseDown={(e) => e.stopPropagation()}>DE</ToggleButton>
                    <ToggleButton value="AT" aria-label="Österreich" onMouseDown={(e) => e.stopPropagation()}>AT</ToggleButton>
                    <ToggleButton value="EU" aria-label="Europäische Union" onMouseDown={(e) => e.stopPropagation()}>EU</ToggleButton>
                </ToggleButtonGroup>
            </Box>
            <Divider sx={{ mb: 2 }}/>
            {renderContent()}
        </WidgetPaper>
    );
};

export default FuelPricesWidget;