// frontend/src/pages/DashboardPage.tsx
import React, { useState, useEffect, useCallback, useMemo, Suspense, memo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Container, Box, CircularProgress, Alert, Menu, MenuItem, Button, Snackbar,
  useTheme, useMediaQuery, SpeedDial, SpeedDialIcon, SpeedDialAction, Dialog, DialogTitle, DialogContent,
  List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography,
  IconButton, Tooltip
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import SaveIcon from '@mui/icons-material/Save';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import { WidthProvider, Responsive, Layout, Layouts } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
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

const MemoizedWidgetContent = memo(({ 
    widget, availableWidgetTypes, businessPartner, onDelete 
}: { 
    widget: WidgetConfig, availableWidgetTypes: WidgetTypeMeta[], businessPartner: any, onDelete: (id: string) => void 
}) => {
    const widgetTypeMeta = availableWidgetTypes.find((wt) => wt.type_key === widget.type);
    if (!widgetTypeMeta) return <Alert severity="warning">Widget-Typ "{widget.type}" nicht gefunden.</Alert>;

    const componentKey = widgetTypeMeta.component_key || widget.type;
    const SpecificWidgetComponent = (WIDGET_COMPONENTS as any)[componentKey];

    if (!SpecificWidgetComponent) return <Alert severity="error">Komponente "{componentKey}" nicht implementiert.</Alert>;

    const IconComponent = getIcon(widgetTypeMeta.icon_name);
    const config = widgetTypeMeta.config || {};

    const props = {
      ...config,
      onDelete,
      widgetId: widget.id,
      isRemovable: widgetTypeMeta.is_removable ?? true,
      icon: <IconComponent fontSize="small" />,
      title: config.title || widgetTypeMeta.name,
      widgetTitle: config.title || widgetTypeMeta.name,
      widgetTypeKey: widgetTypeMeta.type_key,
      businessPartner,
    };

    return (
      <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><CircularProgress /></Box>}>
        <SpecificWidgetComponent {...props} />
      </Suspense>
    );
});

