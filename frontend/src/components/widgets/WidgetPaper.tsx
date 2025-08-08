import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Paper, Box, Typography, Tooltip, IconButton, CircularProgress, Alert } from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import CloseIcon from '@mui/icons-material/Close';
import FeedbackOutlinedIcon from '@mui/icons-material/FeedbackOutlined';

// === GEÄNDERT: Props-Interface erweitert ===
export interface WidgetPaperProps {
    title: React.ReactNode;
    widgetTitle: string; 
    widgetTypeKey: string;
    children: React.ReactNode;
    widgetId: string;
    onDelete?: (id: string) => void;
    isRemovable?: boolean;
    noPadding?: boolean;
    loading?: boolean; // Hinzugefügt
    error?: string | null; // Hinzugefügt
}

const WidgetPaper: React.FC<WidgetPaperProps> = ({ 
    children, 
    title, 
    widgetTitle,
    widgetTypeKey,
    widgetId, 
    onDelete, 
    isRemovable = true, 
    noPadding = false,
    loading = false, // Hinzugefügt
    error = null     // Hinzugefügt
}) => {
    const navigate = useNavigate();

    const handleFeedbackClick = () => {
        navigate('/feedback', {
            state: {
                type: 'suggestion',
                widget: widgetTitle,
                widgetKey: widgetTypeKey,
            }
        });
    };

    return (
        <Paper elevation={3} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box 
                className="widget-header"
                sx={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    p: 1.5,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    cursor: 'move',
                    backgroundColor: (theme) => theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100],
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
                    <DragIndicatorIcon sx={{ mr: 1, color: 'text.disabled' }} />
                    {title}
                </Box>
                <Box onMouseDown={(e) => e.stopPropagation()}>
                    <Tooltip title="Feedback zu diesem Widget geben">
                        <IconButton 
                            size="small" 
                            onClick={handleFeedbackClick}
                        >
                            <FeedbackOutlinedIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    {onDelete && isRemovable && (
                        <Tooltip title="Widget entfernen">
                            <IconButton 
                                size="small" 
                                onClick={() => onDelete(widgetId)}
                            >
                                <CloseIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                </Box>
            </Box>
            
            {/* === GEÄNDERT: Zentrale Logik für Lade- & Fehlerzustand === */}
            <Box sx={{ flexGrow: 1, overflow: 'auto', p: noPadding ? 0 : 2, display: 'flex', flexDirection: 'column' }}>
                {loading ? (
                    <Box sx={{ m: 'auto', textAlign: 'center' }}>
                        <CircularProgress />
                    </Box>
                ) : error ? (
                    <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>
                ) : (
                    children
                )}
            </Box>
        </Paper>
    );
};

export default WidgetPaper;