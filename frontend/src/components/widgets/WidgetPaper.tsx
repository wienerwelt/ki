import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Paper, Box, Tooltip, IconButton, CircularProgress, Alert,
    Menu, MenuItem, useTheme, useMediaQuery, Button
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

    // NEU: State für Mobile-Expand (Standardmäßig eingeklappt)
    const [mobileExpanded, setMobileExpanded] = useState(false);

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
        if (isPublic) return null;

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
            elevation={isPublic ? 0 : 3}
            sx={{ 
                // UPDATE: Auf Mobile Höhe automatisch, damit das Widget wachsen kann
                height: isMobile ? 'auto' : '100%', 
                display: 'flex', 
                flexDirection: 'column',
                overflow: 'hidden',
                border: theme.palette.mode === 'dark' ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
                ...(isPublic && {
                    backgroundColor: 'rgba(255,255,255,0.6)', 
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    transition: 'all 0.3s ease'
                })
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
                    backgroundColor: (theme) => {
                        if (isPublic) return 'transparent';
                        return theme.palette.mode === 'dark' 
                            ? theme.palette.background.default 
                            : theme.palette.grey[50];
                    },
                    minHeight: isMobile ? 44 : 52,
                }}
            >
                {!isMobile && !isPublic && (
                    <Box 
                        className="widget-drag-handle" 
                        sx={{ 
                            cursor: 'grab', 
                            mr: 1, 
                            color: 'text.disabled',
                            display: 'flex',
                            alignItems: 'center',
                            '&:hover': { color: 'text.primary' },
                            '& svg': { mr: 0, fontSize: '1.2rem' }
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
                    '& .MuiTypography-h6': {
                        fontSize: isMobile ? '1.1rem' : '1.25rem',
                        fontWeight: 600,
                        lineHeight: 1.2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: isPublic ? theme.palette.text.secondary : 'inherit'
                    },
                    '& svg': {
                        fontSize: isMobile ? '1.2rem' : '1.4rem',
                        marginRight: '8px',
                        color: isMobile || isPublic ? theme.palette.text.secondary : theme.palette.primary.main
                    },
                    '& .MuiIconButton-root svg, & .MuiInputAdornment-root svg': {
                        color: theme.palette.text.secondary,
                        mr: 0 
                    }
                }}>
                    {title}
                </Box>
                
                {renderActions()}
            </Box>
            
            <Box sx={{ 
                flexGrow: 1, 
                // UPDATE: Auf Mobile Overflow verstecken (kein interner Scrollbalken), Desktop wie gewohnt
                overflowY: isMobile ? 'hidden' : 'auto', 
                overflowX: 'hidden',
                p: noPadding ? 0 : { xs: 1.5, sm: 2 }, 
                display: 'flex', 
                flexDirection: 'column',
                position: 'relative',
                // NEU: Max-Height Logik für Mobile "Show More"
                maxHeight: isMobile && !mobileExpanded ? '380px' : 'none',
                transition: 'max-height 0.4s ease-in-out'
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

                {/* NEU: Fade-Out Effekt am Boden, wenn eingeklappt */}
                {isMobile && !mobileExpanded && !loading && !error && (
                    <Box sx={{ 
                        position: 'absolute', 
                        bottom: 0, left: 0, right: 0, 
                        height: '60px', 
                        background: theme.palette.mode === 'dark' 
                            ? 'linear-gradient(to top, rgba(30,30,30,1), transparent)' 
                            : 'linear-gradient(to top, rgba(255,255,255,1), transparent)',
                        pointerEvents: 'none',
                        zIndex: 2
                    }} />
                )}
            </Box>

            {/* NEU: Show More / Show Less Button für Mobile */}
            {isMobile && !loading && !error && (
                <Button 
                    fullWidth 
                    onClick={() => setMobileExpanded(!mobileExpanded)}
                    sx={{ 
                        borderRadius: 0, 
                        borderTop: '1px solid', 
                        borderColor: 'divider',
                        py: 1,
                        textTransform: 'none',
                        color: 'text.secondary',
                        bgcolor: theme.palette.background.paper,
                        '&:hover': { bgcolor: theme.palette.action.hover }
                    }}
                    endIcon={mobileExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                >
                    {mobileExpanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
                </Button>
            )}
        </Paper>
    );
};

export default WidgetPaper;