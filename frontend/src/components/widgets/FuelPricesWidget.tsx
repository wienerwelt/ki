import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, CircularProgress, Alert, List, ListItem, ListItemText, Divider,
  TextField, MenuItem, Tooltip, Link as MuiLink, IconButton,
  ToggleButtonGroup, ToggleButton, Chip, Button, Stack, InputAdornment
} from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import ClearIcon from '@mui/icons-material/Clear';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate } from 'react-router-dom';

import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import { useSnackbar } from '../../context/SnackbarContext';

type FuelType = 'diesel' | 'e5' | 'e10';
type ViewMode = 'favorites' | 'search';
type SortByType = 'price' | 'dist';

interface FuelPricesWidgetProps extends BaseWidgetProps {
  icon?: React.ReactNode;
  title: string;
  widgetTypeKey: string;
}

interface FavoriteInfo {
  external_id: string;
  name?: string;
  country?: string;       // z.B. 'DE' | 'AT'
  country_code?: string;  // falls das Backend dieses Feld liefert
}

interface StationBase {
  id: string;
  name?: string;
  brand?: string;
  street?: string;
  houseNumber?: string;
  postCode?: string | number;
  city?: string;
  lat?: number;
  lng?: number;
  countryCode: 'DE' | 'AT';
}

interface StationPrice extends StationBase {
  diesel?: number | null;
  e5?: number | null;
  e10?: number | null;
  status?: string;
  isOpen?: boolean;
  price?: number | null;
  distance?: number;
}

const fuelTypeColors: { [key in FuelType]: 'primary' | 'success' | 'warning' } = {
  diesel: 'primary',
  e5: 'success',
  e10: 'warning',
};

const providerInfo: { [key: string]: { name: string; url: string } } = {
  DE: { name: 'Tankerkönig', url: 'https://www.tankerkoenig.de' },
  AT: { name: 'E-Control', url: 'https://www.e-control.at/spritpreisrechner' },
};

const SUPPORTED_REGIONS: { code: 'DE' | 'AT'; name: string }[] = [
  { code: 'DE', name: 'Deutschland' },
  { code: 'AT', name: 'Österreich' },
];

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const formatTimeAgo = (date: Date | null): string => {
  if (!date) return '';
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return '(gerade eben)';
  if (minutes === 1) return '(vor 1 Min.)';
  return `(vor ${minutes} Min.)`;
};

