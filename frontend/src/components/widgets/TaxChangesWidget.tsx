import React from 'react';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';
import { TaxChangesWidgetProps } from '../../types/dashboard.types';
import WidgetPaper from './WidgetPaper';

const TaxChangesWidget: React.FC<TaxChangesWidgetProps> = ({ data, loading, error, onDelete, widgetId, isRemovable }) => (
    <WidgetPaper title="Steueränderungen Kraftfahrzeuge Österreich" widgetId={widgetId} onDelete={onDelete} isRemovable={isRemovable} loading={loading} error={error}>
        {loading ? <CircularProgress size={24} /> :
            error ? <Alert severity="error">{error}</Alert> :
                data && data.data && data.data.length > 0 ? (
                    <Box>
                        {data.data.map((change: any, index: number) => (
                            <Box key={change.id || index} sx={{ mb: 1.5 }}>
                                <Typography variant="subtitle2" component="a" href={change.original_url} target="_blank" rel="noopener noreferrer" sx={{ textDecoration: 'none' }}>
                                    {change.title}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" display="block">
                                    Datum: {new Date(change.change_date).toLocaleDateString()}
                                </Typography>
                                <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                                    {change.summary && change.summary.substring(0, 150)}...
                                </Typography>
                            </Box>
                        ))}
                        <Typography variant="caption" sx={{ mt: 1 }}>Quelle: {data.source}</Typography>
                    </Box>
                ) : (
                    <Typography variant="body2" color="text.secondary">Keine Steueränderungen gefunden.</Typography>
                )
        }
    </WidgetPaper>
);

export default TaxChangesWidget;