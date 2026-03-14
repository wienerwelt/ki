import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  Link as MuiLink,
  FormControlLabel,
  Switch,
  Tooltip,
  CircularProgress,
  Alert,
  Button
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import apiClient from '../apiClient';
import { useAuth } from '../context/AuthContext';
import { useSnackbar } from '../context/SnackbarContext';

interface SalesTrigger {
  id: string;
  headline: string;
  analysis_summary: string;
  talking_point: string;
  account_name: string;
}

interface BriefingTopInsight {
  title: string;
  what_changed: string;
  so_what: string;
  action: string;
  sources: string[];
}

interface BriefingCostDriver {
  driver: string;
  value: string;
  trend: string;
  impact: string;
}

interface BriefingRadarItem {
  title: string;
  summary: string;
  source: string;
  published_date: string;
}

interface BriefingJson {
  created_at?: string;
  top_insights?: BriefingTopInsight[];
  cost_drivers?: BriefingCostDriver[];
  regulation_and_funding?: Array<{ title: string; deadline?: string; summary: string; action: string; source: string }>;
  industry_radar?: BriefingRadarItem[];
  recommended_actions?: string[];
  confidence_note?: string;
}

interface CockpitData {
  briefing: BriefingJson | null;
  sales_triggers: SalesTrigger[];
  linkable_names: string[];
}

