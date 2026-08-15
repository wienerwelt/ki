import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Container, Grid, Paper, Typography, Box, Button,
  Card, CardContent, IconButton, CircularProgress,
  Chip, useTheme, useMediaQuery, MenuItem, Select,
  FormControl, InputLabel, InputAdornment, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions,
  alpha, Tabs, Tab, Rating, Avatar, List, ListItem,
  ListItemAvatar, ListItemText, Alert, Divider, Pagination
} from '@mui/material';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';
import { useAuth } from '../context/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

// Icons
import SearchIcon from '@mui/icons-material/Search';
import StorefrontIcon from '@mui/icons-material/Storefront';
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';
import BookmarkAddedIcon from '@mui/icons-material/BookmarkAdded';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import ArticleIcon from '@mui/icons-material/Article';
import NoteAltIcon from '@mui/icons-material/NoteAlt';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import LocationOnIcon from '@mui/icons-material/LocationOn';

// --- TYPES ---
interface ProviderLocation {
  id: string;
  address: string | null;
  zip_code: string | null;
  city: string | null;
  country: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  is_headquarter: boolean;
}

interface Provider {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  website_url: string;
  contact_email: string;
  contact_phone: string;
  is_recommended: boolean;
  average_rating?: number | string;
  review_count?: number | string;
  software_count?: number;
  action_count?: number;
  categories: string[];
  tags: string[];
  locations?: ProviderLocation[];
}

interface ProviderMention {
  id: string;
  title: string;
  original_url: string;
  published_date: string;
  source_identifier: string;
}

interface ProviderReview {
  id: string;
  rating: number;
  comment: string;
  created_at: string;
  user_name: string;
  user_avatar: string | null;
}

interface ProviderNote {
  id: string;
  note_text: string;
  created_at: string;
  user_name: string;
}

// --- HELPER FUNCTIONS ---
function getBackendAssetUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;

  let baseUrl = import.meta.env.VITE_API_URL || '';
  if (baseUrl === '/') baseUrl = '';
  if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

  let cleanUrl = url.startsWith('/') ? url : `/${url}`;
  if (cleanUrl.startsWith('/api/')) cleanUrl = cleanUrl.substring(4);

  const apiPrefix = baseUrl.endsWith('/api') ? '' : '/api';
  return `${baseUrl}${apiPrefix}${cleanUrl}`;
}

function formatProviderAddress(location: ProviderLocation): string {
  const cityLine = [location.zip_code, location.city].filter(Boolean).join(' ');
  return [location.address, cityLine, location.country].filter(Boolean).join(', ');
}

function hasAddressData(location: ProviderLocation): boolean {
  return Boolean(formatProviderAddress(location).trim());
}

