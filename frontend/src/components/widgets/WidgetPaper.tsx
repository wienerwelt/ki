// frontend/src/components/widgets/WidgetPaper.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Paper, Box, Typography, Tooltip, IconButton, CircularProgress, Alert,
    Menu, MenuItem, useTheme, useMediaQuery // NEU
} from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import CloseIcon from '@mui/icons-material/Close';
import FeedbackOutlinedIcon from '@mui/icons-material/FeedbackOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert'; // NEU: Das "Three-Dot" Icon

export interface WidgetPaperProps {
    title: React.ReactNode;
    widgetTitle: string; 
    widgetTypeKey: string;
    children: React.ReactNode;
    widgetId: string;
    onDelete?: (id: string) => void;
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
    error = null
}) => {
    const navigate = useNavigate();

    // --- NEU: Logik für das responsive Menü ---
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
        handleMenuClose(); // Menü nach Klick schließen
    };
    
    const handleDelete = () => {
        if (onDelete) {
            onDelete(widgetId);
        }
        handleMenuClose(); // Menü nach Klick schließen
    };

    // NEU: Funktion, die entweder die Icons oder das Menü rendert
    const renderActions = () => {
        if (isMobile) {
            return (
                <>
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
                </>
            );
        }
        
        // Desktop-Ansicht
        return (
            <Box onMouseDown={(e) => e.stopPropagation()}>
                <Tooltip title="Feedback zu diesem Widget geben">
                    <IconButton size="small" onClick={handleFeedbackClick}>
                        <FeedbackOutlinedIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
                {onDelete && isRemovable && (
                    <Tooltip title="Widget entfernen">
                        <IconButton size="small" onClick={() => onDelete(widgetId)}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
        );
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
                {/* KORREKTUR: Die Aktionen werden jetzt durch die neue Funktion gerendert */}
                {renderActions()}
            </Box>
            
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