const FuelPricesWidget: React.FC<FuelPricesWidgetProps> = ({
  onDelete, widgetId, isRemovable, icon, title, widgetTypeKey
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showSnackbar } = useSnackbar();

  const [favorites, setFavorites] = useState<FavoriteInfo[]>([]);
  const [pricedStations, setPricedStations] = useState<StationPrice[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('favorites');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partialErrors, setPartialErrors] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<'DE' | 'AT'>('DE');
  const [fuelType, setFuelType] = useState<FuelType>('diesel');
  const [searchTerm, setSearchTerm] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);
  const [sortBy, setSortBy] = useState<SortByType>('price');

  const isProviderAvailable = useMemo(
    () => SUPPORTED_REGIONS.some(r => r.code === selectedCountry),
    [selectedCountry]
  );

  // Favoriten laden
  const fetchFavoritesFromDB = useCallback(async () => {
    if (!user) { setFavorites([]); return; }
    try {
      const res = await apiClient.get(`/api/users/favorites?widgetType=${widgetTypeKey}`);
      const raw: any[] = Array.isArray(res.data) ? res.data : [];
      const norm = raw.map((f: any) => ({
        external_id: f.external_id ?? f.id, // Fallback, falls Backend „id“ = external_id liefert
        name: f.name,
        country: (f.country_code ?? f.country ?? '').toString().toUpperCase(),
        country_code: (f.country_code ?? f.country ?? '').toString().toUpperCase(),
      })) as FavoriteInfo[];
      setFavorites(norm);
    } catch (err) {
      console.error('Fehler beim Laden der Favoriten:', err);
      setError('Favoriten konnten nicht geladen werden.');
      setFavorites([]);
    }
  }, [user, widgetTypeKey]);

  // Daten holen (Suche / Favoriten)
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setPartialErrors([]);

    let stationsToFetch: StationBase[] = [];

    try {
      if (!isProviderAvailable) {
        setIsLoading(false);
        setPricedStations([]);
        setError(`Für ${selectedCountry} ist kein Anbieter verfügbar.`);
        return;
      }

      if (viewMode === 'search') {
        const activeCountry: 'DE' | 'AT' = selectedCountry; // << wird *benutzt* (fix fürs TS-„unused“-Warning)

        const isLocationSearch = !submittedSearch && !!userLocation;
        if (!submittedSearch && !isLocationSearch) {
          // ohne Suchbegriff & ohne Standort: nichts tun
          setIsLoading(false);
          setPricedStations([]);
          return;
        }

        const params: any = { country: activeCountry, fuelType, sortBy };
        if (isLocationSearch && userLocation) {
          params.lat = userLocation.lat;
          params.lng = userLocation.lng;
          params.rad = 10;
        } else {
          params.query = submittedSearch.trim();
        }

        const response = await apiClient.get('/api/data/fuel/search', { params });
        const stations = Array.isArray(response.data?.stations) ? response.data.stations : [];
        stationsToFetch = (stations as any[]).map((s: any) => ({
          id: String(s.id),
          name: s.name,
          brand: s.brand,
          street: s.street,
          houseNumber: s.houseNumber,
          postCode: s.postCode,
          city: s.city ?? s.place,
          lat: s.lat,
          lng: s.lng,
          countryCode: activeCountry
        }));
      } else {
        // FAVORITEN: IDs pro Land gruppieren
        const favsByCountry = favorites.reduce<Record<'DE' | 'AT', string[]>>((acc: any, f) => {
          const c = ((f.country ?? f.country_code) || '').toUpperCase();
          if (c === 'DE' || c === 'AT') {
            acc[c] = acc[c] || [];
            acc[c].push(f.external_id);
          }
          return acc;
        }, {} as any);

        const priceCalls: Promise<{ country: 'DE' | 'AT'; data: any }>[] = Object
          .entries(favsByCountry)
          .filter(([, ids]) => (ids as string[]).length > 0)
          .map(([country, ids]) =>
            apiClient.get('/api/data/fuel/prices-by-ids', {
              params: { ids: (ids as string[]).join(','), country }
            }).then(r => ({ country: country as 'DE' | 'AT', data: r.data }))
              .catch(() => ({ country: country as 'DE' | 'AT', data: { ok: false } }))
          );

        const priceResults = await Promise.all(priceCalls);

        const collected: StationBase[] = [];
        priceResults.forEach(({ country, data }) => {
          if (data?.ok) {
            const prices = data.prices || {};
            Object.keys(prices).forEach((id) => {
              const p = prices[id];
              collected.push({
                id,
                name: p.name,
                brand: p.brand,
                street: p.street,
                houseNumber: p.houseNumber,
                postCode: String(p.postCode ?? ''),
                city: p.place ?? p.city,
                lat: p.lat,
                lng: p.lng,
                countryCode: country
              });
            });
          } else {
            setPartialErrors(prev => [...prev, `Preise für ${providerInfo[country]?.name || country} konnten nicht geladen werden.`]);
          }
        });

        stationsToFetch = collected;
      }

      if (stationsToFetch.length === 0) {
        setPricedStations([]);
        setLastFetchTime(new Date());
        setIsLoading(false);
        return;
      }

      // IDs erneut pro Land gruppieren für einen konsistenten Preis-Refetch (aktueller Kraftstoff & Status)
      const byCountry = stationsToFetch.reduce<Record<'DE' | 'AT', string[]>>((acc: any, s) => {
        const c = s.countryCode;
        acc[c] = acc[c] || [];
        acc[c].push(s.id);
        return acc;
      }, {} as any);

      const pricePromises = Object.entries(byCountry)
        .filter(([, ids]) => (ids as string[]).length > 0)
        .map(([country, ids]) =>
          apiClient.get('/api/data/fuel/prices-by-ids', {
            params: { ids: (ids as string[]).join(','), country }
          })
        );

      const results = await Promise.allSettled(pricePromises);

      let allPriceData: Record<string, any> = {};
      results.forEach((result, idx) => {
        const country = Object.keys(byCountry)[idx] as 'DE' | 'AT';
        if (result.status === 'fulfilled' && result.value.data?.ok) {
          allPriceData = { ...allPriceData, ...(result.value.data.prices || {}) };
        } else {
          setPartialErrors(prev => [...prev, `Preise für ${providerInfo[country]?.name || country} konnten nicht geladen werden.`]);
        }
      });

      const finalPriced = stationsToFetch.map((s) => {
        const p = allPriceData[s.id];
        if (!p) return null;
        const distance = (userLocation && p.lat != null && p.lng != null)
          ? getDistance(userLocation.lat, userLocation.lng, p.lat, p.lng)
          : undefined;
        const isOpen = p.status === 'open' || p.isOpen === true;
        const merged: StationPrice = {
          ...s,
          ...p,
          price: p?.[fuelType],
          distance,
          isOpen
        };
        return merged;
      }).filter(Boolean) as StationPrice[];

      const sorted = [...finalPriced].sort((a, b) => {
        if (sortBy === 'dist') {
          const da = a.distance ?? Number.POSITIVE_INFINITY;
          const db = b.distance ?? Number.POSITIVE_INFINITY;
          return da - db;
        }
        const pa = a.price ?? Number.POSITIVE_INFINITY;
        const pb = b.price ?? Number.POSITIVE_INFINITY;
        return pa - pb;
      });

      setPricedStations(sorted);
      setLastFetchTime(new Date());
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || 'Fehler beim Laden der Daten.');
    } finally {
      setIsLoading(false);
    }
  }, [
    viewMode, favorites, fuelType, selectedCountry,
    sortBy, submittedSearch, userLocation, isProviderAvailable
  ]);

  // Initial: Standort + Favoriten laden
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => { /* still okay */ }
      );
    }
    fetchFavoritesFromDB();
  }, [fetchFavoritesFromDB]);

  // Reload bei Abhängigkeitsänderung
  useEffect(() => { fetchData(); }, [fetchData]);

  // Suche
  const handleSearchSubmit = () => {
    if (searchTerm.trim()) {
      setSubmittedSearch(searchTerm.trim());
    } else {
      setSubmittedSearch('');
      if (viewMode === 'search') {
        fetchData();
      }
    }
  };
  const clearSearch = () => { setSearchTerm(''); setSubmittedSearch(''); };

  // Favoriten-Utilities
  const isFavorite = useCallback(
    (stationId: string) => favorites.some(f => f.external_id === stationId),
    [favorites]
  );

  const toggleFavorite = useCallback(async (station: StationBase) => {
    const isFav = isFavorite(station.id);
    try {
      if (isFav) {
        await apiClient.delete(`/api/users/favorites/${station.id}?widgetType=${widgetTypeKey}`);
        showSnackbar('Favorit entfernt', 'info');
      } else {
        if (favorites.length >= 50) {
          showSnackbar('Maximal 50 Favoriten speicherbar.', 'warning');
          return;
        }
        await apiClient.post('/api/users/favorites', {
          widgetType: widgetTypeKey,
          favorite: {
            external_id: station.id,
            name: `${station.brand ?? ''} ${station.name ?? ''}`.trim(),
            country: station.countryCode
          }
        });
        showSnackbar('Favorit gespeichert!', 'success');
      }
      fetchFavoritesFromDB();
    } catch (e: any) {
      showSnackbar(e?.response?.data?.message || 'Favorit konnte nicht gespeichert werden.', 'error');
    }
  }, [favorites, widgetTypeKey, showSnackbar, fetchFavoritesFromDB, isFavorite]);

  const renderStationListItem = (station: StationPrice, isSearchResult: boolean) => {
    const fullAddress =
      `${station.brand ?? ''} ${station.name ?? ''}, ${station.street ?? ''} ${station.houseNumber ?? ''}, ${station.postCode ?? ''} ${station.city ?? ''}`.replace(/\s+/g, ' ').trim();
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;

    return (
      <ListItem
        key={station.id}
        secondaryAction={
          <IconButton edge="end" onClick={(e) => { e.stopPropagation(); toggleFavorite(station); }}>
            <Tooltip title={isFavorite(station.id) ? 'Favorit entfernen' : 'Als Favorit speichern'}>
              {isFavorite(station.id) ? <StarIcon color="warning" /> : <StarBorderIcon />}
            </Tooltip>
          </IconButton>
        }
        sx={{ '&:hover': { bgcolor: 'action.hover' }, p: 1, pr: 6 }}
      >
        <Stack direction="row" alignItems="center" sx={{ width: '100%' }}>
          <ListItemText
            primary={<Typography variant="body2" sx={{ fontWeight: 'bold' }}>{station.brand} - {station.city}</Typography>}
            secondary={
              <MuiLink
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                variant="caption"
                color="text.secondary"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, textDecoration: 'none' }}
                onClick={(e) => e.stopPropagation()}
              >
                <LocationOnIcon sx={{ fontSize: '0.875rem' }} />
                {`${station.street ?? ''} ${station.houseNumber ?? ''}, ${station.postCode ?? ''} ${station.city ?? ''}`}
              </MuiLink>
            }
          />
          <Stack direction="row" spacing={2} alignItems="center" sx={{ ml: 'auto', pl: 1 }}>
            {station.price != null ? (
              <Chip
                label={`${Number(station.price).toFixed(3)} €`}
                color={station.isOpen ? fuelTypeColors[fuelType] : 'default'}
                size="small"
                variant={station.isOpen ? 'filled' : 'outlined'}
              />
            ) : <Chip label="N/A" size="small" />}
            {station.distance != null && (
              <Typography variant="caption" sx={{ minWidth: 50, textAlign: 'right' }}>
                {station.distance.toFixed(1)} km
              </Typography>
            )}
          </Stack>
        </Stack>
      </ListItem>
    );
  };

  const renderHeader = () => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', width: '100%' }}>
      {icon} <Typography variant="h6">{title}</Typography>

      <Box sx={{ flexGrow: 1, minWidth: 150 }} onMouseDown={(e) => e.stopPropagation()}>
        <ToggleButtonGroup
          value={fuelType}
          exclusive
          size="small"
          onChange={(_e, v) => v && setFuelType(v)}
          color={fuelTypeColors[fuelType]}
          fullWidth
        >
          <ToggleButton value="diesel" sx={{ flex: 1 }}>Diesel</ToggleButton>
          <ToggleButton value="e5" sx={{ flex: 1 }}>E5</ToggleButton>
          <ToggleButton value="e10" sx={{ flex: 1 }}>E10</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <TextField
        select
        value={selectedCountry}
        size="small"
        variant="outlined"
        sx={{ minWidth: 88 }}
        onChange={(e) => setSelectedCountry(e.target.value as 'DE' | 'AT')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {SUPPORTED_REGIONS.map((r) => (
          <MenuItem key={r.code} value={r.code}>
            <Tooltip title={r.name} placement="right">
              <img src={`https://flagcdn.com/w20/${r.code.toLowerCase()}.png`} width="20" alt={r.name} />
            </Tooltip>
          </MenuItem>
        ))}
      </TextField>

      <Tooltip title={viewMode === 'favorites' ? 'Tankstelle suchen' : 'Zurück zu Favoriten'}>
        <IconButton
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => { setError(null); setViewMode(viewMode === 'favorites' ? 'search' : 'favorites'); }}
          size="small"
        >
          {viewMode === 'favorites' ? <AddIcon /> : <ArrowBackIcon />}
        </IconButton>
      </Tooltip>
    </Box>
  );

  const renderFavoritesView = () => (
    <>
      {partialErrors.map(err => <Alert key={err} severity="warning" sx={{ m: 1, mt: 0, mb: 1 }}>{err}</Alert>)}
      {pricedStations.length > 0 && (
        <List dense sx={{ p: 0 }}>
          {pricedStations.map(station => renderStationListItem(station, false))}
        </List>
      )}
      {!isLoading && favorites.length === 0 && (
        <Box sx={{ textAlign: 'center', p: 3 }}>
          <Typography color="text.secondary">Sie haben noch keine Favoriten.</Typography>
          <Button startIcon={<AddIcon />} sx={{ mt: 1 }} onClick={() => setViewMode('search')}>
            Jetzt Tankstellen suchen
          </Button>
        </Box>
      )}
    </>
  );

  const renderSearchView = () => (
    <Box>
      <Stack direction="row" spacing={1} sx={{ p: 1, alignItems: 'center' }} onMouseDown={(e) => e.stopPropagation()}>
        <TextField
          fullWidth
          size="small"
          variant="outlined"
          placeholder="PLZ oder Stadt suchen..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearchSubmit(); }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <IconButton onClick={handleSearchSubmit} edge="start">
                  <SearchIcon />
                </IconButton>
              </InputAdornment>
            ),
            endAdornment: searchTerm && (
              <InputAdornment position="end">
                <IconButton onClick={clearSearch} edge="end" size="small"><ClearIcon /></IconButton>
              </InputAdornment>
            )
          }}
        />

        <Tooltip title="In meiner Nähe suchen">
          <span>
            <IconButton onClick={() => { setSubmittedSearch(''); fetchData(); }} disabled={!userLocation}>
              <MyLocationIcon />
            </IconButton>
          </span>
        </Tooltip>

        <ToggleButtonGroup
          value={sortBy}
          exclusive
          size="small"
          onChange={(_e, v) => v && setSortBy(v)}
        >
          <ToggleButton value="price">Preis</ToggleButton>
          <ToggleButton value="dist">Distanz</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Divider />

      {pricedStations.length > 0 ? (
        <List dense sx={{ maxHeight: 300, overflowY: 'auto', p: 0 }}>
          {pricedStations.map(station => renderStationListItem(station, true))}
        </List>
      ) : (
        !isLoading && submittedSearch && (
          <Typography sx={{ p: 2, textAlign: 'center' }} color="text.secondary">
            Keine Ergebnisse für Ihre Suche.
          </Typography>
        )
      )}
    </Box>
  );

  const getProviderAttribution = () => {
    const codesInUse = new Set<string>();
    if (viewMode === 'favorites') {
      favorites.forEach(f => { const c = (f.country || f.country_code || '').toUpperCase(); if (c) codesInUse.add(c); });
    } else {
      const c = selectedCountry;
      if (c) codesInUse.add(c);
    }
    const active = [...codesInUse].map(code => providerInfo[code]).filter(Boolean) as { name: string; url: string }[];
    if (active.length === 0) return null;

    return (
      <Typography variant="caption" color="text.secondary">
        Quelle:{' '}
        {active.map((provider, i) => (
          <React.Fragment key={provider.name}>
            <MuiLink href={provider.url} target="_blank" rel="noopener">{provider.name}</MuiLink>
            {i < active.length - 1 ? ', ' : ''}
          </React.Fragment>
        ))}
      </Typography>
    );
  };

  return (
    <WidgetPaper
      title={renderHeader()}
      widgetTitle={title}
      widgetTypeKey={widgetTypeKey}
      widgetId={widgetId}
      onDelete={onDelete}
      isRemovable={isRemovable}
      noPadding
    >
      {error && (
        <Alert
          severity="error"
          sx={{ m: 1 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => navigate('/feedback')}
              startIcon={<ReportProblemOutlinedIcon />}
            >
              Fehler melden
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
          {viewMode === 'favorites' ? renderFavoritesView() : renderSearchView()}
        </Box>
      )}

      <Box
        sx={{
          p: 1,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: 1,
          borderColor: 'divider'
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {lastFetchTime
            ? `${lastFetchTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr ${formatTimeAgo(lastFetchTime)}`
            : ''}
        </Typography>
        {getProviderAttribution()}
      </Box>
    </WidgetPaper>
  );
};

export default FuelPricesWidget;
