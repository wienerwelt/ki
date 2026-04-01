import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  Avatar,
  IconButton,
  Stack,
  Tooltip,
  Link as MuiLink,
  Button,
  AvatarGroup,
  Badge,
  useTheme,
  useMediaQuery,
  Paper,
  Tab,
  Tabs,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem
} from '@mui/material';
import { alpha } from '@mui/material/styles';

import { BaseWidgetProps } from '../../types/dashboard.types';
import WidgetPaper from './WidgetPaper';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';

import LanguageIcon from '@mui/icons-material/Language';
import EmailIcon from '@mui/icons-material/Email';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import DateRangeIcon from '@mui/icons-material/DateRange';
import PaletteIcon from '@mui/icons-material/Palette';
import GroupIcon from '@mui/icons-material/Group';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ThumbDownOffAltIcon from '@mui/icons-material/ThumbDownOffAlt';
import Groups3Icon from '@mui/icons-material/Groups3';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import NewspaperIcon from '@mui/icons-material/Newspaper';
import EventIcon from '@mui/icons-material/Event';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import TimerIcon from '@mui/icons-material/Timer';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';

interface Region {
  id: string;
  name: string;
  code: string;
  is_default?: boolean;
}

interface BusinessPartner {
  id: string;
  name: string;
  dashboard_title: string | null;
  address: string | null;
  email: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  subscription_end_date: string | null;
  url_businesspartner: string | null;
  allow_automated_newsletter?: boolean;
  dashboard_focus?: 'information' | 'sales';
  level_1_name: string | null;
  level_2_name: string | null;
  level_3_name: string | null;
  regions: Region[];
}

interface ContentItem {
  id: string;
  title: string;
  summary: string | null;
  original_url: string;
  published_date?: string;
  event_date?: string;
  relevance_score: number;
  user_vote: number;
  participants?: MemberPreview[];
  maybeParticipants?: MemberPreview[];
}

interface UserStats {
  active: number;
  inactive: number;
}

interface MemberPreview {
  id: string;
  first_name: string | null;
  last_name: string | null;
  profile_image_url: string | null;
  role: string;
  last_login_at?: string;
}

interface BusinessPartnerInfoWidgetProps extends Partial<Omit<BaseWidgetProps, 'businessPartner'>> {
  widgetId: string;
  widgetTypeKey: string;
  title?: string;
  businessPartner: BusinessPartner | null | undefined;
  loading?: boolean;
  error?: string | null;
  isPublic?: boolean;
  publicData?: {
    partner?: BusinessPartner;
    news?: ContentItem[];
    events?: ContentItem[];
    members?: MemberPreview[];
  };
}

const getUserStatus = (lastLoginDate?: string) => {
  if (!lastLoginDate) return 'offline';
  const diffMinutes = (new Date().getTime() - new Date(lastLoginDate).getTime()) / (1000 * 60);
  if (diffMinutes < 15) return 'online';
  if (diffMinutes < 60 * 24) return 'active_today';
  return 'offline';
};

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('de-AT');
};

const getDisplayUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  return url.replace(/^(https?:\/\/)?(www\.)?/, '');
};

const getUrgencyColor = (daysLeft: number, theme: any) => {
  if (daysLeft < 0) return theme.palette.text.disabled;
  if (daysLeft === 0) return theme.palette.primary.main;
  if (daysLeft < 2) return theme.palette.success.main;
  if (daysLeft < 5) return theme.palette.warning.main;
  return theme.palette.text.secondary;
};

const Flag = ({ code, size = 20 }: { code?: string; size?: number }) => {
  if (!code) return null;
  const c = code.toUpperCase() === 'ALL' || code.toUpperCase() === 'EU' ? 'eu' : code.toLowerCase();

  return (
    <img
      loading="lazy"
      width={size}
      src={`https://flagcdn.com/w40/${c}.png`}
      alt={code}
      style={{ borderRadius: '2px', display: 'block' }}
    />
  );
};

