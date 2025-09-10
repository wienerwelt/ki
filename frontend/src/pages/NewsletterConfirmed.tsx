// frontend/src/pages/NewsletterConfirmed.tsx
import React from 'react';
import { useSearchParams, Link as RouterLink } from 'react-router-dom';
import { Container, Box, Typography, Button } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

const NewsletterConfirmed: React.FC = () => {
  const [params] = useSearchParams();
  const ok = params.get('ok') === '1';
  const reason = params.get('reason'); // invalid | expired | undefined

  let title = 'Newsletter-Anmeldung bestätigt';
  let subtitle = 'Vielen Dank! Deine Anmeldung zum Newsletter wurde erfolgreich bestätigt.';
  let Icon = CheckCircleOutlineIcon;

  if (!ok) {
    Icon = ErrorOutlineIcon;
    title = 'Bestätigung nicht möglich';
    subtitle = 'Der Bestätigungslink ist ungültig oder wurde bereits verwendet.';
    if (reason === 'expired') {
      Icon = AccessTimeIcon;
      title = 'Bestätigungslink abgelaufen';
      subtitle = 'Der Bestätigungslink ist abgelaufen. Fordere bitte einen neuen Link an.';
    }
  }

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 10, p: 4, borderRadius: 2, boxShadow: 3, textAlign: 'center', bgcolor: 'background.paper' }}>
        <Icon sx={{ fontSize: 56, mb: 2 }} />
        <Typography variant="h5" gutterBottom>{title}</Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          {subtitle}
        </Typography>
        <Button component={RouterLink} to="/login" variant="contained">
          Zum Login
        </Button>
      </Box>
    </Container>
  );
};

export default NewsletterConfirmed;
