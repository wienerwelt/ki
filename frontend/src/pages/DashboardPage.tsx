// frontend/src/pages/DashboardPage.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Container, Paper, Alert, Box, CircularProgress, Typography, Menu, MenuItem, Button } from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { WidthProvider, Responsive, Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { DashboardSavedConfig, WidgetConfig, WidgetTypeMeta } from '../types/dashboard.types';
import apiClient from '../apiClient';

// Widget-Komponenten
import GenericAIWidget from '../components/widgets/GenericAIWidget';
import GenericScrapeWidget from '../components/widgets/GenericScrapeWidget';
import BusinessPartnerInfoWidget from '../components/widgets/BusinessPartnerInfoWidget';
import TrafficInfoWidget from '../components/widgets/TrafficInfoWidget';
import FuelPricesWidget from '../components/widgets/FuelPricesWidget';
import TaxChangesWidget from '../components/widgets/TaxChangesWidget';
import FleetNewsWidget from '../components/widgets/FleetNewsWidget';
import VignetteWidget from '../components/widgets/VignetteWidget';
import EVStationWidget from '../components/widgets/EVStationWidget';
import BusinessPartnerActionsWidget from '../components/widgets/BusinessPartnerActionsWidget';
import TrustedSourcesWidget from '../components/widgets/TrustedSourcesWidget';

// Icons
import SpaIcon from '@mui/icons-material/Spa';
import BusinessIcon from '@mui/icons-material/Business';
import TrafficIcon from '@mui/icons-material/Traffic';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import GavelIcon from '@mui/icons-material/Gavel';
import NewspaperIcon from '@mui/icons-material/Newspaper';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import EvStationIcon from '@mui/icons-material/EvStation';
import CommuteIcon from '@mui/icons-material/Commute';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import StarsIcon from '@mui/icons-material/Stars';
import FactoryIcon from '@mui/icons-material/Factory';
import FactCheckIcon from '@mui/icons-material/FactCheck';

const ResponsiveGridLayout = WidthProvider(Responsive);

const WidgetComponentMap: { [key: string]: React.ElementType<any> } = {
    BusinessPartnerInfo: BusinessPartnerInfoWidget,
    TrafficInfo: TrafficInfoWidget,
    FuelPrices: FuelPricesWidget,
    TaxChanges: TaxChangesWidget,
    FleetNews: FleetNewsWidget,
    VignettePreise: VignetteWidget,
    GenericAI: GenericAIWidget,
    EVStation: EVStationWidget,
    GenericScrape: GenericScrapeWidget,
    BusinessPartnerAktionen: BusinessPartnerActionsWidget,
    TrustedSources: TrustedSourcesWidget,
};

