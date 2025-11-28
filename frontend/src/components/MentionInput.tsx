import React, { useState, useEffect, useRef } from 'react';
import {
    TextField, Box, List, ListItemButton, ListItemAvatar,
    Avatar, ListItemText, Paper, ClickAwayListener, Typography
} from '@mui/material';
import apiClient from '../apiClient';

interface UserSuggestion {
    id: string;
    username: string;
    first_name: string;
    last_name: string;
    profile_image_url: string | null;
}

interface MentionInputProps {
    value: string;
    onChange: (newValue: string) => void;
    placeholder?: string;
    disabled?: boolean;
    onKeyDown?: (e: React.KeyboardEvent) => void;
}

const MentionInput: React.FC<MentionInputProps> = ({ value, onChange, placeholder, disabled, onKeyDown }) => {
    const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [cursorPosition, setCursorPosition] = useState<number | null>(null);
    const [query, setQuery] = useState('');
    
    const inputRef = useRef<HTMLInputElement>(null);

    // Überwacht die Eingabe auf "@"
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        const newCursorPos = e.target.selectionStart || 0;
        
        onChange(newValue);
        
        // Wort vor dem Cursor analysieren
        const textBeforeCursor = newValue.slice(0, newCursorPos);
        const words = textBeforeCursor.split(/\s/); // Split bei Leerzeichen
        const currentWord = words[words.length - 1];

        if (currentWord.startsWith('@')) {
            const searchTerm = currentWord.slice(1); // Text nach dem @
            setQuery(searchTerm);
            setCursorPosition(newCursorPos);
            // Nur suchen wenn mind 1 Zeichen da ist
            if (searchTerm.length > 0) {
                setShowSuggestions(true);
            } else {
                setShowSuggestions(false);
            }
        } else {
            setShowSuggestions(false);
        }
    };

    // API Suche
    useEffect(() => {
        if (showSuggestions && query) {
            const timeoutId = setTimeout(async () => {
                try {
                    const res = await apiClient.get(`/api/users/search?q=${encodeURIComponent(query)}`);
                    setSuggestions(res.data);
                } catch (e) {
                    console.error(e);
                }
            }, 300); // Debounce
            return () => clearTimeout(timeoutId);
        } else {
            setSuggestions([]);
        }
    }, [query, showSuggestions]);

    const handleSelectUser = (user: UserSuggestion) => {
        if (!inputRef.current) return;

        const text = value;
        // Cursor Position nutzen um das richtige @ zu finden
        // Wir suchen rückwärts vom Cursor nach dem letzten @
        const textBefore = text.slice(0, cursorPosition || 0);
        const textAfter = text.slice(cursorPosition || 0);
        
        const lastAtPos = textBefore.lastIndexOf('@');
        
        // Das neue Textstück: Alles vor dem @ + @username + Leerzeichen + Rest
        const newText = textBefore.slice(0, lastAtPos) + `@${user.username} ` + textAfter;
        
        onChange(newText);
        setShowSuggestions(false);
        
        // Fokus zurück ins Feld setzen
        setTimeout(() => {
            if(inputRef.current) inputRef.current.focus();
        }, 50);
    };

    return (
        <Box sx={{ position: 'relative' }}>
            <TextField
                fullWidth
                multiline
                minRows={2}
                maxRows={6} // Wächst automatisch mit
                placeholder={placeholder}
                variant="outlined"
                value={value}
                onChange={handleChange}
                onKeyDown={onKeyDown} // Wichtig für Enter-to-send (außerhalb)
                disabled={disabled}
                inputRef={inputRef}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            {showSuggestions && suggestions.length > 0 && (
                <ClickAwayListener onClickAway={() => setShowSuggestions(false)}>
                    <Paper
                        elevation={3}
                        sx={{
                            position: 'absolute',
                            bottom: '100%', // Über dem Input anzeigen
                            left: 0,
                            right: 0,
                            zIndex: 10,
                            maxHeight: 200,
                            overflowY: 'auto',
                            mb: 1,
                            borderRadius: 2
                        }}
                    >
                        <List dense>
                            {suggestions.map((user) => (
                                <ListItemButton key={user.id} onClick={() => handleSelectUser(user)}>
                                    <ListItemAvatar>
                                        <Avatar 
                                            src={user.profile_image_url || undefined} 
                                            sx={{ width: 24, height: 24 }}
                                        >
                                            {user.first_name?.charAt(0)}
                                        </Avatar>
                                    </ListItemAvatar>
                                    <ListItemText
                                        primary={`${user.first_name} ${user.last_name}`}
                                        secondary={
                                            <Typography variant="caption" color="primary">
                                                @{user.username}
                                            </Typography>
                                        }
                                    />
                                </ListItemButton>
                            ))}
                        </List>
                    </Paper>
                </ClickAwayListener>
            )}
        </Box>
    );
};

export default MentionInput;