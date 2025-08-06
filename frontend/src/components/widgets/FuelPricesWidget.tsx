import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, CircularProgress, Alert, List, ListItem, ListItemText, Divider,
    TextField, MenuItem, Tooltip, Link as MuiLink, IconButton,
    ToggleButtonGroup, ToggleButton, Chip, Button, Stack, InputAdornment
} from '@mui/material';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import ClearIcon from '@mui/icons-material/Clear';

import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps, Region } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';

type FuelType = 'diesel' | 'e5' | 'e10';
type ViewMode = 'favorites' | 'search';
type SortByType = 'price' | 'dist'; // NEU

const fuelTypeColors: { [key in FuelType]: 'primary' | 'success' | 'warning' } = {
    diesel: 'primary',
    e5: 'success',
    e10: 'warning',
};

interface FavoriteStation {
    id: string;
    name: string;
    brand: string;
    street: string;
    houseNumber?: string;
    postCode: string;
    city: string;
    lat: number;
    lng: number;
    countryCode: string;
}

interface StationPrice extends FavoriteStation {
    price?: number;
    distance?: number;
    isOpen?: boolean;
}

const useLocalStorage = <T,>(key: string, initialValue: T): [T, (value: T) => void] => {
    const [storedValue, setStoredValue] = useState<T>(() => {
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : initialValue;
        } catch (error) {
            console.error(error);
            return initialValue;
        }
    });

    const setValue = (value: T) => {
        try {
            const valueToStore = value instanceof Function ? value(storedValue) : value;
            setStoredValue(valueToStore);
            window.localStorage.setItem(key, JSON.stringify(valueToStore));
        } catch (error) {
            console.error(error);
        }
    };
    return [storedValue, setValue];
};

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
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


