// frontend/src/pages/DashboardPage.tsx (VEREINFACHTES TRAFFICINFOWIDGET - KEINE FILTER/PAGINATION)
import React, { useState, useEffect, useCallback } from 'react'; // useRef entfernt
import { AppBar, Toolbar, Typography, Button, Box, Drawer, List, ListItem, ListItemText, Container, Paper, CircularProgress, Alert, IconButton, Tooltip, Menu, MenuItem, Avatar, Chip } from '@mui/material';
// Checkbox, ListItemTextMui, TextField, Select, FormControl, InputLabel, OutlinedInput, SelectChangeEvent entfernt, da nicht mehr direkt im TrafficInfoWidget benötigt in dieser Version
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { WidthProvider, Responsive, Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// Material-UI Icons
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import TrafficIcon from '@mui/icons-material/Traffic';
import SpaIcon from '@mui/icons-material/Spa';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import BusinessIcon from '@mui/icons-material/Business';
import GavelIcon from '@mui/icons-material/Gavel';
import NewspaperIcon from '@mui/icons-material/Newspaper';


const ResponsiveGridLayout = WidthProvider(Responsive);

// --- INTERFACES (Definiert außerhalb der Komponenten) ---
interface WidgetConfig {
    id: string;
    type: string;
}

interface WidgetTypeMeta {
    id: string;
    name: string;
    type_key: string;
    description?: string;
    icon_name?: string;
    is_removable: boolean;
    is_resizable: boolean;
    is_draggable: boolean;
    default_width: number;
    default_height: number;
    default_min_width: number;
    default_min_height: number;
    allowed_roles?: string[];
}

interface DashboardSavedConfig {
    layout: Layout[];
    widgets: WidgetConfig[];
}

// Icon Mapping
const IconMap: { [key: string]: React.ElementType } = {
    LocalGasStationIcon: LocalGasStationIcon,
    TrafficIcon: TrafficIcon,
    SpaIcon: SpaIcon,
    AddCircleOutlineIcon: AddCircleOutlineIcon,
    BusinessIcon: BusinessIcon,
    GavelIcon: GavelIcon,
    NewspaperIcon: NewspaperIcon,
};


// HINWEIS: ALLE WIDGET-PROPS-INTERFACES UND WIDGETPAPER HIER DEFINIERT
interface BaseWidgetProps {
    loading: boolean;
    error: string | null;
    onDelete?: (id: string) => void;
    widgetId?: string;
    isRemovable?: boolean;
}

interface FuelPricesWidgetProps extends BaseWidgetProps { data?: any; }
interface TrafficInfoWidgetProps extends BaseWidgetProps { data?: any; } // <- KEINE FILTER PROPS MEHR HIER, NUR NOCH data
interface ESGNewsWidgetProps extends BaseWidgetProps { data?: any; }
interface BusinessPartnerInfoWidgetProps extends BaseWidgetProps { businessPartner?: any; }
interface TaxChangesWidgetProps extends BaseWidgetProps { data?: any; }
interface FleetNewsWidgetProps extends BaseWidgetProps { data?: any; }

// Dediziertes Interface für WidgetPaper Props
interface WidgetPaperProps extends BaseWidgetProps {
    children: React.ReactNode;
    title: string;
}


const WidgetPaper: React.FC<WidgetPaperProps> = ({ children, title, widgetId, onDelete, isRemovable = true, loading, error }) => (
    <Paper elevation={3} sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="h6">{title}</Typography>
            {widgetId && onDelete && isRemovable && (
                <Tooltip title="Widget löschen">
                    <IconButton size="small" onClick={() => onDelete(widgetId)}>
                        &times;
                    </IconButton>
                </Tooltip>
            )}
        </Box>
        <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
            {children}
        </Box>
    </Paper>
);

// --- INDIVIDUELLE WIDGET KOMPONENTEN (Definiert außerhalb der DashboardPage) ---
const FuelPricesWidget: React.FC<FuelPricesWidgetProps> = ({ data, loading, error, onDelete, widgetId, isRemovable }) => (
    <WidgetPaper title="Kraftstoffpreise" widgetId={widgetId} onDelete={onDelete} isRemovable={isRemovable} loading={loading} error={error}>
        {loading ? <CircularProgress size={24} /> :
            error ? <Alert severity="error">{error}</Alert> :
                data && (
                    <Box>
                        {data.data.map((item: any, index: number) => (
                            <Typography key={index} variant="body2">
                                {item.location}: Diesel {item.diesel}{item.unit}, Benzin {item.petrol}{item.unit}
                            </Typography>
                        ))}
                        <Typography variant="caption" sx={{ mt: 1 }}>Quelle: {data.source}</Typography>
                        <Typography variant="caption" display="block">Trend: {data.trend}</Typography>
                    </Box>
                )
        }
    </WidgetPaper>
);

// TrafficInfoWidget - VEREINFACHT OHNE FILTER-UI, ABER MIT DATEN AUS DB
// frontend/src/pages/DashboardPage.tsx (innerhalb TrafficInfoWidget)

const TrafficInfoWidget: React.FC<TrafficInfoWidgetProps> = ({ data, loading, error, onDelete, widgetId, isRemovable }) => (
    <WidgetPaper title="Verkehrsinformationen" widgetId={widgetId} onDelete={onDelete} isRemovable={isRemovable} loading={loading} error={error}>
        {loading ? <CircularProgress size={24} /> :
            error ? <Alert severity="error">{error}</Alert> :
                data && data.data && data.data.length > 0 ? (
                    <Box sx={{ maxHeight: 300, overflowY: 'auto' }}> {/* Scrollbarer Bereich */}
                        {data.data.map((item: any, index: number) => (
                            <Box key={item.id || index} sx={{ mb: 1.5 }}>
                                {/* Datum [dd.mm. H:i Uhr], dann Region */}
                                <Typography variant="body2" component="div">
                                    <Box component="span" sx={{ fontWeight: 'bold' }}>
                                        {item.published_at ? new Date(item.published_at).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'} Uhr
                                    </Box>
                                    {' - '}
                                    {item.region || '-'}
                                </Typography>
                                {/* Titel als verlinkter Text - KORRIGIERT */}
                                <Typography
                                    variant="subtitle2"
                                    component="a"
                                    href={item.link} // Der href bleibt, aber onClick steuert das Öffnen
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    sx={{ textDecoration: 'none', cursor: 'pointer' }} // NEU: Cursor für Klick-Feedback
                                    onClick={(event) => { // NEU: onClick Handler
                                        event.preventDefault(); // Verhindert Standard-Link-Verhalten
                                        if (item.link) {
                                            window.open(item.link, '_blank');
                                        }
                                    }}
                                >
                                    {item.title}
                                </Typography>
                                {/* Beschreibung ist entfernt */}
                                {/* Optional: Typ der Störung als Chip */}
                                {item.type && <Chip label={item.type} size="small" sx={{ mt: 0.5 }} />}
                            </Box>
                        ))}
                        <Typography variant="caption" sx={{ mt: 1 }}>Quelle: {data.source}</Typography>
                    </Box>
                ) : (
                    <Typography variant="body2" color="text.secondary">Keine aktuellen Verkehrsinformationen gefunden.</Typography>
                )
        }
    </WidgetPaper>
);


const ESGNewsWidget: React.FC<ESGNewsWidgetProps> = ({ data, loading, error, onDelete, widgetId, isRemovable }) => (
    <WidgetPaper title="Aktuelle ESG-Nachrichten" widgetId={widgetId} onDelete={onDelete} isRemovable={isRemovable} loading={loading} error={error}>
        {loading ? <CircularProgress size={24} /> :
            error ? <Alert severity="error">{error}</Alert> :
                data && (
                    <Box>
                        {data.data.map((item: any, index: number) => (
                            <Box key={index} sx={{ mb: 1 }}>
                                <Typography variant="subtitle2">{item.title}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {item.date} - Relevanz: {item.relevance}
                                </Typography>
                            </Box>
                        ))}
                        <Typography variant="caption" sx={{ mt: 1 }}>Quelle: {data.source}</Typography>
                    </Box>
                )
        }
    </WidgetPaper>
);

// frontend/src/pages/DashboardPage.tsx (INNERHALB BusinessPartnerInfoWidget Definition - GEÄNDERT)

const BusinessPartnerInfoWidget: React.FC<BusinessPartnerInfoWidgetProps> = ({ businessPartner, loading, error, onDelete, widgetId, isRemovable }) => {
    const [bpNews, setBpNews] = useState<any>(null);
    const [bpEvents, setBpEvents] = useState<any>(null);
    const [loadingBpContent, setLoadingBpContent] = useState(false);
    const [bpContentError, setBpContentError] = useState<string | null>(null);

    const token = localStorage.getItem('jwt_token');

    const fetchBpContent = useCallback(async () => {
        if (!businessPartner?.id || !token) {
            setBpNews(null);
            setBpEvents(null);
            return;
        }
        setLoadingBpContent(true);
        setBpContentError(null);
        try {
            const [newsRes, eventsRes] = await Promise.all([
                axios.get(`http://localhost:5000/api/data/bp-scraped-content?businessPartnerId=${businessPartner.id}&category=news`, { headers: { 'x-auth-token': token } }),
                axios.get(`http://localhost:5000/api/data/bp-scraped-content?businessPartnerId=${businessPartner.id}&category=event`, { headers: { 'x-auth-token': token } }),
            ]);
            setBpNews(newsRes.data);
            setBpEvents(eventsRes.data);
        } catch (err: any) {
            console.error('Error fetching BP specific content:', err.message);
            setBpContentError(err.response?.data?.message || 'Fehler beim Laden von BP-spezifischen Inhalten.');
        } finally {
            setLoadingBpContent(false);
        }
    }, [businessPartner?.id, token]);

    useEffect(() => {
        if (businessPartner?.id) {
            fetchBpContent();
        }
    }, [businessPartner?.id, fetchBpContent]);


    return (
        // ÄNDERUNG 1: Der Titel ist jetzt dynamisch basierend auf dem businessPartner Namen
        <WidgetPaper title={businessPartner ? `${businessPartner.name} Info` : "Business Partner Info"} widgetId={widgetId} onDelete={onDelete} isRemovable={isRemovable} loading={loading} error={error}>
            {loading ? <CircularProgress size={24} /> :
                error ? <Alert severity="error">{error}</Alert> :
                    businessPartner && (
                        <Box>
                            {/* Bestehende BP Info - Titel wird nun im WidgetPaper gesetzt */}
                            <Typography variant="body2">Adresse: {businessPartner.address}</Typography>
                            {/* ÄNDERUNG 2: Abo-Datum in einer Zeile zusammengefasst */}
                            <Typography variant="body2">
                                Abo von: {new Date(businessPartner.subscription_start_date).toLocaleDateString()} bis {new Date(businessPartner.subscription_end_date).toLocaleDateString()}
                            </Typography>
                            <Box sx={{ display: 'flex', mt: 2 }}>
                                <Box sx={{ width: 20, height: 20, bgcolor: businessPartner.primary_color, mr: 1, border: '1px solid grey' }} />
                                <Box sx={{ width: 20, height: 20, bgcolor: businessPartner.secondary_color, mr: 1, border: '1px solid grey' }} />
                                <Box sx={{ width: 20, height: 20, bgcolor: businessPartner.text_color, mr: 1, border: '1px solid grey' }} />
                                <Box sx={{ width: 20, height: 20, bgcolor: businessPartner.background_color, mr: 1, border: '1px solid grey' }} />
                            </Box>

                            {/* Bereich für Business Partner News und Events */}
                            <Box sx={{ mt: 3, borderTop: '1px solid #eee', pt: 2 }}>
                                {loadingBpContent ? (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 1 }}>
                                        <CircularProgress size={20} />
                                    </Box>
                                ) : bpContentError ? (
                                    <Alert severity="error">{bpContentError}</Alert>
                                ) : (
                                    <Box>
                                        <Typography variant="body2" sx={{ fontWeight: 'bold', mt: 1 }}>Aktuelle Info:</Typography>
                                        {bpNews?.data?.length > 0 ? (
                                            bpNews.data.map((item: any, index: number) => (
                                                <Box key={item.id || index} sx={{ mb: 0.5 }}>
                                                    <Typography variant="caption" display="block">
                                                        {item.published_date}: <a href={item.original_url} target="_blank" rel="noopener noreferrer">{item.title}</a>
                                                    </Typography>
                                                </Box>
                                            ))
                                        ) : (
                                            <Typography variant="caption" color="text.secondary">Keine Infos gefunden.</Typography>
                                        )}

                                        {/* ÄNDERUNG 3: Text von "Kommende Events" zu "Aktuelle Events" geändert */}
                                        <Typography variant="body2" sx={{ fontWeight: 'bold', mt: 1 }}>Aktuelle Events:</Typography>
                                        {bpEvents?.data?.length > 0 ? (
                                            bpEvents.data.map((item: any, index: number) => (
                                                <Box key={item.id || index} sx={{ mb: 0.5 }}>
                                                    <Typography variant="caption" display="block">
                                                        {item.event_date}: <a href={item.original_url} target="_blank" rel="noopener noreferrer">{item.title}</a>
                                                    </Typography>
                                                </Box>
                                            ))
                                        ) : (
                                            <Typography variant="caption" color="text.secondary">Keine Events gefunden.</Typography>
                                        )}
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    )
            }
        </WidgetPaper>
    );
};

const TaxChangesWidget: React.FC<TaxChangesWidgetProps> = ({ data, loading, error, onDelete, widgetId, isRemovable }) => (
    <WidgetPaper title="Steueränderungen Kraftfahrzeuge Österreich" widgetId={widgetId} onDelete={onDelete} isRemovable={isRemovable} loading={loading} error={error}>
        {loading ? <CircularProgress size={24} /> :
            error ? <Alert severity="error">{error}</Alert> :
                data && data.data && data.data.length > 0 ? (
                    <Box>
                        {data.data.map((change: any, index: number) => (
                            <Box key={change.id || index} sx={{ mb: 1.5 }}>
                                <Typography variant="subtitle2" component="a" href={change.original_url} target="_blank" rel="noopener noreferrer" sx={{ textDecoration: 'none' }}>
                                    {change.title}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" display="block">
                                    Datum: {new Date(change.change_date).toLocaleDateString()}
                                </Typography>
                                <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                                    {change.summary && change.summary.substring(0, 150)}...
                                </Typography>
                            </Box>
                        ))}
                        <Typography variant="caption" sx={{ mt: 1 }}>Quelle: {data.source}</Typography>
                    </Box>
                ) : (
                    <Typography variant="body2" color="text.secondary">Keine Steueränderungen gefunden oder Daten werden noch geladen.</Typography>
                )
        }
    </WidgetPaper>
    
);

const FleetNewsWidget: React.FC<FleetNewsWidgetProps> = ({ data, loading, error, onDelete, widgetId, isRemovable }) => (
    <WidgetPaper title="Fuhrparkverband Austria News & Events" widgetId={widgetId} onDelete={onDelete} isRemovable={isRemovable} loading={loading} error={error}>
        {loading ? <CircularProgress size={24} /> :
            error ? <Alert severity="error">{error}</Alert> :
                data && data.data && data.data.length > 0 ? (
                    <Box>
                        {data.data.map((item: any, index: number) => (
                            <Box key={item.id || index} sx={{ mb: 1.5 }}>
                                <Typography variant="subtitle2" component="a" href={item.original_url} target="_blank" rel="noopener noreferrer" sx={{ textDecoration: 'none' }}>
                                    {item.title}
                                </Typography>
                                {item.event_date && (
                                    <Typography variant="caption" color="text.secondary" display="block">
                                        Datum: {new Date(item.event_date).toLocaleDateString()}
                                    </Typography>
                                )}
                                <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                                    {item.description && item.description.substring(0, 150)}...
                                </Typography>
                                <Chip label={item.type || 'News'} size="small" sx={{ mt: 0.5 }} />
                            </Box>
                        ))}
                        <Typography variant="caption" sx={{ mt: 1 }}>Quelle: {data.source}</Typography>
                    </Box>
                ) : (
                    <Typography variant="body2" color="text.secondary">Keine Nachrichten oder Veranstaltungen gefunden oder Daten werden noch geladen.</Typography>
                )
        }
    </WidgetPaper>
);


// Mapping-Objekt für Widget-Komponenten (Initialisierung hier!)
const WidgetComponentMap: { [key: string]: React.ElementType<any> } = {
    FuelPrices: FuelPricesWidget,
    TrafficInfo: TrafficInfoWidget,
    ESGNews: ESGNewsWidget,
    BusinessPartnerInfo: BusinessPartnerInfoWidget,
    TaxChanges: TaxChangesWidget,
    FleetNews: FleetNewsWidget,
};


// --- HAUPTKOMPONENTE: DASHBOARDPAGE ---
const DashboardPage: React.FC = () => {
    const { user, businessPartner, logout } = useAuth();
    const navigate = useNavigate();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [dashboardConfig, setDashboardConfig] = useState<DashboardSavedConfig | null>(null);
    const [availableWidgetTypes, setAvailableWidgetTypes] = useState<WidgetTypeMeta[]>([]);

    const [fuelPrices, setFuelPrices] = useState<any>(null);
    const [trafficInfo, setTrafficInfo] = useState<any>(null); // TRAFFIC INFO WIRD HIER WIEDER GLOBAL VERWALTET
    const [esgNews, setEsgNews] = useState<any>(null);
    const [taxChanges, setTaxChanges] = useState<any>(null);
    const [fleetNews, setFleetNews] = useState<any>(null);

    // uniqueRegions wird von DashboardPage NICHT mehr geladen oder übergeben (da TrafficInfoWidget keine Filter hat)
    // const [trafficUniqueRegions, setTrafficUniqueRegions] = useState<string[]>([]); // <- Entfernt


    const [loadingData, setLoadingData] = useState(true);
    const [dataError, setDataError] = useState<string | null>(null);

    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const openAddWidgetMenu = Boolean(anchorEl);

    const toggleDrawer = (open: boolean) => () => {
        setDrawerOpen(open);
    };

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    // --- Data Fetching Logic (AKTUALISIERT) ---
    const fetchDashboardConfigAndData = useCallback(async () => {
        setLoadingData(true);
        setDataError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            if (!token) {
                throw new Error('Authentication token not found.');
            }

            const widgetTypesResponse = await axios.get('http://localhost:5000/api/widgets/types', {
                headers: { 'x-auth-token': token },
            });
            const fetchedWidgetTypes = widgetTypesResponse.data;
            setAvailableWidgetTypes(fetchedWidgetTypes);

            // UNIQUE REGIONS NICHT MEHR ABRUFEN, DA FILTER ENTFERNT
            // const trafficRegionsRes = await axios.get('http://localhost:5000/api/data/traffic-regions', {
            //     headers: { 'x-auth-token': token },
            // });
            // setTrafficUniqueRegions(trafficRegionsRes.data);


            const configResponse = await axios.get('http://localhost:5000/api/dashboard/config', {
                headers: { 'x-auth-token': token },
            });
            let loadedConfig: DashboardSavedConfig = configResponse.data.config;

            if (!loadedConfig || !loadedConfig.layout || loadedConfig.layout.length === 0 || !loadedConfig.widgets || loadedConfig.widgets.length === 0) {
                const initialWidgets: WidgetConfig[] = [];
                const initialLayout: Layout[] = [];

                let currentY = 0;

                fetchedWidgetTypes.filter(wt => !wt.is_removable).forEach(bpWidgetType => {
                    if (!initialWidgets.some(w => w.type === bpWidgetType.type_key)) {
                        const widgetId = `${bpWidgetType.type_key}-${Date.now()}-initial`;
                        initialWidgets.push({ id: widgetId, type: bpWidgetType.type_key });
                        initialLayout.push({
                            i: widgetId, x: 0, y: currentY,
                            w: bpWidgetType.default_width, h: bpWidgetType.default_height,
                            minW: bpWidgetType.default_min_width, minH: bpWidgetType.default_min_height,
                            isResizable: bpWidgetType.is_resizable, isDraggable: bpWidgetType.is_draggable
                        });
                        currentY += bpWidgetType.default_height;
                    }
                });

                const defaultRemovableWidgetTypes = ['ESGNews', 'FuelPrices', 'TrafficInfo', 'TaxChanges', 'FleetNews'];
                
                defaultRemovableWidgetTypes.forEach(typeKey => {
                    const widgetType = fetchedWidgetTypes.find(wt => wt.type_key === typeKey && wt.is_removable);
                    if (widgetType && !initialWidgets.some(w => w.type === widgetType.type_key)) {
                        const widgetId = `${widgetType.type_key}-${Date.now()}-initial`;
                        initialWidgets.push({ id: widgetId, type: widgetType.type_key });
                        initialLayout.push({
                            i: widgetId, x: (initialLayout.length % 2) * (widgetType.default_width), y: currentY,
                            w: widgetType.default_width, h: widgetType.default_height,
                            minW: widgetType.default_min_width, minH: widgetType.default_min_height,
                            isResizable: widgetType.is_resizable, isDraggable: widgetType.is_draggable
                        });
                        if ((initialLayout.length % 2) * (widgetType.default_width) + widgetType.default_width > 12) {
                            currentY = Math.max(currentY, initialLayout.reduce((max, item) => Math.max(max, item.y + item.h), 0));
                        }
                    }
                });

                loadedConfig = { layout: initialLayout, widgets: initialWidgets };
            } else {
                const validWidgets: WidgetConfig[] = [];
                const validLayout: Layout[] = [];

                loadedConfig.widgets.forEach(widget => {
                    const widgetTypeMeta = fetchedWidgetTypes.find(wt => wt.type_key === widget.type);
                    if (widgetTypeMeta) {
                        validWidgets.push(widget);
                        const layoutItem = loadedConfig.layout.find(l => l.i === widget.id);
                        if (layoutItem) {
                            validLayout.push({
                                ...layoutItem,
                                isResizable: widgetTypeMeta.is_resizable,
                                isDraggable: widgetTypeMeta.is_draggable
                            });
                        }
                    }
                });

                fetchedWidgetTypes.filter(wt => !wt.is_removable).forEach(bpWidgetType => {
                    if (!validWidgets.some(w => w.type === bpWidgetType.type_key)) {
                        const widgetId = `${bpWidgetType.type_key}-${Date.now()}-auto-added`;
                        validWidgets.push({ id: widgetId, type: bpWidgetType.type_key });
                        validLayout.push({
                            i: widgetId, x: 0, y: Math.max(...validLayout.map(item => item.y + item.h), 0) + 1,
                            w: bpWidgetType.default_width, h: bpWidgetType.default_height,
                            minW: bpWidgetType.default_min_width, minH: bpWidgetType.default_min_height,
                            isResizable: bpWidgetType.is_resizable, isDraggable: bpWidgetType.is_draggable
                        });
                    }
                });

                loadedConfig = { layout: validLayout, widgets: validWidgets };
            }

            setDashboardConfig(loadedConfig);

            // Alle globalen Daten laden (inkl. trafficInfo)
            const [fuelRes, trafficRes, esgRes, taxRes, fleetNewsRes] = await Promise.all([ // <- trafficRes HIER WIEDER DA
                axios.get('http://localhost:5000/api/data/fuel-prices', { headers: { 'x-auth-token': token } }),
                axios.get('http://localhost:5000/api/data/traffic-info', { headers: { 'x-auth-token': token } }), // TRAFFIC INFO HIER WIEDER HOLEN
                axios.get('http://localhost:5000/api/data/esg-news', { headers: { 'x-auth-token': token } }),
                axios.get('http://localhost:5000/api/data/tax-changes', { headers: { 'x-auth-token': token } }),
                axios.get('http://localhost:5000/api/data/fleet-news', { headers: { 'x-auth-token': token } }),
            ]);
            setFuelPrices(fuelRes.data);
            setTrafficInfo(trafficRes.data); // TRAFFIC INFO WIEDER SETZEN
            setEsgNews(esgRes.data);
            setTaxChanges(taxRes.data);
            setFleetNews(fleetNewsRes.data);

        } catch (error: any) {
            console.error('Error fetching dashboard data:', error.message);
            setDataError(error.response?.data?.message || error.message || 'Fehler beim Laden der Dashboard-Daten.');
            if (error.response && error.response.status === 401) {
                logout();
                navigate('/login');
            }
        } finally {
            setLoadingData(false);
        }
    }, [logout, navigate]);

    useEffect(() => {
        fetchDashboardConfigAndData();
    }, [fetchDashboardConfigAndData]);

    // --- Layout Management ---
    const onLayoutChange = (newLayout: Layout[]) => {
        if (dashboardConfig) {
            setDashboardConfig(prevConfig => prevConfig ? { ...prevConfig, layout: newLayout } : null);
        }
    };

    const handleSaveConfig = async () => {
        if (!dashboardConfig) {
            alert('Keine Konfiguration zum Speichern vorhanden.');
            return;
        }
        try {
            const token = localStorage.getItem('jwt_token');
            if (!token) return;

            await axios.post('http://localhost:5000/api/dashboard/config',
                { name: 'Default Dashboard', config: dashboardConfig },
                { headers: { 'x-auth-token': token } }
            );
            alert('Dashboard Konfiguration gespeichert!');
        } catch (error) {
            console.error('Error saving dashboard config:', error);
            alert('Fehler beim Speichern der Konfiguration.');
        }
    };

    // --- Add Widget Logic ---
    const handleOpenAddWidgetMenu = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleCloseAddWidgetMenu = () => {
        setAnchorEl(null);
    };

    const handleAddWidget = (widgetTypeKey: string) => {
        if (!dashboardConfig) return;

        const widgetTypeMeta = availableWidgetTypes.find(wt => wt.type_key === widgetTypeKey);
        if (!widgetTypeMeta) {
            console.error(`Widget type meta not found for key: ${widgetTypeKey}`);
            return;
        }

        const newWidgetId = `${widgetTypeMeta.type_key}-${Date.now()}`;
        
        const newWidgets: WidgetConfig[] = [...dashboardConfig.widgets, { id: newWidgetId, type: widgetTypeMeta.type_key }];

        const newLayoutItem: Layout = {
            i: newWidgetId,
            x: 0, // Temporäre X-Position
            y: Infinity, // Platziert es am unteren Ende des Grids
            w: widgetTypeMeta.default_width,
            h: widgetTypeMeta.default_height,
            minW: widgetTypeMeta.default_min_width,
            minH: widgetTypeMeta.default_min_height,
            isResizable: widgetTypeMeta.is_resizable,
            isDraggable: widgetTypeMeta.is_draggable
        };

        const newLayout: Layout[] = [...dashboardConfig.layout, newLayoutItem];

        setDashboardConfig({ layout: newLayout, widgets: newWidgets });
        handleCloseAddWidgetMenu();
    };

    const handleDeleteWidget = (widgetId: string) => {
        if (!dashboardConfig) return;

        const widgetToRemove = dashboardConfig.widgets.find(w => w.id === widgetId);
        const widgetTypeMeta = widgetToRemove ? availableWidgetTypes.find(wt => wt.type_key === widgetToRemove.type) : undefined;

        if (widgetTypeMeta && !widgetTypeMeta.is_removable) {
            alert(`Das Widget "${widgetTypeMeta.name}" kann nicht gelöscht werden.`);
            return;
        }

        const updatedWidgets = dashboardConfig.widgets.filter(w => w.id !== widgetId);
        const updatedLayout = dashboardConfig.layout.filter(l => l.i !== widgetId);

        setDashboardConfig({ layout: updatedLayout, widgets: updatedWidgets });
    };

    const renderWidgetContent = (widget: WidgetConfig) => {
        const isLoading = loadingData;
        const currentDataError = dataError;

        const widgetTypeMeta = availableWidgetTypes.find(wt => wt.type_key === widget.type);
        const isRemovable = widgetTypeMeta ? widgetTypeMeta.is_removable : true;
        
        const commonProps: BaseWidgetProps = {
            loading: isLoading,
            error: currentDataError,
            onDelete: handleDeleteWidget,
            widgetId: widget.id,
            isRemovable: isRemovable,
        };

        // Zuweisung der Komponenten zum Map, da sie jetzt hier definiert sind.
        WidgetComponentMap.FuelPrices = FuelPricesWidget;
        WidgetComponentMap.TrafficInfo = TrafficInfoWidget;
        WidgetComponentMap.ESGNews = ESGNewsWidget;
        WidgetComponentMap.BusinessPartnerInfo = BusinessPartnerInfoWidget;
        WidgetComponentMap.TaxChanges = TaxChangesWidget;
        WidgetComponentMap.FleetNews = FleetNewsWidget;

        const SpecificWidgetComponent = WidgetComponentMap[widget.type];

        if (SpecificWidgetComponent) {
            switch (widget.type) {
                case 'FuelPrices':
                    return <SpecificWidgetComponent data={fuelPrices} {...commonProps as FuelPricesWidgetProps} />;
                case 'TrafficInfo':
                    return <SpecificWidgetComponent data={trafficInfo} {...commonProps as TrafficInfoWidgetProps} />; // TRAFFIC INFO WIEDER ÜBER data PROP
                case 'ESGNews':
                    return <SpecificWidgetComponent data={esgNews} {...commonProps as ESGNewsWidgetProps} />;
                case 'BusinessPartnerInfo':
                    return <SpecificWidgetComponent businessPartner={businessPartner} {...commonProps as BusinessPartnerInfoWidgetProps} />;
                case 'TaxChanges':
                    return <SpecificWidgetComponent data={taxChanges} {...commonProps as TaxChangesWidgetProps} />;
                case 'FleetNews':
                    return <SpecificWidgetComponent data={fleetNews} {...commonProps as FleetNewsWidgetProps} />;
                default:
                    return <SpecificWidgetComponent {...commonProps} />;
            }
        } else {
            return (
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6">Unbekanntes Widget</Typography>
                    <Typography variant="body2">Typ: {widget.type}</Typography>
                </Box>
            );
        }
    };


    // --- Main Component Render ---
    return (
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
            <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
                <Toolbar>
                    <IconButton
                        color="inherit"
                        aria-label="open drawer"
                        onClick={toggleDrawer(true)}
                        edge="start"
                        sx={{ mr: 2 }}
                    >
                        ☰
                    </IconButton>
                    {businessPartner && businessPartner.logo_url && (
                        <Box sx={{ mr: 2, display: 'flex', alignItems: 'center' }}>
                            <Avatar
                                alt={businessPartner.name}
                                src={businessPartner.logo_url}
                                sx={{ width: 40, height: 40 }}
                                variant="rounded"
                            />
                        </Box>
                    )}
                    <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
                        Fleet KI-Dashboard
                    </Typography>
                    {user && (
                        <Typography variant="subtitle1" sx={{ mr: 2 }}>
                            Willkommen, {user.username} ({user.role})
                        </Typography>
                    )}
                    <Button color="inherit" onClick={handleLogout}>
                        Logout
                    </Button>
                </Toolbar>
            </AppBar>
            <Drawer
                variant="temporary"
                open={drawerOpen}
                onClose={toggleDrawer(false)}
                ModalProps={{ keepMounted: true }}
                sx={{
                    width: 240,
                    flexShrink: 0,
                    [`& .MuiDrawer-paper`]: { width: 240, boxSizing: 'border-box' },
                }}
            >
                <Toolbar />
                <Box sx={{ overflow: 'auto' }}>
                    <List>
                        <ListItem button onClick={toggleDrawer(false)}>
                            <ListItemText primary="Mein Dashboard" />
                        </ListItem>
                        <ListItem button onClick={() => handleSaveConfig()}>
                            <ListItemText primary="Dashboard Konfiguration speichern" />
                        </ListItem>
                        <ListItem
                            button
                            id="add-widget-button"
                            aria-controls={openAddWidgetMenu ? 'add-widget-menu' : undefined}
                            aria-haspopup="true"
                            aria-expanded={openAddWidgetMenu ? 'true' : undefined}
                            onClick={handleOpenAddWidgetMenu}
                        >
                            <AddCircleOutlineIcon sx={{ mr: 2 }} />
                            <ListItemText primary="Widget hinzufügen" />
                        </ListItem>
                        <Menu
                            id="add-widget-menu"
                            anchorEl={anchorEl}
                            open={openAddWidgetMenu}
                            onClose={handleCloseAddWidgetMenu}
                            MenuListProps={{
                                'aria-labelledby': 'add-widget-button',
                            }}
                        >
                            {availableWidgetTypes
                                .map((widgetType) => (
                                <MenuItem key={widgetType.id} onClick={() => handleAddWidget(widgetType.type_key)}>
                                    {/* Dynamic Icon Rendering */}
                                    {widgetType.icon_name && IconMap[widgetType.icon_name] && (
                                        (() => {
                                            const IconComponent = IconMap[widgetType.icon_name];
                                            return IconComponent ? <IconComponent sx={{ mr: 1 }} /> : null;
                                        })()
                                    )}
                                    {widgetType.name}
                                </MenuItem>
                            ))}
                        </Menu>
                    </List>
                </Box>
            </Drawer>
            <Box component="main" sx={{ flexGrow: 1, p: 3, width: '100%' }}>
                <Toolbar />
                <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
                    {loadingData && <Typography>Dashboard wird geladen...</Typography>}
                    {dataError && <Alert severity="error">{dataError}</Alert>}
                    {!loadingData && !dataError && dashboardConfig && (
                        <ResponsiveGridLayout
                            className="layout"
                            layouts={{ lg: dashboardConfig.layout }}
                            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
                            cols={{ lg: 12, md: 10, sm: 6, xs: 4 }}
                            rowHeight={50}
                            onLayoutChange={(layout) => onLayoutChange(layout)}
                        >
                            {dashboardConfig.widgets.map((widget: WidgetConfig) => {
                                const layoutItem = dashboardConfig.layout.find(l => l.i === widget.id);
                                if (!layoutItem) return null; // Sollte nicht passieren

                                return (
                                    <Box
                                        key={widget.id}
                                        data-grid={layoutItem}
                                        sx={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            height: '100%',
                                            pointerEvents: layoutItem.isDraggable === false ? 'none' : 'auto',
                                        }}
                                    >
                                        {renderWidgetContent(widget)}
                                    </Box>
                                );
                            })}
                        </ResponsiveGridLayout>
                    )}
                    {(!loadingData && !dataError && (!dashboardConfig || dashboardConfig.widgets.length === 0)) && (
                        <Paper elevation={2} sx={{ p: 3, textAlign: 'center' }}>
                            <Typography variant="h6" gutterBottom>Dein Dashboard ist leer!</Typography>
                            <Typography variant="body1">
                                Klicke auf "Widget hinzufügen" in der Navigation, um neue Elemente hinzuzufügen.
                            </Typography>
                        </Paper>
                    )}
                </Container>
            </Box>
        </Box>
    );
};

export default DashboardPage;