// frontend/src/components/SystemHealthWidget.tsx
import React, { useState, useEffect } from 'react';
import { Card, CardContent, Typography, Grid, Chip, Box, CircularProgress, Tooltip, IconButton } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import apiClient from '../apiClient';

interface ServiceStatus {
    status: 'online' | 'offline' | 'loading';
    error?: string;
}

const SystemHealthWidget: React.FC = () => {
    const [dbStatus, setDbStatus] = useState<ServiceStatus>({ status: 'loading' });
    const [redisStatus, setRedisStatus] = useState<ServiceStatus>({ status: 'loading' });

    const fetchHealthStatus = async () => {
        setDbStatus({ status: 'loading' });
        setRedisStatus({ status: 'loading' });
        try {
            const token = localStorage.getItem('jwt_token');
            if (!token) throw new Error("Kein Authentifizierungs-Token gefunden.");
            
            const response = await apiClient.get('/api/admin/monitor/status', {
                headers: { 'x-auth-token': token }
            });

            setDbStatus(response.data.database);
            setRedisStatus(response.data.redis);
        } catch (error: any) {
            const errorMessage = error.response?.data?.message || 'Failed to fetch status';
            setDbStatus({ status: 'offline', error: errorMessage });
            setRedisStatus({ status: 'offline', error: errorMessage });
        }
    };

    useEffect(() => {
        fetchHealthStatus();
    }, []);

    const StatusIndicator = ({ serviceName, data }: { serviceName: string, data: ServiceStatus }) => (
        <Grid item xs={12} sm={6}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body1">{serviceName}:</Typography>
                {data.status === 'loading' ? (
                    <CircularProgress size={20} />
                ) : (
                    <Tooltip title={data.error || `Status: ${data.status}`}>
                        <Chip
                            label={data.status.toUpperCase()}
                            color={data.status === 'online' ? 'success' : 'error'}
                            size="small"
                        />
                    </Tooltip>
                )}
            </Box>
        </Grid>
    );

    return (
        <Card sx={{ mb: 2 }}>
            <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="h6">System-Gesundheit</Typography>
                    <Tooltip title="Status aktualisieren">
                        <IconButton onClick={fetchHealthStatus} size="small">
                            <RefreshIcon />
                        </IconButton>
                    </Tooltip>
                </Box>
                <Grid container spacing={2}>
                    <StatusIndicator serviceName="PostgreSQL Datenbank" data={dbStatus} />
                    <StatusIndicator serviceName="Redis Server" data={redisStatus} />
                </Grid>
            </CardContent>
        </Card>
    );
};

export default SystemHealthWidget;