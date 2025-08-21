// frontend/src/components/widgets/TrustedSourcesWidget.tsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Box, Typography, Button, Stack, Divider, Badge, CircularProgress, Alert } from '@mui/material';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';

interface TrustedSourcesWidgetProps extends BaseWidgetProps {
    icon?: React.ReactNode;
    title: string;
    widgetTypeKey: string;
}

const TrustedSourcesWidget: React.FC<TrustedSourcesWidgetProps> = ({ onDelete, widgetId, isRemovable, icon, title, widgetTypeKey }) => {
    const [pendingCount, setPendingCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchPendingCount = async () => {
            setLoading(true);
            setError(null);
            try {
                const token = localStorage.getItem('jwt_token');
                const response = await apiClient.get('/api/sources/pending', { headers: { 'x-auth-token': token } });
                setPendingCount(response.data.length);
            } catch (err: any) {
                setError(err.response?.data?.message || "Fehler beim Laden der ausstehenden Quellen.");
                setPendingCount(0);
            } finally {
                setLoading(false);
            }
        };
        fetchPendingCount();
    }, []);
    
    // Diese Funktion wird für den "Fehler Melden"-Button bei einem API-Fehler verwendet
    const handleReportError = () => {
        navigate('/feedback', {
            state: { type: 'bug', widget: title, error: error, widgetKey: widgetTypeKey }
        });
    };
    
    return (
        <WidgetPaper
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {icon}
                    <Typography variant="h6">{title}</Typography>
                </Box>
            }
            widgetId={widgetId}
            widgetTitle={title}
            widgetTypeKey={widgetTypeKey}
            onDelete={onDelete}
            isRemovable={isRemovable}
        >
            {loading ? (
                <Box sx={{ m: 'auto', textAlign: 'center' }}>
                    <CircularProgress />
                </Box>
            ) : error ? (
                <Alert
                    severity="error"
                    action={
                        <Button color="inherit" size="small" onClick={handleReportError} startIcon={<ReportProblemOutlinedIcon />}>
                            Fehler Melden
                        </Button>
                    }
                >
                    {error}
                </Alert>
            ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
                    <Typography variant="body1" sx={{ textAlign: 'center' }}>
                        Gestalten Sie die Datenbasis der KI aktiv mit!
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 2 }}>
                        Schlagen Sie neue Quellen vor oder bewerten Sie die Vorschläge anderer Nutzer.
                    </Typography>
                    <Stack spacing={1} divider={<Divider />}>
                        <Badge badgeContent={pendingCount} color="primary" sx={{ width: '100%' }}>
                            <Button
                                component={Link}
                                to="/trusted-sources"
                                state={{ tab: 1 }}
                                variant="contained"
                                fullWidth
                                disabled={pendingCount === 0}
                                sx={{ textDecoration: 'none' }} 
                            >
                                {pendingCount > 0 ? 'Jetzt Abstimmen' : 'Keine Abstimmungen'}
                            </Button>
                        </Badge>
                         <Button
                            component={Link}
                            to="/trusted-sources"
                            state={{ tab: 2 }}
                            variant="outlined"
                            sx={{ textDecoration: 'none' }}
                         >
                            Neue Quelle vorschlagen
                        </Button>
                    </Stack>
                </Box>
            )}
        </WidgetPaper>
    );
};

export default TrustedSourcesWidget;