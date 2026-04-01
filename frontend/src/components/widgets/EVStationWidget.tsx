import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Alert, IconButton, Tooltip, Chip, Button, Stack, Link as MuiLink,
  TextField, InputAdornment, Divider, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, Select, MenuItem, useTheme, useMediaQuery, Paper, Skeleton
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import SearchIcon from '@mui/icons-material/Search';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PowerIcon from '@mui/icons-material/Power';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CloseIcon from '@mui/icons-material/Close';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import EvStationIcon from '@mui/icons-material/EvStation';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';

import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps, Region } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import { useSnackbar } from '../../context/SnackbarContext';

type ViewMode = 'favorites' | 'search';
type CountryCode = 'DE' | 'AT' | string;

interface EVStationWidgetProps extends Partial<BaseWidgetProps> {
  icon?: React.ReactNode;
  title: string;
  widgetTypeKey: string;
  widgetId: string;
  isPublic?: boolean;
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
const SUPPORTED_COUNTRIES = ['DE', 'AT'];

const providerUrls: { [key: string]: string } = {
  'E-Control': 'https://www.e-control.at/ladestellen',
  'OpenChargeMap': 'https://openchargemap.org/site'
};

// Leaflet Icon Fix
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

const Flag = ({ code, size = 20 }: { code?: string; size?: number }) => {
    if (!code) return null;
    return <img loading="lazy" width={size} src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`} alt={code} style={{ borderRadius: '2px', display: 'block' }} />;
};

const EVStationWidget: React.FC<EVStationWidgetProps> = ({
  onDelete, widgetId, isRemovable, icon, title, widgetTypeKey, isPublic = false
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

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
  const [locationName, setLocationName] = useState<string | null>(null);
  const [selectedStation, setSelectedStation] = useState<StationData | null>(null);

  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<L.FeatureGroup>(new L.FeatureGroup());

  // 1. Hilfsfunktion sicher definiert
  const hasLocationConsent = useCallback(() => {
    const consentStr = localStorage.getItem('cookie_preferences');
    if (!consentStr) return false;
    try {
      const consent = JSON.parse(consentStr);
      return consent.location === true;
    } catch {
      return false;
    }
  }, []);

  const fetchFavoritesFromDB = useCallback(async () => {
    if (isPublic) {
        setFavorites([
            { id: 'mock1', external_id: 'mock1', name: 'Wien City Charging', lat: 48.2082, lng: 16.3738, operator_name: 'Wien Energie', power_kw: 150, charge_point_count: 4, connector_types: ['CCS2', 'Type 2'], is_trusted_source: true, city: 'Wien', street: 'Stephansplatz', country_code: 'AT' },
            { id: 'mock2', external_id: 'mock2', name: 'Public Park Charger', lat: 48.2100, lng: 16.3700, operator_name: 'Smatrics', power_kw: 50, charge_point_count: 2, connector_types: ['Type 2'], city: 'Wien', street: 'Am Hof', country_code: 'AT' }
        ]);
        setLoading(false);
        return;
    }

    if (!user) { setFavorites([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const { data } = await apiClient.get(`/api/users/favorites?widgetType=${widgetTypeKey}`);
      setFavorites(Array.isArray(data) ? data : []);
    } catch (err) { setError('Favoriten konnten nicht geladen werden.'); } 
    finally { setLoading(false); }
  }, [user, widgetTypeKey, isPublic]);

  useEffect(() => {
    fetchFavoritesFromDB();
    if (!isPublic && user?.regions && user.regions.length > 0) {
        const defaultRegion = user.regions.find(r => !!r.is_default) || user.regions[0];
        setSelectedRegion(defaultRegion);
    }
    
    if (!isPublic && hasLocationConsent()) {
        navigator.geolocation.getCurrentPosition(
            (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => console.warn("Standortfreigabe im Browser verweigert.")
        );
    }
  }, [fetchFavoritesFromDB, user?.regions, isPublic, hasLocationConsent]);
  
  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
        const defaultLat = isPublic ? 48.2082 : 51.16;
        const defaultLng = isPublic ? 16.3738 : 10.45;
        const defaultZoom = isPublic ? 13 : 5;
        mapRef.current = L.map(mapContainerRef.current, { attributionControl: false, zoomControl: false }).setView([defaultLat, defaultLng], defaultZoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);
        markersRef.current.addTo(mapRef.current);
    }
  }, [isPublic]);

  // FIX 1: Der ResizeObserver Loop Killer! Debounce + animate: false
// FIX 1: Der ResizeObserver Loop Killer! Debounce + animate: false
  useEffect(() => {
    if (!mapRef.current || !mapContainerRef.current) return;
    
    // Fehler behoben: ReturnType<typeof setTimeout> statt NodeJS.Timeout
    let resizeTimer: ReturnType<typeof setTimeout>;
    
    const ro = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        // Verzögert die Neuberechnung minimal, bricht den Endlos-Loop auf!
        resizeTimer = setTimeout(() => {
            if (mapRef.current) {
                mapRef.current.invalidateSize(false);
            }
        }, 100); 
    });
    
    ro.observe(mapContainerRef.current);
    return () => {
        ro.disconnect();
        clearTimeout(resizeTimer);
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    markersRef.current.clearLayers();
    
    const stationsToShow = viewMode === 'favorites' ? favorites : displayedResults;
    let hasMarkers = false;

    stationsToShow.forEach((s) => {
        if (s.lat && s.lng) {
            hasMarkers = true;
            const mapUrl = `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`;
            const kwString = s.power_kw ? ` | <b>${s.power_kw} kW</b>` : '';
            const popupContent = `<b>${s.name}</b>${kwString}<br/>Betreiber: ${s.operator_name || 'N/A'}<br/><a href="${mapUrl}" target="_blank" rel="noopener noreferrer">In Google Maps öffnen</a>`;
            L.marker([s.lat, s.lng]).bindPopup(popupContent).addTo(markersRef.current);
        }
    });

    if (viewMode === 'search' && userLocation && !isPublic) {
        hasMarkers = true;
        const userHtml = `<div style="background-color: #2196f3; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 8px rgba(0,0,0,0.6); animation: pulse 2s infinite;"></div>`;
        const userIcon = L.divIcon({ className: 'user-marker', html: userHtml, iconSize: [22, 22], iconAnchor: [11, 11] });
        L.marker([userLocation.lat, userLocation.lng], { icon: userIcon, zIndexOffset: 1000 })
         .bindTooltip(locationName ? `Mein Standort: ${locationName}` : 'Mein Standort', { permanent: true, direction: 'top', offset: [0, -10], className: 'custom-tooltip' })
         .addTo(markersRef.current);
    }
    
    if (hasMarkers) {
        map.fitBounds(markersRef.current.getBounds(), { padding: [40, 40], maxZoom: 14 });
    } else if (userLocation && !isPublic) {
        map.setView([userLocation.lat, userLocation.lng], 12);
    }
  }, [favorites, displayedResults, viewMode, userLocation, locationName, isPublic]);

  const handleSearch = async (useLocation: boolean = false) => {
    if (isPublic) return; 
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
    } catch (err: any) { setError(err.response?.data?.message || 'Suche fehlgeschlagen'); } 
    finally { setSearchLoading(false); }
  };

  const handleNearbySearch = async () => {
    if (!hasLocationConsent()) {
      return showSnackbar("Standort-Automatisierung ist in den Cookie-Einstellungen deaktiviert.", "info");
    }
    if (!userLocation) {
      return showSnackbar("Standort wird noch ermittelt oder wurde im Browser blockiert.", "warning");
    }
    setSearchLoading(true); setSearchTerm(''); setLocationName(null);
    try {
      const geoResp = await axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLocation.lat}&lon=${userLocation.lng}`);
      const address = geoResp.data?.address;
      const detectedCountry = address?.country_code?.toUpperCase();
      
