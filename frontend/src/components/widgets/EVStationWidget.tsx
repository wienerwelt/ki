import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, CircularProgress, Alert, List, ListItem, ListItemText, ListItemIcon,
  IconButton, Tooltip, Chip, Button, Stack, Link as MuiLink,
  TextField, InputAdornment, Divider, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, Select, MenuItem
} from '@mui/material';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useNavigate } from 'react-router-dom';

import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import SearchIcon from '@mui/icons-material/Search';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PowerIcon from '@mui/icons-material/Power';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CloseIcon from '@mui/icons-material/Close';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';

import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps, Region } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import { useSnackbar } from '../../context/SnackbarContext';

type ViewMode = 'favorites' | 'search';
type CountryCode = 'DE' | 'AT' | string;

interface EVStationWidgetProps extends BaseWidgetProps {
  icon?: React.ReactNode;
  title: string;
  widgetTypeKey: string;
}

interface StationData {
  id: string; external_id: string; name?: string | null;
  country_code?: CountryCode | null; street?: string | null;
  post_code?: string | null; city?: string | null;
  lat?: number | null; lng?: number | null; provider?: string | null;
  operator_name?: string | null; charge_point_count?: number | null;
  power_kw?: number | string | null; connector_types?: string[] | null;
  is_trusted_source?: boolean; 
}

const FAVORITES_LIMIT = 10;
const PAGE_SIZE = 10;

const providerUrls: { [key: string]: string } = {
  'E-Control': 'https://www.e-control.at/ladestellen', // Behalten wir für alte Favoriten
  'OpenChargeMap': 'https://openchargemap.org/site'
};

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

