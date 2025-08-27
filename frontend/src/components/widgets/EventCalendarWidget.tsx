// frontend/src/components/widgets/EventCalendarWidget.tsx (refactored, compilable)
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, CircularProgress, Alert, TextField, Tooltip,
  IconButton, Paper, Stack, Divider, InputAdornment, Modal, Button, ToggleButtonGroup, ToggleButton,
  Collapse, Grid, Snackbar, List, ListItem, ListItemText, ListItemAvatar, Avatar,
  MenuItem, FormControl, Select, SelectChangeEvent
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CloseIcon from '@mui/icons-material/Close';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import EventBusyIcon from '@mui/icons-material/EventBusy';

import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps, Region } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';

// ===== Flag component (with crisp EU SVG) =====
const Flag: React.FC<{ code?: string; alt?: string; size?: number }> = ({ code, alt, size = 20 }) => {
  if (!code) return null;
  const c = code.toUpperCase();
  if (c === 'EU') {
    return (
      <svg width={size} height={(size * 2) / 3} viewBox="0 0 12 8" xmlns="http://www.w3.org/2000/svg" aria-label={alt || 'EU'}>
        <rect width="12" height="8" fill="#003399" />
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i * 30 * Math.PI) / 180;
          const cx = 6 + Math.cos(angle) * 2.2;
          const cy = 4 + Math.sin(angle) * 2.2;
          return (
            <g key={i} transform={`translate(${cx},${cy})`}>
              <polygon
                points="0,-0.6 0.17,-0.1 0.6,-0.1 0.26,0.16 0.39,0.6 0,0.35 -0.39,0.6 -0.26,0.16 -0.6,-0.1 -0.17,-0.1"
                fill="#FFCC00"
              />
            </g>
          );
        })}
      </svg>
    );
  }
  return <img loading="lazy" width={size} src={`https://flagcdn.com/w20/${c.toLowerCase()}.png`} alt={alt || c} />;
};

// ===== Types =====
interface EventData {
  id: string;
  title: string;
  date: string; // ISO date
  region: string | null; // name
  summary: string | null;
  url: string;
  participants: number; // yes
  maybeParticipants?: number; // maybe
  userVote: 1 | 0 | -1 | null;
}

interface ShareState {
  expanded: boolean;
  loading: boolean;
  error: string | null;
  success: string | null;
  recipientEmail: string;
}

