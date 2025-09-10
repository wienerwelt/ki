// src/components/widgets/BusinessPartnerActionsWidget.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Alert, Card, CardMedia, CardContent, Link as MuiLink, Skeleton
} from '@mui/material';
import ImageIcon from '@mui/icons-material/Image';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';

// Swiper
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCoverflow, Pagination, Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/effect-coverflow';
import 'swiper/css/pagination';
import 'swiper/css/navigation';

interface Action {
  id: number;
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
}

const BpActionsWidget: React.FC<BpActionsWidgetProps> = ({
  onDelete,
  widgetId,
  isRemovable,
  icon,
  title,
}) => {
  const [items, setItems] = useState<Action[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // apiClient hängt normalerweise schon den Auth-Header an.
      // Falls dein apiClient NICHT automatisch auth’d, kannst du hier optional den Token ergänzen.
      const { data } = await apiClient.get(`/api/data/actions`, {
        // headers: { 'x-auth-token': localStorage.getItem('jwt_token') || '' }
        params: { page: 1, limit: 10 },
      });
      const list: Action[] = data?.data || [];
      setItems(list);
    } catch (err: any) {
      console.warn('Fehler beim Laden der Aktionen:', err);
      setError(err?.response?.data?.message || `Aktionen konnten nicht geladen werden.`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const renderPlaceholder = () => (
    <Box
      sx={{
        height: 140,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'grey.200',
        flexDirection: 'column',
        color: 'text.secondary',
      }}
    >
      <ImageIcon sx={{ fontSize: 40, mb: 1 }} />
      <Typography variant="caption">Keine Grafik</Typography>
    </Box>
  );

  return (
    <WidgetPaper
      title={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {icon}
          <Typography variant="h6">{title || 'Aktionen'}</Typography>
        </Box>
      }
      widgetTitle={title || 'Aktionen'}
      widgetTypeKey="business-partner-actions"
      widgetId={widgetId || ''}
      onDelete={onDelete}
      isRemovable={!!isRemovable}
      loading={false}           // internes Loading-UI unten
      error={undefined}         // eigenes Error-UI unten
    >
      <Box
        sx={{
          height: '100%',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 1,
        }}
      >
        {isLoading ? (
          <Box sx={{ width: '100%' }}>
            <Skeleton variant="rounded" height={180} sx={{ mb: 2 }} />
            <Skeleton variant="rounded" height={180} />
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
                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  {action.image_url ? (
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
                  ) : null}

                  {/* Platzhalter, wenn kein Bild da oder Bildfehler */}
                  <Box sx={{ display: action.image_url ? 'none' : 'flex' }}>
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
                      <MuiLink href={action.link_url} target="_blank" rel="noopener" variant="button">
                        Mehr erfahren
                      </MuiLink>
                    </Box>
                  )}
                </Card>
              </SwiperSlide>
            ))}
          </Swiper>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Keine aktiven Aktionen verfügbar.
          </Typography>
        )}
      </Box>
    </WidgetPaper>
  );
};

export default BpActionsWidget;