const IconMap: { [key: string]: React.ElementType<any> } = {
    Spa: SpaIcon,
    Business: BusinessIcon,
    Traffic: TrafficIcon,
    LocalGasStation: LocalGasStationIcon,
    Gavel: GavelIcon,
    Newspaper: NewspaperIcon,
    Vignette: ConfirmationNumberIcon,
    EvStation: EvStationIcon,
    Commute: CommuteIcon,
    Stars: StarsIcon,
    Factory: FactoryIcon,
    FactCheck: FactCheckIcon,
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

        const defaultWidth = widgetTypeMeta.default_width || 4;
        const newLayoutItem: Layout = {
            i: newWidgetId,
            x: 0,
            y: Infinity,
            w: defaultWidth,
            h: widgetTypeMeta.default_height || 8,
            minW: Math.min(widgetTypeMeta.default_min_width || 0, defaultWidth),
            minH: widgetTypeMeta.default_min_height,
        };

        setDashboardConfig(prev => prev ? { widgets: newWidgets, layout: [...prev.layout, newLayoutItem] } : null);
        handleCloseAddWidgetMenu();
    };

    const renderWidgetContent = (widget: WidgetConfig) => {
        const widgetTypeMeta = availableWidgetTypes.find(wt => wt.type_key === widget.type);

        let componentKey = widgetTypeMeta?.component_key || widget.type;
        if (widget.type === 'bp_actions') {
            componentKey = 'BusinessPartnerAktionen';
        }

        const SpecificWidgetComponent = WidgetComponentMap[componentKey];

        const normalizedIconName = widgetTypeMeta?.icon_name?.replace(/icon$/i, '');
        const IconComponent = normalizedIconName && IconMap[normalizedIconName] ? IconMap[normalizedIconName] : HelpOutlineIcon;

        if (!SpecificWidgetComponent || !widgetTypeMeta) {
            console.error(`Unbekanntes Widget: componentKey='${componentKey}' wurde in WidgetComponentMap nicht gefunden.`);
            return <Box p={2}><Typography>Unbekanntes Widget: {widget.type}</Typography></Box>;
        }

        const config = widgetTypeMeta.config || {};
        const widgetTitle = config.title || widgetTypeMeta.name;
        const widgetCategory = config.category || '';
        const widgetFilterLabel = config.filterLabel || null;

        const commonProps = {
            onDelete: handleDeleteWidget,
            widgetId: widget.id,
            isRemovable: widgetTypeMeta.is_removable ?? true,
        };
        
        switch (componentKey) {
            case 'GenericAI':
            case 'GenericScrape':
                return <SpecificWidgetComponent
                            {...commonProps}
                            title={widgetTitle}
                            category={widgetCategory}
                            filterLabel={widgetFilterLabel}
                            description={(widgetTypeMeta as any).description || ''}
                            icon={<IconComponent />}
                        />;
            
            case 'BusinessPartnerInfo':
                return <SpecificWidgetComponent
                            {...commonProps}
                            title={widgetTypeMeta.name}
                            businessPartner={businessPartner}
                            icon={<IconComponent />}
                        />;

            case 'TrustedSources':
            case 'EVStation':
            case 'BusinessPartnerAktionen':
                return <SpecificWidgetComponent
                            {...commonProps}
                            title={widgetTypeMeta.name}
                            icon={<IconComponent />}
                        />;

            default:
                return <SpecificWidgetComponent
                            {...commonProps}
                            title={widgetTypeMeta.name}
                            loading={loading}
                            error={error}
                            icon={<IconComponent />}
                        />;
        }
    };

    return (
        <Container maxWidth={false} sx={{ mt: 0, px: { xs: 1, sm: 2 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2, gap: 2 }}>
                <Button variant="outlined" onClick={handleOpenAddWidgetMenu} startIcon={<AddCircleOutlineIcon />}>Widget hinzufügen</Button>
                <Menu anchorEl={anchorEl} open={openAddWidgetMenu} onClose={handleCloseAddWidgetMenu}>
                    {availableWidgetTypes.map((widgetType) => {
                        const normalizedIconName = widgetType.icon_name?.replace(/icon$/i, '');
                        const Icon = normalizedIconName && IconMap[normalizedIconName] ? IconMap[normalizedIconName] : HelpOutlineIcon;
                        
                        // ==================================================================
                        // NEUE LOGIK ZUR PRÜFUNG, OB DAS WIDGET BEREITS EXISTIERT
                        // ==================================================================
                        const isAlreadyAdded = dashboardConfig?.widgets.some(w => w.type === widgetType.type_key) ?? false;

                        return (
                            <MenuItem
                                key={widgetType.id}
                                onClick={() => handleAddWidget(widgetType.type_key)}
                                // HIER WIRD DER MENÜEINTRAG DEAKTIVIERT, WENN BEREITS VORHANDEN
                                disabled={isAlreadyAdded}
                            >
                                <Icon sx={{ mr: 1.5 }} />
                                {widgetType.name}
                            </MenuItem>
                        );
                    })}
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
                        <div key={widget.id} data-grid={dashboardConfig.layout.find(l => l.i === widget.id) || {}}>
                            {renderWidgetContent(widget)}
                        </div>
                    ))}
                </ResponsiveGridLayout>
            )}
        </Container>
    );
};

export default DashboardPage;