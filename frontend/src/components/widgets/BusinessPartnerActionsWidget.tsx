// frontend/src/components/widgets/BusinessPartnerActionsWidget.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  Chip,
  Divider,
  Skeleton,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ImageIcon from '@mui/icons-material/Image';
import PublicIcon from '@mui/icons-material/Public';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ContactMailIcon from '@mui/icons-material/ContactMail';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';

// Swiper
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCoverflow, Pagination, Navigation } from 'swiper/modules';

// @ts-ignore
import 'swiper/css';
// @ts-ignore
import 'swiper/css/effect-coverflow';
// @ts-ignore
import 'swiper/css/pagination';
// @ts-ignore
import 'swiper/css/navigation';

interface ActionInfo {
  contact?: {
    name?: string | null;
    role?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  highlights?: string[];
  legalNote?: string | null;
}

interface Action {
  id: number | string;
  layout_type: 'layout_1' | 'layout_2' | 'layout_3' | 'layout_compact' | string;
  title: string;
  content_text?: string | null;
  description?: string | null;
  link_url: string | null;
  image_url: string | null;
  created_at: string;
  promotion_label?: string | null;
  promotion_type?: string | null;
  cta_label?: string | null;
  secondary_image_url?: string | null;
  secondary_link_url?: string | null;
  secondary_cta_label?: string | null;
  priority?: number | null;
  info?: ActionInfo | null;
  legal_note?: string | null;
  legalNote?: string | null;
  directory_provider_id?: string | null;
  directory_provider_name?: string | null;
  directory_provider_logo_url?: string | null;
  software_tool_id?: string | null;
  software_tool_name?: string | null;
  software_tool_url?: string | null;
  software_tool_logo_url?: string | null;
}

interface BpActionsWidgetProps extends BaseWidgetProps {
  icon?: React.ReactNode;
  title?: string;
  isPublic?: boolean;
  partnerId?: string;
  primaryColor?: string;
}

const getAssetUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/logos/') || url.startsWith('/images/') || url.startsWith('/static/') || url.startsWith('/actions/')) return url;

  let baseUrl = import.meta.env.VITE_API_URL || '';
  if (baseUrl === '/') baseUrl = '';
  if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

  let cleanUrl = url.startsWith('/') ? url : `/${url}`;
  if (cleanUrl.startsWith('/api/')) cleanUrl = cleanUrl.substring(4);
  const apiPrefix = baseUrl.endsWith('/api') ? '' : '/api';
  return `${baseUrl}${apiPrefix}${cleanUrl}`;
};

// --- Hilfsfunktionen für YouTube ---
const isYouTubeUrl = (url: string | null | undefined) => {
  if (!url) return false;
  return url.includes('youtube.com') || url.includes('youtu.be');
};

const getYouTubeVideoId = (url: string) => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
};

