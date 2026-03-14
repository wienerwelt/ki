import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Container, Box, CircularProgress, Alert, Menu, MenuItem, Button, Snackbar,
  useTheme, useMediaQuery, SpeedDial, SpeedDialIcon, SpeedDialAction, Dialog, DialogTitle,
  List, ListItem, ListItemButton, ListItemIcon, ListItemText
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import SaveIcon from '@mui/icons-material/Save';
import { WidthProvider, Responsive, Layout, Layouts } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import Joyride, { Step, CallBackProps, STATUS } from 'react-joyride';
import type { DashboardSavedConfig, WidgetConfig, WidgetTypeMeta } from '../types/dashboard.types';
import apiClient from '../apiClient';
import { WIDGET_COMPONENTS } from '../components/widgetMapping';
import { getIcon } from '../components/iconMapping';
import WelcomeWidget from '../components/widgets/WelcomeWidget';
import ErrorBoundary from '../components/ErrorBoundary';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface SnackbarState {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'info';
}

// Datenstruktur für Widget-Wiederherstellung
interface LastDeletedState {
  widget: WidgetConfig;
  layouts: Layouts;
}

function asArray<T = any>(value: any): T[] {
  return Array.isArray(value) ? value : [];
}

const emptyConfig = (): DashboardSavedConfig => ({
  layouts: {},
  widgets: [],
  name: 'Mein Dashboard',
});

function coerceConfig(raw: any): DashboardSavedConfig {
  if (!raw) return emptyConfig();
  const cfg = raw.config && typeof raw.config === 'object' ? raw.config : raw;
  return {
    layouts: cfg.layouts && typeof cfg.layouts === 'object' ? cfg.layouts : {},
    widgets: Array.isArray(cfg.widgets) ? cfg.widgets : [],
    name: typeof raw.name === 'string' ? raw.name : 'Mein Dashboard',
  };
}

