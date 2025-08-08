// frontend/src/pages/VerifyEmailPage.tsx
import React, { useState, useEffect } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { Container, Box, Typography, CircularProgress, Alert, Button } from '@mui/material';
import apiClient from '../apiClient';

const VerifyEmailPage: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<string | null>(null);
    const [isError, setIsError] = useState(false);

    useEffect(() => {
        const verifyToken = async () => {
            if (!token) {
                setMessage('Kein Bestätigungs-Token gefunden.');
                setIsError(true);
                setLoading(false);
                return;
            }
            try {
                const response = await apiClient.get(`/api/auth/verify-email/${token}`);
                setMessage(response.data.message);
                setIsError(false);
            } catch (err: any) {
                setMessage(err.response?.data?.message || 'Bestätigung fehlgeschlagen.');
                setIsError(true);
            } finally {
                setLoading(false);
            }
        };
        verifyToken();
    }, [token]);

    return (
        <Container component="main" maxWidth="sm">
            <Box sx={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', p: 3 }}>
                <Typography component="h1" variant="h5" sx={{ mb: 3 }}>
                    E-Mail Bestätigung
                </Typography>
                {loading && <CircularProgress />}
                {message && (
                    <Alert severity={isError ? 'error' : 'success'} sx={{ width: '100%', mb: 2 }}>
                        {message}
                    </Alert>
                )}
                {!loading && (
                    <Button component={RouterLink} to="/login" variant="contained">
                        Zurück zum Login
                    </Button>
                )}
            </Box>
        </Container>
    );
};

export default VerifyEmailPage;
