// frontend/src/components/widgets/TrustedSourcesWidget.tsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Box, Typography, Button, Stack, Divider, Badge } from '@mui/material';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import apiClient from '../../apiClient';

interface TrustedSourcesWidgetProps extends BaseWidgetProps {
    widgetTitle: string;
    widgetTypeKey: string;
}

const TrustedSourcesWidget: React.FC<TrustedSourcesWidgetProps> = ({ onDelete, widgetId, isRemovable, widgetTitle, widgetTypeKey }) => {
    const [pendingCount, setPendingCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchPendingCount = async () => {
            setLoading(true);
            try {
                const token = localStorage.getItem('jwt_token');
                const response = await apiClient.get('/api/sources/pending', { headers: { 'x-auth-token': token } });
                setPendingCount(response.data.length);
            } catch (error) {
                console.error("Fehler beim Laden der ausstehenden Quellen:", error);
                setPendingCount(0);
            } finally {
                setLoading(false);
            }
        };
        fetchPendingCount();
    }, []);

    // Diese Funktion "programmiert" den Klick auf das Feedback-Icon im WidgetPaper
    const handleReportError = () => {
        navigate('/feedback', {
            state: {
                type: 'feedback',
                title: `Vorschlag für Widget: ${widgetTitle}`, 
                widgetKey: widgetTypeKey
            }
        });
    };

    return (
        <WidgetPaper
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FactCheckIcon />
                    <Typography variant="h6">Vertrauenswürdige Quellen</Typography>
                </Box>
            }
            widgetId={widgetId}
            onDelete={onDelete}
            isRemovable={isRemovable}
            loading={loading}
            widgetTitle={widgetTitle}
            widgetTypeKey={widgetTypeKey}
            // HIER IST DIE ENTSCHEIDENDE ÄNDERUNG:
            // Wir übergeben unsere Funktion an die WidgetPaper-Komponente.
            onReportError={handleReportError} 
        >
            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
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
                {/* Hier befindet sich kein extra Feedback-Link mehr */}
            </Box>
        </WidgetPaper>
    );
};

export default TrustedSourcesWidget;