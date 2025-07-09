import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Container, Paper, Alert, Box, CircularProgress, Typography, Menu, MenuItem, Button } from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { WidthProvider, Responsive, Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { DashboardSavedConfig, WidgetConfig, WidgetTypeMeta, BaseWidgetProps } from '../types/dashboard.types';
import apiClient from '../apiClient';

// --- Alle benötigten Widget-Komponenten importieren ---
import GenericAIWidget from '../components/widgets/GenericAIWidget';
import BusinessPartnerInfoWidget from '../components/widgets/BusinessPartnerInfoWidget';
import TrafficInfoWidget from '../components/widgets/TrafficInfoWidget';
import FuelPricesWidget from '../components/widgets/FuelPricesWidget';
import TaxChangesWidget from '../components/widgets/TaxChangesWidget';
import FleetNewsWidget from '../components/widgets/FleetNewsWidget';
import VignetteWidget from '../components/widgets/VignetteWidget';
import EVStationWidget from '../components/widgets/EVStationWidget'; // NEU: EVStationWidget importiert

// --- Alle benötigten Icons importieren ---
import SpaIcon from '@mui/icons-material/Spa';
import BusinessIcon from '@mui/icons-material/Business';
import TrafficIcon from '@mui/icons-material/Traffic';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import GavelIcon from '@mui/icons-material/Gavel';
import NewspaperIcon from '@mui/icons-material/Newspaper';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import EvStationIcon from '@mui/icons-material/EvStation'; // NEU: Icon für EV-Stationen importiert

const ResponsiveGridLayout = WidthProvider(Responsive);

const WidgetComponentMap: { [key: string]: React.ElementType<any> } = {
    BusinessPartnerInfo: BusinessPartnerInfoWidget,
    TrafficInfo: TrafficInfoWidget,
    FuelPrices: FuelPricesWidget,
    TaxChanges: TaxChangesWidget,
    FleetNews: FleetNewsWidget,
    VignettePreise: VignetteWidget,
    GenericAI: GenericAIWidget,
    EVStation: EVStationWidget, // NEU: EVStationWidget zur Map hinzugefügt
};

const IconMap: { [key: string]: React.ElementType<any> } = {
    SpaIcon,
    BusinessIcon,
    TrafficIcon,
    LocalGasStationIcon,
    GavelIcon,
    NewspaperIcon,
    VignetteIcon: ConfirmationNumberIcon,
    EvStationIcon, // NEU: Icon zur Map hinzugefügt
};

const DashboardPage: React.FC = () => {
    const { businessPartner } = useAuth();
    const [dashboardConfig, setDashboardConfig] = useState<DashboardSavedConfig | null>(null);
    const [availableWidgetTypes, setAvailableWidgetTypes] = useState<WidgetTypeMeta[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const openAddWidgetMenu = Boolean(anchorEl);

    const fetchDashboardConfig = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            if (!token) throw new Error("Kein Authentifizierungstoken gefunden.");
            
            const [widgetTypesResponse, configResponse] = await Promise.all([
                apiClient.get('/api/widgets/types', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/dashboard/config', { headers: { 'x-auth-token': token } })
            ]);

            setAvailableWidgetTypes(widgetTypesResponse.data);
            setDashboardConfig(configResponse.data.config || { layout: [], widgets: [] });
        } catch (error: any) {
            setError(error.response?.data?.message || 'Fehler beim Laden der Dashboard-Konfiguration.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchDashboardConfig(); }, [fetchDashboardConfig]);

    const onLayoutChange = (newLayout: Layout[]) => {
        if (dashboardConfig) {
            setDashboardConfig(prevConfig => prevConfig ? { ...prevConfig, layout: newLayout } : null);
        }
    };

    const handleSaveConfig = async () => {
        if (!dashboardConfig) return alert('Keine Konfiguration zum Speichern vorhanden.');
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.post('/api/dashboard/config', 
                { name: 'Default Dashboard', config: dashboardConfig },
                { headers: { 'x-auth-token': token } }
            );
            alert('Layout gespeichert!');
        } catch (error) {
            alert('Fehler beim Speichern des Layouts.');
        }
    };

    const handleOpenAddWidgetMenu = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleCloseAddWidgetMenu = () => {
        setAnchorEl(null);
    };

    const handleDeleteWidget = (widgetId: string) => {
        if (!dashboardConfig) return;
        const updatedWidgets = dashboardConfig.widgets.filter(w => w.id !== widgetId);
        const updatedLayout = dashboardConfig.layout.filter(l => l.i !== widgetId);
        setDashboardConfig({ layout: updatedLayout, widgets: updatedWidgets });
    };
    
    const handleAddWidget = (widgetTypeKey: string) => {
        if (!dashboardConfig) return;
        const widgetTypeMeta = availableWidgetTypes.find(wt => wt.type_key === widgetTypeKey);
        if (!widgetTypeMeta) return;

        const newWidgetId = `${widgetTypeMeta.type_key}-${Date.now()}`;
        const newWidgets: WidgetConfig[] = [...dashboardConfig.widgets, { id: newWidgetId, type: widgetTypeMeta.type_key }];
        const newLayoutItem: Layout = {
            i: newWidgetId,
            x: (dashboardConfig.layout.length * (widgetTypeMeta.default_width || 4)) % 12,
            y: Infinity,
            w: widgetTypeMeta.default_width || 4,
            h: widgetTypeMeta.default_height || 8,
            minW: widgetTypeMeta.default_min_width,
            minH: widgetTypeMeta.default_min_height,
        };
        setDashboardConfig(prev => prev ? { widgets: newWidgets, layout: [...prev.layout, newLayoutItem] } : null);
        handleCloseAddWidgetMenu();
    };

    const renderWidgetContent = (widget: WidgetConfig) => {
        const widgetTypeMeta = availableWidgetTypes.find(wt => wt.type_key === widget.type);
        const componentKey = widgetTypeMeta?.component_key || widget.type;
        const SpecificWidgetComponent = WidgetComponentMap[componentKey];
        
        if (!SpecificWidgetComponent) {
            return <Box p={2}><Typography>Unbekanntes Widget: {widget.type}</Typography></Box>;
        }
        
        const commonProps = {
            onDelete: handleDeleteWidget,
            widgetId: widget.id,
            isRemovable: widgetTypeMeta?.is_removable ?? true,
        };
        
        // Widgets, die ihren Ladezustand selbst verwalten
        if (componentKey === 'GenericAI' || widget.type === 'BusinessPartnerInfo' || widget.type === 'EVStation') {
            const config = widgetTypeMeta?.config || {};
            const IconComponent = widgetTypeMeta?.icon_name && IconMap[widgetTypeMeta.icon_name] ? IconMap[widgetTypeMeta.icon_name] : SpaIcon;
            
            // Spezifische Logik für GenericAI
            if (componentKey === 'GenericAI') {
                 return <SpecificWidgetComponent 
                            {...commonProps} 
                            title={config.title || 'KI Feed'}
                            category={config.category || ''}
                            icon={<IconComponent color="success" />}
                        />;
            }
            
            // Logik für BusinessPartnerInfo
             if (widget.type === 'BusinessPartnerInfo') {
                return <SpecificWidgetComponent {...commonProps} businessPartner={businessPartner} />;
            }

            // NEU: Logik für EVStationWidget
            if (widget.type === 'EVStation') {
                return <SpecificWidgetComponent {...commonProps} />;
            }
        }
        
        // Alle anderen, einfachen Widgets
        return <SpecificWidgetComponent {...commonProps} loading={loading} error={error} />;
    };

    return (
        <Container maxWidth={false} sx={{ mt: 0, px: { xs: 1, sm: 2 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2, gap: 2 }}>
                <Button variant="outlined" onClick={handleOpenAddWidgetMenu} startIcon={<AddCircleOutlineIcon />}>Widget hinzufügen</Button>
                <Menu anchorEl={anchorEl} open={openAddWidgetMenu} onClose={handleCloseAddWidgetMenu}>
                    {availableWidgetTypes.map((widgetType) => (
                        <MenuItem key={widgetType.id} onClick={() => handleAddWidget(widgetType.type_key)}>
                            {widgetType.icon_name && IconMap[widgetType.icon_name] && React.createElement(IconMap[widgetType.icon_name], { sx: { mr: 1 }})}
                            {widgetType.name}
                        </MenuItem>
                    ))}
                </Menu>
                <Button variant="contained" onClick={handleSaveConfig}>Layout Speichern</Button>
            </Box>
            
            {loading && <Box sx={{display: 'flex', justifyContent: 'center', p: 5}}><CircularProgress /></Box>}
            {error && !loading && <Alert severity="error">{error}</Alert>}
            
            {!loading && dashboardConfig && (
                <ResponsiveGridLayout
                    className="layout"
                    layouts={{ lg: dashboardConfig.layout }}
                    onLayoutChange={onLayoutChange}
                    breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
                    cols={{ lg: 12, md: 10, sm: 6, xs: 4 }}
                    rowHeight={30}
                    isDroppable={true}
                    draggableHandle=".widget-header"
                >
                    {dashboardConfig.widgets.map((widget: WidgetConfig) => (
                        <div key={widget.id}>
                            <Paper elevation={2} sx={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
                                {renderWidgetContent(widget)}
                            </Paper>
                        </div>
                    ))}
                </ResponsiveGridLayout>
            )}
        </Container>
    );
};

export default DashboardPage;
