import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Paper, Box, Tooltip, IconButton, CircularProgress, Alert,
    Menu, MenuItem, useTheme, useMediaQuery
} from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import CloseIcon from '@mui/icons-material/Close';
import FeedbackOutlinedIcon from '@mui/icons-material/FeedbackOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';

export interface WidgetPaperProps {
    title: React.ReactNode;
    widgetTitle: string; 
    widgetTypeKey: string;
    children: React.ReactNode;
    widgetId: string;
    onDelete?: (id: string, typeKey: string) => void; // Angepasste Signatur für Konsistenz
    isRemovable?: boolean;
    noPadding?: boolean;
    loading?: boolean;
    error?: string | null;
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
    loading = false,
    error = null,
    ...rest // Nimmt die Props von react-grid-layout entgegen
}) => {
    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);

    const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
    };

    const handleFeedbackClick = () => {
        navigate('/feedback', {
            state: { type: 'suggestion', widget: widgetTitle, widgetKey: widgetTypeKey }
        });
        handleMenuClose();
    };
    
    const handleDelete = () => {
        if (onDelete) {
           if (window.confirm(`Möchten Sie das Widget "${widgetTitle}" wirklich entfernen?`)) {
               onDelete(widgetId, widgetTypeKey);
           }
        }
        handleMenuClose();
    };

    const renderActions = () => {
        if (isMobile) {
            return (
                <Box onMouseDown={(e) => e.stopPropagation()}>
                    <IconButton size="small" onClick={handleMenuClick}>
                        <MoreVertIcon fontSize="small" />
                    </IconButton>
                    <Menu anchorEl={anchorEl} open={open} onClose={handleMenuClose}>
                        <MenuItem onClick={handleFeedbackClick}>
                            <FeedbackOutlinedIcon fontSize="small" sx={{ mr: 1.5 }} /> Feedback geben
                        </MenuItem>
                        {onDelete && isRemovable && (
                            <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
                                <CloseIcon fontSize="small" sx={{ mr: 1.5 }} /> Widget entfernen
                            </MenuItem>
                        )}
                    </Menu>
                </Box>
            );
        }
        
        return (
            <Box onMouseDown={(e) => e.stopPropagation()}>
                <Tooltip title="Feedback zu diesem Widget geben">
                    <IconButton size="small" onClick={handleFeedbackClick}>
                        <FeedbackOutlinedIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
                {onDelete && isRemovable && (
                    <Tooltip title="Widget entfernen">
                        <IconButton size="small" onClick={handleDelete}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
        );
    };

    return (
        <Paper elevation={3} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }} {...rest}>
            <Box 
                // KORREKTUR: className="widget-header" und cursor: 'move' wurden von diesem Container entfernt
                sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    p: 1.5,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    backgroundColor: (theme) => theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100],
                }}
            >
                {/* KORREKTUR: Das Icon ist jetzt der alleinige "Anfasser" mit der korrekten Klasse */}
                <Box className="widget-drag-handle" sx={{ cursor: 'grab', mr: 1, color: 'text.disabled' }}>
                    <DragIndicatorIcon />
                </Box>
                
                <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1, overflow: 'hidden' }}>
                    {title}
                </Box>
                
                {renderActions()}
            </Box>
            
            <Box sx={{ flexGrow: 1, overflow: 'auto', p: noPadding ? 0 : 2, display: 'flex', flexDirection: 'column' }}>
                {loading ? (
                    <Box sx={{ m: 'auto', textAlign: 'center' }}><CircularProgress /></Box>
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