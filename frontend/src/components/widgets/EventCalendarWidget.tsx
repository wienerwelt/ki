import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, TextField, Tooltip, IconButton, Stack, InputAdornment, Button,
  MenuItem, FormControl, Select, SelectChangeEvent, Link as MuiLink,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Avatar, AvatarGroup, Badge, Chip, useTheme, Paper, alpha
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CloseIcon from '@mui/icons-material/Close';
import CelebrationIcon from '@mui/icons-material/Celebration';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CheckIcon from '@mui/icons-material/Check';
import TimerIcon from '@mui/icons-material/Timer';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EmojiObjectsIcon from '@mui/icons-material/EmojiObjects';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../context/SnackbarContext';
import apiClient from '../../apiClient';
import WidgetPaper from './WidgetPaper';
import { useAuth } from '../../context/AuthContext';

interface BaseWidgetProps {
  widgetId: string;
  isRemovable: boolean;
  onDelete: (widgetId: string) => void;
}

export interface EventCalendarWidgetProps extends Partial<BaseWidgetProps> {
    icon?: React.ReactNode;
    title: string;
    widgetTypeKey: string;
    widgetId: string;
    isPublic?: boolean;
    partnerName?: string;
    category?: string;
    defaultRegion?: string; 
}

interface Region { id?: string; name: string; code: string; }

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
  participants: Participant[]; 
  maybeParticipants: Participant[]; 
  userVote: 1 | 0 | -1 | null;
  full_text: string | null; 
  is_trusted_source: boolean; 
  is_read: boolean; 
  type?: 'event' | 'holiday';
  suggestedBy: Participant | null; 
  category?: string;
  logo_url?: string | null;
}

// --- HELPER: Tage bis zum Event berechnen ---
const getDaysLeft = (dateString: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDate = new Date(dateString);
    eventDate.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Heute';
    if (diffDays === 1) return 'Morgen';
    if (diffDays > 1) return `in ${diffDays} Tagen`;
    if (diffDays === -1) return 'Gestern';
    return `vor ${Math.abs(diffDays)} Tagen`;
};

// --- HELPER: Region zu Flagge ---
const getFlagEmoji = (region?: string) => {
    if (!region) return '';
    const map: Record<string, string> = { 'AT': '🇦🇹', 'DE': '🇩🇪', 'CH': '🇨🇭', 'EU': '🇪🇺', 'INT': '🌍' };
    return map[region.toUpperCase()] || region; 
};

// --- HELPER: Bild URL Generierung ---
const getImageUrl = (url?: string | null) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
    return `${baseUrl}${url.startsWith('/') ? url : `/${url}`}`.replace(/^\/public\//, '/');
};

// --- HELPER: Status Logik ---
const getUserStatus = (lastLoginDate?: string) => {
    if (!lastLoginDate) return 'offline';
    const loginTime = new Date(lastLoginDate).getTime();
    const now = new Date().getTime();
    const diffMinutes = (now - loginTime) / (1000 * 60);
    
    if (diffMinutes < 15) return 'online';
    if (diffMinutes < 60 * 24) return 'active_today';
    return 'offline';
};

// --- HELPER: Dringlichkeits-Farben ---
const getUrgencyColor = (daysLeft: number, theme: any) => {
    if (daysLeft < 0) return theme.palette.text.disabled; 
    if (daysLeft === 0) return theme.palette.primary.main; 
    if (daysLeft < 2) return theme.palette.success.main; 
    if (daysLeft < 5) return theme.palette.warning.main; 
    return theme.palette.text.secondary; 
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
                        backgroundColor: statusColor, color: statusColor, boxShadow: `0 0 0 2px white`,
                        width: size / 3.5, height: size / 3.5, minWidth: size / 3.5,
                        '&::after': status === 'online' ? {
                            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                            borderRadius: '50%', animation: 'ripple 1.2s infinite ease-in-out',
                            border: '1px solid currentColor', content: '""',
                        } : {},
                    },
                    '@keyframes ripple': {
                        '0%': { transform: 'scale(.8)', opacity: 1 },
                        '100%': { transform: 'scale(2.4)', opacity: 0 },
                    },
                }}
            >
                <Avatar src={member.profile_image_url || undefined} alt={member.first_name} sx={{ width: size, height: size, fontSize: size * 0.5 }}>
                    {member.first_name?.charAt(0)}
                </Avatar>
            </Badge>
        </Tooltip>
    );
};

