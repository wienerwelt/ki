// frontend/src/pages/DisclaimerPage.tsx
import React from 'react';
import { Container, Paper, Button, Box } from '@mui/material';
import { DisclaimerContent } from '../components/DisclaimerContent';
import { useNavigate } from 'react-router-dom';

const DisclaimerPage: React.FC = () => {
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
                <DisclaimerContent />
            </Paper>
        </Container>
    );
};

export default DisclaimerPage;