// src/pages/DashboardPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Container,
  Box,
  CircularProgress,
  Alert,
  Typography,
  Menu,
  MenuItem,
  Button,
  Snackbar // NEU
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { WidthProvider, Responsive, Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import type { DashboardSavedConfig, WidgetConfig, WidgetTypeMeta } from '../types/dashboard.types';
import apiClient from '../apiClient';

// Zentrale Widget-/Icon-Mappings
import { WIDGET_COMPONENTS } from '../components/widgetMapping';
import { getIcon } from '../components/iconMapping';

// Widgets
import WelcomeWidget from '../components/widgets/WelcomeWidget';

// Error Boundary
import ErrorBoundary from '../components/ErrorBoundary';

const ResponsiveGridLayout = WidthProvider(Responsive);

// NEU: Interface für den Snackbar-Status
interface SnackbarState {
  open: boolean;
  message: string;
  severity: 'success' | 'error';
}

const DashboardPage: React.FC = () => {
  const { businessPartner } = useAuth();
  const [dashboardConfig, setDashboardConfig] = useState<DashboardSavedConfig | null>(null);
  const [availableWidgetTypes, setAvailableWidgetTypes] = useState<WidgetTypeMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const openAddWidgetMenu = Boolean(anchorEl);

  // NEU: State für die Snackbar-Benachrichtigung
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'success',
  });

  const fetchDashboardConfig = useCallback(async () => {
    // ... (Diese Funktion bleibt unverändert)
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('jwt_token');
      if (!token) throw new Error('No authentication token found.');
      const [widgetTypesResponse, configResponse] = await Promise.all([
        apiClient.get('/api/widgets/types', { headers: { 'x-auth-token': token } }),
        apiClient.get('/api/dashboard/config', { headers: { 'x-auth-token': token } }),
      ]);
      setAvailableWidgetTypes(widgetTypesResponse.data || []);
      const cfg = (configResponse.data?.config as DashboardSavedConfig) || { layout: [], widgets: [] };
      const correctedLayout = cfg.layout.map(item => {
        if (item.minW && item.w < item.minW) {
          return { ...item, w: item.minW };
        }
        if (item.minH && item.h < item.minH) {
          return { ...item, h: item.minH };
        }
        return item;
      });
      setDashboardConfig({ ...cfg, layout: correctedLayout });
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Error loading dashboard configuration.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardConfig();
  }, [fetchDashboardConfig]);

  const onLayoutChange = (newLayout: Layout[]) => {
    setDashboardConfig((prev) => (prev ? { ...prev, layout: newLayout } : prev));
  };

  // --- KORREKTUR: handleSaveConfig verwendet jetzt die Snackbar ---
  const handleSaveConfig = async () => {
    if (!dashboardConfig) {
        setSnackbar({ open: true, message: 'Keine Konfiguration zum Speichern vorhanden.', severity: 'error' });
        return;
    }
    try {
      const token = localStorage.getItem('jwt_token');
      await apiClient.post(
        '/api/dashboard/config',
        { name: 'Default Dashboard', config: dashboardConfig },
        { headers: { 'x-auth-token': token } }
      );
      // Statt alert(), setzen wir den Snackbar-Status auf Erfolg
      setSnackbar({ open: true, message: 'Layout erfolgreich gespeichert!', severity: 'success' });
    } catch {
      // Statt alert(), setzen wir den Snackbar-Status auf Fehler
      setSnackbar({ open: true, message: 'Fehler beim Speichern des Layouts.', severity: 'error' });
    }
  };

  const handleOpenAddWidgetMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleCloseAddWidgetMenu = () => setAnchorEl(null);

  const handleDeleteWidget = (widgetId: string) => {
    // ... (Diese Funktion bleibt unverändert)
    if (!dashboardConfig) return;
    const updatedWidgets = dashboardConfig.widgets.filter((w) => w.id !== widgetId);
    const updatedLayout = dashboardConfig.layout.filter((l) => l.i !== widgetId);
    setDashboardConfig({ layout: updatedLayout, widgets: updatedWidgets });
  };

  const handleAddWidget = (widgetTypeKey: string) => {
    // ... (Diese Funktion bleibt unverändert)
    if (!dashboardConfig) return;
    const widgetTypeMeta = availableWidgetTypes.find((wt) => wt.type_key === widgetTypeKey);
    if (!widgetTypeMeta) return;
    const newWidgetId = `${widgetTypeMeta.type_key}-${Date.now()}`;
    const newWidgets: WidgetConfig[] = [...dashboardConfig.widgets, { id: newWidgetId, type: widgetTypeMeta.type_key },];
    const defaultWidth = widgetTypeMeta.default_width || 4;
    const newLayoutItem: Layout = { i: newWidgetId, x: 0, y: Infinity, w: defaultWidth, h: widgetTypeMeta.default_height || 8, minW: widgetTypeMeta.default_min_width || 1, minH: widgetTypeMeta.default_min_height || 1, };
    setDashboardConfig((prev) => prev ? { widgets: newWidgets, layout: [...prev.layout, newLayoutItem] } : prev);
    handleCloseAddWidgetMenu();
  };

  const renderWidgetContent = (widget: WidgetConfig) => {
    // ... (Diese Funktion bleibt unverändert)
    const widgetTypeMeta = availableWidgetTypes.find((wt) => wt.type_key === widget.type);
    if (!widgetTypeMeta) { return (<Box p={2}><Typography>Unbekannter Widget-Typ: {widget.type}</Typography></Box>); }
    const componentKey = widgetTypeMeta.component_key || widget.type;
    const SpecificWidgetComponent = (WIDGET_COMPONENTS as any)[componentKey];
    const IconComponent = getIcon(widgetTypeMeta.icon_name);
    if (!SpecificWidgetComponent) { console.error(`Widget-Komponente für Key '${componentKey}' nicht in widgetMapping gefunden.`); return (<Box p={2}><Typography>Fehlende Komponente für: {widget.type}</Typography></Box>); }
    const config = widgetTypeMeta.config || {};
    const commonProps = { onDelete: handleDeleteWidget, widgetId: widget.id, isRemovable: widgetTypeMeta.is_removable ?? true, icon: <IconComponent />, title: config.title || widgetTypeMeta.name, widgetTypeKey: widgetTypeMeta.type_key, };
    const specificProps: Record<string, any> = { GenericAI: { category: config.category, filterLabel: config.filterLabel, description: widgetTypeMeta.description, }, GenericScrape: { category: config.category, filterLabel: config.filterLabel, description: widgetTypeMeta.description, }, BusinessPartnerInfo: { businessPartner }, };
    return <SpecificWidgetComponent {...commonProps} {...(specificProps[componentKey] || {})} />;
  };

  // NEU: Handler zum Schließen der Snackbar
  const handleCloseSnackbar = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbar({ ...snackbar, open: false });
  };

  return (
    <Container maxWidth={false} sx={{ mt: 0, px: { xs: 1, sm: 2 } }}>
      <WelcomeWidget />

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2, gap: 2 }}>
        <Button variant="outlined" onClick={handleOpenAddWidgetMenu} startIcon={<AddCircleOutlineIcon />}>
          Widget hinzufügen
        </Button>
        <Button
          variant="contained"
          onClick={handleSaveConfig}
          sx={{
            backgroundColor: businessPartner?.primary_color || 'primary.main',
            '&:hover': { backgroundColor: businessPartner?.secondary_color || 'primary.dark' },
          }}
        >
          Layout speichern
        </Button>
      </Box>

      <Menu anchorEl={anchorEl} open={openAddWidgetMenu} onClose={handleCloseAddWidgetMenu}>
        {availableWidgetTypes.map((widgetType) => {
          const Icon = getIcon(widgetType.icon_name);
          const isAlreadyAdded = dashboardConfig?.widgets.some((w) => w.type === widgetType.type_key) ?? false;
          return (
            <MenuItem key={widgetType.id} onClick={() => handleAddWidget(widgetType.type_key)} disabled={isAlreadyAdded}>
              <Icon sx={{ mr: 1.5 }} />
              {widgetType.name}
            </MenuItem>
          );
        })}
      </Menu>

      {loading && (<Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>)}
      {error && !loading && <Alert severity="error">{error}</Alert>}

      {!loading && dashboardConfig && (
        <ErrorBoundary>
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
                <ErrorBoundary>{renderWidgetContent(widget)}</ErrorBoundary>
              </div>
            ))}
          </ResponsiveGridLayout>
        </ErrorBoundary>
      )}

      {/* --- NEU: Snackbar-Komponente für Benachrichtigungen --- */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default DashboardPage;