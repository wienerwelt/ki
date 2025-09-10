import React, { useState, useEffect } from 'react';
import { Box, Typography, CircularProgress, Alert, Chip, Link } from '@mui/material';
import { FleetNewsWidgetProps } from '../../types/dashboard.types';
import WidgetPaper from './WidgetPaper';
import apiClient from '../../apiClient';

interface NewsItem {
    id: string;
    title: string;
    original_url: string;
    event_date?: string;
    description?: string;
    type?: string;
    is_read: boolean;
}

const FleetNewsWidget: React.FC<FleetNewsWidgetProps> = ({ data, loading, error, onDelete, widgetId, isRemovable }) => {
    const [items, setItems] = useState<NewsItem[]>([]);

    useEffect(() => {
        if (data?.data) {
            setItems(data.data);
        }
    }, [data]);

    const markAsRead = async (itemId: string) => {
        // Optimistisches Update der UI
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
            // Optional: Bei Fehler Zustand zurücksetzen oder neu laden
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
        <WidgetPaper title="Fuhrparkverband Austria News & Events" widgetId={widgetId} onDelete={onDelete} isRemovable={isRemovable} loading={loading} error={error}>
            {loading ? <CircularProgress size={24} /> :
                error ? <Alert severity="error">{error}</Alert> :
                    items.length > 0 ? (
                        <Box>
                            {items.map((item, index) => (
                                <Box key={item.id || index} sx={{ mb: 1.5 }}>
                                    <Link 
                                        href={item.original_url} 
                                        onClick={(e) => handleItemClick(e, item)}
                                        sx={{ textDecoration: 'none', cursor: 'pointer' }}
                                    >
                                        <Typography variant="subtitle2" sx={{ fontWeight: item.is_read ? 'normal' : 'bold' }}>
                                            {item.title}
                                        </Typography>
                                    </Link>
                                    {item.event_date && (
                                        <Typography variant="caption" color="text.secondary" display="block">
                                            Datum: {new Date(item.event_date).toLocaleDateString()}
                                        </Typography>
                                    )}
                                    <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                                        {item.description && item.description.substring(0, 150)}...
                                    </Typography>
                                    <Chip label={item.type || 'News'} size="small" sx={{ mt: 0.5 }} />
                                </Box>
                            ))}
                            <Typography variant="caption" sx={{ mt: 1 }}>Quelle: {data.source}</Typography>
                        </Box>
                    ) : (
                        <Typography variant="body2" color="text.secondary">Keine Nachrichten oder Veranstaltungen gefunden.</Typography>
                    )
            }
        </WidgetPaper>
    );
};

export default FleetNewsWidget;