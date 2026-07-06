// frontend/src/components/widgets/EventCalendarWidget.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EmojiObjectsIcon from '@mui/icons-material/EmojiObjects';
import CampaignIcon from '@mui/icons-material/Campaign';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';

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
    primaryColor?: string; // NEU: Für nahtlose Farb-Übergabe aus dem Public Portal
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
  type?: 'event' | 'holiday' | 'action'; 
  suggestedBy: Participant | null; 
  category?: string;
  logo_url?: string | null;
  isPartnerAction?: boolean; 
}

// --- HELPER ---
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

const getFlagEmoji = (region?: string) => {
    if (!region) return '';
    const map: Record<string, string> = { 'AT': '🇦🇹', 'DE': '🇩🇪', 'CH': '🇨🇭', 'EU': '🇪🇺', 'INT': '🌍' };
    return map[region.toUpperCase()] || region; 
};

const getImageUrl = (url?: string | null) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
    return `${baseUrl}${url.startsWith('/') ? url : `/${url}`}`.replace(/^\/public\//, '/');
};

const getUserStatus = (lastLoginDate?: string) => {
    if (!lastLoginDate) return 'offline';
    const loginTime = new Date(lastLoginDate).getTime();
    const now = new Date().getTime();
    const diffMinutes = (now - loginTime) / (1000 * 60);
    if (diffMinutes < 15) return 'online';
    if (diffMinutes < 60 * 24) return 'active_today';
    return 'offline';
};

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
  onDelete, widgetId, isRemovable, icon, title, category, widgetTypeKey, isPublic = false, partnerName, defaultRegion = 'all', primaryColor
}) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { showSnackbar } = useSnackbar(); 
  const { user, businessPartner } = useAuth();

  // Globale Custom Primary Color (Fallback auf Standard MUI Primary)
  const customPrimary = primaryColor || theme.palette.primary.main;

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

  const eventListRef = useRef<HTMLDivElement | null>(null);
  const [hasListOverflow, setHasListOverflow] = useState(false);
  const [isListAtEnd, setIsListAtEnd] = useState(false);

  const updateListScrollState = useCallback(() => {
    const el = eventListRef.current;
    if (!el) {
      setHasListOverflow(false);
      setIsListAtEnd(false);
      return;
    }

    const hasOverflow = el.scrollHeight > el.clientHeight + 4;
    const atEnd = !hasOverflow || el.scrollTop + el.clientHeight >= el.scrollHeight - 8;

    setHasListOverflow(hasOverflow);
    setIsListAtEnd(atEnd);
  }, []);

  const handleListJump = useCallback(() => {
    const el = eventListRef.current;
    if (!el) return;

    el.scrollTo({
      top: isListAtEnd ? 0 : el.scrollHeight,
      behavior: 'smooth',
    });
  }, [isListAtEnd]);

  const handleOpenCommunityProfile = useCallback((member?: Participant | null) => {
    if (isPublic || !member?.id) return;

    setSelectedEvent(null);
    navigate(`/community?profileUserId=${encodeURIComponent(member.id)}`, {
      state: {
        profileUserId: member.id,
        openProfileUserId: member.id,
        openProfile: true,
        source: 'event-calendar-widget',
      },
    });
  }, [isPublic, navigate]);

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
      const [eventsRes, holidaysRes, actionsRes] = await Promise.all([
        apiClient.get(isPublic ? '/api/public/enhanced-calendar-events' : '/api/data/enhanced-calendar-events', { 
            params: { category: queryCategories, limit: 50 } 
        }), 
        apiClient.get(isPublic ? '/api/public/holidays' : '/api/data/holidays'),
        apiClient.get(isPublic ? '/api/public/actions' : '/api/data/actions', {
            params: { page: 1, limit: 10 }
        }).catch(() => ({ data: [] })) 
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

      const rawActions = Array.isArray(actionsRes.data?.data) ? actionsRes.data.data : (Array.isArray(actionsRes.data) ? actionsRes.data : []);
      const relevantActions = rawActions.filter((a: any) => a.target_widget_category === 'industry_events' || a.target_widget_category === 'events');
      
      const bpActionsAsEvents: EventData[] = relevantActions.map((a: any) => {
          let actionDate = a.start_date ? new Date(a.start_date) : new Date();
          if (actionDate < today) { actionDate = new Date(); }
          return {
              id: `action-${a.id}`, title: a.title, date: actionDate.toISOString(),
              region: a.target_region === 'all' ? null : (a.target_region || null),
              summary: a.content_text, url: a.link_url, participants: [], maybeParticipants: [],
              userVote: null, full_text: null, is_trusted_source: true, is_read: true,
              type: 'action', suggestedBy: null, logo_url: a.image_url || businessPartner?.logo_url || null,
              isPartnerAction: true
          };
      });

      const eventRegions: Region[] = Array.isArray(eventsRes.data?.availableRegions) ? eventsRes.data.availableRegions : [];
      const holidayRegionNames = Array.from(new Set(holidays.map(h => h.region).filter(Boolean) as string[]));
      const holidayRegionObjects = allPossibleRegions.filter(r => holidayRegionNames.includes(r.code)); 

      const combined = [...eventRegions, ...holidayRegionObjects];
      const uniqueRegions = Array.from(new Map(combined.map(r => [r.code, r])).values()).sort((a, b) => a.name.localeCompare(b.name));

      setAvailableRegions(uniqueRegions);
      setAllEvents([...events, ...holidays, ...bpActionsAsEvents]);
    } catch (err: any) {
      setAllEvents([]);
      setAvailableRegions([]);
      setError(err?.response?.data?.message || 'Events konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [category, allPossibleRegions, isPublic, user?.business_partner_category, businessPartner?.logo_url]);

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
      if (selectedRegionCode === 'all') { matchesRegion = true; } 
      else if (e.region) {
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
      acc[key].sort((a, b) => {
          if (a.type === 'action' && b.type !== 'action') return -1;
          if (b.type === 'action' && a.type !== 'action') return 1;
          return 0;
      });
      return acc;
    }, {});
  }, [allEvents, availableRegions, searchTerm, selectedRegionCode]);

  useEffect(() => {
    updateListScrollState();
  }, [filteredAndGrouped, loading, error, updateListScrollState]);

  useEffect(() => {
    const el = eventListRef.current;
    if (!el) return;

    updateListScrollState();
    el.addEventListener('scroll', updateListScrollState, { passive: true });

    const resizeObserver = new ResizeObserver(updateListScrollState);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener('scroll', updateListScrollState);
      resizeObserver.disconnect();
    };
  }, [updateListScrollState]);

  const markEventAsReadInternally = (eventId: string) => {
    setAllEvents(prev => prev.map(e => (e.id === eventId ? { ...e, is_read: true } : e)));
    if (isPublic || eventId.startsWith('action-')) return; 
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
          {icon || <CalendarMonthIcon sx={{ color: customPrimary }} />}
          {/* NEU: Bei isPublic wird die Schrift schwarz/dunkelblau, h5 und sehr fett (950) */}
          <Typography variant={isPublic ? "h5" : "h6"} sx={{ fontWeight: isPublic ? 950 : 800, color: isPublic ? '#061B33' : 'inherit' }}>
            {title}
          </Typography>
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
                                py: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', pr: '0 !important' 
                            } 
                        }}
                        renderValue={(value) => (
                            <Flag code={value === 'all' ? 'EU' : (value as string)} size={20} showLabel={false} />
                        )}
                    >
                        <MenuItem value="all"><Flag code="EU" alt="Alle Regionen" showLabel={true} /></MenuItem>
                        {availableRegions.map((region) => (
                            <MenuItem key={region.code} value={region.code}>
                                <Flag code={region.code} alt={region.name} showLabel={true} />
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <TextField
                    fullWidth size="small" placeholder="Suchen…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{ 
                        startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: customPrimary }} /></InputAdornment>, 
                        sx: { bgcolor: 'background.paper', borderRadius: 2 } 
                    }}
                    sx={{ flexGrow: 1 }}
                />

                {!isPublic && (
                    <Tooltip title="Termin vorschlagen">
                        <IconButton onClick={() => setAddModalOpen(true)} size="small" sx={{ flexShrink: 0, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1, '&:hover': { bgcolor: alpha(customPrimary, 0.1), borderColor: customPrimary } }}>
                            <AddCircleOutlineIcon sx={{ color: customPrimary }} fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Stack>
          </Box>

          {Object.keys(filteredAndGrouped).length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6, px: 2, m: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 3, opacity: 0.8 }}>
              <CalendarMonthIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body1" color="text.secondary" gutterBottom sx={{ fontWeight: 600 }}>Keine anstehenden Termine</Typography>
              <Button variant="outlined" size="small" startIcon={<AddCircleOutlineIcon />} sx={{ color: customPrimary, borderColor: customPrimary }} onClick={() => {
                  if(isPublic) return showSnackbar('Bitte loggen Sie sich ein.', 'info');
                  setAddModalOpen(true);
              }}>Termin vorschlagen</Button>
            </Box>
          ) : (
            <Box
              ref={eventListRef}
              sx={{ 
                flexGrow: 1, 
                minHeight: 0,
                height: isPublic ? '400px' : '100%', 
                maxHeight: isPublic ? '400px' : 'none', 
                overflowY: 'auto', 
                position: 'relative',
                p: 2, 
                pb: hasListOverflow ? 7 : 2,
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
                      const isAction = e.type === 'action';

                      const isPartnerEvent = e.category === 'businesspartner_events';
                      const partnerTitle = businessPartner?.name || partnerName || 'Partner';
                      
                      let badgeText = '';
                      if (isAction) badgeText = `Aktion von ${partnerTitle}`;
                      else if (isPartnerEvent) badgeText = `${partnerTitle} Event`;

                      const paperStyle = isAction ? {
                          border: '2px solid',
                          borderColor: customPrimary,
                          bgcolor: alpha(customPrimary, 0.05),
                          boxShadow: theme.shadows[1],
                      } : isHoliday ? {
                          border: '1px solid',
                          borderColor: 'divider',
                          bgcolor: alpha(theme.palette.secondary.main, 0.03),
                      } : {
                          border: '1px solid',
                          borderColor: 'divider',
                          bgcolor: 'background.paper',
                      };

return (
                        <Paper
                          key={e.id} elevation={0}
                          sx={{
                            display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, mb: 1.5, 
                            cursor: isHoliday ? 'default' : 'pointer', borderRadius: 3,
                            transition: 'all 0.2s ease', opacity: e.is_read ? 0.8 : 1,
                            position: 'relative', overflow: 'hidden',
                            ...paperStyle,
                            '&:hover': { 
                                transform: !isHoliday ? 'translateY(-2px)' : 'none', 
                                boxShadow: !isHoliday ? theme.shadows[2] : 'none', 
                                borderColor: !isHoliday ? customPrimary : 'divider' 
                            },
                          }}
                          onClick={() => {
                            if (isHoliday) return;
                            if (isAction && e.url) {
                                window.open(e.url, '_blank');
                                return;
                            }
                            setSelectedEvent(e);
                            if (!e.is_read) markEventAsReadInternally(e.id);
                          }}
                        >
                          {isAction && (
                              <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', bgcolor: customPrimary }} />
                          )}

                          {/* KORREKTUR: Fixe Breite für Datumsbox, damit Text bündig bleibt */}
                          <Box sx={{ 
                              textAlign: 'center', p: 0.5, px: 1, 
                              border: '1px solid', borderColor: isAction ? customPrimary : 'divider', 
                              bgcolor: isAction ? alpha(customPrimary, 0.05) : 'background.paper', 
                              borderRadius: 2, width: 56, minWidth: 56, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' 
                          }}>
                            {/* KORREKTUR: Schriftgröße für Datum leicht reduziert */}
                            <Typography component="div" sx={{ fontWeight: 800, lineHeight: 1.1, fontSize: '1.2rem', color: isAction ? customPrimary : 'text.primary' }}>
                              {isAction ? <CampaignIcon sx={{ fontSize: 20 }}/> : d.toLocaleDateString('de-DE', { day: '2-digit' })}
                            </Typography>
                            {!isAction && (
                                <Typography variant="caption" component="div" sx={{ lineHeight: 1, color: 'text.secondary', fontWeight: 'bold', mt: 0.2, fontSize: '0.65rem' }}>
                                {d.toLocaleDateString('de-DE', { month: 'short' }).toUpperCase()}
                                </Typography>
                            )}
                          </Box>

                          {/* KORREKTUR: ml: 1.5 (Margin-Left) hinzugefügt, um Abstand zur Datumsbox strikt zu halten */}
                          <Box sx={{ flexGrow: 1, minWidth: 0, ml: 1.5 }}>
                            {(isAction || isPartnerEvent) && (
                                <Chip 
                                    label={badgeText} 
                                    size="small" 
                                    variant={isAction ? "filled" : "outlined"}
                                    sx={{ height: 20, fontSize: '0.7rem', mb: 0.5, fontWeight: 'bold', bgcolor: isAction ? customPrimary : 'transparent', color: isAction ? '#fff' : customPrimary, borderColor: customPrimary }} 
                                />
                            )}

                            {e.suggestedBy && !isPartnerEvent && !isAction && (
                                <Chip 
                                    icon={<EmojiObjectsIcon sx={{ fontSize: '12px !important' }}/>} 
                                    label="Community-Tipp" 
                                    size="small" 
                                    sx={{ height: 18, fontSize: '0.65rem', mb: 0.5, bgcolor: alpha(theme.palette.info.main, 0.1), color: 'info.main', fontWeight: 'bold' }} 
                                />
                            )}
                            
                            {/* KORREKTUR: noWrap hinzugefügt (kürzt mit ... ab) und fontSize angepasst */}
                            <Typography noWrap sx={{ fontWeight: e.is_read && !isAction ? 500 : 800, mb: 0.2, display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.primary', fontSize: '0.95rem' }}>
                              {isHoliday && <CelebrationIcon fontSize="small" sx={{ color: customPrimary, flexShrink: 0 }} />} 
                              {e.title}
                            </Typography>

                            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" sx={{ mb: (e.url || e.full_text) && !isHoliday && !isAction ? 0.5 : 0 }}>
                              {e.type === 'event' && <ParticipantsPreview yes={e.participants} maybe={e.maybeParticipants} />}
                              
                              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                                {isAction ? e.summary?.substring(0,60) + '...' : (diffDays === 0 ? 'Heute' : diffDays === 1 ? 'Morgen' : `In ${diffDays} Tagen`)}
                              </Typography>
                              
                              {e.region && !isAction && (
                                <Tooltip title={e.region}>
                                  <Box component="span" sx={{ display: 'flex', alignItems: 'center' }}><Flag code={availableRegions.find((r) => r.name === e.region || r.code === e.region)?.code || 'EU'} size={16} /></Box>
                                </Tooltip>
                              )}
                            </Stack>

                            {e.type !== 'holiday' && !isAction && (e.url || e.full_text) && (
                              <Box>
                                <MuiLink
                                  href={e.url || undefined} target="_blank" rel="noopener" variant="caption" onClick={(ev) => ev.stopPropagation()}
                                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', textDecoration: 'underline', '&:hover': { color: customPrimary }, wordBreak: 'break-all' }}
                                >
                                  {e.full_text || getDomainSafely(e.url)} <OpenInNewIcon sx={{ fontSize: 12, color: customPrimary }} />
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
                          
                          {/* KORREKTUR: Icons wieder rechts ausgerichtet und dynamisch nach customPrimary eingefärbt */}
                          {e.type === 'event' && (
                            <IconButton 
                                size="small" 
                                onClick={(ev) => { ev.stopPropagation(); handleVote(e.id, e.userVote === 1 ? -1 : 1); }}
                                sx={{ color: customPrimary, flexShrink: 0 }}
                            >
                                {e.userVote === 1 ? <CheckCircleIcon /> : <CheckCircleOutlineIcon />}
                            </IconButton>
                          )}
                          {isAction && e.url && (
                             <IconButton size="small" sx={{ color: customPrimary, flexShrink: 0 }}>
                                 <OpenInNewIcon />
                             </IconButton> 
                          )}
                        </Paper>
                      );
                    })}
                  </Box>
                ))}

                {hasListOverflow && (
                  <Box
                    sx={{
                      position: 'sticky',
                      bottom: 10,
                      zIndex: 5,
                      display: 'flex',
                      justifyContent: 'center',
                      pointerEvents: 'none',
                      mt: 1,
                    }}
                  >
                    <Button
                      onClick={handleListJump}
                      size="small"
                      variant="contained"
                      startIcon={isListAtEnd ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                      sx={{
                        pointerEvents: 'auto',
                        borderRadius: 999,
                        px: 2,
                        py: 0.75,
                        textTransform: 'none',
                        fontWeight: 900,
                        bgcolor: customPrimary,
                        color: '#fff',
                        boxShadow: `0 10px 28px ${alpha(customPrimary, 0.35)}`,
                        '&:hover': { bgcolor: customPrimary, filter: 'brightness(0.94)' },
                      }}
                    >
                      {isListAtEnd ? 'oben' : 'unten'}
                    </Button>
                  </Box>
                )}
            </Box>
          )}
        </Box>
      )}

      {/* --- Detail-Dialog --- */}
      <Dialog open={!!selectedEvent && selectedEvent.type !== 'action'} onClose={() => setSelectedEvent(null)} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ pr: 5, pb: 1, pt: 3 }}>
            <Typography variant="overline" sx={{ color: customPrimary, fontWeight: 800, letterSpacing: 1 }}>Event Details</Typography>
            
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mt: 0.5, pr: 2 }}>
                {selectedEvent?.logo_url && (
                    <Box 
                        component="img" 
                        src={getImageUrl(selectedEvent.logo_url)} 
                        alt="Source Logo" 
                        sx={{ height: 40, width: 40, objectFit: 'contain', borderRadius: 1, p: 0.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0 }} 
                    />
                )}
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
              <Box sx={{ p: 2, bgcolor: alpha(customPrimary, 0.05), borderRadius: 2, border: '1px solid', borderColor: alpha(customPrimary, 0.1), display: 'flex', alignItems: 'center', gap: 2 }}>
                  <CalendarMonthIcon sx={{ color: customPrimary }} />
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">Wann?</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                        <Typography variant="body1" fontWeight="bold">
                            {new Date(selectedEvent.date).toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </Typography>
                        <Chip 
                            size="small" 
                            label={getDaysLeft(selectedEvent.date)} 
                            variant={getDaysLeft(selectedEvent.date) === 'Heute' ? 'filled' : 'outlined'}
                            sx={{ 
                                fontWeight: 'bold', height: 20,
                                bgcolor: getDaysLeft(selectedEvent.date) === 'Heute' ? customPrimary : alpha(customPrimary, 0.1),
                                color: getDaysLeft(selectedEvent.date) === 'Heute' ? '#fff' : customPrimary,
                                borderColor: customPrimary
                            }}
                        />
                    </Box>
                  </Box>
              </Box>
              
              {selectedEvent.summary && (
                  <Box>
                    <Typography variant="subtitle2" gutterBottom fontWeight="bold">Infos</Typography>
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
                          onClick={() => handleOpenCommunityProfile(selectedEvent.suggestedBy)}
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
                                        onClick={() => handleOpenCommunityProfile(p)}
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
                                        onClick={() => handleOpenCommunityProfile(p)}
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

                      <Button fullWidth startIcon={<OpenInNewIcon />} href={selectedEvent.url} target="_blank" rel="noopener" variant="outlined" sx={{ borderRadius: 2, whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.2, py: 1, borderColor: customPrimary, color: customPrimary, '&:hover': { borderColor: customPrimary, bgcolor: alpha(customPrimary, 0.05) } }}>
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
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, width: '100%', gap: 1 }}>
                <Typography variant="body2" fontWeight="bold">Deine Antwort:</Typography>
                <Stack direction="row" spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                <Button 
                    onClick={() => handleVote(selectedEvent?.id || '', 1)} 
                    size="small" startIcon={<CheckIcon />} 
                    variant={selectedEvent?.userVote === 1 ? "contained" : "outlined"}
                    sx={{ 
                        borderRadius: 5, px: 2, flex: { xs: 1, sm: 'none' },
                        borderColor: customPrimary,
                        color: selectedEvent?.userVote === 1 ? '#fff' : customPrimary,
                        bgcolor: selectedEvent?.userVote === 1 ? customPrimary : 'transparent',
                        '&:hover': {
                            bgcolor: selectedEvent?.userVote === 1 ? customPrimary : alpha(customPrimary, 0.1),
                            borderColor: customPrimary
                        }
                    }}
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
          <Button variant="contained" onClick={handleShareSubmit} sx={{ borderRadius: 2, bgcolor: customPrimary, '&:hover': { filter: 'brightness(0.9)', bgcolor: customPrimary } }}>Senden</Button>
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
          <Button variant="contained" onClick={handleAddEventSubmit} sx={{ borderRadius: 2, bgcolor: customPrimary, '&:hover': { filter: 'brightness(0.9)', bgcolor: customPrimary } }}>Speichern</Button>
        </DialogActions>
      </Dialog>
    </WidgetPaper>
  );
};

export default EventCalendarWidget;