import React from 'react';
import { Container } from '@mui/material';
import DashboardLayout from '../components/DashboardLayout';
import VignetteWidget from '../components/widgets/VignetteWidget';

const VignettesPage: React.FC = () => {
  return (
    <DashboardLayout>
      <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
        {/* Diese Übergabe ist korrekt, da BaseWidgetProps optionale Teile hat und die 
            benötigten `loading` und `error` Props für die Typ-Sicherheit übergeben werden. */}
        <VignetteWidget loading={false} error={null} />
      </Container>
    </DashboardLayout>
  );
};

export default VignettesPage;