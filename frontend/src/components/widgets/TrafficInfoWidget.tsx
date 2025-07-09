import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    Box, 
    Typography, 
    CircularProgress, 
    Alert, 
    Chip, 
    ToggleButtonGroup, 
    ToggleButton,
    Link as MuiLink 
} from '@mui/material';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';

// Diese Funktion gibt den zweistelligen Ländercode für die Flagge zurück
const getFlagCodeForRegion = (regionName: string): string => {
    const lowerRegion = (regionName || '').toLowerCase();
    const countryCodes: { [key: string]: string } = {
        'österreich': 'at', 'austria': 'at', 'deutschland': 'de', 'germany': 'de', 'bayern': 'de',
        'tschechien': 'cz', 'czech': 'cz', 'ungarn': 'hu', 'hungary': 'hu', 'italien': 'it', 'italy': 'it',
        'südtirol': 'it', 'brenner': 'it', 'schweiz': 'ch', 'switzerland': 'ch', 'niederlande': 'nl',
        'netherlands': 'nl', 'polen': 'pl', 'poland': 'pl', 'slowakei': 'sk', 'slovakia': 'sk',
        'slowenien': 'si', 'slovenia': 'si', 'kroatien': 'hr', 'croatia': 'hr', 'luxemburg': 'lu',
        'luxembourg': 'lu', 'frankreich': 'fr', 'france': 'fr', 'dänemark': 'dk', 'denmark': 'dk',
        'belgien': 'be', 'belgium': 'be', 'liechtenstein': 'li', 'rumänien': 'ro', 'romania': 'ro',
    };
    for (const keyword in countryCodes) {
        if (lowerRegion.includes(keyword)) return countryCodes[keyword];
    }
    return 'eu';
};

// Hilfsfunktion, um den Hostnamen (z.B. "oeamtc.at") aus einer URL zu extrahieren
const extractHostname = (url: string): string => {
    if (!url) return 'Unbekannte Quelle';
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch (e) {
        return 'Unbekannte Quelle';
    }
};

const TrafficInfoWidget: React.FC<BaseWidgetProps> = ({ onDelete, widgetId, isRemovable }) => {
    const [trafficResponse, setTrafficResponse] = useState<{ data: any[], source: string } | null>(null);
    const [filter, setFilter] = useState<'heute' | 'aelter'>('heute');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchTrafficInfo = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.get('/api/data/traffic-info', {
                headers: { 'x-auth-token': token },
            });
            setTrafficResponse(response.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Verkehrsdaten konnten nicht geladen werden.');
            setTrafficResponse(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTrafficInfo();
    }, [fetchTrafficInfo]);

    const handleFilterChange = (event: React.MouseEvent<HTMLElement>, newFilter: 'heute' | 'aelter' | null) => {
        if (newFilter !== null) {
            setFilter(newFilter);
        }
    };

    const gefilterteMeldungen = useMemo(() => {
        if (!trafficResponse?.data) return [];
        const heuteStart = new Date();
        heuteStart.setHours(0, 0, 0, 0);
        return trafficResponse.data.filter((item: any) => {
            if (!item.published_at) return false;
            const meldungsDatum = new Date(item.published_at);
            return filter === 'heute' ? meldungsDatum >= heuteStart : meldungsDatum < heuteStart;
        });
    }, [trafficResponse, filter]);

    const dynamicSource = useMemo(() => {
        if (trafficResponse && trafficResponse.data.length > 0) {
            return extractHostname(trafficResponse.data[0].link);
        }
        return 'Keine Daten';
    }, [trafficResponse]);

    return (
        <WidgetPaper 
            title="Verkehrsinformationen" 
            widgetId={widgetId} 
            onDelete={onDelete} 
            isRemovable={isRemovable}
            loading={isLoading}
            error={error}
        >
            {!isLoading && !error && trafficResponse && (
                <>
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-start' }}>
                        <ToggleButtonGroup value={filter} exclusive onChange={handleFilterChange} aria-label="Meldungen filtern" size="small">
                            <ToggleButton value="heute" aria-label="heutige meldungen" onMouseDown={(e) => e.stopPropagation()}>Heutige Meldungen</ToggleButton>
                            <ToggleButton value="aelter" aria-label="ältere meldungen" onMouseDown={(e) => e.stopPropagation()}>Ältere Meldungen</ToggleButton>
                        </ToggleButtonGroup>
                    </Box>

                    <Box sx={{ maxHeight: 260, overflowY: 'auto' }}>
                        {gefilterteMeldungen.length > 0 ? (
                            gefilterteMeldungen.map((item: any) => {
                                const flagCode = getFlagCodeForRegion(item.region);
                                return (
                                    <Box key={item.id || item.title} sx={{ mb: 1.5 }}>
                                        <Typography variant="body2" component="div">
                                            <Box component="span" sx={{ fontWeight: 'bold' }}>
                                                {item.published_at ? new Date(item.published_at).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'} Uhr
                                            </Box>
                                            {' - '}
                                            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                <img src={`https://flagcdn.com/w20/${flagCode}.png`} width="12" height="9" alt={`Flagge ${flagCode}`} />
                                                <span>{item.region || '-'}</span>
                                            </Box>
                                        </Typography>
                                        
                                        {/* KORREKTUR: Die onMouseDown-Anweisung wurde entfernt */}
                                        <Typography variant="subtitle2" component="a" href={item.link} target="_blank" rel="noopener noreferrer" sx={{ textDecoration: 'none', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}>
                                            {item.title}
                                        </Typography>
                                        
                                        {item.type && <Chip label={item.type} size="small" sx={{ mt: 0.5 }} />}
                                    </Box>
                                );
                            })
                        ) : (
                            <Typography variant="body2" color="text.secondary">
                                {filter === 'heute' ? 'Keine heutigen Meldungen gefunden.' : 'Keine älteren Meldungen gefunden.'}
                            </Typography>
                        )}
                    </Box>
                    
                    <Typography variant="caption" sx={{ mt: 1, display: 'block', textAlign: 'right' }}>
                        Quelle: {dynamicSource !== 'Keine Daten' && dynamicSource !== 'Unbekannte Quelle' ? (
                            <MuiLink href={`https://${dynamicSource}`} target="_blank" rel="noopener noreferrer" underline="hover">
                                {dynamicSource}
                            </MuiLink>
                        ) : dynamicSource}
                    </Typography>
                </>
            )}

            {!isLoading && !error && !trafficResponse && (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                    Keine Daten verfügbar.
                </Typography>
            )}
        </WidgetPaper>
    );
};

export default TrafficInfoWidget;