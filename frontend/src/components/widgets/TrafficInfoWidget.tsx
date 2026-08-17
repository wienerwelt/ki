import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Box,
    Typography,
    CircularProgress,
    Alert,
    Chip,
    ToggleButtonGroup,
    ToggleButton,
    Link as MuiLink,
    Button
} from '@mui/material';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import { useNavigate } from 'react-router-dom';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';

// Props-Interface erweitert, um konsistent zu sein
interface TrafficInfoWidgetProps extends BaseWidgetProps {
    icon?: React.ReactNode;
    title: string;
    widgetTypeKey: string;
}

// Hilfsfunktionen (unverändert)
const getFlagCodeForRegion = (regionName: string): string => {
    const lowerRegion = (regionName || '').toLowerCase();
    const countryCodes: { [key: string]: string } = { 'österreich': 'at', 'austria': 'at', 'deutschland': 'de', 'germany': 'de', 'bayern': 'de', 'tschechien': 'cz', 'czech': 'cz', 'ungarn': 'hu', 'hungary': 'hu', 'italien': 'it', 'italy': 'it', 'südtirol': 'it', 'brenner': 'it', 'schweiz': 'ch', 'switzerland': 'ch', 'niederlande': 'nl', 'netherlands': 'nl', 'polen': 'pl', 'poland': 'pl', 'slowakei': 'sk', 'slovakia': 'sk', 'slowenien': 'si', 'slovenia': 'si', 'kroatien': 'hr', 'croatia': 'hr', 'luxemburg': 'lu', 'luxembourg': 'lu', 'frankreich': 'fr', 'france': 'fr', 'dänemark': 'dk', 'denmark': 'dk', 'belgien': 'be', 'belgium': 'be', 'liechtenstein': 'li', 'rumänien': 'ro', 'romania': 'ro' };
    for (const keyword in countryCodes) { if (lowerRegion.includes(keyword)) return countryCodes[keyword]; }
    return 'eu';
};
const extractHostname = (url: string): string => {
    if (!url) return 'Unbekannte Quelle';
    try { return new URL(url).hostname.replace('www.', ''); } catch (e) { return 'Unbekannte Quelle'; }
};


const TrafficInfoWidget: React.FC<TrafficInfoWidgetProps> = ({ onDelete, widgetId, isRemovable, title, icon, widgetTypeKey }) => {
    const [trafficResponse, setTrafficResponse] = useState<{ data: any[], source: string } | null>(null);
    const [filter, setFilter] = useState<'heute' | 'aelter'>('heute');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const fetchTrafficInfo = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const token = 'cookie-session';
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

    const handleReportError = () => {
        navigate('/feedback', {
            state: { type: 'bug', widget: title, error: error, widgetKey: widgetTypeKey }
        });
    };

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
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {icon}
                    <Typography variant="h6">{title}</Typography>
                </Box>
            }
            widgetTitle={title} // widgetTitle wird für das generische Feedback benötigt
            widgetTypeKey={widgetTypeKey}
            widgetId={widgetId}
            onDelete={onDelete}
            isRemovable={isRemovable}
        >
            {/* Die Logik für Laden/Fehler/Inhalt wird jetzt hier direkt gehandhabt */}
            {isLoading ? (
                <Box sx={{ m: 'auto', textAlign: 'center' }}>
                    <CircularProgress />
                </Box>
            ) : error ? (
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
            ) : trafficResponse ? (
                <>
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-start' }}>
                        <ToggleButtonGroup value={filter} exclusive onChange={handleFilterChange} aria-label="Meldungen filtern" size="small">
                            <ToggleButton value="heute" aria-label="heutige meldungen">Heutige Meldungen</ToggleButton>
                            <ToggleButton value="aelter" aria-label="ältere meldungen">Ältere Meldungen</ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                    <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                        {gefilterteMeldungen.length > 0 ? (
                            gefilterteMeldungen.map((item: any) => (
                                <Box key={item.id || item.title} sx={{ mb: 1.5 }}>
                                    <Typography variant="body2" component="div">
                                        <Box component="span" sx={{ fontWeight: 'bold' }}>
                                            {item.published_at ? new Date(item.published_at).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'} Uhr
                                        </Box>
                                        {' - '}
                                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                            <img src={`https://flagcdn.com/w20/${getFlagCodeForRegion(item.region)}.png`} width="12" height="9" alt={`Flagge ${item.region}`} />
                                            <span>{item.region || '-'}</span>
                                        </Box>
                                    </Typography>
                                    <Typography variant="subtitle2" component="a" href={item.link} target="_blank" rel="noopener noreferrer" sx={{ textDecoration: 'none', color: 'text.primary', '&:hover': { textDecoration: 'underline' } }}>
                                        {item.title}
                                    </Typography>
                                    {item.type && <Chip label={item.type} size="small" sx={{ mt: 0.5 }} />}
                                </Box>
                            ))
                        ) : (
                            <Typography variant="body2" color="text.secondary">
                                Keine Meldungen für diese Auswahl gefunden.
                            </Typography>
                        )}
                    </Box>
                    <Typography variant="caption" sx={{ mt: 1, pt: 1, display: 'block', textAlign: 'right', borderTop: 1, borderColor: 'divider' }}>
                        Quelle: {dynamicSource !== 'Keine Daten' && dynamicSource !== 'Unbekannte Quelle' ? (
                            <MuiLink href={`https://${dynamicSource}`} target="_blank" rel="noopener noreferrer" underline="hover">
                                {dynamicSource}
                            </MuiLink>
                        ) : dynamicSource}
                    </Typography>
                </>
            ) : (
                 <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                    Keine Daten verfügbar.
                </Typography>
            )}
        </WidgetPaper>
    );
};

export default TrafficInfoWidget;