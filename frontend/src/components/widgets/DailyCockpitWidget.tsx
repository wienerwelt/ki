import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Accordion, AccordionSummary, AccordionDetails, Divider,
  Link as MuiLink, FormControlLabel, Switch, Tooltip, Stack, Grid,
  Card, CardContent, Table, TableBody, TableCell, TableHead, TableRow,
  Skeleton, Fade
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import LockIcon from '@mui/icons-material/Lock';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import { useSnackbar } from '../../context/SnackbarContext';

// --- Interfaces ---
interface BriefingTopInsight {
  title: string;
  what_changed: string;
  so_what: string;
  action: string;
  sources?: string[];
}

interface BriefingCostDriver {
  driver: string;
  value: string;
  trend: 'up' | 'down' | 'flat' | string;
  impact: string;
}

interface BriefingJson {
  top_insights?: BriefingTopInsight[];
  cost_drivers?: BriefingCostDriver[];
  regulation_and_funding?: any[];
  recommended_actions?: string[];
  confidence_note?: string;
}

interface CockpitData {
  briefing?: BriefingJson | null;
  market_briefing?: { headline: string; summary: string; prognosis: string } | null;
  sales_triggers: any[];
  linkable_names: string[];
  hasVotedToday?: boolean; 
}

const TextWithSearchLinks: React.FC<{ text: string; namesToLink: string[] }> = ({ text, namesToLink }) => {
  const navigate = useNavigate();
  if (!namesToLink || namesToLink.length === 0 || !text) return <>{text}</>;

  const uniqueNames = [...new Set(namesToLink)].filter(Boolean);
  const pattern = uniqueNames
    .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length)
    .join('|');

  const regex = new RegExp(`(${pattern})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) => {
        const isLink = uniqueNames.some(name => name.toLowerCase() === part.toLowerCase());
        return isLink ? (
          <MuiLink
            key={index}
            component="button"
            variant="inherit"
            onClick={() => navigate(`/search?term=${encodeURIComponent(part)}`)}
            sx={{ fontStyle: 'italic', fontWeight: 'bold', textDecoration: 'underline', textDecorationStyle: 'dotted', color: 'primary.main' }}
          >
            {part}
          </MuiLink>
        ) : <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </>
  );
};

const DailyCockpitWidget: React.FC<BaseWidgetProps & { icon?: React.ReactNode }> = ({
  widgetId, onDelete, isRemovable, widgetTypeKey, icon: propsIcon
}) => {
  const { user, updateUser } = useAuth();
  const { showSnackbar } = useSnackbar();
  const [data, setData] = useState<CockpitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(!!user?.newsletter_opt_in);

  const widgetTitle = 'Tägliches Cockpit';

  useEffect(() => { setIsSubscribed(!!user?.newsletter_opt_in); }, [user?.newsletter_opt_in]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/data/daily-briefing');
      setData({
        briefing: response.data.briefing || (response.data.market_briefing?.top_insights ? response.data.market_briefing : null),
        market_briefing: response.data.market_briefing && !response.data.market_briefing.top_insights ? response.data.market_briefing : null,
        sales_triggers: response.data.sales_triggers || [],
        linkable_names: response.data.linkable_names || [],
        hasVotedToday: response.data.hasVotedToday ?? true
      });
    } catch (err) {
      showSnackbar('Fehler beim Laden des Cockpits.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubscriptionToggle = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = event.target.checked;
    setIsSubscribed(isChecked);
    updateUser({ newsletter_opt_in: isChecked });
    try {
      await apiClient.put('/api/users/me', { newsletter_opt_in: isChecked });
      showSnackbar('Newsletter-Einstellung gespeichert.', 'success');
    } catch {
      setIsSubscribed(!isChecked);
      updateUser({ newsletter_opt_in: !isChecked });
    }
  };

  const isLocked = data?.hasVotedToday === false;

  return (
    <WidgetPaper
      widgetId={widgetId}
      onDelete={onDelete}
      isRemovable={isRemovable}
      widgetTitle={widgetTitle}
      widgetTypeKey={widgetTypeKey || 'daily_cockpit'}
      title={<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{propsIcon || <WbSunnyIcon />} <Typography variant="h6">{widgetTitle}</Typography></Box>}
      noPadding
    >
      <Box sx={{ p: 2, position: 'relative', overflowY: 'auto', height: 'calc(100% - 60px)' }}>
        {loading ? <Stack spacing={2}><Skeleton variant="rectangular" height={120} /><Skeleton variant="text" width="60%" /><Skeleton variant="text" /></Stack> : (
          <>
            {data?.briefing?.top_insights && (
              <Box mb={3}>
                <Typography variant="overline" color="primary.main" sx={{ fontWeight: 'bold', mb: 1, display: 'block' }}>
                  Heute in 60 Sekunden
                </Typography>
                <Grid container spacing={2}>
                  {data.briefing.top_insights.slice(0, 3).map((ins, idx) => (
                    <Grid item xs={12} key={idx}>
                      <Card variant="outlined" sx={{ borderLeft: 4, borderLeftColor: 'primary.main', bgcolor: 'background.default' }}>
                        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                            {idx + 1}. <TextWithSearchLinks text={ins.title} namesToLink={data.linkable_names} />
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.85rem' }}>
                            <TextWithSearchLinks text={ins.so_what} namesToLink={data.linkable_names} />
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            )}

            {!data?.briefing && data?.market_briefing && (
              <Box mb={3} sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2, borderLeft: 4, borderLeftColor: 'secondary.main' }}>
                <Typography variant="overline" color="text.secondary">Markt-Briefing</Typography>
                <Typography variant="h6" sx={{ mt: 0.5 }}><TextWithSearchLinks text={data.market_briefing.headline} namesToLink={data.linkable_names} /></Typography>
                <Typography variant="body2" sx={{ mt: 1 }}><TextWithSearchLinks text={data.market_briefing.summary} namesToLink={data.linkable_names} /></Typography>
              </Box>
            )}

            {isLocked && (
              <Fade in={isLocked}>
                <Box sx={{ 
                  position: 'absolute', top: '260px', left: 0, right: 0, bottom: 0, 
                  background: 'linear-gradient(to bottom, transparent, #fff 15%, #fff)',
                  zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 8, textAlign: 'center', px: 3
                }}>
                  <LockIcon color="disabled" sx={{ fontSize: 44, mb: 1.5 }} />
                  <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Exklusive Daten gesperrt</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 280 }}>
                    Bitte nehmen Sie am <b>Markt-Barometer</b> teil, um TCO-Treiber und Empfehlungen freizuschalten.
                  </Typography>
                </Box>
              </Fade>
            )}

            {data?.briefing?.cost_drivers && (
              <Box mb={3} sx={{ opacity: isLocked ? 0.3 : 1, filter: isLocked ? 'blur(2px)' : 'none' }}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="overline" color="text.secondary">Marktindikatoren & TCO</Typography>
                <Table size="small" sx={{ mt: 1, border: '1px solid', borderColor: 'divider' }}>
                  <TableHead sx={{ bgcolor: 'action.hover' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold', py: 1 }}>Treiber</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>Wert</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.briefing.cost_drivers.map((c, i) => (
                      <TableRow key={i} hover>
                        <TableCell sx={{ fontSize: '0.8rem', py: 1 }}><TextWithSearchLinks text={c.driver} namesToLink={data.linkable_names} /></TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 'bold' }}>
                          <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5}>
                            {c.value}
                            {c.trend === 'up' && <TrendingUpIcon sx={{ fontSize: 16, color: 'error.main' }} />}
                            {c.trend === 'down' && <TrendingDownIcon sx={{ fontSize: 16, color: 'success.main' }} />}
                            {c.trend === 'flat' && <HorizontalRuleIcon sx={{ fontSize: 16, color: 'text.disabled' }} />}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}

            {data && data.sales_triggers && data.sales_triggers.length > 0 && (
              <Box mb={2} sx={{ opacity: isLocked ? 0.3 : 1, filter: isLocked ? 'blur(2px)' : 'none' }}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="overline" color="secondary.main" sx={{ fontWeight: 'bold' }}>Sales Intelligence</Typography>
                {data.sales_triggers.map((trigger: any) => (
                  <Accordion key={trigger.id} variant="outlined" sx={{ mt: 1, borderRadius: '8px !important', overflow: 'hidden' }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                        <TextWithSearchLinks text={trigger.headline} namesToLink={data.linkable_names} />
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ bgcolor: 'action.hover', borderTop: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="caption" sx={{ display: 'block', mb: 1, color: 'text.secondary' }}>Kunde: <b>{trigger.account_name}</b></Typography>
                      <Typography variant="body2"><b>Talking Point:</b> <TextWithSearchLinks text={`"${trigger.talking_point}"`} namesToLink={data.linkable_names} /></Typography>
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Box>
            )}
          </>
        )}
      </Box>

      <Divider />
      <Box sx={{ p: 1, display: 'flex', justifyContent: 'center', bgcolor: 'background.default' }}>
        <Tooltip title="Tägliche Zusammenfassung per E-Mail erhalten">
          <FormControlLabel
            control={<Switch size="small" checked={isSubscribed} onChange={handleSubscriptionToggle} color="primary" />}
            label={<Typography variant="caption" sx={{ fontWeight: 500 }}>E-Mail Briefing aktiv</Typography>}
          />
        </Tooltip>
      </Box>
    </WidgetPaper>
  );
};

export default DailyCockpitWidget;