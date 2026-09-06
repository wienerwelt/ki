import React from 'react';
import { Badge, Box, Container, Paper, Tab, Tabs, Typography, useMediaQuery, useTheme } from '@mui/material';
import StorefrontIcon from '@mui/icons-material/Storefront';
import AppsIcon from '@mui/icons-material/Apps';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import { useSearchParams } from 'react-router-dom';
import apiClient from '../apiClient';
import InternalDirectoryPage from './InternalDirectoryPage';
import SoftwareCatalogWidget from '../components/widgets/SoftwareCatalogWidget';

type SolutionsArea = 'providers' | 'software';

const IndustrySolutionsPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [searchParams, setSearchParams] = useSearchParams();
  const [providerTotal, setProviderTotal] = React.useState<number | null>(null);
  const [softwareTotal, setSoftwareTotal] = React.useState<number | null>(null);
  const activeArea: SolutionsArea = searchParams.get('bereich') === 'software' ? 'software' : 'providers';
  const selectedProviderId = searchParams.get('anbieter');

  React.useEffect(() => {
    let isActive = true;

    void Promise.allSettled([
      apiClient.get('/api/directory/internal'),
      apiClient.get('/api/software'),
    ]).then(([providersResult, softwareResult]) => {
      if (!isActive) return;

      if (providersResult.status === 'fulfilled') {
        setProviderTotal(Array.isArray(providersResult.value.data) ? providersResult.value.data.length : 0);
      }
      if (softwareResult.status === 'fulfilled') {
        const entries = softwareResult.value.data?.data;
        setSoftwareTotal(Array.isArray(entries) ? entries.length : 0);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  const handleAreaChange = (_event: React.SyntheticEvent, value: SolutionsArea) => {
    const next = new URLSearchParams(searchParams);
    next.delete('anbieter');
    if (value === 'providers') next.delete('bereich');
    else next.set('bereich', value);
    setSearchParams(next, { replace: true });
  };

  const handleProviderOpen = (providerId: string) => {
    const next = new URLSearchParams(searchParams);
    next.delete('bereich');
    next.set('anbieter', providerId);
    setSearchParams(next, { replace: true });
  };

  const handleProviderClose = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('anbieter');
    setSearchParams(next, { replace: true });
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 3, mb: 5, px: isMobile ? 1 : 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography
          variant={isMobile ? 'h5' : 'h4'}
          sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 'bold' }}
        >
          <HubOutlinedIcon fontSize="large" color="primary" />
          Branchenlösungen
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
          Anbieter finden, Branchensoftware vergleichen und Erfahrungen aus der eigenen Community nutzen.
        </Typography>
      </Box>

      <Paper sx={{ mb: 3, borderRadius: 3, overflow: 'hidden', boxShadow: theme.shadows[2] }}>
        <Tabs
          value={activeArea}
          onChange={handleAreaChange}
          variant="fullWidth"
          indicatorColor="primary"
          textColor="primary"
          aria-label="Bereiche der Branchenlösungen"
          sx={{ '& .MuiTab-root': { py: 2, minHeight: 64, fontWeight: 900 } }}
        >
          <Tab
            icon={<Badge badgeContent={providerTotal ?? 0} color="primary" max={999} showZero invisible={providerTotal === null}><StorefrontIcon /></Badge>}
            iconPosition="start"
            label="Anbieter & Netzwerk"
            value="providers"
          />
          <Tab
            icon={<Badge badgeContent={softwareTotal ?? 0} color="primary" max={999} showZero invisible={softwareTotal === null}><AppsIcon /></Badge>}
            iconPosition="start"
            label="Software-Lexikon"
            value="software"
          />
        </Tabs>
      </Paper>

      {activeArea === 'providers' ? (
        <InternalDirectoryPage
          embedded
          initialProviderId={selectedProviderId}
          onProviderDetailClosed={handleProviderClose}
          onTotalChange={setProviderTotal}
        />
      ) : (
        <SoftwareCatalogWidget
          widgetId="industry-solutions-software"
          onDelete={() => undefined}
          isRemovable={false}
          title="Software-Lexikon"
          standalone
          onProviderOpen={handleProviderOpen}
          onTotalChange={setSoftwareTotal}
        />
      )}
    </Container>
  );
};

export default IndustrySolutionsPage;
