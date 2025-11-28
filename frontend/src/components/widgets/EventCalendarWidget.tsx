import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, TextField, Tooltip,
  IconButton, Stack, InputAdornment, Button,
  MenuItem, FormControl, Select, SelectChangeEvent, Link as MuiLink,
  Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem,
  ToggleButtonGroup, ToggleButton, Avatar, AvatarGroup, Badge, Divider, Chip
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CelebrationIcon from '@mui/icons-material/Celebration';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CheckIcon from '@mui/icons-material/Check';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../apiClient';

import WidgetPaper from './WidgetPaper';

interface BaseWidgetProps {
  widgetId: string;
  isRemovable: boolean;
  onDelete: (widgetId: string) => void;
}
interface EventCalendarWidgetProps extends BaseWidgetProps {
  icon?: React.ReactNode;
  title: string;
  category?: string;             
  widgetTypeKey?: string;        
}

interface Region { id?: string; name: string; code: string; latitude?: number; longitude?: number; }

// Struktur für einen User im Event
interface Participant {
    id: string;
    first_name: string;
    last_name: string;
    profile_image_url: string | null;
    last_login_at?: string;
}

interface EventData {
  id: string; 
  title: string; 
  date: string; 
  region: string | null; 
  summary: string | null; 
  url: string | null;
  // NEU: Listen statt nur Zahlen
  participants: Participant[]; 
  maybeParticipants: Participant[]; 
  userVote: 1 | 0 | -1 | null;
  full_text: string | null; 
  is_trusted_source: boolean; 
  is_read: boolean; 
  type?: 'event' | 'holiday';
}

// --- HELPER: Status Logik (Identisch zum BP Info Widget) ---
const getUserStatus = (lastLoginDate?: string) => {
    if (!lastLoginDate) return 'offline';
    const loginTime = new Date(lastLoginDate).getTime();
    const now = new Date().getTime();
    const diffMinutes = (now - loginTime) / (1000 * 60);
    
    if (diffMinutes < 15) return 'online';
    if (diffMinutes < 60 * 24) return 'active_today';
    return 'offline';
};

// --- HELPER: Avatar Komponente ---
const MemberAvatar: React.FC<{ member: Participant, size?: number, showStatus?: boolean }> = ({ member, size = 24, showStatus = true }) => {
    const status = getUserStatus(member.last_login_at);
    const invisible = !showStatus || status === 'offline';
    const statusColor = status === 'online' ? '#44b700' : '#ffa726';
    const tooltipText = `${member.first_name} ${member.last_name} (${status === 'online' ? 'Online' : (status === 'active_today' ? 'Heute aktiv' : 'Offline')})`;

    return (
        <Tooltip title={tooltipText}>
            <Badge
                overlap="circular"
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                variant="dot"
                invisible={invisible}
                sx={{
                    '& .MuiBadge-badge': {
                        backgroundColor: statusColor,
                        color: statusColor,
                        boxShadow: `0 0 0 2px white`,
                        width: size / 3.5,
                        height: size / 3.5,
                        minWidth: size / 3.5,
                        '&::after': status === 'online' ? {
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            borderRadius: '50%',
                            animation: 'ripple 1.2s infinite ease-in-out',
                            border: '1px solid currentColor',
                            content: '""',
                        } : {},
                    },
                    '@keyframes ripple': {
                        '0%': { transform: 'scale(.8)', opacity: 1 },
                        '100%': { transform: 'scale(2.4)', opacity: 0 },
                    },
                }}
            >
                <Avatar 
                    src={member.profile_image_url || undefined} 
                    alt={member.first_name}
                    sx={{ width: size, height: size, fontSize: size * 0.5 }}
                >
                    {member.first_name?.charAt(0)}
                </Avatar>
            </Badge>
        </Tooltip>
    );
};

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