const BpActionsWidget: React.FC<BpActionsWidgetProps> = ({
  onDelete,
  widgetId,
  isRemovable,
  icon,
  title,
  isPublic = false,
  partnerId,
  primaryColor,
}) => {
  const theme = useTheme();
  const [items, setItems] = useState<Action[]>([]);
  const customPrimary = primaryColor || theme.palette.primary.main;
  const darkBlue = '#061B33';
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const endpoint = isPublic ? '/api/public/actions' : '/api/data/actions';
      const params: any = { page: 1, limit: 10 };

      if (isPublic) {
        if (!partnerId) {
          setItems([]);
          setIsLoading(false);
          return;
        }
        params.partnerId = partnerId;
      }

      const { data } = await apiClient.get(endpoint, { params });
      const list: Action[] = data?.data || data || [];
      setItems(Array.isArray(list) ? list : []);
    } catch (err: any) {
      console.warn('Fehler beim Laden der Aktionen:', err);
      setError(err?.response?.data?.message || 'Aktionen konnten nicht geladen werden.');
    } finally {
      setIsLoading(false);
    }
  }, [isPublic, partnerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const renderPlaceholder = (height: number | string = 160) => (
    <Box
      sx={{
        height,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: alpha(customPrimary, 0.08),
        flexDirection: 'column',
        color: alpha(darkBlue, 0.45),
      }}
    >
      <ImageIcon sx={{ fontSize: 40, mb: 1 }} />
      <Typography variant="caption">Keine Medien</Typography>
    </Box>
  );

  const renderMedia = (url: string | null | undefined, titleText: string, height: number | string = 160) => {
    if (!url) return renderPlaceholder(height);
    const normalizedUrl = getAssetUrl(url);

    if (isYouTubeUrl(normalizedUrl)) {
      const videoId = getYouTubeVideoId(normalizedUrl);
      if (!videoId) return renderPlaceholder(height);
      return (
        <CardMedia
          component="iframe"
          height={height}
          src={`https://www.youtube.com/embed/${videoId}`}
          title={titleText}
          sx={{ border: 0, display: 'block', bgcolor: 'grey.900' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      );
    }

    return (
      <Box sx={{ height, width: '100%', bgcolor: alpha(customPrimary, 0.08), overflow: 'hidden' }}>
        <Box
          component="img"
          src={normalizedUrl}
          alt={titleText}
          loading="lazy"
          sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={(e: any) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      </Box>
    );
  };

  const renderContact = (info?: ActionInfo | null) => {
    const contact = info?.contact;
    if (!contact?.name && !contact?.email && !contact?.phone) return null;

    const contactTextColor = isPublic ? alpha(darkBlue, 0.84) : theme.palette.text.secondary;

    return (
      <Box
        sx={{
          mt: 1.5,
          p: 1.25,
          borderRadius: 2,
          bgcolor: isPublic ? alpha(customPrimary, 0.055) : alpha(customPrimary, 0.07),
          border: `1px solid ${alpha(customPrimary, isPublic ? 0.22 : 0.12)}`,
        }}
      >
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <ContactMailIcon sx={{ fontSize: 18, color: customPrimary, mt: 0.2, flexShrink: 0 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 900, color: isPublic ? darkBlue : 'text.primary' }}>
              {contact?.name || 'Ansprechpartner'}
            </Typography>
            {contact?.role && (
              <Typography variant="caption" sx={{ display: 'block', color: contactTextColor, fontWeight: isPublic ? 700 : 400 }}>
                {contact.role}
              </Typography>
            )}
            {contact?.email && (
              <Typography variant="caption" sx={{ display: 'block', color: contactTextColor, fontWeight: isPublic ? 700 : 400, wordBreak: 'break-all' }}>
                {contact.email}
              </Typography>
            )}
            {contact?.phone && (
              <Typography variant="caption" sx={{ display: 'block', color: contactTextColor, fontWeight: isPublic ? 700 : 400 }}>
                {contact.phone}
              </Typography>
            )}
          </Box>
        </Stack>
      </Box>
    );
  };

  const renderActionCard = (action: Action) => {
    const isHorizontal = action.layout_type === 'layout_1';
    const isHero = action.layout_type === 'layout_3';
    const mediaHeight = isHero ? 190 : isPublic ? 160 : 140;
    const secondaryImageUrl = action.secondary_image_url ? getAssetUrl(action.secondary_image_url) : '';
    const highlights = Array.isArray(action.info?.highlights) ? action.info?.highlights?.filter(Boolean).slice(0, 3) : [];
    const descriptionText = action.content_text || action.description || '';
    const legalNoteText = action.info?.legalNote || action.legal_note || action.legalNote || '';

    return (
      <Card
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: isHorizontal ? { xs: 'column', sm: 'row' } : 'column',
          bgcolor: isPublic ? '#fff' : 'background.paper',
          color: isPublic ? darkBlue : 'inherit',
          borderRadius: 3,
          overflow: isPublic ? 'visible' : 'hidden',
          border: '1px solid',
          borderColor: isPublic ? alpha(darkBlue, 0.1) : 'divider',
          boxShadow: isPublic ? `0 18px 40px ${alpha(darkBlue, 0.08)}` : theme.shadows[1],
        }}
      >
        <Box sx={{ width: isHorizontal ? { xs: '100%', sm: 150 } : '100%', flexShrink: 0, position: 'relative' }}>
          {renderMedia(action.image_url, action.title, isHorizontal ? '100%' : mediaHeight)}

          {action.promotion_label && (
            <Chip
              label={action.promotion_label}
              size="small"
              sx={{
                position: 'absolute',
                top: 10,
                left: 10,
                bgcolor: customPrimary,
                color: '#fff',
                fontWeight: 900,
                borderRadius: 999,
                boxShadow: `0 8px 18px ${alpha(customPrimary, 0.35)}`,
              }}
            />
          )}
        </Box>

        <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
          <CardContent sx={{ flexGrow: 1, p: isPublic ? 2.25 : 2 }}>
            {(action.directory_provider_name || action.software_tool_name || action.promotion_type === 'sponsored') && (
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 1.2 }}>
                {action.promotion_type === 'sponsored' && (
                  <Chip size="small" label="Sponsored" color="warning" sx={{ fontWeight: 900 }} />
                )}
                {action.directory_provider_name && (
                  <Chip size="small" variant="outlined" label={`Anbieter: ${action.directory_provider_name}`} sx={{ fontWeight: 800 }} />
                )}
                {action.software_tool_name && (
                  <Chip size="small" label={`Software: ${action.software_tool_name}`} sx={{ bgcolor: alpha(customPrimary, 0.1), color: customPrimary, fontWeight: 900 }} />
                )}
              </Stack>
            )}
            <Typography gutterBottom variant={isHero ? 'h5' : 'h6'} component="div" sx={{ fontWeight: 950, lineHeight: 1.15, color: isPublic ? darkBlue : 'inherit' }}>
              {action.title}
            </Typography>

            {descriptionText && (
              <Typography
                variant="body2"
                sx={{
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  color: isPublic ? alpha(darkBlue, 0.78) : 'text.secondary',
                  ...(isPublic
                    ? {}
                    : {
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }),
                }}
              >
                {descriptionText}
              </Typography>
            )}

            {highlights && highlights.length > 0 && (
              <Stack spacing={0.5} sx={{ mt: 1.5 }}>
                {highlights.map((item) => (
                  <Typography key={item} variant="caption" sx={{ color: isPublic ? alpha(darkBlue, 0.82) : 'text.secondary', fontWeight: 700 }}>
                    • {item}
                  </Typography>
                ))}
              </Stack>
            )}

            {secondaryImageUrl && (
              <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  component="img"
                  src={secondaryImageUrl}
                  alt={`${action.title} Zusatzbild`}
                  loading="lazy"
                  sx={{ width: 78, height: 52, borderRadius: 1.5, objectFit: 'cover', border: `1px solid ${alpha(darkBlue, 0.1)}` }}
                />
              </Box>
            )}

            {renderContact(action.info)}

            {legalNoteText && (
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  mt: 1.2,
                  fontStyle: 'italic',
                  whiteSpace: 'pre-wrap',
                  color: isPublic ? alpha(darkBlue, 0.62) : 'text.secondary',
                }}
              >
                {legalNoteText}
              </Typography>
            )}
          </CardContent>

          {(action.link_url || action.secondary_link_url) && (
            <>
              <Divider />
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ p: 2, pt: 1.5 }}>
                {action.link_url && (
                  <Button
                    href={action.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="contained"
                    size="small"
                    endIcon={<OpenInNewIcon fontSize="small" />}
                    sx={{
                      bgcolor: customPrimary,
                      color: '#fff',
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 900,
                      boxShadow: `0 8px 18px ${alpha(customPrimary, 0.28)}`,
                      '& .MuiButton-endIcon, & .MuiSvgIcon-root': { color: '#fff' },
                      '&:hover': { bgcolor: customPrimary, color: '#fff', filter: 'brightness(0.9)' },
                    }}
                  >
                    {action.cta_label || 'Mehr erfahren'}
                  </Button>
                )}
                {action.secondary_link_url && (
                  <Button
                    href={action.secondary_link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="outlined"
                    size="small"
                    sx={{ borderColor: alpha(customPrimary, 0.55), color: customPrimary, borderRadius: 2, textTransform: 'none', fontWeight: 900 }}
                  >
                    {action.secondary_cta_label || 'Kontakt aufnehmen'}
                  </Button>
                )}
              </Stack>
            </>
          )}
        </Box>
      </Card>
    );
  };

  return (
    <WidgetPaper
      title={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {icon || <PublicIcon sx={{ color: 'inherit' }} />}
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            {title || 'Aktionen'}
          </Typography>
        </Box>
      }
      widgetTitle={title || 'Aktionen'}
      widgetTypeKey="business-partner-actions"
      widgetId={widgetId || ''}
      onDelete={onDelete}
      isRemovable={!!isRemovable}
      loading={false}
      error={undefined}
      noPadding
      isPublic={isPublic}
    >
      <Box sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ flexGrow: 1, width: '100%', display: 'flex', alignItems: 'stretch', justifyContent: 'center', p: 2, minHeight: isPublic ? 560 : 300 }}>
          {isLoading ? (
            <Box sx={{ width: '100%' }}>
              <Skeleton variant="rounded" height={220} sx={{ mb: 2, borderRadius: 3 }} />
              <Skeleton variant="text" width="70%" />
              <Skeleton variant="text" width="45%" />
            </Box>
          ) : error ? (
            <Alert severity="error" sx={{ width: '100%' }}>{error}</Alert>
          ) : items.length > 0 ? (
            <Swiper
              effect="coverflow"
              grabCursor
              centeredSlides
              slidesPerView="auto"
              coverflowEffect={{
                rotate: isPublic ? 22 : 45,
                stretch: 0,
                depth: 95,
                modifier: 1,
                slideShadows: !isPublic,
              }}
              pagination={{ clickable: true }}
              navigation={items.length > 1}
              modules={[EffectCoverflow, Pagination, Navigation]}
              style={{ width: '100%', height: '100%', paddingBottom: '34px' }}
            >
              {items.map((action) => (
                <SwiperSlide key={action.id} style={{ width: isPublic ? '90%' : '80%', maxWidth: isPublic ? 640 : 340, height: 'auto' }}>
                  {renderActionCard(action)}
                </SwiperSlide>
              ))}
            </Swiper>
          ) : (
            <Box sx={{ width: '100%', textAlign: 'center', py: 4, border: '1px dashed', borderColor: 'divider', borderRadius: 3 }}>
              <ImageIcon sx={{ fontSize: 38, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                Derzeit keine aktuellen Aktionen verfügbar.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </WidgetPaper>
  );
};

export default BpActionsWidget;
