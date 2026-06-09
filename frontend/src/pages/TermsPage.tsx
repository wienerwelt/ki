import React, { lazy, Suspense } from 'react';
import { Container, Paper, Button, Box, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';

const TermsContent = lazy(() =>
  import('../components/TermsContent').then((module) => ({
    default: module.TermsContent,
  }))
);

const TermsPage: React.FC = () => {
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
          <TermsContent />
        </Suspense>
      </Paper>
    </Container>
  );
};

export default TermsPage;