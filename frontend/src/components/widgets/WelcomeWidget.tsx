// frontend/src/components/widgets/WelcomeWidget.tsx
import React from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../apiClient';

const WelcomeWidget: React.FC = () => {
    // Annahme: Ihr useAuth Hook stellt eine updateUser Funktion bereit
    const { user, updateUser } = useAuth(); 
    
    if (!user || user.has_seen_welcome_widget) {
        return null;
    }

    const handleDismiss = async () => {
        // Optimistisches Update im Frontend
        if (updateUser) {
            updateUser({ has_seen_welcome_widget: true });
        }
        
        // Update im Backend speichern
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.post('/api/users/mark-welcome-seen', {}, { headers: { 'x-auth-token': token } });
        } catch (error) {
            console.error("Fehler beim Speichern des 'Welcome' Status:", error);
            // Optional: Rollback, falls Backend-Update fehlschlägt
            if (updateUser) {
                updateUser({ has_seen_welcome_widget: false });
            }
        }
    };

    return (
        // KORREKTUR: mb: 2 fügt einen Abstand von 16px nach unten hinzu.
        <Paper elevation={3} sx={{ p: 3, backgroundColor: 'primary.light', color: 'primary.contrastText', mb: 2 }}>
            <Typography variant="h5" gutterBottom>
                Willkommen beim KI-Dashboard, {user.username}!
            </Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>
                Hier sind ein paar schnelle Tipps für den Einstieg:
            </Typography>
            <ul>
                <li>Fügen Sie Widgets über den Button "Widget hinzufügen" hinzu.</li>
                <li>Passen Sie die Größe und Position der Widgets per Drag & Drop an.</li>
                <li>Speichern Sie Ihr persönliches Layout, damit es beim nächsten Mal wieder da ist.</li>
            </ul>
            <Button variant="contained" color="secondary" onClick={handleDismiss}>
                Verstanden, nicht mehr anzeigen
            </Button>
        </Paper>
    );
};

export default WelcomeWidget;
