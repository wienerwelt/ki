import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Accordion, AccordionSummary, AccordionDetails, Divider, Link as MuiLink, FormControlLabel, Switch, Tooltip } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import { useSnackbar } from '../../context/SnackbarContext';

interface MarketBriefing {
    headline: string;
    summary: string;
    prognosis: string;
}
interface SalesTrigger {
    id: string;
    headline: string;
    analysis_summary: string;
    talking_point: string;
    account_name: string;
}
interface CockpitData {
    market_briefing: MarketBriefing | null;
    sales_triggers: SalesTrigger[];
    linkable_names: string[];
}

interface DailyCockpitWidgetProps extends BaseWidgetProps {
  icon?: React.ReactNode;
  config?: {
    title?: string;
  };
}

const TextWithSearchLinks: React.FC<{ text: string; namesToLink: string[] }> = ({ text, namesToLink }) => {
    const navigate = useNavigate();
    const handleSearch = (name: string) => navigate(`/search?term=${encodeURIComponent(name)}`);

    if (!namesToLink || namesToLink.length === 0 || !text) {
        return <>{text}</>;
    }

    const uniqueNames = [...new Set(namesToLink)];
    const regex = new RegExp(`(${uniqueNames.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    const parts = text.split(regex);

    return (
        <>
            {parts.map((part, index) => {
                const isLink = uniqueNames.some(name => name.toLowerCase() === part.toLowerCase());
                return isLink ? (
                    <MuiLink key={index} component="button" variant="inherit" onClick={() => handleSearch(part)} sx={{ fontStyle: 'italic', fontWeight: 'bold' }}>{part}</MuiLink>
                ) : (
                    <React.Fragment key={index}>{part}</React.Fragment>
                );
            })}
        </>
    );
};

const DailyCockpitWidget: React.FC<DailyCockpitWidgetProps> = ({
    // KORREKTUR: Props einzeln destrukturieren, um 'businessPartner' abzufangen
    widgetId,
    onDelete,
    isRemovable,
    widgetTypeKey,
    config,
    icon: propsIcon,
    ...otherProps // Hier landet 'businessPartner', falls es übergeben wird (wird ignoriert)
}) => {
    const [data, setData] = useState<CockpitData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { user, updateUser } = useAuth();
    const { showSnackbar } = useSnackbar();
    const [isSubscribed, setIsSubscribed] = useState(!!user?.newsletter_opt_in);

    const title = config?.title || 'Tägliches Cockpit';
    const icon = propsIcon || <WbSunnyIcon />;

    useEffect(() => {
        setIsSubscribed(!!user?.newsletter_opt_in);
    }, [user?.newsletter_opt_in]);

    const handleSubscriptionToggle = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = event.target.checked;
        const oldState = isSubscribed;
        
        setIsSubscribed(isChecked);
        updateUser({ newsletter_opt_in: isChecked });
        showSnackbar('Einstellung wird gespeichert...', 'info');

        try {
            await apiClient.put('/api/users/me', { newsletter_opt_in: isChecked });
            showSnackbar('Newsletter-Einstellung erfolgreich gespeichert.', 'success');
        } catch (err) {
            showSnackbar('Fehler beim Speichern der Einstellung.', 'error');
            setIsSubscribed(oldState);
            updateUser({ newsletter_opt_in: oldState });
        }
    };
    
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await apiClient.get('/api/data/daily-briefing');
                setData(response.data);
            } catch (err: any) {
                setError(err.response?.data?.message || 'Fehler beim Laden des Tages-Briefings.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    return (
        <WidgetPaper
            // KORREKTUR: Explizite Props statt {...props}
            widgetId={widgetId}
            onDelete={onDelete}
            isRemovable={isRemovable}
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {icon}
                    <Typography variant="h6">{title}</Typography>
                </Box>
            }
            widgetTitle={title}
            widgetTypeKey={widgetTypeKey || 'daily_cockpit'}
            loading={loading}
            error={error}
            noPadding={true}
        >
            <Box sx={{ p: 2, overflowY: 'auto', height: 'calc(100% - 50px)' }}>
                {!data || (!data.market_briefing && data.sales_triggers.length === 0) ? (
                    <Typography sx={{ p: 2, textAlign: 'center' }} color="text.secondary">
                        Für heute wurde noch kein Briefing erstellt.
                    </Typography>
                ) : (
                    <>
                        {data.market_briefing && (
                            <Box mb={2}>
                                <Typography variant="overline" color="text.secondary">Markt-Briefing</Typography>
                                <Typography variant="h6" component="h3" gutterBottom>
                                    <TextWithSearchLinks text={data.market_briefing.headline} namesToLink={data.linkable_names || []} />
                                </Typography>
                                <Typography variant="body2" paragraph>
                                    <TextWithSearchLinks text={data.market_briefing.summary} namesToLink={data.linkable_names || []} />
                                </Typography>
                                <Typography variant="body2" sx={{ fontStyle: 'italic' }} color="text.secondary">
                                    <b>Prognose:</b> <TextWithSearchLinks text={data.market_briefing.prognosis} namesToLink={data.linkable_names || []} />
                                </Typography>
                            </Box>
                        )}
                        
                        {data.sales_triggers.length > 0 && (
                            <>
                                <Divider sx={{ my: 2 }} />
                                <Typography variant="overline" color="text.secondary">Ihre Top-Gesprächsanlässe</Typography>
                                {data.sales_triggers.map((trigger) => (
                                    <Accordion key={trigger.id} sx={{ mt: 1, '&:before': { display: 'none' } }} disableGutters elevation={0} variant="outlined">
                                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                            <Typography sx={{ fontWeight: 'bold' }}>
                                                <TextWithSearchLinks text={trigger.headline} namesToLink={data.linkable_names || []} />
                                            </Typography>
                                        </AccordionSummary>
                                        <AccordionDetails sx={{ borderTop: 1, borderColor: 'divider' }}>
                                            <Typography component="div" variant="body2" paragraph>
                                                <b>Analyse:</b> <TextWithSearchLinks text={trigger.analysis_summary} namesToLink={data.linkable_names || []} />
                                            </Typography>
                                            <Typography component="div" variant="body2" sx={{ fontStyle: 'italic' }}>
                                                <b>Gesprächsansatz:</b> <TextWithSearchLinks text={`"${trigger.talking_point}"`} namesToLink={data.linkable_names || []} />
                                            </Typography>
                                        </AccordionDetails>
                                    </Accordion>
                                ))}
                            </>
                        )}
                    </>
                )}
            </Box>
            
            <Divider />
            <Box sx={{ p: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50px' }}>
                <Tooltip title="Erhalten Sie dieses Briefing täglich als E-Mail">
                    <FormControlLabel
                        control={<Switch checked={isSubscribed} onChange={handleSubscriptionToggle} />}
                        label="Tägliches Briefing per E-Mail"
                        labelPlacement="start"
                    />
                </Tooltip>
            </Box>
        </WidgetPaper>
    );
};

export default DailyCockpitWidget;