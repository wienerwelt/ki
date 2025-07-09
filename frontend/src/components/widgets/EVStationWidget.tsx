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
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps, Region } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const PAGE_SIZE = 50;

const EVStationWidget: React.FC<BaseWidgetProps> = ({ onDelete, widgetId, isRemovable }) => {
    const { user } = useAuth();
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
            setSelectedRegion(user.regions[0]);
        }
    }, [user?.regions]);

    useEffect(() => {
        setPage(1); // Neue Suche/Region = zurück auf erste Seite
    }, [selectedRegion, city]);

    useEffect(() => {
        if (!selectedRegion || !city) {
            setStations([]);
            setTotalCount(0);
            return;
        }

        const fetchStations = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const token = localStorage.getItem('jwt_token');
                const params: any = {
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
                setError('Fehler beim Abrufen der Ladestationsdaten.');
                setStations([]);
                setTotalCount(0);
            } finally {
                setIsLoading(false);
            }
        };
        fetchStations();
    }, [selectedRegion, city, page]);

    useEffect(() => {
        if (mapContainerRef.current && !mapRef.current) {
            mapRef.current = L.map(mapContainerRef.current, { attributionControl: false }).setView([51.505, 10.4515], 5);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);
            markersRef.current.addTo(mapRef.current);
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
        } else if (selectedRegion?.latitude && selectedRegion?.longitude) {
            map.flyTo([selectedRegion.latitude, selectedRegion.longitude], 8);
        }
    }, [stations, selectedRegion]);

    const handleStationClick = (station: any) => setSelectedStation(station);

    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    return (
        <WidgetPaper
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', width: '100%' }}>
                    <EvStationIcon />
                    <Typography variant="h6">EV Ladestationen</Typography>
                    <Box sx={{ flexGrow: 1 }} />
                    {user?.regions && user.regions.length > 0 && (
                        <TextField
                            select
                            value={selectedRegion?.id || ''}
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
                </Box>
            }
            widgetId={widgetId || ''} onDelete={onDelete} isRemovable={isRemovable}
        >
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 480 }}>
                {/* Karte mit fixer Höhe */}
                <Box ref={mapContainerRef} sx={{ height: 240, width: '100%', zIndex: 0, bgcolor: 'grey.200' }} />

                <Box sx={{ p: 1 }}>
                    <TextField
                        fullWidth
                        size="small"
                        variant="outlined"
                        placeholder="Suche nach Stadt oder Ort"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        InputProps={{
                            startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>),
                        }}
                    />
                </Box>

                {/* Info-Hinweis außerhalb der Trefferliste */}
                <Box sx={{ px: 2, pt: 0 }}>
                    <Alert severity="info" sx={{ mb: 1 }}>
                        Aus technischen Gründen werden maximal die ersten 1.000 Stationen des Landes durchsucht.<br />
                        Die Suche nach Stadt/Ort findet nur die darin enthaltenen Ergebnisse.<br />
                        Für vollständige Ergebnisse verwende die Originalsuche auf&nbsp;
                        <MuiLink href="https://openchargemap.org" target="_blank" rel="noopener">OpenChargeMap</MuiLink>.
                    </Alert>
                </Box>

                <Box sx={{ flex: 1, overflowY: 'auto' }}>
                    {isLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                            <CircularProgress />
                        </Box>
                    ) : error ? (
                        <Alert severity="error" sx={{ m: 1 }}>{error}</Alert>
                    ) : stations.length > 0 ? (
                        <List dense>
                            {stations.map((station, index) => (
                                <React.Fragment key={station.ID}>
                                    <ListItem button onClick={() => handleStationClick(station)}>
                                        <ListItemIcon sx={{ minWidth: 36 }}>
                                            <EvStationIcon color="primary" />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={<Typography variant="body2" sx={{ fontWeight: 'bold' }}>{station.AddressInfo.Title}</Typography>}
                                            secondary={`${station.AddressInfo.AddressLine1 || ''}, ${station.AddressInfo.Town || ''}`}
                                        />
                                    </ListItem>
                                    {index < stations.length - 1 && <Divider />}
                                </React.Fragment>
                            ))}
                        </List>
                    ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                            {city ? 'Keine passenden Stationen in diesem Ort gefunden.' : 'Bitte einen Ort eingeben.'}
                        </Typography>
                    )}
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', my: 2 }}>
                    {totalPages > 1 && (
                        <Pagination
                            count={totalPages}
                            page={page}
                            onChange={(_e, value) => setPage(value)}
                            color="primary"
                            showFirstButton
                            showLastButton
                        />
                    )}
                </Box>
                <Box sx={{ p: 1, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">
                        Daten von <MuiLink href="https://openchargemap.org" target="_blank" rel="noopener">OpenChargeMap</MuiLink>
                    </Typography>
                </Box>
            </Box>

            <Dialog open={!!selectedStation} onClose={() => setSelectedStation(null)} fullWidth maxWidth="sm">
                <DialogTitle>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6">{selectedStation?.AddressInfo.Title}</Typography>
                        <IconButton onClick={() => setSelectedStation(null)}><CloseIcon /></IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent dividers>
                    {selectedStation && (
                        <Stack spacing={2}>
                            <Paper variant="outlined" sx={{ p: 2 }}>
                                <Typography variant="subtitle1" gutterBottom>Standort</Typography>
                                <Typography variant="body2">{selectedStation.AddressInfo.AddressLine1}</Typography>
                                <Typography variant="body2">{selectedStation.AddressInfo.Postcode} {selectedStation.AddressInfo.Town}</Typography>
                                <Typography variant="body2" sx={{ mb: 1 }}>{selectedStation.AddressInfo.Country.Title}</Typography>
                                <Button size="small" startIcon={<MapIcon />} href={`https://www.google.com/maps/search/?api=1&query=${selectedStation.AddressInfo.Latitude},${selectedStation.AddressInfo.Longitude}`} target="_blank" rel="noopener noreferrer">Auf Karte anzeigen</Button>
                            </Paper>
                            <Paper variant="outlined" sx={{ p: 2 }}>
                                <Typography variant="subtitle1" gutterBottom>Betreiber & Kosten</Typography>
                                <Typography variant="body2"><strong>Betreiber:</strong> {selectedStation.OperatorInfo?.Title || 'Unbekannt'}</Typography>
                                <Typography variant="body2"><strong>Kosten:</strong> {selectedStation.UsageCost || 'Keine Angabe'}</Typography>
                            </Paper>
                            <Paper variant="outlined" sx={{ p: 2 }}>
                                <Typography variant="subtitle1" gutterBottom>Anschlüsse ({selectedStation.Connections.length})</Typography>
                                <Stack spacing={1.5} sx={{ maxHeight: 200, overflowY: 'auto', pr: 1 }}>
                                    {selectedStation.Connections.map((conn: any) => (
                                        <Box key={conn.ID} sx={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'space-between' }}>
                                            <Box>
                                                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{conn.ConnectionType.Title}</Typography>
                                                <Typography variant="caption" color="text.secondary">{conn.PowerKW ? `${conn.PowerKW} kW` : ''} {conn.CurrentType?.Title ? `(${conn.CurrentType.Title})` : ''}</Typography>
                                            </Box>
                                            {conn.StatusType?.IsOperational === true && <Chip label={conn.StatusType.Title} color="success" size="small" />}
                                            {conn.StatusType?.IsOperational === false && <Chip label={conn.StatusType.Title} color="error" size="small" />}
                                            {conn.StatusType?.IsOperational == null && <Chip label={conn.StatusType?.Title || 'Unbekannt'} size="small" />}
                                        </Box>
                                    ))}
                                </Stack>
                            </Paper>
                        </Stack>
                    )}
                </DialogContent>
            </Dialog>
        </WidgetPaper>
    );
};

export default EVStationWidget;
