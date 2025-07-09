import React from 'react';
import { Box, Typography, CircularProgress, Alert, Chip } from '@mui/material';
import { FleetNewsWidgetProps } from '../../types/dashboard.types';
import WidgetPaper from './WidgetPaper';

const FleetNewsWidget: React.FC<FleetNewsWidgetProps> = ({ data, loading, error, onDelete, widgetId, isRemovable }) => (
    <WidgetPaper title="Fuhrparkverband Austria News & Events" widgetId={widgetId} onDelete={onDelete} isRemovable={isRemovable} loading={loading} error={error}>
        {loading ? <CircularProgress size={24} /> :
            error ? <Alert severity="error">{error}</Alert> :
                data && data.data && data.data.length > 0 ? (
                    <Box>
                        {data.data.map((item: any, index: number) => (
                            <Box key={item.id || index} sx={{ mb: 1.5 }}>
                                <Typography variant="subtitle2" component="a" href={item.original_url} target="_blank" rel="noopener noreferrer" sx={{ textDecoration: 'none' }}>
                                    {item.title}
                                </Typography>
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

export default FleetNewsWidget;