// src/pages/DashboardPage.tsx
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Container, Box, CircularProgress, Alert, Typography, Menu, MenuItem, Button, Snackbar
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { WidthProvider, Responsive, Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import Joyride, { Step, CallBackProps, STATUS } from 'react-joyride';
import posthog from 'posthog-js';

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
  severity: 'success' | 'error';
}

function asArray<T = any>(value: any): T[] {
  return Array.isArray(value) ? value : [];
}
function emptyConfig(): DashboardSavedConfig {
  return { layout: [], widgets: [], name: 'Mein Dashboard' };
}
function coerceConfig(raw: any): DashboardSavedConfig {
  if (!raw) return emptyConfig();

  // akzeptiere entweder { layout, widgets } oder { config: { layout, widgets } }
  const cfg = raw.config && typeof raw.config === 'object' ? raw.config : raw;
  const layout = Array.isArray(cfg.layout) ? cfg.layout : [];
  const widgets = Array.isArray(cfg.widgets) ? cfg.widgets : [];
  const name = typeof cfg.name === 'string' ? cfg.name : 'Mein Dashboard';
  return { layout, widgets, name };
}

const DashboardPage: React.FC = () => {
  const { user, businessPartner } = useAuth();
  const [dashboardConfig, setDashboardConfig] = useState<DashboardSavedConfig>(emptyConfig());
  const [availableWidgetTypes, setAvailableWidgetTypes] = useState<WidgetTypeMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const openAddWidgetMenu = Boolean(anchorEl);
  const [snackbar, setSnackbar] = useState<SnackbarState>({ open: false, message: '', severity: 'success' });
  const [runTour, setRunTour] = useState(false);

  const tourSteps: Step[] = [
    {
      target: '#add-widget-button',
      content: 'Hier können Sie neue Widgets zu Ihrem Dashboard hinzufügen.',
      placement: 'bottom-start',
      disableBeacon: true,
    },
    {
      target: '.widget-header',
      content: 'Widgets können Sie an diesem Anfasser verschieben, um Ihr Layout individuell zu gestalten.',
      placement: 'bottom',
    },
    {
      target: '#save-layout-button',
      content: 'Wenn Ihnen Ihr Layout gefällt, vergessen Sie nicht, es hier zu speichern!',
      placement: 'bottom-end',
    }
  ];

  useEffect(() => {
    const tourHasBeenSeen = localStorage.getItem('dashboardTourSeen');
    if (!tourHasBeenSeen) {
      const t = setTimeout(() => {
        setRunTour(true);
        posthog.capture('tour_started', { type: 'automatic' });
      }, 1200);
      return () => clearTimeout(t);
    }
  }, []);

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    if (finishedStatuses.includes(status)) {
      setRunTour(false);
      localStorage.setItem('dashboardTourSeen', 'true');
      if (status === STATUS.FINISHED) posthog.capture('tour_completed');
      else posthog.capture('tour_skipped', { step_index: data.index });
    }
  };

  // ---- Daten laden: Widget-Typen + Dashboard-Config (mit Fallback-Endpunkten) ----
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1) Widget-Typen
      const typesRes = await apiClient.get('/api/widgets/types');
      setAvailableWidgetTypes(asArray<WidgetTypeMeta>(typesRes.data));

      // 2) Dashboard-Config
      // Primär: /api/dashboard/config (GET)
      // Fallbacks versuchen, falls deine API anders zurückgibt
      const tryEndpoints = [
        { path: '/api/dashboard/config', unwrap: (d: any) => d }, // {layout, widgets} oder {config:{...}}
        { path: '/api/dashboard', unwrap: (d: any) => d },
        { path: '/api/dashboard/me', unwrap: (d: any) => d },
      ];

      let loaded = false;
      for (const ep of tryEndpoints) {
        if (loaded) break;
        try {
          const res = await apiClient.get(ep.path);
          const cfg = coerceConfig(ep.unwrap(res.data));
          setDashboardConfig(cfg);
          loaded = true;
        } catch (e: any) {
          // 404 oder 401 → ignorieren, versuche nächsten Endpoint
          if (e?.response?.status === 401) throw e; // bei 401 sofort abbrechen
        }
      }
      if (!loaded) {
        // Als letzte Option: leer starten, aber UI anzeigen
        setDashboardConfig(emptyConfig());
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) setError('Nicht autorisiert. Bitte neu einloggen.');
      else setError(err?.response?.data?.message || err?.message || 'Fehler beim Laden des Dashboards.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ---- Layoutänderung im State mitschreiben ----
  const onLayoutChange = (newLayout: Layout[]) => {
    setDashboardConfig((prev) => ({ ...prev, layout: newLayout }));
  };

  // ---- Speichern ----
  const handleSaveConfig = async () => {
    try {
      await apiClient.post('/api/dashboard/config', {
        name: dashboardConfig.name || 'Mein Dashboard',
        config: { layout: dashboardConfig.layout, widgets: dashboardConfig.widgets },
        isDefault: true,
      });
      setSnackbar({ open: true, message: 'Layout erfolgreich gespeichert!', severity: 'success' });
      posthog.capture('layout_saved', {
        widget_count: dashboardConfig.widgets.length,
        layout_item_count: dashboardConfig.layout.length
      });
    } catch (e: any) {
      setSnackbar({ open: true, message: e?.response?.data?.message || 'Fehler beim Speichern des Layouts.', severity: 'error' });
    }
  };

  // ---- Widget-Menü ----
  const handleOpenAddWidgetMenu = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
  const handleCloseAddWidgetMenu = () => setAnchorEl(null);

  const handleDeleteWidget = (widgetId: string) => {
    const widgetType = dashboardConfig.widgets.find(w => w.id === widgetId)?.type;
    posthog.capture('widget_deleted', { widget_type: widgetType });
    setDashboardConfig((prev) => ({
      ...prev,
      widgets: prev.widgets.filter((w) => w.id !== widgetId),
      layout: prev.layout.filter((l) => l.i !== widgetId),
    }));
  };

  const handleAddWidget = (widgetTypeKey: string) => {
    const widgetTypeMeta = availableWidgetTypes.find((wt) => wt.type_key === widgetTypeKey);
    if (!widgetTypeMeta) return;
    posthog.capture('widget_added', { widget_type: widgetTypeKey });

    const newWidgetId = `${widgetTypeMeta.type_key}-${Date.now()}`;
    const defaultWidth = widgetTypeMeta.default_width || 4;

    const newWidget: WidgetConfig = { id: newWidgetId, type: widgetTypeMeta.type_key };
    const newLayoutItem: Layout = {
      i: newWidgetId,
      x: 0,
      y: Infinity,
      w: defaultWidth,
      h: widgetTypeMeta.default_height || 8,
      minW: Math.min(widgetTypeMeta.default_min_width || 1, defaultWidth),
      minH: widgetTypeMeta.default_min_height || 1,
    };

    setDashboardConfig((prev) => ({
      ...prev,
      widgets: [...prev.widgets, newWidget],
      layout: [...prev.layout, newLayoutItem],
    }));

    handleCloseAddWidgetMenu();
  };

  // ---- Widgets rendern (defensiv) ----
  const renderWidgetContent = (widget: WidgetConfig) => {
    const widgetTypeMeta = availableWidgetTypes.find((wt) => wt.type_key === widget.type);
    if (!widgetTypeMeta) {
      return (
        <Box p={2}>
          <Typography>Unbekannter Widget-Typ: {widget.type}</Typography>
        </Box>
      );
    }

    const componentKey = widgetTypeMeta.component_key || widget.type;
    const SpecificWidgetComponent = (WIDGET_COMPONENTS as any)[componentKey];
    const IconComponent = getIcon(widgetTypeMeta.icon_name);

    if (!SpecificWidgetComponent) {
      return (
        <Box p={2}>
          <Typography>Fehlende Komponente für: {widget.type}</Typography>
        </Box>
      );
    }

    const config = widgetTypeMeta.config || {};
    const commonProps = {
      onDelete: handleDeleteWidget,
      widgetId: widget.id,
      isRemovable: widgetTypeMeta.is_removable ?? true,
      icon: <IconComponent />,
      title: config.title || widgetTypeMeta.name,
      widgetTypeKey: widgetTypeMeta.type_key,
    };

    const specificProps: Record<string, any> = {
      GenericAI: {
        category: config.category,
        filterLabel: config.filterLabel,
        description: widgetTypeMeta.description,
      },
      GenericScrape: {
        category: config.category,
        filterLabel: config.filterLabel,
        description: widgetTypeMeta.description,
      },
      PodcastWidget: { category: config.category },
      VideoWidget: { category: config.category },
      BusinessPartnerInfo: { businessPartner },
    };

    return (
      <Suspense
        fallback={
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        }
      >
        <SpecificWidgetComponent {...commonProps} {...(specificProps[componentKey] || {})} />
      </Suspense>
    );
  };

  const handleCloseSnackbar = (_?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') return;
    setSnackbar({ ...snackbar, open: false });
  };

  return (
    <Container maxWidth={false} sx={{ mt: 0, px: { xs: 1, sm: 2 } }}>
      <Joyride
        steps={tourSteps}
        run={runTour}
        continuous
        showProgress
        showSkipButton
        callback={handleJoyrideCallback}
        styles={{
          options: {
            zIndex: 1301,
            primaryColor: businessPartner?.color_scheme?.primary_color || '#1976d2',
          },
        }}
      />

      {/* Willkommen-Hinweis nur zeigen, solange der Nutzer ihn nicht bestätigt hat */}
      {!!user && user.has_seen_welcome_widget === false && <WelcomeWidget />}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2, gap: 2 }}>
        <Button id="add-widget-button" variant="outlined" onClick={handleOpenAddWidgetMenu} startIcon={<AddCircleOutlineIcon />}>
          Widget hinzufügen
        </Button>
        <Button
          id="save-layout-button"
          variant="contained"
          onClick={handleSaveConfig}
          sx={{
            backgroundColor: businessPartner?.color_scheme?.primary_color || 'primary.main',
            '&:hover': { backgroundColor: businessPartner?.color_scheme?.secondary_color || 'primary.dark' },
          }}
        >
          Layout speichern
        </Button>
      </Box>

      <Menu anchorEl={anchorEl} open={openAddWidgetMenu} onClose={handleCloseAddWidgetMenu}>
        {asArray(availableWidgetTypes).map((widgetType) => {
          const Icon = getIcon(widgetType.icon_name);
          const isAlreadyAdded = dashboardConfig.widgets.some((w) => w.type === widgetType.type_key);
          return (
            <MenuItem key={widgetType.id} onClick={() => handleAddWidget(widgetType.type_key)} disabled={isAlreadyAdded}>
              <Icon sx={{ mr: 1.5 }} />
              {widgetType.name}
            </MenuItem>
          );
        })}
      </Menu>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && (
        <ErrorBoundary>
          <ResponsiveGridLayout
            className="layout"
            layouts={{ lg: dashboardConfig.layout }}
            onLayoutChange={onLayoutChange}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4 }}
            rowHeight={30}
            isDroppable
            draggableHandle=".widget-drag-handle"
          >
            {dashboardConfig.widgets.map((widget: WidgetConfig) => (
              <div key={widget.id}>
                <ErrorBoundary>{renderWidgetContent(widget)}</ErrorBoundary>
              </div>
            ))}
          </ResponsiveGridLayout>
        </ErrorBoundary>
      )}

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
