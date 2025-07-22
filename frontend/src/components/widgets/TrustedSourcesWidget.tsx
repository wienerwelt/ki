// frontend/src/components/widgets/TrustedSourcesWidget.tsx
import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Stack, Divider, Badge } from '@mui/material';
// HIER IST DIE ÄNDERUNG: Wir importieren Link anstatt useNavigate
import { Link } from 'react-router-dom';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import apiClient from '../../apiClient';

const TrustedSourcesWidget: React.FC<BaseWidgetProps> = ({ onDelete, widgetId, isRemovable }) => {
    // useNavigate wird nicht mehr benötigt
    const [pendingCount, setPendingCount] = useState(0);
    const [loading, setLoading] = useState(true);

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
                        {/* HIER IST DIE ÄNDERUNG: Der Button ist jetzt in einem Link verpackt */}
                        <Button
                            component={Link}
                            to="/trusted-sources"
                            state={{ tab: 1 }} // Führt direkt zum Abstimmen-Tab
                            variant="contained"
                            fullWidth
                            disabled={pendingCount === 0}
                            sx={{ textDecoration: 'none' }} // Verhindert Unterstreichung
                        >
                            {pendingCount > 0 ? 'Jetzt Abstimmen' : 'Keine Abstimmungen'}
                        </Button>
                    </Badge>
                     {/* HIER IST DIE ÄNDERUNG: Auch dieser Button ist jetzt ein Link */}
                     <Button
                        component={Link}
                        to="/trusted-sources"
                        state={{ tab: 2 }} // Führt direkt zum Vorschlagen-Tab
                        variant="outlined"
                        sx={{ textDecoration: 'none' }}
                     >
                        Neue Quelle vorschlagen
                    </Button>
                </Stack>
            </Box>
        </WidgetPaper>
    );
};

export default TrustedSourcesWidget;