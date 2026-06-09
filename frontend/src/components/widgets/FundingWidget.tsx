import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, CircularProgress, Alert, List, ListItem, ListItemText,
  Button, Link as MuiLink, Chip, Tooltip, Stack, useTheme, useMediaQuery
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useSnackbar } from '../../context/SnackbarContext';

interface FundingOpportunity {
  id: string;
  title: string;
  deadline_end: string | null;
  match_count: number;
  categories?: string[];
}

// NEU: Interface um isPublic erweitern
interface FundingWidgetProps extends BaseWidgetProps {
  icon?: React.ReactNode;
  isPublic?: boolean; 
}

const FundingWidget: React.FC<FundingWidgetProps> = ({
  widgetId,
  onDelete,
  isRemovable,
  widgetTypeKey,
  title,
  icon,
  isPublic = false, // Standardmäßig false (für interne Dashboards)
}) => {
  const { showSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  const [data, setData] = useState<{ profile_incomplete: boolean; opportunities: FundingOpportunity[] }>({
    profile_incomplete: true,
    opportunities: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    // --- NEU: PUBLIC MOCK-DATEN ---
    // Wenn das Widget öffentlich ist, laden wir keine echten Profil-Treffer, 
    // sondern zeigen eine attraktive Demo-Ansicht.
    if (isPublic) {
        setData({
            profile_incomplete: false,
            opportunities: [
                { id: 'mock-1', title: 'Transformations-Förderung Elektromobilität', deadline_end: '2026-12-31', match_count: 5, categories: ['E-Mobilität', 'KMU'] },
                { id: 'mock-2', title: 'Ladeinfrastruktur für Betriebe (Klimafonds)', deadline_end: null, match_count: 3, categories: ['Infrastruktur', 'Gewerbe'] },
                { id: 'mock-3', title: 'Flottenumstellung auf Null-Emission', deadline_end: '2026-06-30', match_count: 2, categories: ['Flotte', 'Innovation'] }
            ]
        });
        setLoading(false);
        return;
    }

    // --- INTERNE ABFRAGE FÜR EINGELOGGTE USER ---
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get('/api/funding/top-opportunities');
      if (data) {
        setData(data);
      } else {
        throw new Error('Keine Daten erhalten.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Fehler beim Laden der Förderungen.');
      showSnackbar('Top-Förderungen konnten nicht geladen werden.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showSnackbar, isPublic]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const widgetTitleStr =
    typeof title === 'string' && title.trim().length > 0 ? title : 'Top-Förderungen';

  const renderContent = () => {
    if (loading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3, flexGrow: 1, alignItems: 'center' }}>
          <CircularProgress />
        </Box>
      );
    }
    if (error) {
      return <Alert severity="warning" sx={{ m: 2 }}>{error}</Alert>;
    }
    if (data.profile_incomplete && !isPublic) {
      return (
        <Box sx={{ p: 3, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Vervollständigen Sie Ihr Profil, um passende KI-Förder-Vorschläge zu erhalten!
          </Typography>
          <Button component={RouterLink} to="/profile" variant="outlined" size="small">
            Profil bearbeiten
          </Button>
        </Box>
      );
    }
    if (data.opportunities.length === 0) {
      return (
        <Box sx={{ p: 3, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Typography color="text.secondary">
            Aktuell keine Top-Förderungen für Ihr Profil gefunden.
          </Typography>
          <Button component={RouterLink} to="/funding-search" sx={{ mt: 2 }} variant="text">
             Alle Förderungen durchsuchen
          </Button>
        </Box>
      );
    }

    return (
      <Box sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          height: isMobile ? 'auto' : '100%' 
      }}>
        {/* KI-Badge im Public Modus */}
        {isPublic && (
            <Box sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.1)' : '#e0f2fe', p: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                <AutoAwesomeIcon sx={{ fontSize: 16, color: '#3b82f6' }} />
                <Typography variant="caption" sx={{ color: '#3b82f6', fontWeight: 'bold' }}>KI-Matching Vorschau</Typography>
            </Box>
        )}

        <List dense sx={{ 
            p: 0, 
            flexGrow: 1, 
            overflowY: isMobile ? 'visible' : 'auto' 
        }}>
          {data.opportunities.map((opp) => (
            <ListItem 
                key={opp.id} 
                divider 
                alignItems="flex-start"
                sx={{ 
                    px: isMobile ? 1.5 : 2, 
                    py: 1.5,
                    flexDirection: isMobile ? 'column' : 'row',
                    alignItems: isMobile ? 'flex-start' : 'center'
                }}
            >
              <ListItemText
                primary={
                  <MuiLink
                    component={isPublic ? 'div' : RouterLink} // Verhindert 404 Klicks im Public Modus
                    to={isPublic ? undefined : `/funding-detail/${opp.id}`}
                    underline={isPublic ? "none" : "hover"}
                    color="inherit"
                    sx={{ fontWeight: 600, display: 'block', mb: 0.5, lineHeight: 1.3, cursor: isPublic ? 'default' : 'pointer' }}
                  >
                    {opp.title}
                  </MuiLink>
                }
                secondaryTypographyProps={{ component: 'div' }}
                secondary={
                  <Stack sx={{ mt: 0.5 }} spacing={1}>
                     <Typography variant="caption" color="text.secondary">
                      {`Einreichfrist: ${
                        opp.deadline_end
                          ? new Date(opp.deadline_end).toLocaleDateString('de-AT')
                          : 'Laufend'
                      }`}
                     </Typography>
                     {opp.categories && opp.categories.length > 0 && (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {opp.categories.slice(0, isMobile ? 2 : 3).map((cat) => (
                            <Chip key={cat} label={cat} size="small" sx={{ height: 20, fontSize: '0.7rem' }} variant="outlined" />
                          ))}
                          {opp.categories.length > (isMobile ? 2 : 3) && (
                              <Typography variant="caption" color="text.secondary">+{opp.categories.length - (isMobile ? 2 : 3)}</Typography>
                          )}
                        </Box>
                     )}
                  </Stack>
                }
                sx={{ mb: isMobile ? 1 : 0, mr: isMobile ? 0 : 2, flexGrow: 1 }}
              />
              
              <Box sx={{ display: 'flex', alignItems: 'center', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
                  {isMobile && !isPublic && <Button size="small" component={RouterLink} to={`/funding-detail/${opp.id}`}>Details</Button>}
                  
                  <Tooltip title={isPublic ? "Beispiel-Anzeige für KI-Treffer" : `Diese Förderung passt zu ${opp.match_count} Ihrer Interessen`}>
                    <Chip
                      icon={<AutoAwesomeIcon />}
                      label={`${opp.match_count} Treffer`}
                      size="small"
                      color="primary"
                      variant={theme.palette.mode === 'dark' ? 'filled' : 'outlined'}
                      sx={{ fontWeight: 'bold' }}
                    />
                  </Tooltip>
              </Box>
            </ListItem>
          ))}
        </List>
        
        {/* FOOTER: Fixiert am unteren Rand */}
        {!isPublic && (
            <Box sx={{ p: 1.5, textAlign: 'center', borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                <Button component={RouterLink} to="/funding-search" size="small" fullWidth={isMobile}>
                    Alle Förderungen anzeigen
                </Button>
            </Box>
        )}
      </Box>
    );
  };

  return (
    <WidgetPaper
      title={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {icon}
          <Typography variant="h6">{widgetTitleStr}</Typography>
        </Box>
      }
      widgetTitle={widgetTitleStr}
      widgetTypeKey={widgetTypeKey || 'FundingWidget'}
      widgetId={widgetId}
      onDelete={onDelete}
      isRemovable={isRemovable}
      noPadding
    >
      {renderContent()}
    </WidgetPaper>
  );
};

export default FundingWidget;