const DashboardPage: React.FC = () => {
  const { user, businessPartner, dashboardRefreshKey } = useAuth();
  
  // State
  const [dashboardConfig, setDashboardConfig] = useState<DashboardSavedConfig>(emptyConfig());
  const [availableWidgetTypes, setAvailableWidgetTypes] = useState<WidgetTypeMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [snackbar, setSnackbar] = useState<SnackbarState>({ open: false, message: '', severity: 'success' });
  const [runTour, setRunTour] = useState(false);
  const [lastDeleted, setLastDeleted] = useState<LastDeletedState | null>(null);
  const [openSpeedDial, setOpenSpeedDial] = useState(false);
  const [addWidgetDialogOpen, setAddWidgetDialogOpen] = useState(false);
  
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Joyride (Tour) Konfiguration
  const tourSteps: Step[] = [
    { target: '#add-widget-button', content: 'Hier können Sie neue Widgets (z.B. Community Feed) zu Ihrem Dashboard hinzufügen.', placement: 'bottom-start', disableBeacon: true },
    { target: '.widget-drag-handle', content: 'Widgets können Sie an diesem Anfasser verschieben, um Ihr Layout individuell zu gestalten.', placement: 'bottom' },
    { target: '#save-layout-button', content: 'Wenn Ihnen Ihr Layout gefällt, vergessen Sie nicht, es hier zu speichern!', placement: 'bottom-end' }
  ];

  useEffect(() => {
    const tourHasBeenSeen = localStorage.getItem('dashboardTourSeen');
    if (!tourHasBeenSeen && !isMobile) {
      const t = setTimeout(() => setRunTour(true), 1200);
      return () => clearTimeout(t);
    }
  }, [isMobile]);

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    if (finishedStatuses.includes(status)) {
      setRunTour(false);
      localStorage.setItem('dashboardTourSeen', 'true');
    }
  };

  // Daten laden
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Verfügbare Widget-Typen laden (inkl. 'community_feed' aus der DB)
      const typesRes = await apiClient.get('/api/widgets/types');
      setAvailableWidgetTypes(asArray<WidgetTypeMeta>(typesRes.data));
      
      // 2. Gespeicherte Konfiguration laden
      const configRes = await apiClient.get('/api/dashboard/config');
      setDashboardConfig(coerceConfig(configRes.data));
    } catch (err: any) {
       if (err?.response?.status === 404) {
         setDashboardConfig(emptyConfig());
       } else {
        setError(err?.response?.data?.message || 'Fehler beim Laden des Dashboards.');
       }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { 
    fetchAll(); 
  }, [fetchAll, dashboardRefreshKey]);

  // Layout Änderungen
  const onLayoutChange = (_: Layout[], allLayouts: Layouts) => {
      setDashboardConfig((prev) => ({ ...prev, layouts: allLayouts }));
  };

  const handleSaveConfig = async () => {
    setLastDeleted(null);
    try {
      await apiClient.post('/api/dashboard/config', {
        name: dashboardConfig.name || 'Mein Dashboard',
        config: { layouts: dashboardConfig.layouts, widgets: dashboardConfig.widgets },
        isDefault: true,
      });
      setSnackbar({ open: true, message: 'Layout erfolgreich gespeichert!', severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e?.response?.data?.message || 'Fehler beim Speichern des Layouts.', severity: 'error' });
    }
  };

  // Widget Menü Handler
  const handleOpenAddWidgetMenu = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
  const handleCloseAddWidgetMenu = () => setAnchorEl(null);

  const handleAddWidgetDialogOpen = () => {
    setOpenSpeedDial(false);
    setAddWidgetDialogOpen(true);
  };
  const handleAddWidgetDialogClose = () => setAddWidgetDialogOpen(false);

  // Widget hinzufügen
  const handleAddWidget = (widgetTypeKey: string) => {
    const widgetTypeMeta = availableWidgetTypes.find((wt) => wt.type_key === widgetTypeKey);
    if (!widgetTypeMeta) return;

    const newWidgetId = `${widgetTypeMeta.type_key}-${Date.now()}`;
    const newWidget: WidgetConfig = { id: newWidgetId, type: widgetTypeMeta.type_key };
    
    setDashboardConfig((prev) => ({
      ...prev,
      widgets: [...prev.widgets, newWidget],
    }));

    handleCloseAddWidgetMenu();
    handleAddWidgetDialogClose();
    setSnackbar({ open: true, message: 'Widget hinzugefügt.', severity: 'success' });
  };

  // Löschen & Rückgängig machen
  const handleUndoDelete = () => {
    if (!lastDeleted) return;

    setDashboardConfig(prev => ({
        ...prev,
        widgets: [...prev.widgets, lastDeleted.widget],
        layouts: Object.keys(prev.layouts).reduce((acc, breakpoint) => {
            acc[breakpoint] = [...(prev.layouts[breakpoint] || []), ...(lastDeleted.layouts[breakpoint] || [])];
            return acc;
        }, {} as Layouts),
    }));

    setLastDeleted(null);
    setSnackbar({ ...snackbar, open: false });
  };

  const handleDeleteWidget = (widgetId: string) => {
    let deletedWidget: WidgetConfig | null = null;
    const deletedLayouts: Layouts = {};
    const currentConfig = dashboardConfig;

    const newWidgets = currentConfig.widgets.filter((w) => {
        if (w.id === widgetId) {
            deletedWidget = w;
            return false;
        }
        return true;
    });

    const newLayouts = Object.keys(currentConfig.layouts).reduce((acc, breakpoint) => {
        deletedLayouts[breakpoint] = currentConfig.layouts[breakpoint]?.filter((l) => l.i === widgetId) || [];
        acc[breakpoint] = currentConfig.layouts[breakpoint]?.filter((l) => l.i !== widgetId);
        return acc;
    }, {} as Layouts);

    if (deletedWidget) {
        setLastDeleted({ widget: deletedWidget, layouts: deletedLayouts });
    }
    
    setDashboardConfig({ ...currentConfig, widgets: newWidgets, layouts: newLayouts });
    setSnackbar({ open: true, message: 'Widget entfernt.', severity: 'info' });
  };

  // Snackbar schließen
  const handleCloseSnackbar = (_?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') return;
    setLastDeleted(null);
    setSnackbar({ ...snackbar, open: false });
  };
  
  // Widget Rendering Logik
  const renderWidgetContent = (widget: WidgetConfig) => {
    // Finden der Metadaten für diesen Typ (z.B. "community_feed")
    const widgetTypeMeta = availableWidgetTypes.find((wt) => wt.type_key === widget.type);
    if (!widgetTypeMeta) {
        return <Alert severity="warning">Widget-Typ "{widget.type}" nicht gefunden.</Alert>;
    }
    
    // Mapping auf die echte React-Komponente
    // WICHTIG: WIDGET_COMPONENTS muss 'community_feed' -> CommunityFeedWidget mappen!
    const componentKey = widgetTypeMeta.component_key || widget.type;
    const SpecificWidgetComponent = (WIDGET_COMPONENTS as any)[componentKey];
    
    if (!SpecificWidgetComponent) {
        return <Alert severity="error">Komponente "{componentKey}" nicht implementiert.</Alert>;
    }

    const IconComponent = getIcon(widgetTypeMeta.icon_name);
    const config = widgetTypeMeta.config || {};
    
    const props = {
      ...config, // contains { category: 'fleet_statistics' } for EconomicStatWidget
      onDelete: handleDeleteWidget,
      widgetId: widget.id,
      isRemovable: widgetTypeMeta.is_removable ?? true,
      icon: <IconComponent fontSize="small" />,
      title: config.title || widgetTypeMeta.name,
      widgetTitle: config.title || widgetTypeMeta.name,
      widgetTypeKey: widgetTypeMeta.type_key,
      businessPartner,
      // REMOVED: category: 'community' - this was overwriting the config from DB!
    };

    return (
      <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><CircularProgress /></Box>}>
        <SpecificWidgetComponent {...props} />
      </Suspense>
    );
  };

  const speedDialActions = [
    { icon: <AddCircleOutlineIcon />, name: 'Widget hinzufügen', handler: handleAddWidgetDialogOpen },
    { icon: <SaveIcon />, name: 'Layout speichern', handler: () => { handleSaveConfig(); setOpenSpeedDial(false); } }
  ];

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;
  }

  if (error) {
    return <Container maxWidth="md" sx={{ mt: 4 }}><Alert severity="error">{error}</Alert></Container>;
  }

  return (
    <Container maxWidth={false} sx={{ mt: 0, px: { xs: 1, sm: 2 } }}>
        <Joyride
            steps={tourSteps}
            run={runTour}
            continuous
            showProgress
            showSkipButton
            callback={handleJoyrideCallback}
            styles={{ options: { zIndex: 1301, primaryColor: businessPartner?.color_scheme?.primary_color || '#1976d2' } }}
        />

        {!!user && user.has_seen_welcome_widget === false && <WelcomeWidget />}

        {!isMobile && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2, gap: 2 }}>
                <Button id="add-widget-button" variant="outlined" onClick={handleOpenAddWidgetMenu} startIcon={<AddCircleOutlineIcon />}>
                Widget hinzufügen
                </Button>
                <Button
                    id="save-layout-button"
                    variant="contained"
                    color="primary"
                    onClick={handleSaveConfig}
                >
                    Layout speichern
                </Button>
            </Box>
        )}

        <Menu anchorEl={anchorEl} open={Boolean(anchorEl) && !isMobile} onClose={handleCloseAddWidgetMenu}>
            {asArray(availableWidgetTypes).map((widgetType) => {
            const Icon = getIcon(widgetType.icon_name);
            const isAlreadyAdded = !widgetType.is_multi_instance && dashboardConfig.widgets.some((w) => w.type === widgetType.type_key);
            return (
                <MenuItem key={widgetType.id} onClick={() => handleAddWidget(widgetType.type_key)} disabled={isAlreadyAdded}>
                <Icon sx={{ mr: 1.5 }} />
                {widgetType.name}
                </MenuItem>
            );
            })}
        </Menu>

        <ErrorBoundary>
