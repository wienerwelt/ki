import React, { useState, useEffect } from 'react';
import {
    Box, Typography, CircularProgress, Alert, Divider,
    Button, Link as MuiLink, Chip, List, ListItem, ListItemText, Stack
} from '@mui/material';
import ArticleIcon from '@mui/icons-material/Article';
import GavelIcon from '@mui/icons-material/Gavel';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Link as RouterLink } from 'react-router-dom'; // Importiert

import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';
import apiClient from '../../apiClient';

// Typ-Definitionen für die neuen Datenstrukturen
interface MonitorField {
    name: string;
    label: string;
    type: 'text' | 'textarea' | 'date';
}

interface MonitorEntry {
    id: string;
    content_data: Record<string, any>; // z.B. { "title": "...", "status": "..." }
    created_at: string;
    source_document_url: string | null;
    template_name: string;
    fields_definition: MonitorField[];
}

interface MonitorWidgetProps extends BaseWidgetProps {
    icon?: React.ReactNode;
    title: string;
    widgetTypeKey: string;
}

// Hilfsfunktion, um ein Feld sicher aus den Daten zu holen und zu formatieren
const getFieldDisplay = (
    data: Record<string, any>, 
    field: MonitorField | undefined // Kann jetzt undefined sein
): string | null => {
    if (!field) return null; // Sicherstellen, dass das Feld existiert
    const value = data[field.name];
    if (!value) return null;

    if (field.type === 'date') {
        try {
            // Stelle sicher, dass das Datum gültig ist, bevor es formatiert wird
            const date = new Date(value);
            if (isNaN(date.getTime())) return value; // Fallback für ungültige Daten
            return format(date, 'dd. MMMM yyyy', { locale: de });
        } catch {
            return value; // Fallback
        }
    }
    return String(value);
};

// Hilfsfunktion, um ein bestimmtes Feld zu finden (z.B. den Titel)
const findField = (entry: MonitorEntry, fieldName: string) => {
    // Filtert 'null' oder 'undefined' aus fields_definition
    const validFields = entry.fields_definition?.filter(Boolean) || [];
    const data = entry.content_data[fieldName];
    const fieldDef = validFields.find(f => f.name === fieldName);
    return data ? getFieldDisplay(entry.content_data, fieldDef) : null;
};


const MonitorWidget: React.FC<MonitorWidgetProps> = ({
  onDelete, widgetId, isRemovable, icon, title, widgetTypeKey
}) => {
    const [entries, setEntries] = useState<MonitorEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchEntries = async () => {
            setLoading(true);
            try {
                // Diese Route muss t.fields_definition zurückgeben!
                const response = await apiClient.get('/api/data/monitor-entries', {
                    params: { limit: 3 } // Zeige die 3 neuesten
                });
                setEntries(response.data || []);
            } catch (err: any) {
                setError(err.response?.data?.message || "Monitor-Einträge konnten nicht geladen werden.");
            } finally {
                setLoading(false);
            }
        };
        fetchEntries();
    }, []);

    // KORREKTUR: renderEntry komplett neugestaltet nach FundingWidget-Vorbild
    const renderEntry = (entry: MonitorEntry) => {
        const entryTitle = findField(entry, 'title') || '(Kein Titel)';
        const entryStatus = findField(entry, 'status');
        const entryDeadline = findField(entry, 'deadline');
        const entrySummary = findField(entry, 'summary');
        
        return (
            <ListItem key={entry.id} divider sx={{ alignItems: 'flex-start' }}>
                <ListItemText
                    primary={
                        <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                            {entryTitle}
                        </Typography>
                    }
                    secondaryTypographyProps={{ component: 'div' }}
                    secondary={
                        <Stack sx={{ mt: 0.5 }} spacing={1.5}>
                            {/* Chips für Status und Frist */}
                            {(entryStatus || entryDeadline) && (
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                    {entryStatus && (
                                        <Chip 
                                            label={entryStatus} 
                                            color="primary" 
                                            size="small" 
                                        />
                                    )}
                                    {entryDeadline && (
                                        <Chip 
                                            label={`Frist: ${entryDeadline}`} 
                                            variant="outlined" 
                                            size="small" 
                                        />
                                    )}
                                </Box>
                            )}
                            
                            {/* Zusammenfassung (gekürzt auf 2 Zeilen) */}
                            {entrySummary && (
                                <Typography 
                                    variant="body2" 
                                    color="text.secondary"
                                    sx={{
                                        whiteSpace: 'normal',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                    }}
                                >
                                    {entrySummary}
                                </Typography>
                            )}
                            {entry.source_document_url && (
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={<ArticleIcon />}
                                    // KORREKTUR: Der fehlerhafte 'apiClient.defaults.baseURL' 
                                    // wird durch einen relativen Link ersetzt.
                                    href={`/api/admin/legal-monitor/entries/${entry.id}/download`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    sx={{ alignSelf: 'flex-start' }}
                                >
                                    Original-Quelle ansehen
                                </Button>
                            )}
                        </Stack>
                    }
                />
            </ListItem>
        );
    };

    return (
        <WidgetPaper
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {icon || <GavelIcon />}
                    <Typography variant="h6">{title}</Typography>
                </Box>
            }
            widgetId={widgetId}
            widgetTitle={title}
            widgetTypeKey={widgetTypeKey}
            onDelete={onDelete}
            isRemovable={isRemovable}
            noPadding // KORREKTUR: noPadding hinzugefügt
        >
            {loading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                    <CircularProgress />
                </Box>
            )}
            {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}
            
            {!loading && !error && (
                entries.length > 0 ? (
                    // KORREKTUR: Box und List hinzugefügt
                    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <List dense sx={{ p: 0, flexGrow: 1 }}>
                            {entries.map(renderEntry)}
                        </List>
                        {/* "Alle anzeigen" Button am Ende */}
                        <Box sx={{ p: 1, textAlign: 'center', borderTop: '1px solid', borderColor: 'divider' }}>
                            <Button component={RouterLink} to="/admin/legal-monitor" size="small">
                                Alle Einträge verwalten
                            </Button>
                        </Box>
                    </Box>
                ) : (
                    <Typography color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                        Derzeit keine Einträge vorhanden.
                    </Typography>
                )
            )}
        </WidgetPaper>
    );
};

export default MonitorWidget;