// Optimiertes Flaggen-Dropdown
const Flag: React.FC<{ code?: string; alt?: string; size?: number; showLabel?: boolean }> = ({ code, alt, size = 20, showLabel = false }) => {
  if (!code) return null;
  const c = code.toUpperCase();
  if (c === 'EU' || c === 'ALL') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <svg width={size} height={(size * 2) / 3} viewBox="0 0 12 8" xmlns="http://www.w3.org/2000/svg" aria-label={alt || 'EU'} style={{ borderRadius: '2px' }}>
          <rect width="12" height="8" fill="#003399" />
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * 30 * Math.PI) / 180;
            const cx = 6 + Math.cos(angle) * 2.2;
            const cy = 4 + Math.sin(angle) * 2.2;
            return (
              <g key={i} transform={`translate(${cx},${cy})`}>
                <polygon points="0,-0.6 0.17,-0.1 0.6,-0.1 0.26,0.16 0.39,0.6 0,0.35 -0.39,0.6 -0.26,0.16 -0.6,-0.1 -0.17,-0.1" fill="#FFCC00" />
              </g>
            );
          })}
        </svg>
        {showLabel && <Typography variant="body2" sx={{ fontWeight: 500 }}>Alle Regionen</Typography>}
      </Box>
    );
  }
  return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <img loading="lazy" width={size} src={`https://flagcdn.com/w40/${c.toLowerCase()}.png`} alt={alt || c} style={{ borderRadius: '2px' }} />
          {showLabel && <Typography variant="body2" sx={{ fontWeight: 500 }}>{alt || c}</Typography>}
      </Box>
  );
};

const getDomainSafely = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url.split('/')[0] ?? null; }
};

// --- Darstellung der Avatare im Listen-Element ---
const ParticipantsPreview: React.FC<{ yes: Participant[]; maybe: Participant[] }> = ({ yes, maybe }) => {
    if (yes.length === 0 && maybe.length === 0) return null;

    return (
        <Stack direction="row" spacing={1} alignItems="center">
            {yes.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <AvatarGroup max={3} spacing="small" sx={{ '& .MuiAvatar-root': { width: 22, height: 22, fontSize: 10, borderColor: 'background.paper' } }}>
                        {yes.map(p => <MemberAvatar key={p.id} member={p} size={22} showStatus={false} />)}
                    </AvatarGroup>
                </Box>
            )}
            {maybe.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', opacity: 0.7 }}>
                    <AvatarGroup max={2} spacing="small" sx={{ '& .MuiAvatar-root': { width: 20, height: 20, fontSize: 10, borderColor: 'background.paper', ml: -1 } }}>
                        {maybe.map(p => <MemberAvatar key={p.id} member={p} size={20} showStatus={false} />)}
                    </AvatarGroup>
                    <HelpOutlineIcon sx={{ fontSize: 14, ml: 0.5, color: 'text.secondary' }} />
                </Box>
            )}
        </Stack>
    );
};