<ResponsiveGridLayout
    className="layout"
    layouts={dashboardConfig.layouts}
    onLayoutChange={onLayoutChange}
    breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
    cols={{ lg: 12, md: 10, sm: 6, xs: 1 }}
    margin={{ lg: [15, 15], md: [10, 10], sm: [8, 8], xs: [8, 8] }}
    rowHeight={30}
    isDroppable
    draggableHandle=".widget-drag-handle"
>
    {dashboardConfig.widgets.map((widget: WidgetConfig) => {
        // ✅ NEU: Metadaten finden, um den Namen für die ErrorBoundary zu erhalten
        const widgetTypeMeta = availableWidgetTypes.find((wt) => wt.type_key === widget.type);
        const widgetName = widgetTypeMeta?.name || widget.type || 'Unbekanntes Widget';

        return (
            <div 
                key={widget.id} 
                data-grid={dashboardConfig.layouts.lg?.find((l: Layout) => l.i === widget.id) || {x:0, y:Infinity, w:4, h:8}}
            >
                {/* ✅ GLOBALER SCHUTZ: Jedes Widget wird einzeln isoliert */}
                <ErrorBoundary name={widgetName}>
                    {renderWidgetContent(widget)}
                </ErrorBoundary>
            </div>
        );
    })}
