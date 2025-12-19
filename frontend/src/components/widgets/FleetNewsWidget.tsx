import React, { useState, useEffect, useCallback } from 'react';
import { 
    Box, Typography, Chip, Link as MuiLink, Stack, Divider, 
    useTheme, useMediaQuery, FormControl, Select, MenuItem, SelectChangeEvent 
} from '@mui/material';
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

// HELPER: Flagge (analog zu EconomicStatWidget/PodcastWidget)
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
    return isNaN(d.getTime()) ? null : d.toLocaleDateString('de-AT');
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
            const token = localStorage.getItem('jwt_token');
            // Parameter dynamisch aufbauen
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
    }, [category, selectedRegion]); // Hängt jetzt von selectedRegion ab

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Header Title Component mit Region-Selektor
    const widgetTitleComponent = (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
            {icon}
            <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>{title}</Typography>
            
            {/* Regionen Auswahl */}
            {user?.regions && user.regions.length > 1 && (
                 <FormControl size="small" sx={{ minWidth: 80 }} onMouseDown={(e) => e.stopPropagation()}>
                    <Select
                        value={selectedRegion?.id || ''}
                        variant="standard"
                        disableUnderline
                        onChange={(e: SelectChangeEvent) => {
                            const region = user?.regions?.find(r => r.id === e.target.value);
                            setSelectedRegion(region || null);
                        }}
                        renderValue={(value) => {
                            const region = user?.regions?.find(r => r.id === value);
                            return (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Flag code={region?.code} alt={region?.name} />
                                    <Typography variant="body2">{region?.code}</Typography>
                                </Box>
                            );
                        }}
                    >
                        {user?.regions?.map((region) => (
                            <MenuItem key={region.id} value={region.id}>
                                 <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Flag code={region.code} alt={region.name} />
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
            title={widgetTitleComponent} // Neuer Header
            onDelete={onDelete} 
            isRemovable={isRemovable}
            loading={loading}
            error={error}
            noPadding // Analog zu den anderen Widgets für besseren Scroll-Look
        >
            <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                height: isMobile ? 'auto' : '100%' 
            }}>
                <Box sx={{ 
                    flexGrow: 1, 
                    overflowY: isMobile ? 'visible' : 'auto',
                    p: 2 // Padding hier, da noPadding im Wrapper aktiv ist
                }}>
                    {items.length > 0 ? (
                        <Stack spacing={2}>
                            {items.map((item, index) => (
                                <Box key={item.id}>
                                    {index > 0 && <Divider sx={{ mb: 2 }} />}
                                    <MuiLink 
                                        href={item.original_url} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        underline="hover"
                                        color="text.primary"
                                        sx={{ display: 'block', mb: 0.5, '&:hover': { color: 'primary.main' } }}
                                    >
                                        <Typography variant="subtitle2" sx={{ fontWeight: item.is_read ? 'normal' : 'bold' }}>
                                            {item.title}
                                        </Typography>
                                    </MuiLink>
                                    {item.summary && (
                                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                            {item.summary.length > 120 ? `${item.summary.substring(0, 120)}...` : item.summary}
                                        </Typography>
                                    )}
                                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                        {safeDate(item.event_date) && (
                                            <Chip label={`Datum: ${safeDate(item.event_date)}`} size="small" variant="outlined" />
                                        )}
                                        {item.category && (
                                            <Chip label={item.category} size="small" />
                                        )}
                                    </Stack>
                                </Box>
                            ))}
                        </Stack>
                    ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', p: 2 }}>
                            Keine Nachrichten oder Veranstaltungen gefunden.
                        </Typography>
                    )}
                </Box>
            </Box>
        </WidgetPaper>
    );
};

export default FleetNewsWidget;