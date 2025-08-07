// frontend/src/components/NewFeedbackDialog.tsx
import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
    Select, MenuItem, FormControl, InputLabel, Stack
} from '@mui/material';

interface NewFeedbackDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (feedback: { type: 'bug' | 'suggestion' | 'idea'; title: string; description: string; }) => void;
    loading: boolean;
}

const NewFeedbackDialog: React.FC<NewFeedbackDialogProps> = ({ open, onClose, onSubmit, loading }) => {
    const [type, setType] = useState<'bug' | 'suggestion' | 'idea'>('idea');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');

    const handleSubmit = () => {
        if (!title || !description) {
            alert('Bitte füllen Sie alle Felder aus.');
            return;
        }
        onSubmit({ type, title, description });
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>Neue Meldung erstellen</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <FormControl fullWidth>
                        <InputLabel id="feedback-type-label">Art der Meldung</InputLabel>
                        <Select
                            labelId="feedback-type-label"
                            value={type}
                            label="Art der Meldung"
                            onChange={(e) => setType(e.target.value as any)}
                        >
                            <MenuItem value="idea">🚀 Neue Idee</MenuItem>
                            <MenuItem value="suggestion">💡 Verbesserungsvorschlag</MenuItem>
                            <MenuItem value="bug">🐞 Fehler melden</MenuItem>
                        </Select>
                    </FormControl>
                    <TextField
                        autoFocus
                        label="Titel / Kurzbeschreibung"
                        fullWidth
                        variant="outlined"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                    <TextField
                        label="Beschreibung"
                        fullWidth
                        multiline
                        rows={6}
                        variant="outlined"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={loading}>Abbrechen</Button>
                <Button onClick={handleSubmit} variant="contained" disabled={loading}>
                    {loading ? 'Sende...' : 'Senden'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default NewFeedbackDialog;
