// frontend/src/components/widgets/AccountIntelligenceWidget.tsx
import React, { useState, useEffect } from 'react';
import {
    Box, Typography, CircularProgress, Alert, Accordion, AccordionSummary, AccordionDetails,
    List, ListItem, ListItemIcon, ListItemText, Divider, Chip, alpha, useTheme
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import NewspaperIcon from '@mui/icons-material/Newspaper';
import RadarIcon from '@mui/icons-material/Radar'; 
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';

// --- Interfaces für die Datenstruktur ---
interface NewsArticle {
    article_title: string;
    article_url: string;
    source_name: string;
    published_at: string;
    competitor_name?: string;
    summary?: string; 
}

interface AccountIntelligenceData {
    id: string;
    name: string;
    account_news: NewsArticle[];
    competitor_news: NewsArticle[];
}

interface AccountIntelligenceWidgetProps extends BaseWidgetProps {
  icon?: React.ReactNode; 
  config?: {
    title?: string;
  };
}

// --- Hauptkomponente ---
const AccountIntelligenceWidget: React.FC<AccountIntelligenceWidgetProps> = ({
    widgetId,
    onDelete,
    isRemovable,
    widgetTypeKey,
    config,
    icon: propsIcon,
}) => {
    const theme = useTheme();
    const [data, setData] = useState<AccountIntelligenceData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const title = config?.title || 'Account-Radar';
    const icon = propsIcon || <RadarIcon />;

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const response = await apiClient.get('/api/data/account-intelligence');
                setData(response.data);
            } catch (err: any) {
                setError(err.response?.data?.message || 'Fehler beim Laden der Account-Daten.');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const renderNewsList = (articles: NewsArticle[], type: 'account' | 'competitor') => (
        <List dense disablePadding>
            {articles.map((article, index) => (
                <ListItem 
                    key={index} 
                    button 
                    component="a" 
                    href={article.article_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    alignItems="flex-start" 
                    sx={{ 
                        py: 1.5, 
                        borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                        '&:last-child': { borderBottom: 'none' },
                        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) } 
                    }}
                >
                    <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
                        {type === 'account' 
                            ? <NewspaperIcon fontSize="small" sx={{ color: 'primary.main' }} /> 
                            : <TrackChangesIcon fontSize="small" sx={{ color: 'secondary.main' }} />
                        }
                    </ListItemIcon>
                    <ListItemText
                        disableTypography 
                        primary={
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.3, mb: 0.5, color: 'text.primary' }}>
                                {article.article_title}
                            </Typography>
                        }
                        secondary={
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                {/* KI Zusammenfassung */}
                                {article.summary && (
                                    <Typography 
                                        variant="body2" 
                                        color="text.secondary" 
                                        sx={{ 
                                            display: '-webkit-box', 
                                            WebkitLineClamp: 2, 
                                            WebkitBoxOrient: 'vertical', 
                                            overflow: 'hidden',
                                            lineHeight: 1.4
                                        }}
                                    >
                                        {article.summary}
                                    </Typography>
                                )}
                                
                                {/* Metadaten (Chips & Datum) */}
                                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
                                    {article.competitor_name && (
                                        <Chip 
                                            label={article.competitor_name} 
                                            size="small" 
                                            variant="outlined"
                                            sx={{ height: 20, fontSize: '0.7rem', fontWeight: 'bold' }} 
                                        />
                                    )}
                                    <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600 }}>
                                        {article.source_name} • {new Date(article.published_at).toLocaleDateString('de-DE')}
                                    </Typography>
                                </Box>
                            </Box>
                        }
                    />
                </ListItem>
            ))}
        </List>
    );

    const renderContent = () => {
        if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>;
        if (error) return <Alert severity="error" sx={{ m: 1 }}>{error}</Alert>;
        if (data.length === 0) return <Typography sx={{ p: 2, textAlign: 'center' }} color="text.secondary">Sie haben noch keine Accounts zur Beobachtung hinzugefügt.</Typography>;

        return (
            <Box sx={{ overflowY: 'auto', p: 1 }}>
                {data.map((account, index) => {
                    // NEU: Anzahl der Meldungen berechnen
                    const totalNewsCount = account.account_news.length + account.competitor_news.length;
                    
                    return (
                        <Accordion 
                            key={account.id} 
                            defaultExpanded={index === 0} 
                            elevation={0}
                            sx={{ 
                                '&:before': { display: 'none' }, 
                                border: `1px solid ${theme.palette.divider}`,
                                borderRadius: '8px !important',
                                mb: 1
                            }}
                        >
                            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: alpha(theme.palette.background.default, 0.5) }}>
                                {/* NEU: Box-Wrapper für Titel und Badge */}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Typography sx={{ fontWeight: 800, color: 'text.primary' }}>{account.name}</Typography>
                                    {totalNewsCount > 0 && (
                                        <Chip 
                                            label={totalNewsCount} 
                                            size="small" 
                                            color="primary" 
                                            sx={{ height: 20, minWidth: 20, fontSize: '0.75rem', fontWeight: 'bold' }} 
                                        />
                                    )}
                                </Box>
                            </AccordionSummary>
                            <AccordionDetails sx={{ p: 0 }}>
                                {account.account_news.length > 0 && (
                                    <>
                                        <Typography variant="overline" color="primary" sx={{ px: 2, pt: 1, display: 'block', fontWeight: 'bold' }}>
                                            Aktuelles zum Kunden
                                        </Typography>
                                        {renderNewsList(account.account_news, 'account')}
                                    </>
                                )}
                                
                                {account.competitor_news.length > 0 && (
                                    <>
                                        {account.account_news.length > 0 && <Divider />}
                                        <Typography variant="overline" color="secondary" sx={{ px: 2, pt: 1, display: 'block', fontWeight: 'bold' }}>
                                            Aktivitäten der Wettbewerber
                                        </Typography>
                                        {renderNewsList(account.competitor_news, 'competitor')}
                                    </>
                                )}
                                
                                {account.account_news.length === 0 && account.competitor_news.length === 0 && (
                                    <Typography sx={{ px: 2, py: 2 }} variant="body2" color="text.secondary">
                                        Keine aktuellen Aktivitäten gefunden.
                                    </Typography>
                                )}
                            </AccordionDetails>
                        </Accordion>
                    );
                })}
            </Box>
        );
    };

    return (
        <WidgetPaper
            widgetId={widgetId}
            onDelete={onDelete}
            isRemovable={isRemovable}
            widgetTitle={title}
            widgetTypeKey={widgetTypeKey || 'account-intelligence'}
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {icon}
                    <Typography variant="h6">{title}</Typography>
                </Box>
            }
        >
            {renderContent()}
        </WidgetPaper>
    );
};

export default AccountIntelligenceWidget;