const MemberAvatar: React.FC<{
  member: MemberPreview;
  onClick?: () => void;
  isPublic?: boolean;
  size?: number;
}> = ({ member, onClick, isPublic, size = 32 }) => {
  const status = isPublic ? 'offline' : getUserStatus(member.last_login_at);
  const invisible = status === 'offline';
  const statusColor = status === 'online' ? '#44b700' : '#ffa726';
  const hasName = member.first_name || member.last_name;
  const fullName = hasName
    ? [member.first_name, member.last_name].filter(Boolean).join(' ')
    : 'Anonymer Benutzer';
  const avatarLetter = hasName
    ? (member.first_name || member.last_name || '').charAt(0).toUpperCase()
    : 'A';
  const tooltipText = isPublic
    ? fullName
    : `${fullName} (${status === 'online' ? 'Online' : status === 'active_today' ? 'Heute aktiv' : member.role})`;

  return (
    <Tooltip title={tooltipText} arrow placement="top">
      <Badge
        overlap="circular"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        variant="dot"
        invisible={invisible}
        sx={{
          '& .MuiBadge-badge': {
            backgroundColor: statusColor,
            color: statusColor,
            boxShadow: '0 0 0 2px white',
            width: size / 3.5,
            height: size / 3.5,
            minWidth: size / 3.5
          },
          cursor: isPublic ? 'default' : 'pointer'
        }}
      >
        <Avatar
          src={member.profile_image_url || undefined}
          alt={fullName}
          onClick={isPublic ? undefined : onClick}
          sx={{ width: size, height: size, fontSize: size * 0.4 }}
        >
          {avatarLetter}
        </Avatar>
      </Badge>
    </Tooltip>
  );
};