      const cityOrTown = address?.city || address?.town || address?.village || address?.county || '';
      if (cityOrTown) setLocationName(cityOrTown);

      if (detectedCountry && SUPPORTED_COUNTRIES.includes(detectedCountry)) {
        const rObj = user?.regions?.find(r => r.code === detectedCountry);
        if(rObj) setSelectedRegion(rObj);
        handleSearch(true);
      } else {
        showSnackbar(`Ihr Standort (${detectedCountry || 'Unbekannt'}) wird nicht unterstützt.`, "info");
        setSearchLoading(false);
      }
    } catch (error) {
        showSnackbar("Standortermittlung fehlgeschlagen.", "error");
        setSearchLoading(false);
    }
  };

  const handleLoadMore = () => {
    const currentLength = displayedResults.length;
    setDisplayedResults([...displayedResults, ...allSearchResults.slice(currentLength, currentLength + PAGE_SIZE)]);
  };

  const isFavorite = useCallback((externalId: string) => favorites.some(f => f.external_id === externalId), [favorites]);

  const toggleFavorite = useCallback(async (station: StationData) => {
    if (isPublic) return; 
    const fav = isFavorite(station.external_id);
    if (!fav && favorites.length >= FAVORITES_LIMIT) return showSnackbar(`Maximal ${FAVORITES_LIMIT} Favoriten erlaubt.`, 'warning');
    
    try {
      if (fav) {
        await apiClient.delete(`/api/users/favorites/${station.external_id}?widgetType=${widgetTypeKey}`);
        showSnackbar('Favorit entfernt', 'info');
      } else {
        await apiClient.post('/api/users/favorites', { widgetType: widgetTypeKey, favorite: station });
        showSnackbar('Favorit hinzugefügt', 'success');
      }
      fetchFavoritesFromDB();
    } catch (err) { showSnackbar('Aktion fehlgeschlagen', 'error'); }
  }, [isFavorite, widgetTypeKey, fetchFavoritesFromDB, showSnackbar, favorites.length, isPublic]);
  
  // FIX 2: Ausgelagert als echte Render-Funktion statt inline React-Komponente! 
  // Das verhindert, dass der DOM bei jedem Render-Cycle zerstört wird.
  const renderEVStationCard = (station: StationData) => {
    const fullAddress = `${station.street || ''} ${station.city ? ', ' + station.city : ''}`.trim().replace(/^,|,$/g, '');
    const hasPower = station.power_kw != null && station.power_kw !== '';

    return (
      <Paper key={station.external_id} elevation={0} onClick={() => { 
          if(isPublic) { setSelectedStation(station); return; }
          if (station.lat && station.lng && mapRef.current) mapRef.current.setView([station.lat, station.lng], 15); 
        }}
        sx={{
            p: 2, mb: 1.5, cursor: 'pointer', borderRadius: 3, border: '1px solid', borderColor: 'divider',
            transition: 'all 0.2s ease', '&:hover': { transform: 'translateY(-2px)', boxShadow: theme.shadows[2], borderColor: 'primary.main' }
        }}
      >
        <Stack direction="row" spacing={2} alignItems="flex-start">
            <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: alpha(theme.palette.success.main, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', mt: 0.5, flexShrink: 0 }}>
                <EvStationIcon sx={{ color: 'success.main' }} />
            </Box>
            
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="subtitle2" noWrap sx={{ fontWeight: 800, fontSize: '1rem' }}>
                        {station.name}
                    </Typography>
                    {station.is_trusted_source && (
                        <Tooltip title="Geprüfte Daten">
                            <VerifiedUserIcon sx={{ fontSize: 14, color: 'success.main' }} />
                        </Tooltip>
                    )}
                </Box>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                    <LocationOnIcon sx={{ fontSize: 12 }} /> {fullAddress || "Adresse unbekannt"}
                </Typography>
                
                {station.connector_types && station.connector_types.length > 0 && (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {station.connector_types.slice(0, 3).map((type, idx) => (
                            <Chip key={idx} label={type} size="small" sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'action.hover' }} />
                        ))}
                        {station.connector_types.length > 3 && <Chip label={`+${station.connector_types.length - 3}`} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />}
                    </Stack>
                )}
            </Box>

            <Stack direction="column" alignItems="flex-end" spacing={1}>
                {hasPower && (
                    <Chip 
                        icon={<PowerIcon sx={{ fontSize: '1rem !important' }} />} 
                        label={`${station.power_kw} kW`} 
                        size="small" 
                        color="success" 
                        sx={{ fontWeight: 'bold', borderRadius: 1.5 }} 
                    />
                )}
                {!isPublic && (
                    <Tooltip title={isFavorite(station.external_id) ? "Favorit entfernen" : "Zu Favoriten hinzufügen"}>
                        <IconButton 
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(station); }} 
                            size="small"
                            sx={{ color: isFavorite(station.external_id) ? 'warning.main' : 'text.disabled', '&:hover': { color: 'warning.main' } }}
                        >
                            {isFavorite(station.external_id) ? <StarIcon /> : <StarBorderIcon />}
                        </IconButton>
                    </Tooltip>
                )}
                {station.charge_point_count != null && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <AccountTreeIcon sx={{ fontSize: 12 }} /> {station.charge_point_count} LPs
                    </Typography>
                )}
            </Stack>
        </Stack>
      </Paper>
    );
  };

  const renderProviderAttribution = () => {
    let providerName: string | null = null;
    const stationsToShow = viewMode === 'favorites' ? favorites : displayedResults;

    if (stationsToShow.length > 0) {
        const uniqueProviders = [...new Set(stationsToShow.map(f => f.provider).filter((p): p is string => !!p))];
        if (uniqueProviders.length === 1) {
            providerName = uniqueProviders[0];
        } else if (uniqueProviders.length > 1) {
            return <Typography variant="caption" color="text.secondary">Quellen: {uniqueProviders.join(', ')}</Typography>;
        }
    }

    if (viewMode === 'search' && !providerName && displayedResults.length > 0) { providerName = 'OpenChargeMap'; }
    if (!providerName) return null;
    
    const url = providerUrls[providerName];
    return (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            Quelle: {url ? <MuiLink href={url} target="_blank" rel="noopener noreferrer" underline="hover">{providerName}</MuiLink> : providerName}
        </Typography>
    );
  };
  
  return (
    <WidgetPaper 
      title={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {icon || <EvStationIcon color="success" />}
            <Typography variant="h6" sx={{fontWeight: 800}}>{title}</Typography>
        </Box>
      }
      widgetId={widgetId} onDelete={onDelete} isRemovable={isRemovable} 
      widgetTitle={title} widgetTypeKey={widgetTypeKey} noPadding isPublic={isPublic}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ p: 2, pb: 1 }}>
            <Box sx={{ height: 160, width: '100%', borderRadius: 3, overflow: 'hidden', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)', bgcolor: 'grey.200' }} ref={mapContainerRef} />
        </Box>

        {/* SUCHE */}
        {viewMode === 'search' && !isPublic && (
            <Box sx={{ px: 2, pt: 1, pb: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
                {user?.regions && (
                <FormControl size="small" sx={{ minWidth: 80 }}>
                    <Select 
                        value={selectedRegion?.id || ''} 
                        onChange={(e) => setSelectedRegion(user?.regions?.find(r => r.id === e.target.value) || null)}
                        sx={{ borderRadius: 2, bgcolor: 'background.paper', '& .MuiSelect-select': { display: 'flex', alignItems: 'center', gap: 1, py: 1 } }}
                        renderValue={(val) => {
                            const r = user?.regions?.find(reg => reg.id === val);
                            return <Flag code={r?.code} size={20} />;
                        }}
                    >
                    {user.regions.map(r => <MenuItem key={r.id} value={r.id}><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Flag code={r.code} size={20} /> {r.code}</Box></MenuItem>)}
                    </Select>
                </FormControl>
                )}
                <TextField
                fullWidth size="small" placeholder="PLZ, Stadt oder Adresse..." value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch(false)}
                InputProps={{
                    sx: { borderRadius: 2, bgcolor: 'background.paper' },
                    endAdornment: (
                    <InputAdornment position="end">
                        <Tooltip title="In meiner Nähe suchen">
                            <IconButton onClick={() => handleNearbySearch()} disabled={!userLocation || searchLoading} edge="end" sx={{ color: 'primary.main' }}><MyLocationIcon /></IconButton>
                        </Tooltip>
                        <IconButton onClick={() => handleSearch(false)} disabled={searchLoading} edge="end"><SearchIcon /></IconButton>
                    </InputAdornment>
                    ),
                }}
                />
            </Stack>
            {locationName && (
                <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, ml: 11, color: 'primary.main', fontWeight: 600 }}>
                    <LocationOnIcon sx={{ fontSize: 12 }} /> GPS: {locationName}
                </Typography>
            )}
            </Box>
        )}
        
        {/* LISTENBEREICH */}
        <Box sx={{ flexGrow: 1, overflowY: isMobile ? 'visible' : 'auto', p: 2, bgcolor: alpha(theme.palette.action.hover, 0.05) }}>
            {error && <Alert severity="warning" sx={{mb: 2, borderRadius: 2}}>{error}</Alert>}
            
            {viewMode === 'favorites' && (
            loading ? <Stack spacing={1.5}>{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} variant="rounded" height={80} sx={{ borderRadius: 3 }} />)}</Stack> : (
                favorites.length > 0 ? favorites.map(fav => renderEVStationCard(fav)) : (
                    <Box sx={{ textAlign: 'center', py: 5, border: '1px dashed', borderColor: 'divider', borderRadius: 3 }}>
                        <StarBorderIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                        <Typography variant="body1" fontWeight="bold" color="text.secondary">Keine Favoriten</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{isPublic ? 'Lade Demo-Daten...' : 'Suchen Sie eine Ladesäule, um sie hier zu speichern.'}</Typography>
                    </Box>
                )
            )
            )}

            {viewMode === 'search' && (
            searchLoading && displayedResults.length === 0 ? <Stack spacing={1.5}>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="rounded" height={80} sx={{ borderRadius: 3 }} />)}</Stack> : (
                displayedResults.length > 0 ? (
                    <>
                        {displayedResults.map(station => renderEVStationCard(station))}
                        {displayedResults.length < allSearchResults.length && (
                            <Box sx={{ textAlign: 'center', py: 2 }}>
                                <Button onClick={handleLoadMore} variant="outlined" sx={{ borderRadius: 5 }}>Mehr anzeigen ({displayedResults.length} von {allSearchResults.length})</Button>
                            </Box>
                        )}
                    </>
                ) : (!searchLoading && searchTerm && (
                    <Box sx={{ textAlign: 'center', py: 5, border: '1px dashed', borderColor: 'divider', borderRadius: 3 }}>
                        <HelpOutlineIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                        <Typography variant="body2" color="text.secondary">Keine Stationen gefunden.</Typography>
                    </Box>
                ))
            )
            )}
        </Box>
        
        <Divider />
        
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1.5, px: 2 }}>
            {!isPublic ? (
                <Button size="small" variant="text" sx={{ borderRadius: 5, fontWeight: 'bold' }} startIcon={viewMode === 'favorites' ? <AddCircleOutlineIcon/> : <ArrowBackIcon />} onClick={() => { setAllSearchResults([]); setDisplayedResults([]); setSearchTerm(''); setError(null); setLocationName(null); setViewMode(viewMode === 'favorites' ? 'search' : 'favorites'); }}>
                {viewMode === 'favorites' ? `Suchen (${favorites.length}/${FAVORITES_LIMIT})` : 'Zurück'}
                </Button>
            ) : <Box />}
            {renderProviderAttribution()}
        </Stack>
      </Box>

      {/* DETAIL DIALOG */}
      <Dialog open={!!selectedStation} onClose={() => setSelectedStation(null)} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pt: 3}}>
            <Box>
                <Typography variant="overline" color="success.main" fontWeight="bold">Ladesäule</Typography>
                <Typography variant="h5" sx={{ fontWeight: 800 }}>{selectedStation?.name}</Typography>
            </Box>
            <IconButton onClick={() => setSelectedStation(null)} sx={{ bgcolor: 'action.hover' }}><CloseIcon/></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 3 }}>
            <Stack spacing={3}>
                <Box sx={{ p: 2, bgcolor: alpha(theme.palette.success.main, 0.05), borderRadius: 3, display: 'flex', alignItems: 'center', gap: 2, border: '1px solid', borderColor: alpha(theme.palette.success.main, 0.1) }}>
                    <LocationOnIcon color="success" />
                    <Box>
                        <Typography variant="subtitle2" color="text.secondary">Adresse</Typography>
                        <Typography variant="body1" fontWeight="bold">{`${selectedStation?.street || ''}, ${selectedStation?.post_code || ''} ${selectedStation?.city || ''}`}</Typography>
                    </Box>
                </Box>

                <Box>
                    <Typography variant="subtitle2" color="text.secondary">Betreiber</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography fontWeight="bold">{selectedStation?.operator_name || 'Unbekannt'}</Typography>
                        {selectedStation?.is_trusted_source && !isPublic && (
                          <Tooltip title="Info zu geprüften Quellen">
                                <IconButton size="small" sx={{p:0}} onClick={(e) => { e.stopPropagation(); navigate('/trusted-sources'); }}>
                                    <VerifiedUserIcon sx={{ fontSize: 16, color: 'success.main' }} />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Box>
                </Box>

                <Stack direction="row" spacing={4} sx={{ p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
                    <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><AccountTreeIcon fontSize="small"/> Ladepunkte</Typography>
                        <Typography variant="h6" fontWeight="bold">{selectedStation?.charge_point_count || 0}</Typography>
                    </Box>
                    <Divider orientation="vertical" flexItem />
                    <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><PowerIcon fontSize="small"/> Max. Leistung</Typography>
                        <Typography variant="h6" fontWeight="bold" color="success.main">{selectedStation?.power_kw ? `${selectedStation.power_kw} kW` : 'N/A'}</Typography>
                    </Box>
                </Stack>

                {selectedStation?.connector_types && selectedStation.connector_types.length > 0 && (
                     <Box>
                        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Verfügbare Stecker</Typography>
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                            {selectedStation.connector_types.map((type: string) => <Chip key={type} label={type} variant="outlined" />)}
                        </Stack>
                    </Box>
                )}
            </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3, bgcolor: '#f8fafc' }}>
            <Button fullWidth variant="contained" size="large" startIcon={<MapOutlinedIcon />} sx={{ borderRadius: 2 }} onClick={() => {
                if(selectedStation?.lat && selectedStation?.lng && mapRef.current){
                    mapRef.current.setView([selectedStation.lat, selectedStation.lng], 16);
                    setSelectedStation(null);
                }
            }}>Auf Karte zeigen</Button>
        </DialogActions>
      </Dialog>

      <style>{`
        .custom-tooltip { background: rgba(0,0,0,0.8); border: none; color: white; border-radius: 8px; font-weight: bold; font-size: 12px; }
        .custom-tooltip::before { border-top-color: rgba(0,0,0,0.8) !important; }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(33, 150, 243, 0); } 100% { box-shadow: 0 0 0 0 rgba(33, 150, 243, 0); } }
      `}</style>
    </WidgetPaper>
  );
};

export default EVStationWidget;