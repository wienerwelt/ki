// frontend/src/pages/PublicPortalPage.tsx
import React, { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import {
    Avatar,
    Badge,
    Box,
    Button,
    Chip,
    CircularProgress,
    Collapse,
    Container,
    Dialog,
    DialogContent,
    DialogTitle,
    Grid,
    IconButton,
    InputBase,
    MenuItem,
    Paper,
    Rating,
    Select,
    Stack,
    Tab,
    Tabs,
    ThemeProvider,
    Typography,
    createTheme,
    useTheme, useMediaQuery
} from '@mui/material';
import { alpha } from '@mui/material/styles';

import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';
import LoginForm from '../components/LoginForm';

// Icons
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BarChartIcon from '@mui/icons-material/BarChart';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import EmailIcon from '@mui/icons-material/Email';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import LanguageIcon from '@mui/icons-material/Language';
import LockIcon from '@mui/icons-material/Lock';
import PhoneIcon from '@mui/icons-material/Phone';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import SearchIcon from '@mui/icons-material/Search';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import StorefrontIcon from '@mui/icons-material/Storefront';
import UpdateIcon from '@mui/icons-material/Update';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';

// --- WIDGETS (lazy) ---
const EVStationWidget = lazy(() => import('../components/widgets/EVStationWidget'));
const CommodityPricesWidget = lazy(() => import('../components/widgets/CommodityPricesWidget'));
const SentimentWidget = lazy(() => import('../components/widgets/SentimentWidget'));
const DailyCockpitWidget = lazy(() => import('../components/widgets/DailyCockpitWidget'));
const EventCalendarWidget = lazy(() => import('../components/widgets/EventCalendarWidget'));
const FundingWidget = lazy(() => import('../components/widgets/FundingWidget'));
const BpActionsWidget = lazy(() => import('../components/widgets/BusinessPartnerActionsWidget'));

interface PublicPortalPageProps {
    isRegister?: boolean;
}

// --- HILFSKOMPONENTE FÜR FEHLENDE BILDER ---
const ImageWithFallback = ({ src, alt, fallbackColor, sx, ...props }: any) => {
    const [hasError, setHasError] = useState(false);

    if (!src || hasError) {
        return (
            <Box sx={{ ...sx, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: alpha(fallbackColor || '#0B2442', 0.08), borderRadius: 1 }}>
                <StorefrontIcon sx={{ color: alpha(fallbackColor || '#0B2442', 0.4), fontSize: sx?.maxHeight ? Number(sx.maxHeight) * 0.5 : 24 }} />
            </Box>
        );
    }
    return <Box component="img" src={src} alt={alt} sx={sx} onError={() => setHasError(true)} {...props} />;
};

const PublicPortalPage: React.FC<PublicPortalPageProps> = ({ isRegister = false }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const urlPartnerCode = searchParams.get('partner');
    // "Stiller" Fallback auf den Demo-Partner, wenn die URL leer ist
    const partnerCode = urlPartnerCode || '5649c95a';
    
    const [publicContext, setPublicContext] = useState<any>(null);
    const [isPageLoading, setIsPageLoading] = useState(true);

    const [isHeroOpen, setIsHeroOpen] = useState(true);

    const [publicProviders, setPublicProviders] = useState<any[]>([]);
    const [isFetchingDirectory, setIsFetchingDirectory] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedRegion, setSelectedRegion] = useState('all');

    const [selectedTeaserProvider, setSelectedTeaserProvider] = useState<any | null>(null);
    const [teaserTab, setTeaserTab] = useState(0);
    const [loginDialogOpen, setLoginDialogOpen] = useState(false);

    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapInstanceRef = useRef<any>(null);

    const theme = useTheme();
    const location = useLocation();
    const navigate = useNavigate();
    const { showSnackbar } = useSnackbar();

    useEffect(() => {
        const fetchBranding = async () => {
            setIsPageLoading(true);
            try {
                const res = await apiClient.get(`/api/public/context?partnerCode=${partnerCode}`);
                setPublicContext(res.data);
                
                if (res.data?.partner?.dashboard_title) {
                    document.title = `${res.data.partner.dashboard_title} | Public Portal`;
                } else if (res.data?.partner?.name) {
                    document.title = `${res.data.partner.name} | Portal`;
                }
            } catch (e: any) {
                console.error('💥 [PORTAL] Unerwarteter Fehler beim Context-Laden:', e);
            } finally {
                setIsPageLoading(false);
            }
        };
        fetchBranding();
    }, [partnerCode]);

    useEffect(() => {
        const timer = setTimeout(() => setIsHeroOpen(false), 3000);
        return () => clearTimeout(timer);
    }, []);

    const partner = publicContext?.partner;
    const partnerTheme = publicContext?.theme || {};
    const primaryColor = partnerTheme?.primary_color || partner?.primary_color || theme.palette.primary.main || '#159447';
    const secondaryColor = partnerTheme?.secondary_color || '#0B2442';
    const darkBlue = '#061B33';
    const softBg = '#F7FAFC';
    const logoUrl = partner?.logo_url ? getAssetUrl(partner.logo_url) : null;
    const partnerName = partner?.name || 'IHRE ORGANISATION';
    const partnerClaim = partner?.claim || 'Gemeinsam. Stärker. Zukunft.';
    const partnerWebsite = partner?.url_businesspartner || '';
    const dashboardTitle = partner?.dashboard_title || 'Ihr Branchen-Dashboard';
    const defaultRegion = publicContext?.defaultRegion || 'AT';
    const allowedWidgets = publicContext?.allowedWidgets || [];
    const newsPreview = publicContext?.newsPreview || [];
    const tenantStats = publicContext?.stats || { total_directory_entries: 0, community_members: 0, community_activity: 0 };
    const loginRoute = `/login${urlPartnerCode ? `?partner=${encodeURIComponent(urlPartnerCode)}` : ''}`;
    
    // --- MANUELLE BILD-WEICHE ---
    const customHeroImages: Record<string, string> = {
        'fd7a5bfd': '/actions/fuhrparkverband-austria_publicfoto_fd7a5bfd.png',
        // 'weitererCode': '/actions/anderes_bild.png',
    };

    const heroImageUrl = customHeroImages[partnerCode] 
        ? customHeroImages[partnerCode] 
        : (partner?.hero_image_url ? getAssetUrl(partner.hero_image_url) : 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1200&q=80');

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        setPage(1);
        setPublicProviders([]);
        setHasMore(true);
    }, [debouncedSearch, selectedCategory, selectedRegion]);

    useEffect(() => {
        if (!partner?.id) return;

        const fetchDirectory = async () => {
            setIsFetchingDirectory(true);
            try {
                const params = new URLSearchParams({
                    partnerId: partner.id,
                    page: page.toString(),
                    limit: '12',
                });
                
                if (debouncedSearch) params.append('search', debouncedSearch);
                if (selectedCategory !== 'all') params.append('category', selectedCategory);
                if (selectedRegion !== 'all') params.append('region', selectedRegion);

                const res = await apiClient.get(`/api/public/directory?${params.toString()}`);
                const newData = res.data.data || [];
                
                if (newData.length < 12) setHasMore(false);
                setPublicProviders(prev => page === 1 ? newData : [...prev, ...newData]);
            } catch (error) {
                showSnackbar('Fehler beim Laden der Anbieter', 'error');
            } finally {
                setIsFetchingDirectory(false);
            }
        };

        fetchDirectory();
    }, [partner?.id, page, debouncedSearch, selectedCategory, selectedRegion, showSnackbar]);

    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        publicProviders.forEach((p) => {
            if (p.category) counts[p.category] = (counts[p.category] || 0) + 1;
        });
        return counts;
    }, [publicProviders]);

    const regionOptions = useMemo(() => {
        const regions = new Set<string>();
        publicProviders.forEach((p) => {
            (p.locations || []).forEach((loc: any) => {
                if (loc?.city) regions.add(loc.city);
                else if (loc?.zip_code) regions.add(loc.zip_code);
            });
        });
        return Array.from(regions).sort((a, b) => a.localeCompare(b, 'de'));
    }, [publicProviders]);

    const loginTheme = useMemo(() => createTheme({
        ...theme,
        palette: { ...theme.palette, mode: 'light', primary: { main: primaryColor } },
        components: {
            MuiTextField: { styleOverrides: { root: { '& .MuiOutlinedInput-root': { borderRadius: '12px', height: '58px' } } } },
            MuiButton: { styleOverrides: { root: { borderRadius: '12px', height: '58px', fontWeight: 'bold', textTransform: 'none' } } },
        },
    }), [primaryColor, theme]);

    const glassCockpitTheme = useMemo(() => createTheme({
        ...theme,
        palette: {
            mode: 'dark',
            primary: { main: '#ffffff' },
            background: { paper: 'rgba(0, 0, 0, 0.25)', default: 'rgba(0, 0, 0, 0)' },
            text: { primary: '#ffffff', secondary: alpha('#ffffff', 0.8) },
        },
        components: {
            MuiPaper: { styleOverrides: { root: { backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' } } },
            MuiCard: { styleOverrides: { root: { backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)' } } },
            MuiChip: { styleOverrides: { root: { backgroundColor: 'rgba(255,255,255,0.15)', color: '#ffffff' } } },
        },
    }), [theme]);

    useEffect(() => {
        if (!selectedTeaserProvider || teaserTab !== 0) return;
        const loc = selectedTeaserProvider?.locations?.[0];
        if (!loc?.latitude || !loc?.longitude) return;

        let isMounted = true;
        const initMap = async () => {
            if (!mapContainerRef.current) return;
            const L = await import('leaflet');
            if (!isMounted || !mapContainerRef.current) return;
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }

            mapInstanceRef.current = L.map(mapContainerRef.current, { attributionControl: false, zoomControl: true }).setView([loc.latitude, loc.longitude], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapInstanceRef.current);
            const icon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="width:24px; height:24px; background:${primaryColor}; border-radius:50%; border:3px solid #fff; box-shadow:0 0 10px rgba(0,0,0,0.5);"></div>`,
                iconSize: [24, 24],
            });
            L.marker([loc.latitude, loc.longitude], { icon }).addTo(mapInstanceRef.current);
        };

        const timer = setTimeout(initMap, 150);
        return () => {
            isMounted = false;
            clearTimeout(timer);
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, [selectedTeaserProvider, teaserTab, primaryColor]);

    function getAssetUrl(url: string | null | undefined): string {
        if (!url) return '';
        if (/^https?:\/\//i.test(url)) return url;
        if (url.startsWith('/logos/') || url.startsWith('/images/') || url.startsWith('/static/')) return url;
        let baseUrl = import.meta.env.VITE_API_URL || '';
        if (baseUrl === '/') baseUrl = '';
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
        let cleanUrl = url.startsWith('/') ? url : `/${url}`;
        if (cleanUrl.startsWith('/api/')) cleanUrl = cleanUrl.substring(4);
        const apiPrefix = baseUrl.endsWith('/api') ? '' : '/api';
        return `${baseUrl}${apiPrefix}${cleanUrl}`;
    }

    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const handleLoginCta = () => {
        if (!location.pathname.includes('/login')) navigate(loginRoute);
        setLoginDialogOpen(true);
    };

    const handleScrollToDirectory = () => {
        document.getElementById('branchenverzeichnis')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const navItems = ['Für Mitglieder', 'Branchenverzeichnis', 'News & Insights', 'Community', 'Statistiken', 'Über uns'];
    
    useEffect(() => {
        if (searchParams.get('verified') === '1') {
            showSnackbar('E-Mail erfolgreich bestätigt! Sie können sich nun anmelden.', 'success');
            searchParams.delete('verified');
            setSearchParams(searchParams, { replace: true });
            setLoginDialogOpen(true);
        }
    }, [searchParams, setSearchParams, showSnackbar]);

    const [tickerIndex, setTickerIndex] = useState(0);
    const tickerMessages = ['Exklusive Branchen-News freigeschaltet', 'Netzwerk & Community verfügbar', 'Statistiken und Marktanalysen aktualisiert'];
    useEffect(() => {
        const interval = setInterval(() => setTickerIndex((prev) => (prev + 1) % tickerMessages.length), 4000);
        return () => clearInterval(interval);
    }, [tickerMessages.length]);

    const formatNumber = (value: number) => new Intl.NumberFormat('de-DE').format(value);
    
    const statsCards = [
        { value: tenantStats.member_companies ? formatNumber(Number(tenantStats.member_companies)) : '50+', label: 'Mitgliedsunternehmen', helper: tenantStats.member_companies_delta || 'aus dem Verzeichnis', icon: StorefrontIcon },
        { value: tenantStats.network_partners ? formatNumber(Number(tenantStats.network_partners)) : 'Netzwerk', label: 'Partner im Netzwerk', helper: 'aktiv gepflegt', icon: GroupsOutlinedIcon },
        { value: tenantStats.events_per_year ? formatNumber(Number(tenantStats.events_per_year)) : 'Live', label: 'Veranstaltungen/Jahr', helper: 'Termine & Insights', icon: CalendarMonthIcon },
        { value: tenantStats.member_satisfaction ? `${tenantStats.member_satisfaction}%` : '—', label: 'Mitgliederzufriedenheit', helper: tenantStats.member_satisfaction ? '★★★★★' : 'nach Login', icon: BarChartIcon },
    ];
    const logoProviders = publicProviders.filter((p) => p.logo_url).slice(0, 8);
    const insights = (newsPreview.length > 0 ? newsPreview : [
        { id: 'insight-1', title: 'Förderprogramme: Neue Chancen für Mitgliedsunternehmen', published_date: new Date().toISOString(), type: 'Branchen-News' },
        { id: 'insight-2', title: 'Logistikmarkt im Wandel: Trends und Prognosen', published_date: new Date().toISOString(), type: 'Markt-Analyse' },
        { id: 'insight-3', title: 'Einladung: Mitgliederversammlung und Netzwerkabend', published_date: new Date().toISOString(), type: 'Verband' },
    ]).slice(0, 3);

    const getDateLabel = (dateValue: string) => {
        try { return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(dateValue)); } 
        catch { return ''; }
    };

    const renderWidget = (widgetInfo: any, index: number) => {
        const props = { isPublic: true, widgetId: `pub-${widgetInfo.type_key}-${index}`, widgetTypeKey: widgetInfo.type_key, title: widgetInfo.name, isRemovable: false, onDelete: () => {} };
        let content: React.ReactNode;
        switch (widgetInfo.type_key) {
            case 'EVStation': content = <EVStationWidget {...props} />; break;
            case 'CommodityPrices': content = <CommodityPricesWidget {...props} />; break;
            case 'sentiment_widget': content = <SentimentWidget {...props} />; break;
            case 'daily_cockpit': content = <DailyCockpitWidget {...props} />; break;
            case 'EventCalendar': content = <EventCalendarWidget {...props} category="fleet_events, industry_events, businesspartner_events" defaultRegion={defaultRegion} />; break;
            case 'business-partner-actions': case 'BusinessPartnerAktionen': case 'BusinessPartnerActionsWidget': content = <BpActionsWidget {...props} />; break;
            case 'funding_widget': case 'Funding': case 'FundingWidget': content = <FundingWidget {...props} />; break;
            default: content = <Paper sx={{ p: 4, borderRadius: 3, bgcolor: 'rgba(255,255,255, 0.1)', border: '1px dashed rgba(255,255,255,0.3)' }}><Typography sx={{ color: '#fff' }} align="center">Widget "{widgetInfo.name}" ist noch nicht konfiguriert.</Typography></Paper>;
        }
        return <Suspense fallback={<Paper sx={{ p: 4, borderRadius: 3, bgcolor: 'rgba(255, 255, 255, 0.1)', display: 'flex', justifyContent: 'center' }}><CircularProgress sx={{color: '#fff'}} size={24} /></Paper>}>{content}</Suspense>;
    };

    let mainColumnWidgets: any[] = [];
    let sideColumnWidgets: any[] = [];
    let fullWidthWidgets: any[] = [];
    if (allowedWidgets && allowedWidgets.length > 0) {
        fullWidthWidgets = allowedWidgets.filter((w: any) => w.type_key === 'daily_cockpit');
        const nonFullWidth = allowedWidgets.filter((w: any) => w.type_key !== 'daily_cockpit');
        nonFullWidth.forEach((w: any, index: number) => {
            if (index % 2 === 0) mainColumnWidgets.push(w);
            else sideColumnWidgets.push(w);
        });
    }

const renderProviderPreviewCard = (provider: any) => {
        const loc = provider.locations?.[0];
        return (
            <Paper key={provider.id} elevation={0} sx={{ p: theme.spacing(2.5), borderRadius: 3, border: `1px solid ${alpha(darkBlue, 0.1)}`, bgcolor: '#fff', height: '100%', display: 'flex', flexDirection: 'column', transition: 'all 180ms ease', '&:hover': { transform: 'translateY(-3px)', boxShadow: `0 16px 34px ${alpha(darkBlue, 0.12)}`, borderColor: alpha(primaryColor, 0.35) } }}>
                <Box sx={{ height: 44, display: 'flex', alignItems: 'center', mb: 1.5 }}>
                    <ImageWithFallback src={provider.logo_url ? getAssetUrl(provider.logo_url) : null} alt={provider.name} fallbackColor={primaryColor} loading="lazy" sx={{ maxHeight: 40, maxWidth: 130, objectFit: 'contain' }} />
                </Box>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
                    <Typography variant="subtitle1" fontWeight={900} color={darkBlue} noWrap>{provider.name}</Typography>
                    {provider.is_recommended && <VerifiedUserIcon sx={{ color: primaryColor, fontSize: 17 }} />}
                </Stack>
                <Typography variant="caption" sx={{ color: alpha(darkBlue, 0.58), mb: 1 }}>{provider.category || 'Netzwerkpartner'}</Typography>
                
                {/* --- HIER DIE ÄNDERUNG --- */}
                <Typography 
                    variant="body2" 
                    sx={{ 
                        color: alpha(darkBlue, 0.78), 
                        display: { xs: 'none', sm: '-webkit-box' }, // Auf Mobile (xs) ausblenden, ab sm anzeigen
                        WebkitLineClamp: 3, 
                        WebkitBoxOrient: 'vertical', 
                        overflow: 'hidden', 
                        minHeight: { xs: 0, sm: 60 }, // Auf Mobile Höhe auf 0 setzen, damit der Platz frei wird
                        lineHeight: 1.45, 
                        mb: { xs: 1, sm: 2 }         // Auf Mobile kleinerer Abstand
                    }}
                >
                    {provider.description || 'Führender Anbieter im Branchen-Netzwerk.'}
                </Typography>

                {loc?.city && (
                    <Stack direction="row" alignItems="center" spacing={0.6} sx={{ color: alpha(darkBlue, 0.58), mb: 2 }}>
                        <PlaceOutlinedIcon sx={{ fontSize: 16 }} />
                        <Typography variant="caption" noWrap>{loc.city}{loc.zip_code ? `, ${loc.zip_code}` : ''}</Typography>
                    </Stack>
                )}
                <Box sx={{ mt: 'auto' }}>
                    <Button size="small" variant="outlined" onClick={() => { setSelectedTeaserProvider(provider); setTeaserTab(0); }} sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 800, color: darkBlue, borderColor: alpha(darkBlue, 0.24), '&:hover': { borderColor: primaryColor, bgcolor: alpha(primaryColor, 0.06) } }}>Profil ansehen</Button>
                </Box>
            </Paper>
        );
    };

    if (isPageLoading) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: softBg, alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress size={58} thickness={4} sx={{ color: primaryColor, mb: 3 }} />
                <Typography variant="h6" color={darkBlue} fontWeight={900} sx={{ letterSpacing: 1, textTransform: 'uppercase' }}>Portal wird geladen</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: softBg, color: darkBlue, overflowX: 'hidden' }}>
            {/* --- HEADER --- */}
            <Box component="header" sx={{ position: 'sticky', top: 0, zIndex: 40, bgcolor: alpha('#ffffff', 0.96), backdropFilter: 'blur(16px)', borderBottom: `1px solid ${alpha(darkBlue, 0.09)}` }}>
                <Container maxWidth="xl" sx={{ py: 1.2 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                        
                        {/* Logo & Text - Flexibler durch min-width: 0 */}
                        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                            <Box sx={{ flexShrink: 0 }}>
                                <ImageWithFallback src={logoUrl} alt={partnerName} fallbackColor={primaryColor} loading="lazy" sx={{ width: { xs: 40, md: 52 }, height: { xs: 34, md: 42 }, objectFit: 'contain' }} />
                            </Box>
                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="subtitle1" fontWeight={950} color={darkBlue} lineHeight={1.1} noWrap>{partnerName}</Typography>
                                {/* Responsive Schriftgröße für den Claim: Auf Mobile kleiner */}
                                <Typography variant="caption" sx={{ color: alpha(darkBlue, 0.66), fontWeight: 700, display: 'block', fontSize: { xs: '0.65rem', md: '0.75rem' } }} noWrap>
                                    {partnerClaim}
                                </Typography>
                            </Box>
                        </Stack>

                        {/* Nav Items (nur Desktop) */}
                        <Stack direction="row" alignItems="center" spacing={2} sx={{ display: { xs: 'none', lg: 'flex' }, justifyContent: 'center' }}>
                            {navItems.map((item) => {
                                const isExternal = item === 'Über uns' || item === 'Für Mitglieder';
                                let badgeCount = null;
                                if (item === 'Branchenverzeichnis' && tenantStats.total_directory_entries > 0) badgeCount = tenantStats.total_directory_entries;
                                if (item === 'Für Mitglieder' && tenantStats.community_members > 0) badgeCount = tenantStats.community_members;
                                if (item === 'Community' && tenantStats.community_activity > 0) badgeCount = tenantStats.community_activity;

                                const buttonElement = (
                                    <Button onClick={() => {
                                        if (item === 'Branchenverzeichnis') handleScrollToDirectory();
                                        else if (isExternal && partnerWebsite) window.open(partnerWebsite.startsWith('http') ? partnerWebsite : `https://${partnerWebsite}`, '_blank', 'noopener,noreferrer');
                                        else handleLoginCta();
                                    }} variant="text" sx={{ color: darkBlue, fontSize: 13, fontWeight: 800, textTransform: 'none', minWidth: 'auto', px: 1 }}>{item}</Button>
                                );

                                return (
                                    <Box key={item}>
                                        {badgeCount ? (
                                            <Badge badgeContent={badgeCount} max={999} color="primary" sx={{ '& .MuiBadge-badge': { right: 2, top: 2, fontWeight: 900, bgcolor: primaryColor, color: '#fff' } }}>{buttonElement}</Badge>
                                        ) : buttonElement}
                                    </Box>
                                );
                            })}
                        </Stack>

                        {/* Login Button - Kompakter */}
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0 }}>
                            <Button 
                                onClick={handleLoginCta} 
                                variant="outlined" 
                                startIcon={<LockIcon />} 
                                sx={{ 
                                    borderColor: alpha(primaryColor, 0.55), 
                                    color: primaryColor, 
                                    borderRadius: 2, 
                                    px: { xs: 1.5, md: 2.5 }, 
                                    py: 0.8, 
                                    textTransform: 'none', 
                                    fontWeight: 900,
                                    // Icon-Abstände fixen
                                    '& .MuiButton-startIcon': { marginRight: { xs: 0, sm: 1 }, marginLeft: -0.5 },
                                    '&:hover': { borderColor: primaryColor, bgcolor: alpha(primaryColor, 0.06) } 
                                }}
                            >
                                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Mitglieder-Login</Box>
                                <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Login</Box>
                            </Button>
                        </Stack>
                    </Stack>
                </Container>
            </Box>

            {/* --- TOGGLE BUTTON WENN HERO ZU IST --- */}
            <Collapse in={!isHeroOpen} timeout={800}>
                <Box sx={{ 
                    width: '100%', 
                    bgcolor: '#fff', 
                    borderBottom: `1px solid ${alpha(darkBlue, 0.05)}`, 
                    display: 'flex', 
                    justifyContent: 'center', 
                    py: 1 
                }}>
                    <Button 
                        size="small" 
                        onClick={() => setIsHeroOpen(true)} 
                        endIcon={<ExpandMoreIcon />} 
                        sx={{ 
                            textTransform: 'none', 
                            fontWeight: 800, 
                            color: alpha(darkBlue, 0.6), 
                            '&:hover': { color: primaryColor } 
                        }}
                    >
                        Willkommensbereich einblenden
                    </Button>
                </Box>
            </Collapse>

            {/* --- HERO --- */}
            <Collapse 
                in={isHeroOpen} 
                unmountOnExit 
                timeout={800} // Hier: 800ms für ein langsames, elegantes Gleiten
                style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
            >
                <Box sx={{ position: 'relative', overflow: 'hidden', background: `linear-gradient(90deg, #ffffff 0%, #ffffff 46%, ${alpha(primaryColor, 0.08)} 100%)`, borderBottom: `1px solid ${alpha(darkBlue, 0.06)}` }}>
                    <IconButton 
                        onClick={() => setIsHeroOpen(false)} 
                        sx={{ 
                            position: 'absolute', 
                            top: 16, 
                            right: 16, 
                            zIndex: 10, 
                            // Normalzustand: Icon-Farbe 40% Blau, Hintergrund 5% Blau
                            color: alpha(darkBlue, 0.4), 
                            bgcolor: alpha(darkBlue, 0.05), 
                            // Hover: Icon-Farbe 100% Blau, Hintergrund 50% Blau
                            '&:hover': { 
                                color: darkBlue, 
                                bgcolor: alpha(darkBlue, 0.5) 
                            } 
                        }}
                    >
                        <CloseIcon />
                    </IconButton>
                    <Container maxWidth="xl" sx={{ position: 'relative', pt: { xs: 4, md: 7 }, pb: { xs: 8, md: 10 } }}>
                        <Grid container spacing={{ xs: 4, md: 7 }} alignItems="center">
                            <Grid item xs={12} md={6} lg={5.4}>
                                <Chip label={dashboardTitle} sx={{ bgcolor: alpha(primaryColor, 0.1), color: primaryColor, borderRadius: 999, fontWeight: 900, textTransform: 'uppercase', mb: 2.5, height: 38, px: 1.2 }} />
                                <Typography variant="h1" sx={{ color: darkBlue, fontWeight: 950, fontSize: { xs: '2.9rem', sm: '4rem', lg: '5.25rem' }, lineHeight: 0.98, letterSpacing: '-0.055em', mb: 2.8 }}>
                                    Wissen. Vernetzen.<Box component="span" sx={{ display: 'block', color: primaryColor }}>Vorankommen.</Box>
                                </Typography>
                                <Typography variant="h6" sx={{ color: alpha(darkBlue, 0.78), fontWeight: 500, lineHeight: 1.55, maxWidth: 600, mb: 4 }}>
                                    Das zentrale Informations- und Netzwerkportal für Mitglieder von {partnerName}. Externe Brancheninfos als Türöffner – volle Funktionen nach dem Login.
                                </Typography>
                                <Grid container spacing={2.2}>
                                    {[{ icon: LockIcon, title: 'Exklusiv für Mitglieder', text: 'Geschützter Bereich mit wertvollen Inhalten' }, { icon: ShieldOutlinedIcon, title: 'Täglich aktuell', text: 'News, Termine und Insights auf einen Blick' }, { icon: GroupsOutlinedIcon, title: 'Starkes Netzwerk', text: 'Kontakte, Partner und Austausch in der Branche' }].map((item) => {
                                        const Icon = item.icon;
                                        return (
                                            <Grid item xs={12} sm={4} key={item.title}>
                                                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                                                    <Box sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: alpha(primaryColor, 0.1), color: primaryColor, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon sx={{ fontSize: 25 }} /></Box>
                                                    <Box>
                                                        <Typography fontWeight={900} color={darkBlue} fontSize={15}>{item.title}</Typography>
                                                        <Typography variant="caption" sx={{ color: alpha(darkBlue, 0.68), lineHeight: 1.35, display: 'block' }}>{item.text}</Typography>
                                                    </Box>
                                                </Stack>
                                            </Grid>
                                        );
                                    })}
                                </Grid>
                                <Stack direction="row" alignItems="center" spacing={1.2} sx={{ mt: 3, color: alpha(darkBlue, 0.6) }}>
                                    <UpdateIcon sx={{ color: primaryColor, fontSize: 20 }} />
                                    <Typography variant="body2" fontWeight={800}>{tickerMessages[tickerIndex]}</Typography>
                                </Stack>
                            </Grid>

                            <Grid item xs={12} md={6} lg={6.6} sx={{ display: { xs: 'none', md: 'block' } }}>
                                <Box sx={{ position: 'relative', minHeight: { md: 430, lg: 520 } }}>
                                    <ImageWithFallback src={heroImageUrl} fallbackColor={primaryColor} sx={{ position: 'absolute', inset: '0 0 0 4%', borderRadius: '34px 0 0 34px', objectFit: 'cover', width: '96%', height: '100%', boxShadow: `inset 80px 0 90px rgba(255,255,255,0.82)` }} />
                                    <Paper elevation={0} sx={{ position: 'absolute', right: 24, top: 48, width: 340, borderRadius: 3, p: 3, bgcolor: alpha('#fff', 0.94), border: `1px solid ${alpha(darkBlue, 0.09)}`, boxShadow: `0 18px 45px ${alpha(darkBlue, 0.14)}` }}>
                                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                                            <Box sx={{ width: 48, height: 48, borderRadius: 2, border: `2px solid ${darkBlue}`, display: 'grid', placeItems: 'center', color: darkBlue }}><LockIcon /></Box>
                                            <Box>
                                                <Typography fontWeight={950} color={darkBlue}>Exklusive Inhalte</Typography>
                                                <Typography variant="caption" sx={{ color: alpha(darkBlue, 0.68) }}>Melden Sie sich an für vollen Zugriff.</Typography>
                                            </Box>
                                        </Stack>
                                        <Button fullWidth variant="contained" onClick={handleLoginCta} startIcon={<LockIcon />} sx={{ bgcolor: primaryColor, borderRadius: 2, py: 1.45, textTransform: 'none', fontWeight: 900, boxShadow: `0 12px 26px ${alpha(primaryColor, 0.26)}`, '&:hover': { bgcolor: primaryColor, filter: 'brightness(0.94)' } }}>Zum Mitglieder-Login</Button>
                                    </Paper>
                                </Box>
                            </Grid>
                        </Grid>
                    </Container>
                </Box>
            </Collapse>

            {/* --- FILTER LEISTE --- */}
            <Container maxWidth="xl" sx={{ position: 'relative', zIndex: 10, mt: isHeroOpen ? { xs: -3, md: -5 } : 3, mb: 4 }}>
                <Paper 
                    elevation={0} 
                    sx={{ 
                        borderRadius: 3, 
                        p: { xs: 3, md: 4 }, 
                        border: { xs: `1px solid ${alpha(darkBlue, 0.1)}`, md: `1px solid ${alpha(primaryColor, 0.2)}` },
                        bgcolor: { xs: '#fff', md: alpha(primaryColor, 0.95) }, 
                        boxShadow: { xs: `0 18px 45px ${alpha(darkBlue, 0.12)}`, md: `0 24px 60px ${alpha(primaryColor, 0.2)}` }
                    }}
                >
                    
                    {/* Titel für die Suche */}
                    <Typography variant="h5" fontWeight={950} sx={{ mb: 2.5, display: 'flex', alignItems: 'center', gap: 1, color: { xs: darkBlue, md: '#fff' } }}>
                        <SearchIcon sx={{ color: { xs: primaryColor, md: '#fff' } }} />
                        Netzwerk-Suche
                    </Typography>

                    <Grid container spacing={3} alignItems="flex-end">
                        <Grid item xs={12} md={3.5}>
                            <Typography variant="caption" fontWeight={900} sx={{ mb: 1, display: 'block', color: { xs: darkBlue, md: alpha('#fff', 0.9) } }}>
                                Ich suche nach ...
                            </Typography>
                            <Stack direction="row" alignItems="center" spacing={1} sx={{ minHeight: 56, borderRadius: 2, px: 2, border: `1px solid ${alpha(darkBlue, 0.14)}`, bgcolor: '#fff' }}>
                                <SearchIcon sx={{ color: alpha(darkBlue, 0.45) }} />
                                <InputBase fullWidth value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Dienstleistung, Anbieter, News ..." sx={{ color: darkBlue, fontWeight: 700 }} />
                            </Stack>
                        </Grid>
                        <Grid item xs={12} md={3.1}>
                            <Typography variant="caption" fontWeight={900} sx={{ mb: 1, display: 'block', color: { xs: darkBlue, md: alpha('#fff', 0.9) } }}>
                                In der Branche ...
                            </Typography>
                            <Select fullWidth value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value as string)} IconComponent={KeyboardArrowDownIcon} sx={{ minHeight: 56, borderRadius: 2, bgcolor: '#fff', color: selectedCategory === 'all' ? alpha(darkBlue, 0.58) : darkBlue, fontWeight: 800, '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha(darkBlue, 0.14) } }}>
                                <MenuItem value="all">Branche auswählen</MenuItem>
                                {Object.entries(categoryCounts).map(([cat, count]) => (
                                    <MenuItem key={cat} value={cat}>{cat} ({count})</MenuItem>
                                ))}
                            </Select>
                        </Grid>
                        <Grid item xs={12} md={3.1}>
                            <Typography variant="caption" fontWeight={900} sx={{ mb: 1, display: 'block', color: { xs: darkBlue, md: alpha('#fff', 0.9) } }}>
                                Region
                            </Typography>
                            <Select fullWidth value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value as string)} IconComponent={KeyboardArrowDownIcon} sx={{ minHeight: 56, borderRadius: 2, bgcolor: '#fff', color: selectedRegion === 'all' ? alpha(darkBlue, 0.58) : darkBlue, fontWeight: 800, '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha(darkBlue, 0.14) } }}>
                                <MenuItem value="all">Region auswählen</MenuItem>
                                {regionOptions.map((region) => (
                                    <MenuItem key={region} value={region}>{region}</MenuItem>
                                ))}
                            </Select>
                        </Grid>
                        <Grid item xs={12} md={2.3}>
                            <Button fullWidth variant="contained" onClick={handleScrollToDirectory} endIcon={<ArrowForwardIcon />} sx={{ minHeight: 56, borderRadius: 2, bgcolor: { xs: primaryColor, md: '#fff' }, color: { xs: '#fff', md: primaryColor }, fontWeight: 950, textTransform: 'none', fontSize: 16, boxShadow: `0 12px 26px ${alpha(primaryColor, 0.25)}`, '&:hover': { bgcolor: { xs: primaryColor, md: alpha('#fff', 0.9) }, filter: { xs: 'brightness(0.94)', md: 'none' } } }}>
                                Jetzt finden
                            </Button>
                        </Grid>
                    </Grid>
                </Paper>
            </Container>

            {/* --- CONTENT BEREICH --- */}
            <Container maxWidth="xl" sx={{ pb: 7 }}>
                <Grid container spacing={3} id="branchenverzeichnis">
                    {/* BRANCHENVERZEICHNIS */}
                    <Grid item xs={12} lg={5.6}>
                        <Paper elevation={0} sx={{ p: { xs: 2.2, md: 3 }, borderRadius: 4, bgcolor: '#fff', border: `1px solid ${alpha(darkBlue, 0.1)}`, boxShadow: `0 18px 40px ${alpha(darkBlue, 0.06)}`, height: '100%' }}>
                            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                                {/* HIER NEU: Chip mit Gesamt-Anzahl neben der Überschrift */}
                                <Stack direction="row" alignItems="center" spacing={1.5}>
                                    <Typography variant="h5" fontWeight={950} color={darkBlue}>Branchenverzeichnis</Typography>
                                    {tenantStats.total_directory_entries > 0 && (
                                        <Chip 
                                            label={isMobile ? `${tenantStats.total_directory_entries}` : `${tenantStats.total_directory_entries} Einträge`} 
                                            size="small" 
                                            sx={{ 
                                                bgcolor: alpha(primaryColor, 0.1), 
                                                color: primaryColor, 
                                                fontWeight: 900, 
                                                borderRadius: 2,
                                                minWidth: isMobile ? 'auto' : 'inherit',
                                                px: isMobile ? 1 : 1.5
                                            }} 
                                        />
                                    )}
                                </Stack>
                                {isFetchingDirectory && <CircularProgress size={20} />}
                            </Stack>
                            {publicProviders.length > 0 ? (
                                <>
                                    <Grid container spacing={1.5}>
                                        {publicProviders.map((provider: any) => (
                                            <Grid item xs={12} sm={6} md={4} key={provider.id}>
                                                {renderProviderPreviewCard(provider)}
                                            </Grid>
                                        ))}
                                    </Grid>
                                    <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
                                        {hasMore ? (
                                            <Button variant="outlined" onClick={() => setPage(p => p + 1)} disabled={isFetchingDirectory} sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 800, color: primaryColor, borderColor: alpha(primaryColor, 0.5) }}>Weitere laden</Button>
                                        ) : (
                                            <Typography variant="caption" sx={{ color: alpha(darkBlue, 0.5) }}>Keine weiteren Einträge gefunden.</Typography>
                                        )}
                                    </Box>
                                </>
                            ) : !isFetchingDirectory ? (
                                <Paper elevation={0} sx={{ p: 3, borderRadius: 3, bgcolor: alpha(primaryColor, 0.06), border: `1px dashed ${alpha(primaryColor, 0.25)}` }}>
                                    <Typography fontWeight={900} color={darkBlue}>Keine passenden Einträge gefunden.</Typography>
                                    <Typography variant="body2" sx={{ color: alpha(darkBlue, 0.68), mt: 0.5 }}>Passen Sie Suche, Branche oder Region an.</Typography>
                                </Paper>
                            ) : null}
                            {(selectedCategory !== 'all' || selectedRegion !== 'all' || debouncedSearch) && (
                                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2.2 }}>
                                    <Chip size="small" label="Filter zurücksetzen" onClick={() => { setSearchTerm(''); setSelectedCategory('all'); setSelectedRegion('all'); }} sx={{ borderRadius: 2, bgcolor: alpha(darkBlue, 0.05), fontWeight: 800 }} />
                                </Stack>
                            )}
                        </Paper>
                    </Grid>

                    {/* INSIGHTS */}
                    <Grid item xs={12} lg={3.4}>
                        <Paper elevation={0} sx={{ p: { xs: 2.2, md: 3 }, borderRadius: 4, bgcolor: '#fff', border: `1px solid ${alpha(darkBlue, 0.1)}`, boxShadow: `0 18px 40px ${alpha(darkBlue, 0.06)}`, height: '100%' }}>
                            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                                <Typography variant="h5" fontWeight={950} color={darkBlue}>Aktuelle Insights</Typography>
                                <Button onClick={handleLoginCta} endIcon={<ChevronRightIcon />} sx={{ textTransform: 'none', fontWeight: 900, color: primaryColor }}>Alle anzeigen</Button>
                            </Stack>
                            <Stack spacing={2}>
                                {insights.map((item: any, index: number) => (
                                    <Stack direction="row" spacing={1.6} alignItems="center" key={item.id || item.title}>
                                        <Box sx={{ width: 74, height: 74, borderRadius: 2.4, bgcolor: alpha(index === 0 ? primaryColor : secondaryColor, 0.1), display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                                            {index === 0 ? <AutoAwesomeIcon sx={{ color: primaryColor }} /> : index === 1 ? <BarChartIcon sx={{ color: secondaryColor }} /> : <GroupsOutlinedIcon sx={{ color: secondaryColor }} />}
                                        </Box>
                                        <Box sx={{ minWidth: 0 }}>
                                            <Chip label={item.type || item.category || 'Branchen-News'} size="small" sx={{ height: 22, bgcolor: alpha(primaryColor, 0.09), color: primaryColor, fontWeight: 900, fontSize: 11, mb: 0.55 }} />
                                            <Typography variant="body2" fontWeight={900} color={darkBlue} sx={{ lineHeight: 1.25 }}>{item.title}</Typography>
                                            <Typography variant="caption" sx={{ color: alpha(darkBlue, 0.58) }}>{getDateLabel(item.published_date || item.created_at || new Date().toISOString())}</Typography>
                                        </Box>
                                    </Stack>
                                ))}
                            </Stack>
                        </Paper>
                    </Grid>

                    {/* STATS */}
                    <Grid item xs={12} lg={3}>
                        <Paper elevation={0} sx={{ p: { xs: 2.2, md: 3 }, borderRadius: 4, bgcolor: '#fff', border: `1px solid ${alpha(darkBlue, 0.1)}`, boxShadow: `0 18px 40px ${alpha(darkBlue, 0.06)}`, height: '100%' }}>
                            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                                <Typography variant="h5" fontWeight={950} color={darkBlue}>Zahlen & Fakten</Typography>
                                <Button onClick={handleLoginCta} endIcon={<ChevronRightIcon />} sx={{ textTransform: 'none', fontWeight: 900, color: primaryColor }}>Mehr</Button>
                            </Stack>
                            <Grid container spacing={1.5}>
                                {statsCards.map((stat) => {
                                    const Icon = stat.icon;
                                    return (
                                        <Grid item xs={6} key={stat.label}>
                                            <Paper elevation={0} sx={{ p: 2, minHeight: 126, borderRadius: 3, border: `1px solid ${alpha(darkBlue, 0.09)}`, bgcolor: alpha('#fff', 0.88) }}>
                                                <Icon sx={{ color: alpha(primaryColor, 0.85), fontSize: 22, mb: 1 }} />
                                                <Typography variant="h5" fontWeight={950} color={darkBlue}>{stat.value}</Typography>
                                                <Typography variant="caption" sx={{ color: alpha(darkBlue, 0.68), display: 'block' }}>{stat.label}</Typography>
                                                <Typography variant="caption" sx={{ color: primaryColor, fontWeight: 900 }}>{stat.helper}</Typography>
                                            </Paper>
                                        </Grid>
                                    );
                                })}
                            </Grid>
                        </Paper>
                    </Grid>
                </Grid>

                {/* --- CTA BANNER --- */}
                <Paper elevation={0} sx={{ mt: 3, borderRadius: 4, overflow: 'hidden', bgcolor: darkBlue, background: `linear-gradient(90deg, ${darkBlue}, ${secondaryColor})`, color: '#fff', p: { xs: 2.6, md: 3 }, boxShadow: `0 20px 45px ${alpha(darkBlue, 0.18)}` }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between" spacing={3}>
                        <Box>
                            <Typography variant="h5" fontWeight={950}>Werden Sie Teil unseres starken Netzwerks</Typography>
                            <Typography variant="body2" sx={{ color: alpha('#fff', 0.78), mt: 0.5 }}>Profitieren Sie von exklusiven Inhalten, wertvollen Kontakten und aktuellen Branchen-Insights.</Typography>
                        </Box>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ color: alpha('#fff', 0.92) }}>
                            {[{ icon: ShieldOutlinedIcon, label: 'Exklusive Inhalte' }, { icon: GroupsOutlinedIcon, label: 'Starkes Netzwerk' }, { icon: UpdateIcon, label: 'Tägliche Updates' }].map((item) => {
                                const Icon = item.icon;
                                return (
                                    <Stack direction="row" spacing={1} alignItems="center" key={item.label}>
                                        <Icon sx={{ fontSize: 21 }} />
                                        <Typography variant="body2" fontWeight={800} whiteSpace="nowrap">{item.label}</Typography>
                                    </Stack>
                                );
                            })}
                        </Stack>
                        <Button onClick={handleLoginCta} variant="contained" endIcon={<ArrowForwardIcon />} sx={{ bgcolor: primaryColor, color: '#fff', borderRadius: 2, px: 3, py: 1.5, textTransform: 'none', fontWeight: 950, whiteSpace: 'nowrap', '&:hover': { bgcolor: primaryColor, filter: 'brightness(0.94)' } }}>
                            Jetzt einloggen
                        </Button>
                    </Stack>
                </Paper>

                {/* --- LOGO STRIP --- */}
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="center" justifyContent="center" sx={{ mt: 4.5, color: alpha(darkBlue, 0.62) }}>
                    <Typography variant="body2" fontWeight={800}>Über {tenantStats.member_companies ? formatNumber(Number(tenantStats.member_companies)) : 'zahlreiche'} Unternehmen im Netzwerk von {partnerName}</Typography>
                    <Stack direction="row" spacing={4} useFlexGap flexWrap="wrap" justifyContent="center" alignItems="center">
                        {logoProviders.map((provider: any) => (
                            <ImageWithFallback key={provider.id} src={getAssetUrl(provider.logo_url)} alt={provider.name} fallbackColor={primaryColor} loading="lazy" sx={{ maxHeight: 26, maxWidth: 112, objectFit: 'contain', filter: 'grayscale(1)', opacity: 0.62 }} />
                        ))}
                    </Stack>
                </Stack>

                {/* --- WIDGET PREVIEW --- */}
                <Box sx={{ mt: { xs: 6, md: 8 } }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'flex-end' }} spacing={2} sx={{ mb: 3 }}>
                        <Box>
                            <Chip label="Dashboard-Vorschau" sx={{ bgcolor: alpha(primaryColor, 0.1), color: primaryColor, fontWeight: 900, mb: 1 }} />
                            <Typography variant="h4" fontWeight={950} color={darkBlue}>Einblick in die internen Module</Typography>
                            <Typography variant="body2" sx={{ color: alpha(darkBlue, 0.68), mt: 0.7, maxWidth: 760 }}>Die öffentlichen Module bleiben als Teaser sichtbar. Vollständige Daten, Community-Funktionen und Analysen werden nach dem Mitglieder-Login freigeschaltet.</Typography>
                        </Box>
                        <Button onClick={handleLoginCta} endIcon={<LockIcon />} sx={{ textTransform: 'none', color: primaryColor, fontWeight: 900 }}>Login öffnen</Button>
                    </Stack>

                    <ThemeProvider theme={glassCockpitTheme}>
                        <Box sx={{ 
                                    borderRadius: 4, 
                                    p: { xs: 2, md: 4 }, 
                                    bgcolor: alpha(primaryColor, 0.95), 
                                    border: `1px solid ${alpha(primaryColor, 0.2)}`, 
                                    boxShadow: `0 24px 60px ${alpha(primaryColor, 0.2)}` 
                                }}>
                            <Grid container spacing={3} sx={{ position: 'relative', zIndex: 2 }}>
                                {allowedWidgets.length > 0 ? (
                                    <>
                                        {fullWidthWidgets.length > 0 && (
                                            <Grid item xs={12}>
                                                <Stack spacing={3}>
                                                    {fullWidthWidgets.map((w, i) => <Box key={`${w.type_key}-${i}`}>{renderWidget(w, i + 100)}</Box>)}
                                                </Stack>
                                            </Grid>
                                        )}
                                        <Grid item xs={12} md={8} lg={8}>
                                            <Stack spacing={3} sx={{ height: '100%' }}>
                                                {mainColumnWidgets.map((w, i) => <Box key={`${w.type_key}-${i}`} sx={{ flexGrow: i === mainColumnWidgets.length - 1 ? 1 : 0 }}>{renderWidget(w, i)}</Box>)}
                                            </Stack>
                                        </Grid>
                                        <Grid item xs={12} md={4} lg={4}>
                                            <Stack spacing={3}>
                                                {sideColumnWidgets.map((w, i) => <Box key={`${w.type_key}-${i + 10}`}>{renderWidget(w, i + 10)}</Box>)}
                                            </Stack>
                                        </Grid>
                                    </>
                                ) : (
                                    <>
                                        <Grid item xs={12} md={8} lg={8}>
                                            <Stack spacing={3} sx={{ height: '100%' }}>
                                                <Paper sx={{ p: 4, borderRadius: 3, bgcolor: 'rgba(0, 0, 0, 0.25)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                                                    <Stack direction="row" alignItems="center" gap={2} mb={2}>
                                                        <AutoAwesomeIcon sx={{ color: '#fff', fontSize: 32 }} />
                                                        <Typography variant="h5" color="white" fontWeight="bold">Public Preview</Typography>
                                                    </Stack>
                                                    <Typography variant="body1" sx={{ color: alpha('#fff', 0.8), lineHeight: 1.6 }}>Das Portal läuft als White-Label-Türöffner. Öffentliche Inhalte machen den Mehrwert sichtbar; sensible Details bleiben dem Mitgliederbereich vorbehalten.</Typography>
                                                </Paper>
                                                <EVStationWidget isPublic={true} widgetId="demo-ev" widgetTypeKey="EVStation" title="Netzwerkauslastung & Infrastruktur" onDelete={()=>{}} />
                                                <Box sx={{ flexGrow: 1 }}>
                                                    <EventCalendarWidget isPublic={true} widgetId="demo-cal" widgetTypeKey="EventCalendar" category="fleet_events, industry_events, businesspartner_events" defaultRegion={defaultRegion} title="Branchen-Kalender (Live)" isRemovable={false} onDelete={() => {}}/>
                                                </Box>
                                            </Stack>
                                        </Grid>
                                        <Grid item xs={12} md={4} lg={4}>
                                            <Stack spacing={3}>
                                                <SentimentWidget isPublic={true} widgetId="demo-sent" widgetTypeKey="sentiment_widget" title="KI Markt-Barometer (Live)" isRemovable={false} onDelete={()=>{}}/>
                                                <CommodityPricesWidget isPublic={true} widgetId="demo-com" widgetTypeKey="CommodityPrices" title="Indikatoren Echtzeit" isRemovable={false} onDelete={()=>{}}/>
                                            </Stack>
                                        </Grid>
                                    </>
                                )}
                            </Grid>
                        </Box>
                    </ThemeProvider>
                </Box>
            </Container>

            {/* --- DIALOGE --- */}
            <Dialog open={loginDialogOpen} onClose={() => setLoginDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4, overflow: 'hidden' } }}>
                <DialogTitle sx={{ p: 0 }}>
                    <Box sx={{ p: 3, bgcolor: softBg, borderBottom: `1px solid ${alpha(darkBlue, 0.08)}` }}>
                        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
                            <Stack direction="row" alignItems="center" spacing={1.5}>
                                <ImageWithFallback src={logoUrl} alt={partnerName} fallbackColor={primaryColor} loading="lazy" sx={{ width: 48, height: 40, objectFit: 'contain' }} />
                                <Box>
                                    <Typography variant="h5" fontWeight={950} color={darkBlue}>{isRegister ? 'Konto erstellen' : 'Mitglieder-Login'}</Typography>
                                    <Typography variant="body2" sx={{ color: alpha(darkBlue, 0.65) }}>{partnerName} Mitgliederbereich</Typography>
                                </Box>
                            </Stack>
                            <IconButton onClick={() => setLoginDialogOpen(false)}><CloseIcon /></IconButton>
                        </Stack>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ p: { xs: 3, md: 4 } }}>
                    <ThemeProvider theme={loginTheme}><LoginForm isRegister={isRegister} /></ThemeProvider>
                </DialogContent>
            </Dialog>

            <Dialog open={!!selectedTeaserProvider} onClose={() => setSelectedTeaserProvider(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4, bgcolor: '#fff', border: `1px solid ${alpha(darkBlue, 0.08)}` } }}>
                {selectedTeaserProvider && (
                    <>
                        <DialogTitle sx={{ p: 3, pb: 0 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', minWidth: 0 }}>
                                    <Avatar sx={{ width: 64, height: 64, bgcolor: 'transparent' }}>
                                        <ImageWithFallback src={selectedTeaserProvider.logo_url ? getAssetUrl(selectedTeaserProvider.logo_url) : null} alt={selectedTeaserProvider.name} fallbackColor={primaryColor} sx={{ width: 64, height: 64, objectFit: 'contain' }} />
                                    </Avatar>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="h5" color={darkBlue} fontWeight={950} noWrap>{selectedTeaserProvider.name}</Typography>
                                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                                            {selectedTeaserProvider.category && <Chip label={selectedTeaserProvider.category} size="small" sx={{ bgcolor: alpha(primaryColor, 0.08), color: primaryColor, fontWeight: 900 }} />}
                                            {selectedTeaserProvider.is_recommended && <Chip icon={<VerifiedUserIcon fontSize="small" />} label="Offizieller Partner" size="small" sx={{ bgcolor: alpha(primaryColor, 0.14), color: primaryColor, fontWeight: 900 }} />}
                                        </Stack>
                                    </Box>
                                </Box>
                                <IconButton onClick={() => setSelectedTeaserProvider(null)}><CloseIcon /></IconButton>
                            </Box>
                            <Tabs value={teaserTab} onChange={(_, val) => setTeaserTab(val)} variant="fullWidth" sx={{ mt: 3, '& .MuiTab-root': { color: alpha(darkBlue, 0.56), fontWeight: 900 }, '& .Mui-selected': { color: primaryColor } }} TabIndicatorProps={{ style: { backgroundColor: primaryColor } }}>
                                <Tab label="Übersicht & Kontakt" />
                                <Tab label={`Bewertungen (${selectedTeaserProvider.review_count || 0})`} />
                            </Tabs>
                        </DialogTitle>

                        <DialogContent sx={{ p: 0 }}>
                            {teaserTab === 0 && (
                                <Box sx={{ p: 3 }}>
                                    <Typography variant="body2" sx={{ color: alpha(darkBlue, 0.78), mb: 3, lineHeight: 1.65 }}>
                                        {selectedTeaserProvider.description || 'Keine weitere Beschreibung vorhanden.'}
                                    </Typography>
                                    <Paper sx={{ p: 2, bgcolor: alpha(primaryColor, 0.04), borderRadius: 3, border: `1px solid ${alpha(primaryColor, 0.12)}` }} elevation={0}>
{selectedTeaserProvider.website_url && (
    <Box 
        component="a" 
        href={selectedTeaserProvider.website_url.startsWith('http') ? selectedTeaserProvider.website_url : `https://${selectedTeaserProvider.website_url}`} 
        target="_blank" 
        rel="noopener noreferrer"
        sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1.5, 
            mb: 1, 
            color: primaryColor, // Nutzt jetzt die Markenfarbe, um Interaktivität zu signalisieren
            textDecoration: 'none',
            '&:hover': { textDecoration: 'underline' }
        }}
    >
        <LanguageIcon fontSize="small" /> 
        <Typography variant="body2">{selectedTeaserProvider.website_url}</Typography>
    </Box>
)}
                                        {selectedTeaserProvider.contact_email && (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1, color: alpha(darkBlue, 0.72) }}>
                                                <EmailIcon fontSize="small" /> <Typography variant="body2">{selectedTeaserProvider.contact_email}</Typography>
                                            </Box>
                                        )}
                                        {selectedTeaserProvider.contact_phone && (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: alpha(darkBlue, 0.72) }}>
                                                <PhoneIcon fontSize="small" /> <Typography variant="body2">{selectedTeaserProvider.contact_phone}</Typography>
                                            </Box>
                                        )}
                                        {!selectedTeaserProvider.website_url && !selectedTeaserProvider.contact_email && !selectedTeaserProvider.contact_phone && (
                                            <Typography variant="body2" color="text.secondary">Kontaktinformationen sind nur für Mitglieder einsehbar oder wurden nicht hinterlegt.</Typography>
                                        )}
                                    </Paper>
                                    
                                    {selectedTeaserProvider.locations?.[0]?.latitude && (
                                        <Box sx={{ mt: 3 }}>
                                            <Typography variant="subtitle2" color={darkBlue} fontWeight={800} mb={1}>Standort</Typography>
                                            <Box ref={mapContainerRef} sx={{ height: 220, borderRadius: 3, bgcolor: alpha(primaryColor, 0.08), overflow: 'hidden', border: `1px solid ${alpha(darkBlue, 0.08)}` }} />
                                        </Box>
                                    )}
                                </Box>
                            )}
                            {teaserTab === 1 && (
                                <Box sx={{ p: 3 }}>
                                    <Box sx={{ position: 'relative', borderRadius: 3, overflow: 'hidden', border: `1px solid ${alpha(darkBlue, 0.08)}` }}>
                                        <Box sx={{ filter: 'blur(8px)', opacity: 0.5, pointerEvents: 'none', userSelect: 'none', p: 3, bgcolor: alpha(darkBlue, 0.03) }}>
                                            <Typography variant="subtitle2" color={darkBlue} mb={2} fontWeight={900}>Community Bewertungen</Typography>
                                            <Rating value={Number(selectedTeaserProvider.average_rating) || 4} readOnly size="small" sx={{ color: primaryColor, mb: 2 }} />
                                            <Box sx={{ height: 36, width: '100%', bgcolor: alpha(darkBlue, 0.12), borderRadius: 1, mb: 3 }} />
                                            <Typography variant="subtitle2" color={darkBlue} mb={2} fontWeight={900}>Interne Notizen & Konditionen</Typography>
                                            <Box sx={{ height: 62, width: '100%', bgcolor: alpha(darkBlue, 0.12), borderRadius: 1 }} />
                                        </Box>
                                        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(to bottom, rgba(255,255,255,0.3), rgba(255,255,255,0.96))', p: 4, textAlign: 'center' }}>
                                            <LockIcon sx={{ fontSize: 48, color: primaryColor, mb: 2 }} />
                                            <Typography variant="h6" color={darkBlue} fontWeight={950} gutterBottom>Exklusive Insights</Typography>
                                            <Typography variant="body2" sx={{ color: alpha(darkBlue, 0.72), mb: 3, maxWidth: 330 }}>Melden Sie sich an, um echte Community-Erfahrungen, interne Konditionen und erweiterte Kontaktdaten zu lesen.</Typography>
                                            <Button variant="contained" onClick={() => { setSelectedTeaserProvider(null); handleLoginCta(); }} sx={{ bgcolor: primaryColor, color: '#fff', fontWeight: 950, borderRadius: 2, px: 4, py: 1.4, textTransform: 'none' }}>
                                                Jetzt einloggen
                                            </Button>
                                        </Box>
                                    </Box>
                                </Box>
                            )}
                        </DialogContent>
                    </>
                )}
            </Dialog>
        </Box>
    );
};

export default PublicPortalPage;