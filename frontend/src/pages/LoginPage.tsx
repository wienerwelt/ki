import React from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Link,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import RadarIcon from '@mui/icons-material/Radar';
import LoginForm from '../components/LoginForm';

const LoginPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const radarRequested = searchParams.get('next') === '/radar';
  const partnerCode = searchParams.get('partner') || '';

  return (
    <Box
      component="main"
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        py: { xs: 3, sm: 6 },
        background: (theme) => `radial-gradient(circle at 12% 8%, ${theme.palette.primary.main}20, transparent 34%), ${theme.palette.background.default}`,
      }}
    >
      <Container maxWidth="sm">
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2.5 }}>
            <Box component="img" src="/favicon.svg" alt="Mobiliti" sx={{ width: 42, height: 42 }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 950, lineHeight: 1.1 }}>Mobiliti AI</Typography>
              <Typography variant="caption" color="text.secondary">
                {radarRequested ? 'Anmeldung zum Account-Radar' : 'Anmeldung zum geschützten Arbeitsbereich'}
              </Typography>
            </Box>
          </Stack>

          {radarRequested && (
            <Box sx={{ mb: 2.5, p: 1.5, borderRadius: 2.5, bgcolor: 'action.hover' }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <RadarIcon color="primary" />
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>Account-Radar</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Nach dem Login werden Rolle, Mandantenmodule und Ihr bevorzugter Arbeitsbereich geprüft.
                  </Typography>
                </Box>
              </Stack>
            </Box>
          )}

          <LoginForm partnerCodeOverride={partnerCode} />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="center" alignItems="center" sx={{ mt: 2 }}>
            <Link component={RouterLink} to="/account-radar" underline="hover">Account-Radar kennenlernen</Link>
            <Typography color="text.disabled" sx={{ display: { xs: 'none', sm: 'block' } }}>·</Typography>
            <Button component="a" href="https://www.mobiliti.at" size="small" sx={{ textTransform: 'none' }}>Zur Mobiliti Homepage</Button>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
};

export default LoginPage;