const DashboardPage: React.FC = () => {
  const { 
    user, 
    businessPartner, 
    dashboardRefreshKey 
  } = useAuth();
  
  const [dashboardConfig, setDashboardConfig] = useState<DashboardSavedConfig>(emptyConfig());
  const [availableWidgetTypes, setAvailableWidgetTypes] = useState<WidgetTypeMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [snackbar, setSnackbar] = useState<SnackbarState>({ open: false, message: '', severity: 'success' });
  const [lastDeleted, setLastDeleted] = useState<LastDeletedState | null>(null);
  const [openSpeedDial, setOpenSpeedDial] = useState(false);
  const [addWidgetDialogOpen, setAddWidgetDialogOpen] = useState(false);
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
      const handleAiChatState = (event: Event) => {
          const customEvent = event as CustomEvent<{ open?: boolean }>;
          const isOpen = Boolean(customEvent.detail?.open);
          setIsAiChatOpen(isOpen);
          if (isOpen) setOpenSpeedDial(false);
      };

      window.addEventListener('ai-chat-open-change', handleAiChatState);
      setIsAiChatOpen(document.body.classList.contains('ai-chat-open'));

      return () => window.removeEventListener('ai-chat-open-change', handleAiChatState);
  }, []);

  useEffect(() => {
      const isWidgetMenuOpen = isMobile && (openSpeedDial || addWidgetDialogOpen);

      document.body.classList.toggle('dashboard-widget-menu-open', isWidgetMenuOpen);
      window.dispatchEvent(
          new CustomEvent('dashboard-widget-menu-open-change', {
              detail: { open: isWidgetMenuOpen },
          })
      );
  }, [isMobile, openSpeedDial, addWidgetDialogOpen]);

  useEffect(() => {
      return () => {
          document.body.classList.remove('dashboard-widget-menu-open');
          window.dispatchEvent(
              new CustomEvent('dashboard-widget-menu-open-change', {
                  detail: { open: false },
              })
          );
      };
  }, []);

  useEffect(() => {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
          if (hasUnsavedChanges) {
              e.preventDefault();
              e.returnValue = ''; 
          }
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const typesRes = await apiClient.get('/api/widgets/types');
      setAvailableWidgetTypes(asArray<WidgetTypeMeta>(typesRes.data));
      
      const configRes = await apiClient.get('/api/dashboard/config');
      setDashboardConfig(coerceConfig(configRes.data));
      setHasUnsavedChanges(false);
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

  useEffect(() => { fetchAll(); }, [fetchAll, dashboardRefreshKey]);

  const onLayoutChange = (_: Layout[], allLayouts: Layouts) => {
      setDashboardConfig((prev) => ({ ...prev, layouts: allLayouts }));
      setHasUnsavedChanges(true);
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    setLastDeleted(null);
    try {
      await apiClient.post('/api/dashboard/config', {
        name: dashboardConfig.name || 'Mein Dashboard',
        config: { layouts: dashboardConfig.layouts, widgets: dashboardConfig.widgets },
        isDefault: true,
      });
      setHasUnsavedChanges(false);
      setSnackbar({ open: true, message: 'Layout erfolgreich gespeichert!', severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e?.response?.data?.message || 'Fehler beim Speichern des Layouts.', severity: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenAddWidgetMenu = (event: React.MouseEvent<HTMLElement>) => {
      setAnchorEl((current) => current ? null : event.currentTarget);
  };
  const handleCloseAddWidgetMenu = () => setAnchorEl(null);

  const handleAddWidgetDialogOpen = () => {
    setOpenSpeedDial(false);
    setAddWidgetDialogOpen(true);
  };
  const handleAddWidgetDialogClose = () => setAddWidgetDialogOpen(false);

  const handleAddWidget = (widgetTypeKey: string) => {
    const widgetTypeMeta = availableWidgetTypes.find((wt) => wt.type_key === widgetTypeKey);
    if (!widgetTypeMeta) return;

    const newWidgetId = `${widgetTypeMeta.type_key}-${Date.now()}`;
    const newWidget: WidgetConfig = { id: newWidgetId, type: widgetTypeMeta.type_key };
    
    setDashboardConfig((prev) => {
        const maxY = prev.layouts.lg?.reduce((max, item) => Math.max(max, item.y + item.h), 0) || 0;
        const newLayouts = { ...prev.layouts };
        ['lg', 'md', 'sm', 'xs'].forEach(bp => {
            newLayouts[bp] = [
                ...(newLayouts[bp] || []),
                { i: newWidgetId, x: 0, y: maxY, w: 4, h: 8 } 
            ];
        });

        return { ...prev, widgets: [...prev.widgets, newWidget], layouts: newLayouts };
    });

    setHasUnsavedChanges(true);
    handleCloseAddWidgetMenu();
    handleAddWidgetDialogClose();
    setSnackbar({ open: true, message: 'Widget hinzugefügt.', severity: 'success' });
  };

  const handleDeleteWidget = useCallback((widgetId: string) => {
    setDashboardConfig(prev => {
        let deletedWidget: WidgetConfig | null = null;
        const deletedLayouts: Layouts = {};

        const newWidgets = prev.widgets.filter((w) => {
            if (w.id === widgetId) {
                deletedWidget = w;
                return false;
            }
            return true;
        });

        const newLayouts = Object.keys(prev.layouts).reduce((acc, breakpoint) => {
            deletedLayouts[breakpoint] = prev.layouts[breakpoint]?.filter((l) => l.i === widgetId) || [];
            acc[breakpoint] = prev.layouts[breakpoint]?.filter((l) => l.i !== widgetId);
            return acc;
        }, {} as Layouts);

        if (deletedWidget) {
            setLastDeleted({ widget: deletedWidget, layouts: deletedLayouts });
        }
        
        return { ...prev, widgets: newWidgets, layouts: newLayouts };
    });
    
    setHasUnsavedChanges(true);
    setSnackbar({ open: true, message: 'Widget entfernt.', severity: 'info' });
  }, []);

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

    setHasUnsavedChanges(true);
    setLastDeleted(null);
    setSnackbar({ ...snackbar, open: false });
  };

  const handleCloseSnackbar = (_?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') return;
    setLastDeleted(null);
    setSnackbar({ ...snackbar, open: false });
  };
  
  const speedDialActions = [
    { icon: <AddCircleOutlineIcon />, name: 'Widgets verwalten', handler: handleAddWidgetDialogOpen },
    { icon: <SaveIcon />, name: 'Layout speichern', handler: () => { handleSaveConfig(); setOpenSpeedDial(false); } }
  ];

  const dashboardHeaderActions = useMemo(() => {
    if (loading || error) return null;

    const isWidgetMenuOpen = Boolean(anchorEl);

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Tooltip title={isWidgetMenuOpen ? 'Widget-Menü schließen' : 'Dashboard mit Widgets anpassen'}>
          <Button
            id="add-widget-button"
            size="small"
            variant="outlined"
            color="inherit"
            startIcon={<AddCircleOutlineIcon />}
            endIcon={isWidgetMenuOpen ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
            onClick={handleOpenAddWidgetMenu}
            sx={{
              height: 34,
              px: 1.15,
              borderRadius: 999,
              textTransform: 'none',
              fontWeight: 850,
              letterSpacing: 0.1,
              borderColor: alpha(theme.palette.common.white, isWidgetMenuOpen ? 0.78 : 0.42),
              color: 'inherit',
              bgcolor: isWidgetMenuOpen
                ? alpha(theme.palette.common.white, 0.24)
                : alpha(theme.palette.common.white, 0.10),
              boxShadow: isWidgetMenuOpen ? `inset 0 0 0 1px ${alpha(theme.palette.common.white, 0.18)}` : 'none',
              '&:hover': {
                borderColor: alpha(theme.palette.common.white, 0.82),
                bgcolor: alpha(theme.palette.common.white, 0.22),
              },
              '& .MuiButton-startIcon': { mr: 0.55 },
              '& .MuiButton-endIcon': { ml: 0.35 },
            }}
          >
            Dashboard anpassen
          </Button>
        </Tooltip>

        {hasUnsavedChanges && (
          <Tooltip title="Änderungen am Dashboard-Layout speichern">
            <span>
              <Button
                id="save-layout-button"
                size="small"
                variant="contained"
                color="inherit"
                startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                onClick={handleSaveConfig}
                disabled={isSaving}
                sx={{
                  height: 34,
                  px: 1.25,
                  borderRadius: 999,
                  textTransform: 'none',
                  fontWeight: 900,
                  color: theme.palette.primary.main,
                  bgcolor: theme.palette.common.white,
                  boxShadow: `0 6px 18px ${alpha(theme.palette.common.black, 0.14)}`,
                  '&:hover': {
                    bgcolor: alpha(theme.palette.common.white, 0.94),
                    boxShadow: `0 8px 22px ${alpha(theme.palette.common.black, 0.18)}`,
                  },
                  '&.Mui-disabled': {
                    color: alpha(theme.palette.primary.main, 0.55),
                    bgcolor: alpha(theme.palette.common.white, 0.78),
                  },
                  '& .MuiButton-startIcon': { mr: 0.6 },
                }}
              >
                {isSaving ? 'Speichert…' : 'Änderungen speichern'}
              </Button>
            </span>
          </Tooltip>
        )}
      </Box>
    );
  }, [anchorEl, error, handleOpenAddWidgetMenu, handleSaveConfig, hasUnsavedChanges, isSaving, loading, theme]);

  useEffect(() => {
    if (isMobile || !dashboardHeaderActions) {
      window.dispatchEvent(new CustomEvent('dashboard-header-actions-clear'));
      return;
    }

    const dispatchActions = () => {
      window.dispatchEvent(new CustomEvent('dashboard-header-actions-change', { detail: { actions: dashboardHeaderActions } }));
    };

    dispatchActions();
    const timeoutId = window.setTimeout(dispatchActions, 0);

    return () => {
      window.clearTimeout(timeoutId);
      window.dispatchEvent(new CustomEvent('dashboard-header-actions-clear'));
    };
  }, [dashboardHeaderActions, isMobile]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;
  if (error) return <Container maxWidth="md" sx={{ mt: 4 }}><Alert severity="error">{error}</Alert></Container>;

  const isDashboardEmpty = dashboardConfig.widgets.length === 0;

  return (
    <Container maxWidth={false} sx={{ mt: 0, px: { xs: 1, sm: 2 } }}>
        {!!user && user.has_seen_welcome_widget === false && <WelcomeWidget />}


        <Menu 
          anchorEl={anchorEl} 
          open={Boolean(anchorEl) && !isMobile} 
          onClose={handleCloseAddWidgetMenu}
          PaperProps={{ sx: { width: 320, maxHeight: 400 } }}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
            {asArray(availableWidgetTypes).map((widgetType) => {
              const Icon = getIcon(widgetType.icon_name);
              const existingWidgets = dashboardConfig.widgets.filter((w) => w.type === widgetType.type_key);
              const isAlreadyAdded = existingWidgets.length > 0;
              const isMultiInstance = widgetType.is_multi_instance;
              
              const canAdd = isMultiInstance || !isAlreadyAdded;

              return (
                  <MenuItem 
                    key={widgetType.id} 
                    onClick={() => canAdd ? handleAddWidget(widgetType.type_key) : null}
                    sx={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      opacity: canAdd ? 1 : 0.8,
                      cursor: canAdd ? 'pointer' : 'default',
                      backgroundColor: isAlreadyAdded && !isMultiInstance ? 'action.hover' : 'transparent'
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Icon sx={{ mr: 1.5, color: isAlreadyAdded ? 'success.main' : 'inherit' }} />
                      <Typography variant="body2">{widgetType.name}</Typography>
                    </Box>

                    {isAlreadyAdded && !isMultiInstance ? (
                      <Tooltip title="Vom Dashboard entfernen">
                        <IconButton 
                          size="small" 
                          color="error"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (existingWidgets[0]) {
                              handleDeleteWidget(existingWidgets[0].id);
                            }
                          }}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : isAlreadyAdded && isMultiInstance ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" color="success.main" sx={{ display: 'flex', alignItems: 'center' }}>
                          <CheckCircleIcon fontSize="inherit" sx={{ mr: 0.5 }} /> {existingWidgets.length} aktiv
                        </Typography>
                        <AddCircleOutlineIcon fontSize="small" color="primary" />
                      </Box>
                    ) : null}
                  </MenuItem>
              );
            })}
        </Menu>

        {isDashboardEmpty ? (
            <Box sx={{ textAlign: 'center', py: { xs: 8, md: 15 }, px: 2 }}>
                <AddCircleOutlineIcon sx={{ fontSize: 80, color: 'text.secondary', mb: 2, opacity: 0.3 }} />
                <Typography variant="h5" color="text.secondary" gutterBottom fontWeight="bold">
                    Ihr Dashboard ist noch leer
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 400, mx: 'auto' }}>
                    Fügen Sie Widgets hinzu, um Ihre wichtigsten Daten, News und Analysen direkt im Blick zu behalten.
                </Typography>
                <Button 
                    variant="contained" 
                    size="large" 
                    onClick={isMobile ? handleAddWidgetDialogOpen : handleOpenAddWidgetMenu} 
                    startIcon={<AddCircleOutlineIcon />}
                >
                    Erstes Widget hinzufügen
                </Button>
            </Box>
        ) : isMobile ? (
            <ErrorBoundary>
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        width: '100%',
                        minWidth: 0,
                        pb: 10,
                        '& > .mobile-dashboard-widget': {
                            width: '100%',
                            minWidth: 0,
                        },
                        '& > .mobile-dashboard-widget > *': {
                            width: '100%',
                            maxWidth: '100%',
                        },
                    }}
                >
                    {dashboardConfig.widgets.map((widget: WidgetConfig) => {
                        const widgetTypeMeta = availableWidgetTypes.find((wt) => wt.type_key === widget.type);
                        const widgetName = widgetTypeMeta?.name || widget.type || 'Unbekanntes Widget';

                        return (
                            <Box key={widget.id} className="mobile-dashboard-widget">
                                <ErrorBoundary name={widgetName}>
                                    <MemoizedWidgetContent 
                                        widget={widget} 
                                        availableWidgetTypes={availableWidgetTypes}
                                        businessPartner={businessPartner}
                                        onDelete={handleDeleteWidget}
                                    />
                                </ErrorBoundary>
                            </Box>
                        );
                    })}
                </Box>
            </ErrorBoundary>
        ) : (
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
                    isDraggable
                    isResizable
                    draggableHandle=".widget-drag-handle"
                    compactType="vertical"
                >
                    {dashboardConfig.widgets.map((widget: WidgetConfig) => {
                        const widgetTypeMeta = availableWidgetTypes.find((wt) => wt.type_key === widget.type);
                        const widgetName = widgetTypeMeta?.name || widget.type || 'Unbekanntes Widget';

                        return (
                            <div 
                                key={widget.id} 
                                data-grid={dashboardConfig.layouts.lg?.find((l: Layout) => l.i === widget.id) || {x:0, y:Infinity, w:4, h:8}}
                            >
                                <ErrorBoundary name={widgetName}>
                                    <MemoizedWidgetContent 
                                        widget={widget} 
                                        availableWidgetTypes={availableWidgetTypes}
                                        businessPartner={businessPartner}
                                        onDelete={handleDeleteWidget}
                                    />
                                </ErrorBoundary>
                            </div>
                        );
                    })}
                </ResponsiveGridLayout>
            </ErrorBoundary>
        )}

        {isMobile && !isAiChatOpen && (
            <SpeedDial
                ariaLabel="Dashboard Aktionen"
                sx={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1400 }}
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

        <Dialog
            open={addWidgetDialogOpen}
            onClose={handleAddWidgetDialogClose}
            fullWidth
            maxWidth="xs"
            fullScreen={false}
            PaperProps={{
                sx: {
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: { xs: 3, sm: 2 },
                    overflow: 'hidden',
                    m: { xs: 1.5, sm: 3 },
                    width: { xs: 'calc(100% - 24px)', sm: '100%' },
                    maxWidth: { xs: 'calc(100% - 24px)', sm: 444 },
                    height: { xs: 'calc(100dvh - 24px)', sm: 'auto' },
                    maxHeight: { xs: 'calc(100dvh - 24px)', sm: 'calc(100% - 64px)' },
                }
            }}
        >
            <DialogTitle
                sx={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    flexShrink: 0,
                    bgcolor: 'background.paper',
                    borderBottom: 1,
                    borderColor: 'divider',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    pr: 1.5,
                    py: { xs: 1.5, sm: 2 },
                }}
            >
                <Typography variant="h6" sx={{ fontWeight: 800 }}>Widgets verwalten</Typography>
                <IconButton
                    edge="end"
                    onClick={handleAddWidgetDialogClose}
                    aria-label="Widgets verwalten schließen"
                >
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent
                dividers
                sx={{
                    p: 0,
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    overscrollBehavior: 'contain',
                }}
            >
                <List sx={{ pt: 0, pb: { xs: 3, sm: 1 } }}>
                    {asArray(availableWidgetTypes).map((widgetType) => {
                    const Icon = getIcon(widgetType.icon_name);
                    const existingWidgets = dashboardConfig.widgets.filter((w) => w.type === widgetType.type_key);
                    const isAlreadyAdded = existingWidgets.length > 0;
                    const isMultiInstance = widgetType.is_multi_instance;
                    const canAdd = isMultiInstance || !isAlreadyAdded;

                    return (
                        <ListItem 
                          key={widgetType.id} 
                          disablePadding
                          secondaryAction={
                            isAlreadyAdded && !isMultiInstance ? (
                              <IconButton 
                                edge="end" 
                                color="error"
                                onClick={() => {
                                  if (existingWidgets[0]) {
                                    handleDeleteWidget(existingWidgets[0].id);
                                  }
                                }}
                              >
                                <DeleteOutlineIcon />
                              </IconButton>
                            ) : null
                          }
                        >
                            <ListItemButton 
                              onClick={() => canAdd ? handleAddWidget(widgetType.type_key) : null} 
                              sx={{ pr: isAlreadyAdded && !isMultiInstance ? 6 : 2 }}
                            >
                                <ListItemIcon>
                                  <Icon color={isAlreadyAdded ? 'success' : 'inherit'} />
                                </ListItemIcon>
                                <ListItemText 
                                  primary={widgetType.name} 
                                  secondary={isAlreadyAdded && isMultiInstance ? `${existingWidgets.length} aktiv (Klicken für mehr)` : null}
                                />
                            </ListItemButton>
                        </ListItem>
                    );
                })}
                </List>
            </DialogContent>
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