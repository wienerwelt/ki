import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Divider,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Chip,
  Avatar,
  IconButton,
  Stack,
  Tooltip,
  Link as MuiLink,
  Button,
  AvatarGroup,
  Badge,
  useTheme,        // NEU
  useMediaQuery    // NEU
} from '@mui/material';
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
  level_1_name: string | null;
  level_2_name: string | null;
  level_3_name: string | null;
  regions: Region[];
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

interface ContentItem {
  id: string;
  title: string;
  summary: string | null;
  original_url: string;
  published_date?: string;
  event_date?: string;
  relevance_score: number;
  user_vote: number;
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

// --- STATUS LOGIK ---
const getUserStatus = (lastLoginDate?: string) => {
    if (!lastLoginDate) return 'offline';
    const loginTime = new Date(lastLoginDate).getTime();
    const now = new Date().getTime();
    const diffMinutes = (now - loginTime) / (1000 * 60);
    
    if (diffMinutes < 15) return 'online';
    if (diffMinutes < 60 * 24) return 'active_today';
    return 'offline';
};

// --- AVATAR KOMPONENTE MIT STATUS ---
const MemberAvatar: React.FC<{ member: MemberPreview, onClick?: () => void, isPublic?: boolean }> = ({ member, onClick, isPublic }) => {
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
        : `${fullName} (${status === 'online' ? 'Online' : (status === 'active_today' ? 'Heute aktiv' : member.role)})`;

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
                    cursor: isPublic ? 'default' : 'pointer'
                }}
            >
                <Avatar 
                    src={member.profile_image_url || undefined} 
                    alt={fullName}
                    onClick={isPublic ? undefined : onClick}
                    sx={{ width: 32, height: 32, fontSize: '0.8rem' }}
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
  size?: 'small' | 'medium';
  disabled?: boolean;
}> = ({ item, onVote, size = 'small', disabled = false }) => {
  const getScoreColor = (score: number) =>
    score > 0 ? 'success.main' : score < 0 ? 'error.main' : 'text.secondary';

  const handleVote = (e: React.MouseEvent, vote: 1 | -1) => {
    e.stopPropagation();
    e.preventDefault();
    if (!disabled) onVote(vote);
  };

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      {!disabled && (
          <Tooltip title="Hilfreich">
            <IconButton size={size} onClick={(e) => handleVote(e, 1)} sx={{ p: 0.5 }}>
              {item.user_vote === 1 ? (
                <ThumbUpIcon color="success" fontSize={size} />
              ) : (
                <ThumbUpOffAltIcon color="action" fontSize={size} />
              )}
            </IconButton>
          </Tooltip>
      )}
      
      <Typography
        variant="caption"
        sx={{ fontWeight: 'bold', color: getScoreColor(item.relevance_score), minWidth: 20, textAlign: 'center' }}
      >
        {item.relevance_score}
      </Typography>

      {!disabled && (
          <Tooltip title="Nicht hilfreich">
            <IconButton size={size} onClick={(e) => handleVote(e, -1)} sx={{ p: 0.5 }}>
              {item.user_vote === -1 ? (
                <ThumbDownIcon color="error" fontSize={size} />
              ) : (
                <ThumbDownOffAltIcon color="action" fontSize={size} />
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
  
  // NEU: Mobile Detection für "Show More" Logik
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

  const userRole = user?.role;
  const canViewAdminInfo = !isPublic && (userRole === 'admin' || userRole === 'assistenz');
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bpId = businessPartner?.id;

  const qs = (params: Record<string, string>) =>
    '?' + new URLSearchParams(params).toString();

  const fetchWidgetData = useCallback(async () => {
    if (!bpId || isPublic) return;
    
    setLoadingContent(true);
    setContentError(null);
    try {
      const newsUrl   = `/api/data/bp-scraped-content${qs({ businessPartnerId: bpId, category: 'news' })}`;
      const eventsUrl = `/api/data/bp-scraped-content${qs({ businessPartnerId: bpId, category: 'events' })}`;
      const statsUrl  = `/api/data/user-stats/${encodeURIComponent(bpId)}`;
      const membersUrl = `/api/data/bp-members-preview?businessPartnerId=${bpId}`;

      const promises = [
        apiClient.get(newsUrl),
        apiClient.get(eventsUrl),
        apiClient.get(membersUrl)
      ];

      if (canViewAdminInfo) {
          promises.push(apiClient.get(statsUrl));
      }

      const [newsRes, eventsRes, membersRes, statsRes] = await Promise.all(promises);

      const newsData = (newsRes as any)?.data?.data ?? [];
      const eventsData = (eventsRes as any)?.data?.data ?? [];
      const statsData = (statsRes as any)?.data ?? null;

      setBpNews(Array.isArray(newsData) ? newsData : []);
      setBpEvents(Array.isArray(eventsData) ? eventsData : []);
      
      if (membersRes.data) {
          setMembers(membersRes.data.members || []);
          setTotalMembers(membersRes.data.total || 0);
      }

      if (statsData) {
        setUserStats(statsData);
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

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('de-AT');
  };

  const handleVote = async (contentId: string, vote: 1 | -1, contentType: 'news' | 'event') => {
    if (isPublic) return;

    const list = contentType === 'news' ? bpNews : bpEvents;
    const setList = contentType === 'news' ? setBpNews : setBpEvents;

    const currentItem = list.find((item) => item.id === contentId);
    if (!currentItem) return;

    const newVote = currentItem.user_vote === vote ? 0 : vote;

    try {
      const res = await apiClient.post(`/api/data/content/${contentId}/vote`, {
        vote: newVote,
        contentType: 'scraped_content',
      });

      const newScore = (res as any)?.data?.relevance_score ?? currentItem.relevance_score;
      const updateList = (items: ContentItem[]) =>
        items.map((item) =>
          item.id === contentId ? { ...item, relevance_score: newScore, user_vote: newVote } : item
        );
      setList(updateList);
    } catch (err) {
      console.error('Fehler bei der Abstimmung:', err);
    }
  };

  const getDisplayUrl = (url: string | null | undefined): string => {
    if (!url) return '';
    return url.replace(/^(https?:\/\/)?(www\.)?/, '');
  };

  const handleMemberClick = () => {
      if (isPublic) return;
      navigate('/community', { state: { defaultTab: 'members' } });
  };

  const defaultRegion = businessPartner?.regions?.find((r) => r.is_default);
  const memberLevels = [businessPartner?.level_1_name, businessPartner?.level_2_name, businessPartner?.level_3_name]
    .filter(Boolean)
    .join(', ');

  const primaryColor = businessPartner?.primary_color || 'primary.main';
  const secondaryColor = businessPartner?.secondary_color || 'secondary.main';

  const getMapsLink = (address: string) => {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  };

  return (
    <WidgetPaper
      title={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          <Typography variant="h6" noWrap sx={{ maxWidth: '60%' }}>
              {businessPartner?.name || 'Business Partner'}
          </Typography>
          
          {totalMembers > 0 && !isPublic && (
              <Chip 
                label={`${totalMembers}`} 
                icon={<Groups3Icon style={{ fontSize: 16 }} />} 
                size="small" 
                variant="outlined"
                sx={{ cursor: 'pointer', borderColor: 'divider' }}
                onClick={handleMemberClick}
              />
          )}

          <Box sx={{ flexGrow: 1 }} />

          {defaultRegion && (
            <Tooltip title={`Standard Region: ${defaultRegion.name}`}>
              <img
                src={`https://flagcdn.com/w20/${defaultRegion.code.toLowerCase()}.png`}
                width="24"
                alt={defaultRegion.name}
                style={{ border: '1px solid #eee', borderRadius: '2px' }}
              />
            </Tooltip>
          )}
        </Box>
      }
      widgetTitle={businessPartner?.name || 'Business Partner'}
      widgetTypeKey={widgetTypeKey}
      widgetId={widgetId}
      onDelete={onDelete}
      isRemovable={isRemovable}
      loading={loading}
      error={error}
      noPadding
      isPublic={isPublic}
    >
      {!businessPartner ? (
        <Box sx={{ p: 2 }}>
          <Alert severity="warning">
            {isPublic ? 'Lade Partner-Informationen...' : 'Kein Business Partner zugewiesen.'}
          </Alert>
        </Box>
      ) : (
        <Card variant="outlined" sx={{ 
            height: isMobile ? 'auto' : '100%',  // <-- FIX 1: Höhe auf Mobile anpassen
            border: 'none', 
            display: 'flex', 
            flexDirection: 'column', 
            bgcolor: 'transparent' 
        }}>
          <CardContent sx={{ 
              flexGrow: 1, 
              overflowY: isMobile ? 'visible' : 'auto', // <-- FIX 2: Scrollbar auf Mobile entfernen
              pt: 2 
          }}>
            
            {/* MEMBERS PILE */}
            {members.length > 0 && (
                <Box sx={{ px: 2, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box onClick={handleMemberClick} sx={{ cursor: isPublic ? 'default' : 'pointer' }}>
                        <AvatarGroup 
                            max={7} 
                            sx={{ 
                                '& .MuiAvatar-root': { width: 32, height: 32, fontSize: '0.8rem' } 
                            }}
                        >
                            {members.map(m => (
                                <MemberAvatar key={m.id} member={m} isPublic={isPublic} />
                            ))}
                        </AvatarGroup>
                    </Box>

                    {canViewAdminInfo && (
                        <Tooltip title="Nutzer verwalten">
                            <IconButton size="small" onClick={() => navigate(`/admin/users?business_partner_id=${bpId}`)}>
                                <PersonAddIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                </Box>
            )}
            
            {members.length > 0 && <Divider sx={{ mb: 2 }} />}

            <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', px: 2, mb: 2 }}>
              <Avatar
                src={businessPartner.logo_url || undefined}
                variant="rounded"
                sx={{
                  width: 90,
                  height: 60,
                  mt: 0.5,
                  '& img': { objectFit: 'contain', width: '100%', height: '100%', padding: 0.5 },
                }}
              >
                {typeof businessPartner.name === 'string' && businessPartner.name.length > 0
                  ? businessPartner.name.charAt(0)
                  : null}
              </Avatar>
              <Stack spacing={0.5} sx={{ flexGrow: 1 }}>
                {businessPartner.url_businesspartner && (
                  <MuiLink
                    href={businessPartner.url_businesspartner}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="body2"
                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, wordBreak: 'break-all', textDecoration: 'none', color: 'text.primary' }}
                  >
                    <LanguageIcon color="action" fontSize="small" />{' '}
                    {getDisplayUrl(businessPartner.url_businesspartner)}
                  </MuiLink>
                )}
                {businessPartner.email && (
                  <MuiLink
                    href={isPublic ? undefined : `mailto:${businessPartner.email}`}
                    variant="body2"
                    sx={{ 
                        display: 'inline-flex', alignItems: 'center', gap: 1, 
                        wordBreak: 'break-all', textDecoration: 'none', color: 'text.primary',
                        cursor: isPublic ? 'default' : 'pointer' 
                    }}
                  >
                    <EmailIcon color="action" fontSize="small" /> {businessPartner.email}
                  </MuiLink>
                )}
                
                {businessPartner.address && (
                  <MuiLink
                    href={getMapsLink(businessPartner.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="body2"
                    color="text.secondary"
                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                  >
                    <LocationOnIcon color="action" fontSize="small" /> {businessPartner.address}
                  </MuiLink>
                )}
              </Stack>
            </Stack>
            
            <Divider />

            {loadingContent ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={24} /></Box>
            ) : contentError ? (
              <Alert severity="error" sx={{ m: 2 }}>{contentError}</Alert>
            ) : (
              <>
                {/* --- NACHRICHTEN --- */}
                <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, color: 'text.secondary', pl: 2 }}>
                  Aktuelle Nachrichten
                </Typography>
                <List dense>
                  {bpNews.length > 0 ? (
                    bpNews.map((item, index) => (
                      <React.Fragment key={item.id}>
                        <ListItem 
                            button={!isPublic as any} 
                            component={isPublic ? 'li' : 'a'} 
                            href={isPublic ? undefined : item.original_url} 
                            target={isPublic ? undefined : "_blank"} 
                            rel="noopener noreferrer"
                        >
                          <ListItemText
                            primary={<Typography variant="body2">{item.title}</Typography>}
                            secondaryTypographyProps={{ component: 'div' }}
                            secondary={
                              <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
                                <Typography variant="caption" color="text.secondary">{formatDate(item.published_date)}</Typography>
                                <Box sx={{ flexGrow: 1 }} />
                                <VoteComponent 
                                    item={item} 
                                    onVote={(vote) => handleVote(item.id, vote, 'news')} 
                                    disabled={isPublic}
                                />
                              </Box>
                            }
                          />
                        </ListItem>
                        {index < bpNews.length - 1 && <Divider component="li" variant="inset" />}
                      </React.Fragment>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>Keine Nachrichten gefunden.</Typography>
                  )}
                </List>

                {/* --- EVENTS --- */}
                <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, color: 'text.secondary', pl: 2 }}>
                  Kommende Events
                </Typography>
                <List dense>
                  {bpEvents.length > 0 ? (
                    bpEvents.map((item, index) => {
                      const eventDate = item.event_date ? new Date(item.event_date) : null;
                      const isPast = eventDate ? eventDate < today : false;
                      return (
                        <React.Fragment key={item.id}>
                          <ListItem>
                            <Box sx={{ mr: 2, display: 'flex', alignItems: 'center' }}>
                              <Button 
                                size="small" 
                                variant="outlined" 
                                component={isPublic ? 'button' : 'a'}
                                href={isPublic ? undefined : item.original_url} 
                                target={isPublic ? undefined : "_blank"} 
                                onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                                disabled={isPast || isPublic}
                              >
                                {isPublic ? 'Event' : 'Anmelden'}
                              </Button>
                            </Box>
                            <ListItemText
                              sx={isPast ? { color: 'text.disabled' } : undefined}
                              primary={<Typography variant="body2">{item.title}</Typography>}
                              secondaryTypographyProps={{ component: 'div' }}
                              secondary={
                                <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
                                  <Typography variant="caption" color="inherit">{formatDate(item.event_date)}</Typography>
                                </Box>
                              }
                            />
                          </ListItem>
                          {index < bpEvents.length - 1 && <Divider component="li" variant="inset" />}
                        </React.Fragment>
                      );
                    })
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>Keine Events gefunden.</Typography>
                  )}
                </List>
              </>
            )}

            {/* --- ADMIN BEREICH --- */}
            {canViewAdminInfo && (
              <Box sx={{ p: 2, pt: 2 }}>
                <Divider sx={{ mb: 2 }} />
                <Box display="flex" alignItems="center" mb={1}>
                  <DateRangeIcon color="action" sx={{ mr: 1.5, fontSize: '1rem' }} />
                  <Typography variant="caption">Abo bis: {formatDate(businessPartner.subscription_end_date)}</Typography>
                </Box>
                {userStats && (
                  <Box display="flex" alignItems="center" mb={1}>
                    <GroupIcon color="action" sx={{ mr: 1.5, fontSize: '1rem' }} />
                    <Typography variant="caption">Nutzer: <strong>{userStats.active}</strong> aktiv / <strong>{userStats.inactive}</strong> inaktiv</Typography>
                  </Box>
                )}
                {memberLevels && (
                  <Box display="flex" alignItems="center" mb={1}>
                    <Groups3Icon color="action" sx={{ mr: 1.5, fontSize: '1rem' }} />
                    <Typography variant="caption">Nutzergruppe: {memberLevels}</Typography>
                  </Box>
                )}
                <Box display="flex" alignItems="center">
                  <PaletteIcon color="action" sx={{ mr: 1.5, fontSize: '1rem' }} />
                  <Chip size="small" label="Primär" sx={{ bgcolor: primaryColor, color: '#fff', mr: 1 }} />
                  <Chip size="small" label="Sekundär" sx={{ bgcolor: secondaryColor, color: '#fff' }} />
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>
      )}
    </WidgetPaper>
  );
};

export default BusinessPartnerInfoWidget;