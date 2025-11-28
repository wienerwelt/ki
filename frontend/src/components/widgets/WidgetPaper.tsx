import React from 'react';
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
    onDelete?: (id: string, typeKey: string) => void;
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
    ...rest
}) => {
    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
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
           onDelete(widgetId, widgetTypeKey);
        }
        handleMenuClose();
    };

    const renderActions = () => {
        if (isMobile) {
            return (
                <Box onMouseDown={(e) => e.stopPropagation()} sx={{ display: 'flex', alignItems: 'center' }}>
                    {/* Dieses Icon bleibt grau, da es außerhalb des Titel-Containers ist */}
                    <IconButton size="small" onClick={handleMenuClick} sx={{ p: 0.5, ml: 0.5 }}>
                        <MoreVertIcon fontSize="small" />
                    </IconButton>
                    <Menu anchorEl={anchorEl} open={open} onClose={handleMenuClose}>
                        <MenuItem onClick={handleFeedbackClick}>
                            <FeedbackOutlinedIcon fontSize="small" sx={{ mr: 1.5 }} /> Feedback
                        </MenuItem>
                        {onDelete && isRemovable && (
                            <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
                                <CloseIcon fontSize="small" sx={{ mr: 1.5 }} /> Entfernen
                            </MenuItem>
                        )}
                    </Menu>
                </Box>
            );
        }
        
        return (
            <Box onMouseDown={(e) => e.stopPropagation()} sx={{ display: 'flex', alignItems: 'center' }}>
                <Tooltip title="Feedback geben">
                    <IconButton size="small" onClick={handleFeedbackClick} sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}>
                        <FeedbackOutlinedIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
                {onDelete && isRemovable && (
                    <Tooltip title="Entfernen">
                        <IconButton size="small" onClick={handleDelete} sx={{ opacity: 0.6, '&:hover': { opacity: 1, color: 'error.main' } }}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
        );
    };

    return (
        <Paper 
            elevation={3} 
            sx={{ 
                height: '100%', 
                display: 'flex', 
                flexDirection: 'column',
                overflow: 'hidden',
                border: theme.palette.mode === 'dark' ? '1px solid rgba(255, 255, 255, 0.08)' : 'none'
            }} 
            {...rest}
        >
            <Box 
                sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    p: isMobile ? '8px 12px' : '12px 16px',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    backgroundColor: (theme) => theme.palette.mode === 'dark' 
                        ? theme.palette.background.default 
                        : theme.palette.grey[50],
                    minHeight: isMobile ? 44 : 52,
                }}
            >
                {!isMobile && (
                    <Box 
                        className="widget-drag-handle" 
                        sx={{ 
                            cursor: 'grab', 
                            mr: 1, 
                            color: 'text.disabled',
                            display: 'flex',
                            alignItems: 'center',
                            '&:hover': { color: 'text.primary' },
                            '& svg': { mr: 0, fontSize: '1.2rem' } // Drag Icon bleibt grau
                        }}
                    >
                        <DragIndicatorIcon />
                    </Box>
                )}
                
                {/* --- HIER WIRD GESTYLT --- */}
                {/* Wir wenden die Farben nur auf diesen inneren Container an */}
                <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    flexGrow: 1, 
                    overflow: 'hidden', 
                    mr: 1,

                    // 1. Titel-Text Größe erzwingen
                    '& .MuiTypography-h6': {
                        fontSize: isMobile ? '1.1rem' : '1.25rem',
                        fontWeight: 600,
                        lineHeight: 1.2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    },

                    // 2. ALLE Icons im Titel-Bereich einfärben (Das Widget Icon)
                    '& svg': {
                        fontSize: isMobile ? '1.2rem' : '1.4rem',
                        marginRight: '8px',
                        // Auf Desktop: Primary Farbe. Auf Mobile: Grau.
                        color: isMobile ? theme.palette.text.secondary : theme.palette.primary.main
                    },

                    // 3. AUSNAHME: Icons in Buttons (z.B. Suche, Filter) sollen GRAU bleiben
                    // Wir überschreiben die Regel oben für Icons innerhalb von IconButton oder InputAdornment
                    '& .MuiIconButton-root svg, & .MuiInputAdornment-root svg': {
                        color: theme.palette.text.secondary,
                        mr: 0 // Reset margin für Funktions-Icons
                    }
                }}>
                    {title}
                </Box>
                
                {renderActions()}
            </Box>
            
            <Box sx={{ 
                flexGrow: 1, 
                overflowY: 'auto', 
                overflowX: 'hidden',
                p: noPadding ? 0 : { xs: 1.5, sm: 2 }, 
                display: 'flex', 
                flexDirection: 'column',
                position: 'relative'
            }}>
                {loading ? (
                    <Box sx={{ 
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        bgcolor: 'rgba(255,255,255,0.5)', zIndex: 1 
                    }}>
                        <CircularProgress size={30} />
                    </Box>
                ) : error ? (
                    <Alert severity="error" sx={{ m: 1 }}>{error}</Alert>
                ) : (
                    children
                )}
            </Box>
        </Paper>
    );
};

export default WidgetPaper;