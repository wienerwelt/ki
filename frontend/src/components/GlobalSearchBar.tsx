import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Autocomplete, TextField, InputAdornment, IconButton, Tooltip, 
    Box, Typography, Chip, CircularProgress
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';

// Icons
import SearchIcon from '@mui/icons-material/Search';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ClearIcon from '@mui/icons-material/Clear';
import ArticleIcon from '@mui/icons-material/Article';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import BusinessIcon from '@mui/icons-material/Business';
import FolderIcon from '@mui/icons-material/Folder';
import ForumIcon from '@mui/icons-material/Forum';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import apiClient from '../apiClient';

interface SearchResult {
    id: string;
    title: string;
    summary: string | null;
    type: 'scraped' | 'ai' | 'tracked_account_news' | 'file' | 'community_post';
    url: string | null;
    published_date: string;
}

const GlobalSearchBar: React.FC = () => {
    const navigate = useNavigate();
    const theme = useTheme();
    
    const [open, setOpen] = useState(false);
    const [options, setOptions] = useState<SearchResult[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    
    const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const trimmedInput = inputValue.trim();

        if (trimmedInput.length < 3) {
            setOptions([]);
            setLoading(false);
            return;
        }

        setLoading(true);

        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

        debounceTimeout.current = setTimeout(async () => {
            try {
                const response = await apiClient.get(`/api/data/search?term=${encodeURIComponent(trimmedInput)}`);
                if (response.data && Array.isArray(response.data)) {
                    setOptions(response.data);
                } else {
                    setOptions([]);
                }
            } catch (err) {
                console.error("Search error:", err);
                setOptions([]); 
            } finally {
                setLoading(false);
            }
        }, 400);

        return () => {
            if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        };
    }, [inputValue]);

    const handleAiSearch = () => {
        if (inputValue.trim()) {
            navigate(`/ask?question=${encodeURIComponent(inputValue.trim())}`);
            setOpen(false);
        }
    };

    const handleClear = () => {
        setInputValue('');
        setOptions([]);
        setOpen(false);
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            handleAiSearch();
        }
    };

    const handleOptionSelect = (_event: React.SyntheticEvent, value: SearchResult | string | null) => {
        if (!value) return;

        if (typeof value === 'string') {
            navigate(`/search?term=${encodeURIComponent(value)}`);
            return;
        }

        if (value.url) {
            if (value.url.startsWith('/')) {
                navigate(value.url);
            } else {
                window.open(value.url, '_blank', 'noopener,noreferrer');
            }
        }
        setOpen(false);
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'file': return <FolderIcon sx={{ color: 'info.main' }} />;
            case 'community_post': return <ForumIcon sx={{ color: 'warning.main' }} />;
            case 'ai': return <SmartToyIcon sx={{ color: 'secondary.main' }} />;
            case 'tracked_account_news': return <BusinessIcon sx={{ color: 'primary.main' }} />;
            default: return <ArticleIcon sx={{ color: 'text.secondary' }} />;
        }
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'file': return 'Datei';
            case 'community_post': return 'Community';
            case 'ai': return 'KI';
            case 'tracked_account_news': return 'News';
            default: return 'Web';
        }
    };

    return (
        <Autocomplete
            id="global-search-bar"
            freeSolo
            disableClearable // WICHTIG: Verhindert, dass MUI ein zweites, schwebendes X-Icon hinzufügt!
            open={open}
            onOpen={() => { if (inputValue.trim().length >= 3) setOpen(true); }}
            onClose={() => setOpen(false)}
            inputValue={inputValue}
            onInputChange={(_, newVal) => setInputValue(newVal)}
            onChange={handleOptionSelect}
            options={options}
            getOptionLabel={(option) => typeof option === 'string' ? option : option.title}
            loading={loading}
            filterOptions={(x) => x}
            noOptionsText={inputValue.trim().length < 3 ? "Tippen Sie mind. 3 Zeichen..." : "Keine Treffer gefunden"}
            sx={{ width: '100%' }} // Nimmt nun exakt die Breite ein, die das Layout vorgibt
            
            renderInput={(params) => (
                <TextField
                    {...params}
                    placeholder="Suchen..."
                    variant="standard"
                    onKeyDown={handleKeyDown}
                    InputProps={{
                        ...params.InputProps,
                        disableUnderline: true,
                        sx: {
                            color: 'inherit',
                            padding: theme.spacing(0.5, 1.5),
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            // Das Styling liegt nun direkt auf dem Input-Feld, was den Wrapper überflüssig macht
                            backgroundColor: alpha(theme.palette.common.white, 0.15),
                            borderRadius: 1,
                            '&:hover': {
                                backgroundColor: alpha(theme.palette.common.white, 0.25),
                            }
                        },
                        startAdornment: (
                            <InputAdornment position="start" sx={{ color: 'inherit', mr: 0 }}>
                                <SearchIcon />
                            </InputAdornment>
                        ),
                        endAdornment: (
                            <InputAdornment position="end" sx={{ ml: 0 }}> 
                                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 0.5 }}>
                                    
                                    {inputValue.length > 0 && (
                                        <Tooltip title="Suche leeren">
                                            <IconButton
                                                color="inherit"
                                                size="small"
                                                onClick={handleClear}
                                                sx={{ p: 0.5 }}
                                            >
                                                <ClearIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    )}
                                    
                                    {loading ? <CircularProgress color="inherit" size={16} sx={{ mx: 0.5 }} /> : null}
                                    
                                    <Tooltip title="KI-Frage stellen (Ctrl+Enter)">
                                        <span>
                                            <IconButton
                                                color="inherit"
                                                onClick={handleAiSearch}
                                                disabled={!inputValue.trim()}
                                                size="small"
                                                sx={{ 
                                                    p: 0.5,
                                                    bgcolor: inputValue.trim() ? alpha(theme.palette.common.white, 0.15) : 'transparent',
                                                    '&:hover': {
                                                        bgcolor: inputValue.trim() ? alpha(theme.palette.common.white, 0.25) : 'transparent',
                                                    }
                                                }}
                                            >
                                                <AutoAwesomeIcon fontSize="small" />
                                            </IconButton>
                                        </span>
                                    </Tooltip>

                                </Box>
                            </InputAdornment>
                        )
                    }}
                />
            )}
            
            renderOption={(props, option) => {
                if (typeof option === 'string') return null;
                const { key, ...otherProps } = props;

                return (
                    <li key={key} {...otherProps}>
                        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', py: 0.5 }}>
                            <Box sx={{ mr: 2, display: 'flex' }}>
                                {getIcon(option.type)}
                            </Box>
                            <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                                <Typography variant="body2" noWrap fontWeight="medium">
                                    {option.title}
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Chip 
                                        label={getTypeLabel(option.type)} 
                                        size="small" 
                                        variant="outlined" 
                                        sx={{ height: 16, fontSize: '0.6rem' }} 
                                    />
                                    <Typography variant="caption" color="text.secondary" noWrap>
                                        {new Date(option.published_date).toLocaleDateString()}
                                    </Typography>
                                </Box>
                            </Box>
                            {!option.url?.startsWith('/') && (
                                <OpenInNewIcon fontSize="small" sx={{ color: 'text.disabled', ml: 1 }} />
                            )}
                        </Box>
                    </li>
                );
            }}
        />
    );
};

export default GlobalSearchBar;