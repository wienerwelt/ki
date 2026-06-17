// frontend/src/components/widgets/BusinessPartnerActionsWidget.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Alert, Card, CardMedia, CardContent, Link as MuiLink, Skeleton, useTheme
} from '@mui/material';
import ImageIcon from '@mui/icons-material/Image';
import PublicIcon from '@mui/icons-material/Public';
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

interface Action {
  id: number | string;
  layout_type: 'layout_1' | 'layout_2' | string;
  title: string;
  content_text: string | null;
  link_url: string | null;
  image_url: string | null;
  created_at: string;
}

interface BpActionsWidgetProps extends BaseWidgetProps {
  icon?: React.ReactNode;
  title?: string;
  isPublic?: boolean; 
  partnerId?: string;
  primaryColor?: string;
}

// --- Hilfsfunktionen für YouTube ---
const isYouTubeUrl = (url: string | null) => {
    if (!url) return false;
    return url.includes('youtube.com') || url.includes('youtu.be');
};

const getYouTubeVideoId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};

const BpActionsWidget: React.FC<BpActionsWidgetProps> = ({
  onDelete,
  widgetId,
  isRemovable,
  icon,
  title,
  isPublic = false,
  partnerId,
  primaryColor, // NEU
}) => {
  const theme = useTheme();
  const [items, setItems] = useState<Action[]>([]);
  const customPrimary = primaryColor || theme.palette.primary.main;
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const endpoint = isPublic ? `/api/public/actions` : `/api/data/actions`;
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
      setItems(list);
    } catch (err: any) {
      console.warn('Fehler beim Laden der Aktionen:', err);
      setError(err?.response?.data?.message || `Aktionen konnten nicht geladen werden.`);
    } finally {
      setIsLoading(false);
    }
  }, [isPublic, partnerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const renderPlaceholder = () => (
    <Box
      sx={{
        height: 140,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.1)',
        flexDirection: 'column',
        color: 'text.secondary',
      }}
    >
      <ImageIcon sx={{ fontSize: 40, mb: 1 }} />
      <Typography variant="caption">Keine Medien</Typography>
    </Box>
  );

return (
    <WidgetPaper
      title={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {icon}
          <Typography variant={isPublic ? "h5" : "h6"} sx={{ fontWeight: isPublic ? 950 : 800, color: isPublic ? '#061B33' : 'inherit' }}>
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
    >
      <Box sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
        
        {isPublic && (
            <Box sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(16, 185, 129, 0.1)' : '#d1fae5', p: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                <PublicIcon sx={{ fontSize: 16, color: '#10b981' }} />
                <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 'bold' }}>Live-Aktionen des Partners</Typography>
            </Box>
        )}

        <Box
          sx={{
            flexGrow: 1,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 2,
          }}
        >
          {isLoading ? (
            <Box sx={{ width: '100%' }}>
              <Skeleton variant="rounded" height={180} sx={{ mb: 2 }} />
            </Box>
          ) : error ? (
            <Alert severity="error">{error}</Alert>
          ) : items.length > 0 ? (
            <Swiper
              effect="coverflow"
              grabCursor
              centeredSlides
              slidesPerView="auto"
              coverflowEffect={{
                rotate: 50,
                stretch: 0,
                depth: 100,
                modifier: 1,
                slideShadows: true,
              }}
              pagination={{ clickable: true }}
              navigation={items.length > 1}
              modules={[EffectCoverflow, Pagination, Navigation]}
              style={{ width: '100%', height: '100%', paddingBottom: '30px' }}
            >
              {items.map((action) => (
                <SwiperSlide key={action.id} style={{ width: '80%', maxWidth: 320 }}>
                  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
                    
                    {/* MEDIEN-BEREICH: YouTube oder Bild */}
                    {action.image_url ? (
                        isYouTubeUrl(action.image_url) ? (
                            <CardMedia
                                component="iframe"
                                height="140"
                                src={`https://www.youtube.com/embed/${getYouTubeVideoId(action.image_url)}`}
                                title={action.title}
                                sx={{ border: 0 }}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            />
                        ) : (
                            <CardMedia
                                component="img"
                                height="140"
                                image={action.image_url}
                                alt={action.title}
                                onError={(e: any) => {
                                    e.currentTarget.style.display = 'none';
                                    if (e.currentTarget.nextSibling) {
                                        (e.currentTarget.nextSibling as HTMLElement).style.display = 'flex';
                                    }
                                }}
                            />
                        )
                    ) : null}

                    {/* Platzhalter, falls URL leer oder Bildfehler (wird via onError aktiviert) */}
                    <Box sx={{ display: action.image_url ? 'none' : 'flex', width: '100%' }}>
                      {renderPlaceholder()}
                    </Box>

                    <CardContent sx={{ flexGrow: 1 }}>
                      <Typography gutterBottom variant="h6" component="div">
                        {action.title}
                      </Typography>
                      {action.content_text && (
                        <Typography variant="body2" color="text.secondary">
                          {action.content_text}
                        </Typography>
                      )}
                    </CardContent>

                    {action.link_url && (
                      <Box sx={{ p: 2, pt: 0 }}>
                        <MuiLink 
                            href={action.link_url} 
                            target="_blank" 
                            rel="noopener" 
                            variant="button"
                            sx={{ color: customPrimary, fontWeight: 'bold' }}
                        >
                          Mehr
                        </MuiLink>
                      </Box>
                    )}
                  </Card>
                </SwiperSlide>
              ))}
            </Swiper>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Derzeit keine aktuellen Aktionen verfügbar.
            </Typography>
          )}
        </Box>
      </Box>
    </WidgetPaper>
  );
};

export default BpActionsWidget;