import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, CircularProgress, Alert, List, ListItem, ListItemText,
  IconButton, Tooltip, Chip, Button, Stack, Link as MuiLink,
  TextField, InputAdornment, Divider, ToggleButton, ToggleButtonGroup,
  FormControl, Select, MenuItem, useTheme, useMediaQuery
} from '@mui/material';
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
  id: string; external_id: string; name?: string | null;
  country_code?: CountryCode | null; brand?: string | null; street?: string | null;
  house_no?: string | null; post_code?: string | null; city?: string | null;
  lat?: number | null; lng?: number | null; last_diesel?: number | string | null;
  last_e5?: number | string | null; last_e10?: number | string | null;
  last_status?: string | null; last_price_ts?: string | null;
  provider?: string | null;
  is_trusted_source?: boolean;
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

// Hilfsfunktion: Nimmt string oder null entgegen
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

const FuelPricesWidget: React.FC<FuelPricesWidgetProps> = ({
  onDelete, widgetId, isRemovable, icon, title, widgetTypeKey
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSnackbar } = useSnackbar();
  
  // Theme & Mobile Check
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
  const [lastPriceUpdate, setLastPriceUpdate] = useState<string | null>(null);

  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<L.FeatureGroup>(new L.FeatureGroup());

  const fetchFavoritesFromDB = useCallback(async () => {
    if (!user) {
        setFavorites([]); setLoading(false); return;
    }
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
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => showSnackbar("Standort konnte nicht ermittelt werden.", "info")
    );
  }, [fetchFavoritesFromDB, showSnackbar]);
  
  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
        mapRef.current = L.map(mapContainerRef.current, { attributionControl: false }).setView([51.16, 10.45], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);
        markersRef.current.addTo(mapRef.current);
    }
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    markersRef.current.clearLayers();
    const stationsToShow = viewMode === 'favorites' ? favorites : displayedResults;
    
    stationsToShow.forEach((s) => {
        if (s.lat && s.lng) {
            const priceRaw = s[`last_${fuelType}`] ?? null;
            const price = typeof priceRaw === 'string' ? parseFloat(priceRaw) : priceRaw;
            const mapUrl = `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`;
            const priceString = typeof price === 'number' ? `<b>${price.toFixed(3)} €</b>` : 'N/A';
            const popupContent = `<b>${s.brand || s.name}</b><br/>${s.street || ''} ${s.house_no || ''}<br/>${fuelTypeConfig[fuelType].label}: ${priceString}<br/><a href="${mapUrl}" target="_blank" rel="noopener noreferrer">Auf Google Maps ansehen</a>`;
            L.marker([s.lat, s.lng]).bindPopup(popupContent).addTo(markersRef.current);
        }
    });
    
    if (markersRef.current.getLayers().length > 0) {
        map.fitBounds(markersRef.current.getBounds(), { padding: [40, 40], maxZoom: 14 });
    }
  }, [favorites, displayedResults, viewMode, fuelType]);

  const getLatestFavoritePriceTimestamp = useCallback(() => {
    if (favorites.length === 0) return null;
    const timestamps = favorites.map(fav => fav.last_price_ts ? new Date(fav.last_price_ts).getTime() : 0).filter(ts => ts > 0);
    if (timestamps.length === 0) return null;
    const latestTimestamp = Math.max(...timestamps);
    return new Date(latestTimestamp).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }, [favorites]);

  useEffect(() => {
    setLastPriceUpdate(getLatestFavoritePriceTimestamp());
  }, [favorites, getLatestFavoritePriceTimestamp]);

  const handleRefreshPrices = useCallback(async () => {
    if (favorites.length === 0) return;
    setLoading(true);
    const favsByCountry = favorites.reduce((acc, f) => {
        const country = f.country_code;
        if (country) {
          if (!acc[country]) acc[country] = [];
          if (f.external_id) acc[country].push(f.external_id);
        }
        return acc;
    }, {} as Record<string, string[]>);
    try {
      await Promise.all(
        Object.entries(favsByCountry).map(([country, ids]) =>
          apiClient.post('/api/data/fuel/prices-by-ids', { ids, country, userId: user?.id })
        )
      );
      showSnackbar('Preise erfolgreich aktualisiert.', 'success');
    } catch (err) {
      showSnackbar('Einige Preise konnten nicht aktualisiert werden.', 'warning');
    } finally {
      await fetchFavoritesFromDB();
    }
  }, [favorites, user, fetchFavoritesFromDB, showSnackbar]);

  const handleSearch = async (useLocation: boolean = false, countryOverride?: CountryCode) => {
    if (!useLocation && !searchTerm.trim()) return showSnackbar("Bitte einen Suchbegriff eingeben.", "info");
    if (useLocation && !userLocation) return showSnackbar("Standort nicht verfügbar.", "warning");
    setSearchLoading(true); setAllSearchResults([]); setDisplayedResults([]);
    try {
        const countryToUse = countryOverride || selectedCountry;
        const { data } = await apiClient.get('/api/data/fuel/search', {
             params: { 
                country: countryToUse,
                lat: useLocation ? userLocation?.lat : undefined,
                lng: useLocation ? userLocation?.lng : undefined,
                query: useLocation ? undefined : searchTerm.trim()
            }
        });
        setAllSearchResults(data.stations || []);
        setDisplayedResults((data.stations || []).slice(0, PAGE_SIZE));
    } catch (err: any) {
        showSnackbar(err.response?.data?.message || 'Suche fehlgeschlagen', 'error');
    } finally {
        setSearchLoading(false);
    }
  };
  
  const handleLoadMore = () => {
    const currentLength = displayedResults.length;
    const moreResults = allSearchResults.slice(currentLength, currentLength + PAGE_SIZE);
    setDisplayedResults([...displayedResults, ...moreResults]);
  };
  
  const handleNearbySearch = async () => {
    if (!userLocation) return showSnackbar("Standort nicht verfügbar.", "warning");
    setSearchLoading(true); setSearchTerm('');
    try {
      const geoResp = await axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLocation.lat}&lon=${userLocation.lng}`);
      const detectedCountry = geoResp.data?.address?.country_code?.toUpperCase();
      if (detectedCountry && SUPPORTED_COUNTRIES.includes(detectedCountry as CountryCode)) {
        setSelectedCountry(detectedCountry as CountryCode);
        handleSearch(true, detectedCountry as CountryCode);
      } else {
        showSnackbar(`Ihr Standort (${detectedCountry || 'Unbekannt'}) wird nicht unterstützt.`, "info");
        setSearchLoading(false);
      }
    } catch (error) {
        showSnackbar("Ländererkennung fehlgeschlagen.", "error");
        setSearchLoading(false);
    }
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
        // FIX: Typescript Fehler durch ?? null behoben.
        // country_code kann undefined sein, wir wandeln es sicher in null um.
        const stationWithProvider = {
          ...station,
          provider: getProviderByCountryCode(station.country_code ?? null)
        };
        await apiClient.post('/api/users/favorites', { widgetType: widgetTypeKey, favorite: stationWithProvider as any });
        showSnackbar('Favorit hinzugefügt', 'success');
      }
      fetchFavoritesFromDB();
    } catch (err) {
      showSnackbar('Aktion fehlgeschlagen', 'error');
    }
  }, [isFavorite, widgetTypeKey, fetchFavoritesFromDB, showSnackbar, favorites.length]);
  
  const renderListItem = (station: StationData) => {
    const priceRaw = station[`last_${fuelType}`] ?? null;
    const price = typeof priceRaw === 'string' ? parseFloat(priceRaw) : priceRaw;
    const fullAddress = `${station.street || ''} ${station.house_no || ''}, ${station.post_code || ''} ${station.city || ''}`.trim().replace(/^,|,$/g, '');
    
    const handleItemClick = () => {
      if (station.lat && station.lng && mapRef.current) {
        mapRef.current.setView([station.lat, station.lng], 15);
      }
    };

    return (
      <ListItem key={station.external_id} divider button onClick={handleItemClick}
        secondaryAction={
            <Tooltip title={isFavorite(station.external_id) ? "Favorit entfernen" : "Zu Favoriten hinzufügen"}>
                <IconButton onClick={(e) => { e.stopPropagation(); toggleFavorite(station); }} edge="end">
                {isFavorite(station.external_id) 
                    ? <StarIcon color="warning" />
                    : <StarBorderIcon />
                }
                </IconButton>
            </Tooltip>
        }
      >
        <ListItemText
          primary={
            <Stack direction="row" spacing={1} alignItems="center">
              {station.country_code && <img src={`https://flagcdn.com/w20/${station.country_code.toLowerCase()}.png`} alt={station.country_code} style={{flexShrink: 0, borderRadius: '2px'}} />}
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {station.brand || station.name}
              </Typography>
            </Stack>
          }
          secondary={fullAddress || "Keine Adressdaten"}
        />
        <Chip
          label={typeof price === 'number' && !isNaN(price) ? `${price.toFixed(3)} €` : 'N/A'}
          color={station.last_status === 'open' ? fuelTypeConfig[fuelType].color : 'default'}
          size="small"
        />
      </ListItem>
    );
  };

  const renderProviderAttribution = () => {
    let providerName: string | null = null;
    let isTrusted = false;

    if (viewMode === 'search') {
        providerName = getProviderByCountryCode(selectedCountry);
        isTrusted = allSearchResults.length > 0 ? !!allSearchResults[0].is_trusted_source : false;
    } else if (favorites.length > 0) {
        // favorites.provider ist optional (string | null | undefined).
        // filter(Boolean) narrowt in TypeScript nicht zuverlässig auf string.
        const uniqueProviders = [
          ...new Set(
            favorites
              .map(f => f.provider)
              .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
          ),
        ];
        if (uniqueProviders.length === 1) {
            // TS: uniqueProviders[0] kann theoretisch undefined sein -> absichern.
            providerName = uniqueProviders[0] ?? null;
            isTrusted = favorites.every(f => f.is_trusted_source);
        } else if (uniqueProviders.length > 1) {
            return <Typography variant="caption" color="text.secondary">Quellen: {uniqueProviders.join(', ')}</Typography>;
        }
    }

    if (!providerName) return null;
    
    const url = providerUrls[providerName];
    if (!url) {
        return <Typography variant="caption" color="text.secondary">Quelle: {providerName}</Typography>;
    }

    return (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            Quelle:
            <MuiLink href={url} target="_blank" rel="noopener noreferrer">{providerName}</MuiLink>
            {isTrusted && (
                <Tooltip title="Info zu geprüften Quellen">
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {icon}
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                {title}
            </Typography>
        </Box>
      }
      widgetId={widgetId} 
      onDelete={onDelete} 
      isRemovable={isRemovable} 
      widgetTitle={title} 
      widgetTypeKey={widgetTypeKey} 
      noPadding
    >
      {error && <Alert severity="error" sx={{ m: 2, mb: 0 }}>{error}</Alert>}
      
      <Box sx={{ p: 2, pb: 1 }}>
         <Box 
            sx={{ height: 150, width: '100%', borderRadius: 1, overflow: 'hidden', backgroundColor: '#f0f0f0' }} 
            ref={mapContainerRef} 
        />
      </Box>

      {viewMode === 'search' && (
        <Box sx={{ p: 2, pt: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <FormControl size="small">
              <Select value={selectedCountry} onChange={(e) => setSelectedCountry(e.target.value as CountryCode)}>
                <MenuItem value="DE"><img src={`https://flagcdn.com/w20/de.png`} alt="DE" style={{display: 'block'}}/></MenuItem>
                <MenuItem value="AT"><img src={`https://flagcdn.com/w20/at.png`} alt="AT" style={{display: 'block'}}/></MenuItem>
              </Select>
            </FormControl>
            <TextField
              fullWidth size="small" placeholder="PLZ, Stadt oder Adresse..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(false)}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="In meiner Nähe suchen"><IconButton onClick={handleNearbySearch} disabled={!userLocation || searchLoading} edge="end"><MyLocationIcon /></IconButton></Tooltip>
                    <IconButton onClick={() => handleSearch(false)} disabled={searchLoading} edge="end"><SearchIcon /></IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Stack>
        </Box>
      )}

      <Box sx={{ px: 2, pb: 1 }}>
        <ToggleButtonGroup
            value={fuelType} exclusive fullWidth size="small"
            onChange={(_e, v) => v && setFuelType(v as FuelType)}
            color={fuelTypeConfig[fuelType].color}
        >
          {Object.entries(fuelTypeConfig).map(([key, config]) => {
            const Icon = config.icon;
            return (
              <ToggleButton key={key} value={key} sx={{px: 1}}>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Icon sx={{ fontSize: '1rem' }} />
                  <Typography variant="button" sx={{lineHeight: 1.2}}>{key}</Typography>
                </Stack>
              </ToggleButton>
            );
          })}
        </ToggleButtonGroup>
      </Box>
      
      {/* Mobile Scroll-Logik */}
      <Box sx={{ 
          maxHeight: isMobile ? 'none' : 250, 
          overflowY: isMobile ? 'visible' : 'auto' 
      }}>
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
                  {displayedResults.map(station => renderListItem(station))}
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
      
      {/* Mobile Footer Ansicht (Vertical Stack) */}
      <Stack 
        direction={isMobile ? 'column' : 'row'} 
        justifyContent="space-between" 
        alignItems="center" 
        spacing={isMobile ? 1 : 0}
        sx={{ p: 1 }}
      >
        <Button 
            size="small" 
            fullWidth={isMobile}
            variant={isMobile ? "outlined" : "text"}
            startIcon={viewMode === 'favorites' ? <AddCircleOutlineIcon/> : <ArrowBackIcon />} 
            onClick={() => { setAllSearchResults([]); setDisplayedResults([]); setSearchTerm(''); setViewMode(viewMode === 'favorites' ? 'search' : 'favorites'); }}
        >
          {viewMode === 'favorites' ? `Hinzufügen (${favorites.length}/${FAVORITES_LIMIT})` : 'Zurück'}
        </Button>
        
        {!isMobile && renderProviderAttribution()}
        
        <Stack direction="column" alignItems={isMobile ? "center" : "flex-end"} spacing={0} width={isMobile ? "100%" : "auto"}>
          {lastPriceUpdate && (
            <Typography variant="caption" color="text.secondary" sx={{fontSize: '0.65rem'}}>
              {lastPriceUpdate}
            </Typography>
          )}
          <Button 
            size="small" 
            fullWidth={isMobile}
            variant={isMobile ? "outlined" : "text"}
            startIcon={<RefreshIcon />} 
            onClick={handleRefreshPrices} 
            disabled={loading || viewMode === 'search' || favorites.length === 0}
          >
            Preise aktualisieren
          </Button>
        </Stack>

        {isMobile && <Box sx={{mt: 1}}>{renderProviderAttribution()}</Box>}
      </Stack>
    </WidgetPaper>
  );
};

export default FuelPricesWidget;