const EventCalendarWidget: React.FC<EventCalendarWidgetProps> = ({
  onDelete, widgetId, isRemovable, icon, title, category, widgetTypeKey, isPublic = false, partnerName, defaultRegion = 'all'
}) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { showSnackbar } = useSnackbar(); 
  const { user, businessPartner } = useAuth();

  const [allEvents, setAllEvents] = useState<EventData[]>([]);
  const [availableRegions, setAvailableRegions] = useState<Region[]>([]);
  const [allPossibleRegions, setAllPossibleRegions] = useState<Region[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedRegionCode, setSelectedRegionCode] = useState<string>(defaultRegion);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [newEvent, setNewEvent] = useState({ title: '', event_date: '', region: '', summary: '', original_url: '' });

  const fetchAllRegions = useCallback(async () => {
    try {
      const endpoint = isPublic ? '/api/public/regions' : '/api/data/regions';
      const res = await apiClient.get(endpoint);
      const list = Array.isArray(res.data) ? res.data : [];
      setAllPossibleRegions(list);
    } catch (err) {
      setAllPossibleRegions([]);
    }
  }, [isPublic]);

  const fetchEventsAndHolidays = useCallback(async () => {
    let queryCategories = category || 'events';

    if (user?.business_partner_category && !isPublic) {
        const bpIndustryCat = user.business_partner_category.endsWith('_events') 
            ? user.business_partner_category 
            : `${user.business_partner_category}_events`;
        
        if (!queryCategories.includes(bpIndustryCat)) {
            queryCategories += `,${bpIndustryCat}`;
        }
    }

    if (!queryCategories || queryCategories.trim().length === 0) {
      setError('Keine Kategorie im Widget-Typ konfiguriert.');
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const [eventsRes, holidaysRes] = await Promise.all([
        apiClient.get(isPublic ? '/api/public/enhanced-calendar-events' : '/api/data/enhanced-calendar-events', { 
            params: { category: queryCategories, limit: 50 } 
        }), 
        apiClient.get(isPublic ? '/api/public/holidays' : '/api/data/holidays'),
      ]);

      const events: EventData[] = (eventsRes.data?.events || []).map((e: any) => ({
        id: String(e.id), title: e.title, date: e.date, region: e.region ?? null, summary: e.summary ?? null,
        url: e.url ?? null, participants: Array.isArray(e.participants_data) ? e.participants_data : [],
        maybeParticipants: Array.isArray(e.maybe_participants_data) ? e.maybe_participants_data : [],
        userVote: (e.userVote ?? null) as 1 | 0 | -1 | null, full_text: e.full_text ?? null,
        is_trusted_source: !!e.is_trusted_source, is_read: !!e.is_read, type: 'event',
        suggestedBy: e.suggested_by_data || null, category: e.category, logo_url: e.logo_url ?? null
      }));

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const holidays: EventData[] = (holidaysRes.data || [])
        .filter((h: any) => new Date(h.date) >= today) 
        .map((h: any) => ({
          id: String(h.id || h.date + h.countryCode), title: h.localName || h.title, date: h.date, region: h.countryCode ?? null, summary: h.summary ?? null,
          url: null, participants: [], maybeParticipants: [], userVote: null, full_text: null,
          is_trusted_source: true, is_read: true, type: 'holiday', suggestedBy: null, logo_url: null
        }));

      const eventRegions: Region[] = Array.isArray(eventsRes.data?.availableRegions) ? eventsRes.data.availableRegions : [];
      const holidayRegionNames = Array.from(new Set(holidays.map(h => h.region).filter(Boolean) as string[]));
      const holidayRegionObjects = allPossibleRegions.filter(r => holidayRegionNames.includes(r.code)); 

      const combined = [...eventRegions, ...holidayRegionObjects];
      const uniqueRegions = Array.from(new Map(combined.map(r => [r.code, r])).values()).sort((a, b) => a.name.localeCompare(b.name));

      setAvailableRegions(uniqueRegions);
      setAllEvents([...events, ...holidays]);
    } catch (err: any) {
      setAllEvents([]);
      setAvailableRegions([]);
      setError(err?.response?.data?.message || 'Events konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [category, allPossibleRegions, isPublic, user?.business_partner_category]);

  useEffect(() => { fetchAllRegions(); }, [fetchAllRegions]);
  useEffect(() => { fetchEventsAndHolidays(); }, [fetchEventsAndHolidays]);

  const daysUntil = (dateStr: string) => {
    const d = new Date(dateStr); const t = new Date();
    d.setHours(0, 0, 0, 0); t.setHours(0, 0, 0, 0);
    return Math.ceil((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
  };

  const filteredAndGrouped = useMemo(() => {
    const activeRegionObj = availableRegions.find(r => r.code === selectedRegionCode);
    
    const filtered = allEvents.filter(e => {
      let matchesRegion = false;
      if (selectedRegionCode === 'all') {
          matchesRegion = true;
      } else if (e.region) {
          const eRegLower = e.region.toLowerCase();
          const matchesRegionByCode = eRegLower === selectedRegionCode.toLowerCase();
          const matchesRegionByName = activeRegionObj ? eRegLower === activeRegionObj.name.toLowerCase() : false;
          matchesRegion = matchesRegionByCode || matchesRegionByName;
      }

      const matchesSearch = !searchTerm || (e.title ?? '').toLowerCase().includes(searchTerm.toLowerCase()) || (e.summary ?? '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchesRegion && matchesSearch;
    });

    filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return filtered.reduce<Record<string, EventData[]>>((acc, e) => {
      const key = new Date(e.date).toISOString().slice(0, 10);
      (acc[key] ||= []).push(e);
      return acc;
    }, {});
  }, [allEvents, availableRegions, searchTerm, selectedRegionCode]);

  const markEventAsReadInternally = (eventId: string) => {
    setAllEvents(prev => prev.map(e => (e.id === eventId ? { ...e, is_read: true } : e)));
    if (isPublic) return; 
    (async () => {
      try { await apiClient.post(`/api/data/scraped-content/${eventId}/mark-as-read`, {}); } catch (err) {}
    })();
  };

  const handleShareSubmit = async () => {
    if (isPublic) return showSnackbar('Bitte loggen Sie sich ein, um Events zu teilen.', 'info');
    if (!selectedEvent || !shareEmail) return;
    try {
      await apiClient.post('/api/data/events/share', {
        title: selectedEvent.title, date: selectedEvent.date, url: selectedEvent.url,
        summary: selectedEvent.summary, recipientEmail: shareEmail,
      });
      setShareEmail('');
      setShareOpen(false);
      showSnackbar('Event erfolgreich geteilt.', 'success');
    } catch (err) { console.error('E-Mail konnte nicht gesendet werden.', err); }
  };

  const handleVote = async (eventId: string, vote: number) => {
    if (isPublic) return showSnackbar('Bitte melden Sie sich an, um an Events teilzunehmen.', 'info');
    
    try {
      await apiClient.post(`/api/data/events/${eventId}/vote`, { vote });
      fetchEventsAndHolidays();
      
      setTimeout(async () => {
          const res = await apiClient.get('/api/data/enhanced-calendar-events', { params: { category, limit: 50 } });
          const updatedEventRaw = (res.data.events || []).find((e: any) => String(e.id) === eventId);
          if (updatedEventRaw && selectedEvent?.id === eventId) {
              setSelectedEvent({
                  ...selectedEvent,
                  participants: updatedEventRaw.participants_data || [],
                  maybeParticipants: updatedEventRaw.maybe_participants_data || [],
                  userVote: updatedEventRaw.userVote
              });
          }
      }, 500);

    } catch (err) { console.error('Fehler bei der Abstimmung:', err); }
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
    if (isPublic) {
        showSnackbar('Bitte loggen Sie sich ein, um Events vorzuschlagen.', 'info');
        setAddModalOpen(false);
        return;
    }
    if (!newEvent.title || !newEvent.event_date) {
      alert('Titel und Datum sind erforderlich.');
      return;
    }

    let rawCategory = user?.business_partner_category || category || 'events';
    let baseCategory = rawCategory.split(',')[0].trim();
    const eventCategory = baseCategory.endsWith('_events') ? baseCategory : `${baseCategory}_events`;

    try {
      await apiClient.post('/api/admin/scraped-content/events', { 
          ...newEvent, 
          category: eventCategory,
          businessPartnerId: user?.business_partner_id 
      });
      setAddModalOpen(false);
      setNewEvent({ title: '', event_date: '', region: '', summary: '', original_url: '' }); 
      fetchEventsAndHolidays(); 
      showSnackbar('Terminvorschlag erfolgreich gesendet.', 'success');
    } catch (err) { console.error(err); }
  };

  return (
    <WidgetPaper
      title={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }} data-widget-type={widgetTypeKey || 'event-calendar'}>
          {icon || <CalendarMonthIcon color="primary" />}
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{title}</Typography>
        </Box>
      }
      widgetTitle={title}
      widgetTypeKey={widgetTypeKey || 'event-calendar'}
      widgetId={widgetId || 'default'}
      onDelete={onDelete || (() => {})}
      isRemovable={!!isRemovable}
      loading={loading}
      error={error}
      noPadding
      isPublic={isPublic} 
    >
      {!error && (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          
          {/* OPTIMIERTE TOOLBAR: Alles in einer kompakten Zeile auch auf Mobile */}
          <Box sx={{ px: { xs: 2, sm: 3 }, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: theme.palette.mode === 'dark' ? 'transparent' : '#f8fafc' }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                
                <FormControl size="small" sx={{ minWidth: 60, width: 'auto', flexShrink: 0 }}>
                    <Select
                        value={selectedRegionCode}
                        onChange={(e: SelectChangeEvent) => setSelectedRegionCode(e.target.value)}
                        displayEmpty
                        IconComponent={() => null}
                        sx={{ 
                            bgcolor: 'background.paper', 
                            borderRadius: 2, 
                            '& .MuiSelect-select': { 
                                py: 1, 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                pr: '0 !important' 
                            } 
                        }}
                        renderValue={(value) => (
                            <Flag code={value === 'all' ? 'EU' : (value as string)} size={20} showLabel={false} />
                        )}
                    >
                        <MenuItem value="all">
                            <Flag code="EU" alt="Alle Regionen" showLabel={true} />
                        </MenuItem>
                        {availableRegions.map((region) => (
                            <MenuItem key={region.code} value={region.code}>
                                <Flag code={region.code} alt={region.name} showLabel={true} />
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <TextField
                    fullWidth size="small" placeholder="Suchen…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: 'text.disabled' }} /></InputAdornment>, sx: { bgcolor: 'background.paper', borderRadius: 2 } }}
                    sx={{ flexGrow: 1 }}
                />

                {!isPublic && (
                    <Tooltip title="Termin vorschlagen">
                        <IconButton onClick={() => setAddModalOpen(true)} size="small" sx={{ flexShrink: 0, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1, '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.1), borderColor: 'primary.main' } }}>
                            <AddCircleOutlineIcon color="primary" fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Stack>
          </Box>

          {/* LISTEN-ANSICHT */}
          {Object.keys(filteredAndGrouped).length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6, px: 2, m: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 3, opacity: 0.8 }}>
              <CalendarMonthIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body1" color="text.secondary" gutterBottom sx={{ fontWeight: 600 }}>Keine anstehenden Termine</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Kennen Sie ein Event, das hier fehlt?</Typography>
              <Button variant="outlined" color="primary" size="small" startIcon={<AddCircleOutlineIcon />} onClick={() => {
                  if(isPublic) return showSnackbar('Bitte loggen Sie sich ein.', 'info');
                  setAddModalOpen(true);
              }}>Termin vorschlagen</Button>
            </Box>
          ) : (
            <Box sx={{ 
                flexGrow: 1, 
                height: isPublic ? '400px' : 'auto', 
                maxHeight: isPublic ? '400px' : 'none', 
                overflowY: isPublic ? 'auto' : 'visible', 
                p: 2, 
                bgcolor: alpha(theme.palette.action.hover, 0.05),
                '&::-webkit-scrollbar': { width: '6px' },
                '&::-webkit-scrollbar-thumb': { backgroundColor: alpha(theme.palette.text.secondary, 0.2), borderRadius: '10px' }
            }}>
                {Object.entries(filteredAndGrouped).map(([dateKey, events]) => (
                  <Box key={dateKey} sx={{ mb: 2 }}>
                    {events.map((e) => {
                      const d = new Date(e.date);
                      const diffDays = daysUntil(e.date);
                      const isHoliday = e.type === 'holiday';
                      
                      const urgencyColor = getUrgencyColor(diffDays, theme);
                      const hasUrgencyGlow = diffDays >= 0 && diffDays < 5;

                      const isPartnerEvent = e.category === 'businesspartner_events';
                      const badgeText = businessPartner?.name 
                        ? `${businessPartner.name} Event` 
                        : (partnerName ? `${partnerName} Event` : 'Exklusives Event');

                      return (
                        <Paper
                          key={e.id} elevation={0}
                          sx={{
                            display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, mb: 1.5, cursor: isHoliday ? 'default' : 'pointer', borderRadius: 3,
                            border: '1px solid', borderColor: hasUrgencyGlow ? urgencyColor : 'divider',
                            bgcolor: isHoliday ? alpha(theme.palette.secondary.main, 0.03) : 'background.paper',
                            transition: 'all 0.2s ease', opacity: e.is_read ? 0.8 : 1,
                            position: 'relative',
                            '&:hover': { transform: !isHoliday ? 'translateY(-2px)' : 'none', boxShadow: !isHoliday ? theme.shadows[2] : 'none', borderColor: !isHoliday ? 'primary.main' : 'divider' },
                          }}
                          onClick={() => {
                            if (isHoliday) return;
                            setSelectedEvent(e);
                            if (!e.is_read) markEventAsReadInternally(e.id);
                          }}
                        >
                          <Box sx={{ textAlign: 'center', p: 0.5, border: '1px solid', borderColor: urgencyColor, bgcolor: alpha(urgencyColor, 0.05), borderRadius: 2, minWidth: 55 }}>
                            <Typography variant="body2" component="div" sx={{ fontWeight: 800, lineHeight: 1.2, color: urgencyColor }}>
                              {d.toLocaleDateString('de-DE', { day: '2-digit' })}
                            </Typography>
                            <Typography variant="caption" component="div" sx={{ lineHeight: 1, color: urgencyColor, opacity: 0.8, fontWeight: 'bold' }}>
                              {d.toLocaleDateString('de-DE', { month: 'short' }).toUpperCase()}
                            </Typography>
                          </Box>

                          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            {isPartnerEvent && (
                                <Chip 
                                    label={badgeText} 
                                    size="small" 
                                    color="primary" 
                                    sx={{ height: 20, fontSize: '0.7rem', mb: 0.5, fontWeight: 'bold' }} 
                                />
                            )}

                            {e.suggestedBy && !isPartnerEvent && (
                                <Chip 
                                    icon={<EmojiObjectsIcon sx={{ fontSize: '12px !important' }}/>} 
                                    label="Community-Tipp" 
                                    size="small" 
                                    sx={{ height: 18, fontSize: '0.65rem', mb: 0.5, bgcolor: alpha(theme.palette.info.main, 0.1), color: 'info.main', fontWeight: 'bold' }} 
                                />
                            )}
                            
                            <Typography variant="body1" noWrap sx={{ fontWeight: e.is_read ? 500 : 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.primary' }}>
                              {isHoliday && <CelebrationIcon fontSize="small" color="secondary" />} 
                              {e.title}
                            </Typography>

                            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                              {e.type !== 'holiday' && <ParticipantsPreview yes={e.participants} maybe={e.maybeParticipants} />}
                              
                              <Typography variant="caption" sx={{ fontWeight: 600, color: hasUrgencyGlow ? urgencyColor : 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                {hasUrgencyGlow && <TimerIcon sx={{ fontSize: 12 }} />}
                                {diffDays === 0 ? 'Heute' : diffDays === 1 ? 'Morgen' : `In ${diffDays} Tagen`}
                              </Typography>
                              
                              {e.region && (
                                <Tooltip title={e.region}>
                                  <Box component="span" sx={{ display: 'flex', alignItems: 'center' }}><Flag code={availableRegions.find((r) => r.name === e.region || r.code === e.region)?.code || 'EU'} size={16} /></Box>
                                </Tooltip>
                              )}
                              
                            </Stack>

                            {e.type !== 'holiday' && (e.url || e.full_text) && (
                              <Box sx={{ mt: 0.5 }}>
                                <MuiLink
                                  href={e.url || undefined} target="_blank" rel="noopener" variant="caption" onClick={(ev) => ev.stopPropagation()}
                                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', '&:hover': { color: 'primary.main' }, wordBreak: 'break-all' }}
                                >
                                  {e.full_text || getDomainSafely(e.url)} <OpenInNewIcon sx={{ fontSize: 12 }} />
                                </MuiLink>
                                {e.is_trusted_source && (
                                  <Tooltip title="Geprüfte Quelle">
                                    <IconButton size="small" onClick={(ev) => { ev.stopPropagation(); navigate('/trusted-sources'); }} sx={{ p: 0, ml: 0.5 }}>
                                      <VerifiedUserIcon sx={{ fontSize: 14, color: 'success.main' }} />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Box>
                            )}
                          </Box>
                          
                          {!isHoliday && (
                            <IconButton 
                                size="small" 
                                onClick={(ev) => { ev.stopPropagation(); handleVote(e.id, e.userVote === 1 ? -1 : 1); }}
                                sx={{ color: e.userVote === 1 ? 'success.main' : 'text.disabled', flexShrink: 0 }}
                            >
                                <CheckCircleOutlineIcon />
                            </IconButton>
                          )}
                        </Paper>
                      );
                    })}
                  </Box>
                ))}
            </Box>
          )}
        </Box>
      )}

      {/* --- Detail-Dialog --- */}
      <Dialog open={!!selectedEvent} onClose={() => setSelectedEvent(null)} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ pr: 5, pb: 1, pt: 3 }}>
            <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: 1 }}>Event Details</Typography>
            
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mt: 0.5, pr: 2 }}>
                {selectedEvent?.logo_url && (
                    <Box 
                        component="img" 
                        src={getImageUrl(selectedEvent.logo_url)} 
                        alt="Source Logo" 
                        sx={{ height: 40, width: 40, objectFit: 'contain', borderRadius: 1, p: 0.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0 }} 
                    />
                )}
                {/* FIX: wordBreak: break-word hinzugefügt für lange Event-Titel */}
                <Typography variant="h5" sx={{ fontWeight: 800, wordBreak: 'break-word', fontSize: { xs: '1.25rem', sm: '1.5rem' }, lineHeight: 1.3 }}>
                    {selectedEvent?.title} 
                    {selectedEvent?.region && (
                        <span style={{ marginLeft: '8px', fontSize: '1.2rem' }} title={`Region: ${selectedEvent.region}`}>
                            {getFlagEmoji(selectedEvent.region)}
                        </span>
                    )}
                </Typography>
            </Box>

            <IconButton onClick={() => setSelectedEvent(null)} sx={{ position: 'absolute', top: 16, right: 16, bgcolor: 'action.hover' }}><CloseIcon /></IconButton>
        </DialogTitle>
        
        <DialogContent dividers sx={{ p: { xs: 2, sm: 3 } }}>
          {selectedEvent && (
            <Stack spacing={3}>
              <Box sx={{ p: 2, bgcolor: alpha(theme.palette.primary.main, 0.05), borderRadius: 2, border: '1px solid', borderColor: alpha(theme.palette.primary.main, 0.1), display: 'flex', alignItems: 'center', gap: 2 }}>
                  <CalendarMonthIcon color="primary" />
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">Wann?</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                        <Typography variant="body1" fontWeight="bold">
                            {new Date(selectedEvent.date).toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </Typography>
                        <Chip 
                            size="small" 
                            label={getDaysLeft(selectedEvent.date)} 
                            color={getDaysLeft(selectedEvent.date).includes('vor') ? 'default' : 'primary'} 
                            variant={getDaysLeft(selectedEvent.date) === 'Heute' ? 'filled' : 'outlined'}
                            sx={{ fontWeight: 'bold', height: 20 }}
                        />
                    </Box>
                  </Box>
              </Box>
              
              {selectedEvent.summary && (
                  <Box>
                    <Typography variant="subtitle2" gutterBottom fontWeight="bold">Infos</Typography>
                    {/* FIX: wordBreak hinzugefügt, damit lange Event-Beschreibungen nicht aus dem Dialog laufen */}
                    <Typography sx={{ whiteSpace: 'pre-wrap', color: 'text.secondary', lineHeight: 1.6, wordBreak: 'break-word' }}>{selectedEvent.summary}</Typography>
                  </Box>
              )}

              {selectedEvent.suggestedBy && (
                  <Box>
                      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                        Vorgeschlagen von
                      </Typography>
                      <Chip 
                          avatar={<Avatar src={selectedEvent.suggestedBy.profile_image_url || undefined} />} 
                          label={`${selectedEvent.suggestedBy.first_name} ${selectedEvent.suggestedBy.last_name}`} 
                          onClick={() => { if (!isPublic && selectedEvent.suggestedBy) navigate(`/profile/${selectedEvent.suggestedBy.id}`); }}
                          variant="outlined" 
                          sx={{ cursor: isPublic ? 'default' : 'pointer', '&:hover': { bgcolor: isPublic ? 'transparent' : 'action.hover' } }} 
                      />
                  </Box>
              )}

              {(selectedEvent.participants.length > 0 || selectedEvent.maybeParticipants.length > 0) && (
                  <Box>
                      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>Community-Teilnehmer</Typography>
                      {selectedEvent.participants.length > 0 && (
                          <Box sx={{ mb: 2 }}>
                              <Chip label={`${selectedEvent.participants.length} Zusagen`} size="small" color="success" variant="outlined" sx={{ mb: 1 }} />
                              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                  {selectedEvent.participants.map(p => (
                                      <Chip 
                                        key={p.id} avatar={<Avatar src={p.profile_image_url || undefined} />} label={p.first_name} 
                                        onClick={() => { if(!isPublic) navigate(`/profile/${p.id}`); }}
                                        variant="outlined" sx={{ cursor: isPublic ? 'default' : 'pointer', '&:hover': { bgcolor: isPublic ? 'transparent' : 'action.hover' } }} 
                                      />
                                  ))}
                              </Box>
                          </Box>
                      )}
                      {selectedEvent.maybeParticipants.length > 0 && (
                          <Box>
                              <Chip label={`${selectedEvent.maybeParticipants.length} Vielleicht`} size="small" color="warning" variant="outlined" sx={{ mb: 1 }} />
                              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                  {selectedEvent.maybeParticipants.map(p => (
                                      <Chip 
                                        key={p.id} avatar={<Avatar src={p.profile_image_url || undefined} />} label={p.first_name} 
                                        onClick={() => { if(!isPublic) navigate(`/profile/${p.id}`); }}
                                        variant="outlined" sx={{ cursor: isPublic ? 'default' : 'pointer', opacity: 0.8, '&:hover': { opacity: 1, bgcolor: isPublic ? 'transparent' : 'action.hover' } }} 
                                      />
                                  ))}
                              </Box>
                          </Box>
                      )}
                  </Box>
              )}

              {selectedEvent.url && (
                  <Box sx={{ mt: 2 }}>
                      {selectedEvent.is_trusted_source && (
                          <Paper elevation={0} sx={{ p: 2, mb: 2, bgcolor: alpha(theme.palette.success.main, 0.1), border: '1px solid', borderColor: alpha(theme.palette.success.main, 0.3), borderRadius: 2 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                  <CheckCircleIcon color="success" fontSize="small" />
                                  <Typography variant="subtitle2" color="success.main" fontWeight="bold">
                                      Geprüfte Quelle
                                  </Typography>
                              </Box>
                              <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                                  Webseite: <MuiLink href={selectedEvent.url} target="_blank" rel="noopener noreferrer" color="inherit" underline="hover">
                                      {(() => {
                                          try { return new URL(selectedEvent.url).hostname; } 
                                          catch { return selectedEvent.url; }
                                      })()}
                                  </MuiLink>
                              </Typography>
                          </Paper>
                      )}

                      <Button fullWidth startIcon={<OpenInNewIcon />} href={selectedEvent.url} target="_blank" rel="noopener" variant="outlined" sx={{ borderRadius: 2, whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.2, py: 1 }}>
                        Anmeldung & Details (Extern)
                      </Button>
                  </Box>
              )}
            </Stack>
          )}
</DialogContent>
        <DialogActions sx={{ 
            p: 3, 
            pt: 2, 
            flexDirection: 'column', 
            gap: 2, 
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#f8fafc' 
        }}>
            {/* FIX: Erlaubt das Umbrechen der Buttons in die nächste Zeile bei Platzmangel */}
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, width: '100%', gap: 1 }}>
                <Typography variant="body2" fontWeight="bold">Deine Antwort:</Typography>
                <Stack direction="row" spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                <Button 
                    onClick={() => handleVote(selectedEvent?.id || '', 1)} 
                    size="small" startIcon={<CheckIcon />} color="success"
                    variant={selectedEvent?.userVote === 1 ? "contained" : "outlined"}
                    sx={{ borderRadius: 5, px: 2, flex: { xs: 1, sm: 'none' } }}
                >Dabei</Button>
                <Button 
                    onClick={() => handleVote(selectedEvent?.id || '', 0)} 
                    size="small" startIcon={<HelpOutlineIcon />} color="warning"
                    variant={selectedEvent?.userVote === 0 ? "contained" : "outlined"}
                    sx={{ borderRadius: 5, px: 2, flex: { xs: 1, sm: 'none' } }}
                >Vielleicht</Button>
            </Stack>
            </Box>

            <Stack direction="row" spacing={1} justifyContent="center" sx={{ width: '100%', pt: 1 }}>
                <Button onClick={handleICalExport} size="small" variant="text" sx={{ color: 'text.secondary' }}>iCal Export</Button>
                <Button onClick={() => { if(isPublic) return showSnackbar('Bitte einloggen.', 'info'); setShareOpen(true); }} size="small" variant="text" sx={{ color: 'text.secondary' }}>Teilen</Button>
            </Stack>
        </DialogActions>
      </Dialog>

      {/* Share-Dialog */}
      <Dialog open={shareOpen} onClose={() => setShareOpen(false)} PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>Event teilen</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Senden Sie die Event-Details an einen Kollegen.</Typography>
          <TextField autoFocus fullWidth size="small" type="email" label="Empfänger-E-Mail" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setShareOpen(false)}>Abbrechen</Button>
          <Button variant="contained" onClick={handleShareSubmit} sx={{ borderRadius: 2 }}>Senden</Button>
        </DialogActions>
      </Dialog>

      {/* Add-Dialog */}
      <Dialog open={addModalOpen} onClose={() => setAddModalOpen(false)} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>Neuen Termin vorschlagen</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField fullWidth size="small" label="Titel*" value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} />
            <TextField fullWidth size="small" type="date" label="Datum*" value={newEvent.event_date} onChange={(e) => setNewEvent({ ...newEvent, event_date: e.target.value })} InputLabelProps={{ shrink: true }} />
            <TextField fullWidth size="small" label="URL (Optional)" value={newEvent.original_url} onChange={(e) => setNewEvent({ ...newEvent, original_url: e.target.value })} placeholder="https://..." />
            
            <FormControl fullWidth size="small">
                <Typography variant="caption" sx={{ mb: 0.5, ml: 1, fontWeight: 'bold' }}>Region</Typography>
                <Select value={newEvent.region} onChange={(e) => setNewEvent({ ...newEvent, region: e.target.value })}>
                    <MenuItem value=""><em>Keine spezifische Region</em></MenuItem>
                    {allPossibleRegions.map((r) => (<MenuItem key={r.code} value={r.name}>{r.name}</MenuItem>))}
                </Select>
            </FormControl>
            
            <TextField fullWidth size="small" multiline rows={3} label="Kurzbeschreibung (Optional)" value={newEvent.summary} onChange={(e) => setNewEvent({ ...newEvent, summary: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setAddModalOpen(false)}>Abbrechen</Button>
          <Button variant="contained" onClick={handleAddEventSubmit} sx={{ borderRadius: 2 }}>Speichern</Button>
        </DialogActions>
      </Dialog>
    </WidgetPaper>
  );
};

export default EventCalendarWidget;