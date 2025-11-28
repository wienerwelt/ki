import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, CircularProgress, Alert, List, ListItem, ListItemText,
  Button, Link as MuiLink, Chip, Tooltip, Stack, useTheme, useMediaQuery
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
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

interface FundingWidgetProps extends BaseWidgetProps {
  icon?: React.ReactNode;
}

const FundingWidget: React.FC<FundingWidgetProps> = ({
  widgetId,
  onDelete,
  isRemovable,
  widgetTypeKey,
  title,
  icon,
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
  }, [showSnackbar]);

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
    if (data.profile_incomplete) {
      return (
        <Box sx={{ p: 3, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Vervollständigen Sie Ihr Profil, um passende Förderungen zu erhalten!
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

    // Den höchsten Match-Count ermitteln, um Prozentwerte zu berechnen (falls nicht vom Backend geliefert)
    // Da match_count absolute Treffer sind, ist die Basis die Anzahl der User-Interessen.
    // Hier vereinfacht: Wir nehmen match_count als absoluten Score Indikator.
    
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <List dense sx={{ p: 0, flexGrow: 1, overflowY: 'auto' }}>
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
                    component={RouterLink}
                    to={`/funding-detail/${opp.id}`}
                    underline="hover"
                    color="inherit" // Nutzt Theme-Farbe (weiß im Darkmode, schwarz im Lightmode)
                    sx={{ fontWeight: 600, display: 'block', mb: 0.5, lineHeight: 1.3 }}
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
                  {isMobile && <Button size="small" component={RouterLink} to={`/funding-detail/${opp.id}`}>Details</Button>}
                  
                  <Tooltip title={`Diese Förderung passt zu ${opp.match_count} Ihrer Interessen`}>
                    <Chip
                      label={`${opp.match_count} Treffer`}
                      size="small"
                      color="success" // 'success' passt sich im Theme automatisch an (helles/dunkles grün)
                      variant={theme.palette.mode === 'dark' ? 'filled' : 'outlined'}
                      sx={{ fontWeight: 'bold' }}
                    />
                  </Tooltip>
              </Box>
            </ListItem>
          ))}
        </List>
        
        {/* FOOTER: Fixiert am unteren Rand */}
        <Box sx={{ p: 1.5, textAlign: 'center', borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Button component={RouterLink} to="/funding-search" size="small" fullWidth={isMobile}>
                Alle Förderungen anzeigen
            </Button>
        </Box>
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