const FuelPricesWidget: React.FC<BaseWidgetProps> = ({ onDelete, widgetId, isRemovable }) => {
    const { user } = useAuth();
    const [favorites, setFavorites] = useLocalStorage<FavoriteStation[]>('fuelFavorites', []);
    const [pricedFavorites, setPricedFavorites] = useState<StationPrice[]>([]);
    
    const [viewMode, setViewMode] = useState<ViewMode>('favorites');
    const [searchResults, setSearchResults] = useState<FavoriteStation[]>([]);
    
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
    const [fuelType, setFuelType] = useState<FuelType>('diesel');
    const [searchTerm, setSearchTerm] = useState('');
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);
    const [sortBy, setSortBy] = useState<SortByType>('price'); // NEU: State für die Sortierung

    useEffect(() => {
        if (user?.regions && user.regions.length > 0) {
            const defaultRegion = user.regions.find(r => !!r.is_default) || user.regions[0];
            setSelectedRegion(defaultRegion);
        }
    }, [user?.regions]);

    useEffect(() => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
            },
            (err) => console.warn("Standort konnte nicht ermittelt werden:", err.message)
        );
    }, []);

    const fetchFavoritePrices = useCallback(async () => {
        if (favorites.length === 0) {
            setPricedFavorites([]);
            return;
        }
        
        setIsLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const favoritesByCountry: { [key: string]: string[] } = {};
            favorites.forEach(fav => {
                if (!favoritesByCountry[fav.countryCode]) {
                    favoritesByCountry[fav.countryCode] = [];
                }
                favoritesByCountry[fav.countryCode].push(fav.id);
            });

            let allPriceData: any = {};

            for (const countryCode of Object.keys(favoritesByCountry)) {
                const response = await apiClient.get('/api/data/fuel/prices-by-ids', {
                    params: { ids: favoritesByCountry[countryCode].join(','), country: countryCode },
                    headers: { 'x-auth-token': token }
                });
                if (response.data.ok) {
                    allPriceData = { ...allPriceData, ...response.data.prices };
                } else {
                    throw new Error(response.data.message || `Preise für ${countryCode} konnten nicht geladen werden.`);
                }
            }
            
            setLastFetchTime(new Date());

            const pricedList = favorites.map(fav => {
                const priceInfo = allPriceData[fav.id];
                const distance = userLocation ? getDistance(userLocation.lat, userLocation.lng, fav.lat, fav.lng) : undefined;
                return {
                    ...fav,
                    price: priceInfo ? priceInfo[fuelType] : undefined,
                    isOpen: priceInfo ? priceInfo.status === 'open' : false,
                    distance: distance
                };
            }).sort((a, b) => (a.price || 999) - (b.price || 999));

            setPricedFavorites(pricedList);

        } catch (err: any) {
            setError(err?.response?.data?.message || err.message || 'Fehler beim Abrufen der Preise.');
        } finally {
            setIsLoading(false);
        }
    }, [favorites, userLocation, fuelType]);

    useEffect(() => {
        fetchFavoritePrices();
    }, [favorites, fetchFavoritePrices]);


    const handleSearch = useCallback(async (useCurrentLocation = false) => {
        if (!selectedRegion || (!searchTerm && !useCurrentLocation)) return;
        
        setIsLoading(true);
        setError(null);
        setSearchResults([]);
        
        try {
            const token = localStorage.getItem('jwt_token');
            const params: any = {
                country: selectedRegion.code,
                fuelType: fuelType,
                sortBy: sortBy, // NEU: Sortierungsparameter senden
            };

            if (useCurrentLocation && userLocation) {
                params.lat = userLocation.lat;
                params.lng = userLocation.lng;
                params.rad = 10;
            } else {
                params.query = searchTerm;
            }
            
            const response = await apiClient.get('/api/data/fuel/search', { params, headers: { 'x-auth-token': token } });

            if (response.data.ok) {
                setSearchResults(response.data.stations);
            } else {
                setError(response.data.message || 'Suche fehlgeschlagen.');
            }
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Fehler bei der Tankstellensuche.');
        } finally {
            setIsLoading(false);
        }
    }, [selectedRegion, searchTerm, userLocation, fuelType, sortBy]);
    
    // NEU: Löst eine neue Suche aus, wenn die Sortierung geändert wird
    useEffect(() => {
        if (viewMode === 'search' && (searchTerm || userLocation)) {
            handleSearch(!!userLocation && !searchTerm);
        }
    }, [sortBy, viewMode]);

    const clearSearch = () => {
        setSearchTerm('');
        setSearchResults([]);
        setError(null);
    };

    const isFavorite = (stationId: string) => favorites.some(f => f.id === stationId);

    const toggleFavorite = (station: FavoriteStation) => {
        if (isFavorite(station.id)) {
            setFavorites(favorites.filter(f => f.id !== station.id));
        } else {
            if (favorites.length < 10) {
                setFavorites([...favorites, station]);
            } else {
                alert("Sie können maximal 10 Favoriten speichern.");
            }
        }
    };

    const renderHeader = () => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', width: '100%', p: 1 }}>
            <LocalGasStationIcon />
            <Typography variant="h6">Kraftstoffpreise</Typography>
            
            <Box sx={{ flexGrow: 1, minWidth: '150px' }} onMouseDown={(e) => e.stopPropagation()}>
                <ToggleButtonGroup 
                    value={fuelType} 
                    exclusive 
                    size="small" 
                    onChange={(_e, newType) => newType && setFuelType(newType)} 
                    color={fuelTypeColors[fuelType]}
                    fullWidth
                >
                    <ToggleButton value="diesel" sx={{ flex: 1 }}>Diesel</ToggleButton>
                    <ToggleButton value="e5" sx={{ flex: 1 }}>E5</ToggleButton>
                    <ToggleButton value="e10" sx={{ flex: 1 }}>E10</ToggleButton>
                </ToggleButtonGroup>
            </Box>

            <Box onMouseDown={(e) => e.stopPropagation()}>
                {user?.regions && (
                    <TextField select value={selectedRegion?.id || ''} size="small" variant="outlined"
                        onChange={(e) => {
                            setError(null);
                            setSelectedRegion(user.regions?.find(r => r.id === e.target.value) || null)
                        }}
                    >
                        {user.regions.map((region) => (
                            <MenuItem key={region.id} value={region.id}>
                                <Tooltip title={region.name} placement="right">
                                    <img src={`https://flagcdn.com/w20/${region.code.toLowerCase()}.png`} width="20" alt={region.name}/>
                                </Tooltip>
                            </MenuItem>
                        ))}
                    </TextField>
                )}
            </Box>
             <Tooltip title={viewMode === 'favorites' ? "Favoriten suchen" : "Zurück zur Favoriten-Ansicht"}>
                <IconButton onMouseDown={(e) => e.stopPropagation()} onClick={() => {
                    setError(null);
                    setViewMode(viewMode === 'favorites' ? 'search' : 'favorites')
                }}>
                    {viewMode === 'favorites' ? <AddIcon /> : <ArrowBackIcon />}
                </IconButton>
            </Tooltip>
        </Box>
    );

    const renderStationListItem = (station: StationPrice | FavoriteStation, isSearchResult: boolean) => {
        const pricedStation = station as StationPrice;
        const fullAddress = `${station.brand} ${station.name}, ${station.street} ${station.houseNumber || ''}, ${station.postCode} ${station.city}`;
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;

        return (
             <ListItem
                key={station.id}
                secondaryAction={
                     <IconButton edge="end" onClick={(e) => {
                         e.stopPropagation();
                         toggleFavorite(station as FavoriteStation);
                     }}>
                        {isSearchResult ? (
                             <Tooltip title={isFavorite(station.id) ? "Favorit entfernen" : "Als Favorit speichern"}>
                                {isFavorite(station.id) ? <StarIcon color="warning"/> : <StarBorderIcon />}
                             </Tooltip>
                        ) : (
                             <Tooltip title="Favorit entfernen">
                                <DeleteIcon />
                             </Tooltip>
                        )}
                    </IconButton>
                }
                sx={{ '&:hover': { bgcolor: 'action.hover' }, p: 1, pr: 6 }}
            >
                <Stack direction="row" alignItems="center" sx={{ width: '100%' }}>
                     <ListItemText 
                        primary={<Typography variant="body2" sx={{fontWeight: 'bold'}}>{station.brand} - {station.city}</Typography>}
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
                                {`${station.street} ${station.houseNumber || ''}, ${station.postCode}`}
                            </MuiLink>
                        }
                    />
                    {!isSearchResult && (
                        <Stack direction="row" spacing={2} alignItems="center" sx={{ ml: 'auto', pl: 1 }}>
                            {pricedStation.price ? (
                                <Chip 
                                    label={`${pricedStation.price} €`}
                                    color={pricedStation.isOpen ? fuelTypeColors[fuelType] : 'default'}
                                    size="small"
                                    variant={pricedStation.isOpen ? 'filled' : 'outlined'}
                                />
                             ) : <Chip label="N/A" size="small"/>}
                            {pricedStation.distance && <Typography variant="caption" sx={{ minWidth: '50px', textAlign: 'right' }}>{pricedStation.distance.toFixed(1)} km</Typography>}
                        </Stack>
                    )}
                </Stack>
            </ListItem>
        );
    }

    const renderFavoritesView = () => (
        <>
            {isLoading && <Box sx={{display: 'flex', justifyContent: 'center', p: 2}}><CircularProgress size={24}/></Box>}
            {error && <Alert severity="error" sx={{m: 1}}>{error}</Alert>}
            {!isLoading && !error && pricedFavorites.length > 0 && (
                <List dense sx={{ p: 0 }}>
                    {pricedFavorites.map(station => renderStationListItem(station, false))}
                </List>
            )}
             {!isLoading && !error && favorites.length === 0 && (
                <Box sx={{textAlign: 'center', p: 3}}>
                    <Typography color="text.secondary">Sie haben noch keine Favoriten.</Typography>
                    <Button startIcon={<AddIcon/>} sx={{mt: 1}} onClick={() => setViewMode('search')}>Jetzt Tankstellen suchen</Button>
                </Box>
            )}
        </>
    );

    const renderSearchView = () => (
         <Box>
            <Stack direction="row" spacing={1} sx={{ p: 1, alignItems: 'center' }}>
                <TextField
                    fullWidth
                    size="small"
                    variant="outlined"
                    placeholder="PLZ oder Stadt suchen..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    InputProps={{
                        endAdornment: searchTerm && (
                            <InputAdornment position="end">
                                <IconButton onClick={clearSearch} edge="end" size="small">
                                    <ClearIcon />
                                </IconButton>
                            </InputAdornment>
                        ),
                    }}
                />
                 <Tooltip title="In meiner Nähe suchen (10km)">
                    <span>
                        <IconButton onClick={() => handleSearch(true)} disabled={!userLocation}>
                            <MyLocationIcon />
                        </IconButton>
                    </span>
                </Tooltip>
            </Stack>
            {/* NEU: Sortier-Umschalter */}
            <Box sx={{ px: 1, pb: 1, display: 'flex', justifyContent: 'flex-end' }}>
                <ToggleButtonGroup
                    value={sortBy}
                    exclusive
                    size="small"
                    onChange={(_e, newSort) => newSort && setSortBy(newSort)}
                >
                    <ToggleButton value="price">Preis</ToggleButton>
                    <ToggleButton value="dist">Distanz</ToggleButton>
                </ToggleButtonGroup>
            </Box>
            <Divider />
            {isLoading && <Box sx={{display: 'flex', justifyContent: 'center', p: 2}}><CircularProgress size={24}/></Box>}
            {error && <Alert severity="error" sx={{m: 1}}>{error}</Alert>}
            {!isLoading && !error && searchResults.length > 0 && (
                 <List dense sx={{maxHeight: 300, overflowY: 'auto', p: 0 }}>
                    {searchResults.map(station => renderStationListItem(station, true))}
                </List>
            )}
             {!isLoading && !error && searchResults.length === 0 && <Typography sx={{p: 2, textAlign: 'center'}} color="text.secondary">Keine Ergebnisse oder Suche starten.</Typography>}
        </Box>
    );

    return (
        <WidgetPaper title={renderHeader()} widgetId={widgetId} onDelete={onDelete} isRemovable={isRemovable} noPadding>
            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                {viewMode === 'favorites' ? renderFavoritesView() : renderSearchView()}
            </Box>
            <Box sx={{ p: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary">
                    {lastFetchTime ? `${lastFetchTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr ${formatTimeAgo(lastFetchTime)}` : ''}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                    Daten von <MuiLink href="https://tankerkoenig.de" target="_blank" rel="noopener">Tankerkönig</MuiLink>
                </Typography>
            </Box>
        </WidgetPaper>
    );
};

export default FuelPricesWidget;
