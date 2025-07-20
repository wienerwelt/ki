// frontend/src/components/ProposeSourceForm.tsx
import React, { useState, useEffect } from 'react';
import { Box, TextField, Button, CircularProgress, Alert, Autocomplete } from '@mui/material';
import apiClient from '../apiClient';

interface Category {
    id: string;
    name: string;
}

interface ProposeSourceFormProps {
    onSuccess?: () => void;
}

export const ProposeSourceForm: React.FC<ProposeSourceFormProps> = ({ onSuccess }) => {
    const [url, setUrl] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState<Category | null>(null);
    const [allCategories, setAllCategories] = useState<Category[]>([]);
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const token = localStorage.getItem('jwt_token');
                const response = await apiClient.get('/api/admin/categories', { headers: { 'x-auth-token': token } });
                setAllCategories(response.data);
            } catch (err) {
                console.error("Fehler beim Laden der Kategorien:", err);
            }
        };
        fetchCategories();
    }, []);

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
                category_id: category?.id || null,
            };
            await apiClient.post('/api/sources', payload, { headers: { 'x-auth-token': token } });
            
            setSuccess('Vielen Dank! Deine Quelle wurde zur Prüfung eingereicht. Du erhältst +5 Punkte, wenn sie genehmigt wird.');
            setUrl('');
            setDescription('');
            setCategory(null);
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
            <Autocomplete
                options={allCategories}
                getOptionLabel={(option) => option.name}
                value={category}
                onChange={(event, newValue) => setCategory(newValue)}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderInput={(params) => <TextField {...params} label="Kategorie (optional)" margin="normal" />}
            />

            <Button type="submit" variant="contained" disabled={loading} sx={{ mt: 2 }}>
                {loading ? <CircularProgress size={24} /> : 'Quelle einreichen'}
            </Button>
        </Box>
    );
};