const VoteComponent: React.FC<{
  item: ContentItem;
  onVote: (vote: 1 | -1) => void;
  disabled?: boolean;
}> = ({ item, onVote, disabled = false }) => {
  const getScoreColor = (score: number) =>
    score > 0 ? 'success.main' : score < 0 ? 'error.main' : 'text.secondary';

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      {!disabled && (
        <Tooltip title={item.event_date ? 'Ich nehme teil' : 'Hilfreich'}>
          <IconButton
            size="small"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onVote(1);
            }}
            sx={{
              p: 0.5,
              color: item.user_vote === 1 ? 'success.main' : 'action.disabled'
            }}
          >
            {item.user_vote === 1 ? (
              <ThumbUpIcon fontSize="small" />
            ) : (
              <ThumbUpOffAltIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      )}

      <Typography
        variant="caption"
        sx={{
          fontWeight: 'bold',
          color: getScoreColor(item.relevance_score),
          minWidth: 20,
          textAlign: 'center'
        }}
      >
        {item.relevance_score}
      </Typography>

      {!disabled && (
        <Tooltip title={item.event_date ? 'Absagen' : 'Nicht hilfreich'}>
          <IconButton
            size="small"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onVote(-1);
            }}
            sx={{
              p: 0.5,
              color: item.user_vote === -1 ? 'error.main' : 'action.disabled'
            }}
          >
            {item.user_vote === -1 ? (
              <ThumbDownIcon fontSize="small" />
            ) : (
              <ThumbDownOffAltIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};

const BusinessPartnerInfoWidget: React.FC<BusinessPartnerInfoWidgetProps> = ({
  businessPartner: propBusinessPartner,
  loading,
  error,
  onDelete,
  widgetId,
  isRemovable,
  isPublic = false,
  publicData,
  widgetTypeKey
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const businessPartner = isPublic ? publicData?.partner : propBusinessPartner;

  const [bpNews, setBpNews] = useState<ContentItem[]>([]);
  const [bpEvents, setBpEvents] = useState<ContentItem[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberPreview[]>([]);
  const [totalMembers, setTotalMembers] = useState(0);
  const [activeTab, setActiveTab] = useState(0);

  const [addEventModalOpen, setAddEventModalOpen] = useState(false);
  const [newBpEvent, setNewBpEvent] = useState({
    title: '',
    event_date: '',
    summary: '',
    original_url: '',
    regionId: 'ALL_GLOBAL'
  });

  const userRole = user?.role;
  const canViewAdminInfo = !isPublic && (userRole === 'admin' || userRole === 'assistenz');
  const bpId = businessPartner?.id;

  const fetchWidgetData = useCallback(async () => {
    if (!bpId || isPublic) return;

    setLoadingContent(true);
    setContentError(null);

    try {
      const promises: Promise<any>[] = [
        apiClient.get(`/api/data/bp-scraped-content?businessPartnerId=${bpId}&category=news`),
        apiClient.get(`/api/data/bp-scraped-content?businessPartnerId=${bpId}&category=events`),
        apiClient.get(`/api/data/bp-members-preview?businessPartnerId=${bpId}`)
      ];

      if (canViewAdminInfo) {
        promises.push(apiClient.get(`/api/data/user-stats/${encodeURIComponent(bpId)}`));
      }

      const [newsRes, eventsRes, membersRes, statsRes] = await Promise.all(promises);

      setBpNews(newsRes?.data?.data || []);

      const fetchedEvents = eventsRes?.data?.data || [];
      const sortedEvents = fetchedEvents.sort(
        (a: any, b: any) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
      );
      setBpEvents(sortedEvents);

      if (membersRes?.data) {
        setMembers(membersRes.data.members || []);
        setTotalMembers(membersRes.data.total || 0);
      }

      if (statsRes) {
        setUserStats(statsRes?.data || null);
      }
    } catch (err: any) {
      setContentError(err?.response?.data?.message || 'Fehler beim Laden der Widget-Inhalte.');
    } finally {
      setLoadingContent(false);
    }
  }, [bpId, canViewAdminInfo, isPublic]);

  useEffect(() => {
    if (isPublic && publicData) {
      setBpNews(publicData.news || []);
      setBpEvents(publicData.events || []);
      setMembers(publicData.members || []);
      setTotalMembers(publicData.members?.length || 0);
    } else if (!isPublic && bpId) {
      fetchWidgetData();
    }
  }, [bpId, fetchWidgetData, isPublic, publicData]);

  const handleVote = async (contentId: string, vote: 1 | -1, contentType: 'news' | 'event') => {
    if (isPublic) return;

    const isEvent = contentType === 'event';
    const setList = isEvent ? setBpEvents : setBpNews;

    setList((items) =>
      items.map((item) => {
        if (item.id !== contentId) return item;

        const newVote = item.user_vote === vote ? 0 : vote;
        let updatedParticipants = [...(item.participants || [])];

        if (isEvent && user) {
          if (newVote === 1) {
            if (!updatedParticipants.some((p) => p.id === user.id)) {
              updatedParticipants.push({
                id: user.id,
                first_name: user.first_name || null,
                last_name: user.last_name || null,
                profile_image_url: user.profile_image_url || null,
                role: user.role
              });
            }
          } else {
            updatedParticipants = updatedParticipants.filter((p) => p.id !== user.id);
          }
        }

        let scoreDiff = 0;
        if (item.user_vote === 1) scoreDiff -= 1;
        if (item.user_vote === -1) scoreDiff += 1;
        if (newVote === 1) scoreDiff += 1;
        if (newVote === -1) scoreDiff -= 1;

        return {
          ...item,
          user_vote: newVote,
          relevance_score: item.relevance_score + scoreDiff,
          participants: updatedParticipants
        };
      })
    );

    try {
      const actualVote =
        bpNews.concat(bpEvents).find((i) => i.id === contentId)?.user_vote === vote ? 0 : vote;

      await apiClient.post(`/api/data/content/${contentId}/vote`, {
        vote: actualVote,
        contentType: 'scraped_content'
      });
    } catch (err) {
      console.error('Fehler beim Speichern des Votes:', err);
    }
  };

  const primaryColor = businessPartner?.primary_color || theme.palette.primary.main;
  const secondaryColor = businessPartner?.secondary_color || theme.palette.secondary.main;
  const bpRegions: Region[] = Array.isArray(businessPartner?.regions) ? businessPartner.regions : [];
  const defaultRegion = bpRegions.find((r) => r.is_default);
  const memberLevels = [
    businessPartner?.level_1_name,
    businessPartner?.level_2_name,
    businessPartner?.level_3_name
  ]
    .filter(Boolean)
    .join(', ');

  const handleOpenAddEventDialog = () => {
    const initialRegionId = defaultRegion?.id || bpRegions[0]?.id || 'ALL_GLOBAL';

    setNewBpEvent({
      title: '',
      event_date: '',
      summary: '',
      original_url: '',
      regionId: initialRegionId
    });

    setAddEventModalOpen(true);
  };

  const handleAddBpEventSubmit = async () => {
    if (!newBpEvent.title || !newBpEvent.event_date) {
      alert('Titel und Datum sind erforderlich.');
      return;
    }

    try {
      await apiClient.post('/api/admin/scraped-content/events', {
        title: newBpEvent.title,
        event_date: newBpEvent.event_date,
        summary: newBpEvent.summary,
        original_url: newBpEvent.original_url,
        category: 'businesspartner_events',
        businessPartnerId: bpId,
        region_id: newBpEvent.regionId === 'ALL_GLOBAL' ? null : newBpEvent.regionId
      });

      setAddEventModalOpen(false);
      fetchWidgetData();
    } catch (err) {
      console.error('Fehler beim Speichern des Events:', err);
      alert('Event konnte nicht gespeichert werden.');
    }
  };

  const renderNewsCard = (item: ContentItem) => (
    <Paper
      key={item.id}
      elevation={0}
      component="a"
      href={isPublic ? undefined : item.original_url}
      target={isPublic ? undefined : '_blank'}
      rel="noopener noreferrer"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        p: 2,
        mb: 1.5,
        cursor: isPublic ? 'default' : 'pointer',
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'all 0.2s',
        '&:hover': {
          transform: isPublic ? 'none' : 'translateY(-2px)',
          boxShadow: isPublic ? 0 : theme.shadows[2],
          borderColor: isPublic ? 'divider' : 'primary.main'
        }
      }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5, lineHeight: 1.3 }}>
        {item.title}
      </Typography>

      {item.summary && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            mb: 1
          }}
        >
          {item.summary}
        </Typography>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 'auto' }}>
        <Typography variant="caption" color="text.disabled" fontWeight={500}>
          {formatDate(item.published_date)}
        </Typography>
        <Box onClick={(e) => e.stopPropagation()}>
          <VoteComponent
            item={item}
            onVote={(v) => handleVote(item.id, v, 'news')}
            disabled={isPublic}
          />
        </Box>
      </Box>
    </Paper>
  );

  const renderEventCard = (item: ContentItem) => {
    const d = item.event_date ? new Date(item.event_date) : null;
    let diffDays = -1;

    if (d) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const eventDay = new Date(d);
      eventDay.setHours(0, 0, 0, 0);

      diffDays = Math.ceil((eventDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }

    const isPast = diffDays < 0;
    const urgencyColor = getUrgencyColor(diffDays, theme);
    const hasUrgencyGlow = diffDays >= 0 && diffDays < 5;

    return (
      <Paper
        key={item.id}
        elevation={0}
        onClick={() => {
          if (!isPublic && item.original_url) {
            window.open(item.original_url, '_blank', 'noopener,noreferrer');
          }
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          p: 1.5,
          mb: 1.5,
          cursor: isPublic ? 'default' : 'pointer',
          borderRadius: 3,
          border: '1px solid',
          borderColor: hasUrgencyGlow ? urgencyColor : 'divider',
          bgcolor: 'background.paper',
          transition: 'all 0.2s ease',
          opacity: isPast ? 0.6 : 1,
          position: 'relative',
          overflow: 'hidden',
          '&:hover': {
            transform: isPublic ? 'none' : 'translateY(-2px)',
            boxShadow: isPublic ? 'none' : theme.shadows[2],
            borderColor: isPublic ? 'divider' : 'primary.main'
          }
        }}
      >
        {diffDays >= 0 && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              px: 1.2,
              py: 0.4,
              borderBottomLeftRadius: 10,
              fontSize: '0.6rem',
              fontWeight: 900,
              bgcolor: urgencyColor,
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5
            }}
          >
            <TimerIcon sx={{ fontSize: 10 }} />
            {diffDays === 0 ? 'HEUTE' : diffDays === 1 ? 'MORGEN' : `IN ${diffDays} TAGEN`}
          </Box>
        )}

        {d && (
          <Box
            sx={{
              textAlign: 'center',
              p: 0.5,
              border: '1px solid',
              borderColor: urgencyColor,
              bgcolor: alpha(urgencyColor, 0.05),
              borderRadius: 2,
              minWidth: 55
            }}
          >
            <Typography
              variant="body2"
              component="div"
              sx={{ fontWeight: 800, lineHeight: 1.2, color: urgencyColor }}
            >
              {d.toLocaleDateString('de-DE', { day: '2-digit' })}
            </Typography>
            <Typography
              variant="caption"
              component="div"
              sx={{ lineHeight: 1, color: urgencyColor, opacity: 0.8, fontWeight: 'bold' }}
            >
              {d.toLocaleDateString('de-DE', { month: 'short' }).toUpperCase()}
            </Typography>
          </Box>
        )}

        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="body1" noWrap sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}>
            {item.title}
          </Typography>

          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
            {item.participants && item.participants.length > 0 && (
              <AvatarGroup
                max={4}
                sx={{
                  '& .MuiAvatar-root': {
                    width: 24,
                    height: 24,
                    fontSize: 10,
                    border: '1px solid white'
                  }
                }}
              >
                {item.participants.map((p) => {
                  const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Anonymer Nutzer';

                  return (
                    <Tooltip key={p.id} title={name} arrow placement="top">
                      <Avatar src={p.profile_image_url || undefined} alt={name}>
                        {name.charAt(0).toUpperCase()}
                      </Avatar>
                    </Tooltip>
                  );
                })}
              </AvatarGroup>
            )}

            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                color: hasUrgencyGlow ? urgencyColor : 'text.secondary',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5
              }}
            >
              {hasUrgencyGlow && <TimerIcon sx={{ fontSize: 12 }} />}
              {d ? d.toLocaleDateString('de-DE', { weekday: 'long' }) : 'Kein Datum'}
            </Typography>
          </Stack>

          {!isPublic && item.original_url && (
            <Box sx={{ mt: 0.5 }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  color: 'text.secondary',
                  '&:hover': { color: 'primary.main' }
                }}
              >
                {getDisplayUrl(item.original_url)} <OpenInNewIcon sx={{ fontSize: 12 }} />
              </Typography>
            </Box>
          )}
        </Box>

        {!isPublic && (
          <IconButton
            size="small"
            onClick={(ev) => {
              ev.stopPropagation();
              handleVote(item.id, item.user_vote === 1 ? -1 : 1, 'event');
            }}
            sx={{ color: item.user_vote === 1 ? 'success.main' : 'text.disabled' }}
          >
            <CheckCircleOutlineIcon />
          </IconButton>
        )}
      </Paper>
    );
  };

  return (
    <WidgetPaper
      widgetTitle={businessPartner?.name || 'Business Partner'}
      widgetTypeKey={widgetTypeKey}
      widgetId={widgetId}
      onDelete={onDelete}
      isRemovable={isRemovable}
      loading={loading}
      error={error}
      noPadding
      isPublic={isPublic}
      title={<Box sx={{ display: 'none' }} />}
    >
      {!businessPartner ? (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <CircularProgress size={30} />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <Box
            sx={{
              position: 'relative',
              pt: 3,
              pb: 2,
              px: { xs: 2, sm: 3 },
              bgcolor: alpha(primaryColor, 0.05),
              borderBottom: '1px solid',
              borderColor: alpha(primaryColor, 0.1)
            }}
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
              <Avatar
                src={businessPartner.logo_url || undefined}
                variant="rounded"
                sx={{
                  width: 80,
                  height: 80,
                  bgcolor: 'white',
                  border: '1px solid',
                  borderColor: 'divider',
                  '& img': { objectFit: 'contain', p: 1 }
                }}
              >
                {businessPartner.name?.charAt(0)}
              </Avatar>

              <Box sx={{ flexGrow: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                  <Typography
                    variant="h5"
                    sx={{ fontWeight: 900, color: 'text.primary', letterSpacing: '-0.5px' }}
                  >
                    {businessPartner.name}
                  </Typography>
                  {defaultRegion && <Flag code={defaultRegion.code} size={20} />}
                </Stack>

                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                  {businessPartner.url_businesspartner && (
                    <MuiLink
                      href={businessPartner.url_businesspartner}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="caption"
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        color: 'text.secondary',
                        '&:hover': { color: 'primary.main' }
                      }}
                    >
                      <LanguageIcon fontSize="small" /> {getDisplayUrl(businessPartner.url_businesspartner)}
                    </MuiLink>
                  )}

                  {businessPartner.email && (
                    <MuiLink
                      href={isPublic ? undefined : `mailto:${businessPartner.email}`}
                      variant="caption"
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        color: 'text.secondary',
                        textDecoration: 'none',
                        cursor: isPublic ? 'default' : 'pointer',
                        '&:hover': { color: 'primary.main' }
                      }}
                    >
                      <EmailIcon fontSize="small" /> {businessPartner.email}
                    </MuiLink>
                  )}

                  {businessPartner.address && (
                    <MuiLink
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        businessPartner.address
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="caption"
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        color: 'text.secondary',
                        '&:hover': { color: 'primary.main' }
                      }}
                    >
                      <LocationOnIcon fontSize="small" /> {businessPartner.address}
                    </MuiLink>
                  )}
                </Stack>
              </Box>
            </Stack>
          </Box>

          <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}>
            <Tabs
              value={activeTab}
              onChange={(_, v) => setActiveTab(v)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                minHeight: 44,
                '& .MuiTab-root': {
                  minHeight: 44,
                  py: 1,
                  px: 2,
                  fontWeight: 700,
                  textTransform: 'none',
                  fontSize: '0.85rem'
                }
              }}
            >
              <Tab
                icon={<BusinessCenterIcon sx={{ fontSize: 18 }} />}
                iconPosition="start"
                label="Übersicht"
              />
              <Tab
                icon={<NewspaperIcon sx={{ fontSize: 18 }} />}
                iconPosition="start"
                label={`News (${bpNews.length})`}
                disabled={bpNews.length === 0}
              />
              <Tab
                icon={<EventIcon sx={{ fontSize: 18 }} />}
                iconPosition="start"
                label="Events"
              />
              {canViewAdminInfo && (
                <Tab
                  icon={<AdminPanelSettingsIcon sx={{ fontSize: 18 }} />}
                  iconPosition="start"
                  label="Admin"
                  sx={{ ml: 'auto' }}
                />
              )}
            </Tabs>
          </Box>

          <Box
            sx={{
              flexGrow: 1,
              overflowY: 'auto',
              p: { xs: 2, sm: 3 },
              bgcolor: alpha(theme.palette.action.hover, 0.05)
            }}
          >
            {loadingContent ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={30} />
              </Box>
            ) : contentError ? (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {contentError}
              </Alert>
            ) : (
              <>
                {activeTab === 0 && (
                  <Box>
                    {totalMembers > 0 ? (
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2,
                          borderRadius: 3,
                          border: '1px solid',
                          borderColor: 'divider',
                          bgcolor: 'background.paper'
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                          <Typography variant="subtitle2" fontWeight="bold" display="flex" alignItems="center" gap={1}>
                            <Groups3Icon color="action" /> Community ({totalMembers})
                          </Typography>

                          {canViewAdminInfo && (
                            <Button
                              size="small"
                              startIcon={<PersonAddIcon />}
                              onClick={() => navigate(`/admin/users?business_partner_id=${bpId}`)}
                              sx={{ borderRadius: 5 }}
                            >
                              Verwalten
                            </Button>
                          )}
                        </Box>

                        <Box
                          onClick={() => !isPublic && navigate('/community', { state: { defaultTab: 'members' } })}
                          sx={{ cursor: isPublic ? 'default' : 'pointer' }}
                        >
                          <AvatarGroup
                            max={isMobile ? 5 : 8}
                            sx={{
                              justifyContent: 'flex-start',
                              '& .MuiAvatar-root': {
                                width: 40,
                                height: 40,
                                fontSize: '1rem',
                                border: '2px solid white'
                              }
                            }}
                          >
                            {members.map((m) => (
                              <MemberAvatar key={m.id} member={m} isPublic={isPublic} size={40} />
                            ))}
                          </AvatarGroup>
                        </Box>

                        {!isPublic && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'block', mt: 2, textAlign: 'center' }}
                          >
                            Klicken, um Kollegen zu sehen
                          </Typography>
                        )}
                      </Paper>
                    ) : (
                      <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
                        Noch keine Community-Mitglieder.
                      </Typography>
                    )}
                  </Box>
                )}

                {activeTab === 1 && <Box>{bpNews.map((item) => renderNewsCard(item))}</Box>}

                {activeTab === 2 && (
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, px: 1 }}>
                      <Typography variant="subtitle2" fontWeight="bold" color="text.secondary">
                        {bpEvents.length > 0 ? 'Exklusive Events' : ''}
                      </Typography>

                      {canViewAdminInfo && bpEvents.length > 0 && (
                        <Button
                          size="small"
                          startIcon={<AddCircleOutlineIcon />}
                          onClick={handleOpenAddEventDialog}
                          sx={{ borderRadius: 5 }}
                        >
                          Neues Event
                        </Button>
                      )}
                    </Box>

                    {bpEvents.length > 0 ? (
                      bpEvents.map((item) => renderEventCard(item))
                    ) : (
                      <Box
                        sx={{
                          textAlign: 'center',
                          py: 5,
                          border: '1px dashed',
                          borderColor: 'divider',
                          borderRadius: 3,
                          bgcolor: 'background.paper'
                        }}
                      >
                        <EventIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                        <Typography variant="body1" fontWeight="bold" color="text.secondary">
                          Keine Events geplant
                        </Typography>

                        {canViewAdminInfo && (
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<AddCircleOutlineIcon />}
                            onClick={handleOpenAddEventDialog}
                            sx={{ mt: 2, borderRadius: 5 }}
                          >
                            Erstes Event anlegen
                          </Button>
                        )}
                      </Box>
                    )}
                  </Box>
                )}

