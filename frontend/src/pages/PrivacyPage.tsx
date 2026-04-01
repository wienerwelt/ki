// frontend/src/pages/PrivacyPage.tsx
import React from 'react';
import { Container, Paper, Button, Box } from '@mui/material';
import { PrivacyContent } from '../components/PrivacyContent';
import { useNavigate } from 'react-router-dom';

const PrivacyPage: React.FC = () => {
    const navigate = useNavigate();

    return (
        <Container maxWidth="md" sx={{ py: 5 }}>
            <Box sx={{ mb: 3 }}>
                <Button 
                    variant="text" 
                    onClick={() => navigate('/login')}
                    sx={{ textTransform: 'none', color: 'text.secondary' }}
                >
                    &larr; Zurück zum Login
                </Button>
            </Box>
            
            <Paper elevation={3} sx={{ p: { xs: 2, sm: 4 } }}>
                <PrivacyContent />
            </Paper>
        </Container>
    );
};

export default PrivacyPage;