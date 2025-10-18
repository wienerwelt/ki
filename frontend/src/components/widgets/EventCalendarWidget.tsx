import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, CircularProgress, TextField, Tooltip,
  IconButton, Paper, Stack, InputAdornment, Button,
  MenuItem, FormControl, Select, SelectChangeEvent, Link as MuiLink,
  Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem,
  ToggleButtonGroup, ToggleButton
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CloseIcon from '@mui/icons-material/Close';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CelebrationIcon from '@mui/icons-material/Celebration';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../apiClient';

interface BaseWidgetProps {
  widgetId: string;
  isRemovable: boolean;
  onDelete: (widgetId: string) => void;
}
interface EventCalendarWidgetProps extends BaseWidgetProps {
  icon?: React.ReactNode;
  title: string;
  category?: string;             // z.B. "events,industry"
  widgetTypeKey?: string;        // QA/Tests
}

interface Region { id?: string; name: string; code: string; latitude?: number; longitude?: number; }

interface EventData {
  id: string; title: string; date: string; region: string | null; summary: string | null; url: string | null;
  participants: number; maybeParticipants?: number; userVote: 1 | 0 | -1 | null;
  full_text: string | null; is_trusted_source: boolean; is_read: boolean; type?: 'event' | 'holiday';
}

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

const getDomainSafely = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url.split('/')[0] ?? null; }
};
const isValidUrl = (urlString: string): boolean => {
  if (!urlString || urlString === 'https://') return true;
  try { const u = new URL(urlString); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
};

const ParticipantsBadges: React.FC<{ yes: number; maybe?: number }> = ({ yes, maybe }) => (
  <Stack direction="row" spacing={1} alignItems="center">
    <Tooltip title="Interessiert/Teilnahme">
      <Stack direction="row" spacing={0.5} alignItems="center">
        <EventAvailableIcon fontSize="small" />
        <Typography variant="caption">{yes}</Typography>
      </Stack>
    </Tooltip>
    <Tooltip title="Unentschieden">
      <Stack direction="row" spacing={0.5} alignItems="center">
        <EventBusyIcon fontSize="small" />
        <Typography variant="caption">{maybe ?? 0}</Typography>
      </Stack>
    </Tooltip>
  </Stack>
);

const WidgetPaper: React.FC<React.PropsWithChildren<{ title: React.ReactNode; loading: boolean; error: string | null }>> = ({
  title, children, loading, error,
}) => (
  <Paper elevation={3} sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
      {typeof title === 'string' ? <Typography variant="h6">{title}</Typography> : title}
    </Box>
    {loading && <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress /></Box>}
    {error && <Box sx={{ p: 3, textAlign: 'center', color: 'error.main' }}><Typography>{error}</Typography></Box>}
    {!loading && !error && <Box sx={{ flexGrow: 1, position: 'relative' }}>{children}</Box>}
  </Paper>
);

const EventCalendarWidget: React.FC<EventCalendarWidgetProps> = ({
  onDelete, widgetId, isRemovable, icon, title, category, widgetTypeKey
}) => {
  const navigate = useNavigate();

  const [allEvents, setAllEvents] = useState<EventData[]>([]);
  const [availableRegions, setAvailableRegions] = useState<Region[]>([]);
  const [allPossibleRegions, setAllPossibleRegions] = useState<Region[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegionCode, setSelectedRegionCode] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', event_date: '', region: '', summary: '', original_url: 'https://' });
  const [viewMode, setViewMode] = useState<'upcoming' | 'past'>('upcoming');

  // --- Daten holen (ohne manuelle Header; apiClient setzt Authorization automatisch) ---
  const fetchAllRegions = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/data/regions');
      const list = Array.isArray(res.data) ? res.data : [];
      setAllPossibleRegions(list);
    } catch (err) {
      console.error('Fehler beim Laden aller Regionen:', err);
      setAllPossibleRegions([]);
    }
  }, []);

  const fetchEventsAndHolidays = useCallback(async () => {
    if (!category || category.trim().length === 0) {
      setError('Keine Kategorie im Widget-Typ konfiguriert.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [eventsRes, holidaysRes] = await Promise.all([
        apiClient.get('/api/data/events', { params: { category } }),
        apiClient.get('/api/data/holidays'),
      ]);

      const events: EventData[] = (eventsRes.data?.events || []).map((e: any) => ({
        id: String(e.id),
        title: e.title,
        date: e.date,
        region: e.region ?? null,
        summary: e.summary ?? null,
        url: e.url ?? null,
        participants: Number(e.participants ?? 0),
        maybeParticipants: Number(e.maybeParticipants ?? 0),
        userVote: (e.userVote ?? null) as 1 | 0 | -1 | null,
        full_text: e.full_text ?? null,
        is_trusted_source: !!e.is_trusted_source,
        is_read: !!e.is_read,
        type: 'event',
      }));

      const holidays: EventData[] = (holidaysRes.data || []).map((h: any) => ({
        id: String(h.id),
        title: h.title,
        date: h.date,
        region: h.region ?? null,
        summary: h.summary ?? null,
        url: null,
        participants: 0,
        maybeParticipants: 0,
        userVote: null,
        full_text: null,
        is_trusted_source: true,
        is_read: true,
        type: 'holiday',
      }));

      // Regionsliste zusammenbauen
      const eventRegions: Region[] = Array.isArray(eventsRes.data?.availableRegions)
        ? eventsRes.data.availableRegions
        : [];
      const holidayRegionNames = Array.from(new Set(holidays.map(h => h.region).filter(Boolean) as string[]));
      const holidayRegionObjects = allPossibleRegions.filter(r => holidayRegionNames.includes(r.name));

      const combined = [...eventRegions, ...holidayRegionObjects];
      const uniqueRegions = Array.from(new Map(combined.map(r => [r.code, r])).values())
        .sort((a, b) => a.name.localeCompare(b.name));

      setAvailableRegions(uniqueRegions);
      setAllEvents([...events, ...holidays]);
    } catch (err: any) {
      setAllEvents([]);
      setAvailableRegions([]);
      // zeige Backend-Message, sonst generisch
      setError(err?.response?.data?.message || 'Events konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [category, allPossibleRegions]);

  useEffect(() => { fetchAllRegions(); }, [fetchAllRegions]);
  useEffect(() => { fetchEventsAndHolidays(); }, [fetchEventsAndHolidays]); // nach Regions-Laden erneut holen

  // --- UI/Filter ---
  const daysUntil = (dateStr: string) => {
    const d = new Date(dateStr); const t = new Date();
    d.setHours(0, 0, 0, 0); t.setHours(0, 0, 0, 0);
    return Math.ceil((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
  };

  const filteredAndGrouped = useMemo(() => {
    const regionName = availableRegions.find(r => r.code === selectedRegionCode)?.name;
    const filtered = allEvents.filter(e => {
      const matchesRegion = selectedRegionCode === 'all' || e.region === regionName;
const matchesSearch =
        !searchTerm ||
        (e.title ?? '').toLowerCase().includes(searchTerm.toLowerCase()) || // <-- KORRIGIERT
        (e.summary ?? '').toLowerCase().includes(searchTerm.toLowerCase());
      const isUpcoming = daysUntil(e.date) >= 0;
      const matchesDate = viewMode === 'upcoming' ? isUpcoming : !isUpcoming;
      return matchesRegion && matchesSearch && matchesDate;
    });

    filtered.sort((a, b) =>
      viewMode === 'upcoming'
        ? new Date(a.date).getTime() - new Date(b.date).getTime()
        : new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return filtered.reduce<Record<string, EventData[]>>((acc, e) => {
      const key = new Date(e.date).toISOString().slice(0, 10);
      (acc[key] ||= []).push(e);
      return acc;
    }, {});
  }, [allEvents, availableRegions, searchTerm, selectedRegionCode, viewMode]);

  const markEventAsReadInternally = (eventId: string) => {
    setAllEvents(prev => prev.map(e => (e.id === eventId ? { ...e, is_read: true } : e)));
    (async () => {
      try {
        await apiClient.post(`/api/data/scraped-content/${eventId}/mark-as-read`, {});
      } catch (err) {
        console.error('Fehler beim Markieren als gelesen (API):', err);
      }
    })();
  };

  const [shareOpen, setShareOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState('');

  const handleShareSubmit = async () => {
    if (!selectedEvent || !shareEmail) return;
    try {
      const resp = await apiClient.post('/api/data/events/share', {
        title: selectedEvent.title,
        date: selectedEvent.date,
        url: selectedEvent.url,
        summary: selectedEvent.summary,
        recipientEmail: shareEmail,
      });
      console.log('Share OK', resp.data);
      setShareEmail('');
      setShareOpen(false);
    } catch (err) {
      console.error('E-Mail konnte nicht gesendet werden.', err);
    }
  };

  const handleVote = async (vote: 1 | 0 | -1 | null) => {
    if (!selectedEvent || vote === null) return;
    const previousVote = selectedEvent.userVote; const eventId = selectedEvent.id;

    setSelectedEvent(prev => (prev ? { ...prev, userVote: vote } : null));
    setAllEvents(prevEvents => prevEvents.map(e => {
      if (e.id !== eventId) return e;
      let newParticipants = e.participants;
      let newMaybe = e.maybeParticipants || 0;
      if (previousVote === 1) newParticipants--; else if (previousVote === 0) newMaybe--;
      if (vote === 1) newParticipants++; else if (vote === 0) newMaybe++;
      return { ...e, userVote: vote, participants: Math.max(0, newParticipants), maybeParticipants: Math.max(0, newMaybe) };
    }));

    try {
      await apiClient.post(`/api/data/events/${eventId}/vote`, { vote });
    } catch (err) {
      console.error('Fehler bei der Abstimmung:', err);
      // im Fehlerfall am besten erneut laden
      fetchEventsAndHolidays();
    }
  };

  const handleICalExport = () => {
    if (!selectedEvent) return;
    const eventDate = new Date(selectedEvent.date);
    const icsBody = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//YourDashboard//Event//EN', 'BEGIN:VEVENT',
      `UID:${selectedEvent.id}@yourdashboard.com`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}Z`,
      `DTSTART;VALUE=DATE:${eventDate.toISOString().split('T')[0].replace(/-/g, '')}`,
      `SUMMARY:${selectedEvent.title}`,
      `DESCRIPTION:${(selectedEvent.summary || '').replace(/\n/g, '\\n')}${selectedEvent.url ? `\\n\\nQuelle: ${selectedEvent.url}` : ''}`,
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
    const blob = new Blob([icsBody], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${selectedEvent.title.replace(/[^a-z0-9]/gi, '_')}.ics`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };


const handleAddEventSubmit = async () => {
    if (!newEvent.title || !newEvent.event_date) {
      alert('Titel und Datum sind erforderlich.');
      return;
    }
    if (!isValidUrl(newEvent.original_url)) {
      alert('Die eingegebene URL ist ungültig. Bitte verwenden Sie http:// oder https://.');
      return;
    }
    
    try {
      // Sende die Daten an das Backend
      await apiClient.post('/api/admin/scraped-content/events', { 
        ...newEvent, 
        category: category // Stellt sicher, dass die Kategorie des Widgets verwendet wird
      });
      
      setAddModalOpen(false); // Modal schließen
      setNewEvent({ title: '', event_date: '', region: '', summary: '', original_url: 'https://' }); // Formular zurücksetzen
      
      // ENTSCHEIDEND: Lade alle Events (inkl. Feiertage) neu, damit dein neues Event erscheint
      fetchEventsAndHolidays(); 

    } catch (err) {
      console.error('Fehler beim Hinzufügen des Events:', err);
      alert('Event konnte nicht hinzugefügt werden. Prüfe die Backend-Logs.');
    }
  };


  // --- Render ---
  return (
    <WidgetPaper
      title={
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}
          data-widget-type={widgetTypeKey || 'event-calendar'}
        >
          {icon}
          <Typography variant="h6">{title}</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Tooltip title="Neuen Termin hinzufügen">
            <IconButton onClick={() => setAddModalOpen(true)} size="small">
              <AddCircleOutlineIcon color="action" />
            </IconButton>
          </Tooltip>
          {isRemovable && (
            <Tooltip title="Widget entfernen">
              <IconButton onClick={() => onDelete?.(widgetId)} size="small" aria-label="Widget entfernen">
                <CloseIcon color="action" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      }
      loading={loading}
      error={error}
    >
      {!error && (
        <Stack spacing={2} sx={{ p: 2 }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_, v) => v && setViewMode(v)}
              aria-label="Event Zeitfilter"
              size="small"
              fullWidth
            >
              <ToggleButton value="upcoming" aria-label="Anstehende Events">Anstehend</ToggleButton>
              <ToggleButton value="past" aria-label="Vergangene Events">Vergangen</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} onMouseDown={(e) => e.stopPropagation()} alignItems="center">
            <TextField
              fullWidth
              size="small"
              placeholder="Events durchsuchen…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            />
            <FormControl size="small" sx={{ minWidth: 180, width: { xs: '100%', sm: 'auto' } }}>
              <Select
                value={selectedRegionCode}
                onChange={(e: SelectChangeEvent) => setSelectedRegionCode(e.target.value)}
                displayEmpty
                renderValue={(value) => {
                  const region = availableRegions.find((r) => r.code === value);
                  return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Flag code={value === 'all' ? 'EU' : (value as string)} alt={region?.name || 'Alle'} size={16} />
                      <Typography variant="body2" noWrap>
                        {value === 'all' ? 'Alle Regionen' : region?.name}
                      </Typography>
                    </Box>
                  );
                }}
              >
                <MenuItem value="all">
                  <span style={{ marginRight: 8 }}>
                    <Flag code="EU" alt="EU" />
                  </span>
                  Alle Regionen
                </MenuItem>
                {availableRegions.map((region) => (
                  <MenuItem key={region.code} value={region.code}>
                    <span style={{ marginRight: 8 }}>
                      <Flag code={region.code} alt={region.name} />
                    </span>
                    {region.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          {Object.keys(filteredAndGrouped).length === 0 ? (
            <Typography sx={{ textAlign: 'center', p: 3, color: 'text.secondary' }}>
              Keine Events für Ihre Auswahl gefunden.
            </Typography>
          ) : (
            <Box sx={{ maxHeight: { xs: 'none', sm: 350 }, overflowY: { xs: 'visible', sm: 'auto' } }}>
              <List sx={{ p: 0 }}>
                {Object.entries(filteredAndGrouped).map(([dateKey, events]) => (
                  <Box key={dateKey} sx={{ mb: 1 }}>
                    {events.map((e) => {
                      const d = new Date(e.date);
                      const diff = daysUntil(e.date);
                      const isPast = diff < 0;
                      return (
                        <ListItem
                          key={e.id}
                          sx={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 1.5,
                            p: 1.5,
                            cursor: e.type === 'holiday' ? 'default' : 'pointer',
                            '&:hover': { bgcolor: e.type === 'holiday' ? 'transparent' : 'action.hover' },
                            borderRadius: 1,
                            mb: 0.5,
                            opacity: e.is_read ? 0.75 : 1,
                            bgcolor: e.type === 'holiday' ? 'action.selected' : 'transparent',
                          }}
                          onClick={() => {
                            setSelectedEvent(e);
                            if (!e.is_read) markEventAsReadInternally(e.id);
                          }}
                        >
                          <Box sx={{ textAlign: 'center', p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, minWidth: 50 }}>
                            <Typography variant="body2" component="div" sx={{ fontWeight: 'bold', lineHeight: 1.2 }}>
                              {d.toLocaleDateString('de-DE', { day: '2-digit' })}
                            </Typography>
                            <Typography variant="caption" component="div" sx={{ lineHeight: 1 }}>
                              {d.toLocaleDateString('de-DE', { month: 'short' }).toUpperCase()}
                            </Typography>
                          </Box>

                          <Box sx={{ flexGrow: 1 }}>
                            <Typography
                              variant="body1"
                              sx={{ fontWeight: e.is_read ? 'normal' : 'bold', mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}
                            >
                              {e.type === 'holiday' && <CelebrationIcon fontSize="small" color="primary" />} {e.title}
                            </Typography>

                            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                              {e.type !== 'holiday' && <ParticipantsBadges yes={e.participants} maybe={e.maybeParticipants} />}
                              <Typography variant="caption" color="text.secondary">
                                {isPast ? `vor ${Math.abs(diff)} Tagen` : diff === 0 ? 'Heute' : `in ${diff} Tagen`}
                              </Typography>
                              {e.region && (
                                <Tooltip title={e.region}>
                                  <span>
                                    <Flag code={availableRegions.find((r) => r.name === e.region)?.code || 'EU'} size={16} />
                                  </span>
                                </Tooltip>
                              )}
                              {e.type !== 'holiday' && e.is_read && (
                                <Tooltip title="Gelesen">
                                  <CheckCircleOutlineIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                                </Tooltip>
                              )}
                            </Stack>

                            {e.type !== 'holiday' && (e.url || e.full_text) && (
                              <Box sx={{ mt: 0.5 }}>
                                <MuiLink
                                  href={e.url || undefined}
                                  target="_blank"
                                  rel="noopener"
                                  variant="caption"
                                  onClick={(ev) => ev.stopPropagation()}
                                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                                >
                                  {e.full_text || getDomainSafely(e.url)} <OpenInNewIcon sx={{ fontSize: 'inherit' }} />
                                </MuiLink>
                                {e.is_trusted_source && (
                                  <Tooltip title="Info zu geprüften Quellen">
                                    <IconButton
                                      size="small"
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        navigate('/trusted-sources');
                                      }}
                                      sx={{ p: 0, ml: 0.5 }}
                                    >
                                      <VerifiedUserIcon sx={{ fontSize: 14, color: 'success.main' }} />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Box>
                            )}
                          </Box>
                        </ListItem>
                      );
                    })}
                  </Box>
                ))}
              </List>
            </Box>
          )}
        </Stack>
      )}

      {/* Detail-Dialog */}
      <Dialog open={!!selectedEvent} onClose={() => setSelectedEvent(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 5 }}>
          {selectedEvent?.title}
          <IconButton onClick={() => setSelectedEvent(null)} sx={{ position: 'absolute', top: 8, right: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {selectedEvent && (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                {new Date(selectedEvent.date).toLocaleDateString('de-DE')}
              </Typography>
              {selectedEvent.summary && <Typography sx={{ whiteSpace: 'pre-wrap' }}>{selectedEvent.summary}</Typography>}
              {selectedEvent.url && (
                <Button fullWidth size="small" startIcon={<OpenInNewIcon />} href={selectedEvent.url} target="_blank" rel="noopener" variant="outlined">
                  Anmeldung & Infos
                </Button>
              )}
              <Stack direction="row" spacing={1}>
                <Button onClick={() => handleVote(1)} size="small" variant="outlined">Interessiert</Button>
                <Button onClick={() => handleVote(0)} size="small" variant="outlined">Vielleicht</Button>
              </Stack>
              <Button onClick={handleICalExport} size="small">Als iCal speichern</Button>
              <Button onClick={() => setShareOpen(true)} size="small">Per E-Mail teilen</Button>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedEvent(null)}>Schließen</Button>
        </DialogActions>
      </Dialog>

      {/* Share-Dialog */}
      <Dialog open={shareOpen} onClose={() => setShareOpen(false)}>
        <DialogTitle>Event teilen</DialogTitle>
        <DialogContent dividers>
          <TextField
            autoFocus fullWidth size="small" type="email" label="Empfänger-E-Mail"
            value={shareEmail} onChange={(e) => setShareEmail(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShareOpen(false)}>Abbrechen</Button>
          <Button variant="contained" onClick={handleShareSubmit}>Senden</Button>
        </DialogActions>
      </Dialog>

      {/* Add-Dialog (Minimal) */}
      <Dialog open={addModalOpen} onClose={() => setAddModalOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Neuen Termin hinzufügen</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField fullWidth size="small" label="Titel*" value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} />
            <TextField fullWidth size="small" type="date" label="Datum*" value={newEvent.event_date} onChange={(e) => setNewEvent({ ...newEvent, event_date: e.target.value })} InputLabelProps={{ shrink: true }} />
            <TextField fullWidth size="small" label="URL (Optional)" value={newEvent.original_url} onChange={(e) => setNewEvent({ ...newEvent, original_url: e.target.value })} error={!isValidUrl(newEvent.original_url)} helperText={!isValidUrl(newEvent.original_url) ? 'Muss mit http:// oder https:// beginnen' : ''} />
            <TextField select fullWidth size="small" label="Region (Optional)" value={newEvent.region} onChange={(e) => setNewEvent({ ...newEvent, region: e.target.value })}>
              <MenuItem value=""><em>Keine Region</em></MenuItem>
              {allPossibleRegions.map((r) => (<MenuItem key={r.code} value={r.name}>{r.name}</MenuItem>))}
            </TextField>
            <TextField fullWidth size="small" multiline rows={3} label="Kurzbeschreibung (Optional)" value={newEvent.summary} onChange={(e) => setNewEvent({ ...newEvent, summary: e.target.value })} />
          </Stack>
        </DialogContent>
<DialogActions>
          <Button onClick={() => setAddModalOpen(false)}>Abbrechen</Button>
          <Button variant="contained" onClick={handleAddEventSubmit}>Speichern</Button>
        </DialogActions>
      </Dialog>
    </WidgetPaper>
  );
};

export default EventCalendarWidget;
