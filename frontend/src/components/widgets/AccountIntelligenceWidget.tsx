// frontend/src/components/widgets/AccountIntelligenceWidget.tsx
import React, { useState, useEffect } from 'react';
import {
    Box, Typography, CircularProgress, Alert, Accordion, AccordionSummary, AccordionDetails,
    List, ListItem, ListItemIcon, ListItemText, Divider, Chip
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
                <ListItem key={index} button component="a" href={article.article_url} target="_blank" rel="noopener noreferrer">
                    <ListItemIcon sx={{ minWidth: 36 }}>
                        {type === 'account' ? <NewspaperIcon fontSize="small" /> : <TrackChangesIcon fontSize="small" />}
                    </ListItemIcon>
                    <ListItemText
                        primary={article.article_title}
                        secondary={
                            <>
                                {article.competitor_name && <Chip label={article.competitor_name} size="small" sx={{ mr: 1 }} />}
                                {article.source_name} - {new Date(article.published_at).toLocaleDateString('de-DE')}
                            </>
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
                {data.map((account) => (
                    <Accordion key={account.id} TransitionProps={{ unmountOnExit: true }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography sx={{ fontWeight: 'bold' }}>{account.name}</Typography>
                        </AccordionSummary>
                        <AccordionDetails sx={{ p: 0 }}>
                            {account.account_news.length > 0 && (
                                <>
                                    <Typography variant="subtitle2" sx={{ px: 2, pt: 1 }}>Aktuelles zum Kunden</Typography>
                                    {renderNewsList(account.account_news, 'account')}
                                </>
                            )}
                            {account.competitor_news.length > 0 && (
                                <>
                                    <Divider sx={{ my: 1 }} />
                                    <Typography variant="subtitle2" sx={{ px: 2 }}>Aktivitäten der Wettbewerber</Typography>
                                    {renderNewsList(account.competitor_news, 'competitor')}
                                </>
                            )}
                            {account.account_news.length === 0 && account.competitor_news.length === 0 && (
                                <Typography sx={{ px: 2, pb: 1 }} color="text.secondary">Keine aktuellen Aktivitäten gefunden.</Typography>
                            )}
                        </AccordionDetails>
                    </Accordion>
                ))}
            </Box>
        );
    };

    return (
        <WidgetPaper
            // FIX: Wir übergeben die Props explizit, statt {...props} zu nutzen.
            // Dadurch wird 'businessPartner' nicht in das DOM-Element geschrieben.
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