// frontend/src/components/widgets/TrustedSourcesWidget.tsx
import React from 'react';
import { Box, Typography, Button, Stack, Divider } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import FactCheckIcon from '@mui/icons-material/FactCheck';

interface TrustedSourcesWidgetProps extends BaseWidgetProps {
    // Ggf. weitere Props wie pendingVotesCount
}

const TrustedSourcesWidget: React.FC<TrustedSourcesWidgetProps> = ({ onDelete, widgetId, isRemovable }) => {
    const navigate = useNavigate();

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
        >
            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
                <Typography variant="body1" sx={{ textAlign: 'center' }}>
                    Gestalten Sie die Datenbasis der KI aktiv mit!
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 2 }}>
                    Schlagen Sie neue Quellen vor oder bewerten Sie die Vorschläge anderer Nutzer.
                </Typography>
                <Stack spacing={1} divider={<Divider />}>
                    <Button variant="contained" onClick={() => navigate('/trusted-sources')}>
                        Jetzt mitmachen
                    </Button>
                     <Button variant="outlined" onClick={() => navigate('/trusted-sources', { state: { tab: 2 } })}>
                        Neue Quelle vorschlagen
                    </Button>
                </Stack>
            </Box>
        </WidgetPaper>
    );
};

export default TrustedSourcesWidget;