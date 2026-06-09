// frontend/src/components/widgets/WidgetPaper.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Paper, Box, Tooltip, IconButton, CircularProgress, Alert,
    Menu, MenuItem, useTheme, useMediaQuery, Button, alpha
} from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import CloseIcon from '@mui/icons-material/Close';
import FeedbackOutlinedIcon from '@mui/icons-material/FeedbackOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';

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
    isPublic?: boolean; 
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
    isPublic = false,
    ...rest
}) => {
    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);
    const [mobileExpanded, setMobileExpanded] = useState(false);

    const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
    const handleMenuClose = () => setAnchorEl(null);

    const handleFeedbackClick = () => {
        navigate('/feedback', {
            state: { type: 'suggestion', widget: widgetTitle, widgetKey: widgetTypeKey }
        });
        handleMenuClose();
    };
    
    const handleDelete = () => {
        if (onDelete) onDelete(widgetId, widgetTypeKey);
        handleMenuClose();
    };

    const renderActions = () => {
        // Im Public-Schaufenster gibt es kein Feedback oder Löschen
        if (isPublic) return null;

        // Mobile: Drei-Punkte-Menü
        if (isMobile) {
            return (
                <Box onMouseDown={(e) => e.stopPropagation()} sx={{ display: 'flex', alignItems: 'center' }}>
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
        
        // Desktop: Inline-Icons (Werden über CSS im Header ein-/ausgeblendet)
        return (
            <Box className="widget-actions" onMouseDown={(e) => e.stopPropagation()} sx={{ display: 'flex', alignItems: 'center', transition: 'opacity 0.2s', opacity: 0 }}>
                <Tooltip title="Feedback geben">
                    <IconButton size="small" onClick={handleFeedbackClick} sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: 'action.hover' } }}>
                        <FeedbackOutlinedIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
                {onDelete && isRemovable && (
                    <Tooltip title="Entfernen">
                        <IconButton size="small" onClick={handleDelete} sx={{ color: 'text.secondary', '&:hover': { color: 'error.main', bgcolor: 'error.lighter' } }}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
        );
    };

    return (
        <Paper 
            elevation={isPublic ? 0 : 3}
            sx={{ 
                height: isMobile ? 'auto' : '100%', 
                display: 'flex', 
                flexDirection: 'column',
                overflow: 'hidden',
                borderRadius: 2,
                border: theme.palette.mode === 'dark' ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0,0,0,0.04)',
                ...(isPublic && {
                    backgroundColor: 'rgba(255,255,255,0.6)', 
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    transition: 'all 0.3s ease'
                }),
                // Desktop Hover-Logik: Header-Elemente sichtbar machen
                '&:hover .widget-actions': { opacity: 1 },
                '&:hover .widget-drag-handle': { opacity: 0.5 }
            }} 
            {...rest}
        >
            {/* --- WIDGET HEADER --- */}
<Box 
    sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        p: isMobile ? '8px 12px' : '10px 16px',
        borderBottom: '1px solid',
        borderColor: 'rgba(255,255,255,0.1)', // Einheitliche, zarte Linie
        
        // HIER IST DER FIX: Einheitlicher Hintergrund für ALLE Header im Public Mode
        backgroundColor: isPublic 
            ? 'rgba(0, 0, 0, 0.2)'  // <--- Das sorgt für den einheitlichen Glass-Header
            : (theme.palette.mode === 'dark' ? 'background.paper' : '#f8fafc'),
            
        minHeight: isMobile ? 44 : 48,
    }}
>
                {!isMobile && !isPublic && (
                    <Box 
                        className="widget-drag-handle" 
                        sx={{ 
                            cursor: 'grab', 
                            mr: 1, 
                            opacity: 0, 
                            transition: 'opacity 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            '&:hover': { opacity: '1 !important', color: 'primary.main' },
                            '& svg': { fontSize: '1.2rem', color: 'text.disabled' }
                        }}
                    >
                        <DragIndicatorIcon />
                    </Box>
                )}
                
                <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    flexGrow: 1, 
                    overflow: 'hidden', 
                    mr: 1,
                    // FIX: Strahlend weiß im Public-Modus, normales Text-Primary sonst
                    '& .MuiTypography-h6': {
                        fontSize: isMobile ? '1rem' : '1.1rem',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: isPublic ? '#ffffff' : 'text.primary'
                    },
                    // FIX: Helles Grau für Icons im Public-Modus, normales Text-Secondary sonst
                    '& svg': {
                        fontSize: '1.2rem',
                        marginRight: '8px',
                        color: isPublic ? 'rgba(255, 255, 255, 0.7)' : 'text.secondary'
                    }
                }}>
                    {title}
                </Box>
                
                {renderActions()}
            </Box>
            
            {/* --- WIDGET CONTENT --- */}
            <Box sx={{ 
                flexGrow: 1, 
                overflowY: isMobile ? 'hidden' : 'auto', 
                overflowX: 'hidden',
                p: noPadding ? 0 : { xs: 1.5, sm: 2 }, 
                display: 'flex', 
                flexDirection: 'column',
                position: 'relative',
                // FIX: 2500px statt 'none', damit CSS die Höhe weich animieren kann
                maxHeight: isMobile && !mobileExpanded ? '380px' : '2500px',
                transition: 'max-height 0.4s ease-in-out',
                bgcolor: 'background.paper'
            }}>
                {loading ? (
                    <Box sx={{ 
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        bgcolor: alpha(theme.palette.background.paper, 0.7), zIndex: 1 
                    }}>
                        <CircularProgress size={30} disableShrink />
                    </Box>
                ) : error ? (
                    <Alert severity="error" variant="outlined" sx={{ m: 1, border: 'none' }}>{error}</Alert>
                ) : (
                    children
                )}

                {/* Theme-kompatibler Fade-Out Effekt auf Mobile */}
                {isMobile && !mobileExpanded && !loading && !error && (
                    <Box sx={{ 
                        position: 'absolute', 
                        bottom: 0, left: 0, right: 0, 
                        height: '60px', 
                        background: `linear-gradient(to top, ${theme.palette.background.paper} 10%, transparent 100%)`,
                        pointerEvents: 'none',
                        zIndex: 2
                    }} />
                )}
            </Box>

            {/* --- DEZENTER MOBILE EXPAND BUTTON --- */}
            {isMobile && !loading && !error && (
                <Button 
                    fullWidth 
                    size="small"
                    onClick={() => setMobileExpanded(!mobileExpanded)}
                    sx={{ 
                        borderRadius: 0, 
                        borderTop: '1px solid', 
                        borderColor: 'divider',
                        py: 0.75,
                        textTransform: 'none',
                        fontSize: '0.85rem',
                        color: isPublic ? 'rgba(255,255,255,0.7)' : 'text.secondary',
                        bgcolor: 'background.paper',
                        '&:hover': { bgcolor: 'action.hover' }
                    }}
                    endIcon={mobileExpanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                >
                    {mobileExpanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
                </Button>
            )}
        </Paper>
    );
};

export default WidgetPaper;