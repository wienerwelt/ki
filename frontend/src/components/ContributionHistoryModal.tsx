// frontend/src/components/ContributionHistoryModal.tsx
import React, { useState, useEffect } from 'react';
import {
    Box, Typography, CircularProgress, Alert, Dialog, DialogTitle, DialogContent,
    List, ListItem, ListItemText, ListItemIcon, Divider, DialogActions, Button
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import apiClient from '../apiClient';

interface HistoryEntry {
    id: string;
    points_change: number;
    description: string;
    created_at: string;
}

interface ContributionHistoryModalProps {
    open: boolean;
    onClose: () => void;
    currentUserScore: number;
}

const ContributionHistoryModal: React.FC<ContributionHistoryModalProps> = ({ open, onClose, currentUserScore }) => {
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            const fetchHistory = async () => {
                setLoading(true);
                setError(null);
                try {
                    const { data } = await apiClient.get('/api/users/contribution-history');
                    setHistory(data);
                } catch (err) {
                    setError('Verlauf konnte nicht geladen werden.');
                } finally {
                    setLoading(false);
                }
            };
            fetchHistory();
        }
    }, [open]);

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6">Mein Aktivitätsverlauf</Typography>
                <Box sx={{ textAlign: 'center', p: 1, backgroundColor: 'action.hover', borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Aktueller Stand</Typography>
                    <Typography variant="h5" component="span" color="primary" sx={{ fontWeight: 'bold' }}>
                        {currentUserScore}
                    </Typography>
                     <Typography component="span" color="text.secondary" sx={{ ml: 0.5 }}>Pkt.</Typography>
                </Box>
            </DialogTitle>
            <DialogContent dividers>
                
                {/* Info-Box zur Erklärung der Punkte */}
                <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                        Wie funktionieren Community-Punkte?
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                        <strong>Punkte sammeln:</strong> Sie erhalten Punkte durch aktive Teilnahme im Netzwerk, wie z. B. durch Abstimmungen bei Events, das Beantworten von Umfragen oder das Verfassen von Beiträgen in der Community.
                    </Typography>
                    <Typography variant="body2">
                        <strong>Punkte einlösen:</strong> Ihre gesammelten Punkte werden automatisch verwendet, wenn Sie exklusive KI-Funktionen nutzen, beispielsweise um sich Newsletter-Texte oder E-Mail-Entwürfe von der KI formulieren zu lassen.
                    </Typography>
                </Alert>

                {loading && <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>}
                {error && <Alert severity="error">{error}</Alert>}
                {!loading && !error && (
                    <List sx={{ p: 0 }}>
                        {history.map((entry, index) => (
                            <React.Fragment key={entry.id}>
                                <ListItem sx={{ py: 1.5 }}>
                                    <ListItemIcon sx={{ minWidth: 40 }}>
                                        {entry.points_change > 0 
                                            ? <ArrowUpwardIcon color="success" /> 
                                            : <ArrowDownwardIcon color="error" />}
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={entry.description}
                                        secondary={format(new Date(entry.created_at), 'dd.MM.yyyy, HH:mm', { locale: de }) + ' Uhr'}
                                        primaryTypographyProps={{ 
                                            style: { 
                                                whiteSpace: 'nowrap', 
                                                overflow: 'hidden', 
                                                textOverflow: 'ellipsis' 
                                            } 
                                        }}
                                        sx={{ mr: 2 }}
                                    />
                                    <Typography 
                                        variant="body1" 
                                        fontWeight="bold"
                                        color={entry.points_change > 0 ? 'success.main' : 'error.main'}
                                        sx={{ whiteSpace: 'nowrap' }} 
                                    >
                                        {entry.points_change > 0 ? `+${entry.points_change}` : entry.points_change} Pkt.
                                    </Typography>
                                </ListItem>
                                {index < history.length - 1 && <Divider component="li" variant="inset" />}
                            </React.Fragment>
                        ))}
                        {history.length === 0 && (
                            <Typography variant="body2" color="text.secondary" textAlign="center" py={2}>
                                Sie haben bisher noch keine Punkte gesammelt oder ausgegeben.
                            </Typography>
                        )}
                    </List>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Schließen</Button>
            </DialogActions>
        </Dialog>
    );
};

export default ContributionHistoryModal;