</ResponsiveGridLayout>
        </ErrorBoundary>

        {isMobile && (
            <SpeedDial
                ariaLabel="Dashboard Aktionen"
                sx={{ position: 'fixed', bottom: 16, right: 16 }}
                icon={<SpeedDialIcon />}
                onClose={() => setOpenSpeedDial(false)}
                onOpen={() => setOpenSpeedDial(true)}
                open={openSpeedDial}
            >
                {speedDialActions.map((action) => (
                    <SpeedDialAction key={action.name} icon={action.icon} tooltipTitle={action.name} onClick={action.handler}/>
                ))}
            </SpeedDial>
        )}

        <Dialog open={addWidgetDialogOpen} onClose={handleAddWidgetDialogClose} fullWidth maxWidth="xs">
            <DialogTitle>Widget hinzufügen</DialogTitle>
            <List sx={{ pt: 0 }}>
                {asArray(availableWidgetTypes).map((widgetType) => {
                    const Icon = getIcon(widgetType.icon_name);
                    const isAlreadyAdded = !widgetType.is_multi_instance && dashboardConfig.widgets.some((w) => w.type === widgetType.type_key);
                    return (
                        <ListItem key={widgetType.id} disablePadding>
                            <ListItemButton onClick={() => handleAddWidget(widgetType.type_key)} disabled={isAlreadyAdded}>
                                <ListItemIcon><Icon /></ListItemIcon>
                                <ListItemText primary={widgetType.name} />
                            </ListItemButton>
                        </ListItem>
                    );
                })}
            </List>
        </Dialog>

        <Snackbar
            open={snackbar.open}
            autoHideDuration={6000}
            onClose={handleCloseSnackbar}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
            <Alert
                onClose={handleCloseSnackbar}
                severity={snackbar.severity}
                sx={{ width: '100%' }}
                action={
                    lastDeleted ? (
                        <Button color="inherit" size="small" onClick={handleUndoDelete}>
                            RÜCKGÄNGIG
                        </Button>
                    ) : null
                }
            >
            {snackbar.message}
            </Alert>
        </Snackbar>
    </Container>
  );
};

export default DashboardPage;