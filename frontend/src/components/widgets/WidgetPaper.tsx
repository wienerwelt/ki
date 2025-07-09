import React from 'react';
import { Paper, Box, Typography, Tooltip, IconButton } from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import DeleteIcon from '@mui/icons-material/Delete';

// 1. KORREKTUR: Das Interface wird angepasst, um React.ReactNode für den Titel zu erlauben
export interface WidgetPaperProps {
    title: React.ReactNode; // Kann jetzt ein String oder ein JSX-Element sein
    children: React.ReactNode;
    widgetId: string;
    onDelete?: (id: string) => void;
    isRemovable?: boolean;
    loading?: boolean;
    error?: string | null;
    noPadding?: boolean;
}

const WidgetPaper: React.FC<WidgetPaperProps> = ({ 
    children, 
    title, 
    widgetId, 
    onDelete, 
    isRemovable = true, 
    noPadding = false 
}) => (
    <Paper elevation={3} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box 
            className="widget-header" // Wichtig für den Drag-Handle
            sx={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                p: 1.5,
                borderBottom: '1px solid',
                borderColor: 'divider',
                cursor: 'move',
                backgroundColor: 'rgba(0,0,0,0.02)'
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
                <DragIndicatorIcon sx={{ mr: 1, color: 'text.disabled' }} />
                {/* 2. KORREKTUR: Intelligente Anzeige des Titels */}
                {typeof title === 'string' ? (
                    <Typography variant="h6" component="div">{title}</Typography>
                ) : (
                    title // Wenn es bereits ein Element ist, wird es direkt gerendert
                )}
            </Box>
            {onDelete && isRemovable && (
                <Tooltip title="Widget entfernen">
                    <IconButton 
                        size="small" 
                        onClick={() => onDelete(widgetId)}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            )}
        </Box>
        
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: noPadding ? 0 : 2 }}>
            {children}
        </Box>
    </Paper>
);

export default WidgetPaper;