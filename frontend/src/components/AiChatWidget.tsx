// frontend/src/components/AiChatWidget.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  CircularProgress,
  Fab,
  IconButton,
  List,
  ListItem,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import { useAiChat } from './useAiChat';
import { AI_CONFIG } from './aiConfig';
import { useAuth } from '../context/AuthContext';

export const AiChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const { messages, sendMessage, loading } = useAiChat();
  const { user } = useAuth();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isDashboardWidgetMenuOpen, setIsDashboardWidgetMenuOpen] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    const handleWidgetMenuState = (event: Event) => {
      const customEvent = event as CustomEvent<{ open?: boolean }>;
      setIsDashboardWidgetMenuOpen(Boolean(customEvent.detail?.open));
    };

    window.addEventListener('dashboard-widget-menu-open-change', handleWidgetMenuState);
    setIsDashboardWidgetMenuOpen(document.body.classList.contains('dashboard-widget-menu-open'));

    return () => {
      window.removeEventListener('dashboard-widget-menu-open-change', handleWidgetMenuState);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('ai-chat-open', isOpen);

    window.dispatchEvent(
      new CustomEvent('ai-chat-open-change', {
        detail: { open: isOpen },
      })
    );

    return () => {
      document.body.classList.remove('ai-chat-open');
      window.dispatchEvent(
        new CustomEvent('ai-chat-open-change', {
          detail: { open: false },
        })
      );
    };
  }, [isOpen]);

  const handleSend = () => {
    if (!input.trim() || loading || user?.role === 'demo') return;
    sendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    handleSend();
  };

  return (
    <>
      <Fab
        color="primary"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? 'AI Chat schließen' : 'AI Chat öffnen'}
        sx={{
          position: 'fixed',
          bottom: { xs: 96, sm: 24 },
          right: { xs: 16, sm: 24 },
          zIndex: 1500,
          width: { xs: 58, sm: 56 },
          height: { xs: 58, sm: 56 },
          display: { xs: isOpen || isDashboardWidgetMenuOpen ? 'none' : 'inline-flex', sm: 'inline-flex' },
          boxShadow: 8,
        }}
      >
        {isOpen ? <CloseIcon /> : <Avatar src={AI_CONFIG.avatarUrl} sx={{ width: 46, height: 46 }} />}
      </Fab>

      {isOpen && (
        <Paper
          role="dialog"
          aria-label="AI Chat"
          sx={{
            position: 'fixed',
            zIndex: 1600,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: { xs: '0 -12px 36px rgba(15, 23, 42, 0.28)', sm: 10 },

            // Mobile: Bottom Sheet mit Randabstand, damit es nicht am Display klebt.
            left: { xs: 12, sm: 'auto' },
            right: { xs: 12, sm: 24 },
            bottom: { xs: 12, sm: 85 },
            width: { xs: 'auto', sm: 360 },
            height: { xs: 'min(64dvh, 520px)', sm: 500 },
            maxHeight: { xs: 'calc(100dvh - 112px)', sm: 500 },
            borderRadius: { xs: 3, sm: 3 },
          }}
        >
          <Box
            sx={{
              px: { xs: 1.5, sm: 2 },
              py: { xs: 1.25, sm: 2 },
              bgcolor: 'primary.main',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              flexShrink: 0,
              minHeight: { xs: 64, sm: 72 },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <Avatar
                src={AI_CONFIG.avatarUrl}
                sx={{ width: { xs: 38, sm: 40 }, height: { xs: 38, sm: 40 }, flexShrink: 0 }}
              />
              <Typography variant="subtitle1" fontWeight="bold" noWrap>
                Hallo, ich bin {AI_CONFIG.name}
              </Typography>
            </Box>

            <IconButton
              size="small"
              onClick={() => setIsOpen(false)}
              aria-label="AI Chat schließen"
              sx={{
                color: 'white',
                flexShrink: 0,
                bgcolor: 'rgba(255,255,255,0.14)',
                position: 'static !important',
                bottom: 'auto !important',
                right: 'auto !important',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.24)' },
              }}
            >
              <CloseIcon />
            </IconButton>
          </Box>

          <List
            sx={{
              flexGrow: 1,
              overflowY: 'auto',
              p: { xs: 1.25, sm: 2 },
              bgcolor: '#f9f9f9',
              overscrollBehavior: 'contain',
            }}
          >
            {messages.length === 0 && !loading && (
              <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', px: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Stelle mir eine Frage zu deinem Dashboard, deinen Widgets oder deinen Daten.
                </Typography>
              </Box>
            )}

            {messages.map((m, i) => (
              <ListItem
                key={i}
                sx={{
                  flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
                  gap: 1,
                  alignItems: 'flex-start',
                  px: 0,
                }}
              >
                <Box sx={{ textAlign: 'center', flexShrink: 0 }}>
                  <Avatar
                    src={m.role === 'user' ? user?.profile_image_url || '' : AI_CONFIG.avatarUrl}
                    sx={{ width: { xs: 32, sm: 40 }, height: { xs: 32, sm: 40 } }}
                  />
                  <Typography variant="caption" display="block">
                    {m.role === 'user' ? 'Ich' : AI_CONFIG.name}
                  </Typography>
                </Box>

                <Paper
                  sx={{
                    p: 1.5,
                    maxWidth: { xs: '78%', sm: '70%' },
                    bgcolor: m.role === 'user' ? 'primary.light' : 'white',
                    color: m.role === 'user' ? 'white' : 'text.primary',
                    overflowWrap: 'anywhere',
                  }}
                >
                  <Typography variant="body2">{m.content}</Typography>
                </Paper>
              </ListItem>
            ))}

            {loading && (
              <ListItem sx={{ justifyContent: 'center' }}>
                <CircularProgress size={20} />
              </ListItem>
            )}
            <div ref={bottomRef} />
          </List>

          <Box
            component="form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            sx={{
              p: { xs: 1, sm: 1 },
              borderTop: 1,
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              bgcolor: 'background.paper',
              flexShrink: 0,
            }}
          >
            <TextField
              fullWidth
              size="small"
              placeholder={user?.role === 'demo' ? 'Demo: Chat deaktiviert' : 'Frage...'}
              value={input}
              disabled={user?.role === 'demo'}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              InputProps={{
                sx: {
                  borderRadius: 2,
                  bgcolor: 'background.paper',
                },
              }}
            />
            <IconButton
              type="submit"
              color="primary"
              onClick={handleSend}
              disabled={user?.role === 'demo' || loading || !input.trim()}
              aria-label="Nachricht senden"
              sx={{
                flexShrink: 0,
                position: 'static !important',
                bottom: 'auto !important',
                right: 'auto !important',
              }}
            >
              <SendIcon />
            </IconButton>
          </Box>
        </Paper>
      )}
    </>
  );
};
