// frontend/src/components/ProposeSourceForm.tsx
import React, { useState } from 'react';
import { Box, TextField, Button, CircularProgress, Alert } from '@mui/material';
import apiClient from '../apiClient';

interface ProposeSourceFormProps {
    onSuccess?: () => void;
}

export const ProposeSourceForm: React.FC<ProposeSourceFormProps> = ({ onSuccess }) => {
    const [url, setUrl] = useState('');
    const [description, setDescription] = useState('');
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const token = localStorage.getItem('jwt_token'); 
            const payload = {
                url,
                description,
                // category_id wird bewusst weggelassen, das Backend setzt es auf null.
                // Der Admin ordnet die Kategorie später bei der Prüfung zu.
            };
            await apiClient.post('/api/sources', payload, { headers: { 'x-auth-token': token } });
            
            setSuccess('Vielen Dank! Deine Quelle wurde zur Prüfung eingereicht. Du erhältst +5 Punkte, wenn sie genehmigt wird.');
            setUrl('');
            setDescription('');
            if (onSuccess) onSuccess();

        } catch (err: any) {
            setError(err.response?.data?.message || 'Ein Fehler ist aufgetreten.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: '600px', mx: 'auto' }}>
            {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            
            <TextField
                label="URL der Webseite"
                fullWidth
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                margin="normal"
                placeholder="https://beispiel-quelle.com/artikel"
            />
            <TextField
                label="Kurze Beschreibung (optional)"
                fullWidth
                multiline
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                margin="normal"
                placeholder="Warum ist diese Quelle wertvoll?"
            />

            <Button type="submit" variant="contained" disabled={loading} sx={{ mt: 2 }}>
                {loading ? <CircularProgress size={24} /> : 'Quelle einreichen'}
            </Button>
        </Box>
    );
};