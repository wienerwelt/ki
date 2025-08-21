import React, { useState, useEffect, useRef } from 'react';
import {
    Box, Typography, CircularProgress, Alert, List, ListItem, ListItemIcon, ListItemText, Divider,
    TextField, MenuItem, Tooltip, InputAdornment, Paper, Link as MuiLink, Dialog, DialogTitle,
    DialogContent, IconButton, Stack, Chip, Button, Pagination
} from '@mui/material';
import EvStationIcon from '@mui/icons-material/EvStation';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import MapIcon from '@mui/icons-material/Map';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined'; // NEU
import { useNavigate } from 'react-router-dom'; // NEU
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps, Region } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const PAGE_SIZE = 50;

// NEU: Props erweitert, um konsistent zu sein
interface EVStationWidgetProps extends BaseWidgetProps {
    icon?: React.ReactNode;
    title: string;
    widgetTypeKey: string;
}

const EVStationWidget: React.FC<EVStationWidgetProps> = ({ onDelete, widgetId, isRemovable, title, icon, widgetTypeKey }) => {
    const { user } = useAuth();
    const navigate = useNavigate(); // NEU
    const [stations, setStations] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
    const [city, setCity] = useState('');
    const [selectedStation, setSelectedStation] = useState<any | null>(null);
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);

    const mapRef = useRef<L.Map | null>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const markersRef = useRef<L.FeatureGroup>(new L.FeatureGroup());

    useEffect(() => {
        if (user?.regions && user.regions.length > 0) {
            const defaultRegion = user.regions.find(r => !!r.is_default) || user.regions[0];
            setSelectedRegion(defaultRegion);
        }
    }, [user?.regions]);

    useEffect(() => {
        setPage(1);
    }, [selectedRegion, city]);

    useEffect(() => {
        if (!selectedRegion) {
            setStations([]);
            setTotalCount(0);
            return;
        }

        // Suche nur starten, wenn eine Stadt eingegeben wurde
        if (!city) {
            setStations([]);
            setTotalCount(0);
            // Fehler zurücksetzen, wenn das Suchfeld geleert wird
            setError(null);
            setIsLoading(false);
            return;
        }

        const fetchStations = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const token = localStorage.getItem('jwt_token');
                const params = {
                    countrycode: selectedRegion.code,
                    city: city,
                    maxresults: PAGE_SIZE,
                    offset: (page - 1) * PAGE_SIZE,
                };
                const response = await apiClient.get('/api/data/ev-stations', {
                    params,
                    headers: { 'x-auth-token': token }
                });
                setStations(Array.isArray(response.data.stations) ? response.data.stations : []);
                setTotalCount(response.data.totalCount || 0);
            } catch (err: any) {
                setError(err.response?.data?.message || 'Fehler beim Abrufen der Ladestationsdaten.');
                setStations([]);
                setTotalCount(0);
            } finally {
                setIsLoading(false);
            }
        };

        const debounceTimer = setTimeout(() => {
            fetchStations();
        }, 500); // 500ms debounce

        return () => clearTimeout(debounceTimer);

    }, [selectedRegion, city, page]);

    useEffect(() => {
        if (mapContainerRef.current && !mapRef.current) {
            mapRef.current = L.map(mapContainerRef.current, { attributionControl: false }).setView([51.505, 10.4515], 5);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);
            markersRef.current.addTo(mapRef.current);

            // Workaround für die Kartengröße in flexiblen Layouts
            setTimeout(() => mapRef.current?.invalidateSize(), 400);
        }
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !stations) return;

        markersRef.current.clearLayers();
        if (stations.length > 0) {
            stations.forEach(station => {
                if (station.AddressInfo?.Latitude && station.AddressInfo?.Longitude) {
                    const marker = L.marker([station.AddressInfo.Latitude, station.AddressInfo.Longitude]);
                    marker.bindPopup(`<b>${station.AddressInfo.Title}</b><br>${station.AddressInfo.AddressLine1}`);
                    marker.on('click', () => setSelectedStation(station));
                    markersRef.current.addLayer(marker);
                }
            });
            map.fitBounds(markersRef.current.getBounds(), { padding: [50, 50], maxZoom: 14 });
        } else if (selectedRegion) {
            // KORREKTUR: Prüfe auf latitude/longitude, bevor darauf zugegriffen wird
            const lat = (selectedRegion as any).latitude;
            const lon = (selectedRegion as any).longitude;
            if (lat && lon) {
                map.flyTo([lat, lon], 8);
            }
        }
    }, [stations, selectedRegion]);
    
    // NEU: Funktion zum Melden von Fehlern
    const handleReportError = () => {
        navigate('/feedback', {
            state: { type: 'bug', widget: title, error: error, widgetKey: widgetTypeKey }
        });
    };

    const handleStationClick = (station: any) => setSelectedStation(station);
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    return (
        <WidgetPaper
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', width: '100%' }}>
                    {icon}
                    <Typography variant="h6">{title}</Typography>
                </Box>
            }
            // KORREKTUR: Fehlende Props hinzugefügt
            widgetTitle={title}
            widgetTypeKey={widgetTypeKey}
            widgetId={widgetId || ''}
            onDelete={onDelete}
            isRemovable={isRemovable}
            noPadding // Karte soll den vollen Platz einnehmen
        >
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Box ref={mapContainerRef} sx={{ height: 240, width: '100%', zIndex: 0, bgcolor: 'grey.200' }} />
                
                <Box sx={{ p: 2, display: 'flex', gap: 2 }}>
                    {user?.regions && user.regions.length > 0 && (
                        <TextField
                            select value={selectedRegion?.id || ''}
                            onChange={(e) => {
                                const region = user?.regions?.find(r => r.id === e.target.value);
                                setSelectedRegion(region || null);
                            }}
                            size="small" variant="outlined"
                            sx={{ minWidth: 60, '& .MuiSelect-select': { paddingRight: '24px' } }}
                        >
                            {user?.regions?.map((region) => (
                                <MenuItem key={region.id} value={region.id}>
                                    <Tooltip title={region.name} placement="right">
                                        <img src={`https://flagcdn.com/w20/${region.code.toLowerCase()}.png`} width="20" alt={region.name} style={{ border: '1px solid #eee' }} />
                                    </Tooltip>
                                </MenuItem>
                            ))}
                        </TextField>
                    )}
                    <TextField
                        fullWidth size="small" variant="outlined" placeholder="Suche nach Stadt oder Ort"
                        value={city} onChange={(e) => setCity(e.target.value)}
                        InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>)}}
                    />
                </Box>
                
                <Divider />

                <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
                    {isLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 3 }}><CircularProgress /></Box>
                    ) : error ? (
                        // NEU: Konsistente Fehlerbehandlung
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
                    ) : stations.length > 0 ? (
                        <List dense>
                            {stations.map((station) => (
                                <ListItem button key={station.ID} onClick={() => handleStationClick(station)}>
                                    <ListItemIcon sx={{ minWidth: 36 }}><EvStationIcon color="primary" /></ListItemIcon>
                                    <ListItemText primary={<Typography variant="body2" sx={{ fontWeight: 'bold' }}>{station.AddressInfo.Title}</Typography>} secondary={`${station.AddressInfo.AddressLine1 || ''}, ${station.AddressInfo.Town || ''}`} />
                                </ListItem>
                            ))}
                        </List>
                    ) : (
                        <Box sx={{ pt: 2, textAlign: 'center' }}>
                            {!city ? (
                                <Typography variant="body2" color="text.secondary">Bitte ein Land und einen Ort für die Suche eingeben.</Typography>
                            ) : (
                                <Typography variant="body2" color="text.secondary">Keine passenden Stationen in diesem Ort gefunden.</Typography>
                            )}
                        </Box>
                    )}
                </Box>

                {totalPages > 1 && <Divider />}
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 1 }}>
                    {totalPages > 1 && <Pagination count={totalPages} page={page} onChange={(_e, value) => setPage(value)} color="primary" size="small" />}
                </Box>
            </Box>

            {/* Der Dialog bleibt unverändert */}
            <Dialog open={!!selectedStation} onClose={() => setSelectedStation(null)} fullWidth maxWidth="sm">
                {/* ... Dialog Content ... */}
            </Dialog>
        </WidgetPaper>
    );
};

export default EVStationWidget;