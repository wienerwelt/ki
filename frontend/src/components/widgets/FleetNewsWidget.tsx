import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, CircularProgress, Alert, Chip, Link as MuiLink, Stack, Divider } from '@mui/material';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';

interface NewsItem {
    id: string;
    title: string;
    original_url: string;
    event_date?: string;
    summary?: string;
    category?: string;
    is_read: boolean;
}

interface FleetNewsWidgetProps extends BaseWidgetProps {
  icon?: React.ReactNode;
  title: string;
  category: string;
  widgetTypeKey: string;
}

const FleetNewsWidget: React.FC<FleetNewsWidgetProps> = ({ onDelete, widgetId, isRemovable, icon, title, category, widgetTypeKey }) => {
    const [items, setItems] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!category) {
            setError("Keine Kategorie im Widget-Typ konfiguriert.");
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.get('/api/data/scraped-content', {
                params: { category, limit: 10 },
                headers: { 'x-auth-token': token }
            });
            setItems(response.data?.data || []);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Nachrichten konnten nicht geladen werden.');
        } finally {
            setLoading(false);
        }
    }, [category]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const markAsRead = async (itemId: string) => {
        setItems(prevItems => prevItems.map(item =>
            item.id === itemId ? { ...item, is_read: true } : item
        ));
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.post(`/api/data/scraped-content/${itemId}/mark-as-read`, {}, {
                headers: { 'x-auth-token': token }
            });
        } catch (err) {
            console.error("Fehler beim Markieren als gelesen:", err);
        }
    };

    const handleItemClick = (e: React.MouseEvent, item: NewsItem) => {
        e.preventDefault();
        if (!item.is_read) {
            markAsRead(item.id);
        }
        window.open(item.original_url, '_blank', 'noopener,noreferrer');
    };

    return (
        <WidgetPaper
            title={<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>{icon}<Typography variant="h6">{title}</Typography></Box>}
            widgetId={widgetId}
            onDelete={onDelete}
            isRemovable={isRemovable}
            loading={loading}
            error={error}
            widgetTitle={title}
            widgetTypeKey={widgetTypeKey}
        >
            {items.length > 0 ? (
                <Stack spacing={2} divider={<Divider />}>
                    {items.map(item => (
                        <Box key={item.id}>
                            <MuiLink
                                href={item.original_url}
                                onClick={(e) => handleItemClick(e, item)}
                                sx={{ textDecoration: 'none', cursor: 'pointer', color: 'text.primary' }}
                            >
                                <Typography variant="subtitle2" sx={{ fontWeight: item.is_read ? 'normal' : 'bold' }}>
                                    {item.title}
                                </Typography>
                            </MuiLink>
                            {item.summary && (
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                    {item.summary.substring(0, 120)}...
                                </Typography>
                            )}
                            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                {item.event_date && (
                                    <Chip label={`Datum: ${new Date(item.event_date).toLocaleDateString()}`} size="small" variant="outlined" />
                                )}
                                {item.category && (
                                    <Chip label={item.category} size="small" />
                                )}
                            </Stack>
                        </Box>
                    ))}
                </Stack>
            ) : (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                    Keine Nachrichten oder Veranstaltungen gefunden.
                </Typography>
            )}
        </WidgetPaper>
    );
};

export default FleetNewsWidget;