const EVStationWidget: React.FC<EVStationWidgetProps> = ({
  onDelete, widgetId, isRemovable, icon, title, widgetTypeKey
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSnackbar } = useSnackbar();

  const [favorites, setFavorites] = useState<StationData[]>([]);
  const [allSearchResults, setAllSearchResults] = useState<StationData[]>([]);
  const [displayedResults, setDisplayedResults] = useState<StationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('favorites');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedStation, setSelectedStation] = useState<StationData | null>(null);

  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<L.FeatureGroup>(new L.FeatureGroup());

  const fetchFavoritesFromDB = useCallback(async () => {
    if (!user) { setFavorites([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const { data } = await apiClient.get(`/api/users/favorites?widgetType=${widgetTypeKey}`);
      setFavorites(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Favoriten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [user, widgetTypeKey]);

  useEffect(() => {
    fetchFavoritesFromDB();
    if (user?.regions && user.regions.length > 0) {
        const defaultRegion = user.regions.find(r => !!r.is_default) || user.regions[0];
        setSelectedRegion(defaultRegion);
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => showSnackbar("Standort konnte nicht ermittelt werden.", "info")
    );
  }, [fetchFavoritesFromDB, showSnackbar, user?.regions]);
  
  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
        mapRef.current = L.map(mapContainerRef.current, { attributionControl: false }).setView([51.16, 10.45], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);
        markersRef.current.addTo(mapRef.current);
    }
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapContainerRef.current) return;
    const map = mapRef.current;
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: true });
    });
    ro.observe(mapContainerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    markersRef.current.clearLayers();
    const stationsToShow = viewMode === 'favorites' ? favorites : displayedResults;
    
    stationsToShow.forEach((s) => {
        if (s.lat && s.lng) {
            const mapUrl = `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`;
            const popupContent = `<b>${s.name}</b><br/>Betreiber: ${s.operator_name || 'N/A'}<br/><a href="${mapUrl}" target="_blank" rel="noopener noreferrer">Auf Google Maps ansehen</a>`;
            L.marker([s.lat, s.lng]).bindPopup(popupContent).addTo(markersRef.current);
        }
    });
    
    if (markersRef.current.getLayers().length > 0) {
        map.fitBounds(markersRef.current.getBounds(), { padding: [40, 40], maxZoom: 14 });
    }
  }, [favorites, displayedResults, viewMode]);

  const handleSearch = async (useLocation: boolean = false) => {
    if (!selectedRegion) return showSnackbar("Bitte wählen Sie ein Land.", "warning");
    if (!useLocation && !searchTerm.trim()) return showSnackbar("Bitte einen Suchbegriff eingeben.", "info");
    if (useLocation && !userLocation) return showSnackbar("Standort nicht verfügbar.", "warning");
    
    setSearchLoading(true); setAllSearchResults([]); setDisplayedResults([]); setError(null);
    try {
        const { data } = await apiClient.get('/api/data/ev/search', {
             params: { 
                country: selectedRegion.code,
                lat: useLocation ? userLocation?.lat : undefined,
                lng: useLocation ? userLocation?.lng : undefined,
                query: useLocation ? undefined : searchTerm.trim()
            }
        });
        setAllSearchResults(data.stations || []);
        setDisplayedResults((data.stations || []).slice(0, PAGE_SIZE));
    } catch (err: any) {
        setError(err.response?.data?.message || 'Suche fehlgeschlagen');
    } finally {
        setSearchLoading(false);
    }
  };

  const handleLoadMore = () => {
    const currentLength = displayedResults.length;
    const moreResults = allSearchResults.slice(currentLength, currentLength + PAGE_SIZE);
    setDisplayedResults([...displayedResults, ...moreResults]);
  };

  const isFavorite = useCallback((externalId: string) => favorites.some(f => f.external_id === externalId), [favorites]);

  const toggleFavorite = useCallback(async (station: StationData) => {
    const fav = isFavorite(station.external_id);
    if (!fav && favorites.length >= FAVORITES_LIMIT) {
      showSnackbar(`Maximale Anzahl von ${FAVORITES_LIMIT} Favoriten erreicht.`, 'warning');
      return;
    }
    try {
      if (fav) {
        await apiClient.delete(`/api/users/favorites/${station.external_id}?widgetType=${widgetTypeKey}`);
        showSnackbar('Favorit entfernt', 'info');
      } else {
        await apiClient.post('/api/users/favorites', { widgetType: widgetTypeKey, favorite: station });
        showSnackbar('Favorit hinzugefügt', 'success');
      }
      fetchFavoritesFromDB();
    } catch (err) {
      showSnackbar('Aktion fehlgeschlagen', 'error');
    }
  }, [isFavorite, widgetTypeKey, fetchFavoritesFromDB, showSnackbar, favorites.length]);
  

  // --- START: KORRIGIERTER BLOCK ---
  // Diese Funktion wurde überarbeitet, um die E-Control-Logik zu entfernen
  // und den TypeScript-Fehler zu beheben.
  const renderProviderAttribution = () => {
    let providerName: string | null = null;
    const stationsToShow = viewMode === 'favorites' ? favorites : displayedResults;

    if (stationsToShow.length > 0) {
        // KORREKTUR: Wir leiten die Anbieter aus den *Daten* ab, nicht aus der Region.
        // Wir beheben den TS-Fehler, indem wir explizit nach Strings filtern.
        const uniqueProviders = [...new Set(
            stationsToShow.map(f => f.provider).filter((p): p is string => !!p)
        )];
        
        if (uniqueProviders.length === 1) {
            providerName = uniqueProviders[0]; // z.B. "OpenChargeMap"
        } else if (uniqueProviders.length > 1) {
            // Zeigt "Quellen: OpenChargeMap, E-Control" an, falls alte Favoriten vorhanden sind
            return <Typography variant="caption" color="text.secondary">Quellen: {uniqueProviders.join(', ')}</Typography>;
        }
    }

    // Fallback: Wenn die Daten keinen Anbieter haben, aber wir im Suchmodus sind,
    // wissen wir, dass es OCM sein muss (gemäß unserem Backend).
    if (viewMode === 'search' && !providerName && displayedResults.length > 0) {
        providerName = 'OpenChargeMap';
    }

    if (!providerName) return null; // Nichts anzeigen, wenn keine Daten da sind
    
    const url = providerUrls[providerName];
    if (!url) {
        // Fallback, falls der Name (z.B. von alten Favoriten) nicht in unserer URL-Liste ist
        return <Typography variant="caption" color="text.secondary">Quelle: {providerName}</Typography>;
    }

    return (
        <Typography variant="caption" color="text.secondary">
            Quelle: <MuiLink href={url} target="_blank" rel="noopener noreferrer">{providerName}</MuiLink>
        </Typography>
    );
  };
  // --- ENDE: KORRIGIERTER BLOCK ---


  const renderListItem = (station: StationData) => {
    const fullAddress = `${station.street || ''}, ${station.post_code || ''} ${station.city || ''}`.trim().replace(/^,|,$/g, '');
    
    return (
      <ListItem key={station.external_id} divider button onClick={() => setSelectedStation(station)}
        secondaryAction={
            <Tooltip title={isFavorite(station.external_id) ? "Favorit entfernen" : "Zu Favoriten hinzufügen"}>
                <IconButton onClick={(e) => { e.stopPropagation(); toggleFavorite(station); }} edge="end">
                {isFavorite(station.external_id) ? <StarIcon color="warning" /> : <StarBorderIcon />}
                </IconButton>
            </Tooltip>
        }
      >
        <ListItemIcon sx={{minWidth: 36}}>
            {station.country_code && <img src={`https://flagcdn.com/w20/${station.country_code.toLowerCase()}.png`} alt={station.country_code} style={{flexShrink: 0, borderRadius: '2px'}} />}
        </ListItemIcon>
        <ListItemText
          primary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{station.name}</Typography>
                {station.is_trusted_source && (
                    <Tooltip title="Info zu geprüften Quellen">
                        <IconButton size="small" sx={{p:0}} onClick={(e) => { e.stopPropagation(); navigate('/trusted-sources'); }}>
                            <VerifiedUserIcon sx={{ fontSize: 16, color: 'success.main' }} />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
          }
          secondary={fullAddress || "Keine Adressdaten"}
        />
        <Stack direction="column" alignItems="flex-end" spacing={0.5}>
            {station.power_kw != null && 
                <Tooltip title="Maximale Ladeleistung" placement="top">
                    <Chip icon={<PowerIcon />} label={`${station.power_kw} kW`} size="small" variant="outlined" color="success" />
                </Tooltip>
            }
            {station.charge_point_count != null && 
                <Tooltip title="Anzahl der Ladepunkte" placement="top">
                    <Chip icon={<AccountTreeIcon />} label={station.charge_point_count} size="small" variant="outlined" />
                </Tooltip>
            }
        </Stack>
      </ListItem>
    );
  };
  
  return (
    <WidgetPaper 
      title={<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>{icon}<Typography variant="h6">{title}</Typography></Box>}
      widgetId={widgetId} onDelete={onDelete} isRemovable={isRemovable} 
      widgetTitle={title} widgetTypeKey={widgetTypeKey} noPadding
    >
      <Box sx={{ p: 2, pb: 1, height: 150, position: 'relative', bgcolor: 'grey.200' }} ref={mapContainerRef} />

      {viewMode === 'search' && (
        <Box sx={{ p: 2, pt: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            {user?.regions && (
              <FormControl size="small">
                <Select value={selectedRegion?.id || ''} onChange={(e) => setSelectedRegion(user?.regions?.find(r => r.id === e.target.value) || null)}>
                  {user.regions.map(r => <MenuItem key={r.id} value={r.id}><img src={`https://flagcdn.com/w20/${r.code.toLowerCase()}.png`} alt={r.code} /></MenuItem>)}
                </Select>
              </FormControl>
            )}
            <TextField
              fullWidth size="small" placeholder="PLZ, Stadt oder Adresse..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(false)}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="In meiner Nähe suchen"><IconButton onClick={() => handleSearch(true)} disabled={!userLocation || searchLoading} edge="end"><MyLocationIcon /></IconButton></Tooltip>
                    <IconButton onClick={() => handleSearch(false)} disabled={searchLoading} edge="end"><SearchIcon /></IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Stack>
        </Box>
      )}
      
      <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 2 }}>
        {error && <Alert severity="warning">{error}</Alert>}
        {viewMode === 'favorites' && (
          loading ? <CircularProgress sx={{ display: 'block', mx: 'auto', my: 2 }}/> : (
            <List dense sx={{ p: 0 }}>
              {favorites.length > 0 ? favorites.map(fav => renderListItem(fav)) : (
                <Typography sx={{ p: 2, textAlign: 'center' }} color="text.secondary">Keine Favoriten gespeichert.</Typography>
              )}
            </List>
          )
        )}
        {viewMode === 'search' && (
          searchLoading && displayedResults.length === 0 ? <CircularProgress sx={{ display: 'block', mx: 'auto', my: 2 }}/> : (
              <List dense sx={{ p: 0 }}>
                  {displayedResults.length > 0 
                    ? displayedResults.map(station => renderListItem(station))
                    : !searchLoading && <Typography sx={{p: 2, textAlign: 'center'}} color="text.secondary">Keine Stationen gefunden.</Typography>
                  }
              </List>
          )
        )}
      </Box>
      
      {viewMode === 'search' && displayedResults.length < allSearchResults.length && (
          <Box sx={{ textAlign: 'center', py: 1 }}>
              <Button onClick={handleLoadMore}>
                  Mehr laden ({displayedResults.length} / {allSearchResults.length})
              </Button>
          </Box>
      )}
      
      <Divider />
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1 }}>
        <Button size="small" startIcon={viewMode === 'favorites' ? <AddCircleOutlineIcon/> : <ArrowBackIcon />} onClick={() => { setAllSearchResults([]); setDisplayedResults([]); setSearchTerm(''); setError(null); setViewMode(viewMode === 'favorites' ? 'search' : 'favorites'); }}>
          {viewMode === 'favorites' ? `Hinzufügen (${favorites.length}/${FAVORITES_LIMIT})` : 'Zurück'}
        </Button>
        {renderProviderAttribution()}
      </Stack>

      <Dialog open={!!selectedStation} onClose={() => setSelectedStation(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <Typography variant="h6" component="div">{selectedStation?.name}</Typography>
            <IconButton onClick={() => setSelectedStation(null)}><CloseIcon/></IconButton>
        </DialogTitle>
        <DialogContent dividers>
            <Stack spacing={2}>
                <Box>
                    <Typography variant="overline" color="text.secondary">Adresse</Typography>
                    <Typography>{`${selectedStation?.street || ''}, ${selectedStation?.post_code || ''} ${selectedStation?.city || ''}`}</Typography>
                </Box>
                <Box>
                    <Typography variant="overline" color="text.secondary">Betreiber</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography>{selectedStation?.operator_name}</Typography>
                        {selectedStation?.is_trusted_source && (
                          <Tooltip title="Info zu geprüften Quellen">
                                <IconButton size="small" sx={{p:0}} onClick={(e) => { e.stopPropagation(); navigate('/trusted-sources'); }}>
                                    <VerifiedUserIcon sx={{ fontSize: 16, color: 'success.main' }} />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Box>
                </Box>
                 <Stack direction="row" spacing={4}>
                    <Box>
                        <Typography variant="overline" color="text.secondary">Ladepunkte</Typography>
                        <Typography>{selectedStation?.charge_point_count}</Typography>
                    </Box>
                    <Box>
                        <Typography variant="overline" color="text.secondary">Max. Leistung</Typography>
                        <Typography>{selectedStation?.power_kw} kW</Typography>
                    </Box>
                </Stack>
                {selectedStation?.connector_types && selectedStation.connector_types.length > 0 && (
                     <Box>
                        <Typography variant="overline" color="text.secondary">Steckertypen</Typography>
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{pt: 0.5}}>
                            {selectedStation.connector_types.map((type: string) => <Chip key={type} label={type} size="small" />)}
                        </Stack>
                    </Box>
                )}
            </Stack>
        </DialogContent>
        <DialogActions>
            <Button startIcon={<MapOutlinedIcon />} onClick={() => {
                if(selectedStation?.lat && selectedStation?.lng && mapRef.current){
                    mapRef.current.setView([selectedStation.lat, selectedStation.lng], 16);
                    setSelectedStation(null);
                }
            }}>Auf Karte zeigen</Button>
        </DialogActions>
      </Dialog>
    </WidgetPaper>
  );
};

export default EVStationWidget;