// --- NEU: Darstellung der Avatare im Listen-Element ---
const ParticipantsPreview: React.FC<{ yes: Participant[]; maybe: Participant[] }> = ({ yes, maybe }) => {
    if (yes.length === 0 && maybe.length === 0) return null;

    return (
        <Stack direction="row" spacing={1} alignItems="center">
            {yes.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <AvatarGroup max={3} spacing="small" sx={{ '& .MuiAvatar-root': { width: 20, height: 20, fontSize: 10, borderColor: 'background.paper' } }}>
                        {yes.map(p => <MemberAvatar key={p.id} member={p} size={20} showStatus={false} />)}
                    </AvatarGroup>
                </Box>
            )}
            {maybe.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', opacity: 0.7 }}>
                    <AvatarGroup max={2} spacing="small" sx={{ '& .MuiAvatar-root': { width: 20, height: 20, fontSize: 10, borderColor: 'background.paper' } }}>
                        {maybe.map(p => <MemberAvatar key={p.id} member={p} size={20} showStatus={false} />)}
                    </AvatarGroup>
                    <HelpOutlineIcon sx={{ fontSize: 12, ml: 0.5, color: 'text.secondary' }} />
                </Box>
            )}
        </Stack>
    );
};

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
  const [newEvent, setNewEvent] = useState({ title: '', event_date: '', region: '', summary: '', original_url: '' });
  const [viewMode, setViewMode] = useState<'upcoming' | 'past'>('upcoming');

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
        apiClient.get('/api/data/enhanced-calendar-events', { params: { category, limit: 50 } }), // Ggf. Endpoint anpassen
        apiClient.get('/api/data/holidays'),
      ]);

      // Mapping der API-Antwort (angepasst an die neue Backend-Struktur)
      const events: EventData[] = (eventsRes.data?.events || []).map((e: any) => ({
        id: String(e.id),
        title: e.title,
        date: e.date,
        region: e.region ?? null,
        summary: e.summary ?? null,
        url: e.url ?? null,
        // Fallback: Wenn Backend noch alte Struktur liefert (Zahlen), leere Arrays nutzen
        participants: Array.isArray(e.participants_data) ? e.participants_data : [],
        maybeParticipants: Array.isArray(e.maybe_participants_data) ? e.maybe_participants_data : [],
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
        participants: [],
        maybeParticipants: [],
        userVote: null,
        full_text: null,
        is_trusted_source: true,
        is_read: true,
        type: 'holiday',
      }));

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
      setError(err?.response?.data?.message || 'Events konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [category, allPossibleRegions]);

  useEffect(() => { fetchAllRegions(); }, [fetchAllRegions]);
  useEffect(() => { fetchEventsAndHolidays(); }, [fetchEventsAndHolidays]);

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
        (e.title ?? '').toLowerCase().includes(searchTerm.toLowerCase()) || 
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
      await apiClient.post('/api/data/events/share', {
        title: selectedEvent.title,
        date: selectedEvent.date,
        url: selectedEvent.url,
        summary: selectedEvent.summary,
        recipientEmail: shareEmail,
      });
      setShareEmail('');
      setShareOpen(false);
    } catch (err) {
      console.error('E-Mail konnte nicht gesendet werden.', err);
    }
  };

  const handleVote = async (vote: 1 | 0 | -1 | null) => {
    if (!selectedEvent || vote === null) return;
    const eventId = selectedEvent.id;

    // Optimistische UI-Updates sind hier schwierig, da wir das User-Objekt bräuchten.
    // Daher laden wir einfach neu.
    try {
      await apiClient.post(`/api/data/events/${eventId}/vote`, { vote });
      // Nach erfolgreichem Vote neu laden, um die aktualisierte Liste zu bekommen
      fetchEventsAndHolidays();
      // Wir schließen den Dialog nicht, aber wir könnten selectedEvent updaten, wenn wir die Daten hätten.
      // Einfacher Hack: Kurz warten und selectedEvent aktualisieren
      setTimeout(async () => {
          const res = await apiClient.get('/api/data/enhanced-calendar-events', { params: { category, limit: 50 } });
          const updatedEventRaw = (res.data.events || []).find((e: any) => String(e.id) === eventId);
          if (updatedEventRaw) {
              const updatedEvent: EventData = {
                  ...selectedEvent,
                  participants: updatedEventRaw.participants_data || [],
                  maybeParticipants: updatedEventRaw.maybe_participants_data || [],
                  userVote: updatedEventRaw.userVote
              };
              setSelectedEvent(updatedEvent);
          }
      }, 500);

    } catch (err) {
      console.error('Fehler bei der Abstimmung:', err);
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
    try {
      await apiClient.post('/api/admin/scraped-content/events', { 
        ...newEvent, 
        category: category 
      });
      setAddModalOpen(false);
      setNewEvent({ title: '', event_date: '', region: '', summary: '', original_url: '' }); 
      fetchEventsAndHolidays(); 
    } catch (err) {
      console.error(err);
    }
  };

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
        </Box>
      }
      widgetTitle={title}
      widgetTypeKey={widgetTypeKey || 'event-calendar'}
      widgetId={widgetId}
      onDelete={onDelete}
      isRemovable={isRemovable}
      loading={loading}
      error={error}
    >
      {!error && (
        <Stack spacing={2}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_, v) => v && setViewMode(v)}
              aria-label="Event Zeitfilter"
              size="small"
              fullWidth
            >
              <ToggleButton value="upcoming">Anstehend</ToggleButton>
              <ToggleButton value="past">Vergangen</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} onMouseDown={(e) => e.stopPropagation()} alignItems="center">
            <TextField
              fullWidth
              size="small"
              placeholder="Suchen…"
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
                              {/* HIER DIE AVATAR PREVIEW STATT NUR ZAHLEN */}
                              {e.type !== 'holiday' && <ParticipantsPreview yes={e.participants} maybe={e.maybeParticipants} />}
                              
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
            <Stack spacing={3}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Wann?</Typography>
                <Typography variant="body1">
                    {new Date(selectedEvent.date).toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </Typography>
              </Box>
              
              {selectedEvent.summary && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">Infos</Typography>
                    <Typography sx={{ whiteSpace: 'pre-wrap' }}>{selectedEvent.summary}</Typography>
                  </Box>
              )}

              {/* NEU: Teilnehmer-Liste im Dialog */}
              {(selectedEvent.participants.length > 0 || selectedEvent.maybeParticipants.length > 0) && (
                  <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 2 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>Teilnehmer</Typography>
                      {selectedEvent.participants.length > 0 && (
                          <Box sx={{ mb: 1 }}>
                              <Chip label={`${selectedEvent.participants.length} Zusagen`} size="small" color="success" variant="outlined" sx={{ mb: 1 }} />
                              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                  {selectedEvent.participants.map(p => <MemberAvatar key={p.id} member={p} size={32} />)}
                              </Box>
                          </Box>
                      )}
                      {selectedEvent.maybeParticipants.length > 0 && (
                          <Box>
                              <Chip label={`${selectedEvent.maybeParticipants.length} Vielleicht`} size="small" color="warning" variant="outlined" sx={{ mb: 1 }} />
                              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                  {selectedEvent.maybeParticipants.map(p => <MemberAvatar key={p.id} member={p} size={32} />)}
                              </Box>
                          </Box>
                      )}
                  </Box>
              )}

              {selectedEvent.url && (
                <Button fullWidth startIcon={<OpenInNewIcon />} href={selectedEvent.url} target="_blank" rel="noopener" variant="outlined">
                  Anmeldung & Details (Extern)
                </Button>
              )}
              
              <Divider />
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" fontWeight="bold">Deine Antwort:</Typography>
                  <Stack direction="row" spacing={1}>
                    <Button 
                    onClick={() => handleVote(1)} 
                    size="small" 
                    startIcon={<CheckIcon />}
                    variant={selectedEvent?.userVote === 1 ? "contained" : "outlined"}
                    color="success"
                    >
                    Dabei
                    </Button>
                    <Button 
                    onClick={() => handleVote(0)} 
                    size="small" 
                    startIcon={<HelpOutlineIcon />}
                    variant={selectedEvent?.userVote === 0 ? "contained" : "outlined"}
                    color="warning"
                    >
                    Vielleicht
                    </Button>
                </Stack>
              </Box>

              <Stack direction="row" spacing={1} justifyContent="center" sx={{ pt: 1 }}>
                  <Button onClick={handleICalExport} size="small" color="inherit">iCal Export</Button>
                  <Button onClick={() => setShareOpen(true)} size="small" color="inherit">Teilen</Button>
              </Stack>
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

      {/* Add-Dialog */}
      <Dialog open={addModalOpen} onClose={() => setAddModalOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Neuen Termin hinzufügen</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField fullWidth size="small" label="Titel*" value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} />
            <TextField fullWidth size="small" type="date" label="Datum*" value={newEvent.event_date} onChange={(e) => setNewEvent({ ...newEvent, event_date: e.target.value })} InputLabelProps={{ shrink: true }} />
            <TextField fullWidth size="small" label="URL (Optional)" value={newEvent.original_url} onChange={(e) => setNewEvent({ ...newEvent, original_url: e.target.value })} />
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