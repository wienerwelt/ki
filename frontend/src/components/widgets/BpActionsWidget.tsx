import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, CircularProgress, Alert,
    Card, CardMedia, CardContent, Link as MuiLink, Skeleton
} from '@mui/material';
import ImageIcon from '@mui/icons-material/Image';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';

// Swiper-Komponenten und Stile importieren
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCoverflow, Pagination, Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/effect-coverflow';
import 'swiper/css/pagination';
import 'swiper/css/navigation';

// --- Interfaces ---
interface Action {
    id: string;
    layout_type: 'layout_1' | 'layout_2'; // Behalten für potenzielle zukünftige Layouts
    title: string;
    content_text: string;
    link_url: string;
    image_url: string;
    created_at: string;
}

interface BpActionsWidgetProps extends BaseWidgetProps {
    icon?: React.ReactNode;
    title: string;
}

// --- Hauptkomponente ---
const BpActionsWidget: React.FC<BpActionsWidgetProps> = ({ onDelete, widgetId, isRemovable, icon, title }) => {
    const [items, setItems] = useState<Action[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            // API-Aufruf ohne Paginierung, um alle Aktionen für den Slider zu laden
            const response = await apiClient.get(`/api/data/actions`, { headers: { 'x-auth-token': token } });
            setItems(response.data?.data || []);
        } catch (err: any) {
            setError(err.response?.data?.message || `Aktionen konnten nicht geladen werden.`);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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
            widgetId={widgetId || ''} onDelete={onDelete} isRemovable={isRemovable} loading={isLoading} error={error}
        >
            <Box sx={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1 }}>
                {items.length > 0 ? (
                    <Swiper
                        effect={'coverflow'}
                        grabCursor={true}
                        centeredSlides={true}
                        slidesPerView={'auto'}
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
                            <SwiperSlide key={action.id} style={{ width: '80%', maxWidth: '300px' }}>
                                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                    {action.image_url ? (
                                        <CardMedia
                                            component="img"
                                            height="140"
                                            image={action.image_url}
                                            alt={action.title}
                                            onError={(e: any) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                                        />
                                    ) : null}
                                    {/* Platzhalter wird nur angezeigt, wenn kein Bild da ist oder es nicht geladen werden kann */}
                                    <Box sx={{ display: action.image_url ? 'none' : 'flex' }}>
                                        {renderPlaceholder()}
                                    </Box>
                                    <CardContent sx={{ flexGrow: 1 }}>
                                        <Typography gutterBottom variant="h6" component="div">
                                            {action.title}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {action.content_text}
                                        </Typography>
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
                        {isLoading ? '' : 'Keine aktiven Aktionen verfügbar.'}
                    </Typography>
                )}
            </Box>
        </WidgetPaper>
    );
};

export default BpActionsWidget;
