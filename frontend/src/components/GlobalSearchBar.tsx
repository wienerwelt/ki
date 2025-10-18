// src/components/GlobalSearchBar.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TextField, InputAdornment, IconButton, Tooltip } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'; // NEU: KI-Icon
import { styled, alpha } from '@mui/material/styles';

const Search = styled('div')(({ theme }) => ({
  position: 'relative',
  borderRadius: theme.shape.borderRadius,
  backgroundColor: alpha(theme.palette.common.white, 0.15),
  '&:hover': {
    backgroundColor: alpha(theme.palette.common.white, 0.25),
  },
  marginLeft: 0,
  width: '100%',
  display: 'flex', // NEU: Für Icon am Ende
  [theme.breakpoints.up('sm')]: {
    marginLeft: theme.spacing(1),
    width: 'auto',
  },
}));

const StyledTextField = styled(TextField)(({ theme }) => ({
  width: '100%', // NEU: Nimmt flexiblen Platz ein
  '& .MuiInputBase-input': {
    color: 'inherit',
    padding: theme.spacing(1, 1, 1, 0),
    paddingLeft: `calc(1em + ${theme.spacing(4)})`,
    transition: theme.transitions.create('width'),
    [theme.breakpoints.up('sm')]: {
      width: '20ch',
      '&:focus': {
        width: '30ch',
      },
    },
  },
}));

const GlobalSearchBar: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  const handleSearch = () => {
    if (searchTerm.trim()) {
      navigate(`/search?term=${encodeURIComponent(searchTerm.trim())}`);
    }
  };

  // NEU: KI-Suchfunktion
  const handleAiSearch = () => {
    if (searchTerm.trim()) {
      navigate(`/ask?question=${encodeURIComponent(searchTerm.trim())}`);
      setSearchTerm(''); // Optional: Feld leeren
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      // Standard-Enter löst normale Suche aus
      event.preventDefault();
      handleSearch();
    }
    // Optional: Strg+Enter für KI-Suche
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      handleAiSearch();
    }
  };

  return (
    <Search>
      <InputAdornment position="start" sx={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 1 }}>
        <SearchIcon sx={{ color: 'inherit' }} />
      </InputAdornment>
      <StyledTextField
        placeholder="Global Suchen..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onKeyDown={handleKeyDown} // Geändert
        variant="standard"
        InputProps={{
          disableUnderline: true,
        }}
      />
      {/* --- NEUER KI-BUTTON --- */}
      <Tooltip title="KI-Frage stellen (Ctrl+Enter)">
        <IconButton
          color="inherit"
          onClick={handleAiSearch}
          disabled={!searchTerm.trim()}
          sx={{ p: '10px' }}
        >
          <AutoAwesomeIcon />
        </IconButton>
      </Tooltip>
      {/* --- ENDE --- */}
    </Search>
  );
};

export default GlobalSearchBar;