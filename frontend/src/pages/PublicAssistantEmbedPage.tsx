import React from 'react';
import { Box } from '@mui/material';
import { useParams } from 'react-router-dom';
import PublicAiAssistantWidget from '../components/PublicAiAssistantWidget';

const PublicAssistantEmbedPage: React.FC = () => {
  const { siteKey = '' } = useParams();
  return (
    <Box sx={{ width: '100%', height: '100dvh', overflow: 'hidden', bgcolor: 'transparent' }}>
      <PublicAiAssistantWidget siteKey={siteKey} embedded initialOpen />
    </Box>
  );
};

export default PublicAssistantEmbedPage;
