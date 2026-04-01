import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, CircularProgress, Alert, IconButton, Tooltip, Button, Stack, Link as MuiLink,
  TextField, InputAdornment, Divider, ToggleButton, ToggleButtonGroup,
  FormControl, Select, MenuItem, useTheme, useMediaQuery, Paper, Skeleton
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import SearchIcon from '@mui/icons-material/Search';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import ScienceIcon from '@mui/icons-material/Science';
import OpacityIcon from '@mui/icons-material/Opacity';
import RefreshIcon from '@mui/icons-material/Refresh';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import { useSnackbar } from '../../context/SnackbarContext';

type FuelType = 'diesel' | 'e5' | 'e10';
type ViewMode = 'favorites' | 'search';
type CountryCode = 'DE' | 'AT';

interface FuelPricesWidgetProps extends BaseWidgetProps {
  icon?: React.ReactNode;
  title: string;
  widgetTypeKey: string;
}

interface StationData {
  id: string; external_id: string; name?: string | null; country_code?: CountryCode | null; 
  brand?: string | null; street?: string | null; house_no?: string | null; post_code?: string | null; 
  city?: string | null; lat?: number | null; lng?: number | null; last_diesel?: number | string | null;
  last_e5?: number | string | null; last_e10?: number | string | null; last_status?: string | null; 
  last_price_ts?: string | null; provider?: string | null; is_trusted_source?: boolean;
}

const fuelTypeConfig: { [key in FuelType]: { color: 'primary' | 'success' | 'warning', icon: React.ElementType, label: string } } = {
  diesel: { color: 'primary', icon: LocalGasStationIcon, label: 'Diesel' },
  e5: { color: 'success', icon: OpacityIcon, label: 'Super E5' },
  e10: { color: 'warning', icon: ScienceIcon, label: 'Super E10' },
};

const providerUrls: { [key: string]: string } = {
  'Tankerkönig': 'https://www.tankerkoenig.de/',
  'E-Control Austria': 'https://www.e-control.at/spritpreise'
};

const getProviderByCountryCode = (code: string | null): string => {
    if (code === 'DE') return 'Tankerkönig';
    if (code === 'AT') return 'E-Control Austria';
    return 'Unbekannt';
};

const SUPPORTED_COUNTRIES: CountryCode[] = ['DE', 'AT'];
const FAVORITES_LIMIT = 10;
const PAGE_SIZE = 10;