function toCoordinate(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getLocationLatLng(location: ProviderLocation): [number, number] | null {
  const lat = toCoordinate(location.latitude);
  const lng = toCoordinate(location.longitude);
  if (lat === null || lng === null) return null;
  return [lat, lng];
}

// BUGFIX: escapeHtml korrigiert, um Syntax-Fehler zu vermeiden
function escapeHtml(value: string | null | undefined): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createProviderLocationIcon(isHeadquarter: boolean, primaryColor: string): L.DivIcon {
  const size = isHeadquarter ? 34 : 26;
  const color = isHeadquarter ? primaryColor : '#64748b';
  const label = isHeadquarter ? 'HQ' : '';

  return L.divIcon({
    className: 'provider-location-marker',
    html: `
      <div style="
        width:${size}px;
        height:${size}px;
        border-radius:50%;
        background:${color};
        border:3px solid #ffffff;
        box-shadow:0 3px 10px rgba(15, 23, 42, 0.35);
        display:flex;
        align-items:center;
        justify-content:center;
        color:#ffffff;
        font-size:10px;
        font-weight:800;
        letter-spacing:-0.3px;
      ">
        ${label}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2)],
  });
}

// --- MAIN COMPONENT ---
const ITEMS_PER_PAGE = 12;

const InternalDirectoryPage: React.FC = () => {
  const { showSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  // Auth Context für Business Partner Name und Review-Check
  const { businessPartner, user } = useAuth();
  const bpName = businessPartner?.name || '';

  // State: Listenansicht
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [categories, setCategories] = useState<{ id: string; name: string; name_lang?: string }[]>([]);
  const [shortlist, setShortlist] = useState<string[]>([]);
  
  // State: Paginierung
  const [page, setPage] = useState(1);

  // State: Detailansicht (Dialog)
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState(0);

  // State: Detaildaten
  const [mentions, setMentions] = useState<ProviderMention[]>([]);
  const [reviews, setReviews] = useState<ProviderReview[]>([]);
  const [notes, setNotes] = useState<ProviderNote[]>([]);

  // State: Inputs
  const [newReviewText, setNewReviewText] = useState('');
  const [newReviewRating, setNewReviewRating] = useState<number | null>(0);
  const [newNoteText, setNewNoteText] = useState('');

  // Leaflet Map für Provider-Standorte
  const providerMapRef = useRef<L.Map | null>(null);
  const providerMapContainerRef = useRef<HTMLDivElement | null>(null);
  const providerMarkersRef = useRef<L.FeatureGroup>(new L.FeatureGroup());

  // Effekt: Debouncing für die Textsuche
  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setPage(1); // Zurück auf Seite 1 springen, wenn sich die Suche ändert
    }, 300);
    return () => clearTimeout(timerId);
  }, [searchTerm]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [provRes, catRes] = await Promise.all([
        apiClient.get('/api/directory/internal'),
        apiClient.get('/api/data/categories?type=directory_service')
      ]);

      setProviders(Array.isArray(provRes.data) ? provRes.data : []);
      setCategories(Array.isArray(catRes.data) ? catRes.data : []);
    } catch (err) {
      console.error("Fehler beim Laden:", err);
      showSnackbar('Fehler beim Laden des Verzeichnisses.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showSnackbar]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCategoryChange = (val: string) => {
    setFilterCategory(val);
    setPage(1); // Zurück auf Seite 1 beim Filterwechsel
  };

  const handleCloseDetail = () => {
    setSelectedProvider(null);
    setDetailTab(0);

    if (providerMapRef.current) {
      providerMapRef.current.remove();
      providerMapRef.current = null;
      providerMarkersRef.current.clearLayers();
    }
  };

  const handleOpenDetail = async (provider: Provider) => {
    setSelectedProvider(provider);
    setDetailTab(0);
    setDetailLoading(true);

    try {
      const [mentionsRes, reviewsRes, notesRes] = await Promise.all([
        apiClient.get(`/api/directory/internal/${provider.id}/mentions`),
        apiClient.get(`/api/directory/internal/${provider.id}/reviews`),
        apiClient.get(`/api/directory/internal/${provider.id}/notes`)
      ]);

      setMentions(Array.isArray(mentionsRes.data) ? mentionsRes.data : []);
      setReviews(Array.isArray(reviewsRes.data) ? reviewsRes.data : []);
      setNotes(Array.isArray(notesRes.data) ? notesRes.data : []);
    } catch (e) {
      showSnackbar('Details konnten nicht geladen werden.', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleShortlist = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();

    if (shortlist.includes(id)) {
      setShortlist(prev => prev.filter(item => item !== id));
      showSnackbar('Von Shortlist entfernt.', 'info');
    } else {
      setShortlist(prev => [...prev, id]);
      showSnackbar('Zur Shortlist hinzugefügt!', 'success');
    }
  };

  const submitReview = async () => {
    if (!newReviewRating || newReviewRating < 1) {
      showSnackbar('Bitte vergeben Sie eine Sterne-Bewertung.', 'warning');
      return;
    }

    try {
      await apiClient.post(`/api/directory/internal/${selectedProvider?.id}/reviews`, {
        rating: newReviewRating,
        comment: newReviewText
      });

      showSnackbar('Bewertung gespeichert!', 'success');
      setNewReviewText('');
      setNewReviewRating(0);

      if (selectedProvider) {
        handleOpenDetail(selectedProvider);
      }
    } catch (e: any) {
      if (e.response?.status === 409) {
        showSnackbar('Sie haben diesen Anbieter bereits bewertet.', 'error');
      } else {
        showSnackbar('Fehler beim Speichern der Bewertung.', 'error');
      }
    }
  };

  const submitNote = async () => {
    if (!newNoteText.trim()) return;

    try {
      await apiClient.post(`/api/directory/internal/${selectedProvider?.id}/notes`, {
        note_text: newNoteText
      });

      showSnackbar('Interne Notiz gespeichert!', 'success');
      setNewNoteText('');

      if (selectedProvider) {
        handleOpenDetail(selectedProvider);
      }
    } catch (e) {
      showSnackbar('Fehler beim Speichern der Notiz.', 'error');
    }
  };

  // Filter Logik mit Debounce
  const filteredProviders = providers.filter(p => {
    const matchesSearch =
      p.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      p.description?.toLowerCase().includes(debouncedSearchTerm.toLowerCase());

    const matchesCategory = filterCategory === 'all' || p.categories.includes(filterCategory);

    return matchesSearch && matchesCategory;
  });

  // Paginierung berechnen
  const totalPages = Math.ceil(filteredProviders.length / ITEMS_PER_PAGE);
  const paginatedProviders = filteredProviders.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // Review-Prüfung: Hat der User hier schon bewertet?
  const userHasReviewed = reviews.some(r => r.user_name === user?.username);

  // Map Logik
  const selectedProviderLocations = selectedProvider?.locations || [];
  const selectedProviderAddressLocations = selectedProviderLocations.filter(hasAddressData);
  const selectedProviderMappableLocations = selectedProviderAddressLocations.filter(location => !!getLocationLatLng(location));

  const shouldShowProviderLocations = selectedProviderAddressLocations.length > 0;
  const shouldShowProviderMap = shouldShowProviderLocations && selectedProviderMappableLocations.length > 0;

  useEffect(() => {
    if (!selectedProvider || detailTab !== 0 || !shouldShowProviderMap) {
      if (providerMapRef.current) {
        providerMapRef.current.remove();
        providerMapRef.current = null;
        providerMarkersRef.current.clearLayers();
      }
      return;
    }

    const timer = setTimeout(() => {
      if (!providerMapContainerRef.current) return;

      const mappableLocations = (selectedProvider.locations || [])
        .filter(hasAddressData)
        .filter(location => !!getLocationLatLng(location));

      if (mappableLocations.length === 0) return;

      const firstLatLng = getLocationLatLng(mappableLocations[0]);
      if (!firstLatLng) return;

      if (!providerMapRef.current) {
        providerMapRef.current = L.map(providerMapContainerRef.current, {
          attributionControl: false,
          zoomControl: true,
        }).setView(firstLatLng, 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(providerMapRef.current);

        providerMarkersRef.current = new L.FeatureGroup();
        providerMarkersRef.current.addTo(providerMapRef.current);
      }

      const map = providerMapRef.current;
      providerMarkersRef.current.clearLayers();

      mappableLocations.forEach((location) => {
        const latLng = getLocationLatLng(location);
        if (!latLng) return;

        const address = formatProviderAddress(location);
        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${latLng[0]},${latLng[1]}`;

        const popupContent = `
          <strong>${escapeHtml(selectedProvider.name)}</strong><br/>
          <span>${location.is_headquarter ? 'Hauptsitz' : 'Niederlassung'}</span><br/>
          ${escapeHtml(address)}<br/>
          <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer">In Google Maps öffnen</a>
        `;

        L.marker(latLng, {
          icon: createProviderLocationIcon(location.is_headquarter, theme.palette.primary.main),
          zIndexOffset: location.is_headquarter ? 1000 : 0,
        })
          .bindPopup(popupContent)
          .addTo(providerMarkersRef.current);
      });

      map.invalidateSize(false);

      const layers = providerMarkersRef.current.getLayers();

      if (layers.length === 1) {
        const onlyLatLng = getLocationLatLng(mappableLocations[0]);
        if (onlyLatLng) map.setView(onlyLatLng, 14);
      } else if (layers.length > 1) {
        map.fitBounds(providerMarkersRef.current.getBounds(), {
          padding: [30, 30],
          maxZoom: 14,
        });
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [
    selectedProvider,
    selectedProvider?.id,
    detailTab,
    shouldShowProviderMap,
    theme.palette.primary.main,
  ]);

  useEffect(() => {
    if (!shouldShowProviderMap || !providerMapContainerRef.current) return;

    let resizeTimer: ReturnType<typeof setTimeout>;

    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        providerMapRef.current?.invalidateSize(false);
      }, 100);
    });

    resizeObserver.observe(providerMapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(resizeTimer);
    };
  }, [shouldShowProviderMap, selectedProvider?.id]);

  useEffect(() => {
    return () => {
      if (providerMapRef.current) {
        providerMapRef.current.remove();
        providerMapRef.current = null;
      }
    };
  }, []);

  return (
    <Container maxWidth="xl" sx={{ mt: 3, mb: 4, px: isMobile ? 1 : 3 }}>
      <Box sx={{ mb: 4, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography variant={isMobile ? 'h5' : 'h4'} sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, fontWeight: 'bold' }}>
          <StorefrontIcon fontSize="large" color="primary" /> 
          {bpName ? `${bpName} Partner-Netzwerk` : 'Partner-Netzwerk'}
          <Typography component="span" variant="inherit" color="text.secondary" sx={{ fontWeight: 'normal', ml: 1 }}>
            ({filteredProviders.length} {filteredProviders.length === 1 ? 'Eintrag' : 'Einträge'})
          </Typography>
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Finde empfohlene Dienstleister, lese Erfahrungen der Community und verwalte Deine Partner.
        </Typography>
      </Box>

      <Paper sx={{ p: 2, mb: 4, borderRadius: 3, display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' }, alignItems: 'center', boxShadow: theme.shadows[2] }}>
        <TextField
          fullWidth
          placeholder="Nach Anbieter, Stichwort oder Dienstleistung suchen..."
          variant="outlined"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (<InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>),
            sx: { borderRadius: 2, bgcolor: 'background.default' }
          }}
        />

        <FormControl size="medium" sx={{ minWidth: { xs: '100%', md: 250 } }}>
          <InputLabel>Branche filtern</InputLabel>
          <Select value={filterCategory} label="Branche filtern" onChange={(e) => handleCategoryChange(e.target.value)} sx={{ borderRadius: 2, bgcolor: 'background.default' }}>
            <MenuItem value="all">Alle Branchen ({providers.length})</MenuItem>
            {Array.isArray(categories) && categories
              .map(c => ({ ...c, count: providers.filter(p => p.categories.includes(c.id)).length }))
              .filter(c => c.count > 0)
              .map(c => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name_lang || c.name} ({c.count})
                </MenuItem>
              ))
            }
          </Select>
        </FormControl>

        <Button
          variant={shortlist.length > 0 ? 'contained' : 'outlined'}
          color="primary"
          startIcon={<BookmarkAddedIcon />}
          sx={{ minWidth: 200, height: 56, borderRadius: 2, fontWeight: 'bold' }}
          onClick={() => showSnackbar('Shortlist-Export folgt in Kürze.', 'info')}
        >
          Meine Shortlist ({shortlist.length})
        </Button>
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Grid container spacing={3}>
            {paginatedProviders.length === 0 ? (
              <Grid item xs={12}>
                <Typography textAlign="center" color="text.secondary" py={5}>
                  Keine Dienstleister für diese Suchkriterien gefunden.
                </Typography>
              </Grid>
            ) : paginatedProviders.map(provider => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={provider.id}>
                <Card
                  onClick={() => handleOpenDetail(provider)}
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 3,
                    cursor: 'pointer',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    border: provider.is_recommended ? `2px solid ${theme.palette.primary.main}` : '1px solid transparent',
                    '&:hover': { transform: 'translateY(-4px)', boxShadow: theme.shadows[6] }
                  }}
                >
                  <Box sx={{ p: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', height: 120, bgcolor: 'white', borderBottom: `1px solid ${theme.palette.divider}` }}>
                    {provider.logo_url ? (
                      <img
                        src={getBackendAssetUrl(provider.logo_url)}
                        alt={provider.name}
                        style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                      />
                    ) : (
                      <Typography variant="h5" color="text.disabled" fontWeight="bold">
                        {provider.name.charAt(0)}
                      </Typography>
                    )}
                  </Box>

                  <CardContent sx={{ flexGrow: 1, p: 2.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                      <Typography variant="h6" fontWeight="bold" lineHeight={1.2}>
                        {provider.name}
                      </Typography>
                      <IconButton size="small" onClick={(e) => toggleShortlist(e, provider.id)} sx={{ mt: -1, mr: -1, color: shortlist.includes(provider.id) ? 'primary.main' : 'text.disabled' }}>
                        {shortlist.includes(provider.id) ? <BookmarkAddedIcon /> : <BookmarkAddOutlinedIcon />}
                      </IconButton>
                    </Box>

                    {provider.is_recommended && (
                      <Chip icon={<VerifiedUserIcon fontSize="small" />} label="Empfohlen" size="small" color="primary" sx={{ mb: 2, height: 20, fontSize: '0.7rem', fontWeight: 'bold' }} />
                    )}

                    {(Number(provider.software_count) > 0 || Number(provider.action_count) > 0) && (
                      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
                        {Number(provider.software_count) > 0 && <Chip size="small" label={`Software ${provider.software_count}`} color="info" variant="outlined" />}
                        {Number(provider.action_count) > 0 && <Chip size="small" label={`Angebote ${provider.action_count}`} color="secondary" variant="outlined" />}
                      </Box>
                    )}

                    <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', mb: 2 }}>
                      {provider.description || 'Keine Beschreibung verfügbar.'}
                    </Typography>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Rating value={Number(provider.average_rating) || 0} readOnly size="small" precision={0.5} />
                      <Typography variant="caption" color="text.secondary">
                        ({provider.review_count || 0} Bewertungen)
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Paginierungskomponente */}
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
              <Pagination 
                count={totalPages} 
                page={page} 
                onChange={(_, value) => setPage(value)} 
                color="primary" 
                size={isMobile ? "small" : "large"}
              />
            </Box>
          )}
        </>
      )}

      <Dialog open={!!selectedProvider} onClose={handleCloseDetail} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: 3, minHeight: '60vh' } }}>
        {selectedProvider && (
          <>
            <DialogTitle sx={{ p: 0, borderBottom: `1px solid ${theme.palette.divider}` }}>
              <Box sx={{ display: 'flex', alignItems: 'center', p: 3, bgcolor: alpha(theme.palette.primary.main, 0.03) }}>
                <Avatar
                  src={selectedProvider.logo_url ? getBackendAssetUrl(selectedProvider.logo_url) : undefined}
                  sx={{ width: 80, height: 80, mr: 3, bgcolor: 'white', border: `1px solid ${theme.palette.divider}` }}
                >
                  {!selectedProvider.logo_url && <StorefrontIcon color="action" fontSize="large" />}
                </Avatar>

                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="h5" fontWeight="bold">
                    {selectedProvider.name}
                  </Typography>
                  {selectedProvider.is_recommended && (
                    <Chip icon={<VerifiedUserIcon fontSize="small" />} label="Offizieller FVA Partner" size="small" color="primary" sx={{ mt: 0.5, fontWeight: 'bold' }} />
                  )}
                </Box>

                <IconButton onClick={handleCloseDetail}>
                  <CloseIcon />
                </IconButton>
              </Box>

              <Tabs value={detailTab} onChange={(_, val) => setDetailTab(val)} indicatorColor="primary" textColor="primary" variant="fullWidth">
                <Tab label="Übersicht & News" />
                <Tab label={`Erfahrungen (${reviews.length})`} />
                <Tab label="Interne Notizen" />
              </Tabs>
            </DialogTitle>

            <DialogContent sx={{ p: 0, bgcolor: 'background.default' }}>
              {detailLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <Box sx={{ p: 3 }}>
                  {detailTab === 0 && (
                    <Grid container spacing={4}>
                      <Grid item xs={12} md={7}>
                        <Typography variant="h6" fontWeight="bold" gutterBottom>
                          Über das Unternehmen
                        </Typography>
                        <Typography variant="body1" sx={{ whiteSpace: 'pre-line', mb: 4 }}>
                          {selectedProvider.description || 'Keine Beschreibung verfügbar.'}
                        </Typography>

                        <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <ArticleIcon color="primary" /> Erwähnt im Dashboard
                        </Typography>
                        <Typography variant="body2" color="text.secondary" mb={2}>
                          Fachartikel, in denen dieser Anbieter von unserer KI gefunden wurde.
                        </Typography>

                        {mentions.length === 0 ? (
                          <Alert severity="info" sx={{ borderRadius: 2 }}>
                            Keine aktuellen Erwähnungen in unseren Fachmedien gefunden.
                          </Alert>
                        ) : (
                          <List disablePadding>
                            {mentions.map(m => (
                              <ListItem
                                key={m.id}
                                component="a"
                                href={m.original_url}
                                target="_blank"
                                sx={{
                                  p: 2,
                                  mb: 1,
                                  bgcolor: 'background.paper',
                                  borderRadius: 2,
                                  border: `1px solid ${theme.palette.divider}`,
                                  '&:hover': { bgcolor: 'action.hover' }
                                }}
                              >
                                <ListItemText
                                  primary={<Typography variant="subtitle2" fontWeight="bold" color="primary.main">{m.title}</Typography>}
                                  secondary={`${m.source_identifier} • ${new Date(m.published_date).toLocaleDateString('de-DE')}`}
                                />
                                <OpenInNewIcon fontSize="small" color="action" sx={{ ml: 2 }} />
                              </ListItem>
                            ))}
                          </List>
                        )}
                      </Grid>

                      <Grid item xs={12} md={5}>
                        <Paper sx={{ p: 3, borderRadius: 3, bgcolor: 'background.paper', border: `1px solid ${theme.palette.divider}` }}>
                          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                            Kontakt
                          </Typography>

                          {selectedProvider.website_url && (
                            <Button
                              startIcon={<OpenInNewIcon />}
                              href={selectedProvider.website_url}
                              target="_blank"
                              fullWidth
                              variant="outlined"
                              sx={{ mb: 2, justifyContent: 'flex-start' }}
                            >
                              Zur Webseite
                            </Button>
                          )}

                          {selectedProvider.contact_email && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, color: 'text.secondary' }}>
                              <EmailIcon fontSize="small" />
                              <Typography variant="body2">{selectedProvider.contact_email}</Typography>
                            </Box>
                          )}

                          {selectedProvider.contact_phone && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, color: 'text.secondary' }}>
                              <PhoneIcon fontSize="small" />
                              <Typography variant="body2">{selectedProvider.contact_phone}</Typography>
                            </Box>
                          )}

                          {shouldShowProviderLocations && (
                            <>
                              <Divider sx={{ my: 2 }} />

                              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                                Standorte
                              </Typography>

                              <List disablePadding sx={{ mb: shouldShowProviderMap ? 2 : 0 }}>
                                {selectedProviderAddressLocations.map((location, index) => {
                                  const address = formatProviderAddress(location);

                                  return (
                                    <ListItem
                                      key={location.id || `${address}-${index}`}
                                      disableGutters
                                      sx={{
                                        py: 1,
                                        alignItems: 'flex-start',
                                        borderBottom: index < selectedProviderAddressLocations.length - 1 ? `1px solid ${theme.palette.divider}` : 'none',
                                      }}
                                    >
                                      <Box
                                        sx={{
                                          width: 34,
                                          height: 34,
                                          borderRadius: 2,
                                          flexShrink: 0,
                                          mr: 1.5,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          bgcolor: location.is_headquarter
                                            ? alpha(theme.palette.primary.main, 0.12)
                                            : alpha(theme.palette.text.secondary, 0.08),
                                        }}
                                      >
                                        <LocationOnIcon
                                          sx={{
                                            fontSize: 19,
                                            color: location.is_headquarter ? 'primary.main' : 'text.secondary',
                                          }}
                                        />
                                      </Box>

                                      <ListItemText
                                        primary={
                                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                            <Typography variant="body2" fontWeight="bold">
                                              {location.is_headquarter ? 'Hauptsitz' : `Niederlassung ${index + 1}`}
                                            </Typography>
                                            {location.is_headquarter && (
                                              <Chip
                                                label="Hauptsitz"
                                                size="small"
                                                color="primary"
                                                sx={{ height: 20, fontSize: '0.68rem', fontWeight: 'bold' }}
                                              />
                                            )}
                                          </Box>
                                        }
                                        secondary={
                                          <Typography variant="body2" color="text.secondary">
                                            {address}
                                          </Typography>
                                        }
                                      />
                                    </ListItem>
                                  );
                                })}
                              </List>

                              {/* Map Fallback für Adblocker */}
                              {shouldShowProviderMap && (
                                <Box sx={{ position: 'relative' }}>
                                  <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.100', borderRadius: 2.5, zIndex: 0 }}>
                                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', p: 2 }}>
                                      Karte wird geladen...<br/>
                                      <span style={{ fontSize: '0.8rem' }}>Falls sie nicht erscheint, prüfen Sie Ihre Adblocker-Einstellungen.</span>
                                    </Typography>
                                  </Box>
                                  <Box
                                    ref={providerMapContainerRef}
                                    sx={{
                                      height: 240,
                                      width: '100%',
                                      borderRadius: 2.5,
                                      overflow: 'hidden',
                                      border: `1px solid ${theme.palette.divider}`,
                                      bgcolor: 'transparent',
                                      position: 'relative',
                                      zIndex: 1
                                    }}
                                  />
                                </Box>
                              )}

                              {!shouldShowProviderMap && selectedProviderAddressLocations.length > 0 && (
                                <Alert severity="info" sx={{ mt: 2, borderRadius: 2 }}>
                                  Für diese Standorte sind noch keine Kartenkoordinaten hinterlegt.
                                </Alert>
                              )}
                            </>
                          )}
                        </Paper>
                      </Grid>
                    </Grid>
                  )}

                  {detailTab === 1 && (
                    <Box>
                      <Typography variant="h6" fontWeight="bold" gutterBottom>
                        Community Erfahrungen
                      </Typography>
                      <Typography variant="body2" color="text.secondary" mb={3}>
                        Nur verifizierte Mitglieder können hier Bewertungen hinterlassen.
                      </Typography>

                      {/* Check auf bereits existierende Bewertung */}
                      {userHasReviewed ? (
                        <Alert severity="success" sx={{ mb: 4, borderRadius: 2 }}>
                          Sie haben Ihre Erfahrung für diesen Dienstleister bereits geteilt. Vielen Dank!
                        </Alert>
                      ) : (
                        <Paper sx={{ p: 3, mb: 4, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.05) }}>
                          <Typography variant="subtitle2" fontWeight="bold" mb={1}>
                            Eigene Erfahrung teilen
                          </Typography>
                          <Rating value={newReviewRating} onChange={(_, val) => setNewReviewRating(val)} sx={{ mb: 2 }} />
                          <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                              fullWidth
                              size="small"
                              placeholder="Wie waren Ihre Erfahrungen mit diesem Anbieter?"
                              value={newReviewText}
                              onChange={(e) => setNewReviewText(e.target.value)}
                              sx={{ bgcolor: 'background.paper' }}
                            />
                            <Button variant="contained" onClick={submitReview} endIcon={<SendIcon />}>
                              Senden
                            </Button>
                          </Box>
                        </Paper>
                      )}

                      <List disablePadding>
                        {reviews.length === 0 ? (
                          <Typography color="text.secondary" fontStyle="italic">
                            Noch keine Bewertungen vorhanden.
                          </Typography>
                        ) : reviews.map(r => (
                          <ListItem key={r.id} alignItems="flex-start" sx={{ px: 0, mb: 2 }}>
                            <ListItemAvatar>
                              <Avatar src={r.user_avatar || undefined}>{r.user_name.charAt(0)}</Avatar>
                            </ListItemAvatar>
                            <ListItemText
                              primary={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                  <Typography variant="subtitle2" fontWeight="bold">
                                    {r.user_name}
                                  </Typography>
                                  <Rating value={r.rating} readOnly size="small" />
                                  <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
                                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: de })}
                                  </Typography>
                                </Box>
                              }
                              secondary={<Typography variant="body2" color="text.primary">{r.comment}</Typography>}
                            />
                          </ListItem>
                        ))}
                      </List>
                    </Box>
                  )}

                  {detailTab === 2 && (
                    <Box>
                      <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <NoteAltIcon color="primary" /> Interne Notizen
                      </Typography>
                      <Typography variant="body2" color="text.secondary" mb={3}>
                        Diese Notizen sind privat und nur für Mitglieder sichtbar.
                      </Typography>

                      <Box sx={{ display: 'flex', gap: 2, mb: 4 }}>
                        <TextField
                          fullWidth
                          size="small"
                          placeholder="Z.B. Rahmenvertrag läuft bis 12/2026, Ansprechpartner ist Herr Müller..."
                          value={newNoteText}
                          onChange={(e) => setNewNoteText(e.target.value)}
                        />
                        <Button variant="outlined" onClick={submitNote} startIcon={<NoteAltIcon />}>
                          Notieren
                        </Button>
                      </Box>

                      <List disablePadding>
                        {notes.length === 0 ? (
                          <Typography color="text.secondary" fontStyle="italic">
                            Keine internen Notizen hinterlegt.
                          </Typography>
                        ) : notes.map(n => (
                          <Paper key={n.id} sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: '#fffbf0', borderLeft: '4px solid #ffc107' }}>
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-line', mb: 1 }}>
                              {n.note_text}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block" textAlign="right">
                              Hinterlegt von <b>{n.user_name}</b> am {new Date(n.created_at).toLocaleDateString('de-DE')}
                            </Typography>
                          </Paper>
                        ))}
                      </List>
                    </Box>
                  )}
                </Box>
              )}
            </DialogContent>

            <DialogActions sx={{ p: 2, bgcolor: 'background.paper', borderTop: `1px solid ${theme.palette.divider}` }}>
              <Button
                variant={shortlist.includes(selectedProvider.id) ? 'outlined' : 'contained'}
                onClick={(e) => toggleShortlist(e as any, selectedProvider.id)}
                startIcon={shortlist.includes(selectedProvider.id) ? <BookmarkAddedIcon /> : <BookmarkAddOutlinedIcon />}
              >
                {shortlist.includes(selectedProvider.id) ? 'Von Shortlist entfernen' : 'Auf die Shortlist'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <style>{`
        .provider-location-marker {
          background: transparent;
          border: none;
        }
      `}</style>
    </Container>
  );
};

export default InternalDirectoryPage;
