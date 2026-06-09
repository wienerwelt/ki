import React, { lazy, Suspense } from 'react';
import { Container, Paper, Button, Box, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';

const DisclaimerContent = lazy(() =>
  import('../components/DisclaimerContent').then((module) => ({
    default: module.DisclaimerContent,
  }))
);

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
        <Suspense
          fallback={
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={28} />
            </Box>
          }
        >
          <DisclaimerContent />
        </Suspense>
      </Paper>
    </Container>
  );
};

export default DisclaimerPage;