// Fix Leaflet Icon paths
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// --- Helper: Flag Component (Sorgt für konsistente Größe!) ---
const Flag = ({ code, size = 20 }: { code?: string; size?: number }) => {
    if (!code) return null;
    return <img loading="lazy" width={size} src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`} alt={code} style={{ borderRadius: '2px', display: 'block' }} />;
};

const FuelPricesWidget: React.FC<FuelPricesWidgetProps> = ({ onDelete, widgetId, isRemovable, icon, title, widgetTypeKey }) => {
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
  const [fuelType, setFuelType] = useState<FuelType>('diesel');
  const [viewMode, setViewMode] = useState<ViewMode>('favorites');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>('DE');
  
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null); // NEU: Gefundener Ortsname
  const [lastPriceUpdate, setLastPriceUpdate] = useState<string | null>(null);

  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<L.FeatureGroup>(new L.FeatureGroup());

  const hasLocationConsent = () => {
  const consentStr = localStorage.getItem('cookie_preferences');
  if (!consentStr) return false;
  try {
    const consent = JSON.parse(consentStr);
    return consent.location === true;
  } catch {
    return false;
  }
  }; 

  const fetchFavoritesFromDB = useCallback(async () => {
    if (!user) { setFavorites([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const { data } = await apiClient.get(`/api/users/favorites?widgetType=${widgetTypeKey}`);
      setFavorites(Array.isArray(data) ? data : []);
    } catch (err) { setError('Favoriten konnten nicht geladen werden.'); } 
    finally { setLoading(false); }
  }, [user, widgetTypeKey]);

useEffect(() => {
  fetchFavoritesFromDB();
   

  if (hasLocationConsent()) {
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => console.warn("Standortfreigabe im Browser verweigert.")
    );
  } else {
    console.log("Standort-Automatisierung ist laut Cookie-Präferenzen deaktiviert.");
  }
}, [fetchFavoritesFromDB]);
  
  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
        mapRef.current = L.map(mapContainerRef.current, { attributionControl: false, zoomControl: false }).setView([51.16, 10.45], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);
        markersRef.current.addTo(mapRef.current);
    }
  }, []);

  // --- KARTEN UPDATE LOGIK ---
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    markersRef.current.clearLayers();
    
    const stationsToShow = viewMode === 'favorites' ? favorites : displayedResults;
    let hasMarkers = false;

    // Tankstellen-Marker setzen
    stationsToShow.forEach((s) => {
        if (s.lat && s.lng) {
            hasMarkers = true;
            const priceRaw = s[`last_${fuelType}`] ?? null;
            const price = typeof priceRaw === 'string' ? parseFloat(priceRaw) : priceRaw;
            const mapUrl = `https://www.google.com/maps/search/?api=1&query=$${s.lat},${s.lng}`;
            const priceString = typeof price === 'number' ? `<b>${price.toFixed(3)} €</b>` : 'N/A';
            const popupContent = `<b>${s.brand || s.name}</b><br/>${s.street || ''} ${s.house_no || ''}<br/>${fuelTypeConfig[fuelType].label}: ${priceString}<br/><a href="${mapUrl}" target="_blank" rel="noopener noreferrer">In Google Maps öffnen</a>`;
            L.marker([s.lat, s.lng]).bindPopup(popupContent).addTo(markersRef.current);
        }
    });

    // NEU: Eigenen Standort markieren und beschriften!
    if (viewMode === 'search' && userLocation) {
        hasMarkers = true;
        const userHtml = `<div style="background-color: #2196f3; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 8px rgba(0,0,0,0.6); animation: pulse 2s infinite;"></div>`;
        const userIcon = L.divIcon({ className: 'user-marker', html: userHtml, iconSize: [22, 22], iconAnchor: [11, 11] });
        
        L.marker([userLocation.lat, userLocation.lng], { icon: userIcon, zIndexOffset: 1000 })
         .bindTooltip(locationName ? `Mein Standort: ${locationName}` : 'Mein Standort', { permanent: true, direction: 'top', offset: [0, -10], className: 'custom-tooltip' })
         .addTo(markersRef.current);
    }
    
    if (hasMarkers) {
        map.fitBounds(markersRef.current.getBounds(), { padding: [40, 40], maxZoom: 13 });
    } else if (userLocation) {
        map.setView([userLocation.lat, userLocation.lng], 12);
    }
  }, [favorites, displayedResults, viewMode, fuelType, userLocation, locationName]);

  const getLatestFavoritePriceTimestamp = useCallback(() => {
    if (favorites.length === 0) return null;
    const timestamps = favorites.map(fav => fav.last_price_ts ? new Date(fav.last_price_ts).getTime() : 0).filter(ts => ts > 0);
    if (timestamps.length === 0) return null;
    return new Date(Math.max(...timestamps)).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }, [favorites]);

  useEffect(() => { setLastPriceUpdate(getLatestFavoritePriceTimestamp()); }, [favorites, getLatestFavoritePriceTimestamp]);

  const handleRefreshPrices = useCallback(async () => {
    if (favorites.length === 0) return;
    setLoading(true);
    const favsByCountry = favorites.reduce((acc, f) => {
        if (f.country_code && f.external_id) {
          if (!acc[f.country_code]) acc[f.country_code] = [];
          acc[f.country_code].push(f.external_id);
        }
        return acc;
    }, {} as Record<string, string[]>);
    
    try {
      await Promise.all(Object.entries(favsByCountry).map(([country, ids]) => apiClient.post('/api/data/fuel/prices-by-ids', { ids, country, userId: user?.id })));
      showSnackbar('Preise erfolgreich aktualisiert.', 'success');
    } catch (err) { showSnackbar('Einige Preise konnten nicht aktualisiert werden.', 'warning'); } 
    finally { await fetchFavoritesFromDB(); }
  }, [favorites, user, fetchFavoritesFromDB, showSnackbar]);

  const handleSearch = async (useLocation: boolean = false, countryOverride?: CountryCode) => {
    if (!useLocation && !searchTerm.trim()) return showSnackbar("Bitte einen Suchbegriff eingeben.", "info");
    if (useLocation && !userLocation) return showSnackbar("Standort nicht verfügbar.", "warning");
    
    setSearchLoading(true); setAllSearchResults([]); setDisplayedResults([]);
    try {
        const countryToUse = countryOverride || selectedCountry;
        const { data } = await apiClient.get('/api/data/fuel/search', {
             params: { country: countryToUse, lat: useLocation ? userLocation?.lat : undefined, lng: useLocation ? userLocation?.lng : undefined, query: useLocation ? undefined : searchTerm.trim() }
        });
        setAllSearchResults(data.stations || []);
        setDisplayedResults((data.stations || []).slice(0, PAGE_SIZE));
    } catch (err: any) { showSnackbar(err.response?.data?.message || 'Suche fehlgeschlagen', 'error'); } 
    finally { setSearchLoading(false); }
  };
  
  const handleLoadMore = () => {
    const currentLength = displayedResults.length;
    setDisplayedResults([...displayedResults, ...allSearchResults.slice(currentLength, currentLength + PAGE_SIZE)]);
  };
  
