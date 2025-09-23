import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, CircularProgress, Alert, List, ListItem, ListItemText,
  Button, Link as MuiLink, Chip, Tooltip, Stack
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

// NEU: Props erweitert um das Icon
interface FundingWidgetProps extends BaseWidgetProps {
  icon?: React.ReactNode;
}

const FundingWidget: React.FC<FundingWidgetProps> = ({
  widgetId,
  onDelete,
  isRemovable,
  widgetTypeKey,
  title,
  icon, // NEU
}) => {
  const { showSnackbar } = useSnackbar();
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
        <Box sx={{ p: 2, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
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
        <Box sx={{ p: 2, textAlign: 'center' }}>
          <Typography color="text.secondary">
            Aktuell keine Top-Förderungen für Ihr Profil gefunden.
          </Typography>
        </Box>
      );
    }

    const maxMatch = Math.max(1, ...data.opportunities.map(o => o.match_count || 0));

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <List dense sx={{ p: 0, flexGrow: 1 }}>
          {data.opportunities.map((opp) => (
            <ListItem key={opp.id} divider sx={{ alignItems: 'flex-start' }}>
              <ListItemText
                primary={
                  <MuiLink
                    component={RouterLink}
                    to={`/funding-detail/${opp.id}`}
                    underline="hover"
                    color="inherit"
                    sx={{ fontWeight: 'medium' }}
                  >
                    {opp.title}
                  </MuiLink>
                }
                secondaryTypographyProps={{ component: 'div' }}
                secondary={
                  <Stack sx={{ mt: 0.5 }} spacing={1}>
                     <Typography variant="body2" color="text.secondary">
                      {`Einreichfrist: ${
                        opp.deadline_end
                          ? new Date(opp.deadline_end).toLocaleDateString('de-AT')
                          : 'Laufend'
                      }`}
                     </Typography>
                     {opp.categories && opp.categories.length > 0 && (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {opp.categories.map((cat) => (
                            <Chip key={cat} label={cat} size="small" />
                          ))}
                        </Box>
                     )}
                  </Stack>
                }
              />
              <Tooltip title={`Diese Förderung passt zu ${opp.match_count} Ihrer Interessen`}>
                <Chip
                  label={`${Math.round((opp.match_count / maxMatch) * 100)}%`}
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{ mt: 0.5, ml: 1.5, fontWeight: 'bold' }}
                />
              </Tooltip>
            </ListItem>
          ))}
        </List>
        {/* NEU: "Alle anzeigen" Button am Ende der Liste */}
        <Box sx={{ p: 1, textAlign: 'center', borderTop: '1px solid', borderColor: 'divider' }}>
            <Button component={RouterLink} to="/funding-search" size="small">
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