const EventCalendarWidget: React.FC<BaseWidgetProps> = ({ onDelete, widgetId, isRemovable }) => {
  const { user } = useAuth();

  const [allEvents, setAllEvents] = useState<EventData[]>([]);
  const [availableRegions, setAvailableRegions] = useState<Region[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegionCode, setSelectedRegionCode] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', event_date: '', region: '', summary: '', original_url: '' });
  const [shareState, setShareState] = useState<ShareState>({ expanded: false, loading: false, error: null, success: null, recipientEmail: '' });
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('jwt_token');
      const res = await apiClient.get('/api/data/enhanced-calendar-events', { headers: { 'x-auth-token': token } });
      setAllEvents(res.data.events);
      setAvailableRegions(res.data.availableRegions);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Events konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleAddEvent = async () => {
    if (!newEvent.title || !newEvent.event_date) {
      alert('Titel und Datum sind erforderlich.');
      return;
    }
    try {
      const token = localStorage.getItem('jwt_token');
      await apiClient.post('/api/admin/scraped-content/events', newEvent, { headers: { 'x-auth-token': token } });
      setShowAddForm(false);
      setNewEvent({ title: '', event_date: '', region: '', summary: '', original_url: '' });
      fetchEvents();
    } catch (err) {
      console.error('Fehler beim Hinzufügen des Events:', err);
      alert('Event konnte nicht hinzugefügt werden.');
    }
  };

  const handleVote = async (vote: 1 | 0 | -1 | null) => {
    if (!selectedEvent || vote === null) return;
    try {
      const token = localStorage.getItem('jwt_token');
      await apiClient.post(`/api/data/events/${selectedEvent.id}/vote`, { vote }, { headers: { 'x-auth-token': token } });
      setSelectedEvent(prev => (prev ? { ...prev, userVote: vote } : null));
      setAllEvents(prev => prev.map(e => {
        if (e.id !== selectedEvent.id) return e;
        const beforeYes = e.userVote === 1;
        const afterYes = vote === 1;
        let participants = e.participants;
        if (beforeYes && !afterYes) participants--;
        if (!beforeYes && afterYes) participants++;
        return { ...e, userVote: vote, participants };
      }));
    } catch (err) {
      console.error('Fehler bei der Abstimmung:', err);
    }
  };

  const handleShare = async () => {
    if (!selectedEvent || !shareState.recipientEmail) return;
    setShareState(s => ({ ...s, loading: true, error: null, success: null }));
    try {
      const token = localStorage.getItem('jwt_token');
      const response = await apiClient.post('/api/data/events/share', {
        title: selectedEvent.title,
        date: selectedEvent.date,
        url: selectedEvent.url,
        summary: selectedEvent.summary,
        recipientEmail: shareState.recipientEmail,
      }, { headers: { 'x-auth-token': token } });
      setShareState(s => ({ ...s, loading: false, success: response.data.message }));
    } catch (err: any) {
      setShareState(s => ({ ...s, loading: false, error: err?.response?.data?.message || 'E-Mail konnte nicht gesendet werden.' }));
    }
  };

    const handleICalExport = () => {
        if (!selectedEvent) return;
        const eventDate = new Date(selectedEvent.date);
        const icsBody = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//YourDashboard//Event//EN',
            'BEGIN:VEVENT',
            `UID:${selectedEvent.id}@yourdashboard.com`,
            `DTSTAMP:${new Date().toISOString().replace(/[-:.]/g, '')}Z`,
            `DTSTART;VALUE=DATE:${eventDate.toISOString().split('T')[0].replace(/-/g, '')}`,
            `SUMMARY:${selectedEvent.title}`,
            `DESCRIPTION:${selectedEvent.summary || ''}\\n\\nQuelle: ${selectedEvent.url}`,
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');

    const blob = new Blob([icsBody], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${selectedEvent.title.replace(/[^a-z0-9]/gi, '_')}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredAndGrouped = useMemo(() => {
    const regionName = availableRegions.find(r => r.code === selectedRegionCode)?.name;
    const filtered = allEvents.filter(e => {
      const matchesRegion = selectedRegionCode === 'all' || e.region === regionName;
      const matchesSearch = !searchTerm || e.title.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesRegion && matchesSearch;
    });
    return filtered.reduce((acc, e) => {
      const key = new Date(e.date).toISOString().split('T')[0];
      (acc[key] ||= []).push(e);
      return acc;
    }, {} as Record<string, EventData[]>);
  }, [allEvents, selectedRegionCode, searchTerm, availableRegions]);

  const daysUntil = (dateStr: string) => {
    const d = new Date(dateStr);
    const t = new Date();
    d.setHours(0, 0, 0, 0);
    t.setHours(0, 0, 0, 0);
    return Math.ceil((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
  };

  const ParticipantsBadges: React.FC<{ yes: number; maybe?: number }> = ({ yes, maybe }) => (
    <Stack direction="row" spacing={2} alignItems="center" sx={{ color: 'text.secondary' }}>
      <Tooltip title={`${yes} nimmt/nehmen teil`}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <EventAvailableIcon sx={{ fontSize: 18, color: 'success.main' }} />
          <Typography variant="body2">{yes}</Typography>
        </Stack>
      </Tooltip>
      {typeof maybe === 'number' && (
        <Tooltip title={`${maybe} eventuell`}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <HelpOutlineIcon sx={{ fontSize: 18, color: 'warning.main' }} />
            <Typography variant="body2">{maybe}</Typography>
          </Stack>
        </Tooltip>
      )}
    </Stack>
  );

  return (
    <WidgetPaper
      title={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          <EventIcon />
          <Typography variant="h6">Event Agenda</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <FormControl size="small" sx={{ minWidth: 150, '.MuiOutlinedInput-notchedOutline': { border: 'none' } }} onMouseDown={(e) => e.stopPropagation()}>
            <Select
              value={selectedRegionCode}
              onChange={(e: SelectChangeEvent) => setSelectedRegionCode(e.target.value)}
              renderValue={(value) => {
                const region = availableRegions.find(r => r.code === value);
                return (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Flag code={value === 'all' ? 'EU' : (value as string)} alt={region?.name || 'Alle Regionen'} />
                    {value === 'all' ? 'Alle Regionen' : region?.name}
                  </Box>
                );
              }}
            >
              <MenuItem value="all">
                <span style={{ marginRight: 8 }}><Flag code="EU" alt="EU" /></span>
                Alle Regionen
              </MenuItem>
              {availableRegions.map((region) => (
                <MenuItem key={region.code} value={region.code}>
                  <span style={{ marginRight: 8 }}><Flag code={region.code} alt={region.name} /></span>
                  {region.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      }
      widgetId={widgetId}
      onDelete={onDelete}
      isRemovable={isRemovable}
      widgetTitle="Event Agenda"
      widgetTypeKey="event-calendar"
    >
      <Stack spacing={2} sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} onMouseDown={(e) => e.stopPropagation()} alignItems="center">
          <TextField
            fullWidth
            size="small"
            placeholder="Events durchsuchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) }}
          />
          <Tooltip title="Neuen Termin hinzufügen">
            <IconButton onClick={() => setShowAddForm(!showAddForm)}>
              <AddCircleOutlineIcon color={showAddForm ? 'primary' : 'action'} />
            </IconButton>
          </Tooltip>
        </Stack>

        <Collapse in={showAddForm}>
          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
            <Typography variant="h6" gutterBottom>Neuen Termin hinzufügen</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={8}>
                <TextField fullWidth size="small" label="Event-Titel" value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth size="small" type="date" label="Datum" value={newEvent.event_date} onChange={e => setNewEvent({ ...newEvent, event_date: e.target.value })} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth size="small" label="URL (Optional)" value={newEvent.original_url} onChange={e => setNewEvent({ ...newEvent, original_url: e.target.value })} />
              </Grid>
              <Grid item xs={12}>
                <TextField select fullWidth size="small" label="Region (Optional)" value={newEvent.region} onChange={e => setNewEvent({ ...newEvent, region: e.target.value })}>
                  <MenuItem value=""><em>Keine Region</em></MenuItem>
                  {user?.regions?.map((r: Region) => (
                    <MenuItem key={r.code} value={r.name}>{r.name}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth size="small" multiline rows={2} label="Kurzbeschreibung (Optional)" value={newEvent.summary} onChange={e => setNewEvent({ ...newEvent, summary: e.target.value })} />
              </Grid>
            </Grid>
            <Box sx={{ mt: 2, textAlign: 'right' }}>
              <Button size="small" onClick={() => setShowAddForm(false)}>Abbrechen</Button>
              <Button size="small" variant="contained" onClick={handleAddEvent} sx={{ ml: 1 }}>Speichern</Button>
            </Box>
          </Paper>
        </Collapse>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : Object.keys(filteredAndGrouped).length === 0 ? (
          <Typography sx={{ textAlign: 'center', p: 3, color: 'text.secondary' }}>Keine zukünftigen Events für Ihre Auswahl gefunden.</Typography>
        ) : (
          <Box sx={{ maxHeight: 420, overflowY: 'auto' }}>
            <List>
              {Object.entries(filteredAndGrouped).map(([dateKey, events]) => {
                const d = new Date(dateKey);
                const day = d.toLocaleDateString('de-DE', { day: '2-digit' });
                const month = d.toLocaleDateString('de-DE', { month: 'short' }).toUpperCase();
                return (
                  <Box key={dateKey}>
                    <ListItem alignItems="flex-start">
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: 'primary.light', color: 'primary.contrastText', width: 56, height: 56, flexDirection: 'column' }}>
                          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>{day}</Typography>
                          <Typography variant="caption">{month}</Typography>
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Stack spacing={1}>
                            {events.map(e => (
                              <Box key={e.id} sx={{ p: 1.25, borderRadius: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }} onClick={() => setSelectedEvent(e)}>
                                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                                  <Typography variant="body1">{e.title}</Typography>
                                  <ParticipantsBadges yes={e.participants} maybe={e.maybeParticipants} />
                                </Stack>
                              </Box>
                            ))}
                          </Stack>
                        }
                      />
                    </ListItem>
                    <Divider component="li" />
                  </Box>
                );
              })}
            </List>
          </Box>
        )}
      </Stack>

      <Modal open={!!selectedEvent} onClose={() => setSelectedEvent(null)}>
        <Paper sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: { xs: '90%', sm: 500 }, display: 'flex', flexDirection: 'column', maxHeight: '90vh', outline: 'none', borderRadius: 2 }}>
          <IconButton onClick={() => setSelectedEvent(null)} sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}><CloseIcon /></IconButton>
          <Box sx={{ p: 3, flexGrow: 1, overflowY: 'auto' }}>
            <Stack direction="row" spacing={2} alignItems="center" mb={2}>
              <Box sx={{ textAlign: 'center', p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <Typography variant="h4" component="div" sx={{ fontWeight: 'bold' }}>{selectedEvent && new Date(selectedEvent.date).toLocaleDateString('de-DE', { day: '2-digit' })}</Typography>
                <Typography variant="body1" component="div">{selectedEvent && new Date(selectedEvent.date).toLocaleDateString('de-DE', { month: 'short' }).toUpperCase()}</Typography>
              </Box>
              <Box>
                <Typography variant="h6" component="h2">{selectedEvent?.title}</Typography>
                {selectedEvent && (
                  <Typography variant="body2" color="text.secondary">
                    {(() => {
                      const d = daysUntil(selectedEvent.date);
                      return d > 0 ? `in ${d} Tagen` : d === 0 ? 'Heute' : 'Vergangen';
                    })()}
                  </Typography>
                )}
              </Box>
            </Stack>

            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
              {selectedEvent?.region && (
                <Tooltip title={selectedEvent.region}>
                  <span>
                    <Flag
                      code={
                        (availableRegions.find(r => r.name === selectedEvent.region)?.code) || 'EU'
                      }
                      alt={selectedEvent.region}
                      size={24}
                    />
                  </span>
                </Tooltip>
              )}
              <ParticipantsBadges yes={selectedEvent?.participants ?? 0} maybe={selectedEvent?.maybeParticipants} />
            </Stack>

            {selectedEvent?.summary && (
              <Typography sx={{ my: 2, whiteSpace: 'pre-wrap' }}>{selectedEvent.summary}</Typography>
            )}
            {selectedEvent?.url && (
              <Button fullWidth size="small" startIcon={<OpenInNewIcon />} href={selectedEvent.url} target="_blank" rel="noopener" variant="outlined">
                Zur Originalquelle
              </Button>
            )}
          </Box>
          <Divider />
          <Stack spacing={1} sx={{ p: 1, bgcolor: 'background.default' }}>
            <Stack direction="row" justifyContent="space-around" alignItems="center">
              <ToggleButtonGroup size="small" exclusive value={selectedEvent?.userVote} onChange={(_, v) => handleVote(v as 1 | 0 | -1 | null)} disabled={(() => { if (!selectedEvent) return true; return daysUntil(selectedEvent.date) < 0; })()}>
                <Tooltip title="Ich nehme teil"><ToggleButton value={1}><EventAvailableIcon color="success" /></ToggleButton></Tooltip>
                <Tooltip title="Vielleicht"><ToggleButton value={0}><HelpOutlineIcon color="warning" /></ToggleButton></Tooltip>
                <Tooltip title="Ich nehme nicht teil"><ToggleButton value={-1}><EventBusyIcon color="error" /></ToggleButton></Tooltip>
              </ToggleButtonGroup>
              <Tooltip title="Termin exportieren (.ics)"><IconButton onClick={handleICalExport}>📅</IconButton></Tooltip>
              <Tooltip title="Per E-Mail teilen"><IconButton onClick={() => setShareState(p => ({ ...p, expanded: !p.expanded }))}>✉️</IconButton></Tooltip>
            </Stack>
            <Collapse in={shareState.expanded}>
              <Stack direction="row" spacing={1} sx={{ p: 1, pt: 2, alignItems: 'center' }}>
                <TextField fullWidth size="small" variant="outlined" label="Empfänger-E-Mail" value={shareState.recipientEmail} onChange={(e) => setShareState(p => ({ ...p, recipientEmail: e.target.value, error: null, success: null }))} />
                <Button size="small" variant="contained" onClick={handleShare} disabled={shareState.loading}>Senden</Button>
              </Stack>
              {shareState.error && <Alert severity="error" sx={{ mx: 1, mt: 1 }}>{shareState.error}</Alert>}
              {shareState.success && <Alert severity="success" sx={{ mx: 1, mt: 1 }}>{shareState.success}</Alert>}
            </Collapse>
          </Stack>
        </Paper>
      </Modal>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ open: false, message: '' })} message={snackbar.message} />
    </WidgetPaper>
  );
};

export default EventCalendarWidget;

