import React, { useState, useEffect, useCallback } from 'react';
import { 
    Box, Typography, Chip, Stack, 
    useTheme, useMediaQuery, FormControl, Select, MenuItem, SelectChangeEvent 
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps, Region } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';

interface NewsItem {
    id: string;
    title: string;
    original_url: string;
    event_date?: string;
    summary?: string;
    category?: string;
    is_read: boolean;
}

interface FleetNewsWidgetProps extends BaseWidgetProps {
  icon?: React.ReactNode;
  title: string;
  category: string;
  widgetTypeKey: string;
}

// HELPER: Flagge
const Flag: React.FC<{ code?: string; alt?: string; size?: number }> = ({ code, alt, size = 20 }) => {
  if (!code) return null;
  const c = code.toUpperCase();
  if (c === 'EU') { 
      return ( <svg width={size} height={(size * 2) / 3} viewBox="0 0 12 8" xmlns="http://www.w3.org/2000/svg" aria-label={alt || 'EU'}><rect width="12" height="8" fill="#003399" />{Array.from({ length: 12 }).map((_, i) => { const angle = (i * 30 * Math.PI) / 180; const cx = 6 + Math.cos(angle) * 2.2; const cy = 4 + Math.sin(angle) * 2.2; return (<g key={i} transform={`translate(${cx},${cy})`}><polygon points="0,-0.6 0.17,-0.1 0.6,-0.1 0.26,0.16 0.39,0.6 0,0.35 -0.39,0.6 -0.26,0.16 -0.6,-0.1 -0.17,-0.1" fill="#FFCC00" /></g>);})}</svg> );
  }
  return <img loading="lazy" width={size} src={`https://flagcdn.com/w20/${c.toLowerCase()}.png`} alt={alt || c} />;
};

// HELPER: Sicheres Datumsformat
const safeDate = (dateStr: string | undefined) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const FleetNewsWidget: React.FC<FleetNewsWidgetProps> = ({ onDelete, widgetId, isRemovable, icon, title, category, widgetTypeKey }) => {
    const { user } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const [items, setItems] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);

    // Initial Default Region setzen
    useEffect(() => {
        if (user?.regions && user.regions.length > 0) {
            const defaultRegion = user.regions.find(r => !!r.is_default) || null;
            setSelectedRegion(defaultRegion);
        }
    }, [user]);

    const fetchData = useCallback(async () => {
        if (!category) {
            setError('Keine Kategorie konfiguriert.');
            setLoading(false);
            return;
        }
        
        setLoading(true);
        setError(null);
        try {
            const token = 'cookie-session';
            const params = new URLSearchParams({
                category,
                limit: '5',
                sortBy: 'date',
                region: selectedRegion ? selectedRegion.name : 'all'
            });

            const response = await apiClient.get(`/api/data/scraped-content?${params.toString()}`, { 
                headers: { 'x-auth-token': token } 
            });
            setItems(response.data?.data || []);
        } catch (err: any) {
            console.error('Fehler beim Laden der Fleet News:', err);
            setError('Nachrichten konnten nicht geladen werden.');
        } finally {
            setLoading(false);
        }
    }, [category, selectedRegion]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // NEU: Extrem aufgeräumter Header mit nahtlosem Dropdown
    const widgetTitleComponent = (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
            {icon}
            <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>{title}</Typography>
            
            {user?.regions && user.regions.length > 1 && (
                 <FormControl size="small" onMouseDown={(e) => e.stopPropagation()}>
                    <Select
                        value={selectedRegion?.id || ''}
                        variant="standard"
                        disableUnderline
                        IconComponent={KeyboardArrowDownIcon}
                        onChange={(e: SelectChangeEvent) => {
                            const region = user?.regions?.find(r => r.id === e.target.value);
                            setSelectedRegion(region || null);
                        }}
                        sx={{
                            color: 'text.secondary',
                            fontSize: '0.85rem',
                            fontWeight: 500,
                            '& .MuiSelect-select': { py: 0.5, pl: 1, pr: '24px !important', display: 'flex', alignItems: 'center', gap: 1 },
                            '& svg': { color: 'text.disabled', right: 0 }
                        }}
                        renderValue={(value) => {
                            const region = user?.regions?.find(r => r.id === value);
                            return (
                                <>
                                    <Flag code={region?.code} alt={region?.name} size={14} />
                                    {region?.code}
                                </>
                            );
                        }}
                    >
                        {user?.regions?.map((region) => (
                            <MenuItem key={region.id} value={region.id} sx={{ fontSize: '0.9rem' }}>
                                 <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Flag code={region.code} alt={region.name} size={16} />
                                    {region.name}
                                </Box>
                            </MenuItem>
                        ))}
                    </Select>
                 </FormControl>
            )}
        </Box>
    );

    return (
        <WidgetPaper 
            widgetId={widgetId} 
            widgetTitle={title} 
            widgetTypeKey={widgetTypeKey}
            title={widgetTitleComponent} 
            onDelete={onDelete} 
            isRemovable={isRemovable}
            loading={loading}
            error={error}
            noPadding // Wichtig für das Edge-to-Edge Design der Liste!
        >
            {items.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    {items.map((item, index) => (
                        <Box 
                            key={item.id}
                            component="a" // Macht das ganze Element klickbar
                            href={item.original_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ 
                                display: 'block',
                                textDecoration: 'none',
                                color: 'inherit',
                                position: 'relative',
                                px: { xs: 2, sm: 3 },
                                py: 2,
                                borderBottom: index === items.length - 1 ? 'none' : '1px solid',
                                borderColor: 'divider',
                                transition: 'background-color 0.2s ease',
                                '&:hover': { bgcolor: 'action.hover' }
                            }}
                        >
                            {/* UNGELESEN INDIKATOR (blauer Punkt) */}
                            {!item.is_read && (
                                <Box sx={{ 
                                    position: 'absolute', 
                                    left: { xs: 6, sm: 12 }, 
                                    top: 24, 
                                    width: 6, 
                                    height: 6, 
                                    borderRadius: '50%', 
                                    bgcolor: 'primary.main' 
                                }} />
                            )}

                            <Stack spacing={0.5}>
                                <Typography 
                                    variant="subtitle2" 
                                    sx={{ 
                                        fontWeight: item.is_read ? 500 : 700, 
                                        color: item.is_read ? 'text.primary' : 'text.primary',
                                        lineHeight: 1.3
                                    }}
                                >
                                    {item.title}
                                </Typography>

                                {item.summary && (
                                    <Typography 
                                        variant="body2" 
                                        color="text.secondary" 
                                        sx={{ 
                                            // NEU: Perfektes Abschneiden nach 2 Zeilen (Responsive)
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            lineHeight: 1.4
                                        }}
                                    >
                                        {item.summary}
                                    </Typography>
                                )}

                                {/* DEZENTERE METADATEN */}
                                <Stack direction="row" spacing={1} sx={{ mt: '8px !important', opacity: 0.8 }}>
                                    {safeDate(item.event_date) && (
                                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                                            {safeDate(item.event_date)}
                                        </Typography>
                                    )}
                                    {item.category && (
                                        <Chip 
                                            label={item.category} 
                                            size="small" 
                                            sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'action.selected' }} 
                                        />
                                    )}
                                </Stack>
                            </Stack>
                        </Box>
                    ))}
                </Box>
            ) : (
                <Box sx={{ p: 4, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                        Keine Nachrichten in dieser Region gefunden.
                    </Typography>
                </Box>
            )}
        </WidgetPaper>
    );
};

export default FleetNewsWidget;