const handleNearbySearch = async () => {
  // 1. Check ob in Cookie-Settings erlaubt
  if (!hasLocationConsent()) {
    return showSnackbar(
      "Standort-Dienste sind deaktiviert. Bitte in den Cookie-Einstellungen aktivieren.", 
      "info"
    );
  }

  // 2. Check ob GPS-Signal vom Browser da ist
  if (!userLocation) {
    return showSnackbar("Standort wird noch ermittelt oder wurde im Browser blockiert.", "warning");
  }
    setSearchLoading(true); setSearchTerm(''); setLocationName(null);
    try {
      // Nominatim Reverse Geocoding um Stadt/Straße für das UI zu finden
      const geoResp = await axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLocation.lat}&lon=${userLocation.lng}`);
      const address = geoResp.data?.address;
      const detectedCountry = address?.country_code?.toUpperCase();
      
      // Stadt oder Dorf für die Anzeige extrahieren
      const cityOrTown = address?.city || address?.town || address?.village || address?.county || '';
      if (cityOrTown) setLocationName(cityOrTown);

      if (detectedCountry && SUPPORTED_COUNTRIES.includes(detectedCountry as CountryCode)) {
        setSelectedCountry(detectedCountry as CountryCode);
        handleSearch(true, detectedCountry as CountryCode);
      } else {
        showSnackbar(`Ihr Standort (${detectedCountry || 'Unbekannt'}) wird nicht unterstützt.`, "info");
        setSearchLoading(false);
      }
    } catch (error) {
        showSnackbar("Standortermittlung fehlgeschlagen.", "error");
        setSearchLoading(false);
    }
  };

  const isFavorite = useCallback((externalId: string) => favorites.some(f => f.external_id === externalId), [favorites]);

  const toggleFavorite = useCallback(async (station: StationData) => {
    const fav = isFavorite(station.external_id);
    if (!fav && favorites.length >= FAVORITES_LIMIT) return showSnackbar(`Maximale Anzahl von ${FAVORITES_LIMIT} Favoriten erreicht.`, 'warning');
    try {
      if (fav) {
        await apiClient.delete(`/api/users/favorites/${station.external_id}?widgetType=${widgetTypeKey}`);
        showSnackbar('Favorit entfernt', 'info');
      } else {
        const stationWithProvider = { ...station, provider: getProviderByCountryCode(station.country_code ?? null) };
        await apiClient.post('/api/users/favorites', { widgetType: widgetTypeKey, favorite: stationWithProvider as any });
        showSnackbar('Favorit hinzugefügt', 'success');
      }
      fetchFavoritesFromDB();
    } catch (err) { showSnackbar('Aktion fehlgeschlagen', 'error'); }
  }, [isFavorite, widgetTypeKey, fetchFavoritesFromDB, showSnackbar, favorites.length]);
  
  // --- KARTEN-DESIGN FÜR TANKSTELLEN (Edge-to-Edge) ---
  const StationCard = ({ station }: { station: StationData }) => {
    const priceRaw = station[`last_${fuelType}`] ?? null;
    const price = typeof priceRaw === 'string' ? parseFloat(priceRaw) : priceRaw;
    const fullAddress = `${station.street || ''} ${station.house_no || ''}, ${station.post_code || ''} ${station.city || ''}`.trim().replace(/^,|,$/g, '');
    const isOpen = station.last_status === 'open';
    const hasPrice = typeof price === 'number' && !isNaN(price);

    return (
      <Paper elevation={0} onClick={() => { if (station.lat && station.lng && mapRef.current) mapRef.current.setView([station.lat, station.lng], 15); }}
        sx={{
            p: 2, mb: 1.5, cursor: 'pointer', borderRadius: 3, border: '1px solid', borderColor: 'divider',
            transition: 'all 0.2s ease', '&:hover': { transform: 'translateY(-2px)', boxShadow: theme.shadows[2], borderColor: 'primary.main' }
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LocalGasStationIcon sx={{ color: 'primary.main' }} />
            </Box>
            
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" noWrap sx={{ fontWeight: 800, fontSize: '1rem' }}>
                    {station.brand || station.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <LocationOnIcon sx={{ fontSize: 12 }} /> {fullAddress || "Adresse unbekannt"}
                </Typography>
            </Box>

            <Box sx={{ textAlign: 'right' }}>
                <Typography variant="h6" sx={{ fontWeight: 900, color: isOpen && hasPrice ? fuelTypeConfig[fuelType].color : 'text.disabled', lineHeight: 1.2 }}>
                    {hasPrice ? `${price.toFixed(3)} €` : 'N/A'}
                </Typography>
                <Typography variant="caption" sx={{ color: isOpen ? 'success.main' : 'error.main', fontWeight: 600 }}>
                    {isOpen ? 'Geöffnet' : 'Geschlossen'}
                </Typography>
            </Box>

            <Tooltip title={isFavorite(station.external_id) ? "Favorit entfernen" : "Zu Favoriten hinzufügen"}>
                <IconButton onClick={(e) => { e.stopPropagation(); toggleFavorite(station); }} edge="end" sx={{ color: isFavorite(station.external_id) ? 'warning.main' : 'text.disabled', '&:hover': { color: 'warning.main' } }}>
                    {isFavorite(station.external_id) ? <StarIcon /> : <StarBorderIcon />}
                </IconButton>
            </Tooltip>
        </Stack>
      </Paper>
    );
  };

  const renderProviderAttribution = () => {
    let providerName: string | null = null;
    let isTrusted = false;

    if (viewMode === 'search') {
        providerName = getProviderByCountryCode(selectedCountry);
        isTrusted = allSearchResults.length > 0 ? !!allSearchResults[0].is_trusted_source : false;
    } else if (favorites.length > 0) {
        const uniqueProviders = [...new Set(favorites.map(f => f.provider).filter((p): p is string => typeof p === 'string' && p.trim().length > 0))];
        if (uniqueProviders.length === 1) {
            providerName = uniqueProviders[0] ?? null;
            isTrusted = favorites.every(f => f.is_trusted_source);
        } else if (uniqueProviders.length > 1) {
            return <Typography variant="caption" color="text.secondary">Quellen: {uniqueProviders.join(', ')}</Typography>;
        }
    }

    if (!providerName) return null;
    const url = providerUrls[providerName];
    
    return (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            Quelle: {url ? <MuiLink href={url} target="_blank" rel="noopener noreferrer" underline="hover">{providerName}</MuiLink> : providerName}
            {isTrusted && (
                <Tooltip title="Geprüfte Originalquelle">
                    <IconButton size="small" sx={{p:0}} onClick={(e) => { e.stopPropagation(); navigate('/trusted-sources'); }}>
                        <VerifiedUserIcon sx={{ fontSize: 14, color: 'success.main' }} />
                    </IconButton>
                </Tooltip>
            )}
        </Typography>
    );
  };
  
  return (
    <WidgetPaper 
      title={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
            {icon || <LocalGasStationIcon color="primary" />}
            <Typography variant="h6" sx={{ fontWeight: 800 }}>{title}</Typography>
            <Box sx={{ flexGrow: 1 }} />
            <Button 
                size="small" variant="text"
                startIcon={viewMode === 'favorites' ? <AddCircleOutlineIcon/> : <ArrowBackIcon />} 
                onClick={() => { setAllSearchResults([]); setDisplayedResults([]); setSearchTerm(''); setLocationName(null); setViewMode(viewMode === 'favorites' ? 'search' : 'favorites'); }}
                sx={{ borderRadius: 5, fontWeight: 'bold' }}
            >
                {viewMode === 'favorites' ? `Suchen (${favorites.length}/${FAVORITES_LIMIT})` : 'Zurück'}
            </Button>
        </Box>
      }
      widgetId={widgetId} onDelete={onDelete} isRemovable={isRemovable} widgetTitle={title} widgetTypeKey={widgetTypeKey} noPadding
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {error && <Alert severity="error" sx={{ m: 2, mb: 0, borderRadius: 2 }}>{error}</Alert>}
        
        {/* MAP */}
        <Box sx={{ p: 2, pb: 1 }}>
            <Box sx={{ height: 160, width: '100%', borderRadius: 3, overflow: 'hidden', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)' }} ref={mapContainerRef} />
        </Box>

        {/* SUCHE & TOOLBAR */}
        <Box sx={{ px: 2, pb: 1 }}>
            {viewMode === 'search' && (
                <Box sx={{ mb: 2 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        {/* FIX: Flaggen-Größe im Dropdown über renderValue */}
                        <FormControl size="small" sx={{ minWidth: 80 }}>
                            <Select value={selectedCountry} onChange={(e) => setSelectedCountry(e.target.value as CountryCode)}
                                sx={{ borderRadius: 2, bgcolor: 'background.paper', '& .MuiSelect-select': { display: 'flex', alignItems: 'center', gap: 1, py: 1 } }}
                                renderValue={(val) => <Flag code={val} size={20} />}
                            >
                                <MenuItem value="DE"><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Flag code="DE" size={20} /> DE</Box></MenuItem>
                                <MenuItem value="AT"><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Flag code="AT" size={20} /> AT</Box></MenuItem>
                            </Select>
                        </FormControl>
                        <TextField
                            fullWidth size="small" placeholder="PLZ, Stadt oder Adresse..." value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch(false)}
                            InputProps={{
                                sx: { borderRadius: 2, bgcolor: 'background.paper' },
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <Tooltip title="In meiner Nähe suchen (GPS)">
                                            <IconButton onClick={handleNearbySearch} disabled={searchLoading} edge="end" sx={{ color: 'primary.main' }}>
                                                <MyLocationIcon />
                                            </IconButton>
                                        </Tooltip>
                                        <IconButton onClick={() => handleSearch(false)} disabled={searchLoading} edge="end">
                                            <SearchIcon />
                                        </IconButton>
                                    </InputAdornment>
                                ),
                            }}
                        />
                    </Stack>
                    {/* NEU: Anzeige des Standorts klein unter dem Suchfeld */}
                    {locationName && (
                        <Typography variant="caption" sx={{ display: 'block', mt: 0.5, ml: 11, color: 'primary.main', fontWeight: 600 }}>
                            <LocationOnIcon sx={{ fontSize: 12, verticalAlign: 'middle', mr: 0.2 }} /> GPS: {locationName}
                        </Typography>
                    )}
                </Box>
            )}

            {/* TOGGLE BUTTONS & AKTUALISIEREN BUTTON NEBENEINANDER */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
                <ToggleButtonGroup value={fuelType} exclusive onChange={(_e, v) => v && setFuelType(v as FuelType)} color={fuelTypeConfig[fuelType].color} size="small" sx={{ flexGrow: 1 }}>
                    {Object.entries(fuelTypeConfig).map(([key, config]) => {
                        const Icon = config.icon;
                        return (
                            <ToggleButton key={key} value={key} sx={{ px: 1, flexGrow: 1, borderRadius: 2 }}>
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                    <Icon sx={{ fontSize: '1.1rem' }} />
                                    <Typography variant="button" sx={{ fontWeight: 700 }}>{config.label}</Typography>
                                </Stack>
                            </ToggleButton>
                        );
                    })}
                </ToggleButtonGroup>

                {viewMode === 'favorites' && (
                    <Tooltip title={`Preise jetzt aktualisieren ${lastPriceUpdate ? `(Zuletzt: ${lastPriceUpdate})` : ''}`}>
                        <span>
                            <IconButton 
                                onClick={handleRefreshPrices} 
                                disabled={loading || favorites.length === 0} 
                                sx={{ bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main', '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.2) } }}
                            >
                                {loading ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />}
                            </IconButton>
                        </span>
                    </Tooltip>
                )}
            </Stack>
        </Box>
      
        {/* CONTENT BEREICH (SKELETONS ODER KARTEN) */}
        <Box sx={{ flexGrow: 1, overflowY: isMobile ? 'visible' : 'auto', p: 2, bgcolor: alpha(theme.palette.action.hover, 0.05) }}>
            {viewMode === 'favorites' && (
                loading ? (
                    <Stack spacing={1.5}>{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} variant="rounded" height={80} sx={{ borderRadius: 3 }} />)}</Stack>
                ) : favorites.length > 0 ? (
                    favorites.map(fav => <StationCard key={fav.external_id} station={fav} />)
                ) : (
                    <Box sx={{ textAlign: 'center', py: 5, border: '1px dashed', borderColor: 'divider', borderRadius: 3 }}>
                        <StarBorderIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                        <Typography variant="body1" fontWeight="bold" color="text.secondary">Keine Favoriten</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Suchen Sie eine Tankstelle, um sie hier zu speichern.</Typography>
                    </Box>
                )
            )}

            {viewMode === 'search' && (
                searchLoading && displayedResults.length === 0 ? (
                    <Stack spacing={1.5}>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="rounded" height={80} sx={{ borderRadius: 3 }} />)}</Stack>
                ) : displayedResults.length > 0 ? (
                    <>
                        {displayedResults.map(station => <StationCard key={station.external_id} station={station} />)}
                        {displayedResults.length < allSearchResults.length && (
                            <Box sx={{ textAlign: 'center', mt: 2 }}>
                                <Button onClick={handleLoadMore} variant="outlined" sx={{ borderRadius: 5 }}>
                                    Mehr anzeigen ({displayedResults.length} von {allSearchResults.length})
                                </Button>
                            </Box>
                        )}
                    </>
                ) : (
                    !searchLoading && searchTerm && (
                        <Box sx={{ textAlign: 'center', py: 5, border: '1px dashed', borderColor: 'divider', borderRadius: 3 }}>
                            <HelpOutlineIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                            <Typography variant="body2" color="text.secondary">Keine Tankstellen in diesem Umkreis gefunden.</Typography>
                        </Box>
                    )
                )
            )}
        </Box>
      
        <Divider />
      
        {/* FOOTER */}
        <Box sx={{ p: 1.5, px: 2, display: 'flex', justifyContent: 'flex-end' }}>
            {renderProviderAttribution()}
        </Box>
      </Box>

      {/* Globale Styles für Leaflet Tooltips & Marker Animation */}
      <style>{`
        .custom-tooltip { background: rgba(0,0,0,0.8); border: none; color: white; border-radius: 8px; font-weight: bold; font-size: 12px; }
        .custom-tooltip::before { border-top-color: rgba(0,0,0,0.8) !important; }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(33, 150, 243, 0); } 100% { box-shadow: 0 0 0 0 rgba(33, 150, 243, 0); } }
      `}</style>
    </WidgetPaper>
  );
};

export default FuelPricesWidget;