{activeTab === 3 && canViewAdminInfo && (
                  <Stack spacing={2}>
                    <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="overline" color="primary" fontWeight="bold">
                        Vertragsdaten & Lizenzen
                      </Typography>

                      <Stack spacing={1.5} sx={{ mt: 1 }}>
                        <Box display="flex" alignItems="center">
                          <DateRangeIcon color="action" sx={{ mr: 1.5, fontSize: '1.2rem' }} />
                          <Typography variant="body2">
                            Abo läuft bis:{' '}
                            <strong>{formatDate(businessPartner.subscription_end_date) || 'Unbekannt'}</strong>
                          </Typography>
                        </Box>

                        {/* NEU: Newsletter Status */}
                        <Box display="flex" alignItems="center">
                          <EmailIcon color="action" sx={{ mr: 1.5, fontSize: '1.2rem' }} />
                          <Typography variant="body2">
                            Automatisches Briefing (E-Mail):{' '}
                            <strong style={{ color: businessPartner.allow_automated_newsletter ? theme.palette.success.main : theme.palette.error.main }}>
                              {businessPartner.allow_automated_newsletter ? 'Aktiviert' : 'Deaktiviert'}
                            </strong>
                          </Typography>
                        </Box>

                        {userStats && (
                          <Box display="flex" alignItems="center">
                            <GroupIcon color="action" sx={{ mr: 1.5, fontSize: '1.2rem' }} />
                            <Typography variant="body2">
                              Nutzer:{' '}
                              <strong style={{ color: theme.palette.success.main }}>{userStats.active}</strong> aktiv /{' '}
                              <strong style={{ color: theme.palette.error.main }}>{userStats.inactive}</strong> inaktiv
                            </Typography>
                          </Box>
                        )}

                        {memberLevels && (
                          <Box display="flex" alignItems="center">
                            <Groups3Icon color="action" sx={{ mr: 1.5, fontSize: '1.2rem' }} />
                            <Typography variant="body2">Nutzergruppen: {memberLevels}</Typography>
                          </Box>
                        )}
                      </Stack>
                    </Paper>

                    <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="overline" color="primary" fontWeight="bold">
                        Corporate Design
                      </Typography>

                      <Box display="flex" alignItems="center" sx={{ mt: 1.5 }}>
                        <PaletteIcon color="action" sx={{ mr: 1.5, fontSize: '1.2rem' }} />
                        <Chip size="small" label="Primär" sx={{ bgcolor: primaryColor, color: '#fff', mr: 1 }} />
                        <Chip size="small" label="Sekundär" sx={{ bgcolor: secondaryColor, color: '#fff' }} />
                      </Box>
                    </Paper>
                  </Stack>
                )}
              </>
            )}
          </Box>
        </Box>
      )}

      <Dialog
        open={addEventModalOpen}
        onClose={() => setAddEventModalOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 4 } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>
          Neues {businessPartner?.name ? `${businessPartner.name}-Event` : 'Event'} erstellen
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField
              fullWidth
              size="small"
              label="Titel*"
              value={newBpEvent.title}
              onChange={(e) => setNewBpEvent({ ...newBpEvent, title: e.target.value })}
            />

            <TextField
              fullWidth
              size="small"
              type="date"
              label="Datum*"
              value={newBpEvent.event_date}
              onChange={(e) => setNewBpEvent({ ...newBpEvent, event_date: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              select
              fullWidth
              size="small"
              label="Zugewiesene Region"
              value={newBpEvent.regionId}
              onChange={(e) => setNewBpEvent({ ...newBpEvent, regionId: e.target.value })}
            >
              <MenuItem value="ALL_GLOBAL">
                <em>Global (Überall sichtbar)</em>
              </MenuItem>

              {bpRegions.length > 0 ? (
                bpRegions.map((region) => (
                  <MenuItem key={region.id} value={region.id}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Flag code={region.code} size={16} />
                      {region.name}
                      {region.is_default && ' (Standard)'}
                    </Box>
                  </MenuItem>
                ))
              ) : (
                <MenuItem disabled>Keine spezifischen Regionen gefunden</MenuItem>
              )}
            </TextField>

            <TextField
              fullWidth
              size="small"
              label="URL zur Anmeldung (Optional)"
              value={newBpEvent.original_url}
              onChange={(e) => setNewBpEvent({ ...newBpEvent, original_url: e.target.value })}
              placeholder="https://..."
            />

            <TextField
              fullWidth
              size="small"
              multiline
              rows={3}
              label="Kurzbeschreibung (Optional)"
              value={newBpEvent.summary}
              onChange={(e) => setNewBpEvent({ ...newBpEvent, summary: e.target.value })}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 3, bgcolor: '#f8fafc' }}>
          <Button onClick={() => setAddEventModalOpen(false)}>Abbrechen</Button>
          <Button variant="contained" onClick={handleAddBpEventSubmit} sx={{ borderRadius: 2 }}>
            Veröffentlichen
          </Button>
        </DialogActions>
      </Dialog>
    </WidgetPaper>
  );
};

export default BusinessPartnerInfoWidget;