const TextWithSearchLinks: React.FC<{ text: string; namesToLink: string[] }> = ({ text, namesToLink }) => {
  const navigate = useNavigate();
  const handleSearch = (name: string) => navigate(`/search?term=${encodeURIComponent(name)}`);

  if (!namesToLink || namesToLink.length === 0 || !text) return <>{text}</>;

  const uniqueNames = [...new Set(namesToLink)];
  const regex = new RegExp(`(${uniqueNames.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
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
            onClick={() => handleSearch(part)}
            sx={{ fontStyle: 'italic', fontWeight: 'bold' }}
          >
            {part}
          </MuiLink>
        ) : (
          <React.Fragment key={index}>{part}</React.Fragment>
        );
      })}
    </>
  );
};

const DailyBriefingContent: React.FC = () => {
  const [data, setData] = useState<CockpitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, updateUser } = useAuth();
  const { showSnackbar } = useSnackbar();
  const [isSubscribed, setIsSubscribed] = useState(!!user?.newsletter_opt_in);

  useEffect(() => setIsSubscribed(!!user?.newsletter_opt_in), [user?.newsletter_opt_in]);

  const handleSubscriptionToggle = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = event.target.checked;
    const oldState = isSubscribed;

    setIsSubscribed(isChecked);
    updateUser({ newsletter_opt_in: isChecked });
    showSnackbar('Einstellung wird gespeichert...', 'info');

    try {
      await apiClient.put('/api/users/me', { newsletter_opt_in: isChecked });
      showSnackbar('Newsletter-Einstellung erfolgreich gespeichert.', 'success');
    } catch (err) {
      showSnackbar('Fehler beim Speichern der Einstellung.', 'error');
      setIsSubscribed(oldState);
      updateUser({ newsletter_opt_in: oldState });
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiClient.get('/api/data/daily-briefing');
        setData(response.data);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Fehler beim Laden des Tages-Briefings.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 4, minHeight: 200 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
  }

  const briefing = data?.briefing;
  const top = briefing?.top_insights || [];
  const actions = briefing?.recommended_actions || [];
  const radar = briefing?.industry_radar || [];
  const costs = briefing?.cost_drivers || [];
  const regs = briefing?.regulation_and_funding || [];
  const names = data?.linkable_names || [];

  return (
    <>
      <Box sx={{ p: 2, overflowY: 'auto' }}>
        {!briefing ? (
          <Typography sx={{ p: 2, textAlign: 'center' }} color="text.secondary">
            Für heute wurde noch kein Briefing erstellt.
          </Typography>
        ) : (
          <>
            <Typography variant="overline" color="text.secondary">
              Fuhrpark Daily
            </Typography>

            <Typography variant="h6" gutterBottom>
              Heute in 60 Sekunden
            </Typography>

            {/* Top 3 */}
            {top.length > 0 ? top.slice(0, 3).map((ins, idx) => (
              <Accordion key={idx} sx={{ mt: 1, '&:before': { display: 'none' } }} disableGutters elevation={0} variant="outlined">
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography sx={{ fontWeight: 'bold' }}>
                    {idx + 1}. <TextWithSearchLinks text={ins.title} namesToLink={names} />
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ borderTop: 1, borderColor: 'divider' }}>
                  <Typography variant="body2" paragraph>
                    <b>Was neu ist:</b> <TextWithSearchLinks text={ins.what_changed} namesToLink={names} />
                  </Typography>
                  <Typography variant="body2" paragraph>
                    <b>Warum es zählt:</b> <TextWithSearchLinks text={ins.so_what} namesToLink={names} />
                  </Typography>
                  <Typography variant="body2" paragraph>
                    <b>Heute tun:</b> <TextWithSearchLinks text={ins.action} namesToLink={names} />
                  </Typography>

                  {Array.isArray(ins.sources) && ins.sources.length > 0 && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Quellen</Typography>
                      {ins.sources.slice(0, 3).map((u) => (
                        <Box key={u}>
                          <MuiLink href={u} target="_blank" rel="noopener">{u}</MuiLink>
                        </Box>
                      ))}
                    </Box>
                  )}
                </AccordionDetails>
              </Accordion>
            )) : (
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                Keine Top-Insights verfügbar.
              </Typography>
            )}

            {/* Aktionen */}
            <Divider sx={{ my: 2 }} />
            <Typography variant="overline" color="text.secondary">Heute empfohlen</Typography>
            {actions.length > 0 ? (
              <Box component="ul" sx={{ mt: 1, pl: 2 }}>
                {actions.slice(0, 3).map((a, i) => (
                  <li key={i}><Typography variant="body2"><TextWithSearchLinks text={a} namesToLink={names} /></Typography></li>
                ))}
              </Box>
            ) : (
              <Typography color="text.secondary">Keine Empfehlungen verfügbar.</Typography>
            )}

            {/* Kosten */}
            <Divider sx={{ my: 2 }} />
            <Typography variant="overline" color="text.secondary">Kosten & Markt (TCO-Treiber)</Typography>
            {costs.length > 0 ? (
              <Box sx={{ mt: 1 }}>
                {costs.slice(0, 4).map((c, i) => (
                  <Box key={i} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 1 }}>
                    <Typography variant="body2"><b>{c.driver}</b>: {c.value} ({c.trend})</Typography>
                    <Typography variant="body2" color="text.secondary">{c.impact}</Typography>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography color="text.secondary">Keine Kostentreiber-Daten verfügbar.</Typography>
            )}

            {/* Regulatorik */}
            {regs.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="overline" color="text.secondary">Regulatorik & Förderung</Typography>
                {regs.slice(0, 2).map((r, i) => (
                  <Box key={i} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2, mt: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      <TextWithSearchLinks text={r.title} namesToLink={names} />
                    </Typography>
                    {r.deadline && <Typography variant="body2" color="text.secondary">Deadline: {r.deadline}</Typography>}
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      <TextWithSearchLinks text={r.summary} namesToLink={names} />
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      <b>Empfehlung:</b> <TextWithSearchLinks text={r.action} namesToLink={names} />
                    </Typography>
                    {r.source && (
                      <Box sx={{ mt: 0.5 }}>
                        <MuiLink href={r.source} target="_blank" rel="noopener">Quelle</MuiLink>
                      </Box>
                    )}
                  </Box>
                ))}
              </>
            )}

            {/* Radar */}
            <Divider sx={{ my: 2 }} />
            <Typography variant="overline" color="text.secondary">Branchen-Radar</Typography>
            {radar.length > 0 ? (
              <Box component="ul" sx={{ mt: 1, pl: 2 }}>
                {radar.slice(0, 3).map((n, i) => (
                  <li key={i}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      <TextWithSearchLinks text={n.title} namesToLink={names} />
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <TextWithSearchLinks text={n.summary} namesToLink={names} />
                    </Typography>
                    {n.source && <MuiLink href={n.source} target="_blank" rel="noopener">Quelle</MuiLink>}
                  </li>
                ))}
              </Box>
            ) : (
              <Typography color="text.secondary">Keine Radar-Einträge.</Typography>
            )}

            {/* Confidence */}
            {briefing.confidence_note && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                {briefing.confidence_note}
              </Typography>
            )}

            {/* PDF Download Hinweis (kommt aus E-Mail Link; im Portal könnt ihr optional einen Button einbauen, wenn ihr später einen Auth-Endpoint macht) */}
            <Box sx={{ mt: 2 }}>
              <Button variant="outlined" disabled>
                PDF Download (kommt per E-Mail Link)
              </Button>
            </Box>

            {/* Sales Triggers bleiben optional */}
            {data?.sales_triggers?.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="overline" color="text.secondary">Ihre Top-Gesprächsanlässe</Typography>
                {data.sales_triggers.map((trigger) => (
                  <Accordion key={trigger.id} sx={{ mt: 1, '&:before': { display: 'none' } }} disableGutters elevation={0} variant="outlined">
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography sx={{ fontWeight: 'bold' }}>
                        <TextWithSearchLinks text={trigger.headline} namesToLink={names} />
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ borderTop: 1, borderColor: 'divider' }}>
                      <Typography component="div" variant="body2" paragraph>
                        <b>Analyse:</b> <TextWithSearchLinks text={trigger.analysis_summary} namesToLink={names} />
                      </Typography>
                      <Typography component="div" variant="body2" sx={{ fontStyle: 'italic' }}>
                        <b>Gesprächsansatz:</b> <TextWithSearchLinks text={`"${trigger.talking_point}"`} namesToLink={names} />
                      </Typography>
                    </AccordionDetails>
                  </Accordion>
                ))}
              </>
            )}
          </>
        )}
      </Box>

      <Divider />
      <Box sx={{ p: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Tooltip title="Erhalten Sie dieses Briefing täglich als E-Mail">
          <FormControlLabel
            control={<Switch checked={isSubscribed} onChange={handleSubscriptionToggle} />}
            label="Tägliches Briefing per E-Mail"
            labelPlacement="start"
          />
        </Tooltip>
      </Box>
    </>
  );
};

export default DailyBriefingContent;